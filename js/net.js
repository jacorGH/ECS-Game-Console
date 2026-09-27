/* Data Console — P2P link via PeerJS (host runs the game, guests send input) */
(function () {
  const DC = window.DC;
  const PEER_SRC = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const PREFIX = 'dcon-';

  const N = (DC.Net = {
    role: null, peer: null, conns: new Map(), host: null, code: null, engine: null,
    lastMask: -1, listeners: {},

    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    emit(ev, ...a) { (this.listeners[ev] || []).forEach((f) => f(...a)); },

    async lib() {
      if (window.Peer) return;
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = PEER_SRC; s.onload = res;
        s.onerror = () => rej(new Error('Could not load PeerJS — check your internet connection.'));
        document.head.appendChild(s);
      });
    },
    newCode() {
      const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      let s = '';
      for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
      return s;
    },

    async startHost(engine, tries = 0) {
      await this.lib();
      this.leave(true);
      this.role = 'host'; this.engine = engine; this.code = this.newCode();
      this.emit('status', 'Opening a room…');
      const peer = (this.peer = new Peer(PREFIX + this.code.toLowerCase()));
      peer.on('open', () => {
        engine.mode = 'host';
        engine.onSnapshot = (s) => this.broadcast(s);
        this.emit('status', 'Room open — share the code');
        this.emit('change');
      });
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id' && tries < 3) { this.startHost(engine, tries + 1); return; }
        this.emit('status', 'Link error: ' + (err.type || err.message));
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
      peer.on('connection', (conn) => this.accept(conn));
    },

    accept(conn) {
      const used = new Set([...this.conns.values()].map((c) => c.idx));
      let idx = 1;
      while (used.has(idx)) idx++;
      if (idx > 3) {
        conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 400); });
        return;
      }
      conn.idx = idx;
      conn.on('open', () => {
        this.conns.set(conn.peer, conn);
        conn.send({ t: 'hello', you: idx, cart: this.engine.cart });
        this.engine.addRemotePlayer(idx);
        this.emit('change');
        this.emit('status', `Player ${idx + 1} joined`);
      });
      conn.on('data', (d) => {
        if (d && d.t === 'in') DC.Input.remote[idx] = DC.Input.fromMask(d.m | 0);
      });
      const bye = () => {
        if (!this.conns.has(conn.peer)) return;
        this.conns.delete(conn.peer);
        DC.Input.remote[idx] = {};
        this.engine.removeRemotePlayer(idx);
        this.emit('change');
        this.emit('status', `Player ${idx + 1} left`);
      };
      conn.on('close', bye);
      conn.on('error', bye);
    },

    broadcast(msg) {
      for (const c of this.conns.values()) if (c.open) { try { c.send(msg); } catch (e) { /* dropped */ } }
    },
    rehello() {
      for (const c of this.conns.values()) if (c.open) c.send({ t: 'hello', you: c.idx, cart: this.engine.cart });
      for (const c of this.conns.values()) this.engine.addRemotePlayer(c.idx);
    },
    shareCart(cart) { this.broadcast({ t: 'cart', cart }); },

    async join(code, engine) {
      await this.lib();
      this.leave(true);
      this.role = 'client'; this.engine = engine;
      this.code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      this.emit('status', 'Looking for room ' + this.code + '…');
      const peer = (this.peer = new Peer());
      peer.on('open', () => {
        const conn = (this.host = peer.connect(PREFIX + this.code.toLowerCase(), { reliable: true }));
        conn.on('open', () => { this.emit('status', 'Connected — loading the cart'); this.emit('change'); });
        conn.on('data', (d) => this.onClientData(d));
        conn.on('close', () => { this.emit('status', 'The host closed the room'); this.leave(true); });
      });
      peer.on('error', (err) => {
        this.emit('status', err.type === 'peer-unavailable' ? `No room called ${this.code}. Check the code and try again.` : 'Link error: ' + (err.type || err.message));
        if (err.type === 'peer-unavailable') this.leave(true);
      });
      engine.onInput = (mask, frame) => this.sendInput(mask, frame);
    },
    onClientData(d) {
      if (!d || !d.t) return;
      if (d.t === 'hello') this.emit('hello', d);
      else if (d.t === 'snap') this.engine.applySnap(d);
      else if (d.t === 'cart') this.emit('cart', d.cart);
      else if (d.t === 'full') { this.emit('status', 'That room is full (4 players max)'); this.leave(true); }
    },
    sendInput(mask, frame) {
      if (!this.host || !this.host.open) return;
      if (mask !== this.lastMask || frame % 30 === 0) { this.host.send({ t: 'in', m: mask }); this.lastMask = mask; }
    },

    leave(silent) {
      const was = this.role;
      try { for (const c of this.conns.values()) c.close(); } catch (e) { /* ignore */ }
      this.conns.clear();
      try { if (this.host) this.host.close(); } catch (e) { /* ignore */ }
      this.host = null;
      try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
      this.peer = null; this.role = null; this.code = null; this.lastMask = -1;
      if (this.engine) {
        this.engine.mode = 'local';
        this.engine.onSnapshot = null; this.engine.onInput = null;
        this.engine.remotePlayers.clear();
      }
      DC.Input.remote = [null, {}, {}, {}];
      if (!silent) this.emit('status', 'Offline');
      this.emit('change');
      if (was === 'client') this.emit('leftClient');
    },
  });
})();
