class Playback {
  constructor(videoEl, canvasEl) {
    this.video = videoEl;
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.fps = 30;
    this.poleMarker = null;   // stored in VIDEO pixel coords
    this._animFrame = null;
    this._blobUrl = null;
    this._srcRegion = null;   // current visible region of the video frame

    // Zoom / pan state
    this.zoom = 1;
    this.panX = 0;  // centre of visible region, in video pixels
    this.panY = 0;

    this._initGestures();
  }

  async load(blob) {
    if (this._blobUrl) URL.revokeObjectURL(this._blobUrl);
    this._stopRendering();
    this.poleMarker = null;
    this.zoom = 1;

    this._blobUrl = URL.createObjectURL(blob);
    this.video.src = this._blobUrl;

    await new Promise((resolve, reject) => {
      this.video.onloadedmetadata = resolve;
      this.video.onerror = reject;
    });

    this.canvas.width  = this.video.videoWidth  || 1280;
    this.canvas.height = this.video.videoHeight || 720;

    // Reset pan to centre
    this.panX = this.canvas.width  / 2;
    this.panY = this.canvas.height / 2;

    this.video.currentTime = 0;
    await new Promise(r => { this.video.onseeked = r; setTimeout(r, 300); });
    this._renderFrame();
  }

  // ─── Playback controls ────────────────────────────────────────

  play() { this.video.play(); this._startRendering(); }

  pause() { this.video.pause(); this._stopRendering(); this._renderFrame(); }

