// 普通敌机的生成、移动、射击与击毁结算。
'use strict';

/* 按关卡难度创建指定类型的敌机。 */
NV.spawnEnemy = function (game, type, x) {
  const d = NV.difficulty(game), c = NV.DIFFICULTY.enemy;
  const hp = type === 2 ? d.heavyHp : d.hp;
  game.enemies.push({
    x,
    y: -35,
    baseX: x,
    type,
    r: type === 2 ? 23 : 16,
    hp,
    maxHp: hp,
    armed: Math.random() < d.armed,
    t: 0,
    fire: d.fireInterval * NV.rand(...c.initialFire),
    speed: d.speed * (type === 1 ? c.fastSpeed : 1),
    lastHit: 0
  });
};
/* 推进敌机行为并结算击毁奖励。 */
NV.updateEnemies = function (game, deltaTime) {
  const d = NV.difficulty(game), c = NV.DIFFICULTY.enemy;
  for (let enemy of game.enemies) {
    enemy.t += deltaTime;
    enemy.speed = d.speed * (enemy.type === 1 ? c.fastSpeed : 1);
    enemy.y += enemy.speed * deltaTime;
    if (enemy.type === 1) {
      enemy.x = enemy.baseX + Math.sin(enemy.t * 2.5) * 45;
    }
    enemy.fire -= deltaTime;
    if (enemy.armed && enemy.fire <= 0 && enemy.y > 10) {
      enemy.fire = d.fireInterval * (enemy.type === 2 ? c.heavyFire : 1);
      let player = game.players.reduce((nearest, candidate) => {
        if (candidate.lives <= 0) return nearest;
        return !nearest || Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) <
          Math.hypot(nearest.x - enemy.x, nearest.y - enemy.y) ? candidate : nearest;
      }, null);
      if (player) {
        let angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        const count = enemy.type === 2 ? NV.smoothCount(d.volley) : 1;
        for (let i = 0; i < count; i++) {
          NV.enemyBullet(game, enemy.x, enemy.y, angle + (i - (count - 1) / 2) * c.spread, d.bulletSpeed);
        }
      }
    }
    if (enemy.hp <= 0) {
      game.award(enemy.lastHit, 100 + enemy.type * 60);
      game.spark(enemy.x, enemy.y, game.theme.accent, 18);
      if (game.killsWithoutDrop >= c.pity || Math.random() < d.dropRate) {
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
