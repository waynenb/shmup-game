// 关卡主题、波次时间轴与关卡切换。
'use strict';

NV.themes = [{
  name: 'NEON HARBOR / 霓虹港',
  accent: '#49deff',
  secondary: '#ed5fbf',
  bg: '#060e23'
}, {
  name: 'VIOLET RIFT / 紫晶裂隙',
  accent: '#bf86ff',
  secondary: '#5fffc7',
  bg: '#130b27'
}, {
  name: 'SOLAR CITADEL / 日冕要塞',
  accent: '#ffb85b',
  secondary: '#ff587c',
  bg: '#211020'
}];
/* 重置战场并进入关卡介绍，末关后进入胜利状态。 */
NV.beginStage = function (game, stage) {
  if (stage > 3) {
    game.finish('victory');
    return;
  }
  game.stage = stage;
  game.theme = NV.themes[stage - 1];
  game.stageTime = 0;
  game.wave = 0;
  game.killsWithoutDrop = 0;
  game.enemies = [];
  game.boss = null;
  game.bullets = [];
  game.shots = [];
  game.pickups = [];
  game.state = 'intro';
  game.stateTime = 0;
  game.players.forEach(player => {
    player.invincible = Math.max(3, player.invincible);
  });
};
/* 按时间生成波次，清场后召唤旗舰。 */
NV.updateStage = function (game, deltaTime) {
  game.stageTime += deltaTime;
  let interval = 3.5 - game.stage * .35;
  if (game.stageTime > 2 + game.wave * interval && game.wave < 10 + game.stage * 2) {
    let count = 3 + game.stage;
    for (let i = 0; i < count; i++) {
      NV.spawnEnemy(game, (game.wave + i) % 3, 45 + i * 390 / (count - 1));
    }
    game.wave++;
  }
  if (game.wave >= 10 + game.stage * 2 && game.enemies.length === 0 && !game.boss) {
    NV.spawnBoss(game);
  }
};