  stepForward() {
    this.video.pause(); this._stopRendering();
    this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + 1 / this.fps);
    this.video.onseeked = () => { this._renderFrame(); this.video.onseeked = null; };
  }

  stepBack() {
    this.video.pause(); this._stopRendering();
    this.video.currentTime = Math.max(0, this.video.currentTime - 1 / this.fps);
    this.video.onseeked = () => { this._renderFrame(); this.video.onseeked = null; };
  }

  setSpeed(rate) { this.video.playbackRate = rate; }
  setFps(fps)    { this.fps = fps; }

  seekTo(time) {
    this.video.currentTime = time;
    if (this.video.paused) {
      this.video.onseeked = () => { this._renderFrame(); this.video.onseeked = null; };
    }
  }

  // ─── Zoom / pan ───────────────────────────────────────────────

  setZoom(z) {
    this.zoom = Math.max(1, Math.min(6, z));
    if (this.zoom === 1) {
      this.panX = this.canvas.width  / 2;
      this.panY = this.canvas.height / 2;
    }
    if (this.video.paused) this._renderFrame();
  }

  resetZoom() { this.setZoom(1); }

  // ─── Pole marker ──────────────────────────────────────────────

  // canvasX/Y: position of click on the canvas element (accounting for CSS scaling)
  setPoleMarkerFromCanvas(canvasX, canvasY) {
    if (!this._srcRegion) {
      this.poleMarker = { x: canvasX, y: canvasY };
    } else {
      const { x: sx, y: sy, w: sw, h: sh } = this._srcRegion;
      this.poleMarker = {
        x: sx + (canvasX / this.canvas.width)  * sw,
        y: sy + (canvasY / this.canvas.height) * sh,
      };
    }
    if (this.video.paused) this._renderFrame();
  }

  clearPoleMarker() { this.poleMarker = null; if (this.video.paused) this._renderFrame(); }

  // ─── Rendering ───────────────────────────────────────────────

  _renderFrame() {
    if (this.video.readyState < 2) return;
    const W = this.canvas.width;
    const H = this.canvas.height;

    if (this.zoom <= 1) {
      this._srcRegion = { x: 0, y: 0, w: W, h: H };
      this.ctx.drawImage(this.video, 0, 0, W, H);
    } else {
      const srcW = W / this.zoom;
      const srcH = H / this.zoom;
      const srcX = Math.max(0, Math.min(this.panX - srcW / 2, W - srcW));
      const srcY = Math.max(0, Math.min(this.panY - srcH / 2, H - srcH));
      this._srcRegion = { x: srcX, y: srcY, w: srcW, h: srcH };
      this.ctx.drawImage(this.video, srcX, srcY, srcW, srcH, 0, 0, W, H);
    }

    if (this.poleMarker) this._drawPoleMarker();
  }

  _drawPoleMarker() {
    const { x: sx, y: sy, w: sw, h: sh } = this._srcRegion;

    // Convert video coords → canvas coords
    const cx = (this.poleMarker.x - sx) / sw * this.canvas.width;

    // Skip if pole is panned out of view
    if (cx < -20 || cx > this.canvas.width + 20) return;

    const cy = (this.poleMarker.y - sy) / sh * this.canvas.height;

    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#ff2020';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, this.canvas.height); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff2020'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,32,32,0.25)'; ctx.fill();
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = '#ff2020';
    ctx.fillText('POLE', cx + 18, cy + 5);
    ctx.restore();
  }

  _startRendering() {
    const render = () => { this._renderFrame(); this._animFrame = requestAnimationFrame(render); };
    this._animFrame = requestAnimationFrame(render);
  }

  _stopRendering() {
    if (this._animFrame) { cancelAnimationFrame(this._animFrame); this._animFrame = null; }
  }

  // ─── Pinch-to-zoom + drag-to-pan gestures ─────────────────────

  _initGestures() {
    let lastDist  = null;
    let lastPinchMid = null;
    let lastPan   = null;

    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        lastDist     = this._touchDist(e.touches);
        lastPinchMid = this._touchMid(e.touches);
        lastPan      = null;
        e.preventDefault();
      } else if (e.touches.length === 1 && this.zoom > 1) {
        lastPan  = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        lastDist = null;
        e.preventDefault();
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const dist = this._touchDist(e.touches);
        const mid  = this._touchMid(e.touches);
        if (lastDist) {
          const scale = dist / lastDist;
          const newZoom = Math.max(1, Math.min(6, this.zoom * scale));

          // Zoom towards the pinch midpoint
          if (lastPinchMid) {
            const rect = this.canvas.getBoundingClientRect();
            const midX = (mid.x - rect.left) / rect.width  * this.canvas.width;
            const midY = (mid.y - rect.top)  / rect.height * this.canvas.height;
            const { x: sx, y: sy, w: sw, h: sh } = this._srcRegion || { x:0, y:0, w:this.canvas.width, h:this.canvas.height };
            const videoMidX = sx + (midX / this.canvas.width)  * sw;
            const videoMidY = sy + (midY / this.canvas.height) * sh;
            this.panX = videoMidX;
            this.panY = videoMidY;
          }

          this.zoom = newZoom;
          if (this.zoom === 1) { this.panX = this.canvas.width/2; this.panY = this.canvas.height/2; }
        }
        lastDist     = dist;
        lastPinchMid = mid;
        e.preventDefault();
      } else if (e.touches.length === 1 && this.zoom > 1 && lastPan) {
        const rect = this.canvas.getBoundingClientRect();
        const dx = (e.touches[0].clientX - lastPan.x) / rect.width  * this.canvas.width  / this.zoom;
        const dy = (e.touches[0].clientY - lastPan.y) / rect.height * this.canvas.height / this.zoom;
        this.panX = Math.max(0, Math.min(this.canvas.width,  this.panX - dx));
        this.panY = Math.max(0, Math.min(this.canvas.height, this.panY - dy));
        lastPan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        e.preventDefault();
      }
      if (this.video.paused) this._renderFrame();
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => { lastDist = null; lastPan = null; });
  }

  _touchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _touchMid(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }

  // ─── Accessors ────────────────────────────────────────────────

  get currentTime() { return this.video.currentTime; }
  get duration()    { return this.video.duration || 0; }
  get isPaused()    { return this.video.paused; }

  destroy() {
    this._stopRendering();
    if (this._blobUrl) URL.revokeObjectURL(this._blobUrl);
  }
}
