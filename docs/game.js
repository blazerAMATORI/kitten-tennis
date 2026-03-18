'use strict';

// ══════════════════════════════════════════════════════════════════════════════
//  CONSTANTS  (must match server.js!)
// ══════════════════════════════════════════════════════════════════════════════
const GW = 1280, GH = 720, GY = GH - 90;
const NX = GW / 2, NH = 150;
const BR = 28;  // ИСПРАВЛЕНО: Мяч теперь больше (было 22)
const GRAV = 520, BOUNCE = 0.78;
const P_SPD = 310, P_JUMP = -450, P_FALL = 680;  // ИСПРАВЛЕНО: Прыжок меньше (было -580)
const GOAL_W = 32, GOAL_TOP = GY - 115;
const WIN = 12;
const STEP = 1 / 60;

// ══════════════════════════════════════════════════════════════════════════════
//  SKINS (Скины для персонажей)
// ══════════════════════════════════════════════════════════════════════════════
const SKINS = {
  cat1: { name: '😸 Кот', color: '#f4a460', eye: '#000' },
  cat2: { name: '😺 Улыбка', color: '#e8b75f', eye: '#008000' },
  cat3: { name: '😻 Влюблённый', color: '#ff69b4', eye: '#ff1493' },
  dog: { name: '🐕 Щенок', color: '#8b4513', eye: '#ffb347' },
  panda: { name: '🐼 Панда', color: '#000', eye: '#fff' },
};

let CURRENT_SKINS = { 0: 'cat1', 1: 'cat2' };  // Выбранные скины по умолчанию
let IS_BOT_MODE = false;  // Режим с ботом

// ══════════════════════════════════════════════════════════════════════════════
//  WIN PHRASES
// ══════════════════════════════════════════════════════════════════════════════
const PHRASES = [
  '{W} размазал {L} по корту!',
  '{W} разнёс {L} в пух и прах!',
  '{L} и близко не подошёл к {W}!',
  '{W} — король корта!',
  '{W} гонял {L} как мячик!',
  '{L} плачет, {W} празднует!',
  '{W} втоптал {L} в траву!',
  '{W} показал мастер-класс {L}!',
  '{L} позорно проиграл {W}!',
  '{W} уничтожил {L} со счётом!',
];
function getPhrase(w, l) {
  return PHRASES[Math.floor(Math.random() * PHRASES.length)]
    .replace(/{W}/g, w).replace(/{L}/g, l);
}

let NICKS = ['Игрок 1', 'Игрок 2'];

// ══════════════════════════════════════════════════════════════════════════════
//  AUDIO
// ══════════════════════════════════════════════════════════════════════════════
const SFX = (() => {
  let ctx;
  const ac = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); return ctx; };
  const sounds = {
    hit:    (a, t) => { a.type='sine';    a.freq(500, 200, .14); a.vol(.4, .16); },
    bounce: (a, t) => { a.type='triangle';a.freq(170,  65, .09); a.vol(.2, .11); },
    score:  (a, t) => { a.type='square';  a.freqs([523,659,784],.12); a.vol(.2,.5); },
    jump:   (a, t) => { a.type='sine';    a.freq(280, 560, .1);  a.vol(.15,.13); },
  };
  return {
    play(name) {
      try {
        const c = ac(), o = c.createOscillator(), g = c.createGain();
        const t = c.currentTime;
        o.connect(g); g.connect(c.destination);
        const helper = {
          type: '',
          set type(v) { o.type = v; },
          freq(from, to, dur) { o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur); },
          freqs(arr, gap) { arr.forEach((f, i) => o.frequency.setValueAtTime(f, t + i * gap)); },
          vol(from, dur) { g.gain.setValueAtTime(from, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); },
        };
        (sounds[name] || (() => {}))(helper, t);
        o.start(t); o.stop(t + .6);
      } catch (e) {}
    }
  };
})();

// ══════════════════════════════════════════════════════════════════════════════
//  PARTICLES
// ══════════════════════════════════════════════════════════════════════════════
class Particles {
  constructor() { this.list = []; }

  dust(x, y, n = 8) {
    for (let i = 0; i < n; i++)
      this.list.push({ x, y, vx: (Math.random() - .5) * 90, vy: -Math.random() * 55 - 12,
        life: .6, ml: .6, r: 3 + Math.random() * 5, c: '#d4a870' });
  }

