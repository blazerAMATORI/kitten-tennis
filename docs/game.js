/**
 * game.js — Kitten Tennis Game Engine
 *
 * Architecture:
 *   - AssetLoader  : loads and manages sprites
 *   - SoundManager : Web Audio API sound effects
 *   - Player       : local/remote player state + rendering
 *   - Ball         : interpolated ball state + rendering
 *   - ParticleSystem: dust, sparkle effects
 *   - Game         : main loop, input, UI coordination
 */

'use strict';

// ════════════════════════════════════════════════════════════════════════════
// CONSTANTS (must match server/server.js)
// ════════════════════════════════════════════════════════════════════════════
const GAME_W      = 800;
const GAME_H      = 450;
const GROUND_Y    = GAME_H - 60;
const NET_X       = GAME_W / 2;
const NET_H       = 110;
const BALL_R      = 14;
const GRAVITY     = 980;
const JUMP_VY     = -520;
const PLAYER_SPD  = 280;
const TARGET_FPS  = 60;
const FRAME_MS    = 1000 / TARGET_FPS;

// ════════════════════════════════════════════════════════════════════════════
// ASSET LOADER
// ════════════════════════════════════════════════════════════════════════════
const AssetLoader = (() => {
  const cache = {};

  function load(key, src) {
    return new Promise(resolve => {
      if (cache[key]) { resolve(cache[key]); return; }
      const img = new Image();
      img.onload  = () => { cache[key] = img; resolve(img); };
      img.onerror = () => { cache[key] = null; resolve(null); }; // graceful fail
      img.src = src;
    });
  }

  function get(key) { return cache[key] || null; }

  async function loadAll() {
    // Try to load supplied sprite images; fall back to drawn shapes if missing
    await Promise.all([
      load('cat_gray',  'cat_gray.png'),   // gray kitten sprite (player 1)
      load('cat_black', 'cat_black.png'),  // black cat sprite (player 2)
      load('ball',      'ball.png'),       // tennis ball
      load('bg',        'bg.png'),         // background
    ]);
  }

  return { load, get, loadAll };
})();

// ════════════════════════════════════════════════════════════════════════════
// SOUND MANAGER  (Web Audio API)
// ════════════════════════════════════════════════════════════════════════════
const SoundManager = (() => {
  let ctx = null;
  let volume = 0.5;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  /** Play a generated sound */
  function play(type) {
    try {
      const ac = getCtx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);

      switch (type) {
        case 'hit':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(480, ac.currentTime);
          osc.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.12);
          gain.gain.setValueAtTime(volume * 0.5, ac.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
          osc.start(); osc.stop(ac.currentTime + 0.15);
          break;

        case 'bounce':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(200, ac.currentTime);
          osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.08);
          gain.gain.setValueAtTime(volume * 0.3, ac.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
          osc.start(); osc.stop(ac.currentTime + 0.1);
          break;

        case 'score':
          osc.type = 'square';
          osc.frequency.setValueAtTime(523, ac.currentTime);
          osc.frequency.setValueAtTime(659, ac.currentTime + 0.12);
          osc.frequency.setValueAtTime(784, ac.currentTime + 0.24);
          gain.gain.setValueAtTime(volume * 0.3, ac.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.45);
          osc.start(); osc.stop(ac.currentTime + 0.45);
          break;

        case 'jump':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(300, ac.currentTime);
          osc.frequency.exponentialRampToValueAtTime(600, ac.currentTime + 0.1);
          gain.gain.setValueAtTime(volume * 0.25, ac.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
          osc.start(); osc.stop(ac.currentTime + 0.15);
          break;
      }
    } catch (e) { /* Audio not available */ }
  }

  return { play, setVolume: v => { volume = v; } };
})();

// ════════════════════════════════════════════════════════════════════════════
// PARTICLE SYSTEM
// ════════════════════════════════════════════════════════════════════════════
class ParticleSystem {
  constructor() { this.particles = []; }

