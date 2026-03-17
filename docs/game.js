'use strict';

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const GW         = 1280;
const GH         = 720;
const GROUND_Y   = GH - 80;
const NET_X      = GW / 2;
const NET_H      = 160;
const BALL_R     = 22;
const GRAVITY    = 500;
const BOUNCE_G   = 0.82;
const PLAYER_SPD = 300;
const JUMP_VY    = -560;
const FAST_FALL  = 600;
const TARGET_FPS = 60;
const GOAL_W     = 28;
const GOAL_TOP   = GROUND_Y - 100;
const WIN_SCORE  = 12;

// ═══════════════════════════════════════════
// WIN PHRASES
// ═══════════════════════════════════════════
const WIN_PHRASES = [
  '{w} разнёс {l} в пух и прах!',
  '{w} размазал {l} по корту!',
  '{w} показал {l} кто тут котик!',
  '{l} и близко не подошёл к {w}!',
  '{w} — король корта, {l} — просто мяч!',
  '{w} гонял {l} как мячик весь матч!',
  '{l} плачет, {w} празднует!',
  '{w} втоптал {l} в траву!',
  '{w} отправил {l} на скамейку запасных!',
  '{w} дал урок теннису для {l}!',
];
function winPhrase(w,l){ return WIN_PHRASES[Math.floor(Math.random()*WIN_PHRASES.length)].replace(/{w}/g,w).replace(/{l}/g,l); }

let playerNicks = ['Игрок 1', 'Игрок 2'];

// ═══════════════════════════════════════════
// AUDIO
// ═══════════════════════════════════════════
const SFX = (() => {
  let ac;
  function ctx(){ if(!ac) ac=new(window.AudioContext||window.webkitAudioContext)(); return ac; }
  function play(type){
    try{
      const a=ctx(), o=a.createOscillator(), g=a.createGain();
      o.connect(g); g.connect(a.destination);
      const t=a.currentTime;
      if(type==='hit'){o.type='sine';o.frequency.setValueAtTime(520,t);o.frequency.exponentialRampToValueAtTime(220,t+.13);g.gain.setValueAtTime(.45,t);g.gain.exponentialRampToValueAtTime(.001,t+.16);o.start();o.stop(t+.16);}
      else if(type==='bounce'){o.type='triangle';o.frequency.setValueAtTime(200,t);o.frequency.exponentialRampToValueAtTime(80,t+.09);g.gain.setValueAtTime(.28,t);g.gain.exponentialRampToValueAtTime(.001,t+.11);o.start();o.stop(t+.11);}
      else if(type==='score'){o.type='square';[523,659,784].forEach((f,i)=>o.frequency.setValueAtTime(f,t+i*.12));g.gain.setValueAtTime(.28,t);g.gain.exponentialRampToValueAtTime(.001,t+.5);o.start();o.stop(t+.5);}
      else if(type==='jump'){o.type='sine';o.frequency.setValueAtTime(300,t);o.frequency.exponentialRampToValueAtTime(600,t+.1);g.gain.setValueAtTime(.2,t);g.gain.exponentialRampToValueAtTime(.001,t+.14);o.start();o.stop(t+.14);}
    }catch(e){}
  }
  return{play};
})();

// ═══════════════════════════════════════════
// PARTICLES
// ═══════════════════════════════════════════
class Particles {
  constructor(){ this.list=[]; }
  dust(x,y,n=8){ for(let i=0;i<n;i++) this.list.push({x,y,vx:(Math.random()-.5)*90,vy:-Math.random()*55-10,life:.6,ml:.6,s:3+Math.random()*5,c:'#d4a47a',type:'dust'}); }
  spark(x,y,n=14,fast=false){
    for(let i=0;i<n;i++){
      const a=Math.PI*2*i/n+Math.random()*.5, sp=(fast?150:90)+Math.random()*110;
      this.list.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-45,life:.45,ml:.45,s:2+Math.random()*5,c:fast?`hsl(${Math.random()*40},100%,60%)`:`hsl(${40+Math.random()*50},100%,60%)`,type:'spark'});
    }
  }
  update(dt){ this.list=this.list.filter(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=100*dt;p.life-=dt;return p.life>0;}); }
  draw(ctx){
    this.list.forEach(p=>{
      const a=p.life/p.ml;
      ctx.save(); ctx.globalAlpha=a*.88; ctx.fillStyle=p.c;
      if(p.type==='spark'){ctx.shadowColor=p.c;ctx.shadowBlur=7;}
      ctx.beginPath(); ctx.arc(p.x,p.y,p.s*Math.sqrt(a),0,Math.PI*2); ctx.fill(); ctx.restore();
    });
  }
}

