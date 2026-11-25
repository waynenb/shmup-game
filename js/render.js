// Canvas 场景、角色、特效、菜单与 HUD 绘制。只改画法，不改碰撞和规则。
'use strict';

/* 1.5 Hz 连续呼吸，范围落在 min–max，不用开关式闪烁。 */
function breath(time, min, max) {
  return min + (max - min) * (0.5 + 0.5 * Math.sin(time * Math.PI * 3));
}

/* 浮动字离开顶栏和底栏保留带。 */
function floatY(y) {
  return NV.clamp(y, 88, 736);
}

/* 按图层绘制当前帧及对应状态的界面。 */
NV.render = function (game) {
  let context = game.ctx;
  let time = game.clock;
  let theme = game.theme;
  context.shadowBlur = 0;
  context.globalAlpha = 1;
  context.setLineDash?.([]);
  context.fillStyle = '#050914';
  context.fillRect(0, 0, 480, 800);
  NV.renderScene(game, context, time, theme);
  for (let star of game.stars) {
    let y = (star.y + time * star.speed) % 800;
    let bright = star.size > 1.4;
    context.globalAlpha = bright ? .55 : .45;
    context.fillStyle = bright ? '#3B5B87' : '#243B5E';
    context.fillRect(star.x, y, 1, bright ? 4 : 2);
  }
  context.globalAlpha = 1;
  const text = (label, x, y, size = 16, color = '#EDF4FF', align = 'center', maxWidth) => {
    context.font = `${size >= 24 ? '700 ' : '600 '}${size}px "JetBrains Mono", "SF Mono", Consolas, Menlo, monospace`;
    context.textAlign = align;
    context.fillStyle = color;
    if (maxWidth) context.fillText(label, x, y, maxWidth);
    else context.fillText(label, x, y);
  };
  const glow = (color, blur = 6) => {
    context.shadowColor = color;
    context.shadowBlur = Math.min(blur, 6);
  };
  for (let particle of game.particles) {
    context.globalAlpha = Math.min(1, particle.life / particle.max);
    context.fillStyle = particle.col;
    context.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  context.globalAlpha = 1;
  context.shadowBlur = 0;
  for (let pickup of game.pickups) {
    context.save();
    context.translate(pickup.x, pickup.y);
    context.globalAlpha = .72 + .28 * Math.sin(pickup.t * Math.PI * 2);
    let color = NV.pickupColors[pickup.type];
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
  for (let enemy of game.enemies) {
    context.save();
    context.translate(enemy.x, enemy.y);
    let slot = enemy.type === 2 ? '#B36BFF' : enemy.type === 1 ? '#FF9F1C' : '#FF5252';
    if (enemy.type === 2) glow(slot, 4);
    context.fillStyle = '#240A10';
    context.strokeStyle = slot;
    context.lineWidth = 2;
    context.beginPath();
    if (enemy.type === 1) {
      context.moveTo(0, enemy.r);
      context.lineTo(-enemy.r, -enemy.r * .2);
      context.lineTo(-enemy.r * .35, -enemy.r * .85);
      context.lineTo(0, -enemy.r * .35);
      context.lineTo(enemy.r * .35, -enemy.r * .85);
      context.lineTo(enemy.r, -enemy.r * .2);
    } else if (enemy.type === 2) {
      context.moveTo(0, enemy.r * .9);
      context.lineTo(-enemy.r, enemy.r * .2);
      context.lineTo(-enemy.r * .72, -enemy.r * .85);
      context.lineTo(0, -enemy.r * .2);
      context.lineTo(enemy.r * .72, -enemy.r * .85);
      context.lineTo(enemy.r, enemy.r * .2);
    } else {
      context.moveTo(0, enemy.r * .85);
      context.lineTo(-enemy.r * .55, -enemy.r * .2);
      context.lineTo(0, -enemy.r * .9);
      context.lineTo(enemy.r * .55, -enemy.r * .2);
    }
    context.closePath();
    context.fill();
    context.stroke();
    context.shadowBlur = 0;
    context.restore();
  }
  if (game.boss) {
    let boss = game.boss;
    context.save();
    context.translate(boss.x, boss.y);
    glow(theme.secondary, 4);
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
    } else {
      const points = [0, 0, 0, 0, 6, 12, 10, 16, 8][game.stage];
      for (let i = 0; i < points * 2; i++) {
        const angle = i * Math.PI / points - Math.PI / 2;
        const radius = i % 2 ? 42 : 76;
        context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius * (game.stage === 6 ? .6 : 1));
      }
    }
    context.closePath();
    context.fill();
    context.stroke();
    context.shadowBlur = 0;
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
    context.shadowBlur = 0;
    context.strokeStyle = '#ff77df';
    context.lineWidth = 2;
    context.setLineDash([10, 8]);
    context.beginPath();
    if (b.skill === 'wall' || b.skill === 'rain') {
      context.moveTo(w.x - w.gap / 2, 130); context.lineTo(w.x - w.gap / 2, 800);
      context.moveTo(w.x + w.gap / 2, 130); context.lineTo(w.x + w.gap / 2, 800);
    } else if (b.skill === 'laser' || b.skill === 'homing') {
      context.moveTo(w.x, w.y); context.lineTo(w.x, 800);
    } else if (b.skill === 'cross') {
      context.moveTo(0, w.y); context.lineTo(480, w.y);
      context.moveTo(w.x, 80); context.lineTo(w.x, 800);
    } else if (b.skill === 'charge') {
      context.moveTo(b.x, b.y); context.lineTo(w.x, NV.DIFFICULTY.skill.chargeY);
    } else {
      context.arc(b.x, b.y, b.r + 12, 0, Math.PI * 2);
    }
    context.stroke();
    context.setLineDash([]);
    context.restore();
  }
  for (let player of game.players) {
    if (player.lives <= 0) continue;
    let hull = player.id ? '#FF66C4' : '#38F2FF';
    let fill = player.id ? '#290B22' : '#092233';
    context.save();
    context.translate(player.x, player.y);
    context.globalAlpha = player.invincible > 0 ? breath(time, .55, 1) : 1;
    glow(hull, 6);
    context.strokeStyle = hull;
    context.fillStyle = hull;
    context.beginPath();
    context.moveTo(-5, 12);
    context.lineTo(0, 22 + Math.sin(time * Math.PI * 2) * 3);
    context.lineTo(5, 12);
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = fill;
    context.lineWidth = 2;
    context.beginPath();
    if (player.id) {
      context.moveTo(-8, -23);
      context.lineTo(-18, -6);
      context.lineTo(-22, 17);
      context.lineTo(-6, 8);
      context.lineTo(0, -8);
      context.lineTo(6, 8);
      context.lineTo(22, 17);
      context.lineTo(18, -6);
      context.lineTo(8, -23);
      context.lineTo(0, -10);
    } else {
      context.moveTo(0, -23);
      context.lineTo(5, -6);
      context.lineTo(22, 17);
      context.lineTo(4, 8);
      context.lineTo(0, 14);
      context.lineTo(-4, 8);
      context.lineTo(-22, 17);
      context.lineTo(-5, -6);
    }
    context.closePath();
    context.fill();
    context.strokeStyle = hull;
    context.stroke();
    context.fillStyle = '#e8ffff';
    context.fillRect(player.id ? -6 : -1.5, -8, player.id ? 3 : 3, 8);
    if (player.id) context.fillRect(3, -8, 3, 8);
    context.restore();
    if (player.shield > 0) {
      context.save();
      context.translate(player.x, player.y);
      context.rotate(time * 20 * Math.PI / 180);
      context.globalAlpha = breath(time, .7, 1);
      context.strokeStyle = '#5CA8FF';
      context.lineWidth = 2;
      context.beginPath();
      for (let i = 0; i < 6; i++) {
        let angle = -Math.PI / 2 + i * Math.PI / 3;
        context.lineTo(Math.cos(angle) * 32, Math.sin(angle) * 32);
      }
      context.closePath();
      context.stroke();
      context.restore();
    }
  }
  context.shadowBlur = 0;
  context.globalAlpha = 1;
  for (let shot of game.shots) {
    context.strokeStyle = shot.col;
    context.lineWidth = shot.r + 1.5;
    context.globalAlpha = .25;
    context.beginPath();
    context.moveTo(shot.x, shot.y);
    context.lineTo(shot.x - shot.vx * .025, shot.y + shot.len);
    context.stroke();
    context.globalAlpha = 1;
    context.lineWidth = shot.r;
    context.beginPath();
    context.moveTo(shot.x, shot.y);
    context.lineTo(shot.x - shot.vx * .025, shot.y + shot.len);
    context.stroke();
    context.fillStyle = shot.owner ? '#FF99D8' : '#7AF7FF';
    context.fillRect(shot.x - 1.5, shot.y - 1.5, 3, 3);
  }
  for (let cue of game.cues) {
    let age = 1 - cue.life / cue.max;
    let label = cue.kind === 'shield' ? 'P' + (cue.playerId + 1) + ' SHIELD BREAK' : 'P' + (cue.playerId + 1) + ' REBOOT';
    let labelY = floatY(cue.y + (cue.kind === 'shield' ? -46 : 48));
    context.save();
    context.translate(cue.x, cue.y);
    context.lineWidth = 2;
    context.shadowBlur = 0;
    if (cue.kind === 'shield') {
      let fade = Math.max(0, 1 - age / .3125);
      context.globalAlpha = fade;
      context.strokeStyle = '#5CA8FF';
      let reach = 16 + age * 28;
      for (let corner of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        context.beginPath();
        context.moveTo(corner[0] * 8, corner[1] * 8);
        context.lineTo(corner[0] * reach, corner[1] * reach * .3);
        context.lineTo(corner[0] * reach * .3, corner[1] * reach);
        context.stroke();
      }
    } else {
      context.globalAlpha = Math.max(0, 1 - age);
      context.strokeStyle = cue.col;
      context.setLineDash([6, 5]);
      context.lineDashOffset = -time * 30;
      context.beginPath();
      context.arc(0, 0, 30, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
    }
    context.globalAlpha = Math.max(0, 1 - age);
    text(label, NV.clamp(cue.x, 96, 384) - cue.x, labelY - cue.y, 16, cue.col);
    context.restore();
  }
  context.globalAlpha = 1;
  context.shadowBlur = 0;
  for (let message of game.texts) {
    text(message.text, message.x, floatY(message.y), 13, message.col);
  }
  for (let bullet of game.bullets) {
    let rim = bullet.laser ? '#FF9E1B' : bullet.homing ? '#C266FF' : '#FF3355';
    context.strokeStyle = rim;
    context.fillStyle = rim;
    context.lineWidth = 1.5;
    context.beginPath();
    if (bullet.laser) {
      let length = Math.hypot(bullet.vx, bullet.vy) || 1;
      context.moveTo(bullet.x, bullet.y);
      context.lineTo(bullet.x - bullet.vx / length * bullet.r, bullet.y - bullet.vy / length * bullet.r);
      context.lineWidth = Math.max(1.5, bullet.r);
      context.stroke();
    } else if (bullet.homing) {
      context.moveTo(bullet.x, bullet.y - bullet.r);
      context.lineTo(bullet.x + bullet.r, bullet.y);
      context.lineTo(bullet.x, bullet.y + bullet.r);
      context.lineTo(bullet.x - bullet.r, bullet.y);
      context.closePath();
      context.stroke();
    } else {
      context.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
      context.stroke();
    }
  }
  for (let bullet of game.bullets) {
    if (bullet.y <= 64 || bullet.y >= 772) continue;
    context.fillStyle = '#FFF8EB';
    context.beginPath();
    context.arc(bullet.x, bullet.y, Math.max(1.2, bullet.r * .42), 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  if (game.state !== 'menu') {
    context.fillStyle = 'rgba(6, 11, 23, 0.88)';
    context.fillRect(0, 0, 480, 64);
    context.fillRect(0, 772, 480, 28);
    context.fillStyle = '#1F3354';
    context.fillRect(0, 64, 480, 1);
    context.fillRect(0, 772, 480, 1);
    for (let player of game.players) {
      let x = player.id ? 253 : 16;
      let tag = player.id ? '#FF66C4' : '#38F2FF';
      text('P' + (player.id + 1) + '  ' + String(player.score).padStart(7, '0'), x, 22, 15, tag, 'left');
      text('♥×' + player.lives + '   BOMB ' + player.bombs, x, 42, 15, '#EDF4FF', 'left', 211);
      text(player.weapon + ' / LV.' + player.level + (player.lives <= 0 ? '  OFFLINE' : ''), x, 58, 12, tag, 'left');
    }
    text('STAGE 0' + game.stage, 16, 790, 11, '#8EA6C8', 'left');
    text('M: SOUND ' + (NV.audio.muted ? 'OFF' : 'ON'), 240, 790, 11, '#8EA6C8');
    text('HI ' + game.highScore, 464, 790, 11, '#8EA6C8', 'right');
  }
  if (game.state === 'menu') {
    context.fillStyle = '#050914e6';
    context.fillRect(0, 0, 480, 800);
    text('NV / ARCADE SYSTEM', 240, 151, 12, '#8EA6C8');
    text('NEON', 240, 232, 65, '#EDF4FF');
    text('VECTOR', 240, 289, 54, '#38F2FF');
    text('霓 虹 航 线', 240, 328, 21, '#d2b8f6');
    for (let i = 0; i < 2; i++) {
      let y = 437 + i * 57;
      if (game.menu === i) {
        context.fillStyle = '#38F2FF18';
        context.fillRect(85, y - 28, 310, 44);
        context.strokeStyle = '#38F2FF';
        context.strokeRect(85, y - 28, 310, 44);
      }
      text((game.menu === i ? '▸ ' : '  ') + (i ? '02   双人 / CO-OP' : '01   单人 / SOLO'), 240, y, 20, game.menu === i ? '#38F2FF' : '#8EA6C8');
    }
    text('↑ ↓ / W S 选择 · ENTER / SPACE 确认', 240, 584, 12);
    text('也可按 1 或 2 直接开始', 240, 610, 12, '#8EA6C8');
    text('M: SOUND ' + (NV.audio.muted ? 'OFF' : 'ON'), 240, 638, 12, '#8EA6C8');
    text('P1  WASD · SPACE · Q', 240, 672, 12, '#38F2FF');
    text('P2  方向键 · ENTER · 右 SHIFT', 240, 697, 12, '#FF66C4');
    text('P / ESC 暂停     HI ' + game.highScore, 240, 752, 12, '#8EA6C8');
  }
  if (['intro', 'clear', 'paused', 'gameover', 'victory'].includes(game.state)) {
    context.fillStyle = '#050914cc';
    context.fillRect(0, 260, 480, 267);
    let title = {
      intro: 'STAGE 0' + game.stage,
      clear: 'STAGE CLEAR',
      paused: 'PAUSED',
      gameover: 'SIGNAL LOST',
      victory: 'ALL 8 STAGES CLEAR'
    }[game.state];
    text(title, 240, 349, game.state === 'victory' ? 29 : 38, '#38F2FF');
    text({
      intro: theme.name,
      clear: '航线净空 · 下一关准备',
      paused: 'P / ESC / START 继续',
      gameover: '游戏结束',
      victory: '核心沉寂，黎明重返地球。'
    }[game.state], 240, 392, 15);
    if (game.state === 'gameover' || game.state === 'victory') {
      text('TOTAL SCORE  ' + game.players.reduce((totalScore, player) => totalScore + player.score, 0), 240, 437, 20);
      text('ENTER / R 返回菜单', 240, 483, 14, '#8EA6C8');
    }
  }
  if (game.flash > 0) {
    context.fillStyle = `rgba(195,240,255,${Math.min(.8, game.flash)})`;
    context.fillRect(0, 0, 480, 800);
  }
  if (game.debug) {
    text('DEBUG' + (game.god ? ' · GOD' : ''), 464, 790, 11, '#FFB833', 'right');
  }
};

/* 柔和星云和竖向格线，没有描边椭圆，也没有横向硬边。 */
NV.renderScene = function (game, c, t) {
  c.save();
  c.shadowBlur = 0;
  c.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const x = (i * 97 + 30) % 480;
    const y = (i * 160 + t * 10) % 980 - 90;
    c.fillStyle = 'rgba(14, 26, 46, 0.28)';
    c.beginPath();
    c.ellipse(x, y, 110, 42, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = 'rgba(22, 38, 66, 0.22)';
  c.beginPath();
  for (let x = 48; x < 480; x += 48) {
    c.moveTo(x, 64);
    c.lineTo(x, 772);
  }
  c.stroke();
  c.restore();
};
