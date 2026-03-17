/**
 * socket.js — WebSocket client wrapper
 * Handles connection, reconnection, and message routing.
 * Exposes global `SocketManager` used by game.js
 */

const SocketManager = (() => {
  // ── Server URL detection ──────────────────────────────────────────────────
  // For local dev: ws://localhost:3000
  // For production: set WS_URL in a <meta> tag or use window.location
  function getServerURL() {
    // Allow override via meta tag: <meta name="ws-url" content="wss://myserver.com">
    const meta = document.querySelector('meta[name="ws-url"]');
    if (meta) return meta.content;

    const loc = window.location;
    const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
    // If served from a different port (e.g. GitHub Pages), fall back to prod server env
    // Change this URL to your deployed backend when hosting on Render/Railway:
    const PROD_SERVER = 'wss://kitten-tennis.onrender.com'; // ← Update this!

    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
      return `${proto}://${loc.hostname}:3000`;
    }
    return PROD_SERVER;
  }

  let ws = null;
  let messageHandlers = {};
  let connectionStatus = 'disconnected'; // 'connecting'|'connected'|'disconnected'
  let reconnectTimer = null;

  // ── Connect ───────────────────────────────────────────────────────────────
  function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    connectionStatus = 'connecting';
    const url = getServerURL();
    console.log(`[Socket] Connecting to ${url}`);

    ws = new WebSocket(url);

    ws.onopen = () => {
      connectionStatus = 'connected';
      console.log('[Socket] Connected');
      if (messageHandlers['connect']) messageHandlers['connect']();
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      // Route to registered handler
      if (messageHandlers[msg.type]) {
        messageHandlers[msg.type](msg);
      } else {
        console.warn('[Socket] Unhandled message type:', msg.type);
      }
    };

    ws.onclose = () => {
      connectionStatus = 'disconnected';
      console.log('[Socket] Disconnected');
      if (messageHandlers['disconnect']) messageHandlers['disconnect']();
      // Auto-reconnect after 2s
      reconnectTimer = setTimeout(() => connect(), 2000);
    };

    ws.onerror = (err) => {
      console.error('[Socket] Error:', err);
    };
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  function send(msg) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[Socket] Cannot send — not connected');
      return false;
    }
    ws.send(JSON.stringify(msg));
    return true;
  }

  // ── Register a message handler ────────────────────────────────────────────
  function on(type, handler) {
    messageHandlers[type] = handler;
  }

  // ── Convenience methods ───────────────────────────────────────────────────
  function createRoom()         { send({ type: 'createRoom' }); }
  function joinRoom(code)       { send({ type: 'joinRoom', code }); }
  function sendPlayerMove(data) { send({ type: 'playerMove', ...data }); }
  function sendAction(action)   { send({ type: 'playerAction', action }); }
  function sendRematch()        { send({ type: 'rematch' }); }

  // ── Expose ────────────────────────────────────────────────────────────────
  return { connect, send, on, createRoom, joinRoom, sendPlayerMove, sendAction, sendRematch };
})();
