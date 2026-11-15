// 玩家初始化、移动、受击与炸弹效果。
'use strict';

/* 创建玩家的初始装备和生命状态。 */
NV.makePlayer = (id, mode) => ({
  id,
  x: mode === 2 ? id ? 320 : 160 : 240,
  y: 690,
  color: id ? '#ff65d8' : '#54eaff',
  weapon: 'N',
  level: 1,
  levels: {
    N: 1,
    S: 1,
    L: 1,
    M: 1
  },
  lives: NV.DIFFICULTY.player.lives,
  bombs: Math.min(NV.DIFFICULTY.player.bombs, NV.DIFFICULTY.player.maxBombs),
  score: 0,
  cooldown: .3,
  invincible: NV.DIFFICULTY.player.invincible,
  shield: 0
});
/* 处理护盾、扣命、降级和重生无敌。 */
NV.hitPlayer = function (game, player) {
  if (player.lives <= 0 || game.god || player.invincible > 0) {
    return;
  }
  if (player.shield > 0) {
    player.shield = 0;
    player.invincible = NV.DIFFICULTY.player.shieldInvincible;
    game.spark(player.x, player.y, player.color, 25);
    return;
  }
  player.lives--;
  player.level = Math.max(1, player.level - 1);
  player.levels[player.weapon] = player.level;
  player.invincible = NV.DIFFICULTY.player.invincible;
  game.spark(player.x, player.y, player.color, 35);
  player.x = game.mode === 2 ? player.id ? 320 : 160 : 240;
  player.y = 690;
  game.toast(player.x, 640, player.lives ? 'REBOOT / 重新出击' : 'SIGNAL LOST', player.color);
};
/* 更新玩家操作、炸弹与碰撞判定。 */
NV.updatePlayers = function (game, deltaTime) {
  for (let player of game.players) {
    if (player.lives <= 0) {
      continue;
    }
    player.invincible -= deltaTime;
    player.shield = Math.max(0, player.shield - deltaTime);
    player.cooldown -= deltaTime;
    let controls = NV.input.controls(player.id);
    player.x = NV.clamp(player.x + controls.x * 280 * deltaTime, 19, 461);
    player.y = NV.clamp(player.y + controls.y * 280 * deltaTime, 115, 775);
    if (controls.fire && player.cooldown <= 0) {
      NV.shoot(game, player);
    }
    if (controls.bomb && player.bombs > 0) {
      player.bombs--;
      NV.sound?.bomb();
      game.bullets = [];
      game.flash = .65;
      for (let enemy of game.enemies.concat(game.boss ? [game.boss] : [])) {
        enemy.hp -= NV.DIFFICULTY.player.bombDamage;
        enemy.lastHit = player.id;
      }
      game.toast(240, 430, 'NOVA BOMB', '#ffffff');
    }
    for (let bullet of game.bullets) {
      if (!bullet.dead && Math.hypot(player.x - bullet.x, player.y - bullet.y) < bullet.r + NV.DIFFICULTY.player.bulletRadius) {
        NV.hitPlayer(game, player);
        bullet.dead = true;
      }
    }
    for (let enemy of game.enemies.concat(game.boss ? [game.boss] : [])) {
      if (enemy.hp > 0 && Math.hypot(player.x - enemy.x, player.y - enemy.y) < enemy.r + NV.DIFFICULTY.player.enemyRadius) {
        NV.hitPlayer(game, player);
      }
    }
  }
  game.bullets = game.bullets.filter(bullet => !bullet.dead);
  if (game.players.every(player => player.lives <= 0)) {
    game.finish('gameover');
  }
};
