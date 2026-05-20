class CricketReplayApp {
  constructor() {
    this.storage  = new Storage();
    this.recorder = new Recorder();
    this.playback = null;
    this.relay    = new Relay();
    this.incidents = [];
    this.currentBlob = null;

    // Live pole — normalised (0-1) coords survive rotation
    this.livePoleMarker = null;   // { nx, ny }
    this.livePoleAngle  = 0;      // 0=vertical 90=horizontal
    this.livePoleState  = 'none'; // 'none'|'placing'|'adjusting'|'locked'

    this.liveZoom    = 1;
    this.isScrubbing = false;

    // App mode
    this._mode = null; // 'recorder' | 'umpire'

    // Umpire state
    this._umpireState   = 'connect'; // 'connect'|'waiting'|'ready'|'capturing'|'uploading'|'review'
    this._umpirePaired  = false;
    this.umpirePlayback = null;
    this._umpireScrub   = false;

    // Relay: pending upload resolver when recorder is uploading
    this._pendingUploadBlob = null;

    this._bindElements();
    this._bindEvents();
    this._init();
  }

  // ── Element refs ──────────────────────────────────────────────

  _bindElements() {
    this.screens = {
      mode:      document.getElementById('screen-mode'),
      record:    document.getElementById('screen-record'),
      playback:  document.getElementById('screen-playback'),
      incidents: document.getElementById('screen-incidents'),
      umpire:    document.getElementById('screen-umpire'),
    };

    // ── Mode select ──
    this.btnModeRecorder = document.getElementById('btn-mode-recorder');
    this.btnModeUmpire   = document.getElementById('btn-mode-umpire');

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

    // Relay row on recorder
    this.relayRow      = document.getElementById('relay-row');
    this.relayRoomCode = document.getElementById('relay-room-code');
    this.relayStatus   = document.getElementById('relay-status');

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
    this.speedBtns      = document.querySelectorAll('.speed-btn:not([data-target])');

    // Playback pole buttons
    this.btnSetPolePb   = document.getElementById('btn-set-pole-pb');
    this.btnRotatePole  = document.getElementById('btn-rotate-pole');
    this.btnLockPole    = document.getElementById('btn-lock-pole');
    this.btnAdjustPole  = document.getElementById('btn-adjust-pole');
    this.btnClearPole   = document.getElementById('btn-clear-pole');

    // ── Incidents ──
    this.btnBackFromList = document.getElementById('btn-back-from-list');
    this.incidentsList   = document.getElementById('incidents-list');

    // ── Umpire ──
    this.btnUmpireBack    = document.getElementById('btn-umpire-back');
    this.umpireConnDot    = document.getElementById('umpire-conn-dot');
    this.umpirePhConnect  = document.getElementById('umpire-ph-connect');
    this.umpirePhReady    = document.getElementById('umpire-ph-ready');
    this.umpirePhReview   = document.getElementById('umpire-ph-review');
    this.roomCodeInput    = document.getElementById('room-code-input');
    this.btnUmpireConnect = document.getElementById('btn-umpire-connect');
    this.umpireConnError  = document.getElementById('umpire-connect-error');
    this.umpirePairStatus = document.getElementById('umpire-pair-status');
    this.umpirePairIcon   = document.getElementById('umpire-pair-icon');
    this.umpirePairText   = document.getElementById('umpire-pair-text');
    this.btnUmpireCapture = document.getElementById('btn-umpire-capture');
    this.umpireFeedback   = document.getElementById('umpire-feedback');
    this.umpireProgressWrap  = document.getElementById('umpire-progress-wrap');
    this.umpireProgressFill  = document.getElementById('umpire-progress-fill');
    this.umpireProgressLabel = document.getElementById('umpire-progress-label');

    // Umpire playback elements
    this.umpireVideo         = document.getElementById('umpire-video');
    this.umpireCanvas        = document.getElementById('umpire-canvas');
    this.umpireTimeline      = document.getElementById('umpire-timeline');
    this.umpireCurrentTime   = document.getElementById('umpire-current-time');
    this.umpireTotalTime     = document.getElementById('umpire-total-time');
    this.btnUmpirePlayPause  = document.getElementById('btn-umpire-play-pause');
    this.btnUmpireStepBack   = document.getElementById('btn-umpire-step-back');
    this.btnUmpireStepFwd    = document.getElementById('btn-umpire-step-fwd');
    this.btnUmpireResetZoom  = document.getElementById('btn-umpire-reset-zoom');
    this.umpireSpeedBtns     = document.querySelectorAll('.speed-btn[data-target="umpire"]');
    this.btnUmpireSetPole    = document.getElementById('btn-umpire-set-pole');
    this.btnUmpireRotatePole = document.getElementById('btn-umpire-rotate-pole');
    this.btnUmpireLockPole   = document.getElementById('btn-umpire-lock-pole');
    this.btnUmpireAdjustPole = document.getElementById('btn-umpire-adjust-pole');
    this.btnUmpireClearPole  = document.getElementById('btn-umpire-clear-pole');
    this.incidentNameInput   = document.getElementById('incident-name-input');
    this.btnUmpireSave       = document.getElementById('btn-umpire-save');
    this.btnUmpireBackCapture = document.getElementById('btn-umpire-back-capture');
  }

  // ── Events ────────────────────────────────────────────────────

  _bindEvents() {
    // ── Mode select ──────────────────────────────────────────────
    this.btnModeRecorder.addEventListener('click', () => this._enterRecorderMode());
    this.btnModeUmpire.addEventListener('click',   () => this._enterUmpireMode());

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

    // Live overlay gestures
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

    new ResizeObserver(() => {
      this.liveOverlay.width  = this.liveOverlay.offsetWidth;
      this.liveOverlay.height = this.liveOverlay.offsetHeight;
      if (this.livePoleMarker) this._drawLivePole();
    }).observe(this.liveOverlay);

    // ── Playback ─────────────────────────────────────────────────
    this.btnBack.addEventListener('click', () => {
      this._showScreen(this._mode === 'umpire' ? 'umpire' : 'record');
    });
    this.btnExport.addEventListener('click',    () => this._shareBlob(this.currentBlob));
    this.btnPlayPause.addEventListener('click', () => this._togglePlayPause());
    this.btnStepBack.addEventListener('click',  () => this.playback?.stepBack());
    this.btnStepFwd.addEventListener('click',   () => this.playback?.stepForward());
    this.btnResetZoom.addEventListener('click', () => {
      this.playback?.resetZoom();
      this._updateZoomBadge(1);
    });

    this.btnSetPolePb.addEventListener('click', () => {
      this.playback?.startPlacing();
      this._updatePlaybackPoleButtons();
    });
    this.btnRotatePole.addEventListener('click', () => { this.playback?.rotatePole(); });
    this.btnLockPole.addEventListener('click',   () => { this.playback?.lockPole(); this._updatePlaybackPoleButtons(); });
    this.btnAdjustPole.addEventListener('click', () => { this.playback?.startAdjusting(); this._updatePlaybackPoleButtons(); });
    this.btnClearPole.addEventListener('click',  () => { this.playback?.clearPole(); this._updatePlaybackPoleButtons(); });

    this.playbackCanvas.addEventListener('click', (e) => {
      if (!this.playback || this.playback.poleState !== 'placing') return;
      const { x, y } = this.playback.eventToCanvas(e);
      this.playback.placePoleAt(x, y);
      this._updatePlaybackPoleButtons();
    });

    this.timeline.addEventListener('mousedown',  () => this.isScrubbing = true);
    this.timeline.addEventListener('touchstart', () => this.isScrubbing = true, { passive: true });
    this.timeline.addEventListener('change',     () => { this.isScrubbing = false; });
    this.timeline.addEventListener('input',      () => { this.playback?.seekTo(parseFloat(this.timeline.value)); });

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

    setInterval(() => { if (this.playback) this._updateZoomBadge(this.playback.zoom); }, 200);

    // ── Incidents ─────────────────────────────────────────────────
    this.btnBackFromList.addEventListener('click', () => this._showScreen('record'));

    // ── Umpire ───────────────────────────────────────────────────
    this.btnUmpireBack.addEventListener('click', () => {
      this.relay.disconnect();
      this._showScreen('mode');
    });

    this.btnUmpireConnect.addEventListener('click', () => this._umpireConnect());
    this.roomCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._umpireConnect();
    });

    this.btnUmpireCapture.addEventListener('click', () => {
      if (!this._umpirePaired) return;
      this.relay.send({ type: 'capture' });
      this._setUmpireFeedback('📡 Sent capture command…');
      this.btnUmpireCapture.disabled = true;
    });

    // Umpire playback transport
    this.btnUmpirePlayPause.addEventListener('click', () => this._umpireTogglePlayPause());
    this.btnUmpireStepBack.addEventListener('click',  () => this.umpirePlayback?.stepBack());
    this.btnUmpireStepFwd.addEventListener('click',   () => this.umpirePlayback?.stepForward());
    this.btnUmpireResetZoom.addEventListener('click', () => this.umpirePlayback?.resetZoom());

    this.umpireSpeedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.umpireSpeedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.umpirePlayback?.setSpeed(parseFloat(btn.dataset.speed));
      });
    });

    this.umpireTimeline.addEventListener('mousedown',  () => this._umpireScrub = true);
    this.umpireTimeline.addEventListener('touchstart', () => this._umpireScrub = true, { passive: true });
    this.umpireTimeline.addEventListener('change',     () => { this._umpireScrub = false; });
    this.umpireTimeline.addEventListener('input', () => {
      this.umpirePlayback?.seekTo(parseFloat(this.umpireTimeline.value));
    });

    this.umpireVideo.addEventListener('timeupdate', () => {
      if (!this.umpirePlayback || this._umpireScrub) return;
      this.umpireCurrentTime.textContent = this._formatTime(this.umpirePlayback.currentTime);
      this.umpireTimeline.value = this.umpirePlayback.currentTime;
    });
    this.umpireVideo.addEventListener('loadedmetadata', () => {
      const dur = this.umpirePlayback?.duration || 0;
      this.umpireTotalTime.textContent  = this._formatTime(dur);
      this.umpireTimeline.max   = dur;
      this.umpireTimeline.value = 0;
    });
    this.umpireVideo.addEventListener('ended', () => { this.btnUmpirePlayPause.textContent = '▶ Play'; });

    // Umpire canvas click to place pole
    this.umpireCanvas.addEventListener('click', (e) => {
      if (!this.umpirePlayback || this.umpirePlayback.poleState !== 'placing') return;
      const { x, y } = this.umpirePlayback.eventToCanvas(e);
      this.umpirePlayback.placePoleAt(x, y);
      this._updateUmpirePoleButtons();
    });

    // Umpire pole buttons
    this.btnUmpireSetPole.addEventListener('click', () => {
      this.umpirePlayback?.startPlacing();
      this._updateUmpirePoleButtons();
    });
    this.btnUmpireRotatePole.addEventListener('click', () => { this.umpirePlayback?.rotatePole(); });
    this.btnUmpireLockPole.addEventListener('click',   () => { this.umpirePlayback?.lockPole(); this._updateUmpirePoleButtons(); });
    this.btnUmpireAdjustPole.addEventListener('click', () => { this.umpirePlayback?.startAdjusting(); this._updateUmpirePoleButtons(); });
    this.btnUmpireClearPole.addEventListener('click',  () => { this.umpirePlayback?.clearPole(); this._updateUmpirePoleButtons(); });

    this.btnUmpireSave.addEventListener('click', () => this._umpireSaveIncident());
    this.btnUmpireBackCapture.addEventListener('click', () => this._showUmpirePhase('ready'));

    // ── Relay message handler ─────────────────────────────────────
    this.relay.onMessage     = (msg) => this._onRelayMessage(msg);
    this.relay.onStateChange = (s)   => this._onRelayState(s);
  }

  async _init() {
    await this.storage.init();
    this.incidents = await this.storage.getAllIncidents();
    this.incidentCount.textContent = this.incidents.length;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ── Screen management ─────────────────────────────────────────

  _showScreen(name) {
    Object.values(this.screens).forEach(s => s.classList.remove('active'));
    this.screens[name].classList.add('active');
    if (name === 'incidents') this._renderList();
  }

  // ── Mode selection ────────────────────────────────────────────

  _enterRecorderMode() {
    this._mode = 'recorder';
    this._showScreen('record');
  }

  _enterUmpireMode() {
    this._mode = 'umpire';
    this._showUmpirePhase('connect');
    this._showScreen('umpire');
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
        // Start relay for remote capture
        this._startRelay();
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
      this.relay.disconnect();
      this.relayRow.style.display = 'none';
    }
  }

  _startRelay() {
    // 4-digit room code, shown on screen for umpire to enter
    const code = String(Math.floor(1000 + Math.random() * 9000));
    this.relayRoomCode.textContent = code;
    this.relayStatus.textContent   = '⏳ Waiting for umpire';
    this.relayStatus.className     = 'relay-status';
    this.relayRow.style.display    = '';
    this.relay.connect(code, 'recorder');
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

  // ── Relay (recorder side) ─────────────────────────────────────

  _onRelayState(state) {
    if (this._mode === 'recorder') {
      // Update relay status dot / text on recorder screen
      if (state === 'open') {
        // Don't show paired yet — wait for 'paired' message
      }
    }
    if (this._mode === 'umpire') {
      const dot = this.umpireConnDot;
      if (state === 'connecting') { dot.className = 'conn-dot connecting'; }
      else if (state === 'open')  { dot.className = 'conn-dot connecting'; } // waiting for join ack
      else                        { dot.className = 'conn-dot'; }
    }
  }

  _onRelayMessage(msg) {
    if (this._mode === 'recorder') {
      this._onRelayMessageRecorder(msg);
    } else if (this._mode === 'umpire') {
      this._onRelayMessageUmpire(msg);
    }
  }

  async _onRelayMessageRecorder(msg) {
    try {
    switch (msg.type) {
      case 'waiting':
        this.relayStatus.textContent = '⏳ Waiting for umpire';
        this.relayStatus.className   = 'relay-status';
        break;

      case 'paired':
        this.relayStatus.textContent = '✓ Umpire connected';
        this.relayStatus.className   = 'relay-status paired';
        break;

      case 'partner_disconnected':
        this.relayStatus.textContent = '⏳ Umpire disconnected';
        this.relayStatus.className   = 'relay-status';
        break;

      case 'capture':
        // Umpire triggered a capture — use last 30s for relay (smaller = faster transfer)
        await this._relayCapture();
        break;

      case 'upload_url': {
        // Lambda sent us a presigned PUT URL
        const { url, key } = msg;
        if (this._pendingUploadBlob) {
          await this._uploadToS3(url, key, this._pendingUploadBlob);
          this._pendingUploadBlob = null;
        }
        break;
      }
    }
    } catch (err) {
      // Surface any error to the umpire phone so it's visible
      console.error('[Recorder relay]', err);
      this.relay.send({ type: 'status', message: '⚠️ Recorder error: ' + err.message });
    }
  }

  async _relayCapture() {
    if (!this.recorder.isRecording) return;
    const blob = this.recorder.captureIncident(30000); // 30s for speed
    if (!blob) return;

    // Notify umpire that capture is happening
    this.relay.send({ type: 'status', message: 'Capturing…' });

    // Also save locally (90s) in parallel
    const fullBlob = this.recorder.captureIncident(90000);
    if (fullBlob) {
      const id = await this.storage.saveIncident({ blob: fullBlob, timestamp: Date.now() });
      this.incidents.push({ id, blob: fullBlob, timestamp: Date.now() });
      this.incidentCount.textContent = this.incidents.length;
    }

    // Request a presigned upload URL from Lambda
    this._pendingUploadBlob = blob;
    this.relay.send({ type: 'request_upload', contentType: blob.type });
  }

  _uploadToS3(url, key, blob) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          this.relay.send({ type: 'status', message: `Uploading… ${pct}%` });
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 204) {
          // Ping umpire so we know XHR completed and relay.send is reachable
          this.relay.send({ type: 'status', message: '✓ Upload done — fetching video…' });
          this.relay.send({ type: 'upload_complete', key });
          resolve();
        } else {
          // Log response body to help diagnose S3 signature errors
          const msg = `S3 upload failed: HTTP ${xhr.status} — ${xhr.responseText?.slice(0, 200)}`;
          console.error(msg);
          this.relay.send({ type: 'status', message: '⚠️ ' + msg });
          reject(new Error(msg));
        }
      };

      xhr.onerror = () => {
        const msg = 'S3 upload network error (CORS or connectivity)';
        console.error(msg);
        this.relay.send({ type: 'status', message: '⚠️ ' + msg });
        reject(new Error(msg));
      };

      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', blob.type);
      xhr.send(blob);
    });
  }

  // ── Relay (umpire side) ───────────────────────────────────────

  _umpireConnect() {
    const code = this.roomCodeInput.value.trim();
    if (code.length !== 4 || !/^\d{4}$/.test(code)) {
      this._showUmpireError('Enter a 4-digit room code');
      return;
    }
    this.umpireConnError.style.display = 'none';
    this.btnUmpireConnect.disabled = true;
    this.btnUmpireConnect.textContent = 'Connecting…';
    this.relay.connect(code, 'umpire');
    // Move to ready phase after a beat (WS connecting)
    setTimeout(() => this._showUmpirePhase('ready'), 500);
  }

  _onRelayMessageUmpire(msg) {
    switch (msg.type) {
      case 'waiting':
        this._setUmpirePairStatus(false, '⏳', 'Waiting for recorder phone…');
        this.btnUmpireCapture.disabled = true;
        break;

      case 'paired':
        this._setUmpirePairStatus(true, '✓', 'Recorder connected — Ready');
        this.umpireConnDot.className = 'conn-dot paired';
        this.btnUmpireCapture.disabled = false;
        this._umpirePaired = true;
        break;

      case 'partner_disconnected':
        this._setUmpirePairStatus(false, '⚡', 'Recorder disconnected');
        this.umpireConnDot.className = 'conn-dot';
        this.btnUmpireCapture.disabled = true;
        this._umpirePaired = false;
        break;

      case 'status':
        this._setUmpireFeedback(msg.message || '');
        // Show progress bar if uploading
        if (msg.message && msg.message.includes('%')) {
          const pct = parseInt(msg.message.match(/(\d+)%/)?.[1] || '0');
          this._setUmpireProgress(pct, msg.message);
        } else if (msg.message === 'Capturing…') {
          this._setUmpireFeedback('📹 Capturing 30s clip…');
        }
        break;

      case 'video_ready':
        // Download the video and load it into the umpire player
        this._setUmpireFeedback('⬇️ Downloading video…');
        this._umpireDownloadAndPlay(msg.url);
        break;
    }
  }

  async _umpireDownloadAndPlay(url) {
    try {
      this._setUmpireProgress(0, 'Downloading…');
      this.umpireProgressWrap.style.display = '';

      // Use XHR for download progress
      const blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.responseType = 'blob';
        xhr.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            this._setUmpireProgress(pct, `Downloading… ${pct}%`);
          }
        };
        xhr.onload  = () => xhr.status < 400 ? resolve(xhr.response) : reject(new Error('Download failed'));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.open('GET', url);
        xhr.send();
      });

      this.umpireProgressWrap.style.display = 'none';
      this.umpireFeedback.style.display = 'none';

      // Lazy-init umpire playback instance
      if (!this.umpirePlayback) {
        this.umpirePlayback = new Playback(this.umpireVideo, this.umpireCanvas);
      }

      await this.umpirePlayback.load(blob);
      this._updateUmpirePoleButtons();

      // Reset speed buttons
      this.umpireSpeedBtns.forEach(b => b.classList.remove('active'));
      this.umpireSpeedBtns[0].classList.add('active');
      this.btnUmpirePlayPause.textContent = '▶ Play';

      // Re-enable capture button for next incident
      this.btnUmpireCapture.disabled = false;

      this._showUmpirePhase('review');
    } catch (err) {
      this._setUmpireFeedback('⚠️ Download failed — ' + err.message);
      this.btnUmpireCapture.disabled = false;
    }
  }

  async _umpireSaveIncident() {
    if (!this.umpirePlayback) return;
    const blob = await this._blobFromVideoEl(this.umpireVideo);
    if (!blob) return;
    const name      = this.incidentNameInput.value.trim() || null;
    const timestamp = Date.now();
    try {
      const id = await this.storage.saveIncident({ blob, timestamp, name });
      this.incidents.push({ id, blob, timestamp, name });
      this.incidentCount.textContent = this.incidents.length;
      this.btnUmpireSave.textContent = '✓ Saved';
      setTimeout(() => { this.btnUmpireSave.textContent = 'Save'; }, 2000);
      this.incidentNameInput.value = '';
    } catch (err) { alert('Save failed: ' + err.message); }
  }

  // Re-read the blob from the umpire video element's object URL
  async _blobFromVideoEl(videoEl) {
    try {
      const res  = await fetch(videoEl.src);
      return await res.blob();
    } catch { return null; }
  }

  // ── Umpire UI helpers ─────────────────────────────────────────

  _showUmpirePhase(phase) {
    this.umpirePhConnect.style.display = phase === 'connect' ? '' : 'none';
    this.umpirePhReady.style.display   = phase === 'ready'   ? '' : 'none';
    this.umpirePhReview.style.display  = phase === 'review'  ? '' : 'none';

    if (phase === 'connect') {
      this.btnUmpireConnect.disabled = false;
      this.btnUmpireConnect.textContent = 'Connect';
    }
    if (phase === 'ready') {
      this.umpireProgressWrap.style.display = 'none';
      this.umpireFeedback.style.display     = 'none';
    }
  }

  _showUmpireError(msg) {
    this.umpireConnError.textContent    = msg;
    this.umpireConnError.style.display  = '';
    this.btnUmpireConnect.disabled      = false;
    this.btnUmpireConnect.textContent   = 'Connect';
  }

  _setUmpirePairStatus(paired, icon, text) {
    this._umpirePaired = paired;
    this.umpirePairIcon.textContent = icon;
    this.umpirePairText.textContent = text;
    this.umpirePairStatus.classList.toggle('paired', paired);
  }

  _setUmpireFeedback(msg) {
    this.umpireFeedback.textContent  = msg;
    this.umpireFeedback.style.display = msg ? '' : 'none';
  }

  _setUmpireProgress(pct, label) {
    this.umpireProgressWrap.style.display  = '';
    this.umpireProgressFill.style.width    = pct + '%';
    this.umpireProgressLabel.textContent   = label;
  }

  _umpireTogglePlayPause() {
    if (!this.umpirePlayback) return;
    if (this.umpirePlayback.isPaused) {
      this.umpirePlayback.play();
      this.btnUmpirePlayPause.textContent = '⏸ Pause';
    } else {
      this.umpirePlayback.pause();
      this.btnUmpirePlayPause.textContent = '▶ Play';
    }
  }

  // ── Umpire pole buttons ───────────────────────────────────────

  _updateUmpirePoleButtons() {
    const state = this.umpirePlayback?.poleState || 'none';
    this._show(this.btnUmpireSetPole,    state === 'none');
    this._show(this.btnUmpireRotatePole, state === 'adjusting' || state === 'locked');
    this._show(this.btnUmpireLockPole,   state === 'adjusting');
    this._show(this.btnUmpireAdjustPole, state === 'locked');
    this._show(this.btnUmpireClearPole,  state === 'adjusting' || state === 'locked');
    if (this.umpireCanvas) {
      this.umpireCanvas.style.cursor = state === 'placing' ? 'crosshair' : 'default';
    }
    if (state === 'placing') {
      this.btnUmpireSetPole.style.display = 'inline-flex';
      this.btnUmpireSetPole.textContent   = 'Tap video to place line';
      this.btnUmpireSetPole.className     = 'btn btn-danger';
    } else if (state === 'none') {
      this.btnUmpireSetPole.textContent = 'Set Pole Marker';
      this.btnUmpireSetPole.className   = 'btn btn-secondary';
    }
  }

  // ── Playback (recorder review) ────────────────────────────────

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

  // ── Playback pole buttons ─────────────────────────────────────

  _updatePlaybackPoleButtons() {
    const state = this.playback?.poleState || 'none';
    this._show(this.btnSetPolePb,  state === 'none');
    this._show(this.btnRotatePole, state === 'adjusting' || state === 'locked');
    this._show(this.btnLockPole,   state === 'adjusting');
    this._show(this.btnAdjustPole, state === 'locked');
    this._show(this.btnClearPole,  state === 'adjusting' || state === 'locked');
    if (this.playbackCanvas) {
      this.playbackCanvas.style.cursor = state === 'placing' ? 'crosshair' : 'default';
    }
    if (state === 'placing') {
      this.btnSetPolePb.style.display = 'inline-flex';
      this.btnSetPolePb.textContent   = 'Tap video to place line';
      this.btnSetPolePb.className     = 'btn btn-danger';
    } else if (state === 'none') {
      this.btnSetPolePb.textContent = 'Set Pole Marker';
      this.btnSetPolePb.className   = 'btn btn-secondary';
    }
  }

  // ── Live pole ─────────────────────────────────────────────────

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

  _overlayNorm(e) {
    const rect = this.liveOverlay.getBoundingClientRect();
    return { nx: (e.clientX - rect.left) / rect.width, ny: (e.clientY - rect.top) / rect.height };
  }

  _overlayNormTouch(touch) {
    const rect = this.liveOverlay.getBoundingClientRect();
    return { nx: (touch.clientX - rect.left) / rect.width, ny: (touch.clientY - rect.top) / rect.height };
  }

  _applyLiveDrag(nx, ny) {
    if (!this.livePoleMarker) return;
    if (this.livePoleAngle === 0) { this.livePoleMarker.nx = nx; }
    else                          { this.livePoleMarker.ny = ny; }
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
      const dt    = new Date(inc.timestamp);
      const label = inc.name || `${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}`;
      const sub   = inc.name ? `${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}` : 'Tap Review to analyse';
      card.innerHTML = `
        <div class="inc-info">
          <div class="inc-time">${label}</div>
          <div class="inc-sub">${sub}</div>
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
