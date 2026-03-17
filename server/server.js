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

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, '../docs', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

const GAME_WIDTH  = 800;
const GAME_HEIGHT = 450;
const GROUND_Y    = GAME_HEIGHT - 60;
const NET_X       = GAME_WIDTH / 2;
const NET_HEIGHT  = 110;
const BALL_RADIUS = 22;
const GRAVITY     = 320;
const BALL_BOUNCE = 0.88;
const TICK_RATE   = 60;
const TICK_MS     = 1000 / TICK_RATE;
const WIN_SCORE   = 7;

class Room {
  constructor(code) {
    this.code = code;
    this.players = [];
    this.scores = [0, 0];
    this.ball = this.spawnBall(0);
    this.ballActive = false;
    this.gameActive = false;
    this.tickInterval = null;
    this.rallyCount = 0;
    this.lastServeSide = 0;
  }

  spawnBall(towardSide) {
    const dir = towardSide === 0 ? 1 : -1;
    return { x: GAME_WIDTH/2, y: GAME_HEIGHT/2 - 50, vx: dir*180, vy: -220 };
  }

  start() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.gameActive = true;
    this.ballActive = false;
    let lastTime = Date.now();
    this.tickInterval = setInterval(() => {
      const now = Date.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      this.tick(dt);
    }, TICK_MS);
    this.scheduleServe(this.lastServeSide, 3000);
  }

  scheduleServe(side, delay) {
    this.ballActive = false;
    this.ball = this.spawnBall(side);
    this.broadcast({ type: 'serveCountdown', delay, x: this.ball.x, y: this.ball.y });
    setTimeout(() => {
      if (!this.gameActive) return;
      this.ballActive = true;
      this.broadcast({ type: 'respawn', x: this.ball.x, y: this.ball.y, vx: this.ball.vx, vy: this.ball.vy });
    }, delay);
  }

  stop() {
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    this.gameActive = false;
    this.ballActive = false;
  }

  tick(dt) {
    if (!this.gameActive || !this.ballActive) return;
    const b = this.ball;
    b.vy += GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.y + BALL_RADIUS >= GROUND_Y) {
      b.y = GROUND_Y - BALL_RADIUS;
      b.vy *= -BALL_BOUNCE;
      b.vx *= 0.96;
      if (Math.abs(b.vy) < 20) b.vy = 0;
      this.broadcast({ type: 'bounce', kind: 'ground', x: b.x, y: b.y });
    }
    if (b.y - BALL_RADIUS <= 0) { b.y = BALL_RADIUS; b.vy *= -0.75; }

    const netTop = GROUND_Y - NET_HEIGHT;
    if (b.x - BALL_RADIUS < NET_X+8 && b.x + BALL_RADIUS > NET_X-8 && b.y + BALL_RADIUS > netTop) {
      b.x = b.vx > 0 ? NET_X-8-BALL_RADIUS : NET_X+8+BALL_RADIUS;
      b.vx *= -0.65;
      this.broadcast({ type: 'bounce', kind: 'net', x: b.x, y: b.y });
    }

    this.players.forEach((ws, idx) => {
      const pd = ws.playerData;
      if (!pd) return;
      const pw=52, ph=64;
      const cx = Math.max(pd.x-pw/2, Math.min(b.x, pd.x+pw/2));
      const cy = Math.max(pd.y-ph/2, Math.min(b.y, pd.y+ph/2));
      const dx=b.x-cx, dy=b.y-cy;
      if (dx*dx+dy*dy < BALL_RADIUS*BALL_RADIUS) {
        const dist=Math.sqrt(dx*dx+dy*dy)||1;
        const nx=dx/dist, ny=dy/dist;
        b.x=cx+nx*(BALL_RADIUS+1); b.y=cy+ny*(BALL_RADIUS+1);
        const dot=b.vx*nx+b.vy*ny;
        b.vx=b.vx-2*dot*nx; b.vy=b.vy-2*dot*ny;
        const boost=1.1+Math.min(this.rallyCount*0.015,0.25);
        b.vx*=boost; b.vy=Math.min(b.vy,-150);
        if (idx===0 && b.vx<0) b.vx*=-1;
        if (idx===1 && b.vx>0) b.vx*=-1;
        b.vx=Math.max(-550,Math.min(550,b.vx));
        this.rallyCount++;
        this.broadcast({ type:'hit', player:idx, x:b.x, y:b.y });
      }
    });

    if (b.x+BALL_RADIUS < 0) { this.score(1); return; }
    if (b.x-BALL_RADIUS > GAME_WIDTH) { this.score(0); return; }

    this.broadcast({ type:'ballUpdate', x:b.x, y:b.y, vx:b.vx, vy:b.vy, t:Date.now() });
  }

  score(scoringPlayer) {
    this.ballActive = false;
    this.rallyCount = 0;
    this.scores[scoringPlayer]++;
    this.broadcast({ type:'score', scores:this.scores, scorer:scoringPlayer });
    if (this.scores[scoringPlayer] >= WIN_SCORE) {
      this.stop();
      this.broadcast({ type:'gameOver', winner:scoringPlayer, scores:this.scores });
      return;
    }
    this.lastServeSide = 1 - scoringPlayer;
    this.scheduleServe(this.lastServeSide, 3000);
  }

  broadcast(msg) {
    const data=JSON.stringify(msg);
    this.players.forEach(ws=>{ if(ws.readyState===WebSocket.OPEN) ws.send(data); });
  }
  sendTo(idx, msg) {
    const ws=this.players[idx];
    if(ws&&ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
}

function generateCode() {
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code='KITTEN'+Array.from({length:3},()=>chars[Math.floor(Math.random()*chars.length)]).join(''); }
  while(rooms.has(code));
  return code;
}

