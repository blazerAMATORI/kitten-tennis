'use strict';

// ══════════════════════════════════════════════════════
//  CONSTANTS  (match server/server.js)
// ══════════════════════════════════════════════════════
const GW=1280, GH=720, GY=GH-90;     // canvas size, ground y
const NX=GW/2, NH=150;                // net
const BR=22;                          // ball radius
const GRAV=520, BOUNCE=0.80;          // physics
const SPD=310, JV=-580, FALL_BOOST=680; // player
const GOAL_W=32, GOAL_TOP=GY-115;    // goals
const WIN=12;                         // win score
const FIXED_MS=1000/60;               // fixed timestep

// ══════════════════════════════════════════════════════
//  WIN PHRASES
// ══════════════════════════════════════════════════════
const PHRASES=[
  '{w} размазал {l} по корту!','{w} разнёс {l} в пух и прах!',
  '{l} и близко не подошёл к {w}!','{w} — король корта, {l} просто мяч!',
  '{w} гонял {l} как мячик!','{l} плачет, {w} празднует!',
  '{w} втоптал {l} в траву!','{w} дал мастер-класс для {l}!',
  '{w} показал {l} кто тут котик!','{w} унизил {l} по всем статьям!',
];
function phrase(w,l){return PHRASES[Math.floor(Math.random()*PHRASES.length)].replace(/{w}/g,w).replace(/{l}/g,l);}

let nicks=['Игрок 1','Игрок 2'];

// ══════════════════════════════════════════════════════
//  AUDIO
// ══════════════════════════════════════════════════════
const SFX=(()=>{
  let ac;
  const g=()=>{if(!ac)ac=new(window.AudioContext||window.webkitAudioContext)();return ac;};
  return{play(t){
    try{
      const a=g(),o=a.createOscillator(),v=a.createGain();
      o.connect(v);v.connect(a.destination);
      const n=a.currentTime;
      ({
        hit:  ()=>{o.type='sine';   o.frequency.setValueAtTime(500,n);o.frequency.exponentialRampToValueAtTime(200,n+.14);v.gain.setValueAtTime(.4,n);v.gain.exponentialRampToValueAtTime(.001,n+.16);},
        bounce:()=>{o.type='triangle';o.frequency.setValueAtTime(180,n);o.frequency.exponentialRampToValueAtTime(70,n+.09);v.gain.setValueAtTime(.22,n);v.gain.exponentialRampToValueAtTime(.001,n+.11);},
        score: ()=>{o.type='square';[523,659,784].forEach((f,i)=>o.frequency.setValueAtTime(f,n+i*.12));v.gain.setValueAtTime(.22,n);v.gain.exponentialRampToValueAtTime(.001,n+.5);},
        jump:  ()=>{o.type='sine';   o.frequency.setValueAtTime(280,n);o.frequency.exponentialRampToValueAtTime(560,n+.1);v.gain.setValueAtTime(.16,n);v.gain.exponentialRampToValueAtTime(.001,n+.13);}
      }[t]||(() => {}))();
      o.start();o.stop(n+.6);
    }catch(e){}
  }};
})();

// ══════════════════════════════════════════════════════
//  PARTICLES
// ══════════════════════════════════════════════════════
class Particles{
  constructor(){this.p=[];}
  dust(x,y,n=8){
    for(let i=0;i<n;i++)
      this.p.push({x,y,vx:(Math.random()-.5)*85,vy:-Math.random()*55-10,
        life:.6,ml:.6,s:3+Math.random()*5,c:'#d4a87a',hot:false});
  }
  spark(x,y,n=14,hot=false){
    for(let i=0;i<n;i++){
      const a=Math.PI*2*i/n+Math.random()*.5,sp=(hot?150:90)+Math.random()*120;
      this.p.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-40,
        life:.45,ml:.45,s:2+Math.random()*5,
        c:hot?`hsl(${Math.random()*40+10},100%,58%)`:`hsl(${40+Math.random()*50},100%,60%)`,hot});
    }
  }
  update(dt){
    this.p=this.p.filter(p=>{
      p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=110*dt; p.life-=dt; return p.life>0;
    });
  }
  draw(ctx){
    this.p.forEach(p=>{
      const a=p.life/p.ml;
      ctx.save(); ctx.globalAlpha=a*.9; ctx.fillStyle=p.c;
      if(p.hot){ctx.shadowColor=p.c;ctx.shadowBlur=8;}
      ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(1,p.s*Math.sqrt(a)),0,Math.PI*2); ctx.fill();
      ctx.restore();
    });
  }
}

