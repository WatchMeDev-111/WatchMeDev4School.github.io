(() => {
  // -------------------------------------------------
  // Boneblade — Colosseum (Dash + Arc Attacks + HUD)
  // Shift: dash (i-frames, path damage)
  // Space/Click: directional arc attack (press-only, cooldown)
  // Attack DURING dash => finisher (bigger arc, more dmg)
  // Includes: Game Over menu (Restart / Main Menu)
  // Uses: external player sprite (assets/player_melee_idle.png)
  // -------------------------------------------------

  // Viewport (logical, scaled by your 960x540 canvas)
  const W = 240, H = 135;
  const disp = document.getElementById('screen');
  const dctx = disp.getContext('2d');
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const ctx = off.getContext('2d');
  dctx.imageSmoothingEnabled = false;
  ctx.imageSmoothingEnabled = false;

  // ---------- Sprites ----------
  const SPR = {
    playerIdle: new Image(),
  };
  SPR.playerIdle.src = 'assets/player_melee_idle.png'; // <- adjust if your path differs
  let sprReady = false;
  SPR.playerIdle.onload = () => { sprReady = true; };

  // Draw the player sprite centered near (x,y), facing mouse
  function drawPlayerSprite(x, y, aimAng){
    // base size from the image, with a scale for tuning
    const baseW = SPR.playerIdle.naturalWidth || 32;
    const baseH = SPR.playerIdle.naturalHeight || 32;
    const scale = 0.9; // tweak to fit your taste
    const w = Math.round(baseW * scale);
    const h = Math.round(baseH * scale);

    // flip horizontally if looking left
    const facingLeft = Math.cos(aimAng) < 0;

    // anchor at center-bottom so “feet” feel grounded
    ctx.save();
    const ax = x;
    const ay = y + Math.floor(h * 0.25); // lift a touch above the center
    ctx.translate(ax, ay);
    if (facingLeft) ctx.scale(-1, 1);

    ctx.drawImage(SPR.playerIdle, -Math.floor(w/2), -h, w, h);
    ctx.restore();
  }

  // ---------- Math helpers ----------
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const rand=(a,b)=>a+Math.random()*(b-a);
  const dist2=(x1,y1,x2,y2)=>{const dx=x2-x1,dy=y2-y1;return dx*dx+dy*dy;};
  const len=(x,y)=>Math.hypot(x,y)||1;
  const norm=(x,y)=>{const l=len(x,y);return [x/l,y/l];};
  const angNorm=a=>Math.atan2(Math.sin(a),Math.cos(a)); // normalize to -PI..PI
  const angDiff=(a,b)=>Math.abs(angNorm(a-b));

  // ---------- UI helpers ----------
  function drawPanel(x,y,w,h,alpha=0.35){
    ctx.fillStyle = `rgba(10,15,24,${alpha})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(47,70,110,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);
  }

  function drawOutlinedText(txt, x, y, fill='#cfe6ff'){
    ctx.font = '8px "Press Start 2P"';
    ctx.fillStyle = '#0a0f18';
    ctx.fillText(txt, x-1, y);
    ctx.fillText(txt, x+1, y);
    ctx.fillText(txt, x, y-1);
    ctx.fillText(txt, x, y+1);
    ctx.fillStyle = fill;
    ctx.fillText(txt, x, y);
  }

  function drawBar(x, y, w, h, prog, bg='#27324a', fg='#9bd1ff', label=''){
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
    const pw = Math.floor(clamp(prog,0,1) * w);
    ctx.fillStyle = fg; ctx.fillRect(x, y, pw, h);
    ctx.strokeStyle = '#223049'; ctx.lineWidth = 1;
    ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);
    if (label){
      ctx.font = '6px "Press Start 2P"';
      ctx.fillStyle = '#8fb3df';
      ctx.fillText(label, x + w + 4, y + h - 1);
    }
  }

  // ---------- World / Camera ----------
  const world = { cx:0, cy:0, R:380, wallWidth:6 };
  const cam = { x:0, y:0 };

  // Screen shake + flash
  let shakeT=0, shakeMag=0;
  function addShake(mag=2, time=0.12){ shakeMag=Math.max(shakeMag,mag); shakeT=Math.max(shakeT,time); }
  let flashT=0;
  function addFlash(t=0.06){ flashT=Math.max(flashT,t); }

  // ---------- Player ----------
  const player = {
    x:0,y:0, r:4,
    baseSpeed:1.55,
    hpMax:5, hp:5,
    // Attack (arc)
    attacking:false, atkTimer:0, atkDur:0.18,
    atkCD:0.28, atkCDTimer:0,
    atkRange:18, atkArc:Math.PI*0.45, // ~81°
    atkDmg:1,
    // Dash
    dashing:false, dashTimer:0, dashDur:0.18,
    dashSpeed:4.2, dashCD:0.55, dashCDTimer:0,
    dashDirX:0, dashDirY:0, dashHitRadius:8,
    // Finisher (attack pressed during dash)
    finisher:false, finRange:20, finArc:Math.PI*0.6, finDmg:2, finKb:2.4,
    // Facing
    aimAng:0,
    // i-frames
    iTimer:0
  };

  // ---------- Entities ----------
  let zombies=[];   // {x,y,r,hp,speed,tint,type}
  let parts=[];

  // ---------- Game state / timers ----------
  let wave=0, score=0, spawnLeft=0, waveTimer=0;
  let state='title';
  let last=performance.now()/1000, now=last, dt=0;

  // Game-over menu selection: 0 = Restart, 1 = Main
  let goSel = 0;

  // High scores
  function loadBest(){ try{ return JSON.parse(localStorage.getItem('boneblade_td_arc'))||{wave:0,score:0}; }catch(e){ return {wave:0,score:0}; } }
  let best = loadBest();
  function saveBest(b){ localStorage.setItem('boneblade_td_arc', JSON.stringify(b)); }

  // ---------- Input ----------
  const keys = { w:false,a:false,s:false,d:false, attack:false, dash:false };
  const binds = { KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d', Space:'attack', ShiftLeft:'dash', ShiftRight:'dash' };

  let attackQueued=false; // set on press, consumed once
  const mouse={x:0,y:0,down:false,clicked:false};

  addEventListener('keydown', e=>{
    if (binds[e.code]!=null){ keys[binds[e.code]]=true; e.preventDefault(); }

    if (state === 'gameover'){
      // Game Over menu nav
      if (e.code==='ArrowLeft' || e.code==='KeyA'){ goSel = (goSel+1)%2; }
      if (e.code==='ArrowRight'|| e.code==='KeyD'){ goSel = (goSel+1)%2; }
      if (e.code==='Enter' || e.code==='Space'){
        if (goSel===0) start(); else state='title';
      }
      e.preventDefault();
      return;
    }

    if (e.code==='Space'){ attackQueued=true; }
    if ((e.code==='Space'||e.code==='Enter') && (state==='title')) start();
    if (e.code==='Escape') togglePause();
  });

  addEventListener('keyup', e=>{
    if (binds[e.code]!=null){ keys[binds[e.code]]=false; e.preventDefault(); }
  });

  disp.addEventListener('mousemove', e=>{
    const r=disp.getBoundingClientRect();
    const sx=(e.clientX-r.left)/r.width*W, sy=(e.clientY-r.top)/r.height*H;
    mouse.x = cam.x - W/2 + sx;
    mouse.y = cam.y - H/2 + sy;
  });

  disp.addEventListener('mousedown', (e)=>{
    mouse.down=true; mouse.clicked=true; attackQueued=true;

    // Click buttons on Game Over
    if (state === 'gameover'){
      const r=disp.getBoundingClientRect();
      const sx=(e.clientX-r.left)/r.width*W, sy=(e.clientY-r.top)/r.height*H;
      const btns = getGameOverButtons();
      btns.forEach((b,i)=>{
        if (sx>=b.x && sx<=b.x+b.w && sy>=b.y && sy<=b.y+b.h){
          goSel = i;
          if (i===0) start(); else state='title';
        }
      });
    }
  });
  addEventListener('mouseup', ()=>{ mouse.down=false; });

  // ---------- Flow ----------
  function start(){
    state='play';
    player.x=world.cx; player.y=world.cy;
    player.hp=player.hpMax; player.iTimer=0;
    player.attacking=false; player.atkCDTimer=0;
    player.dashing=false; player.dashCDTimer=0; player.finisher=false;
    zombies.length=0; parts.length=0; score=0; wave=0;
    goSel = 0;
    nextWave();
  }
  function togglePause(){ if(state==='play') state='pause'; else if(state==='pause') state='play'; }
  function gameOver(){
    state='gameover';
    goSel = 0;
    if (wave>best.wave || score>best.score){
      best={wave:Math.max(best.wave,wave),score:Math.max(best.score,score)};
      saveBest(best);
    }
  }

  // ---------- Waves / Spawns ----------
  function nextWave(){
    wave++;
    const total = 10 + Math.floor(wave*2.4);
    spawnLeft=total; waveTimer=0;
    for (let i=0;i<Math.min(6,total);i++){ zombies.push(makeZombie()); spawnLeft--; }
  }
  function makeZombie(){
    const a=Math.random()*Math.PI*2;
    const x=world.cx+Math.cos(a)*world.R, y=world.cy+Math.sin(a)*world.R;
    // Types: normal or runner (faster, 1 HP)
    const runnerChance = Math.min(0.15 + wave*0.02, 0.45);
    const isRunner = Math.random()<runnerChance;
    const base = 0.38 + Math.min(wave*0.05, 1.0);
    return {
      x,y, r:3,
      hp: isRunner ? 1 : (Math.random()<Math.min(0.14+wave*0.02,0.55)?2:1),
      speed: isRunner ? (base*1.65) : rand(base, base+0.28),
      tint: isRunner ? '#9bf27f' : ['#7ecb6f','#6fb86f','#86d77a','#74c16a'][(Math.random()*4)|0],
      type: isRunner ? 'runner' : 'z'
    };
  }

  function bleed(x,y,amt=6,col='#a10'){
    for(let i=0;i<amt;i++){
      parts.push({x,y, vx:rand(-0.5,0.5), vy:rand(-0.7,0.3), t:rand(0.3,0.7), col});
    }
  }

  // Arc hit helper
  function tryArcHit(z, cx, cy, ang, arcWidth, range, dmg, kb=1.6){
    const dx=z.x-cx, dy=z.y-cy;
    const d=Math.hypot(dx,dy);
    if (d>range+z.r) return false;
    const targetAng=Math.atan2(dy,dx);
    if (angDiff(targetAng, ang) <= arcWidth*0.5){
      z.hp -= dmg;
      bleed(z.x,z.y,5);
      const nx = dx/(d||1), ny = dy/(d||1);
      z.x += nx*kb; z.y += ny*kb;
      addShake(2,0.08);
      flashT = Math.max(flashT, 0.03);
      return true;
    }
    return false;
  }

  // ---------- Main loop ----------
  function loop(){
    now=performance.now()/1000; dt=Math.min(0.033, now-last); last=now;

    if (state==='play'){
      // Spawning
      waveTimer+=dt;
      if (spawnLeft>0 && waveTimer>=0.33){ zombies.push(makeZombie()); spawnLeft--; waveTimer=0; }
      if (spawnLeft<=0 && zombies.length===0) nextWave();

      // Aim angle toward mouse
      player.aimAng = Math.atan2(mouse.y-player.y, mouse.x-player.x);

      // Input vector
      let mx=(keys.d?1:0)+(keys.a?-1:0);
      let my=(keys.s?1:0)+(keys.w?-1:0);
      if (mx||my){ const inv=1/Math.hypot(mx,my); mx*=inv; my*=inv; }

      // Dash start (Shift). Direction = WASD if any, else toward mouse
      if (!player.dashing && player.dashCDTimer<=0 && keys.dash){
        let dx=mx, dy=my;
        if (!dx&&!dy){ dx=mouse.x-player.x; dy=mouse.y-player.y; [dx,dy]=norm(dx,dy); }
        player.dashing=true; player.dashTimer=0; player.dashDirX=dx; player.dashDirY=dy;
        player.iTimer = Math.max(player.iTimer, player.dashDur + 0.04); // dash i-frames
        player.dashCDTimer = player.dashCD;
        addShake(2.5,0.1);
      }

      // Attack (press-only) — if pressed during dash, mark as finisher
      if ((attackQueued||mouse.clicked) && player.atkCDTimer<=0){
        player.attacking=true; player.atkTimer=0; player.atkCDTimer=player.atkCD;
        player.finisher = player.dashing;
      }
      attackQueued=false; mouse.clicked=false;

      // Move / Dash
      if (player.dashing){
        player.dashTimer+=dt;
        const t=player.dashTimer/player.dashDur;
        const sp=player.dashSpeed*(1 - Math.min(t,1)*0.35);
        player.x += player.dashDirX*sp;
        player.y += player.dashDirY*sp;
        if (player.dashTimer>=player.dashDur) player.dashing=false;
      } else {
        player.x += mx*player.baseSpeed;
        player.y += my*player.baseSpeed;
      }

      // Keep player inside arena
      const dxW=player.x-world.cx, dyW=player.y-world.cy, dW=Math.hypot(dxW,dyW);
      const maxR=world.R-(world.wallWidth+3);
      if (dW>maxR){ const k=maxR/dW; player.x=world.cx+dxW*k; player.y=world.cy+dyW*k; }

      // Timers
      if (player.atkCDTimer>0) player.atkCDTimer-=dt;
      if (player.iTimer>0) player.iTimer-=dt;
      if (player.dashCDTimer>0) player.dashCDTimer-=dt;

      // Enemies
      for (let i=zombies.length-1;i>=0;i--){
        const z=zombies[i];
        const zx=player.x-z.x, zy=player.y-z.y; const l=len(zx,zy);
        z.x += zx/l * z.speed; z.y += zy/l * z.speed;

        // Keep inside arena
        const dzx=z.x-world.cx, dzy=z.y-world.cy, dz=Math.hypot(dzx,dzy);
        if (dz>world.R-world.wallWidth){ const k=(world.R-world.wallWidth)/dz; z.x=world.cx+dzx*k; z.y=world.cy+dzy*k; }

        // Dash path damage
        if (player.dashing && dist2(z.x,z.y,player.x,player.y) <= (player.dashHitRadius*player.dashHitRadius)){
          z.hp-=1; bleed(z.x,z.y,6); const nx=(z.x-player.x)/(l||1), ny=(z.y-player.y)/(l||1); z.x+=nx*2.2; z.y+=ny*2.2;
          addShake(2,0.06);
        }

        // Directional arc attack
        if (player.attacking){
          player.atkTimer += dt;
          const active = (player.atkTimer <= player.atkDur*0.6);
          const range = player.finisher ? player.finRange : player.atkRange;
          const arc   = player.finisher ? player.finArc   : player.atkArc;
          const dmg   = player.finisher ? player.finDmg   : player.atkDmg;
          const kb    = player.finisher ? player.finKb    : 1.6;

          if (active) tryArcHit(z, player.x, player.y, player.aimAng, arc, range, dmg, kb);
          if (player.atkTimer>=player.atkDur){
            player.attacking=false;
            if (player.finisher){ addShake(3,0.1); addFlash(0.05); }
            player.finisher=false;
          }
        }

        // Death
        if (z.hp<=0){ zombies.splice(i,1); score+= (z.type==='runner'? 12:10); continue; }

        // Touch damage (respect i-frames)
        if (player.iTimer<=0 && dist2(z.x,z.y,player.x,player.y) <= (z.r+player.r-1)*(z.r+player.r-1)){
          player.hp-=1; player.iTimer=0.9; bleed(player.x,player.y,12,'#5cf2c7'); addShake(3,0.12); addFlash(0.06);
          if (player.hp<=0){ gameOver(); break; }
        }
      }

      // Particles
      for (let i=parts.length-1;i>=0;i--){
        const p=parts[i]; p.t-=dt; if (p.t<=0){ parts.splice(i,1); continue; }
        p.vy+=0.03; p.x+=p.vx; p.y+=p.vy;
      }

      // Camera follow + shake
      cam.x = player.x; cam.y = player.y;
      if (shakeT>0){
        shakeT -= dt;
        const m = shakeMag * (shakeT/Math.max(shakeT,0.0001));
        cam.x += (Math.random()*2-1)*m;
        cam.y += (Math.random()*2-1)*m;
      }
    }

    draw();
    requestAnimationFrame(loop);
  }

  // ---------- Draw ----------
  function draw(){
    ctx.fillStyle='#0a0f18'; ctx.fillRect(0,0,W,H);

    // World space (camera)
    ctx.save();
    ctx.translate(-(cam.x - W/2), -(cam.y - H/2));

    drawGround();
    // Ring wall
    ctx.strokeStyle='#2a3b5d'; ctx.lineWidth=world.wallWidth;
    ctx.beginPath(); ctx.arc(world.cx, world.cy, world.R-world.wallWidth/2, 0, Math.PI*2); ctx.stroke();

    // Particles
    parts.forEach(p=>{ ctx.fillStyle=p.col; ctx.fillRect(p.x|0, p.y|0, 1,1); });

    // Zombies
    zombies.forEach(z=>{
      ctx.fillStyle='#0b0f18'; ctx.fillRect((z.x-3)|0, (z.y+2)|0, 6,2);
      ctx.fillStyle=z.tint;    ctx.fillRect((z.x-3)|0, (z.y-5)|0, 6,6);
      ctx.fillStyle='#cdebd2'; ctx.fillRect((z.x-2)|0, (z.y-8)|0, 4,3);
      if (z.type==='runner'){
        ctx.fillStyle='rgba(155,242,127,0.5)';
        ctx.fillRect((z.x-4)|0, (z.y-9)|0, 1,1);
      }
    });

    // Telegraphs
    if (state==='play' && (player.attacking || player.dashing)){
      const r = player.attacking ? (player.finisher?player.finRange:player.atkRange) : player.dashHitRadius;
      ctx.strokeStyle = player.attacking ? 'rgba(155,209,255,0.25)' : 'rgba(92,242,199,0.25)';
      ctx.lineWidth = 1;
      if (player.attacking){
        ctx.beginPath();
        ctx.arc(player.x, player.y, r, player.aimAng - (player.finisher?player.finArc:player.atkArc)/2, player.aimAng + (player.finisher?player.finArc:player.atkArc)/2);
        ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(player.x, player.y, r, 0, Math.PI*2); ctx.stroke();
      }
    }

    // ---------- Player (with sprite) ----------
    // subtle ground shadow
    ctx.fillStyle = '#0b0f18';
    ctx.fillRect((player.x-3)|0, (player.y+2)|0, 6,2);

    // dash & i-frame tints behind sprite
    if (player.dashing){
      ctx.fillStyle='rgba(92,242,199,0.22)';
      ctx.fillRect((player.x-5)|0, (player.y-9)|0, 10,14);
    }
    if (player.iTimer>0 && ((performance.now()/80)|0)%2===0){
      ctx.fillStyle='rgba(255,77,109,0.45)';
      ctx.fillRect((player.x-5)|0, (player.y-9)|0, 10,14);
    }

    if (sprReady){
      drawPlayerSprite(player.x, player.y, player.aimAng);
    } else {
      // fallback rectangles while image loads
      ctx.fillStyle='#eaeff7'; ctx.fillRect((player.x-2)|0, (player.y-6)|0, 4,3);
      ctx.fillStyle='#c2c8d2'; ctx.fillRect((player.x-3)|0, (player.y-3)|0, 6,6);
    }

    ctx.restore();

    // HUD
    drawHUD();

    // Screen flash overlay
    if (flashT>0){
      flashT -= dt;
      ctx.fillStyle = `rgba(255,255,255,${clamp(flashT/0.06,0,1)*0.3})`;
      ctx.fillRect(0,0,W,H);
    }

    // Scale up
    dctx.clearRect(0,0,disp.width,disp.height);
    dctx.drawImage(off, 0,0, disp.width, disp.height);

    // Overlays
    if (state==='title') overlay([
      'BONEBLADE — COLOSSEUM',
      'WASD move • Shift dash (i-frames, path damage)',
      'Space/Click directional arc attack (CD; press only)',
      'Press SPACE or ENTER to Start'
    ]);
    if (state==='pause') overlay(['PAUSED','Press ESC to resume']);
    if (state==='gameover') drawGameOver();
  }

  function drawGround(){
    // Radial rings
    for (let r=40; r<world.R; r+=40){
      ctx.strokeStyle='rgba(32,48,76,0.35)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(world.cx, world.cy, r, 0, Math.PI*2); ctx.stroke();
    }
    // Grid lines
    ctx.strokeStyle='rgba(18,26,42,0.6)'; ctx.lineWidth=1;
    for (let x=world.cx-world.R; x<=world.cx+world.R; x+=20){
      ctx.beginPath(); ctx.moveTo(x, world.cy-world.R); ctx.lineTo(x, world.cy+world.R); ctx.stroke();
    }
    for (let y=world.cy-world.R; y<=world.cy+world.R; y+=20){
      ctx.beginPath(); ctx.moveTo(world.cx-world.R, y); ctx.lineTo(world.cx+world.R, y); ctx.stroke();
    }
  }

  // ---------- HUD (top + bottom) ----------
  function drawHUD(){
    // Top (wave/score/hearts)
    const pad = 4;
    drawPanel(0, 0, W, 18, 0.55);

    drawOutlinedText(`Wave ${String(wave).padStart(2,'0')}`, pad, 10);
    drawOutlinedText(`Score ${String(score).padStart(4,'0')}`, 86, 10);

    for (let i=0;i<player.hpMax;i++){
      const hx = pad + i*8, hy = 12;
      ctx.fillStyle = i<player.hp ? '#ff4d6d' : '#27324a';
      ctx.fillRect(hx, hy, 6, 4);
      ctx.strokeStyle = '#121a2a';
      ctx.strokeRect(hx+0.5, hy+0.5, 5, 3);
    }

    ctx.font = '6px "Press Start 2P"';
    ctx.fillStyle = '#8fb3df';
    const bestTxt = `Best W${best.wave} S${best.score}`;
    ctx.fillText(bestTxt, W - ctx.measureText(bestTxt).width - 4, 10);

    // Bottom (ATK/DASH)
    const bh = 6, bw = 56, gap = 10, panelH = bh + 8;
    const atkProg = 1 - clamp(player.atkCDTimer / player.atkCD, 0, 1);
    const dashProg = 1 - clamp(player.dashCDTimer / player.dashCD, 0, 1);

    drawPanel(0, H - panelH, W, panelH, 0.55);

    const totalW = bw*2 + gap;
    const startX = Math.floor(W/2 - totalW/2);
    const y = H - bh - 4;

    drawBar(startX,          y, bw, bh, atkProg,  '#27324a', '#9bd1ff', 'ATK');
    drawBar(startX + bw+gap, y, bw, bh, dashProg, '#223049', '#5cf2c7', 'DASH');
  }

  // ---------- Overlay (Title / Pause) ----------
  function overlay(lines){
    const boxW = W - 28, boxH = 66;
    const x = 14, y = 26; // between top HUD and bottom bars
    drawPanel(x, y, boxW, boxH, 0.8);
    ctx.font = '8px "Press Start 2P"';
    ctx.fillStyle = '#cfe6ff';
    lines.forEach((txt,i)=>{
      const w = ctx.measureText(txt).width;
      ctx.fillText(txt, x + boxW/2 - w/2, y + 18 + i*12);
    });
  }

  // ---------- Game Over menu ----------
  function getGameOverButtons(){
    const bw = 64, bh = 12, gap = 14;
    const totalW = bw*2 + gap;
    const y = 78; // sits above bottom HUD
    const x0 = Math.floor(W/2 - totalW/2);
    return [
      { x: x0,          y, w: bw, h: bh, label: 'RESTART' },
      { x: x0 + bw+gap, y, w: bw, h: bh, label: 'MAIN' }
    ];
  }

  function drawButton(b, active, tint='#9bd1ff'){
    ctx.fillStyle = 'rgba(10,15,24,0.85)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = active ? tint : 'rgba(47,70,110,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x+0.5, b.y+0.5, b.w-1, b.h-1);

    ctx.font = '6px "Press Start 2P"';
    ctx.fillStyle = active ? tint : '#8fb3df';
    const w = ctx.measureText(b.label).width;
    ctx.fillText(b.label, Math.floor(b.x + b.w/2 - w/2), b.y + b.h - 3);
  }

  function drawGameOver(){
    const boxW = W - 28, boxH = 66;
    const x = 14, y = 26;
    drawPanel(x, y, boxW, boxH, 0.9);

    ctx.font = '8px "Press Start 2P"';
    ctx.fillStyle = '#cfe6ff';
    const title = 'YOU DIED';
    const tW = ctx.measureText(title).width;
    ctx.fillText(title, Math.floor(W/2 - tW/2), y + 18);

    ctx.font = '6px "Press Start 2P"';
    const stats = `Wave ${String(wave).padStart(2,'0')}  Score ${String(score).padStart(4,'0')}`;
    const sW = ctx.measureText(stats).width;
    ctx.fillStyle = '#9bd1ff';
    ctx.fillText(stats, Math.floor(W/2 - sW/2), y + 30);

    const btns = getGameOverButtons();
    drawButton(btns[0], goSel===0, '#ff9bb0'); // Restart
    drawButton(btns[1], goSel===1, '#5cf2c7'); // Main
  }

  // Kickoff
  requestAnimationFrame(loop);
})();