// ═══════════════════════════════════════════
// CONFETTI
// ═══════════════════════════════════════════
class Confetti {
  constructor(canvas){ this.canvas=canvas; this.ctx=canvas.getContext('2d'); this.pieces=[]; this.running=false; }
  start(){
    this.running=true; this.pieces=[];
    for(let i=0;i<160;i++) this.pieces.push({
      x:Math.random()*this.canvas.width, y:-10-Math.random()*200,
      vx:(Math.random()-.5)*3, vy:2+Math.random()*4,
      rot:Math.random()*360, rotV:(Math.random()-.5)*6,
      w:8+Math.random()*8, h:4+Math.random()*5,
      c:`hsl(${Math.random()*360},80%,60%)`,
    });
    this._loop();
  }
  stop(){ this.running=false; }
  _loop(){
    if(!this.running) return;
    const c=this.ctx, W=this.canvas.width, H=this.canvas.height;
    c.clearRect(0,0,W,H);
    this.pieces.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy; p.rot+=p.rotV;
      if(p.y>H) p.y=-10;
      c.save(); c.translate(p.x,p.y); c.rotate(p.rot*Math.PI/180);
      c.fillStyle=p.c; c.fillRect(-p.w/2,-p.h/2,p.w,p.h); c.restore();
    });
    requestAnimationFrame(()=>this._loop());
  }
}

// ═══════════════════════════════════════════
// PLAYER
// ═══════════════════════════════════════════
class Player {
  constructor(idx, isLocal){
    this.idx=idx; this.isLocal=isLocal;
    this.x = idx===0 ? 220 : GW-220;
    this.y = GROUND_Y-40;
    this.vx=0; this.vy=0;
    this.onGround=true; this.facing=idx===0?1:-1;
    this.state='idle'; this.hitTimer=0; this.jumpTimer=0;
    this.bobT=0; this.bob=0;
    this.trail=[];
    // remote
    this.targetX=this.x; this.targetY=this.y;
    this.remoteState='idle'; this.remoteFacing=this.facing;
  }

  applyInput(keys, dt, ps){
    if(!this.isLocal) return;
    const L = this.idx===0?'a':'ArrowLeft';
    const R = this.idx===0?'d':'ArrowRight';
    const J = this.idx===0?' ':'ArrowUp';

    let mv=0;
    if(keys[L]){mv=-1;this.facing=-1;}
    if(keys[R]){mv=1;this.facing=1;}
    this.vx = mv*PLAYER_SPD;
    if(!mv) this.vx*=.72;

    // Jump / fast fall
    if(keys[J]){
      if(this.onGround && this.jumpTimer<=0){
        this.vy=JUMP_VY; this.onGround=false; this.jumpTimer=.3;
        SFX.play('jump'); ps.dust(this.x, GROUND_Y, 10);
      } else if(!this.onGround && this.vy<0){
        // fast fall — дожать вниз
        this.vy+=FAST_FALL*dt;
      }
    }
    this.jumpTimer=Math.max(0,this.jumpTimer-dt);
  }

