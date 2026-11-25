// Boss 伤害归属。只在测试里观察，不改游戏随机数、时序或规则。
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DEFINITIONS = {
  instanceId: 'stageAtSpawn + monotonic serial. A later boss on the same stage gets a new serial and does not reuse the earlier record.',
  startHp: 'boss.hp immediately after spawnBoss creates that object, before updateShots in the same update.',
  actualDamageInflicted: 'Sum of HP removed from that object. Each assignment hp -= damage counts min(previousHp, previousHp - newHp) while previousHp > 0. Damage is not taken from any other boss.',
  overkill: 'The part of a connecting hit below 0. It is not counted again as HP removed.',
  hits: 'Number of connecting boss HP decreases. A shot that hits a normal enemy first is not a boss hit.',
  generatedPotentialDamage: 'Sum of shot.damage for player shots spawned while this object is the active boss. Shots spawned earlier, shots that miss, and shots that hit other enemies stay in or out exactly as that sentence says. This is not aim and not accuracy.',
  hpRemovalOverGeneratedDamage: 'actualDamageInflicted / generatedPotentialDamage when the denominator is positive, otherwise null. It may exceed 1 when an already-flying shot hits. It is not a claim that every generated shot was aimed at the boss.',
  lifetime: 'startFrame is the harness frame that called spawnBoss. endFrame is the frame the object is no longer game.boss. reason defeated means last HP was <= 0; removed means it disappeared while HP was still positive; gameover, frame-budget, or run-stopped means the run ended with it still present.',
  notObserved: 'A stage with no instance reports not-observed. No time-to-kill is inferred.',
  legacyFirstBossAggregate: 'Old contaminated definition: startHp from the first boss only, damage and seconds summed across every later boss. Kept only so the correction table can name it. It is not a stage 3 measurement.'
};

