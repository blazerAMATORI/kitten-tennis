const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;

// ── Static file server ────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url;
  const file = path.join(__dirname, '../docs', url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

// ── Physics constants (must match client!) ────────────────────────────────────
const GW = 1280, GH = 720, GY = GH - 90;
const NX = GW / 2, NH = 150;
const BR = 28;  // ИСПРАВЛЕНО: было 22
const GRAV = 520, BOUNCE = 0.78;  // ИСПРАВЛЕНО: было 0.80
const GOAL_W = 32, GOAL_TOP = GY - 115;
const WIN = 12;
const TICK = 1000 / 60;

// ── Room ──────────────────────────────────────────────────────────────────────
class Room {
  constructor(code, isBot = false) {
    this.code = code;
    this.isBot = isBot;
    this.sockets = [];
    this.nicks = ['Игрок 1', isBot ? 'BOT 🤖' : 'Игрок 2'];
    this.scores = [0, 0];
    this.hits = [0, 0];
    this.ball = null;
    this.ballActive = false;
    this.rallyCount = 0;
    this.interval = null;
    this.alive = true;
    
    // Bot AI
    this.botX = GW - 220;
    this.botY = GY - 40;
  }

  spawnBall(side) {
    const dir = side === 0 ? 1 : -1;
    return { x: GW / 2, y: GY - 220, vx: dir * 260, vy: -300 };
  }

  startGame() {
    if (this.interval) clearInterval(this.interval);
    this.alive = true;
    this.ballActive = false;
    let last = Date.now();
    this.interval = setInterval(() => {
      const now = Date.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      this.tick(dt);
    }, TICK);
    this.serveBall(0, 3000);
  }

  serveBall(side, delay) {
    this.ballActive = false;
    this.ball = this.spawnBall(side);
    this.broadcast({ type: 'countdown', ms: delay, bx: this.ball.x, by: this.ball.y });
    setTimeout(() => {
      if (!this.alive) return;
      this.ballActive = true;
      this.broadcast({ type: 'serve', bx: this.ball.x, by: this.ball.y, vx: this.ball.vx, vy: this.ball.vy });
    }, delay);
  }

  stopGame() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    this.alive = false;
    this.ballActive = false;
  }

  // ── BOT AI ────────────────────────────────────────────────────────────────
  updateBotAI(ballX, ballY) {
    if (!this.isBot) return;
    
    // Simple bot: track ball, try to hit it back
    const targetX = ballX < NX ? GW - 220 : Math.max(300, Math.min(GW - 300, ballX + 80));
    const moveDir = Math.sign(targetX - this.botX);
    const moveSpeed = 250;
    
    if (Math.abs(targetX - this.botX) > 20) {
      this.botX += moveDir * moveSpeed * (1 / 60);
    }
    
    // Jump when ball approaches
    if (Math.abs(ballX - this.botX) < 100 && Math.abs(ballY - this.botY) < 150 && ballY > GY - 180) {
      this.botY = Math.max(GY - 200, this.botY - 8);
    } else {
      this.botY = Math.min(GY - 40, this.botY + 8);
    }
    
    this.botX = Math.max(200, Math.min(GW - 200, this.botX));
  }

  tick(dt) {
    if (!this.ballActive || !this.ball) return;
    const b = this.ball;

    // Physics
    b.vy += GRAV * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Ceiling
    if (b.y - BR < 0) { b.y = BR; b.vy = Math.abs(b.vy) * 0.7; }

    // Ground bounce
    if (b.y + BR > GY) {
      b.y = GY - BR;
      b.vy *= -BOUNCE;
      b.vx *= 0.97;
      if (Math.abs(b.vy) < 30) b.vy = 0;
      this.broadcast({ type: 'bounce', kind: 'ground', bx: b.x, by: b.y });
    }

    // Net
    const netTop = GY - NH;
    if (b.x - BR < NX + 10 && b.x + BR > NX - 10 && b.y + BR > netTop) {
      b.x = b.vx > 0 ? NX - 10 - BR : NX + 10 + BR;
      b.vx *= -0.65;
      this.broadcast({ type: 'bounce', kind: 'net', bx: b.x, by: b.y });
    }

    // Player collisions (circle vs circle) - ИСПРАВЛЕНО
    this.sockets.forEach((ws, i) => {
      const p = ws.pd; if (!p) return;
      const dx = b.x - p.x, dy = b.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minD = BR + 30;
      if (dist < minD && dist > 0.1) {  // Prevent division by zero
        const nx = dx / dist, ny = dy / dist;
        // Push ball out firmly
        b.x = p.x + nx * (minD + 2);
        b.y = p.y + ny * (minD + 2);
        // Reflect velocity
        const dot = b.vx * nx + b.vy * ny;
        b.vx = (b.vx - 2 * dot * nx) * 0.95;
        b.vy = (b.vy - 2 * dot * ny) * 0.95;
        // Boost
        const boost = 1.08 + Math.min(this.rallyCount * 0.012, 0.28);
        b.vx *= boost;
        b.vy = Math.min(b.vy * boost, -190);
        // Always send toward opponent
        if (i === 0 && b.vx < 60) b.vx = 60 + Math.abs(b.vx);
        if (i === 1 && b.vx > -60) b.vx = -(60 + Math.abs(b.vx));
        // Speed cap
        b.vx = Math.max(-680, Math.min(680, b.vx));
        this.rallyCount++;
        this.hits[i]++;
        this.broadcast({ type: 'hit', player: i, bx: b.x, by: b.y, rally: this.rallyCount });
      }
    });

    // BOT collision
    if (this.isBot && this.sockets.length > 0) {
      const dx = b.x - this.botX, dy = b.y - this.botY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minD = BR + 30;
      if (dist < minD && dist > 0.1) {
        const nx = dx / dist, ny = dy / dist;
        b.x = this.botX + nx * (minD + 2);
        b.y = this.botY + ny * (minD + 2);
        const dot = b.vx * nx + b.vy * ny;
        b.vx = (b.vx - 2 * dot * nx) * 0.95;
        b.vy = (b.vy - 2 * dot * ny) * 0.95;
        const boost = 1.08 + Math.min(this.rallyCount * 0.012, 0.28);
        b.vx *= boost;
        b.vy = Math.min(b.vy * boost, -190);
        if (b.vx > -60) b.vx = -(60 + Math.abs(b.vx));
        b.vx = Math.max(-680, Math.min(680, b.vx));
        this.rallyCount++;
        this.hits[1]++;
        this.broadcast({ type: 'hit', player: 1, bx: b.x, by: b.y, rally: this.rallyCount });
      }
    }

    // Bot AI update
    if (this.isBot) this.updateBotAI(b.x, b.y);

    // ── Goals ──
    if (b.x - BR <= GOAL_W && b.y > GOAL_TOP) { this.goal(1); return; }
    if (b.x - BR <= GOAL_W) { b.x = GOAL_W + BR; b.vx = Math.abs(b.vx) * 0.82; }

    if (b.x + BR >= GW - GOAL_W && b.y > GOAL_TOP) { this.goal(0); return; }
    if (b.x + BR >= GW - GOAL_W) { b.x = GW - GOAL_W - BR; b.vx = -Math.abs(b.vx) * 0.82; }

    this.broadcast({ type: 'ball', bx: b.x, by: b.y, vx: b.vx, vy: b.vy, t: Date.now() });
  }

  goal(scorer) {
    this.ballActive = false;
    this.rallyCount = 0;
    this.scores[scorer]++;
    this.broadcast({ type: 'score', scores: this.scores, scorer });

    if (this.scores[scorer] >= WIN) {
      this.stopGame();
      this.broadcast({ type: 'gameover', winner: scorer, scores: this.scores, hits: this.hits, nicks: this.nicks });
      return;
    }
    this.serveBall(1 - scorer, 3000);
  }

  broadcast(msg) {
    const s = JSON.stringify(msg);
    this.sockets.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(s); });
  }

  send(idx, msg) {
    const ws = this.sockets[idx];
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
}

