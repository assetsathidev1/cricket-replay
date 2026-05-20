// AWS API Gateway WebSocket endpoint
const RELAY_WS_URL = 'wss://59njbyvtn1.execute-api.ap-south-1.amazonaws.com/prod/';

class Relay {
  constructor() {
    this.ws             = null;
    this.matchCode      = null;
    this.role           = null;
    this.onMessage      = null;   // callback(msg)
    this.onStateChange  = null;   // callback('connecting'|'open'|'closed')
    this._reconnectTimer = null;
    this._intentional   = false;
  }

  connect(matchCode, role) {
    this.matchCode  = matchCode;
    this.role       = role;
    this._intentional = false;
    this._open();
  }

  _open() {
    if (this.ws) { this.ws.onclose = null; this.ws.close(); }
    this._notify('connecting');

    this.ws = new WebSocket(RELAY_WS_URL);

    this.ws.onopen = () => {
      this._notify('open');
      this._send({ type: 'join', matchCode: this.matchCode, role: this.role });
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (this.onMessage) this.onMessage(msg);
      } catch (err) { console.error('[Relay] parse error', err); }
    };

    this.ws.onclose = () => {
      this._notify('closed');
      if (!this._intentional) {
        console.log('[Relay] lost connection — retrying in 3s');
        this._reconnectTimer = setTimeout(() => this._open(), 3000);
      }
    };

    this.ws.onerror = (e) => console.error('[Relay] ws error', e);
  }

  send(data) { this._send(data); }

  _send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  _notify(state) {
    if (this.onStateChange) this.onStateChange(state);
  }

  disconnect() {
    this._intentional = true;
    clearTimeout(this._reconnectTimer);
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
    this._notify('closed');
  }
}
