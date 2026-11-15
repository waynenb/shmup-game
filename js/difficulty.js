// 难度唯一配置入口；派生函数保持纯读取，平滑状态只由 updateDifficulty 推进。
'use strict';
NV.DIFFICULTY = {
  // bullet.start/end 为后五关战斗压力区间（数量/移速/血量/射击使用同一连续曲线），
  // fire 为编队开火间隔补偿（重型编队更大），cap 为普通敌机暂缓开火阈值；Boss 技能不截断。
  // 各关进度标尺：start/end、influence 为无单位强度，duration 为秒，waves 为波数，count 为每波数量倍率。
  stages: [
    {start:0,end:.28,duration:65,waves:12,count:1,influence:.1},
    {start:.30,end:.62,duration:60,waves:14,count:1,influence:.1},
    {start:.70,end:1,duration:55,waves:16,count:1.15,influence:.2},
    {start:1,end:1.02,bullet:{start:0.72,end:1.02,cap:124},duration:57,waves:17,count:1.15,influence:.2},
    {start:1.02,end:1.04,bullet:{start:0.74,end:1.04,fire:1.45,lowFire:[1.35,1.43],cap:128},duration:59,waves:18,count:1.15,influence:.2},
    {start:1.04,end:1.06,bullet:{start:0.76,end:1.06,fire:1.1,cap:132},duration:61,waves:19,count:1.15,influence:.2},
    {start:1.06,end:1.08,bullet:{start:0.79,end:1.09,fire:1.15,lowFire:[1.08,1.08],cap:136},duration:63,waves:20,count:1.15,influence:.2},
    {start:1.08,end:1.1,bullet:{start:0.80,end:1.10,fire:1.65,lowFire:[1.35,1.5],cap:140},duration:65,waves:21,count:1.15,influence:.2}
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
  // 火力评估：等级归一化后平方，减轻二级负担；levelWeight、scoreWeight 为权重，scoreScale 为分数标尺；seconds 为平滑时间常数（秒），influence 为无单位强度加成。
  power: {
    levelWeight: .65,
    scoreWeight: .04,
    scoreScale: 18000,
    seconds: 10,
    influence: .2
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
  // 玩家：lives 为初始命数，maxLives 为加命上限，bombs 为初始炸弹数，maxBombs 为每名玩家炸弹持有上限；invincible、shieldInvincible 为无敌秒数；bulletRadius、enemyRadius 为碰撞额外半径（像素），bombDamage 为伤害值，respawnBombs 为有剩余命时重生后炸弹数。
  player: {
    lives: 10,
    maxLives: 15,
    bombs: 3,
    maxBombs: 5,
    respawnBombs: 3,
    invincible: 2.2,
    shieldInvincible: 1,
    bulletRadius: 2.5,
    enemyRadius: 4,
    bombDamage: 95
  },
  // 道具：speed、magnetSpeed 为像素/秒；magnetRadius、collectRadius、firstMagnetRadius 为像素；firstSupplyTime、shield 为秒，keepBonus、maxBonus、score 为分数，types 为重复条目加权表。
  pickup: {
    speed: 55,
    magnetRadius: 180,
    magnetSpeed: 260,
    collectRadius: 25,
    firstMagnetRadius: 1000,
    firstSupplyTime: 6,
    shield: 12,
    keepBonus: 200,
    maxBonus: 500,
    score: 1000,
    types: ['N', 'N', 'S', 'S', 'L', 'L', 'M', 'M',
      'P', 'P', 'P', 'P', 'H', 'H', 'H', 'V',
      'B', 'B', 'B', 'B', 'F', 'F', 'F', 'F']
  },
  // 各关 Boss：hp 为生命值，interval 为射击间隔（秒），speed 为弹速（像素/秒），count 为基础发数，phaseCount 为每阶段增加发数，aimed 表示是否追加瞄准弹。
  boss: [
  {
    "hp": 260,
    "interval": 2,
    "speed": 75,
    "count": 3,
    "phaseCount": 1,
    "aimed": false
  },
  {
    "hp": 850,
    "interval": 0.95,
    "speed": 135,
    "count": 12,
    "phaseCount": 4,
    "aimed": true
  },
  {
    "hp": 1300,
    "interval": 0.7,
    "speed": 170,
    "count": 9,
    "phaseCount": 2,
    "aimed": true
  },
  {
    "hp": 1550,
    "interval": 0.7,
    "speed": 145,
    "count": 9,
    "phaseCount": 2,
    "aimed": true
  },
  {
    "hp": 1800,
    "interval": 0.7,
    "speed": 150,
    "count": 10,
    "phaseCount": 2,
    "aimed": true
  },
  {
    "hp": 2050,
    "interval": 0.7,
    "speed": 155,
    "count": 10,
    "phaseCount": 2,
    "aimed": true
  },
  {
    "hp": 2300,
    "interval": 0.7,
    "speed": 160,
    "count": 11,
    "phaseCount": 2,
    "aimed": true
  },
  {
    "hp": 2600,
    "interval": 0.7,
    "speed": 165,
    "count": 12,
    "phaseCount": 2,
    "aimed": true
  }
],
  // 技能轮换：phase 为解锁阶段；所有时间单位秒、距离单位像素、速度像素/秒。
  bossSkills: [
    [{name:'fan', phase:1}, {name:'ring', phase:1}, {name:'wall', phase:2}, {name:'spiral', phase:3}],
    [{name:'ring', phase:1}, {name:'spiral', phase:1}, {name:'laser', phase:2}, {name:'summon', phase:2}, {name:'homing', phase:3}],
    [{name:'sway', phase:1}, {name:'laser', phase:1}, {name:'charge', phase:2}, {name:'homing', phase:2}, {name:'wall', phase:3}, {name:'spiral', phase:3}],
    [{"name": "ring", "phase": 1}, {"name": "wall", "phase": 1}, {"name": "rain", "phase": 2}, {"name": "laser", "phase": 2}, {"name": "spiral", "phase": 3}],
    [{"name": "fan", "phase": 1}, {"name": "sway", "phase": 1}, {"name": "cross", "phase": 2}, {"name": "summon", "phase": 2}, {"name": "rain", "phase": 3}],
    [{"name": "sway", "phase": 1}, {"name": "laser", "phase": 1}, {"name": "homing", "phase": 2}, {"name": "rain", "phase": 2}, {"name": "charge", "phase": 3}],
    [{"name": "spiral", "phase": 1}, {"name": "ring", "phase": 1}, {"name": "cross", "phase": 2}, {"name": "homing", "phase": 2}, {"name": "wall", "phase": 3}],
    [{"name": "rain", "phase": 1}, {"name": "cross", "phase": 1}, {"name": "summon", "phase": 2}, {"name": "laser", "phase": 2}, {"name": "charge", "phase": 3}, {"name": "spiral", "phase": 3}]
  ],
  // 每关技能参数：预警、休息、环弹、缺口、墙间距、螺旋发数/间隔/弹速；rain/cross 为层数/每臂发数。
  skillTiers: [
    {warning:1.1, rest:2, ring:10, gap:156, spacing:28, spiral:10, pulse:.22, speed:70},
    {warning:1, rest:1.2, ring:16, gap:132, spacing:26, spiral:16, pulse:.14, speed:120},
    {warning:1, rest:1, ring:20, gap:120, spacing:24, spiral:22, pulse:.11, speed:150},
    {warning:1.15, rest:2.1, ring:12, gap:132, spacing:38, spiral:12, pulse:.14, speed:140, rain:2, cross:4},
    {warning:1.15, rest:2.5, ring:13, gap:132, spacing:38, spiral:13, pulse:.14, speed:145, rain:2, cross:4},
    {warning:1.15, rest:1.2, ring:14, gap:132, spacing:36, spiral:14, pulse:.14, speed:150, rain:2, cross:4},
    {warning:1.15, rest:.5, ring:28, gap:132, spacing:30, spiral:24, pulse:.14, speed:155, rain:2, cross:4},
    {warning:1.15, rest:2.0, ring:16, gap:132, spacing:36, spiral:16, pulse:.14, speed:160, rain:2, cross:4}
  ],
  // 激光为预警位置固定的直线弹串；追踪角速度有上限且到期消失；冲锋终点不超过 y=560。
  skill: {laserDuration:.7, laserPulse:.05, laserSpeed:650, laserRadius:6,
    homingSpeed:100, homingTurn:.45, homingLife:4, homingCount:2,
    summonCount:2, summonCap:4, chargeDuration:1.8, chargeY:560},
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
  const intensity = stage.start + (stage.end - stage.start) * t + (stage.influence ?? c.power.influence) * p;
  const d = {
    intensity,
    power: p,
    stageProgress: progress === undefined ? NV.clamp((game.stageTime || 0) / stage.duration, 0, 1) : progress
  };
  // 后五关独立压力通道；动态火力公式及连续插值保持一致。
  const pressure = stage.bullet ? stage.bullet.start + (stage.bullet.end-stage.bullet.start)*t + stage.influence*p : intensity;
  for (const [key, ends] of Object.entries(c.curve)) {
    // 超过旧强度范围后平滑趋近 1.4，防止负间隔和无限弹速。
    const bounded = pressure <= 1.2 ? pressure : 1.2 + .2 * (1-Math.exp(-(pressure-1.2)/.2));
    d[key] = ends[0] + (ends[1] - ends[0]) * bounded;
  }
  // 射击间隔在旧上界 1.2 后单独软着陆，始终为正。
  if (pressure > 1.2) d.fireInterval = .22 + .14*Math.exp(-(pressure-1.2)*4.7/.14);
  // 弹速只接收 70% 的火力强度加成，升级主要增加同屏密度。
  const bulletIntensity = pressure - (stage.influence ?? c.power.influence) * .3 * p;
  const bulletBound = bulletIntensity <= 1.2 ? bulletIntensity : 1.2+.2*(1-Math.exp(-(bulletIntensity-1.2)/.2));
  d.bulletSpeed = c.curve.bulletSpeed[0]+(c.curve.bulletSpeed[1]-c.curve.bulletSpeed[0])*bulletBound;
  // 二次加成在低火力时温和，power=0 时保留原有开局。
  d.fireInterval /= 1 + 1.2 * p * p;
  d.count = (d.count + 6 * p * p) * stage.count;
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
      c.levelWeight * NV.clamp((p.level - 1) / 2, 0, 1) ** 2 +
      c.scoreWeight * NV.clamp(p.score / c.scoreScale, 0, 1),
      0,
      1
    );
  }, 0) / (alive.length || 1);
  game.difficultyPower = (game.difficultyPower || 0) + (target - (game.difficultyPower || 0)) * (1 - Math.exp(-dt / c.seconds));
};

// 编队补偿随进度/火力连续变化；低火力保留首发，满级避免重型密度跳升。
NV.enemyFireScale = function (game) {
  const c = NV.DIFFICULTY.stages[game.stage-1], b = c.bullet;
  if (!b) return 1;
  const t = NV.smoothstep((game.stageTime || 0)/c.duration);
  const low = b.lowFire ? b.lowFire[0]+(b.lowFire[1]-b.lowFire[0])*t : (b.fire ?? 1);
  return low+((b.fire ?? 1)-low)*NV.clamp((game.difficultyPower || 0)/.65,0,1);
};