function createHarness(nv) {
  const instances = [];
  const byObject = new WeakMap();
  let serial = 0;
  let frame = 0;
  const originalSpawn = nv.spawnBoss;
  const originalShots = nv.updateShots;
  const originalShoot = nv.shoot;

  function openInstance(boss, stage) {
    if (byObject.has(boss)) return byObject.get(boss);
    const inst = {
      id: stage + '-' + (++serial),
      serial,
      object: boss,
      stageAtSpawn: stage,
      startFrame: frame,
      endFrame: null,
      startHp: boss.hp,
      maxHp: boss.maxHp,
      lastHp: boss.hp,
      actualDamageInflicted: 0,
      overkill: 0,
      hits: 0,
      hitsByOwner: {},
      damageByOwner: {},
      generatedPotentialDamage: 0,
      generatedShots: 0,
      generatedByOwner: {},
      reason: null,
      hitLog: []
    };
    byObject.set(boss, inst);
    instances.push(inst);
    return inst;
  }

  nv.spawnBoss = function (game) {
    const previous = game.boss;
    originalSpawn.apply(this, arguments);
    if (game.boss && game.boss !== previous) openInstance(game.boss, game.stage);
  };

  nv.shoot = function (game, player) {
    const before = game.shots.length;
    originalShoot.apply(this, arguments);
    const inst = game.boss ? byObject.get(game.boss) : null;
    for (let index = before; index < game.shots.length; index++) {
      const shot = game.shots[index];
      if (!inst || inst.endFrame !== null) continue;
      inst.generatedPotentialDamage += shot.damage;
      inst.generatedShots += 1;
      inst.generatedByOwner[shot.owner] = (inst.generatedByOwner[shot.owner] || 0) + shot.damage;
    }
  };

  nv.updateShots = function (game, deltaTime) {
    const boss = game.boss;
    const inst = boss ? byObject.get(boss) : null;
    if (!inst) return originalShots.apply(this, arguments);
    const box = { hp: boss.hp, lastHit: boss.lastHit, pending: null };
    Object.defineProperty(boss, 'hp', {
      configurable: true, enumerable: true,
      get() { return box.hp; },
      set(value) {
        const previous = box.hp;
        box.hp = value;
        inst.lastHp = value;
        if (previous > 0 && value < previous) {
          const delta = previous - value;
          const inflicted = Math.min(delta, previous);
          box.pending = { inflicted, overkill: delta - inflicted };
          inst.actualDamageInflicted += inflicted;
          inst.overkill += delta - inflicted;
          inst.hits += 1;
        }
      }
    });
    Object.defineProperty(boss, 'lastHit', {
      configurable: true, enumerable: true,
      get() { return box.lastHit; },
      set(value) {
        box.lastHit = value;
        if (!box.pending) return;
        const owner = String(value);
        inst.hitsByOwner[owner] = (inst.hitsByOwner[owner] || 0) + 1;
        inst.damageByOwner[owner] = (inst.damageByOwner[owner] || 0) + box.pending.inflicted;
        inst.hitLog.push({ frame, owner: value, inflicted: box.pending.inflicted, overkill: box.pending.overkill });
        box.pending = null;
      }
    });
    try {
      return originalShots.apply(this, arguments);
    } finally {
      if (box.pending) {
        inst.hitsByOwner.unattributed = (inst.hitsByOwner.unattributed || 0) + 1;
        inst.damageByOwner.unattributed = (inst.damageByOwner.unattributed || 0) + box.pending.inflicted;
        box.pending = null;
      }
      Object.defineProperty(boss, 'hp', { configurable: true, enumerable: true, writable: true, value: box.hp });
      Object.defineProperty(boss, 'lastHit', { configurable: true, enumerable: true, writable: true, value: box.lastHit });
    }
  };

  function closeMissing(game) {
    for (const inst of instances) {
      if (inst.endFrame !== null) continue;
      if (game.boss !== inst.object) {
        inst.endFrame = frame;
        inst.endHp = inst.object.hp;
        inst.reason = inst.endHp <= 0 ? 'defeated' : 'removed';
      }
    }
  }

  function finishOpen(reason) {
    for (const inst of instances) {
      if (inst.endFrame !== null) continue;
      inst.endFrame = frame;
      inst.endHp = inst.object.hp;
      inst.reason = reason;
    }
  }

  function view(inst) {
    const copy = { ...inst };
    delete copy.object;
    delete copy.hitLog;
    copy.hpRemovalOverGeneratedDamage = inst.generatedPotentialDamage > 0
      ? inst.actualDamageInflicted / inst.generatedPotentialDamage
      : null;
    return copy;
  }

  return {
    definitions: DEFINITIONS,
    beginFrame() { frame += 1; return frame; },
    get frame() { return frame; },
    closeMissing,
    finishOpen,
    attachUpdate(game) {
      const original = game.update.bind(game);
      game.update = function (deltaTime) {
        frame += 1;
        const result = original(deltaTime);
        closeMissing(game);
        return result;
      };
    },
    instances,
    view,
    stageReport(stage) {
      const rows = instances.filter(inst => inst.stageAtSpawn === stage).map(view);
      return rows.length ? { status: 'observed', bosses: rows } : { status: 'not-observed', bosses: [] };
    },
    legacyFirstBossAggregate() {
      const first = instances[0];
      return {
        warning: DEFINITIONS.legacyFirstBossAggregate,
        startHp: first ? first.startHp : null,
        damage: instances.reduce((sum, inst) => sum + inst.actualDamageInflicted, 0),
        frames: instances.reduce((sum, inst) => sum + (inst.endFrame === null ? 0 : inst.endFrame - inst.startFrame + 1), 0)
      };
    }
  };
}

function loadGame(root, seed = 12345) {
  const modules = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
  const context = vm.createContext({
    URLSearchParams,
    location: { search: '' },
    navigator: { getGamepads: () => [] },
    document: { getElementById: () => ({ getContext: () => new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) }) }) },
    localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame() {},
    addEventListener() {},
    AudioContext: class { constructor() { throw new Error('no-audio'); } }
  });
  context.window = context;
  let state = seed >>> 0 || 1;
  context.nextRandom = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  vm.runInContext('Math.random = () => nextRandom()', context);
  for (const module of modules) vm.runInContext(fs.readFileSync(path.join(root, module), 'utf8'), context, { filename: module });
  return context;
}