wss.on('connection', (ws) => {
  ws.playerData = { x:100, y:GROUND_Y-32, hitting:false };
  ws.roomCode = null;

  ws.on('message', (raw) => {
    let msg; try { msg=JSON.parse(raw); } catch { return; }
    switch(msg.type) {
      case 'createRoom': {
        const code=generateCode(), room=new Room(code);
        rooms.set(code,room);
        ws.playerData.x=180; ws.playerData.y=GROUND_Y-32;
        room.players.push(ws); ws.roomCode=code; ws.playerIndex=0;
        ws.send(JSON.stringify({type:'roomCreated',code,playerIndex:0}));
        console.log(`Room created: ${code}`); break;
      }
      case 'joinRoom': {
        const code=(msg.code||'').toUpperCase().trim(), room=rooms.get(code);
        if(!room){ws.send(JSON.stringify({type:'error',message:'Room not found!'}));return;}
        if(room.players.length>=2){ws.send(JSON.stringify({type:'error',message:'Room is full!'}));return;}
        ws.playerData.x=GAME_WIDTH-180; ws.playerData.y=GROUND_Y-32;
        room.players.push(ws); ws.roomCode=code; ws.playerIndex=1;
        ws.send(JSON.stringify({type:'roomJoined',code,playerIndex:1}));
        room.sendTo(0,{type:'opponentJoined'});
        room.start();
        room.broadcast({type:'gameStart',scores:[0,0]});
        console.log(`Game started in room: ${code}`); break;
      }
      case 'playerMove': {
        if(!ws.roomCode)return; const room=rooms.get(ws.roomCode); if(!room)return;
        ws.playerData.x=msg.x; ws.playerData.y=msg.y; ws.playerData.state=msg.state;
        room.sendTo(1-ws.playerIndex,{type:'opponentMove',x:msg.x,y:msg.y,state:msg.state,facing:msg.facing}); break;
      }
      case 'playerAction': {
        if(!ws.roomCode)return; const room=rooms.get(ws.roomCode); if(!room)return;
        room.sendTo(1-ws.playerIndex,{type:'opponentAction',action:msg.action}); break;
      }
      case 'rematch': {
        if(!ws.roomCode)return; const room=rooms.get(ws.roomCode); if(!room)return;
        room.scores=[0,0]; room.rallyCount=0; room.lastServeSide=0;
        room.start(); room.broadcast({type:'gameStart',scores:[0,0]}); break;
      }
    }
  });

  ws.on('close', () => {
    if(!ws.roomCode)return; const room=rooms.get(ws.roomCode); if(!room)return;
    room.stop(); room.broadcast({type:'opponentLeft'}); rooms.delete(ws.roomCode);
    console.log(`Room ${ws.roomCode} closed`);
  });
});

server.listen(PORT, () => { console.log(`🐱 Kitten Tennis server running on http://localhost:${PORT}`); });
