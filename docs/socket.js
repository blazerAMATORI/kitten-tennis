// ── WebSocket client ──────────────────────────────────────────────────────────
const SocketManager = (() => {
  let ws = null;
  const handlers = {};

  function getURL() {
    // Override: <meta name="ws-url" content="wss://...">
    const meta = document.querySelector('meta[name="ws-url"]');
    if (meta) return meta.content;
    const loc = window.location;
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
      return `ws://${loc.hostname}:3000`;
    }
    // ← Change this to your Render URL when deploying:
    return 'wss://kitten-tennis.onrender.com';
  }

  function connect() {
    ws = new WebSocket(getURL());
    ws.onopen = () => { console.log('[WS] connected'); fire('connect'); };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      fire(m.type, m);
    };
    ws.onclose = () => { console.log('[WS] closed'); fire('disconnect'); setTimeout(connect, 2000); };
    ws.onerror = () => {};
  }

  function fire(type, data) { if (handlers[type]) handlers[type](data); }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function on(type, fn) { handlers[type] = fn; }

  // Shortcuts
  const create  = nick => send({ type: 'create', nick });
  const join    = (code, nick) => send({ type: 'join', code, nick });
  const move    = d => send({ type: 'move', ...d });
  const rematch = () => send({ type: 'rematch' });

  return { connect, send, on, create, join, move, rematch };
})();
