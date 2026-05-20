class CricketReplayApp {
  constructor() {
    this.storage = new Storage();
    this.recorder = new Recorder();
    this.playback = null;
    this.incidents = [];
    this.currentBlob = null;

    // Live pole marker stored as NORMALISED coords (0–1) so rotation doesn't break it
    this.livePoleMarker = null;
    this.livePoleMode   = false;
    this.liveZoom       = 1;

    this.playbackPoleMode = false;
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

    // Record
    this.liveVideo     = document.getElementById('live-video');
    this.liveOverlay   = document.getElementById('live-overlay');
    this.cameraInner   = document.getElementById('camera-inner');
    this.btnStartStop  = document.getElementById('btn-start-stop');
    this.btnCapture    = document.getElementById('btn-capture');
    this.btnIncidents  = document.getElementById('btn-incidents');
    this.btnSetPole    = document.getElementById('btn-set-pole');
    this.recDot        = document.getElementById('rec-dot');
    this.bufferStatus  = document.getElementById('buffer-status');
    this.fpsDisplay    = document.getElementById('fps-display');
    this.incidentCount = document.getElementById('incident-count');
    this.liveZoomSlider= document.getElementById('live-zoom');
    this.liveZoomVal   = document.getElementById('live-zoom-val');

    // Playback
    this.playbackVideo  = document.getElementById('playback-video');
    this.playbackCanvas = document.getElementById('playback-canvas');
    this.zoomBadge      = document.getElementById('zoom-badge');
    this.btnBack        = document.getElementById('btn-back');
    this.btnExport      = document.getElementById('btn-export');
    this.btnPlayPause   = document.getElementById('btn-play-pause');
    this.btnStepBack    = document.getElementById('btn-step-back');
    this.btnStepFwd     = document.getElementById('btn-step-fwd');
    this.btnTogglePole  = document.getElementById('btn-toggle-pole');
    this.btnClearPole   = document.getElementById('btn-clear-pole');
    this.btnResetZoom   = document.getElementById('btn-reset-zoom');
    this.timeline       = document.getElementById('timeline');
    this.currentTimeEl  = document.getElementById('current-time');
    this.totalTimeEl    = document.getElementById('total-time');
    this.speedBtns      = document.querySelectorAll('.speed-btn');

    // Incidents
    this.btnBackFromList = document.getElementById('btn-back-from-list');
    this.incidentsList   = document.getElementById('incidents-list');
  }

  _bindEvents() {
    // ── Record screen ──────────────────────────────────────────
    this.btnStartStop.addEventListener('click', () => this._toggleRecording());
    this.btnCapture.addEventListener('click',   () => this._captureIncident());
    this.btnIncidents.addEventListener('click', () => this._showScreen('incidents'));
    this.btnSetPole.addEventListener('click',   () => this._toggleLivePoleMode());
    this.liveOverlay.addEventListener('click',  (e) => this._handleLiveClick(e));

    // Live zoom slider
    this.liveZoomSlider.addEventListener('input', () => {
      this.liveZoom = parseFloat(this.liveZoomSlider.value);
      this.liveZoomVal.textContent = this.liveZoom.toFixed(1) + '×';
      this.cameraInner.style.transform = `scale(${this.liveZoom})`;
      if (this.livePoleMarker) this._drawLivePole(); // redraw at same norm coords
    });

    // ── Playback screen ────────────────────────────────────────
    this.btnBack.addEventListener('click',      () => this._showScreen('record'));
    this.btnExport.addEventListener('click',    () => this._shareBlob(this.currentBlob));
    this.btnPlayPause.addEventListener('click', () => this._togglePlayPause());
    this.btnStepBack.addEventListener('click',  () => this.playback?.stepBack());
    this.btnStepFwd.addEventListener('click',   () => this.playback?.stepForward());
    this.btnTogglePole.addEventListener('click',() => this._togglePlaybackPoleMode());
    this.btnClearPole.addEventListener('click', () => {
      this.playback?.clearPoleMarker();
      this.playbackPoleMode = false;
      this._updatePoleBtn();
    });
    this.btnResetZoom.addEventListener('click', () => {
      this.playback?.resetZoom();
      this._updateZoomBadge(1);
    });

    this.playbackCanvas.addEventListener('click', (e) => this._handleCanvasClick(e));

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

    // Playback video events
    this.playbackVideo.addEventListener('timeupdate', () => this._onTimeUpdate());
    this.playbackVideo.addEventListener('loadedmetadata', () => this._onVideoLoaded());
    this.playbackVideo.addEventListener('ended', () => {
      this.btnPlayPause.textContent = '▶ Play';
    });

    // Zoom badge update (hook into playback touchmove via periodic check)
    setInterval(() => {
      if (this.playback) this._updateZoomBadge(this.playback.zoom);
    }, 200);

    // Incidents
    this.btnBackFromList.addEventListener('click', () => this._showScreen('record'));

    // Live overlay canvas resize — just redraw with same normalised coords
    new ResizeObserver(() => {
      this.liveOverlay.width  = this.liveOverlay.offsetWidth;
      this.liveOverlay.height = this.liveOverlay.offsetHeight;
      if (this.livePoleMarker) this._drawLivePole();
    }).observe(this.liveOverlay);
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
        this.btnCapture.disabled  = false;
        this.btnSetPole.disabled  = false;
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
    if (!blob) {
      alert('Not enough footage yet — record for at least a few seconds first.');
      return;
    }
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
    this.playbackPoleMode = false;
    this._updatePoleBtn();
    this.speedBtns.forEach(b => b.classList.remove('active'));
    this.speedBtns[0].classList.add('active');
    this.btnPlayPause.textContent = '▶ Play';
    this._updateZoomBadge(1);
    await this.playback.load(blob);
  }

  _togglePlayPause() {
    if (!this.playback) return;
    if (this.playback.isPaused) {
      this.playback.play();
      this.btnPlayPause.textContent = '⏸ Pause';
    } else {
      this.playback.pause();
      this.btnPlayPause.textContent = '▶ Play';
    }
  }

  _onVideoLoaded() {
    const dur = this.playback?.duration || 0;
    this.totalTimeEl.textContent = this._formatTime(dur);
    this.timeline.max   = dur;
    this.timeline.value = 0;
    this.currentTimeEl.textContent = '0:00';
  }

  _onTimeUpdate() {
    if (!this.playback || this.isScrubbing) return;
    const t = this.playback.currentTime;
    this.currentTimeEl.textContent = this._formatTime(t);
    this.timeline.value = t;
  }

  _formatTime(s) {
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  _updateZoomBadge(z) {
    if (!z || z <= 1.05) { this.zoomBadge.style.display = 'none'; return; }
    this.zoomBadge.style.display = 'block';
    this.zoomBadge.textContent = z.toFixed(1) + '×';
  }

  // ── Pole marker ───────────────────────────────────────────────

  // Live pole — stored as NORMALISED (0-1) so rotation is a non-issue
  _toggleLivePoleMode() {
    this.livePoleMode = !this.livePoleMode;
    this.btnSetPole.textContent = this.livePoleMode ? 'Tap camera to mark pole' : 'Set Pole Marker';
    this.btnSetPole.classList.toggle('btn-danger',    this.livePoleMode);
    this.btnSetPole.classList.toggle('btn-secondary', !this.livePoleMode);
    this.liveOverlay.style.pointerEvents = this.livePoleMode ? 'auto' : 'none';
  }

  _handleLiveClick(e) {
    if (!this.livePoleMode) return;
    const rect = this.liveOverlay.getBoundingClientRect();
    // Store normalised so rotation/resize doesn't break position
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top)  / rect.height;
    this.livePoleMarker = { nx, ny };
    this._drawLivePole();
    this.livePoleMode = false;
    this.btnSetPole.textContent = 'Set Pole Marker';
    this.btnSetPole.classList.remove('btn-danger');
    this.btnSetPole.classList.add('btn-secondary');
    this.liveOverlay.style.pointerEvents = 'none';
  }

  _drawLivePole() {
    const ctx = this.liveOverlay.getContext('2d');
    ctx.clearRect(0, 0, this.liveOverlay.width, this.liveOverlay.height);
    if (!this.livePoleMarker) return;

    // Convert normalised → current pixel coords
    const x = this.livePoleMarker.nx * this.liveOverlay.width;
    const y = this.livePoleMarker.ny * this.liveOverlay.height;

    ctx.save();
    ctx.strokeStyle = '#ff2020'; ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.liveOverlay.height); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff2020'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,32,32,0.25)'; ctx.fill();
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = '#ff2020'; ctx.fillText('POLE', x + 18, y + 5);
    ctx.restore();
  }

  // Playback pole
  _togglePlaybackPoleMode() {
    this.playbackPoleMode = !this.playbackPoleMode;
    this._updatePoleBtn();
    this.playbackCanvas.style.cursor = this.playbackPoleMode ? 'crosshair' : 'default';
  }

  _updatePoleBtn() {
    this.btnTogglePole.textContent = this.playbackPoleMode ? 'Tap video to mark pole' : 'Set Pole Marker';
    this.btnTogglePole.classList.toggle('btn-danger',    this.playbackPoleMode);
    this.btnTogglePole.classList.toggle('btn-secondary', !this.playbackPoleMode);
  }

  _handleCanvasClick(e) {
    if (!this.playbackPoleMode || !this.playback) return;
    const rect = this.playbackCanvas.getBoundingClientRect();
    // Convert screen click → canvas pixel coords (accounting for CSS scaling of canvas element)
    const canvasX = (e.clientX - rect.left) / rect.width  * this.playbackCanvas.width;
    const canvasY = (e.clientY - rect.top)  / rect.height * this.playbackCanvas.height;
    this.playback.setPoleMarkerFromCanvas(canvasX, canvasY);
    this.playbackPoleMode = false;
    this._updatePoleBtn();
    this.playbackCanvas.style.cursor = 'default';
  }

  // ── Incidents list ────────────────────────────────────────────

  _renderList() {
    this.incidentsList.innerHTML = '';
    if (this.incidents.length === 0) {
      this.incidentsList.innerHTML =
        '<p class="empty">No incidents yet.<br>Press "Capture Incident" while recording.</p>';
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

  async _shareBlob(blob) {
    if (!blob) return;
    const ext  = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const name = `cricket-incident-${Date.now()}.${ext}`;
    const file = new File([blob], name, { type: blob.type });

    // Use native share sheet if available (Android/iOS)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Cricket Incident' });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // user cancelled — don't fall through
      }
    }

    // Fallback: trigger download
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
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