// ══════════════════════════════════════════════════════
//  CONFETTI
// ══════════════════════════════════════════════════════
class Confetti{
  constructor(canvas){this.cv=canvas;this.cx=canvas.getContext('2d');this.pieces=[];this.on=false;}
  start(){
    this.on=true; this.pieces=[];
    const W=this.cv.width,H=this.cv.height;
    for(let i=0;i<180;i++) this.pieces.push({
      x:Math.random()*W, y:-20-Math.random()*300,
      vx:(Math.random()-.5)*3.5, vy:1.5+Math.random()*4,
      rot:Math.random()*360, rv:(Math.random()-.5)*7,
      w:7+Math.random()*9, h:3+Math.random()*5,
      c:`hsl(${Math.random()*360},80%,62%)`
    });
    this._loop();
  }
  stop(){this.on=false;this.cx.clearRect(0,0,this.cv.width,this.cv.height);}
  _loop(){
    if(!this.on)return;
    const c=this.cx,W=this.cv.width,H=this.cv.height;
    c.clearRect(0,0,W,H);
    this.pieces.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy; p.rot+=p.rv;
      if(p.y>H+10){p.y=-10;p.x=Math.random()*W;}
      c.save(); c.translate(p.x,p.y); c.rotate(p.rot*Math.PI/180);
      c.fillStyle=p.c; c.fillRect(-p.w/2,-p.h/2,p.w,p.h); c.restore();
    });
    requestAnimationFrame(()=>this._loop());
  }
}

// ══════════════════════════════════════════════════════
//  PLAYER
// ══════════════════════════════════════════════════════
class Player{
  constructor(idx,isLocal){
    this.idx=idx; this.isLocal=isLocal;
    this.x=idx===0?220:GW-220; this.y=GY-40;
    this.vx=0; this.vy=0; this.onGround=true;
    this.facing=idx===0?1:-1;
    this.state='idle'; this.hitT=0; this.jumpT=0;
    this.bobT=0; this.bob=0; this.trail=[];
    // remote interpolation targets
    this.tx=this.x; this.ty=this.y; this.tState='idle'; this.tFacing=this.facing;
  }

  input(keys,dt,ps){
    if(!this.isLocal)return;
    const L=this.idx===0?'a':'ArrowLeft';
    const R=this.idx===0?'d':'ArrowRight';
    const J=this.idx===0?' ':'ArrowUp';
    const D=this.idx===0?'s':'ArrowDown';
    let mv=0;
    if(keys[L]){mv=-1;this.facing=-1;}
    if(keys[R]){mv=1; this.facing=1;}
    this.vx=mv*SPD;
    if(!mv)this.vx*=.7;

    // JUMP
    if(keys[J]){
      if(this.onGround&&this.jumpT<=0){
        this.vy=JV; this.onGround=false; this.jumpT=.28;
        SFX.play('jump'); ps.dust(this.x,GY,10);
      }
    }
    // FAST FALL — отдельная кнопка S / ↓
    if(keys[D]&&!this.onGround){
      this.vy+=FALL_BOOST*dt;
    }
    this.jumpT=Math.max(0,this.jumpT-dt);
  }

  integrate(dt){
    if(!this.isLocal){
      // Interpolate toward server position
      const s=Math.min(1,dt*20);
      this.x+=(this.tx-this.x)*s; this.y+=(this.ty-this.y)*s;
      this.state=this.tState; this.facing=this.tFacing; return;
    }
    if(!this.onGround)this.vy+=GRAV*dt;
    this.x+=this.vx*dt; this.y+=this.vy*dt;

    // Ground clamp
    if(this.y>=GY-40){this.y=GY-40;this.vy=0;this.onGround=true;}

    // Net wall
    const hw=28;
    if(this.idx===0) this.x=Math.max(GOAL_W+hw, Math.min(NX-12-hw, this.x));
    else             this.x=Math.min(GW-GOAL_W-hw, Math.max(NX+12+hw, this.x));

    this.hitT=Math.max(0,this.hitT-dt);
    this.jumpT=Math.max(0,this.jumpT-dt);
    this.state=!this.onGround?'jump':this.hitT>0?'hit':Math.abs(this.vx)>25?'run':'idle';
    if(this.state==='idle'){this.bobT+=dt;this.bob=Math.sin(this.bobT*2.8)*2.5;}else this.bob=0;

    // Trail
    this.trail.unshift({x:this.x,y:this.y});
    if(this.trail.length>10)this.trail.pop();
  }

