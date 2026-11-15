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
  game.waveCharge = 1;
  game.firstDrop = false;
  game.firstSupply = false;
  game.killsWithoutDrop = 0;
  game.enemies = [];
  game.boss = null;
  game.bullets = [];
  game.shots = [];
  game.pickups = [];
  game.state = 'intro';
  game.stateTime = 0;
  game.players.forEach(player => {
    player.invincible = Math.max(NV.DIFFICULTY.player.invincible, player.invincible);
  });
};
/* 按时间生成波次，清场后召唤旗舰。 */
NV.updateStage = function (game, deltaTime) {
  game.stageTime += deltaTime;
  const d = NV.difficulty(game), c = NV.DIFFICULTY.stages[game.stage - 1];
  game.waveCharge += deltaTime / d.waveInterval;
  if (game.stage === 1 && !game.firstSupply && game.stageTime >= NV.DIFFICULTY.pickup.firstSupplyTime) {
    const player = game.players.find(p => p.lives > 0);
    if (player) NV.drop(game, player.x, player.y - 80, 'P');
    game.firstSupply = true;
  }
  if (game.stageTime > 2 && game.waveCharge >= 1 && game.wave < c.waves) {
    game.waveCharge -= 1;
    let count = NV.smoothCount(d.count);
    for (let i = 0; i < count; i++) {
      NV.spawnEnemy(game, (game.wave + i) % 3, count <= 1 ? 240 : 45 + i * 390 / (count - 1));
    }
    game.wave++;
  }
  if (game.wave >= c.waves && game.enemies.length === 0 && !game.boss) {
    NV.spawnBoss(game);
  }
};
