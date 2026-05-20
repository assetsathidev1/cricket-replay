class Playback {
  constructor(videoEl, canvasEl) {
    this.video  = videoEl;
    this.canvas = canvasEl;
    this.ctx    = canvasEl.getContext('2d');
    this.fps    = 30;

    // Pole marker — stored in VIDEO pixel coords so zoom/pan doesn't affect it
    this.poleMarker = null;       // { x, y } in video pixel space
    this._poleState = 'none';     // 'none' | 'placing' | 'adjusting' | 'locked'
    this._poleAngle = 0;          // 0 = vertical, 90 = horizontal

    // Rendering
    this._animFrame  = null;
    this._blobUrl    = null;
    this._srcRegion  = null;      // current zoom viewport in video pixel space

    // Zoom / pan
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;

    this._initGestures();
  }

  // ─── Load ─────────────────────────────────────────────────────

  async load(blob) {
    if (this._blobUrl) URL.revokeObjectURL(this._blobUrl);
    this._stopRendering();
    this.poleMarker  = null;
    this._poleState  = 'none';
    this._poleAngle  = 0;
    this.zoom        = 1;

    this._blobUrl    = URL.createObjectURL(blob);
    this.video.src   = this._blobUrl;

    await new Promise((resolve, reject) => {
      this.video.onloadedmetadata = resolve;
      this.video.onerror = reject;
    });

    this.canvas.width  = this.video.videoWidth  || 1280;
    this.canvas.height = this.video.videoHeight || 720;
    this.panX = this.canvas.width  / 2;
    this.panY = this.canvas.height / 2;

    this.video.currentTime = 0;
    await new Promise(r => { this.video.onseeked = r; setTimeout(r, 300); });
    this._renderFrame();
  }

  // ─── Transport ────────────────────────────────────────────────

  play()  { this.video.play();  this._startRendering(); }
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
    if (this.zoom === 1) { this.panX = this.canvas.width / 2; this.panY = this.canvas.height / 2; }
    if (this.video.paused) this._renderFrame();
  }

  resetZoom() { this.setZoom(1); }

  // ─── Pole marker public API ───────────────────────────────────

  get poleState() { return this._poleState; }
  get poleAngle() { return this._poleAngle; }

  /** Enter "tap canvas to place" mode */
  startPlacing() {
    this._poleState = 'placing';
    if (this.video.paused) this._renderFrame();
  }

  /** Called from canvas tap — places line and enters adjusting mode */
  placePoleAt(canvasX, canvasY) {
    this.poleMarker = this._canvasToVideo(canvasX, canvasY);
    this._poleState = 'adjusting';
    if (this.video.paused) this._renderFrame();
  }

  /** Drag update — only updates the axis perpendicular to the line */
  dragPoleTo(canvasX, canvasY) {
    if (!this.poleMarker || this._poleState !== 'adjusting') return;
    const v = this._canvasToVideo(canvasX, canvasY);
    if (this._poleAngle === 0) {
      this.poleMarker.x = v.x;   // vertical line: drag left/right
    } else {
      this.poleMarker.y = v.y;   // horizontal line: drag up/down
    }
    if (this.video.paused) this._renderFrame();
  }

  lockPole() {
    if (!this.poleMarker) return;
    this._poleState = 'locked';
    if (this.video.paused) this._renderFrame();
  }

  startAdjusting() {
    if (!this.poleMarker) return;
    this._poleState = 'adjusting';
    if (this.video.paused) this._renderFrame();
  }

  rotatePole() {
    if (!this.poleMarker) return;
    this._poleAngle = this._poleAngle === 0 ? 90 : 0;
    if (this.video.paused) this._renderFrame();
  }

  clearPole() {
    this.poleMarker  = null;
    this._poleState  = 'none';
    this._poleAngle  = 0;
    if (this.video.paused) this._renderFrame();
  }

  // ─── Rendering ────────────────────────────────────────────────

  _renderFrame() {
    if (this.video.readyState < 2) return;
    const W = this.canvas.width, H = this.canvas.height;

    if (this.zoom <= 1) {
      this._srcRegion = { x: 0, y: 0, w: W, h: H };
      this.ctx.drawImage(this.video, 0, 0, W, H);
    } else {
      const srcW = W / this.zoom, srcH = H / this.zoom;
      const srcX = Math.max(0, Math.min(this.panX - srcW / 2, W - srcW));
      const srcY = Math.max(0, Math.min(this.panY - srcH / 2, H - srcH));
      this._srcRegion = { x: srcX, y: srcY, w: srcW, h: srcH };
      this.ctx.drawImage(this.video, srcX, srcY, srcW, srcH, 0, 0, W, H);
    }

    if (this.poleMarker && this._poleState !== 'none') this._drawPoleMarker();
  }

  _drawPoleMarker() {
    const { x: sx, y: sy, w: sw, h: sh } = this._srcRegion;
    const W = this.canvas.width, H = this.canvas.height;

    // Video → canvas coords
    const cx = (this.poleMarker.x - sx) / sw * W;
    const cy = (this.poleMarker.y - sy) / sh * H;

    const isAdjusting = this._poleState === 'adjusting';
    const color       = isAdjusting ? '#f59e0b' : '#ff2020'; // amber when adjusting, red when locked
    const angleRad    = this._poleAngle * Math.PI / 180;

    // Direction vector for the line
    const dx = Math.sin(angleRad);
    const dy = Math.cos(angleRad);
    const len = Math.max(W, H) * 2;

    const ctx = this.ctx;
    ctx.save();

    // The reference line
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    if (isAdjusting) ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(cx - dx * len, cy - dy * len);
    ctx.lineTo(cx + dx * len, cy + dy * len);
    ctx.stroke();
    ctx.setLineDash([]);

    // Anchor circle
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.stroke();
    ctx.fillStyle = isAdjusting ? 'rgba(245,158,11,0.2)' : 'rgba(255,32,32,0.2)';
    ctx.fill();

    // Drag arrows when adjusting — show which direction to drag
    if (isAdjusting) {
      const arrowDx = Math.cos(angleRad); // perpendicular to line
      const arrowDy = -Math.sin(angleRad);
      const arrowLen = 30;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.fillStyle   = color;
      // left/up arrow
      this._drawArrow(ctx, cx, cy, cx - arrowDx * arrowLen, cy - arrowDy * arrowLen);
      // right/down arrow
      this._drawArrow(ctx, cx, cy, cx + arrowDx * arrowLen, cy + arrowDy * arrowLen);
    }

    // Label
    ctx.font      = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = color;
    // Offset label perpendicular to line so it doesn't sit on top of it
    const labelOffX = Math.cos(angleRad) * 20 + Math.sin(angleRad) * 4;
    const labelOffY = -Math.sin(angleRad) * 20 + Math.cos(angleRad) * 4;
    ctx.fillText(isAdjusting ? 'DRAG' : 'POLE', cx + labelOffX + 4, cy + labelOffY + 5);

    ctx.restore();
  }

  _drawArrow(ctx, fromX, fromY, toX, toY) {
    const headLen = 10;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  _startRendering() {
    const render = () => { this._renderFrame(); this._animFrame = requestAnimationFrame(render); };
    this._animFrame = requestAnimationFrame(render);
  }

  _stopRendering() {
    if (this._animFrame) { cancelAnimationFrame(this._animFrame); this._animFrame = null; }
  }

  // ─── Coordinate helpers ───────────────────────────────────────

  /** Canvas pixel → video pixel, accounting for current zoom/pan */
  _canvasToVideo(canvasX, canvasY) {
    const { x: sx, y: sy, w: sw, h: sh } = this._srcRegion || { x: 0, y: 0, w: this.canvas.width, h: this.canvas.height };
    return {
      x: sx + (canvasX / this.canvas.width)  * sw,
      y: sy + (canvasY / this.canvas.height) * sh,
    };
  }

  /** Canvas element click/touch → canvas pixel coords (handles CSS scaling) */
  eventToCanvas(e, touch = false) {
    const src  = touch ? e.touches[0] : e;
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (src.clientX - rect.left) / rect.width  * this.canvas.width,
      y: (src.clientY - rect.top)  / rect.height * this.canvas.height,
    };
  }

  // ─── Gestures (pinch zoom + drag pan + pole drag) ─────────────

  _initGestures() {
    let lastDist     = null;
    let lastPinchMid = null;
    let lastPan      = null;
    let isPoleTouch  = false;

    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        lastDist     = this._touchDist(e.touches);
        lastPinchMid = this._touchMid(e.touches);
        lastPan      = null;
        isPoleTouch  = false;
        e.preventDefault();
      } else if (e.touches.length === 1) {
        if (this._poleState === 'adjusting') {
          // Pole drag takes priority over pan
          isPoleTouch = true;
          const { x, y } = this.eventToCanvas(e, true);
          this.dragPoleTo(x, y);
          e.preventDefault();
        } else if (this.zoom > 1) {
          lastPan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          isPoleTouch = false;
          e.preventDefault();
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const dist = this._touchDist(e.touches);
        const mid  = this._touchMid(e.touches);
        if (lastDist) {
          const scale   = dist / lastDist;
          const newZoom = Math.max(1, Math.min(6, this.zoom * scale));
          if (lastPinchMid) {
            const rect   = this.canvas.getBoundingClientRect();
            const midX   = (mid.x - rect.left) / rect.width  * this.canvas.width;
            const midY   = (mid.y - rect.top)  / rect.height * this.canvas.height;
            const { x: sx, y: sy, w: sw, h: sh } = this._srcRegion || { x:0, y:0, w:this.canvas.width, h:this.canvas.height };
            this.panX    = sx + (midX / this.canvas.width)  * sw;
            this.panY    = sy + (midY / this.canvas.height) * sh;
          }
          this.zoom = newZoom;
          if (this.zoom === 1) { this.panX = this.canvas.width / 2; this.panY = this.canvas.height / 2; }
        }
        lastDist = dist; lastPinchMid = mid;
        e.preventDefault();
      } else if (e.touches.length === 1) {
        if (isPoleTouch && this._poleState === 'adjusting') {
          const { x, y } = this.eventToCanvas(e, true);
          this.dragPoleTo(x, y);
          e.preventDefault();
        } else if (this.zoom > 1 && lastPan) {
          const rect = this.canvas.getBoundingClientRect();
          const dx   = (e.touches[0].clientX - lastPan.x) / rect.width  * this.canvas.width  / this.zoom;
          const dy   = (e.touches[0].clientY - lastPan.y) / rect.height * this.canvas.height / this.zoom;
          this.panX  = Math.max(0, Math.min(this.canvas.width,  this.panX - dx));
          this.panY  = Math.max(0, Math.min(this.canvas.height, this.panY - dy));
          lastPan    = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          e.preventDefault();
        }
      }
      if (this.video.paused) this._renderFrame();
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => {
      lastDist = null; lastPan = null; isPoleTouch = false;
    });
  }

  _touchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _touchMid(touches) {
    return { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };
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
