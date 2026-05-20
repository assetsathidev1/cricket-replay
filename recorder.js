class Recorder {
  constructor() {
    this.stream = null;
    this.mediaRecorder = null;
    this.isRecording = false;
    this.initChunk = null;     // WebM header — first chunk from MediaRecorder
    this.dataChunks = [];      // rolling 1-second data blobs with timestamps
    this.BUFFER_DURATION = 90 * 1000;
    this.actualFps = null;
    this._mimeType = null;
  }

  async start(videoElement) {
    const constraints = {
      video: {
        facingMode: 'environment',
        frameRate: { ideal: 120, min: 30 },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = this.stream;
    await videoElement.play();

    const track = this.stream.getVideoTracks()[0];
    if (track) {
      const settings = track.getSettings();
      this.actualFps = settings.frameRate || 30;
    }

    this._mimeType = this._getSupportedMimeType();
    this._startMediaRecorder();
    this.isRecording = true;
  }

  _startMediaRecorder() {
    this.initChunk = null;
    this.dataChunks = [];
    let isFirst = true;

    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: this._mimeType,
      videoBitsPerSecond: 4_000_000,
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      if (isFirst) {
        this.initChunk = e.data;
        isFirst = false;
        return; // init chunk stored separately, not in rolling buffer
      }
      this.dataChunks.push({ data: e.data, timestamp: Date.now() });
      this._pruneBuffer();
    };

    this.mediaRecorder.start(1000); // 1-second timeslices
  }

  _pruneBuffer() {
    const cutoff = Date.now() - this.BUFFER_DURATION;
    this.dataChunks = this.dataChunks.filter(c => c.timestamp > cutoff);
  }

  captureIncident(durationMs = 90000) {
    if (!this.isRecording || !this.initChunk) return null;

    const cutoff = Date.now() - durationMs;
    const recent = this.dataChunks.filter(c => c.timestamp > cutoff);

    if (recent.length === 0) return null;

    const blobs = [this.initChunk, ...recent.map(c => c.data)];
    return new Blob(blobs, { type: this._mimeType });
  }

  getActualFps() { return this.actualFps; }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }
    this.isRecording = false;
    this.initChunk = null;
    this.dataChunks = [];
  }

  _getSupportedMimeType() {
    // Prefer MP4 — universally shareable (WhatsApp, iMessage, Files app, etc.)
    // Chrome 130+ on Android supports mp4/avc1 natively; Safari/iOS always has.
    // Fall back to WebM variants if MP4 recording is not available on this device.
    const types = [
      'video/mp4;codecs=avc1',
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  }
}
