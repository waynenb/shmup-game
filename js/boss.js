// 各关旗舰的运动、分阶段弹幕与击败结算。
'use strict';

/* 清除普通敌机并创建当前关的旗舰。 */
NV.spawnBoss = function (game) {
  if (game.boss) {
    return;
  }
  game.enemies = [];
  let hp = 520 + game.stage * 280;
  game.boss = {
    x: 240,
    y: -90,
    r: 53,
    hp,
    maxHp: hp,
    t: 0,
    fire: 1,
    lastHit: 0,
    phase: 1
  };
  game.toast(240, 310, 'WARNING / 旗舰接近', '#ff647e');
};
/* 更新旗舰阶段与弹幕，并处理击败后的结算。 */
NV.updateBoss = function (game, deltaTime) {
  let boss = game.boss;
  if (!boss) {
    return;
  }
  boss.t += deltaTime;
  boss.y = Math.min(170, boss.y + 90 * deltaTime);
  boss.x = 240 + Math.sin(boss.t * (.6 + game.stage * .15)) * (90 + game.stage * 12);
  boss.phase = boss.hp / boss.maxHp < .32 ? 3 : boss.hp / boss.maxHp < .66 ? 2 : 1;
  boss.fire -= deltaTime;
  if (boss.fire <= 0 && boss.y > 100) {
    boss.fire = .85 - boss.phase * .14 - game.stage * .05;
    let speed = 100 + game.stage * 22 + boss.phase * 13;
    if (game.stage === 1) {
      for (let i = 0; i < 7 + boss.phase * 2; i++) {
        NV.enemyBullet(game, boss.x, boss.y + 30, Math.PI / 2 + (i - (6 + boss.phase * 2) / 2) * .18, speed);
      }
    } else if (game.stage === 2) {
      let count = 12 + boss.phase * 4;
      for (let i = 0; i < count; i++) {
        NV.enemyBullet(game, boss.x, boss.y, Math.PI * 2 * i / count + boss.t * .65, speed, 4, '#c18aff');
      }
    } else {
      for (let side of [-1, 1]) {
        for (let i = 0; i < 9 + boss.phase * 2; i++) {
          NV.enemyBullet(
            game, boss.x + side * 38, boss.y + 18,
            Math.PI / 2 + Math.sin(boss.t) * .5 + (i - (8 + boss.phase * 2) / 2) * .15,
            speed, 4, '#ffbb64'
          );
        }
      }
    }
    if (boss.phase >= 2) {
      for (let player of game.players.filter(player => player.lives > 0)) {
        NV.enemyBullet(game, boss.x, boss.y, Math.atan2(player.y - boss.y, player.x - boss.x), speed * 1.5, 6);
      }
    }
  }
  if (boss.hp <= 0) {
    game.award(boss.lastHit, 3000 * game.stage);
    game.spark(boss.x, boss.y, game.theme.accent, 90);
    ['S', 'L', 'M', 'H', 'B', 'F'].forEach((type, i) => NV.drop(game, 135 + i * 42, 190 + i % 2 * 30, type));
    game.boss = null;
    game.bullets = [];
    game.state = 'clear';
    game.stateTime = 0;
    game.flash = .5;
  }
};
