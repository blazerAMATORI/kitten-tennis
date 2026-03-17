const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, '../docs', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html':'text/html','.css':'text/css','.js':'application/javascript',
    '.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.ico':'image/x-icon',
  };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

const GW = 1280, GH = 720;
const GROUND_Y  = GH - 80;
const NET_X     = GW / 2;
const NET_H     = 160;
const BALL_R    = 22;
const GRAVITY   = 500;
const BOUNCE    = 0.82;
const TICK_MS   = 1000 / 60;
const WIN_SCORE = 12;
const GOAL_W    = 28;
const GOAL_TOP  = GROUND_Y - 100;

class Room {
  constructor(code) {
    this.code = code;
    this.players = [];
    this.nicks = ['Игрок 1', 'Игрок 2'];
    this.scores = [0, 0];
    this.hits = [0, 0];
    this.ball = this.spawnBall(0);
    this.ballActive = false;
    this.gameActive = false;
    this.tickInterval = null;
    this.rallyCount = 0;
    this.lastServeSide = 0;
  }

  spawnBall(side) {
    const dir = side === 0 ? 1 : -1;
    return { x: GW/2, y: GROUND_Y - 200, vx: dir*260, vy: -280 };
  }

  start() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.gameActive = true;
    this.ballActive = false;
    let last = Date.now();
    this.tickInterval = setInterval(() => {
      const now = Date.now();
      this.tick(Math.min((now-last)/1000, 0.05));
      last = now;
    }, TICK_MS);
    this.scheduleServe(this.lastServeSide, 3000);
  }

  scheduleServe(side, delay) {
    this.ballActive = false;
    this.ball = this.spawnBall(side);
    this.broadcast({ type:'serveCountdown', delay, x:this.ball.x, y:this.ball.y });
    setTimeout(() => {
      if (!this.gameActive) return;
      this.ballActive = true;
      this.broadcast({ type:'respawn', x:this.ball.x, y:this.ball.y, vx:this.ball.vx, vy:this.ball.vy });
    }, delay);
  }

  stop() {
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    this.gameActive = false; this.ballActive = false;
  }

  tick(dt) {
    if (!this.gameActive || !this.ballActive) return;
    const b = this.ball;
    b.vy += GRAVITY * dt;
    b.x  += b.vx * dt;
    b.y  += b.vy * dt;

    // Потолок
    if (b.y - BALL_R <= 0) { b.y = BALL_R; b.vy = Math.abs(b.vy)*0.7; }

    // Земля
    if (b.y + BALL_R >= GROUND_Y) {
      b.y = GROUND_Y - BALL_R;
      b.vy *= -BOUNCE; b.vx *= 0.97;
      if (Math.abs(b.vy) < 30) b.vy = 0;
      this.broadcast({ type:'bounce', kind:'ground', x:b.x, y:b.y });
    }

    // Сетка
    const netTop = GROUND_Y - NET_H;
    if (b.x-BALL_R < NET_X+10 && b.x+BALL_R > NET_X-10 && b.y+BALL_R > netTop) {
      b.x = b.vx>0 ? NET_X-10-BALL_R : NET_X+10+BALL_R;
      b.vx *= -0.68;
      this.broadcast({ type:'bounce', kind:'net', x:b.x, y:b.y });
    }

    // Игроки — круговая коллизия
    this.players.forEach((ws, idx) => {
      const pd = ws.playerData; if (!pd) return;
      const dx = b.x - pd.x, dy = b.y - (pd.y - 10);
      const dist = Math.sqrt(dx*dx + dy*dy);
      const minDist = BALL_R + 28;
      if (dist < minDist && dist > 0) {
        const nx = dx/dist, ny = dy/dist;
        b.x = pd.x + nx*(minDist+1);
        b.y = (pd.y-10) + ny*(minDist+1);
        const dot = b.vx*nx + b.vy*ny;
        b.vx -= 2*dot*nx; b.vy -= 2*dot*ny;
        const boost = 1.08 + Math.min(this.rallyCount*0.012, 0.3);
        b.vx *= boost; b.vy = Math.min(b.vy*boost, -200);
        if (idx===0 && b.vx < 80)  b.vx = 80 + Math.abs(b.vx);
        if (idx===1 && b.vx > -80) b.vx = -(80 + Math.abs(b.vx));
        b.vx = Math.max(-700, Math.min(700, b.vx));
        b.vy = Math.max(-650, b.vy);
        this.hits[idx]++;
        this.rallyCount++;
        this.broadcast({ type:'hit', player:idx, x:b.x, y:b.y, rally:this.rallyCount });
      }
    });

    // Левая стена
    if (b.x - BALL_R <= GOAL_W) {
      if (b.y > GOAL_TOP) {
        // Гол — но только если НЕ P1 последний касался (антисамогол)
        this.score(1); return;
      } else {
        b.x = GOAL_W + BALL_R; b.vx = Math.abs(b.vx)*0.82;
        this.broadcast({ type:'bounce', kind:'wall', x:b.x, y:b.y });
      }
    }

    // Правая стена
    if (b.x + BALL_R >= GW - GOAL_W) {
      if (b.y > GOAL_TOP) {
        this.score(0); return;
      } else {
        b.x = GW - GOAL_W - BALL_R; b.vx = -Math.abs(b.vx)*0.82;
        this.broadcast({ type:'bounce', kind:'wall', x:b.x, y:b.y });
      }
    }

    this.broadcast({ type:'ballUpdate', x:b.x, y:b.y, vx:b.vx, vy:b.vy, t:Date.now() });
  }

  score(scorer) {
    this.ballActive = false; this.rallyCount = 0;
    this.scores[scorer]++;
    this.broadcast({ type:'score', scores:this.scores, scorer, hits:this.hits });
    if (this.scores[scorer] >= WIN_SCORE) {
      this.stop();
      this.broadcast({ type:'gameOver', winner:scorer, scores:this.scores, hits:this.hits, nicks:this.nicks });
      return;
    }
    this.lastServeSide = 1 - scorer;
    this.scheduleServe(this.lastServeSide, 3000);
  }

  broadcast(msg) {
    const d = JSON.stringify(msg);
    this.players.forEach(ws => { if (ws.readyState===WebSocket.OPEN) ws.send(d); });
  }
  sendTo(idx, msg) {
    const ws = this.players[idx];
    if (ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
}

function genCode() {
  const ch='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code;
  do { code='KITTEN'+Array.from({length:3},()=>ch[Math.floor(Math.random()*ch.length)]).join(''); }
  while(rooms.has(code)); return code;
}

wss.on('connection', ws => {
  ws.playerData = { x:200, y:GROUND_Y-40 };
  ws.roomCode = null; ws.playerIndex = -1;

  ws.on('message', raw => {
    let msg; try { msg=JSON.parse(raw); } catch { return; }
    switch(msg.type) {
      case 'createRoom': {
        const code=genCode(), room=new Room(code);
        rooms.set(code,room);
        if (msg.nick) room.nicks[0] = msg.nick.slice(0,16)||'Игрок 1';
        ws.playerData.x=220; ws.playerData.y=GROUND_Y-40;
        room.players.push(ws); ws.roomCode=code; ws.playerIndex=0;
        ws.send(JSON.stringify({type:'roomCreated',code,playerIndex:0,nick:room.nicks[0]}));
        console.log('Room:',code); break;
      }
      case 'joinRoom': {
        const code=(msg.code||'').toUpperCase().trim(), room=rooms.get(code);
        if (!room){ws.send(JSON.stringify({type:'error',message:'Комната не найдена!'}));return;}
        if (room.players.length>=2){ws.send(JSON.stringify({type:'error',message:'Комната полная!'}));return;}
        if (msg.nick) room.nicks[1] = msg.nick.slice(0,16)||'Игрок 2';
        ws.playerData.x=GW-220; ws.playerData.y=GROUND_Y-40;
        room.players.push(ws); ws.roomCode=code; ws.playerIndex=1;
        ws.send(JSON.stringify({type:'roomJoined',code,playerIndex:1,nick:room.nicks[1]}));
        room.sendTo(0,{type:'opponentJoined',nick:room.nicks[1]});
        room.start();
        room.broadcast({type:'gameStart',scores:[0,0],nicks:room.nicks});
        console.log('Game started:',code); break;
      }
      case 'playerMove': {
        if (!ws.roomCode) return;
        const room=rooms.get(ws.roomCode); if (!room) return;
        ws.playerData.x=msg.x; ws.playerData.y=msg.y;
        room.sendTo(1-ws.playerIndex,{type:'opponentMove',x:msg.x,y:msg.y,state:msg.state,facing:msg.facing}); break;
      }
      case 'rematch': {
        if (!ws.roomCode) return;
        const room=rooms.get(ws.roomCode); if (!room) return;
        room.scores=[0,0]; room.hits=[0,0]; room.rallyCount=0; room.lastServeSide=0;
        room.start(); room.broadcast({type:'gameStart',scores:[0,0],nicks:room.nicks}); break;
      }
    }
  });

  ws.on('close', () => {
    if (!ws.roomCode) return;
    const room=rooms.get(ws.roomCode); if (!room) return;
    room.stop(); room.broadcast({type:'opponentLeft'}); rooms.delete(ws.roomCode);
  });
});

server.listen(PORT, () => console.log(`🐱 Kitten Tennis on http://localhost:${PORT}`));
