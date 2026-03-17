/**
 * Kitten Tennis - WebSocket Server
 * Authoritative game server with room management
 * Run: npm start
 */

const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;

// ─── HTTP Server (serves static client files) ───────────────────────────────
const server = http.createServer((req, res) => {
  // Serve static files from /client directory
  let filePath = path.join(__dirname, '../client', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
});

// ─── WebSocket Server ────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

/** @type {Map<string, Room>} roomCode -> Room */
const rooms = new Map();

// ─── Physics Constants (must match client) ───────────────────────────────────
const GAME_WIDTH  = 800;
const GAME_HEIGHT = 450;
const GROUND_Y    = GAME_HEIGHT - 60; // ground level
const NET_X       = GAME_WIDTH / 2;
const NET_HEIGHT  = 110;
const BALL_RADIUS = 14;
const GRAVITY     = 980;  // px/s²
const BALL_BOUNCE = 0.72; // energy retained on ground bounce
const TICK_RATE   = 60;   // server ticks per second
const TICK_MS     = 1000 / TICK_RATE;

// ─── Room class ───────────────────────────────────────────────────────────────
class Room {
  constructor(code) {
    this.code = code;
    /** @type {WebSocket[]} */
    this.players = [];   // index 0 = P1 (left), index 1 = P2 (right)
    this.scores = [0, 0];
    this.ball = this.spawnBall(0);
    this.gameActive = false;
    this.tickInterval = null;
    this.rallyCount = 0;
    this.lastServeSide = 0; // who gets next serve
  }

  /** Spawn ball towards given side (0=right, 1=left) */
  spawnBall(towardSide) {
    const dir = towardSide === 0 ? 1 : -1;
    return {
      x:  GAME_WIDTH / 2,
      y:  GAME_HEIGHT / 2 - 60,
      vx: dir * (280 + Math.random() * 80),
      vy: -300,
    };
  }

  /** Start the game loop */
  start() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.gameActive = true;
    let lastTime = Date.now();

    this.tickInterval = setInterval(() => {
      const now = Date.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05); // cap delta
      lastTime = now;
      this.tick(dt);
    }, TICK_MS);
  }

  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.gameActive = false;
  }

  /** Main physics tick (server-authoritative) */
  tick(dt) {
    if (!this.gameActive) return;
    const b = this.ball;

    // Apply gravity
    b.vy += GRAVITY * dt;

    // Move ball
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // ── Ground bounce ──
    if (b.y + BALL_RADIUS >= GROUND_Y) {
      b.y = GROUND_Y - BALL_RADIUS;
      b.vy *= -BALL_BOUNCE;
      b.vx *= 0.92; // friction
      if (Math.abs(b.vy) < 30) b.vy = 0;
      this.broadcast({ type: 'bounce', kind: 'ground', x: b.x, y: b.y });
    }

    // ── Ceiling ──
    if (b.y - BALL_RADIUS <= 0) {
      b.y = BALL_RADIUS;
      b.vy *= -0.8;
    }

    // ── Net collision ──
    const netTop = GROUND_Y - NET_HEIGHT;
    if (
      b.x - BALL_RADIUS < NET_X + 8 &&
      b.x + BALL_RADIUS > NET_X - 8 &&
      b.y + BALL_RADIUS > netTop
    ) {
      // Determine which side ball came from and push back
      b.x = b.vx > 0
        ? NET_X - 8 - BALL_RADIUS
        : NET_X + 8 + BALL_RADIUS;
      b.vx *= -0.7;
      this.broadcast({ type: 'bounce', kind: 'net', x: b.x, y: b.y });
    }

    // ── Player collisions ──
    this.players.forEach((ws, idx) => {
      const pd = ws.playerData;
      if (!pd) return;
      const px = pd.x, py = pd.y;
      const pw = 52, ph = 64; // player hitbox

      // AABB vs circle
      const closestX = Math.max(px - pw/2, Math.min(b.x, px + pw/2));
      const closestY = Math.max(py - ph/2, Math.min(b.y, py + ph/2));
      const dx = b.x - closestX;
      const dy = b.y - closestY;
      const distSq = dx*dx + dy*dy;

      if (distSq < BALL_RADIUS * BALL_RADIUS) {
        // Hit! Calculate bounce direction
        const dist = Math.sqrt(distSq) || 1;
        const nx = dx / dist;
        const ny = dy / dist;

        // Separate ball from player
        b.x = closestX + nx * (BALL_RADIUS + 1);
        b.y = closestY + ny * (BALL_RADIUS + 1);

        // Reflect velocity
        const dot = b.vx * nx + b.vy * ny;
        b.vx = b.vx - 2 * dot * nx;
        b.vy = b.vy - 2 * dot * ny;

        // Add player momentum boost
        const boost = 1.15 + Math.min(this.rallyCount * 0.02, 0.3);
        b.vx *= boost;
        b.vy = Math.min(b.vy, -180); // always goes upward after hit

        // Ensure ball goes toward opponent's side
        if (idx === 0 && b.vx < 0) b.vx *= -1;
        if (idx === 1 && b.vx > 0) b.vx *= -1;

        this.rallyCount++;
        pd.hitting = true;
        setTimeout(() => { if (pd) pd.hitting = false; }, 200);

        this.broadcast({ type: 'hit', player: idx, x: b.x, y: b.y });
      }
    });

    // ── Scoring: ball out of left/right bounds ──
    if (b.x + BALL_RADIUS < 0) {
      // P2 scores (ball went off P1's side)
      this.score(1);
      return;
    }
    if (b.x - BALL_RADIUS > GAME_WIDTH) {
      // P1 scores
      this.score(0);
      return;
    }

    // ── Broadcast ball state every tick ──
    this.broadcast({
      type: 'ballUpdate',
      x: b.x, y: b.y,
      vx: b.vx, vy: b.vy,
      t: Date.now(),
    });
  }

  score(scoringPlayer) {
    this.scores[scoringPlayer]++;
    this.rallyCount = 0;
    this.broadcast({ type: 'score', scores: this.scores, scorer: scoringPlayer });

    // Check win condition (first to 7)
    if (this.scores[scoringPlayer] >= 7) {
      this.stop();
      this.broadcast({ type: 'gameOver', winner: scoringPlayer, scores: this.scores });
      return;
    }

    // Respawn ball after short delay
    this.lastServeSide = 1 - scoringPlayer; // loser serves
    setTimeout(() => {
      if (!this.gameActive) return;
      this.ball = this.spawnBall(this.lastServeSide);
      this.broadcast({
        type: 'respawn',
        x: this.ball.x, y: this.ball.y,
        vx: this.ball.vx, vy: this.ball.vy,
      });
    }, 1500);
  }

  /** Send message to all connected players */
  broadcast(msg) {
    const data = JSON.stringify(msg);
    this.players.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  /** Send to specific player index */
  sendTo(idx, msg) {
    const ws = this.players[idx];
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}

// ─── Generate unique room code ────────────────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = 'KITTEN' + Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

// ─── WebSocket connection handler ─────────────────────────────────────────────
wss.on('connection', (ws) => {
  ws.playerData = { x: 100, y: GROUND_Y - 32, hitting: false };
  ws.roomCode = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      // Player creates a new room
      case 'createRoom': {
        const code = generateCode();
        const room = new Room(code);
        rooms.set(code, room);
        ws.playerData.x = 180;
        ws.playerData.y = GROUND_Y - 32;
        room.players.push(ws);
        ws.roomCode = code;
        ws.playerIndex = 0;
        ws.send(JSON.stringify({ type: 'roomCreated', code, playerIndex: 0 }));
        console.log(`Room created: ${code}`);
        break;
      }

      // Player joins existing room
      case 'joinRoom': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found! Check the code.' }));
          return;
        }
        if (room.players.length >= 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room is full!' }));
          return;
        }
        ws.playerData.x = GAME_WIDTH - 180;
        ws.playerData.y = GROUND_Y - 32;
        room.players.push(ws);
        ws.roomCode = code;
        ws.playerIndex = 1;

        // Notify P2 they joined
        ws.send(JSON.stringify({ type: 'roomJoined', code, playerIndex: 1 }));

        // Notify P1 that opponent connected
        room.sendTo(0, { type: 'opponentJoined' });

        // Start the game!
        room.start();
        room.broadcast({ type: 'gameStart', scores: [0, 0] });
        console.log(`Game started in room: ${code}`);
        break;
      }

      // Player movement update
      case 'playerMove': {
        if (!ws.roomCode) return;
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        ws.playerData.x = msg.x;
        ws.playerData.y = msg.y;
        ws.playerData.state = msg.state; // 'idle'|'run'|'jump'|'hit'

        // Relay to opponent
        const opponentIdx = 1 - ws.playerIndex;
        room.sendTo(opponentIdx, {
          type: 'opponentMove',
          x: msg.x, y: msg.y,
          state: msg.state,
          facing: msg.facing,
        });
        break;
      }

      // Player hit/jump action
      case 'playerAction': {
        if (!ws.roomCode) return;
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        const opponentIdx = 1 - ws.playerIndex;
        room.sendTo(opponentIdx, {
          type: 'opponentAction',
          action: msg.action,
        });
        break;
      }

      case 'rematch': {
        if (!ws.roomCode) return;
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        room.scores = [0, 0];
        room.ball = room.spawnBall(0);
        room.start();
        room.broadcast({ type: 'gameStart', scores: [0, 0] });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!ws.roomCode) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    room.stop();
    room.broadcast({ type: 'opponentLeft' });
    rooms.delete(ws.roomCode);
    console.log(`Room ${ws.roomCode} closed`);
  });
});

server.listen(PORT, () => {
  console.log(`🐱 Kitten Tennis server running on http://localhost:${PORT}`);
});