  spark(x, y, n = 14, hot = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 2 * i / n + Math.random() * .5;
      const sp = (hot ? 150 : 90) + Math.random() * 110;
      this.list.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life: .45, ml: .45, r: 2 + Math.random() * 5,
        c: hot ? `hsl(${Math.random()*40+10},100%,58%)` : `hsl(${40+Math.random()*50},100%,60%)` });
    }
  }

  update(dt) {
    this.list = this.list.filter(p => {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.life -= dt;
      return p.life > 0;
    });
  }

  draw(ctx) {
    this.list.forEach(p => {
      const a = p.life / p.ml;
      ctx.save();
      ctx.globalAlpha = a * .9;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, p.r * Math.sqrt(a)), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CONFETTI
// ══════════════════════════════════════════════════════════════════════════════
class Confetti {
  constructor(cv) { this.cv = cv; this.cx = cv.getContext('2d'); this.on = false; }

  start() {
    this.on = true;
    const W = this.cv.width = window.innerWidth, H = this.cv.height = window.innerHeight;
    this.bits = Array.from({ length: 180 }, () => ({
      x: Math.random() * W, y: -30 - Math.random() * 200,
      vx: (Math.random() - .5) * 3.5, vy: 1.5 + Math.random() * 4,
      rot: Math.random() * 360, rv: (Math.random() - .5) * 7,
      w: 7 + Math.random() * 9, h: 3 + Math.random() * 5,
      c: `hsl(${Math.random()*360},80%,62%)`,
    }));
    this._loop();
  }

  stop() { this.on = false; this.cx.clearRect(0, 0, this.cv.width, this.cv.height); }

  _loop() {
    if (!this.on) return;
    const c = this.cx, W = this.cv.width, H = this.cv.height;
    c.clearRect(0, 0, W, H);
    this.bits.forEach(b => {
      b.x += b.vx; b.y += b.vy; b.rot += b.rv;
      if (b.y > H + 10) { b.y = -10; b.x = Math.random() * W; }
      c.save(); c.translate(b.x, b.y); c.rotate(b.rot * Math.PI / 180);
      c.fillStyle = b.c; c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); c.restore();
    });
    requestAnimationFrame(() => this._loop());
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  BACKGROUND  (draw once to offscreen canvas)
// ══════════════════════════════════════════════════════════════════════════════
class Background {
  constructor() {
    this.oc = document.createElement('canvas');
    this.oc.width = GW; this.oc.height = GH;
    this._render(this.oc.getContext('2d'));
  }

  _render(c) {
    // Sky
    const sky = c.createLinearGradient(0, 0, 0, GY);
    sky.addColorStop(0, '#42a8de'); sky.addColorStop(1, '#a8d8f0');
    c.fillStyle = sky; c.fillRect(0, 0, GW, GY);

    // ── Tribunes ──
    const tribY = GY - 185;
    const leftW = GW / 2 - 22, rightX = GW / 2 + 22;
    c.fillStyle = '#4a7e30';
    c.fillRect(0, tribY, leftW, 185);
    c.fillRect(rightX, tribY, GW / 2 - 22, 185);

    const seatColors = ['#e84393', '#4488ff', '#ff9922', '#44cc44', '#ff4455', '#aa44ff', '#22ddcc'];
    for (let row = 0; row < 6; row++) {
      const ry = tribY + 8 + row * 28;
      // Left side
      for (let col = 0; col < 19; col++) {
        const cx = 14 + col * 32 + (row % 2 ? 14 : 0);
        if (cx + 12 > leftW) continue;
        c.fillStyle = seatColors[(col * 3 + row * 7) % seatColors.length];
        c.fillRect(cx - 10, ry, 20, 20);
        c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(cx - 10, ry + 14, 20, 6);
      }
      // Right side
      for (let col = 0; col < 19; col++) {
        const cx = rightX + 14 + col * 32 + (row % 2 ? 14 : 0);
        if (cx + 12 > GW) continue;
        c.fillStyle = seatColors[(col * 5 + row * 3 + 2) % seatColors.length];
        c.fillRect(cx - 10, ry, 20, 20);
        c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(cx - 10, ry + 14, 20, 6);
      }
    }
    // Tribune top border
    c.fillStyle = '#2e5e18'; c.fillRect(0, tribY - 10, GW, 13);
    c.fillStyle = '#1e4e0a'; c.fillRect(0, tribY - 16, GW, 8);

    // Clouds
    [[150, 52, 54], [395, 36, 44], [690, 60, 52], [970, 40, 42], [1160, 56, 48]].forEach(([x, y, s]) => {
      c.fillStyle = 'rgba(255,255,255,.84)';
      c.beginPath();
      c.arc(x, y, s * .62, 0, Math.PI * 2); c.arc(x + s * .52, y + 5, s * .5, 0, Math.PI * 2);
      c.arc(x - s * .46, y + 8, s * .44, 0, Math.PI * 2); c.arc(x + s * .24, y + 14, s * .48, 0, Math.PI * 2);
      c.fill();
    });

    // Ground
    const g = c.createLinearGradient(0, GY - 4, 0, GH);
    g.addColorStop(0, '#5cb83a'); g.addColorStop(.08, '#4aa028'); g.addColorStop(1, '#2e7010');
    c.fillStyle = g; c.fillRect(0, GY - 4, GW, GH - GY + 4);
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, GY - 4); c.lineTo(GW, GY - 4); c.stroke();
    // Court dashes
    c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 2; c.setLineDash([12, 10]);
    [[GW * .22], [GW * .78]].forEach(([x]) => {
      c.beginPath(); c.moveTo(x, GY - 4); c.lineTo(x, GH); c.stroke();
    });
    c.setLineDash([]);
  }

  draw(ctx) {
    ctx.drawImage(this.oc, 0, 0);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PLAYER
// ══════════════════════════════════════════════════════════════════════════════
class Player {
  constructor(x, y, skinKey = 'cat1') {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.w = 30; this.h = 50;
    this.onGround = false;
    this.state = 'idle'; this.facing = 1;
    this.hitT = 0;
    this.tx = x; this.ty = y; this.tState = 'idle'; this.tFacing = 1;
    this.skinKey = skinKey;
  }

  setTarget(tx, ty, state, facing) {
    this.tx = tx; this.ty = ty; this.tState = state; this.tFacing = facing;
  }

  triggerHit() { this.hitT = 0.15; }

  update(dt, keys) {
    // Smooth lerp to target
    const lerpSpeed = 0.2;
    this.x += (this.tx - this.x) * lerpSpeed;
    this.y += (this.ty - this.y) * lerpSpeed;
    this.state = this.tState;
    this.facing = this.tFacing;

    // Ground detection
    this.onGround = this.y + this.h / 2 >= GY - 10;

    // Gravity
    if (!this.onGround) this.vy += GRAV * dt;
    else this.vy = Math.max(this.vy, 0);

    this.y += this.vy * dt;

    // Clamp to ground
    if (this.y + this.h / 2 > GY) { this.y = GY - this.h / 2; this.vy = 0; this.onGround = true; }

    // Clamp to bounds
    this.x = Math.max(this.w / 2, Math.min(GW - this.w / 2, this.x));

    this.hitT = Math.max(0, this.hitT - dt);
  }

  draw(ctx) {
    const skin = SKINS[this.skinKey] || SKINS.cat1;
    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.hitT > 0) {
      const scale = 1 + this.hitT * 0.3;
      ctx.scale(scale, scale);
    }

    // Body
    ctx.fillStyle = skin.color;
    ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);

    // Head
    ctx.beginPath();
    ctx.arc(0, -this.h / 2 - 8, 14, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = skin.eye;
    ctx.beginPath();
    ctx.arc(-6, -this.h / 2 - 10, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, -this.h / 2 - 10, 3, 0, Math.PI * 2);
    ctx.fill();

    // Smile
    ctx.strokeStyle = skin.eye;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -this.h / 2 - 7, 4, 0, Math.PI);
    ctx.stroke();

    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  BALL
// ══════════════════════════════════════════════════════════════════════════════
class Ball {
  constructor() {
    this.x = GW / 2; this.y = GY - 220;
    this.vx = 0; this.vy = 0;
    this.visible = false;
    this.tx = this.x; this.ty = this.y; this.tvx = 0; this.tvy = 0;
  }

  setTarget(tx, ty, tvx, tvy) {
    this.tx = tx; this.ty = ty; this.tvx = tvx; this.tvy = tvy;
  }

  teleport(x, y, vx, vy) {
    this.x = this.tx = x; this.y = this.ty = y;
    this.vx = this.tvx = vx; this.vy = this.tvy = vy;
  }

  update(dt) {
    if (!this.visible) return;
    const lerpSpeed = 0.12;
    this.x += (this.tx - this.x) * lerpSpeed;
    this.y += (this.ty - this.y) * lerpSpeed;
    this.vx += (this.tvx - this.vx) * lerpSpeed;
    this.vy += (this.tvy - this.vy) * lerpSpeed;
  }

  draw(ctx) {
    if (!this.visible) return;
    ctx.save();
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(this.x, this.y, BR, 0, Math.PI * 2);
    ctx.fill();
    // Блеск
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath();
    ctx.arc(this.x - BR / 3, this.y - BR / 3, BR / 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  GAME
// ══════════════════════════════════════════════════════════════════════════════
class Game {
  constructor(cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d', { alpha: false });
    cv.width = GW; cv.height = GH;

    this.bg = new Background();
    this.ball = new Ball();
    this.players = [null, null];
    this.ps = new Particles();

    this.localIdx = 0;
    this.roomCode = '';
    this.scores = [0, 0];
    this.combo = document.getElementById('combo');
    this.rally = 0;
    this.respawnT = 0;
    this.scoreFlash = { on: false, t: 0, who: -1 };
    this.running = false;
    this.lastT = Date.now();

    this._keyState = {};
    this._setupKeys();
    this._setupLoop();
  }

  _setupKeys() {
    // ИСПРАВЛЕНО: Поддержка русской раскладки и стандартных клавиш
    const keyMap = {
      // P1: A/D (или Ф/В на русской раскладке)
      'a': 'left', 'ф': 'left',
      'd': 'right', 'в': 'right',
      ' ': 'jump',
      's': 'down', 'ы': 'down',
      // P2: стрелки
      'arrowleft': 'left', 'arrowright': 'right', 'arrowup': 'jump', 'arrowdown': 'down',
    };

    const handleKey = (e, down) => {
      const key = e.key.toLowerCase();
      const action = keyMap[key];
      if (action) {
        this._keyState[action] = down;
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', e => handleKey(e, true));
    window.addEventListener('keyup', e => handleKey(e, false));
  }

  _setupLoop() {
    const tick = () => {
      const now = Date.now();
      const dt = Math.min((now - this.lastT) / 1000, 0.05);
      this.lastT = now;

      if (this.running) {
        this._update(dt);
      }
      this._draw();
      requestAnimationFrame(tick);
    };
    tick();
  }

  _update(dt) {
    const keys = this._keyState;
    const p = this.players[this.localIdx];
    if (p) {
      let moveX = 0;
      if (keys.left) moveX -= P_SPD;
      if (keys.right) moveX += P_SPD;

      p.vx = moveX;
      if (keys.jump && p.onGround) {
        p.vy = P_JUMP;
        p.onGround = false;
        SFX.play('jump');
      }

      const newState = moveX !== 0 ? 'run' : 'idle';
      const newFacing = moveX > 0 ? 1 : moveX < 0 ? -1 : p.facing;

      const moveData = {
        x: p.x + moveX * dt,
        y: p.y,
        state: newState,
        facing: newFacing,
      };
      moveData.x = Math.max(p.w / 2, Math.min(GW - p.w / 2, moveData.x));
      p.tx = moveData.x;
      p.tState = newState;
      p.tFacing = newFacing;

      SocketManager.move(moveData);
      p.update(dt, keys);
    }

    // Update remote player
    const remote = this.players[1 - this.localIdx];
    if (remote) remote.update(dt, {});

    // Update ball
    this.ball.update(dt);
    this.ps.update(dt);

    // Update respawn timer
    if (this.respawnT > 0) this.respawnT -= dt;
    if (this.scoreFlash.on) this.scoreFlash.t -= dt;
    if (this.scoreFlash.t <= 0) this.scoreFlash.on = false;
  }

  _draw() {
    const ctx = this.ctx;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, GW, GH);

    this.bg.draw(ctx);

    // Draw court lines
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(NX, GY - NH);
    ctx.lineTo(NX, GY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw players
    this.players.forEach(p => p?.draw(ctx));

    // Draw ball
    this.ball.draw(ctx);

    // Draw goal zones
    this._drawGoals(ctx);
    this._drawNet(ctx);

    // Draw particles
    this.ps.draw(ctx);

    // Respawn timer
    if (this.respawnT > 0) {
      ctx.save();
      ctx.font = 'bold 48px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.textAlign = 'center';
      ctx.fillText(Math.ceil(this.respawnT), GW / 2, GY / 2);
      ctx.restore();
    }

    // Score flash
    if (this.scoreFlash.on) {
      const alpha = Math.max(0, this.scoreFlash.t / 0.3);
      ctx.save();
      ctx.globalAlpha = alpha * 0.4;
      ctx.fillStyle = this.scoreFlash.who === 0 ? '#ff69b4' : '#4ecdc4';
      ctx.fillRect(0, 0, GW, GH);
      ctx.restore();
    }
  }

  _drawGoals(ctx) {
    const pink = '#ff69b4';
    const bg = 'rgba(255, 255, 255, 0.3)';
    // Left goal
    ctx.fillStyle = bg; ctx.fillRect(0, GOAL_TOP, GOAL_W, GY - GOAL_TOP);
    ctx.strokeStyle = pink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, GOAL_TOP); ctx.lineTo(GOAL_W + 5, GOAL_TOP); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(GOAL_W, GOAL_TOP); ctx.lineTo(GOAL_W, GY); ctx.stroke();
    ctx.fillStyle = pink; ctx.beginPath(); ctx.arc(GOAL_W, GOAL_TOP, 7, 0, Math.PI * 2); ctx.fill();
    // Right goal
    ctx.fillStyle = bg; ctx.fillRect(GW - GOAL_W, GOAL_TOP, GOAL_W, GY - GOAL_TOP);
    ctx.strokeStyle = pink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(GW, GOAL_TOP); ctx.lineTo(GW - GOAL_W - 5, GOAL_TOP); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(GW - GOAL_W, GOAL_TOP); ctx.lineTo(GW - GOAL_W, GY); ctx.stroke();
    ctx.fillStyle = pink; ctx.beginPath(); ctx.arc(GW - GOAL_W, GOAL_TOP, 7, 0, Math.PI * 2); ctx.fill();
  }

  _drawNet(ctx) {
    const nl = NX - 7, nt = GY - NH;
    ctx.fillStyle = '#7a5836'; ctx.fillRect(nl - 5, nt - 8, 10, NH + 12);
    ctx.strokeStyle = 'rgba(255,255,255,.82)'; ctx.lineWidth = 1.2;
    for (let x = nl; x <= nl + 14; x += 3) { ctx.beginPath(); ctx.moveTo(x, nt); ctx.lineTo(x, GY); ctx.stroke(); }
    for (let y = nt; y <= GY; y += 12) { ctx.beginPath(); ctx.moveTo(nl - 3, y); ctx.lineTo(nl + 17, y); ctx.stroke(); }
    ctx.fillStyle = '#eee'; ctx.fillRect(nl - 4, nt - 8, 18, 12);
    ctx.fillStyle = '#cc3344'; ctx.fillRect(nl - 4, nt - 3, 18, 4);
  }

  onBall(m) { this.ball.setTarget(m.bx, m.by, m.vx, m.vy); }

  onBounce(m) {
    SFX.play('bounce');
    if (m.kind === 'ground') this.ps.dust(m.bx, GY, 5);
  }

  onHit(m) {
    SFX.play('hit');
    const hot = (Math.abs(this.ball.vx) + Math.abs(this.ball.vy)) > 700;
    this.ps.spark(this.ball.x, this.ball.y, 14, hot);
    if (this.players[m.player]) this.players[m.player].triggerHit();
    this.rally = m.rally || 0;
    if (this.rally >= 3) {
      this.combo.textContent = '🔥 x' + this.rally;
      this.combo.classList.remove('hidden');
    } else this.combo.classList.add('hidden');
  }

  onCountdown(m) {
    this.ball.visible = false;
    this.ball.teleport(m.bx || GW / 2, m.by || GY - 220, 0, 0);
    this.respawnT = (m.ms || 3000) / 1000;
    this.combo.classList.add('hidden'); this.rally = 0;
  }

  onServe(m) {
    this.ball.visible = true;
    this.ball.teleport(m.bx, m.by, m.vx, m.vy);
    this.respawnT = 0;
  }

  onScore(m) {
    SFX.play('score');
    this.scoreFlash = { on: true, t: .9, who: m.scorer };
    document.getElementById('sc1').textContent = m.scores[0];
    document.getElementById('sc2').textContent = m.scores[1];
    const el = document.getElementById('sc' + (m.scorer + 1));
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }

  onPmove(m) {
    const r = this.players[1 - this.localIdx]; if (!r) return;
    r.tx = m.x; r.ty = m.y; r.tState = m.state || 'idle'; r.tFacing = m.facing || 1;
  }

  start(idx, code) {
    this.localIdx = idx;
    this.roomCode = code;
    this.running = true;
    const skin0 = CURRENT_SKINS[0] || 'cat1';
    const skin1 = CURRENT_SKINS[1] || 'cat2';
    this.players[0] = new Player(220, GY - 40, skin0);
    this.players[1] = new Player(GW - 220, GY - 40, skin1);
    document.getElementById('roomcode').textContent = code;
  }

  stop() {
    this.running = false;
    this._keyState = {};
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  UI  (screens + socket wiring)
// ══════════════════════════════════════════════════════════════════════════════
const UI = (() => {
  let game = null, confetti = null;
  let pendingIdx = 0, pendingRoom = '';

  const $ = id => document.getElementById(id);

  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id)?.classList.add('active');
  }

  function nick() { return ($('inp-nick')?.value.trim() || 'Аноним').slice(0, 14); }

  function updateSkinDisplay() {
    const s0 = SKINS[CURRENT_SKINS[0]] || SKINS.cat1;
    const s1 = SKINS[CURRENT_SKINS[1]] || SKINS.cat2;
    $('sel-skin1').textContent = s0.name;
    $('sel-skin2').textContent = s1.name;
  }

  function init() {
    const cv = $('cv');
    confetti = new Confetti($('confetti'));

    // Resize canvas to fit screen
    function resize() {
      const topH = document.querySelector('.hud')?.offsetHeight || 44;
      const botH = document.querySelector('.hint2')?.offsetHeight || 22;
      const avH = window.innerHeight - topH - botH - 4;
      const scale = Math.min(window.innerWidth / GW, avH / GH);
      cv.style.width  = Math.floor(GW * scale) + 'px';
      cv.style.height = Math.floor(GH * scale) + 'px';
    }
    window.addEventListener('resize', resize); resize();

    game = new Game(cv);
    SocketManager.connect();

    // ── Button wiring ──
    $('btn-create').onclick = () => {
      NICKS[0] = nick();
      IS_BOT_MODE = false;
      SocketManager.create(NICKS[0]);
    };

    // BOT MODE
    $('btn-bot').onclick = () => {
      NICKS[0] = nick();
      NICKS[1] = 'BOT 🤖';
      IS_BOT_MODE = true;
      $('sn1').textContent = '😸 ' + NICKS[0];
      $('sn2').textContent = NICKS[1];
      $('sc1').textContent = '0'; $('sc2').textContent = '0';
      show('s-game');
      game.start(0, 'BOT_MODE');
    };

    // SKIN SELECTION
    $('btn-skin1').onclick = () => {
      const keys = Object.keys(SKINS);
      const current = keys.indexOf(CURRENT_SKINS[0]);
      CURRENT_SKINS[0] = keys[(current + 1) % keys.length];
      updateSkinDisplay();
    };

    $('btn-skin2').onclick = () => {
      const keys = Object.keys(SKINS);
      const current = keys.indexOf(CURRENT_SKINS[1]);
      CURRENT_SKINS[1] = keys[(current + 1) % keys.length];
      updateSkinDisplay();
    };

    $('btn-join-show').onclick = () => {
      $('join-box').classList.toggle('hidden');
      setTimeout(() => $('inp-code').focus(), 80);
    };

    $('btn-join').onclick = () => {
      const code = $('inp-code').value.trim().toUpperCase();
      if (!code) return;
      NICKS[1] = nick();
      IS_BOT_MODE = false;
      SocketManager.join(code, NICKS[1]);
    };

    $('inp-code').onkeydown = e => { if (e.key === 'Enter') $('btn-join').click(); };

    $('btn-copy').onclick = () => {
      navigator.clipboard?.writeText($('code-show').textContent);
      $('btn-copy').textContent = '✅ Скопировано!';
      setTimeout(() => $('btn-copy').textContent = '📋 Скопировать', 2000);
    };

    $('btn-rematch').onclick = () => SocketManager.rematch();

    $('btn-tomenu').onclick = () => {
      confetti.stop(); game.stop(); show('s-menu');
      $('join-box').classList.add('hidden');
      $('wait-box').classList.add('hidden');
      $('btn-create').classList.remove('hidden');
      $('btn-join-show').classList.remove('hidden');
    };

    $('btn-disc').onclick = () => {
      $('s-disc').classList.add('hidden');
      game.stop(); show('s-menu');
    };

    // ── Socket events ──
    SocketManager.on('created', m => {
      pendingIdx = m.pi; pendingRoom = m.code;
      NICKS[0] = m.nick || nick();
      $('sn1').textContent = '😸 ' + NICKS[0];
      $('wait-box').classList.remove('hidden');
      $('code-show').textContent = m.code;
      $('btn-create').classList.add('hidden');
      $('btn-bot').classList.add('hidden');
      $('btn-join-show').classList.add('hidden');
    });

    SocketManager.on('joined', m => {
      pendingIdx = m.pi; pendingRoom = m.code;
      NICKS = m.nicks || NICKS;
      $('sn1').textContent = '😸 ' + NICKS[0];
      $('sn2').textContent = NICKS[1] + ' 😼';
    });

    SocketManager.on('opponent', m => {
      if (m.nick) {
        NICKS[1] = m.nick;
        $('sn2').textContent = NICKS[1] + ' 😼';
      }
    });

    SocketManager.on('start', m => {
      if (m.nicks) NICKS = m.nicks;
      $('sn1').textContent = '😸 ' + NICKS[0];
      $('sn2').textContent = NICKS[1] + ' 😼';
      $('sc1').textContent = '0'; $('sc2').textContent = '0';
      show('s-game');
      game.start(pendingIdx, pendingRoom);
    });

    SocketManager.on('err', m => {
      const el = $('join-err');
      el.textContent = m.msg; el.classList.remove('hidden');
      setTimeout(() => el.classList.add('hidden'), 3000);
    });

    SocketManager.on('ball',       m => game.onBall(m));
    SocketManager.on('bounce',     m => game.onBounce(m));
    SocketManager.on('hit',        m => game.onHit(m));
    SocketManager.on('countdown',  m => game.onCountdown(m));
    SocketManager.on('serve',      m => game.onServe(m));
    SocketManager.on('score',      m => game.onScore(m));
    SocketManager.on('pmove',      m => game.onPmove(m));

    SocketManager.on('gameover', m => {
      game.stop(); confetti.start();
      if (m.nicks) NICKS = m.nicks;
      const wN = NICKS[m.winner] || 'Игрок ' + (m.winner + 1);
      const lN = NICKS[1 - m.winner] || 'Игрок ' + (2 - m.winner);
      $('emo').textContent = m.winner === 0 ? '🏆' : '🎉';
      $('over-title').textContent = wN + ' победил!';
      $('over-phrase').textContent = getPhrase(wN, lN);
      $('over-score').textContent = m.scores[0] + ' – ' + m.scores[1];
      $('over-stats').innerHTML = m.hits
        ? `<div class="stat"><span>${m.hits[0]}</span>ударов P1</div><div class="stat"><span>${m.hits[1]}</span>ударов P2</div>` : '';
      show('s-over');
    });

    SocketManager.on('left', () => {
      game.stop();
      $('s-disc').classList.remove('hidden');
    });

    updateSkinDisplay();
  }

  return { init };
})();

window.addEventListener('DOMContentLoaded', () => UI.init());