  /** Spawn dust cloud (on jump/land) */
  spawnDust(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 80,
        vy: -Math.random() * 60 - 10,
        life: 0.6 + Math.random() * 0.3,
        maxLife: 0.7,
        size: 4 + Math.random() * 6,
        color: `hsl(${30 + Math.random()*20}, 60%, 75%)`,
        type: 'dust',
      });
    }
  }

  /** Sparkle on ball hit */
  spawnSparkle(x, y, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 80 + Math.random() * 120;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 0.4 + Math.random() * 0.2,
        maxLife: 0.5,
        size: 3 + Math.random() * 4,
        color: `hsl(${Math.random() * 60 + 30}, 100%, 65%)`,
        type: 'spark',
      });
    }
  }

  update(dt) {
    this.particles = this.particles.filter(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt; // light gravity
      p.life -= dt;
      return p.life > 0;
    });
  }

  draw(ctx) {
    this.particles.forEach(p => {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = p.color;
      if (p.type === 'spark') {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PLAYER CLASS
// ════════════════════════════════════════════════════════════════════════════
class Player {
  /**
   * @param {number} index      0 = left/P1, 1 = right/P2
   * @param {boolean} isLocal   true if this instance is controlled by local input
   */
  constructor(index, isLocal) {
    this.index   = index;
    this.isLocal = isLocal;

    // Starting positions
    this.x  = index === 0 ? 180 : GAME_W - 180;
    this.y  = GROUND_Y - 32;
    this.vx = 0;
    this.vy = 0;

    this.onGround   = true;
    this.facing     = index === 0 ? 1 : -1; // 1=right, -1=left
    this.state      = 'idle';  // 'idle'|'run'|'jump'|'hit'
    this.hitTimer   = 0;
    this.jumpTimer  = 0;

    // Sprite animation
    this.animFrame  = 0;
    this.animTimer  = 0;
    this.bobOffset  = 0;   // idle bob

    // For remote player: interpolation targets
    this.targetX    = this.x;
    this.targetY    = this.y;
    this.remoteState = 'idle';
    this.remoteFacing = this.facing;

    // Score bump animation
    this.scoreBumpTimer = 0;
  }

  /** Apply local input each frame */
  applyInput(keys, dt, ps) {
    if (!this.isLocal) return;

    const LEFT  = this.index === 0 ? 'a' : 'ArrowLeft';
    const RIGHT = this.index === 0 ? 'd' : 'ArrowRight';
    const JUMP  = this.index === 0 ? ' ' : 'ArrowUp';

    let moving = false;

    if (keys[LEFT]) {
      this.vx = -PLAYER_SPD;
      this.facing = -1;
      moving = true;
    } else if (keys[RIGHT]) {
      this.vx = PLAYER_SPD;
      this.facing = 1;
      moving = true;
    } else {
      this.vx *= 0.75; // friction
    }

    // Jump / hit
    if (keys[JUMP] && this.onGround && this.jumpTimer <= 0) {
      this.vy = JUMP_VY;
      this.onGround = false;
      this.jumpTimer = 0.35;
      SoundManager.play('jump');
      ps.spawnDust(this.x, GROUND_Y, 10);
    }

    this.jumpTimer = Math.max(0, this.jumpTimer - dt);

    // Update state
    if (!this.onGround)     this.state = 'jump';
    else if (this.hitTimer > 0) this.state = 'hit';
    else if (moving)        this.state = 'run';
    else                    this.state = 'idle';
  }

  /** Integrate physics */
  integrate(dt) {
    if (!this.isLocal) {
      // Remote: interpolate toward server-reported position
      this.x += (this.targetX - this.x) * Math.min(1, dt * 16);
      this.y += (this.targetY - this.y) * Math.min(1, dt * 16);
      this.state = this.remoteState;
      this.facing = this.remoteFacing;
      return;
    }

    // Gravity
    if (!this.onGround) {
      this.vy += GRAVITY * dt;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Ground collision
    if (this.y >= GROUND_Y - 32) {
      this.y = GROUND_Y - 32;
      this.vy = 0;
      if (!this.onGround) {
        this.onGround = true;
      }
    }

    // Bounce off net (cannot cross)
    const half = 26; // half player width
    if (this.index === 0) {
      // P1 stays left of net
      this.x = Math.max(half, Math.min(NET_X - 12 - half, this.x));
    } else {
      // P2 stays right of net
      this.x = Math.min(GAME_W - half, Math.max(NET_X + 12 + half, this.x));
    }

    // Walls
    this.x = Math.max(half, Math.min(GAME_W - half, this.x));

    // Hit timer decay
    this.hitTimer = Math.max(0, this.hitTimer - dt);

    // Idle animation bob
    this.bobOffset = Math.sin(Date.now() / 350) * 2.5;

    // Animate
    this.animTimer += dt;
    if (this.animTimer > 0.12) {
      this.animTimer = 0;
      this.animFrame = (this.animFrame + 1) % 4;
    }
  }

  /** Called by Game when server reports a hit on this player */
  triggerHit() {
    this.hitTimer = 0.3;
    this.state = 'hit';
  }

  /** Draw using sprite or fallback drawn shape */
  draw(ctx) {
    const spriteKey = this.index === 0 ? 'cat_gray' : 'cat_black';
    const sprite = AssetLoader.get(spriteKey);

    const drawX = this.x;
    let drawY = this.y;

    // Idle bob (only when on ground)
    if (this.onGround && this.state === 'idle') {
      drawY += this.bobOffset;
    }

    // Jump stretch/squash
    let scaleX = 1, scaleY = 1;
    if (this.state === 'jump') {
      scaleX = 0.88; scaleY = 1.18;
    } else if (this.onGround && this.vy > 100) {
      scaleX = 1.2;  scaleY = 0.85; // squash on land
    }

    // Hit flash color
    const flashAlpha = this.hitTimer > 0 ? Math.sin(Date.now() / 60) * 0.4 + 0.3 : 0;

    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.scale(this.facing, 1); // flip for direction
    ctx.scale(scaleX, scaleY);

    if (sprite) {
      // Draw sprite
      const sw = 64, sh = 72;
      ctx.drawImage(sprite, -sw / 2, -sh / 2, sw, sh);
    } else {
      // ── Fallback drawn cat ──────────────────────────────────────────────
      this._drawFallbackCat(ctx);
    }

    // Hit flash overlay
    if (flashAlpha > 0) {
      ctx.globalAlpha = flashAlpha;
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.ellipse(0, 0, 28, 34, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Name badge
    ctx.save();
    ctx.font = 'bold 11px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.index === 0 ? '#FF6B9D' : '#4ECDC4';
    ctx.fillText(`P${this.index + 1}`, drawX, drawY - 42);
    ctx.restore();
  }

  _drawFallbackCat(ctx) {
    const isBlack = this.index === 1;

    // Body
    ctx.fillStyle = isBlack ? '#1a1a2e' : '#888898';
    ctx.beginPath();
    ctx.ellipse(0, 6, 22, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = isBlack ? '#2a2a3e' : '#aaaabc';
    ctx.beginPath();
    ctx.ellipse(0, -20, 20, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = isBlack ? '#2a2a3e' : '#aaaabc';
    ctx.beginPath();
    ctx.moveTo(-14, -32); ctx.lineTo(-8, -18); ctx.lineTo(-20, -18);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, -32); ctx.lineTo(20, -18); ctx.lineTo(8, -18);
    ctx.fill();

    // Inner ear
    ctx.fillStyle = '#ffb3c6';
    ctx.beginPath();
    ctx.moveTo(-12, -30); ctx.lineTo(-9, -20); ctx.lineTo(-16, -20);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(12, -30); ctx.lineTo(16, -20); ctx.lineTo(9, -20);
    ctx.fill();

    // Eyes
    const eyeColor = isBlack ? '#f5c542' : '#5bc8f5';
    ctx.fillStyle = eyeColor;
    ctx.beginPath(); ctx.ellipse(-7, -22, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, -22, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
    // Pupils
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(-7, -22, 2, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, -22, 2, 4, 0, 0, Math.PI * 2); ctx.fill();

    // Nose
    ctx.fillStyle = '#ff9eb5';
    ctx.beginPath(); ctx.arc(0, -15, 3, 0, Math.PI * 2); ctx.fill();

    // Whiskers
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    [[-1,-15,-16,-13],[[-1,-15,-16,-16]],[[1,-15,16,-13]],[[1,-15,16,-16]]].flat().forEach(() => {});
    // simplified whiskers
    ctx.beginPath(); ctx.moveTo(-3, -14); ctx.lineTo(-18, -11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-3, -14); ctx.lineTo(-18, -16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, -14); ctx.lineTo(18, -11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, -14); ctx.lineTo(18, -16); ctx.stroke();

    // Tail
    ctx.strokeStyle = isBlack ? '#1a1a2e' : '#888898';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(16, 20);
    const tailWag = Math.sin(Date.now() / 200) * 8;
    ctx.bezierCurveTo(30, 10, 38, -5 + tailWag, 28, -18 + tailWag);
    ctx.stroke();

    // Paws
    ctx.fillStyle = isBlack ? '#2a2a3e' : '#aaaabc';
    ctx.beginPath(); ctx.ellipse(-12, 30, 9, 6, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12, 30, 9, 6, 0.2, 0, Math.PI * 2); ctx.fill();

    // Stripes (gray cat only)
    if (!isBlack) {
      ctx.strokeStyle = '#666677';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-18, -8); ctx.lineTo(-14, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(-10, 0); ctx.stroke();
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// BALL CLASS  (client-side interpolation of server state)
// ════════════════════════════════════════════════════════════════════════════
class Ball {
  constructor() {
    this.x  = GAME_W / 2;
    this.y  = GAME_H / 2 - 60;
    this.vx = 300;
    this.vy = -200;

    // Interpolation targets from server
    this.targetX  = this.x;
    this.targetY  = this.y;
    this.targetVx = this.vx;
    this.targetVy = this.vy;

    this.rotation  = 0;
    this.visible   = true;

    // Trail for motion blur effect
    this.trail = [];
  }

  /** Server sends authoritative position */
  setTarget(x, y, vx, vy) {
    this.targetX  = x;
    this.targetY  = y;
    this.targetVx = vx;
    this.targetVy = vy;
  }

  /** Teleport (respawn) */
  teleport(x, y, vx, vy) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.targetX = x; this.targetY = y;
    this.targetVx = vx; this.targetVy = vy;
    this.trail = [];
  }

  update(dt) {
    if (!this.visible) return;

    // Smooth interpolation toward server-authoritative position
    const lerp = Math.min(1, dt * 18);
    this.x  += (this.targetX  - this.x)  * lerp;
    this.y  += (this.targetY  - this.y)  * lerp;
    this.vx += (this.targetVx - this.vx) * lerp;
    this.vy += (this.targetVy - this.vy) * lerp;

    // Spin based on horizontal speed
    this.rotation += this.vx * dt * 0.05;

    // Trail
    this.trail.unshift({ x: this.x, y: this.y });
    if (this.trail.length > 8) this.trail.pop();
  }

  draw(ctx) {
    if (!this.visible) return;

    // Draw motion trail
    this.trail.forEach((pos, i) => {
      const a = (1 - i / this.trail.length) * 0.3;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#c8f542';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, BALL_R * (1 - i * 0.08), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    const sprite = AssetLoader.get('ball');
    if (sprite) {
      ctx.drawImage(sprite, -BALL_R, -BALL_R, BALL_R * 2, BALL_R * 2);
    } else {
      // Drawn tennis ball
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.ellipse(2, BALL_R + 3, BALL_R * 0.8, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Ball
      ctx.fillStyle = '#c8e830';
      ctx.beginPath();
      ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
      ctx.fill();

      // Tennis ball seam
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, BALL_R, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, BALL_R, Math.PI - 0.6, Math.PI + 0.6);
      ctx.stroke();

      // Shine
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(-4, -4, 5, 3, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Ground shadow
    ctx.save();
    const shadowAlpha = Math.max(0, 0.25 * (1 - (GROUND_Y - this.y) / GAME_H));
    ctx.globalAlpha = shadowAlpha;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(this.x, GROUND_Y, BALL_R * 0.9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GAME CLASS — main coordinator
// ════════════════════════════════════════════════════════════════════════════
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    // Scale canvas to fixed game dimensions
    this.canvas.width  = GAME_W;
    this.canvas.height = GAME_H;

    // Game objects
    this.players = [null, null];
    this.ball     = new Ball();
    this.ps       = new ParticleSystem();

    // Local player info
    this.localIndex   = -1;  // 0 or 1
    this.scores       = [0, 0];
    this.roomCode     = '';
    this.state        = 'idle'; // 'idle'|'playing'|'over'

    // Input
    this.keys = {};
    this._bindInput();

    // Move send throttle
    this.lastMoveSend = 0;

    // Score flash
    this.scoreFlash = { active: false, timer: 0, scorer: -1 };

    // Respawn countdown
    this.respawnTimer = 0;

    // Animation loop
    this.lastFrameTime = 0;
    this.rafId = null;

    // Background stars/dots (decorative)
    this.bgDots = Array.from({ length: 30 }, () => ({
      x: Math.random() * GAME_W,
      y: Math.random() * (GROUND_Y - 60),
      r: 1 + Math.random() * 2,
      a: 0.1 + Math.random() * 0.2,
    }));
  }

  // ── Input binding ─────────────────────────────────────────────────────────
  _bindInput() {
    window.addEventListener('keydown', e => {
      this.keys[e.key] = true;
      // Prevent scroll on arrow/space
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', e => {
      this.keys[e.key] = false;
    });
  }

  // ── Start a game session ──────────────────────────────────────────────────
  start(localIndex, roomCode) {
    this.localIndex = localIndex;
    this.roomCode   = roomCode;
    this.scores     = [0, 0];
    this.state      = 'playing';

    // Create player objects
    this.players[0] = new Player(0, localIndex === 0);
    this.players[1] = new Player(1, localIndex === 1);

    this.ball = new Ball();
    this.ps   = new ParticleSystem();

    document.getElementById('badge-room-code').textContent = roomCode;

    this._loop(performance.now());
  }

  stop() {
    this.state = 'idle';
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  _loop(now) {
    this.rafId = requestAnimationFrame(ts => this._loop(ts));

    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;

    if (this.state !== 'playing') return;

    this._update(dt);
    this._draw();
  }

  _update(dt) {
    const local = this.players[this.localIndex];
    const remote = this.players[1 - this.localIndex];

    // Apply input to local player
    local.applyInput(this.keys, dt, this.ps);
    local.integrate(dt);
    remote.integrate(dt);
    this.ball.update(dt);
    this.ps.update(dt);

    // Respawn timer
    if (this.respawnTimer > 0) {
      this.respawnTimer = Math.max(0, this.respawnTimer - dt);
      if (this.respawnTimer <= 0) this.ball.visible = true;
    }

    // Score flash
    if (this.scoreFlash.active) {
      this.scoreFlash.timer -= dt;
      if (this.scoreFlash.timer <= 0) this.scoreFlash.active = false;
    }

    // Send local position to server (throttled to ~30/s)
    const now = performance.now();
    if (now - this.lastMoveSend > 33) {
      this.lastMoveSend = now;
      SocketManager.sendPlayerMove({
        x: local.x, y: local.y,
        state: local.state,
        facing: local.facing,
      });
    }
  }

  // ── Drawing ───────────────────────────────────────────────────────────────
  _draw() {
    const ctx = this.ctx;
    const W = GAME_W, H = GAME_H;

    // Background
    this._drawBackground(ctx, W, H);

    // Particles (behind players)
    this.ps.draw(ctx);

    // Ball
    this.ball.draw(ctx);

    // Players
    this.players.forEach(p => p && p.draw(ctx));

    // Net
    this._drawNet(ctx);

    // Score flash overlay
    if (this.scoreFlash.active) {
      const a = Math.min(1, this.scoreFlash.timer * 2) * 0.18;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = this.scoreFlash.scorer === 0 ? '#FF6B9D' : '#4ECDC4';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Respawn countdown
    if (this.respawnTimer > 0 && !this.ball.visible) {
      ctx.save();
      ctx.font = 'bold 56px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(Math.ceil(this.respawnTimer), W / 2, H / 2);
      ctx.restore();
    }
  }

  _drawBackground(ctx, W, H) {
    // Sky gradient
    const bgSprite = AssetLoader.get('bg');
    if (bgSprite) {
      ctx.drawImage(bgSprite, 0, 0, W, H);
    } else {
      // Drawn background
      const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, '#87CEEB');
      sky.addColorStop(1, '#C8E8F8');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, GROUND_Y);

      // Decorative clouds
      this._drawCloud(ctx, 120, 60, 50);
      this._drawCloud(ctx, 380, 40, 38);
      this._drawCloud(ctx, 640, 70, 44);

      // Background dots
      this.bgDots.forEach(d => {
        ctx.save();
        ctx.globalAlpha = d.a;
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    // Ground
    const groundGrad = ctx.createLinearGradient(0, GROUND_Y - 4, 0, H);
    groundGrad.addColorStop(0, '#6DBE45');
    groundGrad.addColorStop(0.12, '#5aad32');
    groundGrad.addColorStop(1, '#3a7a1a');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, GROUND_Y - 4, W, H - GROUND_Y + 4);

    // Ground line highlight
    ctx.strokeStyle = '#88dd50';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y - 4);
    ctx.lineTo(W, GROUND_Y - 4);
    ctx.stroke();

    // Court lines (half-court marks)
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    // Left service line
    ctx.beginPath(); ctx.moveTo(W * 0.25, GROUND_Y - 4); ctx.lineTo(W * 0.25, GROUND_Y + 8); ctx.stroke();
    // Right service line
    ctx.beginPath(); ctx.moveTo(W * 0.75, GROUND_Y - 4); ctx.lineTo(W * 0.75, GROUND_Y + 8); ctx.stroke();
    ctx.setLineDash([]);

    // Player side labels
    ctx.font = '700 11px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('P1', W * 0.25, GROUND_Y + 20);
    ctx.fillText('P2', W * 0.75, GROUND_Y + 20);
  }

  _drawCloud(ctx, x, y, size) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
    ctx.arc(x + size * 0.55, y + 5, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x - size * 0.5, y + 8, size * 0.45, 0, Math.PI * 2);
    ctx.arc(x + size * 0.25, y + 14, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawNet(ctx) {
    const netLeft = NET_X - 6;
    const netTop  = GROUND_Y - NET_H;

    // Net post (left)
    ctx.fillStyle = '#8B6346';
    ctx.fillRect(netLeft - 4, netTop - 6, 8, NET_H + 10);

    // Net shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(netLeft + 4, netTop, 10, NET_H);

    // Net body
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2;

    // Vertical strings
    for (let x = netLeft; x <= netLeft + 12; x += 3) {
      ctx.beginPath();
      ctx.moveTo(x, netTop);
      ctx.lineTo(x, GROUND_Y);
      ctx.stroke();
    }

    // Horizontal strings
    for (let y = netTop; y <= GROUND_Y; y += 12) {
      ctx.beginPath();
      ctx.moveTo(netLeft - 2, y);
      ctx.lineTo(netLeft + 14, y);
      ctx.stroke();
    }

    // Top tape
    const tape = ctx.createLinearGradient(netLeft, 0, netLeft + 12, 0);
    tape.addColorStop(0, '#f0f0f0');
    tape.addColorStop(0.5, '#ffffff');
    tape.addColorStop(1, '#ddd');
    ctx.fillStyle = tape;
    ctx.fillRect(netLeft - 3, netTop - 6, 18, 10);

    // Top tape stripe
    ctx.fillStyle = '#cc4455';
    ctx.fillRect(netLeft - 3, netTop - 2, 18, 3);
  }

  // ── Server message handlers ───────────────────────────────────────────────

  onBallUpdate(msg) {
    this.ball.setTarget(msg.x, msg.y, msg.vx, msg.vy);
  }

  onBallBounce(msg) {
    SoundManager.play(msg.kind === 'ground' ? 'bounce' : 'bounce');
    if (msg.kind === 'ground') {
      this.ps.spawnDust(msg.x, GROUND_Y, 5);
    }
  }

  onHit(msg) {
    SoundManager.play('hit');
    this.ps.spawnSparkle(this.ball.x, this.ball.y, 12);
    if (this.players[msg.player]) this.players[msg.player].triggerHit();
  }

  onRespawn(msg) {
    this.ball.visible = false;
    this.ball.teleport(msg.x, msg.y, msg.vx, msg.vy);
    this.respawnTimer = 1.5;
    setTimeout(() => {
      this.ball.visible = true;
      this.respawnTimer = 0;
    }, 1500);
  }

  onScore(msg) {
    this.scores = msg.scores;
    SoundManager.play('score');
    this.scoreFlash = { active: true, timer: 0.8, scorer: msg.scorer };

    // Animate score numbers
    const el = document.getElementById(`score-num-p${msg.scorer + 1}`);
    if (el) {
      el.textContent = this.scores[msg.scorer];
      el.classList.remove('bump');
      void el.offsetWidth; // force reflow
      el.classList.add('bump');
    }
    document.getElementById('score-num-p1').textContent = this.scores[0];
    document.getElementById('score-num-p2').textContent = this.scores[1];
  }

  onOpponentMove(msg) {
    const remote = this.players[1 - this.localIndex];
    if (!remote) return;
    remote.targetX      = msg.x;
    remote.targetY      = msg.y;
    remote.remoteState  = msg.state || 'idle';
    remote.remoteFacing = msg.facing || 1;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// UI MANAGER — screen transitions + button wiring
// ════════════════════════════════════════════════════════════════════════════
const UIManager = (() => {
  let game = null;

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  function init() {
    // Size canvas responsively
    const canvas = document.getElementById('game-canvas');
    function resizeCanvas() {
      const maxW = Math.min(window.innerWidth, 820);
      const scale = Math.min(maxW / GAME_W, (window.innerHeight - 80) / GAME_H);
      canvas.style.width  = (GAME_W * scale) + 'px';
      canvas.style.height = (GAME_H * scale) + 'px';
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    game = new Game(canvas);

    // ── Load assets then connect ──
    AssetLoader.loadAll().then(() => {
      SocketManager.connect();
    });

    // ── Button: Create Room ──
    document.getElementById('btn-create').addEventListener('click', () => {
      SocketManager.createRoom();
    });

    // ── Button: Toggle join form ──
    document.getElementById('btn-join-toggle').addEventListener('click', () => {
      const f = document.getElementById('join-form');
      f.classList.toggle('hidden');
      if (!f.classList.contains('hidden')) {
        document.getElementById('room-code-input').focus();
      }
    });

    // ── Button: Confirm join ──
    document.getElementById('btn-join-confirm').addEventListener('click', () => {
      const code = document.getElementById('room-code-input').value.trim().toUpperCase();
      if (!code) return;
      SocketManager.joinRoom(code);
    });
    document.getElementById('room-code-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-join-confirm').click();
    });

    // ── Button: Copy code ──
    document.getElementById('btn-copy-code').addEventListener('click', () => {
      const code = document.getElementById('room-code-display').textContent;
      navigator.clipboard?.writeText(code);
      document.getElementById('btn-copy-code').textContent = '✅ Copied!';
      setTimeout(() => { document.getElementById('btn-copy-code').textContent = '📋 Copy Code'; }, 2000);
    });

    // ── Button: Rematch ──
    document.getElementById('btn-rematch').addEventListener('click', () => {
      SocketManager.sendRematch();
    });

    // ── Button: Menu from game over ──
    document.getElementById('btn-menu').addEventListener('click', () => {
      game.stop();
      showScreen('screen-menu');
      // Reset UI
      document.getElementById('join-form').classList.add('hidden');
      document.getElementById('waiting-panel').classList.add('hidden');
    });

    // ── Button: Menu from disconnect overlay ──
    document.getElementById('btn-disc-menu').addEventListener('click', () => {
      document.getElementById('overlay-disconnected').classList.add('hidden');
      game.stop();
      showScreen('screen-menu');
    });

    // ── Socket event handlers ──────────────────────────────────────────────

    SocketManager.on('connect', () => {
      console.log('[UI] Connected to server');
    });

    SocketManager.on('roomCreated', (msg) => {
      document.getElementById('waiting-panel').classList.remove('hidden');
      document.getElementById('room-code-display').textContent = msg.code;
      document.getElementById('btn-create').classList.add('hidden');
      document.getElementById('btn-join-toggle').classList.add('hidden');
    });

    SocketManager.on('roomJoined', (msg) => {
      // P2 joined a room — wait for gameStart
      document.getElementById('join-form').classList.add('hidden');
    });

    SocketManager.on('opponentJoined', () => {
      // Server will send gameStart right after
    });

    SocketManager.on('gameStart', (msg) => {
      // Both players: hide menu, show game
      showScreen('screen-game');
      document.getElementById('score-num-p1').textContent = '0';
      document.getElementById('score-num-p2').textContent = '0';
      // Determine local index from previous join/create
      // (set in roomCreated / roomJoined handlers above, stored on game)
      game.start(game.pendingLocalIndex ?? 0, game.pendingRoomCode ?? '');
    });

    SocketManager.on('roomCreated', (msg) => {
      game.pendingLocalIndex = msg.playerIndex;
      game.pendingRoomCode   = msg.code;
      document.getElementById('waiting-panel').classList.remove('hidden');
      document.getElementById('room-code-display').textContent = msg.code;
      document.getElementById('btn-create').classList.add('hidden');
      document.getElementById('btn-join-toggle').classList.add('hidden');
    });

    SocketManager.on('roomJoined', (msg) => {
      game.pendingLocalIndex = msg.playerIndex;
      game.pendingRoomCode   = msg.code;
    });

    SocketManager.on('error', (msg) => {
      const err = document.getElementById('join-error');
      err.textContent = msg.message;
      err.classList.remove('hidden');
      setTimeout(() => err.classList.add('hidden'), 3000);
    });

    SocketManager.on('ballUpdate', msg => game.onBallUpdate(msg));
    SocketManager.on('bounce',    msg => game.onBallBounce(msg));
    SocketManager.on('hit',       msg => game.onHit(msg));
    SocketManager.on('serveCountdown', msg => game.onRespawn(msg));
    SocketManager.on('respawn',   msg => game.onRespawn(msg));
    SocketManager.on('score',     msg => game.onScore(msg));
    SocketManager.on('opponentMove', msg => game.onOpponentMove(msg));

    SocketManager.on('gameOver', (msg) => {
      game.stop();
      const winnerName = msg.winner === 0 ? 'Player 1 🐱' : 'Player 2 😼';
      const emoji = msg.winner === 0 ? '🏆' : '🎉';
      document.getElementById('winner-emoji').textContent = emoji;
      document.getElementById('winner-title').textContent = `${winnerName} Wins!`;
      document.getElementById('final-scores').textContent = `${msg.scores[0]} – ${msg.scores[1]}`;
      showScreen('screen-gameover');
    });

    SocketManager.on('opponentLeft', () => {
      game.stop();
      document.getElementById('overlay-disconnected').classList.remove('hidden');
    });

    SocketManager.on('disconnect', () => {
      if (game.state === 'playing') {
        document.getElementById('overlay-disconnected').classList.remove('hidden');
        game.stop();
      }
    });
  }

  return { init };
})();

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  UIManager.init();
});