  triggerHit(){this.hitT=.3;}

  draw(ctx){
    if(!this.isLocal){this.trail.unshift({x:this.x,y:this.y});if(this.trail.length>10)this.trail.pop();}
    const blk=this.idx===1;
    let sx=1,sy=1;
    if(this.state==='jump'){sx=.85;sy=1.18;}

    // Trail glow
    this.trail.forEach((t,i)=>{
      ctx.save(); ctx.globalAlpha=.28*(1-i/10);
      ctx.fillStyle=blk?'#3a2a6e':'#8888b8';
      ctx.beginPath(); ctx.ellipse(t.x,t.y,14*(1-i/10),18*(1-i/10),0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    });

    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y+this.bob));
    ctx.scale(this.facing*sx, sy);
    this._drawCat(ctx,blk);
    // Hit flash ring
    if(this.hitT>0){
      ctx.globalAlpha=this.hitT;
      ctx.strokeStyle='#ff3344'; ctx.lineWidth=3.5;
      ctx.beginPath(); ctx.arc(0,0,32,0,Math.PI*2); ctx.stroke();
    }
    ctx.restore();

    // Nick label
    ctx.save();
    ctx.font='bold 13px Nunito,Arial,sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillStyle=this.idx===0?'#FF6B9D':'#4ECDC4';
    ctx.shadowColor='rgba(0,0,0,.4)'; ctx.shadowBlur=4;
    ctx.fillText(nicks[this.idx]||'P'+(this.idx+1), Math.round(this.x), Math.round(this.y+this.bob-48));
    ctx.restore();
  }

  _drawCat(ctx,blk){
    const bc=blk?'#1c1c30':'#909098', hc=blk?'#28283e':'#aaaabc';
    // Shadow under cat
    ctx.save(); ctx.globalAlpha=.18; ctx.fillStyle='#000';
    ctx.beginPath(); ctx.ellipse(0,32,20,5,0,0,Math.PI*2); ctx.fill(); ctx.restore();
    // Body
    ctx.fillStyle=bc;
    ctx.beginPath(); ctx.ellipse(0,8,21,25,0,0,Math.PI*2); ctx.fill();
    // Head
    ctx.fillStyle=hc;
    ctx.beginPath(); ctx.ellipse(0,-20,20,18,0,0,Math.PI*2); ctx.fill();
    // Ears
    [[-13,-34,-8,-19,-20,-19],[13,-34,20,-19,8,-19]].forEach(([ax,ay,bx,by,cx,cy])=>{
      ctx.fillStyle=hc; ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.lineTo(cx,cy); ctx.fill();
    });
    [[-11,-31,-9,-21,-16,-21],[11,-31,16,-21,9,-21]].forEach(([ax,ay,bx,by,cx,cy])=>{
      ctx.fillStyle='#ffb3c6'; ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.lineTo(cx,cy); ctx.fill();
    });
    // Eyes
    const ec=blk?'#f5c542':'#5bc8f5';
    ctx.fillStyle=ec;
    ctx.beginPath(); ctx.ellipse(-7,-21,5,6,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7,-21,5,6,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#111';
    ctx.beginPath(); ctx.ellipse(-7,-21,2.5,4,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7,-21,2.5,4,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.arc(-5,-23,1.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(9,-23,1.5,0,Math.PI*2); ctx.fill();
    // Nose + mouth
    ctx.fillStyle='#ff9eb5'; ctx.beginPath(); ctx.arc(0,-14,2.5,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(80,30,30,.45)'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(0,-11); ctx.lineTo(-4,-8); ctx.moveTo(0,-11); ctx.lineTo(4,-8); ctx.stroke();
    // Whiskers
    ctx.strokeStyle='rgba(255,255,255,.55)'; ctx.lineWidth=1;
    [[-3,-13,-18,-10],[-3,-13,-18,-15],[3,-13,18,-10],[3,-13,18,-15]].forEach(([x1,y1,x2,y2])=>{
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });
    // Tail wag
    ctx.strokeStyle=bc; ctx.lineWidth=7; ctx.lineCap='round';
    const tw=Math.sin(Date.now()/200)*9;
    ctx.beginPath(); ctx.moveTo(16,22); ctx.bezierCurveTo(33,12,42,-4+tw,29,-18+tw); ctx.stroke();
    // Paws
    ctx.fillStyle=blk?'#2a2a40':'#aaaabc';
    ctx.beginPath(); ctx.ellipse(-12,31,9,6,-.2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12,31,9,6,.2,0,Math.PI*2); ctx.fill();
    // Stripes on gray
    if(!blk){
      ctx.strokeStyle='rgba(80,80,100,.4)'; ctx.lineWidth=2.5;
      [[-18,-7,-13,3],[-13,-9,-9,1]].forEach(([x1,y1,x2,y2])=>{
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      });
    }
  }
}

// ══════════════════════════════════════════════════════
//  BALL  (client-side interpolation of server state)
// ══════════════════════════════════════════════════════
class Ball{
  constructor(){
    this.x=GW/2; this.y=GY-200;  // spawn above ground!
    this.vx=260; this.vy=-260;
    this.tx=this.x; this.ty=this.y; this.tvx=this.vx; this.tvy=this.vy;
    this.rot=0; this.visible=true; this.trail=[];
  }
  setTarget(x,y,vx,vy){this.tx=x;this.ty=y;this.tvx=vx;this.tvy=vy;}
  teleport(x,y,vx,vy){
    // Spawn safely above ground
    const safeY=Math.min(y, GY-200);
    this.x=x;this.y=safeY;this.vx=vx;this.vy=vy;
    this.tx=x;this.ty=safeY;this.tvx=vx;this.tvy=vy;
    this.trail=[];
  }
  update(dt){
    if(!this.visible)return;
    const l=Math.min(1,dt*14);
    this.x+=(this.tx-this.x)*l; this.y+=(this.ty-this.y)*l;
    this.vx+=(this.tvx-this.vx)*l; this.vy+=(this.tvy-this.vy)*l;
    this.rot+=this.vx*dt*.055;
    // Never go below ground
    if(this.ty>GY-BR) this.ty=GY-BR;
    if(this.y>GY-BR)  this.y=GY-BR;
    this.trail.unshift({x:this.x,y:this.y});
    if(this.trail.length>12)this.trail.pop();
  }
  draw(ctx){
    if(!this.visible)return;
    const spd=Math.abs(this.vx)+Math.abs(this.vy);
    const hot=spd>700;
    // Trail
    this.trail.forEach((t,i)=>{
      const a=(1-i/this.trail.length)*.38;
      ctx.save(); ctx.globalAlpha=a;
      ctx.fillStyle=hot?`hsl(${30-i*3},100%,55%)`:'#b8e020';
      ctx.beginPath(); ctx.arc(Math.round(t.x),Math.round(t.y),Math.max(2,BR*(1-i*.07)),0,Math.PI*2); ctx.fill();
      ctx.restore();
    });
    // Ground shadow
    const sy=Math.max(0,.22*(1-(GY-this.y)/GH));
    ctx.save(); ctx.globalAlpha=sy;
    ctx.fillStyle='rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(Math.round(this.x),GY,BR*.85,4,0,0,Math.PI*2); ctx.fill(); ctx.restore();
    // Ball body
    ctx.save(); ctx.translate(Math.round(this.x),Math.round(this.y)); ctx.rotate(this.rot);
    if(hot){ctx.shadowColor='#ff8800';ctx.shadowBlur=22;}
    ctx.fillStyle=hot?'#ff9922':'#c8e830';
    ctx.beginPath(); ctx.arc(0,0,BR,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.55)'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(0,0,BR,-.6,.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,BR,Math.PI-.6,Math.PI+.6); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.4)';
    ctx.beginPath(); ctx.ellipse(-4,-4,5,3,-.5,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════
//  BACKGROUND RENDERER  (offscreen cache for perf)
// ══════════════════════════════════════════════════════
class Background{
  constructor(){
    this.oc=document.createElement('canvas');
    this.oc.width=GW; this.oc.height=GH;
    this._draw(this.oc.getContext('2d'));
  }
  _draw(c){
    // Sky
    const sky=c.createLinearGradient(0,0,0,GY);
    sky.addColorStop(0,'#4aa8e0'); sky.addColorStop(1,'#aad8f8');
    c.fillStyle=sky; c.fillRect(0,0,GW,GY);

    // ── Tribunes / crowd stands ──
    const tribY=GY-170;
    // Left tribune
    c.fillStyle='#5a8a3a'; c.fillRect(0,tribY,GW/2-20,170);
    // Right tribune
    c.fillStyle='#5a8a3a'; c.fillRect(GW/2+20,tribY,GW/2-20,170);
    // Seat rows
    const seatColors=['#e84393','#4488ff','#ff9922','#44cc44','#ff4455','#aa44ff'];
    for(let row=0;row<5;row++){
      const ry=tribY+12+row*28;
      for(let col=0;col<38;col++){
        const cx=18+col*32+(row%2?16:0);
        c.fillStyle=seatColors[(col+row)%seatColors.length];
        c.fillRect(cx-10,ry,20,20);
        c.fillStyle='rgba(0,0,0,.15)';
        c.fillRect(cx-10,ry+14,20,6);
      }
    }
    // Tribune edges
    c.fillStyle='#3a6a2a'; c.fillRect(0,tribY-8,GW,12);
    c.fillStyle='#2a5a1a'; c.fillRect(0,tribY-14,GW,8);

    // Clouds
    [[150,55,55],[390,38,42],[680,62,50],[960,42,40],[1150,58,46]].forEach(([x,y,s])=>{
      c.fillStyle='rgba(255,255,255,.82)';
      c.beginPath();
      c.arc(x,y,s*.62,0,Math.PI*2); c.arc(x+s*.52,y+5,s*.5,0,Math.PI*2);
      c.arc(x-s*.46,y+8,s*.44,0,Math.PI*2); c.arc(x+s*.24,y+14,s*.48,0,Math.PI*2);
      c.fill();
    });

    // Ground
    const g=c.createLinearGradient(0,GY-4,0,GH);
    g.addColorStop(0,'#5cb83a'); g.addColorStop(.08,'#4aa028'); g.addColorStop(1,'#2e7010');
    c.fillStyle=g; c.fillRect(0,GY-4,GW,GH-GY+4);
    // Court lines
    c.strokeStyle='rgba(255,255,255,.55)'; c.lineWidth=3;
    c.beginPath(); c.moveTo(0,GY-4); c.lineTo(GW,GY-4); c.stroke();
    c.strokeStyle='rgba(255,255,255,.25)'; c.lineWidth=2;
    c.setLineDash([14,10]);
    [[GW*.22],[GW*.78]].forEach(([x])=>{c.beginPath();c.moveTo(x,GY-4);c.lineTo(x,GH);c.stroke();});
    c.setLineDash([]);
    // Side marks P1/P2
    c.fillStyle='rgba(255,255,255,.3)'; c.font='bold 16px Nunito,Arial,sans-serif'; c.textAlign='center';
    c.fillText('P1',GW*.22,GY+30); c.fillText('P2',GW*.78,GY+30);
  }
  draw(ctx){ ctx.drawImage(this.oc,0,0); }
}

// ══════════════════════════════════════════════════════
//  GAME  (main coordinator)
// ══════════════════════════════════════════════════════
class Game{
  constructor(canvas){
    this.cv=canvas; this.ctx=canvas.getContext('2d');
    this.cv.width=GW; this.cv.height=GH;
    this.players=[null,null]; this.ball=new Ball();
    this.ps=new Particles(); this.bg=new Background();
    this.localIdx=-1; this.scores=[0,0]; this.room='';
    this.state='idle'; this.keys={};
    this.respawnT=0; this.scoreFlash={on:false,t:0,who:0};
    this.rally=0; this.lastSend=0;
    this._bindKeys();
    this.raf=null; this.prevT=0; this.lag=0;
    this.comboBadge=document.getElementById('combo-badge');
  }

  _bindKeys(){
    window.addEventListener('keydown',e=>{
      this.keys[e.key]=true;
      if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();
    });
    window.addEventListener('keyup',e=>delete this.keys[e.key]);
  }

  start(localIdx,room){
    this.localIdx=localIdx; this.room=room;
    this.scores=[0,0]; this.state='playing'; this.rally=0;
    this.players[0]=new Player(0,localIdx===0);
    this.players[1]=new Player(1,localIdx===1);
    this.ball=new Ball(); this.ps=new Particles();
    document.getElementById('badge-room-code').textContent=room;
    this.prevT=performance.now(); this.lag=0;
    this._loop();
  }
  stop(){this.state='idle';if(this.raf){cancelAnimationFrame(this.raf);this.raf=null;}}

  // ── Fixed-timestep game loop (no more lag!) ──────────────
  _loop(){
    this.raf=requestAnimationFrame(ts=>{
      if(this.state!=='playing'){this._draw();return;}
      const now=ts, elapsed=Math.min(now-this.prevT,200);
      this.prevT=now; this.lag+=elapsed;
      // Fixed updates
      while(this.lag>=FIXED_MS){
        this._update(FIXED_MS/1000);
        this.lag-=FIXED_MS;
      }
      this._draw();
      this._loop();
    });
  }

  _update(dt){
    dt=Math.min(dt,0.033);
    const local=this.players[this.localIdx];
    const remote=this.players[1-this.localIdx];
    local.input(this.keys,dt,this.ps);
    local.integrate(dt); remote.integrate(dt);
    this.ball.update(dt); this.ps.update(dt);
    if(this.respawnT>0){this.respawnT=Math.max(0,this.respawnT-dt);}
    if(this.scoreFlash.on){this.scoreFlash.t-=dt;if(this.scoreFlash.t<=0)this.scoreFlash.on=false;}
    const now=performance.now();
    if(now-this.lastSend>33){
      this.lastSend=now;
      SocketManager.sendPlayerMove({x:local.x,y:local.y,state:local.state,facing:local.facing});
    }
  }

  _draw(){
    const ctx=this.ctx;
    this.bg.draw(ctx);
    this._drawGoals(ctx);
    this.ps.draw(ctx);
    this.ball.draw(ctx);
    this.players.forEach(p=>p&&p.draw(ctx));
    this._drawNet(ctx);
    if(this.scoreFlash.on){
      ctx.save(); ctx.globalAlpha=Math.min(1,this.scoreFlash.t*2)*.15;
      ctx.fillStyle=this.scoreFlash.who===0?'#FF6B9D':'#4ECDC4';
      ctx.fillRect(0,0,GW,GH); ctx.restore();
    }
    if(this.respawnT>0&&!this.ball.visible){
      ctx.save(); ctx.font='bold 100px Nunito,Arial,sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle='rgba(255,255,255,.85)';
      ctx.shadowColor='rgba(0,0,0,.25)'; ctx.shadowBlur=16;
      ctx.fillText(Math.ceil(this.respawnT),GW/2,GH/2); ctx.restore();
    }
  }

  _drawGoals(ctx){
    const pink='#FF6B9D', bg='rgba(255,107,157,.18)';
    // Left goal
    ctx.fillStyle=bg; ctx.fillRect(0,GOAL_TOP,GOAL_W,GY-GOAL_TOP);
    ctx.strokeStyle=pink; ctx.lineWidth=4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(0,GOAL_TOP); ctx.lineTo(GOAL_W+5,GOAL_TOP); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(GOAL_W,GOAL_TOP); ctx.lineTo(GOAL_W,GY); ctx.stroke();
    ctx.fillStyle=pink; ctx.beginPath(); ctx.arc(GOAL_W,GOAL_TOP,7,0,Math.PI*2); ctx.fill();
    // Right goal
    ctx.fillStyle=bg; ctx.fillRect(GW-GOAL_W,GOAL_TOP,GOAL_W,GY-GOAL_TOP);
    ctx.strokeStyle=pink; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(GW,GOAL_TOP); ctx.lineTo(GW-GOAL_W-5,GOAL_TOP); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(GW-GOAL_W,GOAL_TOP); ctx.lineTo(GW-GOAL_W,GY); ctx.stroke();
    ctx.fillStyle=pink; ctx.beginPath(); ctx.arc(GW-GOAL_W,GOAL_TOP,7,0,Math.PI*2); ctx.fill();
  }

  _drawNet(ctx){
    const nl=NX-7, nt=GY-NH;
    ctx.fillStyle='#7a5836'; ctx.fillRect(nl-5,nt-8,10,NH+12);
    ctx.strokeStyle='rgba(255,255,255,.82)'; ctx.lineWidth=1.2;
    for(let x=nl;x<=nl+14;x+=3){ctx.beginPath();ctx.moveTo(x,nt);ctx.lineTo(x,GY);ctx.stroke();}
    for(let y=nt;y<=GY;y+=12){ctx.beginPath();ctx.moveTo(nl-3,y);ctx.lineTo(nl+17,y);ctx.stroke();}
    ctx.fillStyle='#eeeeee'; ctx.fillRect(nl-4,nt-8,18,12);
    ctx.fillStyle='#cc3344'; ctx.fillRect(nl-4,nt-3,18,4);
  }

  // ── Server message handlers ──────────────────────────────
  onBallUpdate(m){this.ball.setTarget(m.x,m.y,m.vx,m.vy);}
  onBounce(m){SFX.play('bounce');if(m.kind==='ground')this.ps.dust(m.x,GY,5);}
  onHit(m){
    SFX.play('hit');
    const hot=(Math.abs(this.ball.vx)+Math.abs(this.ball.vy))>700;
    this.ps.spark(this.ball.x,this.ball.y,14,hot);
    if(this.players[m.player])this.players[m.player].triggerHit();
    this.rally=m.rally||0;
    if(this.rally>=3){
      this.comboBadge.textContent='🔥 x'+this.rally;
      this.comboBadge.classList.remove('hidden');
    }else this.comboBadge.classList.add('hidden');
  }
  onRespawn(m){
    this.ball.visible=false;
    // Use safe spawn position
    this.ball.teleport(m.x||GW/2, m.y||GY-200, m.vx||260, m.vy||-260);
    this.respawnT=m.delay?m.delay/1000:1.4;
    this.comboBadge.classList.add('hidden'); this.rally=0;
  }
  onScore(m){
    this.scores=m.scores; SFX.play('score');
    this.scoreFlash={on:true,t:.9,who:m.scorer};
    document.getElementById('score-num-p1').textContent=m.scores[0];
    document.getElementById('score-num-p2').textContent=m.scores[1];
    const el=document.getElementById('score-num-p'+(m.scorer+1));
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  onOpponentMove(m){
    const r=this.players[1-this.localIdx]; if(!r)return;
    r.tx=m.x; r.ty=m.y; r.tState=m.state||'idle'; r.tFacing=m.facing||1;
  }
}

// ══════════════════════════════════════════════════════
//  UI MANAGER
// ══════════════════════════════════════════════════════
const UIManager=(()=>{
  let game=null, confetti=null;

  function show(id){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
  }
  function nick(){return(document.getElementById('nick-input')?.value.trim()||'Аноним').slice(0,16);}

  function init(){
    const cv=document.getElementById('game-canvas');

    // Resize canvas display (keep internal 1280×720)
    function resize(){
      const topH=document.querySelector('.game-ui-top')?.offsetHeight||44;
      const botH=document.querySelector('.game-ui-bottom')?.offsetHeight||26;
      const avW=window.innerWidth, avH=window.innerHeight-topH-botH-4;
      const scale=Math.min(avW/GW,avH/GH);
      cv.style.width=Math.floor(GW*scale)+'px';
      cv.style.height=Math.floor(GH*scale)+'px';
      // confetti canvas
      const cc=document.getElementById('confetti-canvas');
      if(cc){cc.width=window.innerWidth;cc.height=window.innerHeight;}
    }
    window.addEventListener('resize',resize); resize();

    game=new Game(cv);
    confetti=new Confetti(document.getElementById('confetti-canvas'));
    SocketManager.connect();

    // ── Buttons ──
    document.getElementById('btn-create').addEventListener('click',()=>{
      nicks[0]=nick();
      SocketManager.send({type:'createRoom',nick:nicks[0]});
    });
    document.getElementById('btn-join-toggle').addEventListener('click',()=>{
      document.getElementById('join-form').classList.toggle('hidden');
      setTimeout(()=>document.getElementById('room-code-input').focus(),100);
    });
    document.getElementById('btn-join-confirm').addEventListener('click',()=>{
      const code=document.getElementById('room-code-input').value.trim().toUpperCase();
      if(!code)return; nicks[1]=nick();
      SocketManager.send({type:'joinRoom',code,nick:nicks[1]});
    });
    document.getElementById('room-code-input').addEventListener('keydown',e=>{
      if(e.key==='Enter')document.getElementById('btn-join-confirm').click();
    });
    document.getElementById('btn-copy-code').addEventListener('click',()=>{
      navigator.clipboard?.writeText(document.getElementById('room-code-display').textContent);
      document.getElementById('btn-copy-code').textContent='✅ Скопировано!';
      setTimeout(()=>document.getElementById('btn-copy-code').textContent='📋 Скопировать',2000);
    });
    document.getElementById('btn-rematch').addEventListener('click',()=>SocketManager.sendRematch());
    document.getElementById('btn-menu').addEventListener('click',()=>{
      confetti.stop(); game.stop(); show('screen-menu');
      document.getElementById('join-form').classList.add('hidden');
      document.getElementById('waiting-panel').classList.add('hidden');
      document.getElementById('btn-create').classList.remove('hidden');
      document.getElementById('btn-join-toggle').classList.remove('hidden');
    });
    document.getElementById('btn-disc-menu').addEventListener('click',()=>{
      document.getElementById('overlay-disconnected').classList.add('hidden');
      game.stop(); show('screen-menu');
    });

    // ── Socket events ──
    SocketManager.on('connect',()=>console.log('[WS] connected'));

    SocketManager.on('roomCreated',m=>{
      game.pendingIdx=m.playerIndex; game.pendingRoom=m.code;
      nicks[0]=m.nick||nick();
      document.getElementById('label-p1').textContent='😸 '+nicks[0];
      document.getElementById('waiting-panel').classList.remove('hidden');
      document.getElementById('room-code-display').textContent=m.code;
      document.getElementById('btn-create').classList.add('hidden');
      document.getElementById('btn-join-toggle').classList.add('hidden');
    });

    SocketManager.on('roomJoined',m=>{
      game.pendingIdx=m.playerIndex; game.pendingRoom=m.code;
      nicks[1]=m.nick||nick();
      document.getElementById('label-p2').textContent=nicks[1]+' 😼';
    });

    SocketManager.on('opponentJoined',m=>{
      if(m.nick){nicks[1]=m.nick; document.getElementById('label-p2').textContent=m.nick+' 😼';}
    });

    SocketManager.on('gameStart',m=>{
      if(m.nicks)nicks=m.nicks;
      document.getElementById('label-p1').textContent='😸 '+nicks[0];
      document.getElementById('label-p2').textContent=nicks[1]+' 😼';
      document.getElementById('score-num-p1').textContent='0';
      document.getElementById('score-num-p2').textContent='0';
      show('screen-game');
      game.start(game.pendingIdx??0, game.pendingRoom??'');
    });

    SocketManager.on('error',m=>{
      const el=document.getElementById('join-error');
      el.textContent=m.message; el.classList.remove('hidden');
      setTimeout(()=>el.classList.add('hidden'),3000);
    });

    SocketManager.on('ballUpdate',  m=>game.onBallUpdate(m));
    SocketManager.on('bounce',      m=>game.onBounce(m));
    SocketManager.on('hit',         m=>game.onHit(m));
    SocketManager.on('serveCountdown',m=>game.onRespawn(m));
    SocketManager.on('respawn',     m=>game.onRespawn(m));
    SocketManager.on('score',       m=>game.onScore(m));
    SocketManager.on('opponentMove',m=>game.onOpponentMove(m));

    SocketManager.on('gameOver',m=>{
      game.stop(); confetti.start();
      const wN=(m.nicks||nicks)[m.winner]||'Игрок '+(m.winner+1);
      const lN=(m.nicks||nicks)[1-m.winner]||'Игрок '+(2-m.winner);
      nicks=m.nicks||nicks;
      document.getElementById('winner-emoji').textContent=m.winner===0?'🏆':'🎉';
      document.getElementById('winner-title').textContent=wN+' победил!';
      document.getElementById('winner-phrase').textContent=phrase(wN,lN);
      document.getElementById('final-scores').textContent=m.scores[0]+' – '+m.scores[1];
      document.getElementById('stats-row').innerHTML=m.hits
        ?`<div class="stat-card"><span>${m.hits[0]}</span>ударов P1</div><div class="stat-card"><span>${m.hits[1]}</span>ударов P2</div>`:'';
      show('screen-gameover');
    });

    SocketManager.on('opponentLeft',()=>{
      game.stop();
      document.getElementById('overlay-disconnected').classList.remove('hidden');
    });
    SocketManager.on('disconnect',()=>{
      if(game.state==='playing'){
        game.stop();
        document.getElementById('overlay-disconnected').classList.remove('hidden');
      }
    });
  }

  return{init};
})();

window.addEventListener('DOMContentLoaded',()=>UIManager.init());
