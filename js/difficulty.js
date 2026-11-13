// 难度唯一配置入口；派生函数保持纯读取，平滑状态只由 updateDifficulty 推进。
'use strict';
NV.DIFFICULTY = {
  // 各关进度标尺：start/end 为无单位强度，duration 为秒，waves 为波数。
  stages: [
    {
      start: 0,
      end: .22,
      duration: 65,
      waves: 12
    },
    {
      start: .3,
      end: .62,
      duration: 60,
      waves: 14
    },
    {
      start: .7,
      end: 1,
      duration: 55,
      waves: 16
    }
  ],
  // 强度插值的低/高端点：count 为架/波，waveInterval、fireInterval 为秒；speed、bulletSpeed 为像素/秒；hp、heavyHp 为生命值，volley 为发数，armed、dropRate 为概率。
  curve: {
    count: [2, 6],
    waveInterval: [6, 2.5],
    speed: [42, 115],
    hp: [2, 9],
    heavyHp: [4, 20],
    fireInterval: [6, 1.3],
    bulletSpeed: [65, 180],
    volley: [1, 3],
    armed: [.25, 1],
    dropRate: [.5, .3]
  },
  // 火力评估：levelWeight、scoreWeight 为权重，scoreScale 为分数标尺；seconds 为平滑时间常数（秒），influence 和 weapon 为无单位强度加成。
  power: {
    levelWeight: .6,
    scoreWeight: .4,
    scoreScale: 18000,
    seconds: 4,
    influence: .2,
    weapon: {
      N: 0,
      S: .12,
      L: .1,
      M: .15
    }
  },
  // 双人模式：hp 为生命值倍率，count 为每波数量倍率。
  coop: {
    hp: 1.25,
    count: 1.2
  },
  // 敌机修正：initialFire 为首发间隔随机倍率区间，heavyFire 为重型射击间隔倍率，fastSpeed 为快速敌机速度倍率；spread 为弹间夹角（弧度），pity 为保底前连续未掉落次数。
  enemy: {
    initialFire: [.8, 1.2],
    heavyFire: .8,
    fastSpeed: 1.2,
    spread: .2,
    pity: 3
  },
  // 玩家：lives 为命数，bombs 为炸弹数；invincible、shieldInvincible 为无敌秒数；bulletRadius、enemyRadius 为碰撞额外半径（像素），bombDamage 为伤害值。
  player: {
    lives: 3,
    bombs: 3,
    invincible: 2.2,
    shieldInvincible: 1,
    bulletRadius: 2.5,
    enemyRadius: 4,
    bombDamage: 95
  },
  // 道具：speed、magnetSpeed 为像素/秒；magnetRadius、collectRadius、firstMagnetRadius 为像素；firstSupplyTime、shield 为秒，maxBonus、score 为分数，types 为道具类型。
  pickup: {
    speed: 55,
    magnetRadius: 180,
    magnetSpeed: 260,
    collectRadius: 25,
    firstMagnetRadius: 1000,
    firstSupplyTime: 6,
    shield: 12,
    maxBonus: 500,
    score: 1000,
    types: ['N', 'S', 'L', 'M', 'H', 'V', 'B', 'F']
  },
  // 各关 Boss：hp 为生命值，interval 为射击间隔（秒），speed 为弹速（像素/秒），count 为基础发数，phaseCount 为每阶段增加发数，aimed 表示是否追加瞄准弹。
  boss: [
    {
      hp: 260,
      interval: 2,
      speed: 75,
      count: 3,
      phaseCount: 1,
      aimed: false
    },
    {
      hp: 850,
      interval: .95,
      speed: 135,
      count: 12,
      phaseCount: 4,
      aimed: true
    },
    {
      hp: 1300,
      interval: .7,
      speed: 170,
      count: 9,
      phaseCount: 2,
      aimed: true
    }
  ],
  // Boss 运动与阶段：entry 为入场速度（像素/秒），frequency、stageFrequency 为角频率及每关增量（弧度/秒），amplitude、stageAmplitude 为振幅及每关增量（像素）。
  bossMotion: {
    entry: 90,
    frequency: .6,
    stageFrequency: .15,
    amplitude: 90,
    stageAmplitude: 12,
    // thresholds 为剩余血量比例；phaseInterval 为每阶段减少的间隔（秒），phaseSpeed 为每阶段增加的弹速（像素/秒）。
    thresholds: [.66, .32],
    phaseInterval: .1,
    phaseSpeed: 8,
    // powerHp、powerSpeed 为火力影响比例，aimedSpeed 为瞄准弹速倍率；fanSpread、finalSpread、sway 为弧度，rotation 为弧度/秒，reward 为每关奖励分数基数。
    powerHp: .1,
    powerSpeed: .05,
    aimedSpeed: 1.3,
    fanSpread: .18,
    finalSpread: .15,
    rotation: .65,
    sway: .5,
    reward: 3000
  }
};