function prepare(game, stage, mode) {
  game.stage = stage;
  game.mode = mode;
  game.difficultyPower = 0;
  game.state = 'playing';
  game.boss = null;
  game.enemies = [];
  game.shots = [];
  game.bullets = [];
  game.players = game.players.length ? game.players : [{ id: 0, x: 240, y: 690, lives: 10, level: 1, weapon: 'N', color: '#fff', cooldown: 0 }];
}

function putShot(game, boss, damage, owner, dx) {
  game.shots.push({ x: boss.x + dx, y: boss.y, vx: 0, vy: 0, r: 4, damage, owner, life: 3, homing: false, col: '#fff' });
}

function runUnitTests() {
  const root = path.resolve(__dirname, '..');
  const context = loadGame(root);
  const nv = context.NV;
  const game = nv.game;
  const harness = createHarness(nv);
  let checks = 0;
  function check(name, run) {
    run();
    checks += 1;
    console.log('PASS ' + name);
  }

  check('one boss records its own start HP and one connecting hit', () => {
    prepare(game, 1, 1);
    harness.beginFrame();
    nv.spawnBoss(game);
    const boss = harness.instances[0];
    assert.equal(boss.id, '1-1');
    assert.equal(boss.startFrame, 1);
    assert.equal(boss.startHp, 260);
    assert.equal(boss.startHp, nv.difficulty(game).bossHp);
    harness.beginFrame();
    putShot(game, game.boss, 1, 0, 0);
    nv.updateShots(game, 0);
    assert.equal(boss.actualDamageInflicted, 1);
    assert.equal(boss.hits, 1);
    assert.equal(boss.hitsByOwner['0'], 1);
    assert.equal(boss.overkill, 0);
    assert.equal(boss.endFrame, null);
    assert.equal(game.boss.hp, 259);
  });

  check('overkill stays on that hit and does not inflate HP removed', () => {
    const boss = harness.instances[0];
    game.boss.hp = 2;
    harness.beginFrame();
    putShot(game, game.boss, 5, 0, 0);
    nv.updateShots(game, 0);
    nv.updateBoss(game, 0);
    harness.closeMissing(game);
    assert.equal(boss.actualDamageInflicted, 3);
    assert.equal(boss.overkill, 3);
    assert.equal(boss.hits, 2);
    assert.equal(boss.endFrame, 3);
    assert.equal(boss.reason, 'defeated');
    assert.equal(boss.endHp, -3);
  });

  check('a second stage boss does not inherit the first boss damage', () => {
    harness.beginFrame();
    prepare(game, 3, 1);
    nv.spawnBoss(game);
    const first = harness.instances[0];
    const second = harness.instances[1];
    assert.equal(second.id, '3-2');
    assert.equal(second.startHp, 1300);
    assert.equal(second.startFrame, 4);
    harness.beginFrame();
    putShot(game, game.boss, 4, 0, 0);
    nv.updateShots(game, 0);
    assert.equal(second.actualDamageInflicted, 4);
    assert.equal(first.actualDamageInflicted, 3);
    assert.equal(harness.legacyFirstBossAggregate().startHp, 260);
    assert.equal(harness.legacyFirstBossAggregate().damage, 7);
  });

  check('the same stage can open a new instance after the previous one is gone', () => {
    const previous = harness.instances[1];
    game.boss.hp = 0;
    nv.updateBoss(game, 0);
    harness.closeMissing(game);
    assert.equal(previous.reason, 'defeated');
    harness.beginFrame();
    nv.spawnBoss(game);
    const third = harness.instances[2];
    assert.equal(third.stageAtSpawn, 3);
    assert.notEqual(third.id, previous.id);
    assert.equal(third.startHp, 1300);
    harness.beginFrame();
    putShot(game, game.boss, 7, 1, 0);
    nv.updateShots(game, 0);
    assert.equal(third.actualDamageInflicted, 7);
    assert.equal(third.damageByOwner['1'], 7);
    assert.equal(previous.actualDamageInflicted, 4);
  });

  check('coop hits keep owner and one shared boss instance', () => {
    game.boss.hp = 0;
    nv.updateBoss(game, 0);
    harness.closeMissing(game);
    harness.beginFrame();
    prepare(game, 3, 2);
    nv.spawnBoss(game);
    const boss = harness.instances.at(-1);
    assert.equal(boss.startHp, 1625);
    harness.beginFrame();
    putShot(game, game.boss, 1, 0, 0);
    putShot(game, game.boss, 4, 1, 0);
    nv.updateShots(game, 0);
    assert.equal(boss.hits, 2);
    assert.equal(boss.actualDamageInflicted, 5);
    assert.equal(boss.hitsByOwner['0'], 1);
    assert.equal(boss.hitsByOwner['1'], 1);
    assert.equal(boss.overkill, 0);
  });

  check('a miss and an enemy-first hit do not become boss damage', () => {
    const boss = harness.instances.at(-1);
    const before = boss.actualDamageInflicted;
    harness.beginFrame();
    putShot(game, game.boss, 9, 0, 400);
    game.enemies.push({ x: game.boss.x, y: game.boss.y, r: 20, hp: 40, maxHp: 40 });
    putShot(game, game.boss, 6, 0, 0);
    nv.updateShots(game, 0);
    assert.equal(boss.actualDamageInflicted, before);
    assert.equal(game.enemies[0].hp, 34);
    assert.equal(boss.generatedPotentialDamage, 0);
    assert.equal(boss.hpRemovalOverGeneratedDamage ?? harness.view(boss).hpRemovalOverGeneratedDamage, null);
  });

  check('shots spawned during the fight are potential damage even when they miss', () => {
    game.boss.hp = 0;
    nv.updateBoss(game, 0);
    harness.closeMissing(game);
    harness.beginFrame();
    prepare(game, 1, 1);
    game.players = [{ id: 0, x: 20, y: 690, lives: 10, level: 1, weapon: 'N', color: '#fff', cooldown: 0 }];
    nv.spawnBoss(game);
    const boss = harness.instances.at(-1);
    harness.beginFrame();
    nv.shoot(game, game.players[0]);
    nv.updateShots(game, 0);
    assert.equal(boss.generatedShots, 1);
    assert.equal(boss.generatedPotentialDamage, 1);
    assert.equal(boss.generatedByOwner[0], 1);
    assert.equal(boss.actualDamageInflicted, 0);
    assert.equal(boss.hits, 0);
    assert.equal(harness.view(boss).hpRemovalOverGeneratedDamage, 0);
  });

  check('a shot that already existed before spawn is not counted as generated boss damage', () => {
    game.boss.hp = 0;
    nv.updateBoss(game, 0);
    harness.closeMissing(game);
    harness.beginFrame();
    prepare(game, 1, 1);
    game.shots = [{ x: 240, y: 400, vx: 0, vy: 0, r: 4, damage: 8, owner: 0, life: 3, homing: false, col: '#fff' }];
    nv.spawnBoss(game);
    const boss = harness.instances.at(-1);
    game.shots[0].x = game.boss.x;
    game.shots[0].y = game.boss.y;
    nv.updateShots(game, 0);
    assert.equal(boss.generatedPotentialDamage, 0);
    assert.equal(boss.actualDamageInflicted, 8);
    assert.equal(harness.view(boss).hpRemovalOverGeneratedDamage, null);
    assert.equal(harness.stageReport(3).status, 'observed');
    assert.equal(createHarness(loadGame(root).NV).stageReport(3).status, 'not-observed');
  });

  console.log(checks + ' boss attribution checks passed.');
}

module.exports = { DEFINITIONS, createHarness, loadGame };

if (require.main === module) runUnitTests();
