class Playback {
  constructor(videoEl, canvasEl) {
    this.video = videoEl;
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.fps = 30;
    this.poleMarker = null;
    this._animFrame = null;
    this._blobUrl = null;
  }

  async load(blob) {
    if (this._blobUrl) URL.revokeObjectURL(this._blobUrl);
    this._stopRendering();
    this.poleMarker = null;

    this._blobUrl = URL.createObjectURL(blob);
    this.video.src = this._blobUrl;

    await new Promise((resolve, reject) => {
      this.video.onloadedmetadata = resolve;
      this.video.onerror = reject;
    });

    this.canvas.width = this.video.videoWidth || 1280;
    this.canvas.height = this.video.videoHeight || 720;
    this.video.currentTime = 0;

    // Draw first frame once seek completes
    await new Promise(r => {
      this.video.onseeked = r;
      setTimeout(r, 300); // fallback
    });
    this._renderFrame();
  }

  play() {
    this.video.play();
    this._startRendering();
  }

  pause() {
    this.video.pause();
    this._stopRendering();
    this._renderFrame();
  }

  stepForward() {
    this.video.pause();
    this._stopRendering();
    this.video.currentTime = Math.min(
      this.video.duration,
      this.video.currentTime + 1 / this.fps
    );
    this.video.onseeked = () => { this._renderFrame(); this.video.onseeked = null; };
  }

  stepBack() {
    this.video.pause();
    this._stopRendering();
    this.video.currentTime = Math.max(0, this.video.currentTime - 1 / this.fps);
    this.video.onseeked = () => { this._renderFrame(); this.video.onseeked = null; };
  }

  setSpeed(rate) { this.video.playbackRate = rate; }
  setFps(fps) { this.fps = fps; }

  seekTo(time) {
    this.video.currentTime = time;
    if (this.video.paused) {
      this.video.onseeked = () => { this._renderFrame(); this.video.onseeked = null; };
    }
  }

  setPoleMarker(x, y) {
    this.poleMarker = { x, y };
    if (this.video.paused) this._renderFrame();
  }

  clearPoleMarker() {
    this.poleMarker = null;
    if (this.video.paused) this._renderFrame();
  }

  _renderFrame() {
    if (this.video.readyState < 2) return;
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    if (this.poleMarker) this._drawPoleMarker();
  }

  _drawPoleMarker() {
    const { x, y } = this.poleMarker;
    const ctx = this.ctx;

    // Vertical line across full height
    ctx.save();
    ctx.strokeStyle = '#ff2020';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, this.canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosshair circle at click point
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff2020';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 32, 32, 0.25)';
    ctx.fill();

    // Label
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = '#ff2020';
    ctx.fillText('POLE', x + 18, y + 5);
    ctx.restore();
  }

  _startRendering() {
    const render = () => {
      this._renderFrame();
      this._animFrame = requestAnimationFrame(render);
    };
    this._animFrame = requestAnimationFrame(render);
  }

  _stopRendering() {
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
  }

  get currentTime() { return this.video.currentTime; }
  get duration() { return this.video.duration || 0; }
  get isPaused() { return this.video.paused; }

  destroy() {
    this._stopRendering();
    if (this._blobUrl) URL.revokeObjectURL(this._blobUrl);
  }
}
