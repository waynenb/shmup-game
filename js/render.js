// Canvas 场景、角色、特效、菜单与 HUD 绘制。
'use strict';

/* 按图层绘制当前帧及对应状态的界面。 */
NV.render = function (game) {
  let context = game.ctx;
  let time = game.clock;
  let theme = game.theme;
  context.fillStyle = theme.bg;
  context.fillRect(0, 0, 480, 800);
  for (let star of game.stars) {
    let y = (star.y + time * star.speed) % 800;
    context.globalAlpha = star.alpha;
    context.fillStyle = theme.accent;
    context.fillRect(star.x, y, star.size, star.size * 2);
  }
  context.globalAlpha = 1;
  NV.renderScene(game, context, time, theme);
  const text = (label, x, y, size = 16, color = '#eaf6ff', align = 'center', maxWidth) => {
    context.font = `${size >= 24 ? 'bold ' : ''}${size}px monospace`;
    context.textAlign = align;
    context.fillStyle = color;
    if (maxWidth) context.fillText(label, x, y, maxWidth);
    else context.fillText(label, x, y);
  };
  const glow = (color, blur = 12) => {
    context.shadowColor = color;
    context.shadowBlur = blur;
  };
  for (let pickup of game.pickups) {
    context.save();
    context.translate(pickup.x, pickup.y);
    context.globalAlpha = .72 + .28 * Math.sin(pickup.t * 6);
    let color = NV.pickupColors[pickup.type];
    glow(color);
    context.fillStyle = '#10192c';
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(-14, -12, 28, 24, 8);
    context.fill();
    context.stroke();
    text(pickup.type, 0, 6, 18, color);
    context.restore();
  }
  for (let shot of game.shots) {
    glow(shot.col);
    context.strokeStyle = shot.col;
    context.lineWidth = shot.r;
    context.beginPath();
    context.moveTo(shot.x, shot.y);
    context.lineTo(shot.x - shot.vx * .025, shot.y + shot.len);
    context.stroke();
    if (shot.homing) {
      context.fillStyle = '#fff';
      context.fillRect(shot.x - 2, shot.y - 3, 4, 7);
    }
  }
  context.shadowBlur = 0;
  for (let enemy of game.enemies) {
    context.save();
    context.translate(enemy.x, enemy.y);
    let color = enemy.type === 2 ? theme.secondary : theme.accent;
    glow(color, 8);
    context.fillStyle = '#151d35';
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, 22);
    context.lineTo(-enemy.r, -10);
    context.lineTo(-8, -5);
    context.lineTo(0, -17);
    context.lineTo(8, -5);
    context.lineTo(enemy.r, -10);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = color;
    context.fillRect(-4, -5, 8, 10);
    context.restore();
  }
  if (game.boss) {
    let boss = game.boss;
    context.save();
    context.translate(boss.x, boss.y);
    glow(theme.secondary, 20);
    context.strokeStyle = theme.secondary;
    context.fillStyle = '#18152d';
    context.lineWidth = 3;
    context.beginPath();
    if (game.stage === 1) {
      context.moveTo(0, 48);
      context.lineTo(-70, -15);
      context.lineTo(-38, -40);
      context.lineTo(0, -15);
      context.lineTo(38, -40);
      context.lineTo(70, -15);
    } else if (game.stage === 2) {
      for (let i = 0; i < 8; i++) {
        let angle = i * Math.PI / 4 + boss.t * .2;
        context.lineTo(Math.cos(angle) * 62, Math.sin(angle) * 50);
      }
    } else if (game.stage === 3) {
      context.moveTo(-78, -30);
      context.lineTo(-78, 23);
      context.lineTo(-26, 15);
      context.lineTo(0, 55);
      context.lineTo(26, 15);
      context.lineTo(78, 23);
      context.lineTo(78, -30);
      context.lineTo(0, -52);
    }
    else {
      // 冰晶六角、熔炉齿轮、都市双翼、轨道星环、母舰八瓣核心。
      const points = [0,0,0,0,6,12,10,16,8][game.stage];
      for (let i=0;i<points*2;i++) {
        const angle = i*Math.PI/points-Math.PI/2;
        const radius = i%2 ? 42 : 76;
        context.lineTo(Math.cos(angle)*radius,Math.sin(angle)*radius*(game.stage===6?.6:1));
      }
    }
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = theme.secondary;
    context.beginPath();
    context.arc(0, 0, 12 + boss.phase * 3, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.fillStyle = '#2b1635';
    context.fillRect(35, 102, 410, 8);
    context.fillStyle = theme.secondary;
    context.fillRect(35, 102, 410 * Math.max(0, boss.hp / boss.maxHp), 8);
    text(boss.name + ' / P' + boss.phase, 240, 96, 10, theme.secondary, 'center', 440);
  }
  if (game.boss && game.boss.warning) {
    const b = game.boss, w = b.warning;
    context.save();
    glow('#ff77df', 16);
    context.strokeStyle = '#ff77df';
    context.lineWidth = 2;
    context.setLineDash([10, 8]);
    context.beginPath();
    if ((b.skill === 'wall' || b.skill === 'rain')) {
      context.moveTo(w.x-w.gap/2, 130); context.lineTo(w.x-w.gap/2, 800);
      context.moveTo(w.x+w.gap/2, 130); context.lineTo(w.x+w.gap/2, 800);
    } else if (b.skill === 'laser' || b.skill === 'homing') {
      context.moveTo(w.x, w.y); context.lineTo(w.x, 800);
    } else if (b.skill === 'cross') {
      context.moveTo(0,w.y); context.lineTo(480,w.y);
      context.moveTo(w.x,80); context.lineTo(w.x,800);
    } else if (b.skill === 'charge') {
      context.moveTo(b.x,b.y); context.lineTo(w.x,NV.DIFFICULTY.skill.chargeY);
    } else {
      context.arc(b.x,b.y,b.r+12+Math.sin(b.t*18)*4,0,Math.PI*2);
    }
    context.stroke(); context.restore();
  }
  for (let bullet of game.bullets) {
    if (bullet.laser || bullet.homing) {
      context.strokeStyle = bullet.col; context.lineWidth = bullet.laser ? 5 : 2;
      context.beginPath(); context.moveTo(bullet.x,bullet.y);
      const length = Math.hypot(bullet.vx,bullet.vy) || 1;
      context.lineTo(bullet.x-bullet.vx/length*20,bullet.y-bullet.vy/length*20); context.stroke();
    }
    glow(bullet.col, 9);
    context.fillStyle = bullet.col;
    context.beginPath();
    context.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fff';
    context.beginPath();
    context.arc(bullet.x, bullet.y, bullet.r * .4, 0, Math.PI * 2);
    context.fill();
  }
  context.shadowBlur = 0;
  for (let player of game.players) {
    if (player.lives <= 0) {
      continue;
    }
    context.save();
    context.translate(player.x, player.y);
    if (player.invincible > 0 && Math.floor(time * 15) % 2) {
      context.globalAlpha = .3;
    }
    glow(player.color, 15);
    context.fillStyle = player.color;
    context.beginPath();
    context.moveTo(-7, 13);
    context.lineTo(0, 28 + Math.sin(time * 35) * 7);
    context.lineTo(7, 13);
    context.fill();
    context.fillStyle = '#12273c';
    context.strokeStyle = player.color;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, -23);
    context.lineTo(9, -2);
    context.lineTo(22, 17);
    context.lineTo(5, 12);
    context.lineTo(0, 17);
    context.lineTo(-5, 12);
    context.lineTo(-22, 17);
    context.lineTo(-9, -2);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = '#e8ffff';
    context.fillRect(-2, -9, 4, 11);
    if (player.shield > 0) {
      context.strokeStyle = '#a7ffff';
      context.globalAlpha = .5 + .2 * Math.sin(time * 6);
      context.beginPath();
      context.arc(0, 0, 32, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }
  for (let particle of game.particles) {
    context.globalAlpha = particle.life / particle.max;
    context.fillStyle = particle.col;
    context.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  context.globalAlpha = 1;
  for (let cue of game.cues) {
    let age = 1 - cue.life / cue.max;
    let label = cue.kind === 'shield' ? 'P' + (cue.playerId + 1) + ' SHIELD BREAK' : 'P' + (cue.playerId + 1) + ' REBOOT';
    context.save();
    context.globalAlpha = Math.max(0, 1 - age);
    context.translate(cue.x, cue.y);
    context.lineWidth = 3;
    glow(cue.kind === 'shield' ? '#a7ffff' : cue.col, 14);
    context.strokeStyle = cue.kind === 'shield' ? '#a7ffff' : cue.col;
    context.beginPath();
    if (cue.kind === 'shield') {
      let radius = 30 + age * 8;
      context.arc(0, 0, radius, .6, Math.PI - .4);
      context.stroke();
      context.beginPath();
      context.arc(0, 0, radius, Math.PI + .6, Math.PI * 2 - .4);
    } else {
      context.arc(0, 0, 28 + age * 34, 0, Math.PI * 2);
      context.moveTo(-10, 0);
      context.lineTo(10, 0);
      context.moveTo(0, -10);
      context.lineTo(0, 10);
    }
    context.stroke();
    text(label, NV.clamp(cue.x, 96, 384) - cue.x, cue.kind === 'shield' ? -46 : 48, 16, cue.col);
    context.restore();
  }
  context.globalAlpha = 1;
  context.shadowBlur = 0;
  for (let message of game.texts) {
    text(message.text, message.x, message.y, 13, message.col);
  }
  if (game.state !== 'menu') {
    context.fillStyle = '#050b19dc';
    context.fillRect(0, 0, 480, 76);
    for (let player of game.players) {
      let x = player.id ? 253 : 16;
      text('P' + (player.id + 1) + '  ' + String(player.score).padStart(7, '0'), x, 22, 15, player.color, 'left');
      text('♥×' + player.lives + '   BOMB ' + player.bombs, x, 43, 12, '#daeaff', 'left', 211);
      text(player.weapon + ' / LV.' + player.level + (player.lives <= 0 ? '  OFFLINE' : ''), x, 62, 12, player.color, 'left');
    }
    text('STAGE 0' + game.stage, 16, 787, 11, theme.accent, 'left');
    text('M: SOUND ' + (NV.audio.muted ? 'OFF' : 'ON'), 240, 787, 10, '#8c9eb9');
    text('HI ' + game.highScore, 464, 787, 11, '#8c9eb9', 'right');
  }
  if (game.state === 'menu') {
    context.fillStyle = '#040919a8';
    context.fillRect(0, 0, 480, 800);
    text('NV / ARCADE SYSTEM', 240, 151, 12, theme.accent);
    text('NEON', 240, 232, 65, '#e9fbff');
    text('VECTOR', 240, 289, 54, theme.accent);
    text('霓 虹 航 线', 240, 328, 21, '#d2b8f6');
    for (let i = 0; i < 2; i++) {
      let y = 437 + i * 57;
      if (game.menu === i) {
        context.fillStyle = theme.accent + '18';
        context.fillRect(85, y - 28, 310, 44);
        context.strokeStyle = theme.accent;
        context.strokeRect(85, y - 28, 310, 44);
      }
      text((game.menu === i ? '▸ ' : '  ') + (i ? '02   双人 / CO-OP' : '01   单人 / SOLO'), 240, y, 20, game.menu === i ? theme.accent : '#8493ae');
    }
    text('↑ ↓ / W S 选择 · ENTER / SPACE 确认', 240, 584, 12);
    text('也可按 1 或 2 直接开始', 240, 610, 12, '#8c9eb9');
    text('M: SOUND ' + (NV.audio.muted ? 'OFF' : 'ON'), 240, 638, 12, '#8c9eb9');
    text('P1  WASD · SPACE · Q', 240, 672, 12, '#54eaff');
    text('P2  方向键 · ENTER · 右 SHIFT', 240, 697, 12, '#ff65d8');
    text('P / ESC 暂停     HI ' + game.highScore, 240, 752, 12, '#8c9eb9');
  }
  if (['intro', 'clear', 'paused', 'gameover', 'victory'].includes(game.state)) {
    context.fillStyle = '#030715b5';
    context.fillRect(0, 260, 480, 267);
    let title = {
      intro: 'STAGE 0' + game.stage,
      clear: 'STAGE CLEAR',
      paused: 'PAUSED',
      gameover: 'SIGNAL LOST',
      victory: 'ALL 8 STAGES CLEAR'
    }[game.state];
    text(title, 240, 349, game.state === 'victory' ? 29 : 38, theme.accent);
    text({
      intro: theme.name,
      clear: '航线净空 · 下一关准备',
      paused: 'P / ESC / START 继续',
      gameover: '游戏结束',
      victory: '核心沉寂，黎明重返地球。'
    }[game.state], 240, 392, 15);
    if (game.state === 'gameover' || game.state === 'victory') {
      text('TOTAL SCORE  ' + game.players.reduce((totalScore, player) => totalScore + player.score, 0), 240, 437, 20);
      text('ENTER / R 返回菜单', 240, 483, 14, '#92a8c6');
    }
  }
  if (game.flash > 0) {
    context.fillStyle = `rgba(195,240,255,${Math.min(.8, game.flash)})`;
    context.fillRect(0, 0, 480, 800);
  }
  if (game.debug) {
    text('DEBUG' + (game.god ? ' · GOD' : ''), 470, 766, 11, '#ffe27a', 'right');
  }
};

// 固定数量的几何图元，无纹理分配；近景/远景使用不同滚动速度。
NV.renderScene = function (game, c, t, theme) {
  c.save(); c.lineWidth=1;
  const stage=game.stage;
  for (let i=0;i<24;i++) {
    const x=(i*137+31)%480, y=(i*97+t*(18+i%3*12))%920-60;
    c.fillStyle=theme.primary+'18'; c.strokeStyle=theme.accent+'38';
    if (stage===1) {
      c.beginPath(); c.ellipse(x,y,75+i%4*16,18+i%3*8,0,0,Math.PI*2); c.fill();
      c.fillStyle=theme.highlight+'0c'; c.fillRect(x-90,y+10,180,3);
    } else if (stage===2) {
      c.beginPath(); c.moveTo(x-50,y); c.quadraticCurveTo(x,y-12,x+65,y); c.stroke();
      if(i%4===0) {c.fillStyle=theme.secondary+'30';c.beginPath();c.moveTo(x,y-35);c.lineTo(x-14,y+35);c.lineTo(x+14,y+35);c.closePath();c.fill();c.fillRect(x-4,y-6,8,25);}
    } else if (stage===3 || stage===4 || stage===5) {
      const side=i%2 ? 480 : 0, width=40+(i*37)%85;
      c.fillStyle=(stage===3 ? theme.secondary : theme.primary)+'28';
      c.beginPath();c.moveTo(side,y-65);c.lineTo(side+(side?-1:1)*width,y-20);c.lineTo(side+(side?-1:1)*width*.7,y+65);c.lineTo(side,y+100);c.closePath();c.fill();c.stroke();
      if(stage===4) {c.fillStyle=theme.highlight+'65';c.fillRect(x,y,2,3);}
      if(stage===5) {c.strokeStyle=theme.highlight+'45';c.beginPath();c.moveTo(x,y);c.lineTo(x+20,y+35);c.lineTo(x-5,y+70);c.stroke();c.fillRect(x,y-15,2,4);}
    } else if(stage===6) {
      const bx=i%2 ? 365 : 8, h=60+i%4*23;
      c.fillStyle=theme.primary+'17';c.fillRect(bx,y,100,h);c.strokeRect(bx,y,100,h);
      c.fillStyle=theme.secondary+'50';for(let j=0;j<4;j++) c.fillRect(bx+12+j*21,y+15,7,3);
    } else if(stage===7) {
      c.beginPath();for(let j=0;j<7;j++) {const a=j*Math.PI*2/7,r=12+i%4*5;c.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r*.7);}c.closePath();c.fill();c.stroke();
      c.strokeStyle=theme.secondary+'18';c.beginPath();c.moveTo(x+40,y-90);c.lineTo(x+55,y-140);c.stroke();
    } else {
      const bx=i%2?410:15;
      c.fillStyle=theme.primary+'13';c.fillRect(bx,y,55,85);c.strokeRect(bx,y,55,85);
      c.fillStyle=theme.secondary+'50';c.fillRect(bx+22,y,6,60);
      for(let j=0;j<5;j++) {c.fillStyle=theme.accent+'25';c.fillRect(bx+5,y+j*14,44,3);}
    }
  }
  if(stage===8) {c.strokeStyle=theme.accent+'20';for(let i=0;i<9;i++) {const y=(i*110+t*40)%900;c.strokeRect(80,y,320,90);}}
  c.restore();
};