NV.smoothstep = x => {
  x = NV.clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};
NV.smoothCount = value => {
  return Math.floor(value) + (Math.random() < value % 1 ? 1 : 0);
};
NV.difficulty = function (game, progress, power) {
  const c = NV.DIFFICULTY;
  const stage = c.stages[game.stage - 1];
  const p = NV.clamp(power === undefined ? game.difficultyPower || 0 : power, 0, 1);
  const t = NV.smoothstep(progress === undefined ? (game.stageTime || 0) / stage.duration : progress);
  const intensity = stage.start + (stage.end - stage.start) * t + c.power.influence * p;
  const d = {
    intensity,
    power: p,
    stageProgress: progress === undefined ? NV.clamp((game.stageTime || 0) / stage.duration, 0, 1) : progress
  };
  for (const [key, ends] of Object.entries(c.curve)) {
    d[key] = ends[0] + (ends[1] - ends[0]) * intensity;
  }
  // 弹速只接收 70% 的火力强度加成，升级主要增加同屏密度。
  d.bulletSpeed -= (c.curve.bulletSpeed[1] - c.curve.bulletSpeed[0]) * c.power.influence * .3 * p;
  // 二次加成在低火力时温和，power=0 时保留原有开局。
  d.fireInterval /= 1 + 2 * p * p;
  d.count += 6 * p * p;
  d.hp += 5 * p * p;
  d.heavyHp += 5 * p * p;
  if (game.mode === 2) {
    d.count *= c.coop.count;
    d.hp *= c.coop.hp;
    d.heavyHp *= c.coop.hp;
  }
  d.dropRate = game.stage === 1
    ? c.curve.dropRate[0] + (c.curve.dropRate[1] - c.curve.dropRate[0]) * t
    : c.curve.dropRate[1];
  const tier = c.boss[game.stage - 1];
  const phase = game.boss ? game.boss.phase : 1;
  d.bossHp = tier.hp * (1 + c.bossMotion.powerHp * p) * (game.mode === 2 ? c.coop.hp : 1);
  d.bossFireInterval = tier.interval - (phase - 1) * c.bossMotion.phaseInterval;
  d.bossBulletSpeed = (tier.speed + (phase - 1) * c.bossMotion.phaseSpeed) * (1 + p * c.bossMotion.powerSpeed);
  d.bossVolley = tier.count + (phase - 1) * tier.phaseCount;
  return d;
};
NV.updateDifficulty = function (game, dt) {
  const c = NV.DIFFICULTY.power;
  const alive = game.players.filter(p => p.lives > 0);
  const target = alive.reduce((sum, p) => {
    return sum + NV.clamp(
      c.levelWeight * NV.clamp((p.level - 1) / 2 + c.weapon[p.weapon], 0, 1) +
      c.scoreWeight * NV.clamp(p.score / c.scoreScale, 0, 1),
      0,
      1
    );
  }, 0) / (alive.length || 1);
  game.difficultyPower = (game.difficultyPower || 0) + (target - (game.difficultyPower || 0)) * (1 - Math.exp(-dt / c.seconds));
};
