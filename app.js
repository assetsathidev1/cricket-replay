class CricketReplayApp {
  constructor() {
    this.storage  = new Storage();
    this.recorder = new Recorder();
    this.playback = null;
    this.incidents = [];
    this.currentBlob = null;

    // Live pole — normalised (0-1) coords survive rotation
    this.livePoleMarker = null;   // { nx, ny }
    this.livePoleAngle  = 0;      // 0=vertical 90=horizontal
    this.livePoleState  = 'none'; // 'none'|'placing'|'adjusting'|'locked'

    this.liveZoom    = 1;
    this.isScrubbing = false;

    this._bindElements();
    this._bindEvents();
    this._init();
  }

  _bindElements() {
    this.screens = {
      record:    document.getElementById('screen-record'),
      playback:  document.getElementById('screen-playback'),
      incidents: document.getElementById('screen-incidents'),
    };

    // ── Record ──
    this.liveVideo      = document.getElementById('live-video');
    this.liveOverlay    = document.getElementById('live-overlay');
    this.cameraInner    = document.getElementById('camera-inner');
    this.btnStartStop   = document.getElementById('btn-start-stop');
    this.btnCapture     = document.getElementById('btn-capture');
    this.btnIncidents   = document.getElementById('btn-incidents');
    this.recDot         = document.getElementById('rec-dot');
    this.bufferStatus   = document.getElementById('buffer-status');
    this.fpsDisplay     = document.getElementById('fps-display');
    this.incidentCount  = document.getElementById('incident-count');
    this.liveZoomSlider = document.getElementById('live-zoom');
    this.liveZoomVal    = document.getElementById('live-zoom-val');

    // Live pole buttons
    this.btnSetPole       = document.getElementById('btn-set-pole');
    this.btnRotateLive    = document.getElementById('btn-rotate-live');
    this.btnLockLive      = document.getElementById('btn-lock-live');
    this.btnAdjustLive    = document.getElementById('btn-adjust-live');
    this.btnClearLivePole = document.getElementById('btn-clear-live-pole');

    // ── Playback ──
    this.playbackVideo  = document.getElementById('playback-video');
    this.playbackCanvas = document.getElementById('playback-canvas');
    this.zoomBadge      = document.getElementById('zoom-badge');
    this.btnBack        = document.getElementById('btn-back');
    this.btnExport      = document.getElementById('btn-export');
    this.btnPlayPause   = document.getElementById('btn-play-pause');
    this.btnStepBack    = document.getElementById('btn-step-back');
    this.btnStepFwd     = document.getElementById('btn-step-fwd');
    this.btnResetZoom   = document.getElementById('btn-reset-zoom');
    this.timeline       = document.getElementById('timeline');
    this.currentTimeEl  = document.getElementById('current-time');
    this.totalTimeEl    = document.getElementById('total-time');
    this.speedBtns      = document.querySelectorAll('.speed-btn');

    // Playback pole buttons
    this.btnSetPolePb   = document.getElementById('btn-set-pole-pb');
    this.btnRotatePole  = document.getElementById('btn-rotate-pole');
    this.btnLockPole    = document.getElementById('btn-lock-pole');
    this.btnAdjustPole  = document.getElementById('btn-adjust-pole');
    this.btnClearPole   = document.getElementById('btn-clear-pole');

    // ── Incidents ──
    this.btnBackFromList = document.getElementById('btn-back-from-list');
    this.incidentsList   = document.getElementById('incidents-list');
  }

  _bindEvents() {
    // ── Record ──────────────────────────────────────────────────
    this.btnStartStop.addEventListener('click', () => this._toggleRecording());
    this.btnCapture.addEventListener('click',   () => this._captureIncident());
    this.btnIncidents.addEventListener('click', () => this._showScreen('incidents'));

    this.liveZoomSlider.addEventListener('input', () => {
      this.liveZoom = parseFloat(this.liveZoomSlider.value);
      this.liveZoomVal.textContent = this.liveZoom.toFixed(1) + '×';
      this.cameraInner.style.transform = `scale(${this.liveZoom})`;
    });

    // Live pole buttons
    this.btnSetPole.addEventListener('click', () => {
      this.livePoleState = 'placing';
      this.liveOverlay.style.pointerEvents = 'auto';
      this._updateLivePoleButtons();
    });
    this.btnRotateLive.addEventListener('click', () => {
      this.livePoleAngle = this.livePoleAngle === 0 ? 90 : 0;
      this._drawLivePole();
    });
    this.btnLockLive.addEventListener('click', () => {
      this.livePoleState = 'locked';
      this.liveOverlay.style.pointerEvents = 'none';
      this._updateLivePoleButtons();
      this._drawLivePole();
    });
    this.btnAdjustLive.addEventListener('click', () => {
      this.livePoleState = 'adjusting';
      this.liveOverlay.style.pointerEvents = 'auto';
      this._updateLivePoleButtons();
      this._drawLivePole();
    });
    this.btnClearLivePole.addEventListener('click', () => {
      this.livePoleMarker = null;
      this.livePoleState  = 'none';
      this.livePoleAngle  = 0;
      this.liveOverlay.style.pointerEvents = 'none';
      this._updateLivePoleButtons();
      this._drawLivePole();
    });

    // Live overlay: click to place, touch to drag
    this.liveOverlay.addEventListener('click', (e) => {
      if (this.livePoleState !== 'placing') return;
      const { nx, ny } = this._overlayNorm(e);
      this.livePoleMarker = { nx, ny };
      this.livePoleState  = 'adjusting';
      this._updateLivePoleButtons();
      this._drawLivePole();
    });

    this.liveOverlay.addEventListener('touchstart', (e) => {
      if (this.livePoleState !== 'placing' && this.livePoleState !== 'adjusting') return;
      e.preventDefault();
      const { nx, ny } = this._overlayNormTouch(e.touches[0]);
      if (this.livePoleState === 'placing') {
        this.livePoleMarker = { nx, ny };
        this.livePoleState  = 'adjusting';
        this._updateLivePoleButtons();
      } else {
        this._applyLiveDrag(nx, ny);
      }
      this._drawLivePole();
    }, { passive: false });

    this.liveOverlay.addEventListener('touchmove', (e) => {
      if (this.livePoleState !== 'adjusting') return;
      e.preventDefault();
      const { nx, ny } = this._overlayNormTouch(e.touches[0]);
      this._applyLiveDrag(nx, ny);
      this._drawLivePole();
    }, { passive: false });

    // Live overlay resize — normalised coords survive rotation automatically
    new ResizeObserver(() => {
      this.liveOverlay.width  = this.liveOverlay.offsetWidth;
      this.liveOverlay.height = this.liveOverlay.offsetHeight;
      if (this.livePoleMarker) this._drawLivePole();
    }).observe(this.liveOverlay);

    // ── Playback ─────────────────────────────────────────────────
    this.btnBack.addEventListener('click',      () => this._showScreen('record'));
    this.btnExport.addEventListener('click',    () => this._shareBlob(this.currentBlob));
    this.btnPlayPause.addEventListener('click', () => this._togglePlayPause());
    this.btnStepBack.addEventListener('click',  () => this.playback?.stepBack());
    this.btnStepFwd.addEventListener('click',   () => this.playback?.stepForward());
    this.btnResetZoom.addEventListener('click', () => {
      this.playback?.resetZoom();
      this._updateZoomBadge(1);
    });

    // Playback pole buttons
    this.btnSetPolePb.addEventListener('click', () => {
      this.playback?.startPlacing();
      this._updatePlaybackPoleButtons();
    });
    this.btnRotatePole.addEventListener('click', () => {
      this.playback?.rotatePole();
      // no state change — just re-render
    });
    this.btnLockPole.addEventListener('click', () => {
      this.playback?.lockPole();
      this._updatePlaybackPoleButtons();
    });
    this.btnAdjustPole.addEventListener('click', () => {
      this.playback?.startAdjusting();
      this._updatePlaybackPoleButtons();
    });
    this.btnClearPole.addEventListener('click', () => {
      this.playback?.clearPole();
      this._updatePlaybackPoleButtons();
    });

    // Canvas click: only used to PLACE the pole (state=placing)
    this.playbackCanvas.addEventListener('click', (e) => {
      if (!this.playback || this.playback.poleState !== 'placing') return;
      const { x, y } = this.playback.eventToCanvas(e);
      this.playback.placePoleAt(x, y);
      this._updatePlaybackPoleButtons();
    });

    // Timeline
    this.timeline.addEventListener('mousedown',  () => this.isScrubbing = true);
    this.timeline.addEventListener('touchstart', () => this.isScrubbing = true, { passive: true });
    this.timeline.addEventListener('change',     () => { this.isScrubbing = false; });
    this.timeline.addEventListener('input', () => {
      this.playback?.seekTo(parseFloat(this.timeline.value));
    });

    // Speed
    this.speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.speedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.playback?.setSpeed(parseFloat(btn.dataset.speed));
      });
    });

    this.playbackVideo.addEventListener('timeupdate',     () => this._onTimeUpdate());
    this.playbackVideo.addEventListener('loadedmetadata', () => this._onVideoLoaded());
    this.playbackVideo.addEventListener('ended', () => { this.btnPlayPause.textContent = '▶ Play'; });

    // Zoom badge refresh
    setInterval(() => { if (this.playback) this._updateZoomBadge(this.playback.zoom); }, 200);

    // ── Incidents ─────────────────────────────────────────────────
    this.btnBackFromList.addEventListener('click', () => this._showScreen('record'));
  }

  async _init() {
    await this.storage.init();
    this.incidents = await this.storage.getAllIncidents();
    this.incidentCount.textContent = this.incidents.length;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  _showScreen(name) {
    Object.values(this.screens).forEach(s => s.classList.remove('active'));
    this.screens[name].classList.add('active');
    if (name === 'incidents') this._renderList();
  }

  // ── Recording ─────────────────────────────────────────────────

  async _toggleRecording() {
    if (!this.recorder.isRecording) {
      try {
        await this.recorder.start(this.liveVideo);
        this.btnStartStop.textContent = 'Stop Recording';
        this.btnStartStop.className   = 'btn btn-secondary';
        this.btnCapture.disabled      = false;
        this.btnSetPole.disabled      = false;
        this.recDot.classList.add('live');
        this._startBufferTimer();
      } catch (err) { alert('Camera error: ' + err.message); }
    } else {
      this.recorder.stop();
      this.btnStartStop.textContent = 'Start Recording';
      this.btnStartStop.className   = 'btn btn-primary';
      this.btnCapture.disabled = true;
      this.btnSetPole.disabled = true;
      this.recDot.classList.remove('live');
      this._stopBufferTimer();
      this.bufferStatus.textContent = 'Buffer: 0s';
      this.fpsDisplay.textContent   = '';
    }
  }

  _startBufferTimer() {
    this._bufferStart = Date.now();
    this._bufferInterval = setInterval(() => {
      const s = Math.min(Math.floor((Date.now() - this._bufferStart) / 1000), 90);
      this.bufferStatus.textContent = `Buffer: ${s}s`;
      const fps = this.recorder.getActualFps();
      if (fps) this.fpsDisplay.textContent = `${Math.round(fps)}fps`;
    }, 1000);
  }

  _stopBufferTimer() { clearInterval(this._bufferInterval); }

  async _captureIncident() {
    const blob = this.recorder.captureIncident(90000);
    if (!blob) { alert('Not enough footage yet — record for at least a few seconds first.'); return; }
    this.btnCapture.disabled = true;
    this.btnCapture.textContent = 'Saving…';
    try {
      const timestamp = Date.now();
      const id = await this.storage.saveIncident({ blob, timestamp });
      this.incidents.push({ id, blob, timestamp });
      this.incidentCount.textContent = this.incidents.length;
      this.currentBlob = blob;
      await this._openPlayback(blob);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      this.btnCapture.disabled = false;
      this.btnCapture.textContent = 'Capture Incident';
    }
  }

  // ── Playback ──────────────────────────────────────────────────

  async _openPlayback(blob) {
    this._showScreen('playback');
    if (!this.playback) this.playback = new Playback(this.playbackVideo, this.playbackCanvas);
    this.speedBtns.forEach(b => b.classList.remove('active'));
    this.speedBtns[0].classList.add('active');
    this.btnPlayPause.textContent = '▶ Play';
    this._updateZoomBadge(1);
    await this.playback.load(blob);
    this._updatePlaybackPoleButtons();
  }

  _togglePlayPause() {
    if (!this.playback) return;
    if (this.playback.isPaused) { this.playback.play();  this.btnPlayPause.textContent = '⏸ Pause'; }
    else                        { this.playback.pause(); this.btnPlayPause.textContent = '▶ Play'; }
  }

  _onVideoLoaded() {
    const dur = this.playback?.duration || 0;
    this.totalTimeEl.textContent = this._formatTime(dur);
    this.timeline.max = dur; this.timeline.value = 0;
    this.currentTimeEl.textContent = '0:00';
  }

  _onTimeUpdate() {
    if (!this.playback || this.isScrubbing) return;
    const t = this.playback.currentTime;
    this.currentTimeEl.textContent = this._formatTime(t);
    this.timeline.value = t;
  }

  _formatTime(s) {
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  _updateZoomBadge(z) {
    if (!z || z <= 1.05) { this.zoomBadge.style.display = 'none'; return; }
    this.zoomBadge.style.display  = 'block';
    this.zoomBadge.textContent    = z.toFixed(1) + '×';
  }

  // ── Playback pole button state machine ────────────────────────

  _updatePlaybackPoleButtons() {
    const state = this.playback?.poleState || 'none';
    // show/hide each button per state
    this._show(this.btnSetPolePb,  state === 'none');
    this._show(this.btnRotatePole, state === 'adjusting' || state === 'locked');
    this._show(this.btnLockPole,   state === 'adjusting');
    this._show(this.btnAdjustPole, state === 'locked');
    this._show(this.btnClearPole,  state === 'adjusting' || state === 'locked');

    // Canvas cursor hint
    if (this.playbackCanvas) {
      this.playbackCanvas.style.cursor = state === 'placing' ? 'crosshair' : 'default';
    }

    // Update set-pole button label for placing state
    if (state === 'placing') {
      this.btnSetPolePb.style.display = 'inline-flex';
      this.btnSetPolePb.textContent   = 'Tap video to place line';
      this.btnSetPolePb.className     = 'btn btn-danger';
    } else if (state === 'none') {
      this.btnSetPolePb.textContent = 'Set Pole Marker';
      this.btnSetPolePb.className   = 'btn btn-secondary';
    }
  }

  // ── Live pole state machine ───────────────────────────────────

  _updateLivePoleButtons() {
    const s = this.livePoleState;
    this._show(this.btnSetPole,       s === 'none' || s === 'placing');
    this._show(this.btnRotateLive,    s === 'adjusting' || s === 'locked');
    this._show(this.btnLockLive,      s === 'adjusting');
    this._show(this.btnAdjustLive,    s === 'locked');
    this._show(this.btnClearLivePole, s === 'adjusting' || s === 'locked');

    if (s === 'placing') {
      this.btnSetPole.textContent = 'Tap camera to place';
      this.btnSetPole.className   = 'btn btn-danger';
    } else {
      this.btnSetPole.textContent = 'Set Pole Marker';
      this.btnSetPole.className   = 'btn btn-secondary';
      if (!this.recorder.isRecording) this.btnSetPole.disabled = true;
    }
  }

  _show(el, visible) { el.style.display = visible ? '' : 'none'; }

  // ── Live pole drawing ─────────────────────────────────────────

  /** Normalised coords from a mouse event on the overlay */
  _overlayNorm(e) {
    const rect = this.liveOverlay.getBoundingClientRect();
    return { nx: (e.clientX - rect.left) / rect.width, ny: (e.clientY - rect.top) / rect.height };
  }

  /** Normalised coords from a Touch object */
  _overlayNormTouch(touch) {
    const rect = this.liveOverlay.getBoundingClientRect();
    return { nx: (touch.clientX - rect.left) / rect.width, ny: (touch.clientY - rect.top) / rect.height };
  }

  /** Apply drag — only moves the axis perpendicular to the current line orientation */
  _applyLiveDrag(nx, ny) {
    if (!this.livePoleMarker) return;
    if (this.livePoleAngle === 0) { this.livePoleMarker.nx = nx; }  // vertical: X only
    else                          { this.livePoleMarker.ny = ny; }  // horizontal: Y only
  }

  _drawLivePole() {
    const ctx = this.liveOverlay.getContext('2d');
    const W   = this.liveOverlay.width, H = this.liveOverlay.height;
    ctx.clearRect(0, 0, W, H);
    if (!this.livePoleMarker) return;

    const cx  = this.livePoleMarker.nx * W;
    const cy  = this.livePoleMarker.ny * H;
    const isAdjusting = this.livePoleState === 'adjusting';
    const color       = isAdjusting ? '#f59e0b' : '#ff2020';
    const angleRad    = this.livePoleAngle * Math.PI / 180;
    const dx = Math.sin(angleRad), dy = Math.cos(angleRad);
    const len = Math.max(W, H) * 2;

    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    if (isAdjusting) ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(cx - dx * len, cy - dy * len);
    ctx.lineTo(cx + dx * len, cy + dy * len);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = isAdjusting ? 'rgba(245,158,11,0.2)' : 'rgba(255,32,32,0.2)';
    ctx.fill();

    if (isAdjusting) {
      // Small drag arrows
      const arrowDx = Math.cos(angleRad), arrowDy = -Math.sin(angleRad);
      const arrowLen = 28;
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      this._drawOverlayArrow(ctx, cx, cy, cx - arrowDx * arrowLen, cy - arrowDy * arrowLen);
      this._drawOverlayArrow(ctx, cx, cy, cx + arrowDx * arrowLen, cy + arrowDy * arrowLen);
    }

    ctx.font = 'bold 13px system-ui, sans-serif'; ctx.fillStyle = color;
    const offX = Math.cos(angleRad) * 20 + Math.sin(angleRad) * 4;
    const offY = -Math.sin(angleRad) * 20 + Math.cos(angleRad) * 4;
    ctx.fillText(isAdjusting ? 'DRAG' : 'POLE', cx + offX + 4, cy + offY + 5);
    ctx.restore();
  }

  _drawOverlayArrow(ctx, fx, fy, tx, ty) {
    const headLen = 9;
    const angle   = Math.atan2(ty - fy, tx - fx);
    ctx.beginPath();
    ctx.moveTo(fx, fy); ctx.lineTo(tx, ty);
    ctx.lineTo(tx - headLen * Math.cos(angle - Math.PI/6), ty - headLen * Math.sin(angle - Math.PI/6));
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - headLen * Math.cos(angle + Math.PI/6), ty - headLen * Math.sin(angle + Math.PI/6));
    ctx.stroke();
  }

  // ── Share / export ────────────────────────────────────────────

  async _shareBlob(blob) {
    if (!blob) return;
    const ext  = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const name = `cricket-incident-${Date.now()}.${ext}`;
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Cricket Incident' }); return; }
      catch (err) { if (err.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ── Incidents list ─────────────────────────────────────────────

  _renderList() {
    this.incidentsList.innerHTML = '';
    if (this.incidents.length === 0) {
      this.incidentsList.innerHTML = '<p class="empty">No incidents yet.<br>Press "Capture Incident" while recording.</p>';
      return;
    }
    [...this.incidents].sort((a, b) => b.timestamp - a.timestamp).forEach(inc => {
      const card = document.createElement('div');
      card.className = 'incident-card';
      const dt = new Date(inc.timestamp);
      card.innerHTML = `
        <div class="inc-info">
          <div class="inc-time">${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}</div>
          <div class="inc-sub">Tap Review to analyse</div>
        </div>
        <div class="inc-actions">
          <button class="btn btn-sm btn-secondary" data-id="${inc.id}" data-action="review">Review</button>
          <button class="btn btn-sm btn-secondary" data-id="${inc.id}" data-action="share">Share</button>
          <button class="btn btn-sm btn-del"       data-id="${inc.id}" data-action="delete">✕</button>
        </div>`;
      card.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.dataset.id);
          if (btn.dataset.action === 'review') this._reviewIncident(id);
          if (btn.dataset.action === 'share')  this._shareIncident(id);
          if (btn.dataset.action === 'delete') this._deleteIncident(id);
        });
      });
      this.incidentsList.appendChild(card);
    });
  }

  async _reviewIncident(id) {
    const inc = this.incidents.find(i => i.id === id);
    if (!inc) return;
    this.currentBlob = inc.blob;
    await this._openPlayback(inc.blob);
  }

  _shareIncident(id) {
    const inc = this.incidents.find(i => i.id === id);
    if (inc) this._shareBlob(inc.blob);
  }

  async _deleteIncident(id) {
    if (!confirm('Delete this incident?')) return;
    await this.storage.deleteIncident(id);
    this.incidents = this.incidents.filter(i => i.id !== id);
    this.incidentCount.textContent = this.incidents.length;
    this._renderList();
  }
}

window.addEventListener('DOMContentLoaded', () => { window.app = new CricketReplayApp(); });