  integrate(dt){
    if(!this.isLocal){
      this.x+=(this.targetX-this.x)*Math.min(1,dt*18);
      this.y+=(this.targetY-this.y)*Math.min(1,dt*18);
      this.state=this.remoteState; this.facing=this.remoteFacing; return;
    }
    if(!this.onGround) this.vy+=GRAVITY*dt;
    this.x+=this.vx*dt; this.y+=this.vy*dt;

    if(this.y>=GROUND_Y-40){ this.y=GROUND_Y-40; this.vy=0; this.onGround=true; }

    const half=26;
    if(this.idx===0) this.x=Math.max(half+GOAL_W, Math.min(NET_X-14-half, this.x));
    else             this.x=Math.min(GW-half-GOAL_W, Math.max(NET_X+14+half, this.x));

    this.hitTimer=Math.max(0,this.hitTimer-dt);
    this.jumpTimer=Math.max(0,this.jumpTimer-dt);

    this.state = !this.onGround?'jump': this.hitTimer>0?'hit': Math.abs(this.vx)>30?'run':'idle';
    if(this.state==='idle'){ this.bobT+=dt; this.bob=Math.sin(this.bobT*2.8)*2.5; }
    else this.bob=0;

    this.trail.unshift({x:this.x,y:this.y});
    if(this.trail.length>10) this.trail.pop();
  }

  triggerHit(){ this.hitTimer=.28; }

  draw(ctx){
    if(!this.isLocal){
      this.trail.unshift({x:this.x,y:this.y});
      if(this.trail.length>10) this.trail.pop();
    }
    const isBlk=this.idx===1;
    const dy=this.bob;
    let sx=1,sy=1;
    if(this.state==='jump'){ sx=.86;sy=1.16; }

    // Trail
    this.trail.forEach((t,i)=>{
      ctx.save(); ctx.globalAlpha=.3*(1-i/10);
      ctx.fillStyle=isBlk?'#2a2a3e':'#8888a8';
      ctx.beginPath(); ctx.ellipse(t.x,t.y,14*(1-i/10),18*(1-i/10),0,0,Math.PI*2); ctx.fill(); ctx.restore();
    });

    ctx.save();
    ctx.translate(this.x, this.y+dy);
    ctx.scale(this.facing*sx, sy);
    this._drawCat(ctx, isBlk);
    if(this.hitTimer>0){ ctx.globalAlpha=this.hitTimer*.9; ctx.strokeStyle='#ff4455'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,0,30,0,Math.PI*2); ctx.stroke(); }
    ctx.restore();

