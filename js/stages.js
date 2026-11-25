// 关卡主题、波次时间轴与关卡切换。
'use strict';

NV.themes = [
  {
    "name": "CLOUD FRONT / 近地云层",
    "boss": "天隼 / SKY TALON",
    "bg": "#081d34",
    "primary": "#65d9ff",
    "accent": "#65d9ff",
    "secondary": "#e7bfff",
    "highlight": "#ffdf91"
  },
  {
    "name": "TIDAL FLEET / 海上舰队",
    "boss": "潮汐铁甲 / TIDAL ARMOR",
    "bg": "#051f2a",
    "primary": "#41cecc",
    "accent": "#41cecc",
    "secondary": "#ff9b74",
    "highlight": "#bdefff"
  },
  {
    "name": "DUNE CANYON / 沙漠峡谷",
    "boss": "砂岩巨蝎 / DUNE SCORPION",
    "bg": "#291b21",
    "primary": "#efbc76",
    "accent": "#efbc76",
    "secondary": "#e87765",
    "highlight": "#ffe5a3"
  },
  {
    "name": "FROZEN REACH / 极光冰原",
    "boss": "冰晶冠冕 / FROST CROWN",
    "bg": "#0b2230",
    "primary": "#91edff",
    "accent": "#91edff",
    "secondary": "#aaa1ff",
    "highlight": "#e0ffff"
  },
  {
    "name": "MAGMA DESCENT / 熔岩火山",
    "boss": "焚星熔炉 / EMBER FORGE",
    "bg": "#250f1a",
    "primary": "#ff9852",
    "accent": "#ff9852",
    "secondary": "#ff5f87",
    "highlight": "#ffe49a"
  },
  {
    "name": "MIDNIGHT GRID / 不夜之城",
    "boss": "霓虹执政官 / NEON REGENT",
    "bg": "#100d29",
    "primary": "#d084ff",
    "accent": "#d084ff",
    "secondary": "#40dcd9",
    "highlight": "#ffcc70"
  },
  {
    "name": "ORBITAL DEBRIS / 碎星轨道",
    "boss": "星环守望 / ORBIT WARDEN",
    "bg": "#090e25",
    "primary": "#a4baff",
    "accent": "#a4baff",
    "secondary": "#e7a575",
    "highlight": "#90fff0"
  },
  {
    "name": "HIVE CORE / 母舰核心",
    "boss": "零界之心 / NULL HEART",
    "bg": "#101c20",
    "primary": "#86efb1",
    "accent": "#86efb1",
    "secondary": "#e394ef",
    "highlight": "#ffdd87"
  }
];
/* 重置战场并进入关卡介绍，末关后进入胜利状态。 */
NV.beginStage = function (game, stage) {
  if (stage > NV.themes.length) {
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
  // 第 4–6 关补到 75%，第 7–8 关补到 78%，都早于原来的结束前 8 秒，给 Boss 前留出空隙。
  const refillUntil = c.duration * (game.stage >= 7 ? .78 : .75);
  if (game.stageTime > 2 && game.waveCharge >= 1 && (game.wave < c.waves || (game.stage > 3 && game.stageTime < refillUntil))) {
    game.waveCharge -= 1;
    let count = NV.smoothCount(d.count);
    for (let i = 0; i < count; i++) {
      const u = count <= 1 ? .5 : i / (count - 1);
      // 第一关保留原始生成与随机调用顺序；后续关卡使用独立编队。
      const patterns = [null, [0,2,0,1], [1,0,1,2], [0,1,2,0], [2,0,2,1], [1,1,0,2], [1,2,1,0], [2,1,2,0]];
      const type = game.stage === 1 ? (game.wave+i)%3 : patterns[game.stage-1][(game.wave+i)%4];
      NV.spawnEnemy(game, type, 45+u*390);
      if (game.stage > 1) {
        const e = game.enemies[game.enemies.length-1];
        e.formation = game.stage;
        e.y -= game.stage === 2 ? Math.abs(u-.5)*100 : game.stage === 3 ? i*22 : game.stage === 4 ? (i%2)*65 : game.stage === 5 ? Math.abs(u-.5)*160 : game.stage === 6 ? i*35 : game.stage === 7 ? (i%3)*42 : i*18;
      }
    }
    game.wave++;
  }
  if (game.wave >= c.waves && game.enemies.length === 0 && !game.boss) {
    NV.spawnBoss(game);
  }
};
