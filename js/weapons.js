// 玩家弹型、追踪与碰撞，以及敌方子弹的生成。
'use strict';

NV.weaponColors = {
  N: '#70ddff',
  S: '#ffca64',
  L: '#82ffae',
  M: '#ef92ff'
};
/* 按武器和等级生成子弹，保留玩家归属。 */
NV.shoot = function (game, player) {
  let level = player.level;
  let weapon = player.weapon;
  let color = player.id ? {
    N: player.color,
    S: '#ff83ab',
    L: '#ff9ee8',
    M: '#d86bff'
  }[weapon] : NV.weaponColors[weapon];
  player.cooldown = weapon === 'L' ? .085 : weapon === 'M' ? .29 : weapon === 'N' ? .14 : .17;
  const add = (x, vx, vy, r, damage, len = 14) => game.shots.push({
    x,
    y: player.y - 19,
    vx,
    vy,
    r,
    damage,
    len,
    col: color,
    owner: player.id,
    homing: weapon === 'M',
    life: 3
  });
  if (weapon === 'N') {
    for (let i = 0; i < level; i++) {
      add(player.x + (i - (level - 1) / 2) * 11, 0, -650, 3, 1, 19);
    }
  }
  if (weapon === 'S') {
    for (let i = -level; i <= level; i++) {
      add(player.x, i * 105, -570, 3, 1, 12);
    }
  }
  if (weapon === 'L') {
    for (let i = 0; i < level; i++) {
      add(player.x + (i - (level - 1) / 2) * 14, 0, -1100, 4 + level, 1.25, 66);
    }
  }
  if (weapon === 'M') {
    for (let i = 0; i < level + 1; i++) {
      add(player.x + (i - level / 2) * 16, (i - level / 2) * 90, -360, 5, 2.3, 19);
    }
  }
};
/* 更新追踪、移动与命中，移除失效子弹。 */
NV.updateShots = function (game, deltaTime) {
  for (let shot of game.shots) {
    shot.life -= deltaTime;
    if (shot.homing) {
      let targets = game.enemies.concat(game.boss ? [game.boss] : []).filter(enemy => enemy.y > 0 && enemy.hp > 0);
      let target = targets.sort((firstTarget, secondTarget) =>
        Math.hypot(firstTarget.x - shot.x, firstTarget.y - shot.y) -
        Math.hypot(secondTarget.x - shot.x, secondTarget.y - shot.y)
      )[0];
      if (target) {
        let distance = Math.hypot(target.x - shot.x, target.y - shot.y) || 1;
        shot.vx += ((target.x - shot.x) / distance * 500 - shot.vx) * Math.min(1, deltaTime * 5);
        shot.vy += ((target.y - shot.y) / distance * 500 - shot.vy) * Math.min(1, deltaTime * 5);
      }
    }
    shot.x += shot.vx * deltaTime;
    shot.y += shot.vy * deltaTime;
    for (let enemy of game.enemies.concat(game.boss ? [game.boss] : [])) {
      if (enemy.hp > 0 && Math.hypot(shot.x - enemy.x, shot.y - enemy.y) < enemy.r + shot.r) {
        enemy.hp -= shot.damage;
        enemy.lastHit = shot.owner;
        shot.life = 0;
        game.spark(shot.x, shot.y, shot.col, 3);
        break;
      }
    }
  }
  game.shots = game.shots.filter(shot => shot.life > 0 && shot.y > -90 && shot.y < 850 && shot.x > -50 && shot.x < 530);
};
/* 按方向和速度生成敌方子弹。 */
NV.enemyBullet = function (game, x, y, angle, speed, r = 4, color = '#ff657f') {
  game.bullets.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r,
    col: color
  });
};