// ── Room code generator ───────────────────────────────────────────────────────
function makeCode() {
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = 'CAT' + Array.from({ length: 4 }, () => ch[Math.floor(Math.random() * ch.length)]).join(''); }
  while (rooms.has(c));
  return c;
}

// ── WebSocket handler ─────────────────────────────────────────────────────────
wss.on('connection', ws => {
  ws.pd = { x: 200, y: GY - 40 };

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }

    if (m.type === 'create') {
      const code = makeCode();
      const room = new Room(code, false);
      rooms.set(code, room);
      ws.room = room;
      ws.pi = 0;
      ws.pd.x = 220;
      room.sockets[0] = ws;
      if (m.nick) room.nicks[0] = m.nick.slice(0, 16);
      ws.send(JSON.stringify({ type: 'created', code, pi: 0, nick: room.nicks[0] }));
      console.log('Room created:', code);
    }

    else if (m.type === 'join') {
      const code = (m.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) { ws.send(JSON.stringify({ type: 'err', msg: 'Комната не найдена!' })); return; }
      if (room.sockets.length >= 2 && room.sockets[1]) { ws.send(JSON.stringify({ type: 'err', msg: 'Комната занята!' })); return; }
      ws.room = room;
      ws.pi = 1;
      ws.pd.x = GW - 220;
      room.sockets[1] = ws;
      if (m.nick) room.nicks[1] = m.nick.slice(0, 16);
      ws.send(JSON.stringify({ type: 'joined', code, pi: 1, nicks: room.nicks }));
      room.send(0, { type: 'opponent', nick: room.nicks[1] });
      room.startGame();
      room.broadcast({ type: 'start', nicks: room.nicks, scores: [0, 0] });
      console.log('Game started:', code);
    }

    else if (m.type === 'move') {
      if (!ws.room) return;
      ws.pd.x = m.x; ws.pd.y = m.y;
      ws.room.send(1 - ws.pi, { type: 'pmove', pi: ws.pi, x: m.x, y: m.y, state: m.state, facing: m.facing });
    }

    else if (m.type === 'rematch') {
      if (!ws.room) return;
      ws.room.scores = [0, 0]; ws.room.hits = [0, 0]; ws.room.rallyCount = 0;
      ws.room.startGame();
      ws.room.broadcast({ type: 'start', nicks: ws.room.nicks, scores: [0, 0] });
    }
  });

  ws.on('close', () => {
    if (!ws.room) return;
    ws.room.stopGame();
    ws.room.broadcast({ type: 'left' });
    rooms.delete(ws.room.code);
  });
});

server.listen(PORT, () => console.log(`🐱 Kitten Tennis v2.1 on http://localhost:${PORT}`));
