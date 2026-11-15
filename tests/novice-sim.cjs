// 新手模拟（avgLivesLost = 实际被击中掉命次数，不扣除加命道具）：随机游走 + 简单闪避 + 一直开火，统计第 1 关前 60 秒存活率与各关难度数据。
// 用法：node tests/novice-sim.cjs [游戏根目录] [每种模式跑的次数]
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const runs = Number(process.argv[3]) || 200;
const modules = Array.from(
  fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)"/g),
  match => match[1]
);

function load(seed) {
  const ctx2d = new Proxy({}, { get: (t, k) => t[k] ?? (() => {}) });
  const context = vm.createContext({
    URLSearchParams,
    location: { search: '' },
    navigator: { getGamepads: () => [] },
    document: { getElementById: () => ({ getContext: () => ctx2d }) },
    localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame() {},
    addEventListener() {}
  });
  context.window = context;
  let state = seed >>> 0 || 1;
  context.nextRandom = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  vm.runInContext('Math.random = () => nextRandom()', context);
  for (const m of modules) {
    vm.runInContext(fs.readFileSync(path.join(root, m), 'utf8'), context, { filename: m });
  }
  return context;
}

// 机器人自身的随机数，与游戏随机数分开。
function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 7;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 2 ** 32;
  };
}

function installBot(context, seed, dodge) {
  const game = context.NV.game;
  const rand = rng(seed);
  const wander = [];
  context.NV.input.controls = index => {
    const p = game.players[index];
    if (!p) return { x: 0, y: 0, fire: false, bomb: false };
    const w = wander[index] || (wander[index] = { x: 0, y: 0, t: 0 });
    w.t -= 1 / 60;
    if (w.t <= 0) {
      w.x = rand() * 2 - 1;
      w.y = (rand() * 2 - 1) * 0.4 + (p.y < 600 ? 0.5 : 0);
      w.t = 0.4 + rand() * 0.8;
    }
    let x = w.x;
    let y = w.y;
    if (dodge) {
      // 简单闪避：对正上方 110px 内最近的敌弹 / 敌机横向躲开。
      let threat = null;
      let best = 1e9;
      for (const b of game.bullets) {
        const dy = p.y - b.y;
        const dx = b.x - p.x;
        if (dy > -10 && dy < 110 && Math.abs(dx) < 34) {
          const d = Math.hypot(dx, dy);
          if (d < best) { best = d; threat = b; }
        }
      }
      for (const e of game.enemies) {
        const dy = p.y - e.y;
        if (dy > -20 && dy < 140 && Math.abs(e.x - p.x) < e.r + 30) { threat = e; break; }
      }
      if (threat) {
        x = threat.x >= p.x ? -1 : 1;
        if (p.x < 40) x = 1;
        if (p.x > 440) x = -1;
      }
    }
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), fire: true, bomb: false };
  };
}

function noviceRun(seed, mode, dodge, seconds = 60) {
  const context = load(seed * 7919 + mode);
  installBot(context, seed, dodge);
  const game = context.NV.game;
  game.start(mode);
  let hits = 0;
  const hit = context.NV.hitPlayer;
  context.NV.hitPlayer = function (g, p) {
    const before = p.lives;
    hit.apply(this, arguments);
    if (p.lives < before) hits++;
  };
  let firstUpgrade = null;
  for (let i = 0; i < seconds * 60; i++) {
    game.update(1 / 60);
    if (firstUpgrade === null && game.players.some(p => p.level > 1)) {
      firstUpgrade = (i + 1) / 60;
    }
    if (game.state === 'gameover') break;
  }
  const lost = hits;
  return { alive: game.state !== 'gameover', lost, firstUpgrade, anyLifeLost: lost > 0 };
}

function summarize(label, mode, dodge, seconds = 60) {
  const res = [];
  for (let s = 1; s <= runs; s++) res.push(noviceRun(s, mode, dodge, seconds));
  const up = res.filter(r => r.firstUpgrade !== null).map(r => r.firstUpgrade).sort((a, b) => a - b);
  const pct = q => (up.length ? up[Math.min(up.length - 1, Math.floor(q * up.length))].toFixed(1) + 's' : 'n/a');
  return {
    label,
    runs,
    survival: (100 * res.filter(r => r.alive).length / runs).toFixed(1) + '%',
    noHit: (100 * res.filter(r => !r.anyLifeLost).length / runs).toFixed(1) + '%',
    avgLivesLost: (res.reduce((s, r) => s + r.lost, 0) / runs).toFixed(2),
    upgraded: (100 * up.length / runs).toFixed(1) + '%',
    firstUpgradeMedian: pct(0.5),
    firstUpgradeP90: pct(0.9)
  };
}

// 难度数据：无敌机器人（只在模拟里直接设 game.god，不用调试键/URL）跑各关，按 15 秒分段统计。
function stageProfile(stage, mode, seconds = 90, seed = 3, upgrade = null) {
  const context = load(1000 + stage * 10 + mode + seed);
  installBot(context, seed, true);
  const game = context.NV.game;
  game.start(mode);
  game.god = true;
  if (upgrade) game.players.forEach(p => { p.weapon = upgrade[0]; p.level = upgrade[1]; });
  if (stage > 1) context.NV.beginStage(game, stage);
  const seen = new WeakSet();
  const buckets = [];
  for (let i = 0; i < seconds * 60; i++) {
    game.update(1 / 60);
    if (game.stage !== stage || game.state === 'victory') break;
    const b = Math.floor(i / (15 * 60));
    const B = buckets[b] || (buckets[b] = { frames: 0, enemies: 0, bullets: 0, spawned: 0, hpSum: 0, boss: false });
    B.frames++;
    B.enemies += game.enemies.length;
    B.bullets += game.bullets.length;
    if (game.boss) B.boss = true;
    for (const e of game.enemies) if (!seen.has(e)) { seen.add(e); B.spawned++; B.hpSum += e.hp; }
  }
  return buckets.map((B, k) => ({
    window: `${k * 15}-${k * 15 + 15}s`,
    avgEnemies: +(B.enemies / B.frames).toFixed(2),
    avgEnemyBullets: +(B.bullets / B.frames).toFixed(2),
    spawned: B.spawned,
    avgSpawnHp: B.spawned ? +(B.hpSum / B.spawned).toFixed(2) : 0,
    boss: B.boss
  }));
}

function bossInfo(stage) {
  const context = load(77 + stage);
  const game = context.NV.game;
  game.start(1);
  if (stage > 1) context.NV.beginStage(game, stage);
  game.state = 'playing';
  context.NV.spawnBoss(game);
  return { stage, bossHp: Math.round(game.boss.maxHp) };
}

const out = {
  root,
  novice: [
    summarize('single, random+dodge', 1, true),
    summarize('single, random only', 1, false),
    summarize('co-op, random+dodge', 2, true),
    Object.assign(summarize('single, random+dodge, 180s', 1, true, 180), { note: 'survival over 180s incl. later stages / bosses' })
  ],
  profile: {}
};
for (const stage of [1, 2, 3, 4, 5, 6, 7, 8]) out.profile['stage' + stage + '_single_N1'] = stageProfile(stage, 1);
out.profile['stage1_single_S3'] = stageProfile(1, 1, 90, 3, ['S', 3]);
out.profile['stage1_coop_N1'] = stageProfile(1, 2);
out.bosses = [1, 2, 3, 4, 5, 6, 7, 8].map(bossInfo);
console.log(JSON.stringify(out, null, 1));
