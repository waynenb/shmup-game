// 普通敌机的生成、移动、射击与击毁结算。
'use strict';

/* 按关卡难度创建指定类型的敌机。 */
NV.spawnEnemy = function (game, type, x) {
  let stage = game.stage;
  game.enemies.push({
    x,
    y: -35,
    baseX: x,
    type,
    r: type === 2 ? 23 : 16,
    hp: type !== 2 && stage === 1 ? 3 : (type === 2 ? 13 : 3) + stage * 2,
    maxHp: 13 + stage * 2,
    t: 0,
    fire: NV.rand(.6, 1.8),
    speed: 55 + stage * 17 + (type === 1 ? 35 : 0),
    lastHit: 0
  });
};
/* 推进敌机行为并结算击毁奖励。 */
NV.updateEnemies = function (game, deltaTime) {
  for (let enemy of game.enemies) {
    enemy.t += deltaTime;
    enemy.y += enemy.speed * deltaTime;
    if (enemy.type === 1) {
      enemy.x = enemy.baseX + Math.sin(enemy.t * 2.5) * 45;
    }
    enemy.fire -= deltaTime;
    if (enemy.fire <= 0 && enemy.y > 10) {
      enemy.fire = (enemy.type === 2 ? 1 : 1.9) - game.stage * .16;
      let player = game.players.reduce((nearest, candidate) => {
        if (candidate.lives <= 0) return nearest;
        return !nearest || Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) <
          Math.hypot(nearest.x - enemy.x, nearest.y - enemy.y) ? candidate : nearest;
      }, null);
      if (player) {
        let angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        for (let i = 0; i < (enemy.type === 2 ? 3 : 1); i++) {
          NV.enemyBullet(game, enemy.x, enemy.y, angle + (i - (enemy.type === 2 ? 1 : 0)) * .2, 115 + game.stage * 25);
        }
      }
    }
    if (enemy.hp <= 0) {
      game.award(enemy.lastHit, 100 + enemy.type * 60);
      game.spark(enemy.x, enemy.y, game.theme.accent, 18);
      if (game.killsWithoutDrop >= 6 || Math.random() < .3) {
        NV.drop(game, enemy.x, enemy.y);
        game.killsWithoutDrop = 0;
      } else {
        game.killsWithoutDrop++;
      }
      enemy.dead = true;
    }
  }
  game.enemies = game.enemies.filter(enemy => !enemy.dead && enemy.y < 850);
};