    // Name
    ctx.save(); ctx.font='bold 12px Nunito,sans-serif'; ctx.textAlign='center';
    ctx.fillStyle=this.idx===0?'#FF6B9D':'#4ECDC4';
    ctx.fillText(playerNicks[this.idx]||'P'+(this.idx+1), this.x, this.y+dy-50);
    ctx.restore();
  }

  _drawCat(ctx, isBlk){
    // Body
    ctx.fillStyle=isBlk?'#1a1a2e':'#888898';
    ctx.beginPath(); ctx.ellipse(0,8,22,25,0,0,Math.PI*2); ctx.fill();
    // Head
    ctx.fillStyle=isBlk?'#2a2a3e':'#aaaabc';
    ctx.beginPath(); ctx.ellipse(0,-20,20,18,0,0,Math.PI*2); ctx.fill();
    // Ears
    [[-13,-33,-8,-19,-20,-19],[13,-33,20,-19,8,-19]].forEach(([ax,ay,bx,by,cx,cy])=>{
      ctx.fillStyle=isBlk?'#2a2a3e':'#aaaabc';
      ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.lineTo(cx,cy); ctx.fill();
    });
    // Inner ears
    [[-11,-31,-9,-21,-16,-21],[11,-31,16,-21,9,-21]].forEach(([ax,ay,bx,by,cx,cy])=>{
      ctx.fillStyle='#ffb3c6';
      ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.lineTo(cx,cy); ctx.fill();
    });
    // Eyes
    ctx.fillStyle=isBlk?'#f5c542':'#5bc8f5';
    ctx.beginPath(); ctx.ellipse(-7,-21,5,6,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7,-21,5,6,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#111';
    ctx.beginPath(); ctx.ellipse(-7,-21,2.5,4,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7,-21,2.5,4,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.7)';
    ctx.beginPath(); ctx.arc(-5,-23,1.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(9,-23,1.5,0,Math.PI*2); ctx.fill();
    // Nose
    ctx.fillStyle='#ff9eb5'; ctx.beginPath(); ctx.arc(0,-14,2.5,0,Math.PI*2); ctx.fill();
    // Whiskers
    ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.lineWidth=1;
    [[-3,-13,-18,-10],[-3,-13,-18,-15],[3,-13,18,-10],[3,-13,18,-15]].forEach(([x1,y1,x2,y2])=>{
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });
    // Tail
    ctx.strokeStyle=isBlk?'#1a1a2e':'#888898'; ctx.lineWidth=8; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(16,22);
    const tw=Math.sin(Date.now()/200)*8;
    ctx.bezierCurveTo(32,12,40,-3+tw,28,-17+tw); ctx.stroke();
    // Paws
    ctx.fillStyle=isBlk?'#2a2a3e':'#aaaabc';
    ctx.beginPath(); ctx.ellipse(-12,30,9,6,-.2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12,30,9,6,.2,0,Math.PI*2); ctx.fill();
    // Stripes
    if(!isBlk){ ctx.strokeStyle='#666677'; ctx.lineWidth=2.5;
      [[-18,-7,-13,3],[-13,-9,-9,1]].forEach(([x1,y1,x2,y2])=>{ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }); }
  }
}

// ═══════════════════════════════════════════
// BALL
// ═══════════════════════════════════════════
class Ball {
  constructor(){
    this.x=GW/2; this.y=GH/2; this.vx=260; this.vy=-280;
    this.tx=this.x; this.ty=this.y; this.tvx=this.vx; this.tvy=this.vy;
    this.rot=0; this.visible=true; this.trail=[];
    this.fireTimer=0;
  }
  setTarget(x,y,vx,vy){ this.tx=x;this.ty=y;this.tvx=vx;this.tvy=vy; }
  teleport(x,y,vx,vy){ this.x=x;this.y=y;this.vx=vx;this.vy=vy;this.tx=x;this.ty=y;this.tvx=vx;this.tvy=vy;this.trail=[]; }
  update(dt){
    if(!this.visible) return;
    const l=Math.min(1,dt*20);
    this.x+=(this.tx-this.x)*l; this.y+=(this.ty-this.y)*l;
    this.vx+=(this.tvx-this.vx)*l; this.vy+=(this.tvy-this.vy)*l;
    this.rot+=this.vx*dt*.06;
    this.fireTimer=Math.max(0,this.fireTimer-dt);
    this.trail.unshift({x:this.x,y:this.y,v:Math.abs(this.vx)+Math.abs(this.vy)});
    if(this.trail.length>10) this.trail.pop();
  }
  draw(ctx){
    if(!this.visible) return;
    const fast=Math.abs(this.vx)+Math.abs(this.vy)>600;
    // Trail
    this.trail.forEach((t,i)=>{
      const a=(1-i/this.trail.length)*.35;
      const r=BALL_R*(1-i*.07);
      ctx.save(); ctx.globalAlpha=a;
      ctx.fillStyle=fast?`hsl(${30-i*5},100%,55%)`:'#c8e830';
      ctx.beginPath(); ctx.arc(t.x,t.y,Math.max(2,r),0,Math.PI*2); ctx.fill(); ctx.restore();
    });
    // Shadow
    ctx.save(); ctx.globalAlpha=Math.max(0,.2*(1-(GROUND_Y-this.y)/GH));
    ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(this.x,GROUND_Y,BALL_R*.8,4,0,0,Math.PI*2); ctx.fill(); ctx.restore();
    // Ball
    ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(this.rot);
    if(fast){ ctx.shadowColor='#ff6600'; ctx.shadowBlur=18; }
    ctx.fillStyle=fast?'#ff9922':'#c8e830';
    ctx.beginPath(); ctx.arc(0,0,BALL_R,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.55)'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(0,0,BALL_R,-.6,.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,BALL_R,Math.PI-.6,Math.PI+.6); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.38)'; ctx.beginPath(); ctx.ellipse(-4,-4,5,3,-.5,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ═══════════════════════════════════════════
// GAME
// ═══════════════════════════════════════════
class Game {
  constructor(canvas){
    this.canvas=canvas; this.ctx=canvas.getContext('2d');
    this.canvas.width=GW; this.canvas.height=GH;
    this.players=[null,null]; this.ball=new Ball(); this.ps=new Particles();
    this.localIndex=-1; this.scores=[0,0]; this.roomCode='';
    this.state='idle'; this.keys={};
    this.lastMoveSend=0; this.respawnTimer=0;
    this.scoreFlash={on:false,t:0,who:0};
    this.rallyCount=0; this.comboBadge=document.getElementById('combo-badge');
    this._bindInput();
    this.bgDots=Array.from({length:20},()=>({x:Math.random()*GW,y:Math.random()*(GROUND_Y-80),r:1+Math.random()*2,a:.08+Math.random()*.15}));
    this.lastFrameTime=0; this.rafId=null;
  }

  _bindInput(){
    window.addEventListener('keydown',e=>{
      this.keys[e.key]=true;
      if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
    });
    window.addEventListener('keyup',e=>{ this.keys[e.key]=false; });
  }

  start(localIndex, roomCode){
    this.localIndex=localIndex; this.roomCode=roomCode;
    this.scores=[0,0]; this.state='playing'; this.rallyCount=0;
    this.players[0]=new Player(0,localIndex===0);
    this.players[1]=new Player(1,localIndex===1);
    this.ball=new Ball(); this.ps=new Particles();
    document.getElementById('badge-room-code').textContent=roomCode;
    this.lastFrameTime=performance.now();
    this._loop(this.lastFrameTime);
  }

  stop(){ this.state='idle'; if(this.rafId){cancelAnimationFrame(this.rafId);this.rafId=null;} }

  _loop(now){
    this.rafId=requestAnimationFrame(ts=>this._loop(ts));
    const dt=Math.min((now-this.lastFrameTime)/1000,.05);
    this.lastFrameTime=now;
    if(this.state!=='playing') return;
    this._update(dt); this._draw();
  }

  _update(dt){
    const local=this.players[this.localIndex];
    const remote=this.players[1-this.localIndex];
    local.applyInput(this.keys,dt,this.ps);
    local.integrate(dt); remote.integrate(dt);
    this.ball.update(dt); this.ps.update(dt);
    if(this.respawnTimer>0){ this.respawnTimer=Math.max(0,this.respawnTimer-dt); if(this.respawnTimer<=0) this.ball.visible=true; }
    if(this.scoreFlash.on){ this.scoreFlash.t-=dt; if(this.scoreFlash.t<=0) this.scoreFlash.on=false; }
    const now=performance.now();
    if(now-this.lastMoveSend>33){
      this.lastMoveSend=now;
      SocketManager.sendPlayerMove({x:local.x,y:local.y,state:local.state,facing:local.facing});
    }
  }

  _draw(){
    const ctx=this.ctx;
    this._drawBG(ctx);
    this._drawGoals(ctx);
    this.ps.draw(ctx);
    this.ball.draw(ctx);
    this.players.forEach(p=>p&&p.draw(ctx));
    this._drawNet(ctx);
    this._drawScoreFlash(ctx);
    if(this.respawnTimer>0&&!this.ball.visible){
      ctx.save(); ctx.font='bold 90px Nunito,sans-serif'; ctx.textAlign='center';
      ctx.fillStyle='rgba(255,255,255,.8)'; ctx.shadowColor='rgba(0,0,0,.2)'; ctx.shadowBlur=10;
      ctx.fillText(Math.ceil(this.respawnTimer),GW/2,GH/2+30); ctx.restore();
    }
  }

  _drawBG(ctx){
    const sky=ctx.createLinearGradient(0,0,0,GROUND_Y);
    sky.addColorStop(0,'#5bb8e8'); sky.addColorStop(1,'#b8dff5');
    ctx.fillStyle=sky; ctx.fillRect(0,0,GW,GROUND_Y);
    // Трибуны
    ctx.fillStyle='rgba(255,255,255,.12)';
    for(let i=0;i<GW;i+=60){ ctx.fillRect(i,GROUND_Y-180,50,60); ctx.fillRect(i+8,GROUND_Y-230,36,50); }
    // Облака
    [[120,55,50],[370,38,40],[640,65,46],[900,42,38],[1100,60,44]].forEach(([x,y,s])=>this._cloud(ctx,x,y,s));
    // Фоновые точки
    this.bgDots.forEach(d=>{ ctx.save(); ctx.globalAlpha=d.a; ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,Math.PI*2); ctx.fill(); ctx.restore(); });
    // Земля
    const g=ctx.createLinearGradient(0,GROUND_Y-4,0,GH);
    g.addColorStop(0,'#6DBE45'); g.addColorStop(.1,'#5aad32'); g.addColorStop(1,'#3a7a1a');
    ctx.fillStyle=g; ctx.fillRect(0,GROUND_Y-4,GW,GH-GROUND_Y+4);
    ctx.strokeStyle='#88dd50'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,GROUND_Y-4); ctx.lineTo(GW,GROUND_Y-4); ctx.stroke();
  }

  _cloud(ctx,x,y,s){
    ctx.save(); ctx.fillStyle='rgba(255,255,255,.78)';
    ctx.beginPath();
    ctx.arc(x,y,s*.6,0,Math.PI*2); ctx.arc(x+s*.5,y+5,s*.48,0,Math.PI*2);
    ctx.arc(x-s*.45,y+8,s*.43,0,Math.PI*2); ctx.arc(x+s*.22,y+13,s*.47,0,Math.PI*2);
    ctx.fill(); ctx.restore();
  }

  _drawGoals(ctx){
    const pink='#FF6B9D', pinkBg='rgba(255,107,157,0.22)';
    // Левые ворота
    ctx.fillStyle=pinkBg; ctx.fillRect(0,GOAL_TOP,GOAL_W,GROUND_Y-GOAL_TOP);
    ctx.strokeStyle=pink; ctx.lineWidth=4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(0,GOAL_TOP); ctx.lineTo(GOAL_W+4,GOAL_TOP); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(GOAL_W,GOAL_TOP); ctx.lineTo(GOAL_W,GROUND_Y); ctx.stroke();
    ctx.fillStyle=pink; ctx.beginPath(); ctx.arc(GOAL_W,GOAL_TOP,6,0,Math.PI*2); ctx.fill();
    // Правые ворота
    ctx.fillStyle=pinkBg; ctx.fillRect(GW-GOAL_W,GOAL_TOP,GOAL_W,GROUND_Y-GOAL_TOP);
    ctx.strokeStyle=pink; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(GW,GOAL_TOP); ctx.lineTo(GW-GOAL_W-4,GOAL_TOP); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(GW-GOAL_W,GOAL_TOP); ctx.lineTo(GW-GOAL_W,GROUND_Y); ctx.stroke();
    ctx.fillStyle=pink; ctx.beginPath(); ctx.arc(GW-GOAL_W,GOAL_TOP,6,0,Math.PI*2); ctx.fill();
  }

  _drawNet(ctx){
    const nl=NET_X-7, nt=GROUND_Y-NET_H;
    ctx.fillStyle='#8B6346'; ctx.fillRect(nl-4,nt-6,8,NET_H+10);
    ctx.strokeStyle='rgba(255,255,255,.84)'; ctx.lineWidth=1.2;
    for(let x=nl;x<=nl+14;x+=3){ ctx.beginPath(); ctx.moveTo(x,nt); ctx.lineTo(x,GROUND_Y); ctx.stroke(); }
    for(let y=nt;y<=GROUND_Y;y+=12){ ctx.beginPath(); ctx.moveTo(nl-2,y); ctx.lineTo(nl+16,y); ctx.stroke(); }
    ctx.fillStyle='#f0f0f0'; ctx.fillRect(nl-3,nt-6,18,10);
    ctx.fillStyle='#cc4455'; ctx.fillRect(nl-3,nt-2,18,3);
  }

  _drawScoreFlash(ctx){
    if(!this.scoreFlash.on) return;
    ctx.save(); ctx.globalAlpha=Math.min(1,this.scoreFlash.t*2)*.18;
    ctx.fillStyle=this.scoreFlash.who===0?'#FF6B9D':'#4ECDC4';
    ctx.fillRect(0,0,GW,GH); ctx.restore();
  }

  // ── Server events ──
  onBallUpdate(msg){ this.ball.setTarget(msg.x,msg.y,msg.vx,msg.vy); }
  onBounce(msg){ SFX.play('bounce'); if(msg.kind==='ground') this.ps.dust(msg.x,GROUND_Y,5); }
  onHit(msg){
    SFX.play('hit');
    const fast=Math.abs(this.ball.vx)+Math.abs(this.ball.vy)>600;
    this.ps.spark(this.ball.x,this.ball.y,14,fast);
    if(this.players[msg.player]) this.players[msg.player].triggerHit();
    this.rallyCount=msg.rally||0;
    if(this.rallyCount>=3){
      this.comboBadge.textContent='🔥 x'+this.rallyCount;
      this.comboBadge.classList.remove('hidden');
    } else { this.comboBadge.classList.add('hidden'); }
  }
  onRespawn(msg){
    this.ball.visible=false; this.ball.teleport(msg.x,msg.y,msg.vx||0,msg.vy||0);
    this.respawnTimer=msg.delay?msg.delay/1000:1.5;
    this.comboBadge.classList.add('hidden'); this.rallyCount=0;
  }
  onScore(msg){
    this.scores=msg.scores; SFX.play('score');
    this.scoreFlash={on:true,t:.9,who:msg.scorer};
    document.getElementById('score-num-p1').textContent=this.scores[0];
    document.getElementById('score-num-p2').textContent=this.scores[1];
    ['score-num-p1','score-num-p2'].forEach((id,i)=>{
      if(i===msg.scorer){ const el=document.getElementById(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    });
  }
  onOpponentMove(msg){
    const r=this.players[1-this.localIndex]; if(!r) return;
    r.targetX=msg.x; r.targetY=msg.y; r.remoteState=msg.state||'idle'; r.remoteFacing=msg.facing||1;
  }
}

// ═══════════════════════════════════════════
// UI MANAGER
// ═══════════════════════════════════════════
const UIManager = (() => {
  let game=null, confetti=null;

  function showScreen(id){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
  }

  function getNick(){ return (document.getElementById('nick-input')?.value.trim()||'Аноним').slice(0,16); }

  function init(){
    const canvas=document.getElementById('game-canvas');
    function resize(){
      const topH=document.querySelector('.game-ui-top')?.offsetHeight||42;
      const botH=document.querySelector('.game-ui-bottom')?.offsetHeight||24;
      const avW=window.innerWidth, avH=window.innerHeight-topH-botH-8;
      const scale=Math.min(avW/GW, avH/GH);
      canvas.style.width=Math.round(GW*scale)+'px';
      canvas.style.height=Math.round(GH*scale)+'px';
      // Confetti canvas
      const cc=document.getElementById('confetti-canvas');
      if(cc){ cc.width=window.innerWidth; cc.height=window.innerHeight; }
    }
    window.addEventListener('resize',resize); resize();

    game=new Game(canvas);
    confetti=new Confetti(document.getElementById('confetti-canvas'));

    SocketManager.connect();

    // Buttons
    document.getElementById('btn-create').addEventListener('click',()=>{
      const nick=getNick(); playerNicks[0]=nick;
      SocketManager.send({type:'createRoom',nick});
    });
    document.getElementById('btn-join-toggle').addEventListener('click',()=>{
      document.getElementById('join-form').classList.toggle('hidden');
      document.getElementById('room-code-input').focus();
    });
    document.getElementById('btn-join-confirm').addEventListener('click',()=>{
      const code=document.getElementById('room-code-input').value.trim().toUpperCase();
      if(!code) return;
      const nick=getNick(); playerNicks[1]=nick;
      SocketManager.send({type:'joinRoom',code,nick});
    });
    document.getElementById('room-code-input').addEventListener('keydown',e=>{ if(e.key==='Enter') document.getElementById('btn-join-confirm').click(); });
    document.getElementById('btn-copy-code').addEventListener('click',()=>{
      navigator.clipboard?.writeText(document.getElementById('room-code-display').textContent);
      document.getElementById('btn-copy-code').textContent='✅ Скопировано!';
      setTimeout(()=>document.getElementById('btn-copy-code').textContent='📋 Скопировать',2000);
    });
    document.getElementById('btn-rematch').addEventListener('click',()=>SocketManager.sendRematch());
    document.getElementById('btn-menu').addEventListener('click',()=>{
      confetti.stop(); game.stop(); showScreen('screen-menu');
      document.getElementById('join-form').classList.add('hidden');
      document.getElementById('waiting-panel').classList.add('hidden');
      document.getElementById('btn-create').classList.remove('hidden');
      document.getElementById('btn-join-toggle').classList.remove('hidden');
    });
    document.getElementById('btn-disc-menu').addEventListener('click',()=>{
      document.getElementById('overlay-disconnected').classList.add('hidden');
      game.stop(); showScreen('screen-menu');
    });

    // Socket events
    SocketManager.on('connect',()=>console.log('[WS] connected'));

    SocketManager.on('roomCreated',msg=>{
      game.pendingLocalIndex=msg.playerIndex; game.pendingRoomCode=msg.code;
      playerNicks[0]=msg.nick||getNick();
      document.getElementById('label-p1').textContent='😸 '+playerNicks[0];
      document.getElementById('waiting-panel').classList.remove('hidden');
      document.getElementById('room-code-display').textContent=msg.code;
      document.getElementById('btn-create').classList.add('hidden');
      document.getElementById('btn-join-toggle').classList.add('hidden');
    });

    SocketManager.on('roomJoined',msg=>{
      game.pendingLocalIndex=msg.playerIndex; game.pendingRoomCode=msg.code;
      playerNicks[1]=msg.nick||getNick();
      document.getElementById('label-p2').textContent=playerNicks[1]+' 😼';
    });

    SocketManager.on('opponentJoined',msg=>{
      if(msg.nick){
        playerNicks[1]=msg.nick;
        document.getElementById('label-p2').textContent=msg.nick+' 😼';
      }
    });

    SocketManager.on('gameStart',msg=>{
      if(msg.nicks){ playerNicks=msg.nicks; }
      document.getElementById('label-p1').textContent='😸 '+playerNicks[0];
      document.getElementById('label-p2').textContent=playerNicks[1]+' 😼';
      document.getElementById('score-num-p1').textContent='0';
      document.getElementById('score-num-p2').textContent='0';
      showScreen('screen-game');
      game.start(game.pendingLocalIndex??0, game.pendingRoomCode??'');
    });

    SocketManager.on('error',msg=>{
      const el=document.getElementById('join-error');
      el.textContent=msg.message; el.classList.remove('hidden');
      setTimeout(()=>el.classList.add('hidden'),3000);
    });

    SocketManager.on('ballUpdate', msg=>game.onBallUpdate(msg));
    SocketManager.on('bounce',     msg=>game.onBounce(msg));
    SocketManager.on('hit',        msg=>game.onHit(msg));
    SocketManager.on('serveCountdown', msg=>game.onRespawn(msg));
    SocketManager.on('respawn',    msg=>game.onRespawn(msg));
    SocketManager.on('score',      msg=>game.onScore(msg));
    SocketManager.on('opponentMove', msg=>game.onOpponentMove(msg));

    SocketManager.on('gameOver',msg=>{
      game.stop(); confetti.start();
      const wN=msg.nicks?msg.nicks[msg.winner]:playerNicks[msg.winner]||'Игрок '+(msg.winner+1);
      const lN=msg.nicks?msg.nicks[1-msg.winner]:playerNicks[1-msg.winner]||'Игрок '+(2-msg.winner);
      document.getElementById('winner-emoji').textContent=msg.winner===0?'🏆':'🎉';
      document.getElementById('winner-title').textContent=wN+' победил!';
      document.getElementById('winner-phrase').textContent=winPhrase(wN,lN);
      document.getElementById('final-scores').textContent=`${msg.scores[0]} – ${msg.scores[1]}`;
      if(msg.hits){
        document.getElementById('stats-row').innerHTML=
          `<div class="stat-card"><span>${msg.hits[0]}</span>ударов P1</div>`+
          `<div class="stat-card"><span>${msg.hits[1]}</span>ударов P2</div>`;
      }
      showScreen('screen-gameover');
    });

    SocketManager.on('opponentLeft',()=>{
      game.stop(); document.getElementById('overlay-disconnected').classList.remove('hidden');
    });
    SocketManager.on('disconnect',()=>{
      if(game.state==='playing'){ game.stop(); document.getElementById('overlay-disconnected').classList.remove('hidden'); }
    });
  }

  return{init};
})();

window.addEventListener('DOMContentLoaded',()=>UIManager.init());
