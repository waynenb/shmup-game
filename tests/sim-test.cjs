// 离线模拟：在 Node VM 中提供浏览器桩，验证输入、战斗、关卡和自动化接口。
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const modules = Array.from(
  fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)"/g),
  match => match[1]
);
let checks = 0;

// 每个用例使用独立全局环境和确定性随机数，且不访问网络或启动服务。
function load(search = '', storageBlocked = false, AudioContext) {
  const listeners = {};
  const frames = [];
  const storage = new Map();
  let seed = 12345;
  let gamepads = [];
  const context2d = new Proxy({}, {
    get(target, key) {
      return target[key] ?? (() => {});
    }
  });
  const context = vm.createContext({
    URLSearchParams,
    AudioContext,
    location: { search },
    navigator: { getGamepads: () => gamepads },
    document: { getElementById: () => ({ getContext: () => context2d }) },
    localStorage: {
      getItem(key) {
        if (storageBlocked) throw new Error('Storage unavailable');
        return storage.get(key);
      },
      setItem(key, value) {
        if (storageBlocked) throw new Error('Storage unavailable');
        storage.set(key, value);
      }
    },
    requestAnimationFrame: callback => frames.push(callback),
    addEventListener: (name, callback) => { listeners[name] = callback; }
  });
  context.window = context;
  vm.runInContext('Math.random = () => nextRandom()', context);
  context.nextRandom = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (const module of modules) {
    vm.runInContext(fs.readFileSync(path.join(root, module), 'utf8'), context, { filename: module });
  }
  const game = context.NV.game;
  function tick(count = 1) {
    for (let index = 0; index < count; index++) game.update(1 / 60);
  }
  function key(code, down = true) {
    listeners[down ? 'keydown' : 'keyup']({ code, preventDefault() {} });
  }
  function tap(code) {
    key(code);
    tick();
    key(code, false);
  }
  return {
    pointer: () => listeners.pointerdown(), context, storage, game, api: context.__game, nv: context.NV, tick, key, tap,
    blur: () => listeners.blur(),
    pads: value => { gamepads = value; },
    frame: now => frames.shift()(now)
  };
}

function test(name, run) {
  run();
  checks++;
  console.log('PASS ' + name);
}

// 快照包含全部约定字段，所有嵌套对象均只读且不与实时玩家共享引用。
test('snapshot schema, immutability, detached values and legacy facade', () => {
  const { api, game, tap } = load();
  assert.equal(api.state, 'menu');
  assert.deepEqual(Object.keys(api.snapshot()), [
    'state', 'stage', 'mode', 'bossActive', 'bossHp', 'bossSkill', 'enemies', 'pickups', 'difficulty', 'players'
  ]);
  assert.equal(api.snapshot().bossHp, 0);
  tap('Digit2');
  const snapshot = api.snapshot();
  assert.deepEqual(Object.keys(snapshot.players[0]), ['weapon', 'level', 'lives', 'bombs', 'score', 'shield']);
  assert.equal(snapshot.players.length, 2);
  for (const value of [snapshot, snapshot.players, snapshot.difficulty, ...snapshot.players]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { snapshot.players[0].lives = 99; }, TypeError);
  assert.throws(() => { snapshot.stage = 3; }, TypeError);
  assert.throws(() => { snapshot.players.push({}); }, { name: 'TypeError' });
  game.players[0].score = 42;
  assert.equal(snapshot.players[0].score, 0);
  assert.equal(api.snapshot().players[0].score, 42);
  assert.equal(api.players, game.players);
  assert.equal(api.enemies, game.enemies.length);
  assert.equal(api.pickups, game.pickups.length);
  assert.equal(api.mode, 2);
  assert.equal(api.boss, false);
  assert.equal(api.god, false);
});

test('menu, keyboard movement, diagonal normalization, fire, pause and blur', () => {
  const sim = load();
  sim.tap('ArrowDown');
  sim.tap('Enter');
  assert.equal(sim.api.mode, 2);
  sim.tick(134);
  assert.equal(sim.api.state, 'playing');
  const [first, second] = sim.game.players;
  const firstX = first.x;
  const secondX = second.x;
  sim.key('KeyD');
  sim.key('KeyW');
  sim.key('ArrowLeft');
  sim.key('Space');
  sim.key('Enter');
  sim.tick(30);
  assert.ok(Math.abs(Math.hypot(first.x - firstX, first.y - 690) - 140) < 1e-8);
  assert.ok(second.x < secondX);
  assert.ok(sim.game.shots.some(shot => shot.owner === 0));
  assert.ok(sim.game.shots.some(shot => shot.owner === 1));
  sim.tap('KeyP');
  const pausedX = first.x;
  sim.tick(60);
  assert.equal(first.x, pausedX);
  sim.tap('Escape');
  assert.equal(sim.api.state, 'playing');
  sim.blur();
  assert.equal(sim.api.state, 'paused');
  assert.equal(sim.nv.input.held.size, 0);
});

test('debug URL gating, stage limits and debug keys', () => {
  const normal = load('?stage=3&mode=2&god=1');
  assert.equal(normal.api.state, 'menu');
  normal.tap('Digit1');
  assert.equal(normal.api.stage, 1);
  assert.equal(normal.api.god, false);
  normal.tap('KeyB');
  assert.equal(normal.api.boss, false);
  for (const [requested, expected] of [['-2', 1], ['99', 8], ['bad', 1], ['2', 2], ['8', 8]]) {
    assert.equal(load('?debug=1&stage=' + requested).api.stage, expected);
  }
  const sim = load('?debug=1&stage=2&mode=2&god=1');
  assert.equal(sim.api.mode, 2);
  assert.equal(sim.api.god, true);
  sim.tap('KeyI');
  assert.equal(sim.api.god, false);
  sim.tap('KeyU');
  assert.equal(sim.api.pickups, 18);
  sim.tap('KeyB');
  assert.equal(sim.api.boss, true);
  assert.equal(sim.api.snapshot().bossHp, sim.nv.DIFFICULTY.boss[1].hp * sim.nv.DIFFICULTY.coop.hp);
  sim.tap('KeyK');
  assert.equal(sim.api.state, 'clear');
  sim.tap('KeyN');
  assert.equal(sim.api.stage, 3);
  for (let i=0;i<6;i++) sim.tap('KeyN');
  assert.equal(sim.api.state, 'victory');
  sim.tap('KeyR');
  assert.equal(sim.api.state, 'menu');
});

test('all weapon levels preserve ballistics and distinguish player colors', () => {
  const { nv, game } = load('?debug=1&mode=2');
  for (const weapon of ['N', 'S', 'L', 'M']) {
    for (let level = 1; level <= 3; level++) {
      game.shots = [];
      for (const player of game.players) {
        player.weapon = weapon;
        player.level = level;
        nv.shoot(game, player);
      }
      const first = game.shots.filter(shot => shot.owner === 0);
      const second = game.shots.filter(shot => shot.owner === 1);
      const expected = weapon === 'S' ? level * 2 + 1 : weapon === 'M' ? level + 1 : level;
      assert.equal(first.length, expected);
      assert.equal(second.length, expected);
      assert.notEqual(first[0].col, second[0].col);
      assert.equal(first[0].col, nv.weaponColors[weapon]);
      if (weapon === 'N') assert.equal(second[0].col, game.players[1].color);
      assert.equal(first[0].vy, { N: -650, S: -570, L: -1100, M: -360 }[weapon]);
      assert.equal(first[0].damage, weapon === 'M' ? 2.3 : weapon === 'L' ? 1.25 : 1);
      assert.equal(first[0].homing, weapon === 'M');
    }
  }
});

test('shot collision, homing and score ownership', () => {
  const { nv, game } = load('?debug=1&mode=2');
  const player = game.players[1];
  nv.spawnEnemy(game, 0, player.x);
  const enemy = game.enemies[0];
  enemy.y = player.y - 19;
  enemy.hp = 1;
  nv.shoot(game, player);
  nv.updateShots(game, 0);
  nv.updateEnemies(game, 0);
  assert.equal(player.score, 100);
  assert.equal(game.players[0].score, 0);
  game.enemies = [];
  nv.spawnEnemy(game, 0, player.x - 100);
  game.enemies[0].y = 250;
  player.weapon = 'M';
  nv.shoot(game, player);
  const missile = game.shots.find(shot => shot.homing);
  const velocity = missile.vx;
  nv.updateShots(game, 1 / 60);
  assert.notEqual(missile.vx, velocity);
});

test('enemies aim at nearest living player and bosses target both survivors', () => {
  const { nv, game } = load('?debug=1&mode=2');
  nv.DIFFICULTY.curve.volley = [1, 1];
  const [first, second] = game.players;
  Object.assign(first, { x: 80, y: 650 });
  Object.assign(second, { x: 400, y: 650 });
  for (const type of [0, 1, 2]) {
    for (const [x, target] of [[100, first], [380, second]]) {
      game.enemies = [];
      game.bullets = [];
      nv.spawnEnemy(game, type, x);
      const enemy = game.enemies[0];
      Object.assign(enemy, { y: 200, fire: 0, armed: true });
      nv.updateEnemies(game, 0);
      const bullet = game.bullets[Math.floor(game.bullets.length / 2)];
      assert.ok(Math.abs(Math.atan2(bullet.vy, bullet.vx) -
        Math.atan2(target.y - enemy.y, target.x - enemy.x)) < 1e-10);
    }
  }
  first.lives = 0;
  game.enemies = [];
  game.bullets = [];
  nv.spawnEnemy(game, 0, first.x);
  Object.assign(game.enemies[0], { y: 200, fire: 0, armed: true });
  nv.updateEnemies(game, 0);
  assert.ok(game.bullets[0].vx > 0, 'Dead nearest player must be ignored');
  second.lives = 0;
  game.bullets = [];
  game.enemies[0].fire = 0;
  nv.updateEnemies(game, 0);
  assert.equal(game.bullets.length, 0);
  first.lives = second.lives = 10;
  for (const stage of [2,3,4,5,6,7,8]) {
    nv.beginStage(game,stage); nv.spawnBoss(game);
    Object.assign(game.boss,{y:170,hp:game.boss.maxHp*.2});
    for (let i=0;i<18000;i++) nv.updateBoss(game,1/60);
    for (const skill of nv.DIFFICULTY.bossSkills[stage-1].filter(k=>['laser','homing','charge'].includes(k.name))) {
      assert.deepEqual([...new Set(game.boss.targets.filter(t=>t.skill===skill.name).map(t=>t.id))].sort(),[0,1]);
    }
  }
});

test('opening balance, normal cadence and increasing stage difficulty', () => {
  const { nv, game } = load('?debug=1&mode=1');
  const stats = [];
  assert.equal(nv.themes.length,8);
  for(let i=1;i<8;i++) {
    assert.ok(nv.DIFFICULTY.boss[i].hp >= nv.DIFFICULTY.boss[i-1].hp);
    assert.ok(nv.DIFFICULTY.stages[i].start >= nv.DIFFICULTY.stages[i-1].start);
    assert.ok(nv.DIFFICULTY.stages[i].end > nv.DIFFICULTY.stages[i-1].end);
  }
  for (const stage of [1, 2, 3]) {
    nv.beginStage(game, stage);
    nv.updateStage(game, 2.01);
    const waveSize = game.enemies.length;
    const small = game.enemies.find(enemy => enemy.type === 0);
    const hp = small.hp;
    game.enemies = [small];
    Object.assign(small, { y: 200, fire: 0, armed: true });
    nv.updateEnemies(game, 0);
    stats.push({ hp, speed: Math.hypot(game.bullets[0].vx, game.bullets[0].vy), waveSize, interval: small.fire });
    const waveTime = game.stageTime;
    while (game.wave === 1) nv.updateStage(game, .01);
    stats[stage - 1].waveInterval = game.stageTime - waveTime;
  }
  assert.ok(stats[0].hp < 3);
  for (let i = 1; i < stats.length; i++) {
    assert.ok(stats[i].speed > stats[i - 1].speed);
    assert.ok(stats[i].waveSize >= stats[i - 1].waveSize);
    assert.ok(stats[i].interval < stats[i - 1].interval);
    assert.ok(stats[i].waveInterval < stats[i - 1].waveInterval);
  }
  nv.beginStage(game, 1);
  nv.spawnEnemy(game, 1, 240);
  assert.equal(game.enemies[0].hp, nv.difficulty(game).hp);
  nv.spawnEnemy(game, 2, 240);
  assert.equal(game.enemies[1].hp, nv.difficulty(game).heavyHp);
  const player = game.players[0];
  for (const [weapon, cooldown] of [['N', .14], ['S', .17], ['L', .085], ['M', .29]]) {
    player.weapon = weapon;
    nv.shoot(game, player);
    assert.equal(player.cooldown, cooldown);
  }
  player.weapon = 'N';
  game.enemies = [];
  game.shots = [];
  nv.spawnEnemy(game, 0, player.x);
  game.enemies[0].y = player.y - 19;
  for (let i = 0; i < 3; i++) {
    nv.shoot(game, player);
    nv.updateShots(game, 0);
  }
  nv.updateEnemies(game, 0);
  assert.equal(game.enemies.length, 0, 'Opening small enemy takes three Lv1 hits');
});

test('single-enemy waves spawn at center and nonpositive counts spawn nothing', () => {
  const { nv, game } = load('?debug=1&mode=2');
  for (const count of [1, 0, -1]) {
    nv.beginStage(game, 1);
    nv.smoothCount = () => count;
    nv.updateStage(game, 2.01);
    assert.equal(game.enemies.length, count === 1 ? 1 : 0);
    if (count === 1) assert.equal(game.enemies[0].x, 240);
  }
});

test('configured drops, pity guarantee, first power, reset and escaped enemies', () => {
  const { context, nv, game } = load('?debug=1&mode=1');
  function kill() {
    nv.spawnEnemy(game, 0, 240);
    game.enemies.at(-1).hp = 0;
    nv.updateEnemies(game, 0);
  }
  context.nextRandom = () => .99;
  for (let i = 0; i < nv.DIFFICULTY.enemy.pity; i++) kill();
  assert.equal(game.pickups.length, 0);
  nv.spawnEnemy(game, 0, 240);
  game.enemies[0].y = 851;
  nv.updateEnemies(game, 0);
  assert.equal(game.killsWithoutDrop, nv.DIFFICULTY.enemy.pity);
  kill();
  assert.equal(game.pickups.length, 1);
  assert.equal(game.killsWithoutDrop, 0);
  kill();
  assert.equal(game.pickups.length, 1);
  assert.equal(game.pickups[0].type, 'P');
  assert.equal(game.pickups[0].first, true);
  context.nextRandom = () => nv.difficulty(game).dropRate - .01;
  kill();
  assert.equal(game.pickups.length, 2);
  assert.equal(game.killsWithoutDrop, 0);
  context.nextRandom = () => nv.difficulty(game).dropRate + .01;
  kill();
  assert.equal(game.pickups.length, 2);
  assert.equal(game.killsWithoutDrop, 1);
  nv.beginStage(game, 2);
  assert.equal(game.killsWithoutDrop, 0);
  kill();
  game.start(1);
  assert.equal(game.killsWithoutDrop, 0);
});

test('random pickup weights keep upgrades available without shield flooding', () => {
  const { nv } = load();
  const types = [...nv.DIFFICULTY.pickup.types];
  const count = type => types.filter(t => t === type).length;
  assert.equal(types.length, 24);
  assert.ok(count('H') <= 3);
  assert.ok(count('P') >= 3);
  assert.ok(count('V') <= 2);
  const weapons = types.filter(t => 'NSLM'.includes(t)).length;
  assert.ok(weapons >= 8 && weapons <= 12);
  assert.ok(count('B') > 0 && count('F') > 0);
});

test('shared power, type keeps, max bonus and independent co-op players', () => {
  const { nv, game } = load('?debug=1&mode=2');
  const labels = [];
  game.toast = (x, y, label) => labels.push(label);
  const [player, other] = game.players;
  function collect(type) {
    nv.drop(game, player.x, player.y, type);
    nv.updatePickups(game, 0);
    assert.equal(game.pickups.length, 0);
  }
  assert.equal('levels' in player, false);
  collect('N');
  assert.equal(player.level, 1);
  assert.equal(player.score, 200);
  assert.equal(labels.at(-1), 'N KEEP +200');
  collect('P');
  assert.equal(player.weapon, 'N');
  assert.equal(player.level, 2);
  for (const weapon of ['S', 'L', 'M', 'N']) {
    const before = nv.difficulty(game).intensity;
    const power = game.difficultyPower;
    nv.updateDifficulty(game, 1 / 60);
    const expectedPower = game.difficultyPower;
    game.difficultyPower = power;
    collect(weapon);
    assert.equal(player.weapon, weapon);
    assert.equal(player.level, 2);
    assert.equal(labels.at(-1), weapon + ' WEAPON');
    assert.equal(nv.difficulty(game).intensity, before);
    nv.updateDifficulty(game, 1 / 60);
    assert.equal(game.difficultyPower, expectedPower, 'type switch preserves the power trajectory');
  }
  collect('P');
  assert.equal(player.level, 3);
  assert.equal(player.weapon, 'N');
  collect('P');
  assert.equal(player.level, 3);
  assert.equal(player.score, 700);
  assert.equal(labels.at(-1), 'POWER MAX +500');
  assert.equal(other.level, 1);
  assert.equal(other.weapon, 'N');
  assert.equal(other.score, 0);
  player.invincible = 0;
  nv.hitPlayer(game, player);
  assert.equal(player.level, 2);
  collect('S');
  assert.equal(player.level, 2);
  collect('H'); assert.equal(player.shield, 12);
  collect('V'); assert.equal(player.lives, 10);
  collect('B'); assert.equal(player.bombs, 4);
  collect('F'); assert.equal(player.score, 1700);
});

test('opening supply, random first drop and later pity are power capsules', () => {
  const { nv, game, context } = load('?debug=1&mode=1');
  game.stageTime = nv.DIFFICULTY.pickup.firstSupplyTime - .01;
  nv.updateStage(game, .01);
  assert.equal(game.pickups.at(-1).type, 'P');
  assert.equal(game.firstDrop, false);
  nv.drop(game, 240, 200);
  assert.equal(game.pickups.at(-1).type, 'P');
  assert.equal(game.pickups.at(-1).first, true);
  game.killsWithoutDrop = nv.DIFFICULTY.enemy.pity;
  context.nextRandom = () => .99;
  nv.spawnEnemy(game, 0, 240);
  game.enemies.at(-1).hp = 0;
  nv.updateEnemies(game, 0);
  assert.equal(game.pickups.at(-1).type, 'P');
});

test('bomb caps, full bonus, independent co-op inventory and opening clamp', () => {
  for (const mode of [1, 2]) {
    const { nv, game } = load('?debug=1&mode=' + mode);
    assert.equal(nv.DIFFICULTY.player.maxBombs, 5);
    assert.equal(nv.DIFFICULTY.player.bombs, 3);
    const labels = [];
    game.toast = (x, y, label) => labels.push(label);
    for (const player of game.players) {
      assert.equal(player.bombs, 3);
      assert.ok(player.bombs <= 5);
      const other = game.players.find(p => p !== player);
      const otherBombs = other?.bombs;
      const otherScore = other?.score;
      for (let i = 0; i < 8; i++) {
        const score = player.score;
        nv.drop(game, player.x, player.y, 'B');
        nv.updatePickups(game, 0);
        assert.equal(player.bombs, Math.min(4 + i, 5));
        assert.equal(player.score, score + (i >= 2 ? 500 : 0));
        assert.equal(labels.at(-1), i >= 2 ? 'BOMB MAX +500' : 'BOMB +1');
        if (other) {
          assert.equal(other.bombs, otherBombs);
          assert.equal(other.score, otherScore);
        }
      }
    }
    // Boss 奖励中的 B 也必须通过同一上限与满额奖励逻辑。
    nv.spawnBoss(game);
    game.boss.hp = 0;
    nv.updateBoss(game, 0);
    const bomb = game.pickups.find(p => p.type === 'B');
    assert.ok(bomb);
    const player = game.players[0];
    bomb.x = player.x;
    bomb.y = player.y;
    const score = player.score;
    nv.updatePickups(game, 0);
    assert.equal(player.bombs, 5);
    assert.equal(player.score, score + 500);
    assert.equal(labels.at(-1), 'BOMB MAX +500');
    const hud = [];
    game.ctx.fillText = label => hud.push(label);
    nv.render(game);
    assert.equal(hud.filter(label => label === '♥×10   BOMB 5').length, mode);
    nv.DIFFICULTY.player.bombs = 9;
    game.start(mode);
    assert.equal(game.players.length, mode);
    for (const p of game.players) assert.equal(p.bombs, 5);
  }
});

test('respawn restores exactly three bombs independently in both modes', () => {
  for (const mode of [1,2]) for (const before of [0,5]) {
    const {nv,game}=load('?debug=1&mode='+mode);
    assert.equal(nv.DIFFICULTY.player.respawnBombs,3);
    for(const player of game.players) {
      player.bombs=before; player.invincible=0;
      const other=game.players.find(p=>p!==player), otherBombs=other?.bombs;
      nv.hitPlayer(game,player);
      assert.equal(player.bombs,3); assert.equal(player.lives,9);
      if(other) assert.equal(other.bombs,otherBombs);
    }
  }
});

test('damage, shield, invincibility, bombs, co-op survival and game over', () => {
  const sim = load('?debug=1&mode=2');
  const { nv, game } = sim;
  const [first, second] = game.players;
  first.invincible = 0;
  first.shield = 12;
  nv.hitPlayer(game, first);
  assert.equal(first.shield, 0);
  assert.equal(first.lives, 10);
  nv.hitPlayer(game, first);
  assert.equal(first.lives, 10);
  first.invincible = 0;
  first.level = 3;
  nv.hitPlayer(game, first);
  assert.equal(first.lives, 9);
  assert.equal(first.level, 2);
  game.state = 'playing';
  nv.spawnEnemy(game, 2, 100);
  const enemy = game.enemies[0];
  const hp = enemy.hp;
  nv.enemyBullet(game, 50, 50, 0, 100);
  sim.tap('Slash');
  assert.equal(second.bombs, 2);
  assert.equal(game.bullets.length, 0);
  assert.equal(enemy.hp, hp - 95);
  for (const key of ['KeyQ', 'ShiftLeft']) sim.tap(key);
  assert.equal(first.bombs, 1);
  sim.tap('ShiftRight');
  assert.equal(second.bombs, 1);
  first.lives = 0;
  nv.updatePlayers(game, 0);
  assert.equal(game.state, 'playing');
  second.lives = 0;
  nv.updatePlayers(game, 0);
  assert.equal(game.state, 'gameover');
  sim.tap('Enter');
  assert.equal(game.state, 'menu');
});

test('gamepads: movement, fire, bomb edge and Start pause', () => {
  const sim = load('?debug=1&mode=2');
  sim.tick(134);
  const pad = () => ({ axes: [1, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) });
  const pads = [pad(), pad()];
  pads[0].buttons[0].pressed = true;
  pads[1].buttons[1].pressed = true;
  sim.pads(pads);
  const x = sim.game.players[0].x;
  sim.tick(30);
  assert.ok(sim.game.players[0].x > x);
  assert.ok(sim.game.shots.some(shot => shot.owner === 0));
  assert.equal(sim.game.players[1].bombs, 2);
  pads[0].buttons[9].pressed = true;
  sim.tick();
  assert.equal(sim.api.state, 'paused');
  pads[0].buttons[9].pressed = false;
  sim.tick();
  pads[0].buttons[9].pressed = true;
  sim.tick();
  assert.equal(sim.api.state, 'playing');
});

test('eight stages: timed waves, all boss phases, clear and victory', () => {
  const sim = load('?debug=1&mode=2&god=1');
  for (let stage = 1; stage <= 8; stage++) {
    assert.equal(sim.api.stage, stage);
    sim.tick(134);
    assert.equal(sim.api.state, 'playing');
    let frames = 0;
    while (!sim.game.boss && frames++ < 6000) sim.tick();
    assert.ok(sim.game.boss, 'Timed waves should reach boss');
    const boss = sim.game.boss;
    for (const [ratio, phase] of [[1, 1], [.6, 2], [.3, 3]]) {
      boss.hp = boss.maxHp * ratio;
      boss.fire = 0;
      boss.y = 170;
      sim.nv.updateBoss(sim.game, 1 / 60);
      assert.equal(boss.phase, phase);
      for (let i=0;i<240;i++) sim.nv.updateBoss(sim.game, 1/60);
      assert.ok(Object.keys(boss.skillsUsed).length > 0);
    }
    boss.hp = 0;
    boss.lastHit = 1;
    sim.tick();
    assert.equal(sim.api.state, 'clear');
    assert.equal(sim.api.snapshot().bossActive, false);
    assert.equal(sim.api.snapshot().bossHp, 0);
    assert.equal(sim.api.pickups, 6);
    assert.ok(sim.game.players[1].score >= stage * 3000);
    sim.tick(230);
  }
  assert.equal(sim.api.state, 'victory');
});

test('dense continuous monotone curves, stage tiers and eased power', () => {
  const { nv, game, api } = load('?debug=1&mode=1');
  const increasing = ['intensity', 'count', 'speed', 'hp', 'heavyHp', 'bulletSpeed', 'volley', 'armed'];
  const decreasing = ['waveInterval', 'fireInterval', 'dropRate'];
  function compare(a, b, limit) {
    for (const key of increasing) { assert.ok(b[key] >= a[key] - 1e-10, key); assert.ok(b[key] - a[key] < limit, key); }
    for (const key of decreasing) { assert.ok(b[key] <= a[key] + 1e-10, key); assert.ok(a[key] - b[key] < limit, key); }
  }
  for (const stage of [1, 2, 3, 4, 5, 6, 7, 8]) {
    game.stage = stage;
    for (let power = 0; power <= 1.001; power += .1) {
      let previous = nv.difficulty(game, 0, power);
      for (let i = 1; i <= 1000; i++) {
        const current = nv.difficulty(game, i / 1000, power);
        compare(previous, current, .1); previous = current;
      }
    }
    for (let i = 0; i <= 1000; i++) {
      const progress = i / 1000;
      compare(nv.difficulty(game, progress, 0), nv.difficulty(game, progress, 1), 20);
      for (let j = 1; j <= 1000; j++) compare(nv.difficulty(game, progress, (j - 1) / 1000), nv.difficulty(game, progress, j / 1000), .02);
    }
  }
  for (const stage of [1,2,3,4,5,6,7]) {
    game.stage = stage; const end = nv.difficulty(game, 1, 0);
    game.stage++; assert.ok(nv.difficulty(game, 0, 0).intensity >= end.intensity - 1e-10);
  }
  // 同进度、同火力下，关卡档位严格递增。
  for (let i = 0; i <= 100; i++) {
    for (let j = 0; j <= 100; j++) {
      const tiers = [1, 2, 3, 4, 5, 6, 7, 8].map(stage => {
        game.stage = stage;
        return nv.difficulty(game, i / 100, j / 100);
      });
      for (let k = 1; k < tiers.length; k++) {
        for (const key of increasing) assert.ok(tiers[k][key] > tiers[k - 1][key], key);
        for (const key of ['waveInterval', 'fireInterval']) assert.ok(tiers[k][key] < tiers[k - 1][key], key);
      }
    }
  }
  game.stage = 1;
  const opening = nv.difficulty(game, 0, 0);
  assert.equal(opening.count, 2);
  assert.equal(opening.hp, 2);
  assert.equal(opening.fireInterval, 6);
  assert.equal(opening.waveInterval, 6);
  assert.equal(opening.armed, .25);
  game.difficultyPower = 0;
  const player = game.players[0];
  nv.drop(game, player.x, player.y, 'P'); nv.updatePickups(game, 0);
  assert.equal(nv.difficulty(game).power, 0);
  nv.updateDifficulty(game, 1 / 60);
  const first = nv.difficulty(game).power;
  assert.ok(first > 0 && first < .01);
  const snapshot = api.snapshot();
  for (let i = 0; i < 240; i++) nv.updateDifficulty(game, 1 / 60);
  assert.ok(nv.difficulty(game).power > first);
  assert.equal(snapshot.difficulty.power, first);
});

// 使用同一新手模拟器做密度回归；统计验收仍另跑 200 种子。
test('late-stage intensity and pressure tiers increase with bounded adjacent ratios', () => {
  const {nv,game}=load('?debug=1&mode=1');
  for(let i=0;i<=100;i++) for(const power of [0,.1625,.65,1]) {
    let previous;
    for(let stage=3;stage<=8;stage++) {
      game.stage=stage;
      const d=nv.difficulty(game,i/100,power);
      const c=nv.DIFFICULTY.stages[stage-1];
      const pressure=c.bullet ? c.bullet.start+(c.bullet.end-c.bullet.start)*nv.smoothstep(i/100)+c.influence*power : d.intensity;
      if(previous) {
        assert.ok(pressure>previous.pressure && pressure/previous.pressure<=1.3);
        for(const key of ['count','speed','hp','heavyHp','bulletSpeed','volley']) {
          assert.ok(d[key]>previous.d[key] && d[key]/previous.d[key]<=1.3,key);
        }
        assert.ok(d.fireInterval<previous.d.fireInterval);
        if(stage>4) assert.ok(d.intensity/previous.d.intensity<=1.3);
      }
      previous={d,pressure};
    }
  }
  for(let i=4;i<8;i++) {
    const a=nv.DIFFICULTY.stages[i-1].bullet,b=nv.DIFFICULTY.stages[i].bullet;
    assert.ok(b.cap>a.cap && b.cap/a.cap<=1.3);
  }
});

test('measured density fixture matches source and increases smoothly from stage 3', () => {
  const measured=JSON.parse(fs.readFileSync(path.join(__dirname,'density-current.json'),'utf8'));
  const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'density-baseline.json'),'utf8'));
  const sources=modules.map(m=>[m,fs.readFileSync(path.join(root,m),'utf8')]);
  const hash=require('node:crypto').createHash('sha256').update(JSON.stringify(sources)).digest('hex');
  assert.equal(measured.sourceHash,hash,'Run node tests/density-profile.cjs --save after gameplay changes');
  assert.equal(measured.seeds.length,12);
  assert.deepEqual(measured.seeds,baseline.seeds);
  for(const profile of ['N1','S3']) {
    const rows=measured.profiles[profile],old=baseline.profiles[profile];
    assert.deepEqual(rows.slice(0,3),old.slice(0,3),'Stages 1–3 density unchanged');
    for(let i=3;i<8;i++) for(const key of ['early','middle','late','boss']) {
      const ratio=rows[i][key]/rows[i-1][key];
      assert.ok(ratio>=1 && ratio<=1.3,`${profile} stage ${i+1} ${key}: ${ratio}`);
    }
    const mean=r=> (r.early+r.middle+r.late)/3;
    assert.ok(mean(rows[7])<=mean(old[7])*.75,'Stage 8 main-stage density drops at least 25%');
  }
});

test('upgraded stage-1 occupancy and stage-3 pressure profiles', () => {
  let result;
  const filename = path.join(__dirname, 'novice-sim.cjs');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require, __dirname, URLSearchParams, process: { argv: [process.execPath, filename, root, '1'] },
    console: { log: json => { result = JSON.parse(json); } }
  }, { filename });
  const average = (name, key) => {
    const windows = result.profile[name].slice(1, 4);
    assert.deepEqual(windows.map(w => w.window), ['15-30s', '30-45s', '45-60s']);
    return windows.reduce((sum, w) => sum + w[key], 0) / windows.length;
  };
  assert.ok(average('stage1_single_S3', 'avgEnemies') >= 4);
  assert.ok(average('stage1_single_S3', 'avgEnemyBullets') >= 4);
  for (const key of ['avgEnemies', 'avgEnemyBullets']) {
    assert.ok(average('stage3_single_N1', key) > 1.5 * average('stage1_single_N1', key), key);
  }
});

test('boss skills unlock, warn, rotate, respect caps and clean up', () => {
  for (const stage of [1,2,3,4,5,6,7,8]) {
    const {nv,game} = load('?debug=1&mode=2&god=1');
    nv.beginStage(game,stage); nv.spawnBoss(game);
    const b=game.boss; b.y=170;
    for (const [ratio,phase] of [[1,1],[.5,2],[.2,3]]) {
      b.hp=b.maxHp*ratio;
      for(let i=0;i<6000;i++) {
        const warning=b.warning, before=game.bullets.length;
        nv.updateBoss(game,1/60);
        if (warning && warning.left>0) assert.equal(game.bullets.length,before,'Warning cannot emit damage');
        if (b.warning) {
          assert.ok(nv.DIFFICULTY.bossSkills[stage-1].find(k=>k.name===b.skill).phase<=phase);
          if(b.skill==='wall') assert.ok(b.warning.gap>=120);
        }
        assert.ok(game.enemies.filter(e=>e.summoned).length<=4);
        game.bullets=[];
      }
    }
    for(const k of nv.DIFFICULTY.bossSkills[stage-1]) assert.ok(b.skillsUsed[k.name]>0,k.name);
    if(stage===1) assert.equal(b.targets.length,0,'First boss has no aimed skills');
    b.hp=0; nv.updateBoss(game,0);
    assert.equal(game.bullets.length,0); assert.equal(game.enemies.filter(e=>e.summoned).length,0);
    assert.equal(b.warning,null); assert.equal(b.active,null);
  }
});

test('laser warning precedes damage at fixed x, protections and bounded homing', () => {
  const {nv,game}=load('?debug=1&mode=2');
  nv.beginStage(game,2); game.state='playing'; nv.spawnBoss(game);
  const b=game.boss; Object.assign(b,{y:170,hp:b.maxHp*.5,cursor:2,fire:0});
  nv.updateBoss(game,0); const x=b.warning.x;
  for(let i=0;i<59;i++) nv.updateBoss(game,1/60);
  assert.equal(game.bullets.length,0); assert.ok(b.warning);
  for(let i=0;i<5;i++) nv.updateBoss(game,1/60);
  assert.ok(game.bullets.some(b=>b.laser));
  assert.ok(game.bullets.every(b=>b.x===x));
  const p=game.players[0]; p.x=x; p.y=690;
  function collision() { const bullet=game.bullets[0]; bullet.x=p.x; bullet.y=p.y; nv.updatePlayers(game,0); }
  function add() { nv.enemyBullet(game,p.x,p.y,Math.PI/2,650,6); }
  p.invincible=1; collision(); assert.equal(p.lives,10);
  add(); p.invincible=0; p.shield=12; collision(); assert.equal(p.shield,0); assert.equal(p.lives,10);
  add(); p.invincible=0; game.god=true; collision(); assert.equal(p.lives,10);
  add(); game.god=false; collision(); assert.equal(p.lives,9);
  const h={x:240,y:200,vx:0,vy:100,homing:true,life:4,turn:.45,speed:100,target:1};
  nv.updateBossBullet(game,h,1/60);
  assert.ok(Math.abs(Math.atan2(h.vy,h.vx)-Math.PI/2)<=.45/60+1e-10);
  nv.updateBossBullet(game,h,4); assert.equal(h.dead,true);
  game.players.forEach(p=>p.lives=0); b.fire=0; b.active=b.warning=null;
  nv.updateBoss(game,1); assert.equal(b.warning,null); assert.equal(b.active,null);
});

test('ten lives HUD, capped V pickup and bonus', () => {
  const {nv,game}=load('?debug=1&mode=2');
  const labels=[], hud=[]; game.ctx.fillText=(s,x,y,width)=>{labels.push(s);if(s.includes('♥×')) hud.push({x,width});};
  nv.render(game);
  assert.equal(labels.filter(s=>s.includes('♥×10')).length,2);
  assert.ok(hud[0].x+hud[0].width<hud[1].x);
  assert.ok(hud[1].x+hud[1].width<=480);
  for(const p of game.players) {
    assert.equal(p.lives,10); p.lives=15;
    nv.drop(game,p.x,p.y,'V'); const score=p.score; nv.updatePickups(game,0);
    assert.equal(p.lives,15); assert.equal(p.score,score+500);
  }
});

test('render every state and fixed-step animation without storage', () => {
  const sim = load('?debug=1&mode=1', true);
  for (const state of ['menu', 'intro', 'playing', 'paused', 'clear', 'gameover', 'victory']) {
    sim.game.state = state;
    sim.nv.render(sim.game);
  }
  for (let stage = 1; stage <= 8; stage++) {
    sim.nv.beginStage(sim.game, stage);
    sim.nv.spawnBoss(sim.game);
    sim.nv.render(sim.game);
  }
  sim.game.state = 'playing';
  sim.game.award(0, 100);
  assert.equal(sim.game.highScore, 100);
  const clock = sim.game.clock;
  sim.frame(0);
  sim.frame(1000);
  assert.ok(sim.game.clock > clock);
  assert.ok(sim.game.clock - clock <= .101);
});


test('rain corridor, cross telegraph, scene variety and late-stage safety bounds', () => {
  const {nv,game}=load('?debug=1&mode=1&god=1');
  assert.equal(new Set(nv.themes.map(t=>t.bg)).size,8);
  assert.equal(new Set(nv.themes.map(t=>t.boss)).size,8);
  assert.equal(nv.AUDIO.tracks.length,8);
  assert.equal(new Set(nv.AUDIO.tracks.map(t=>t.root)).size,8);
  for(let stage=1;stage<=8;stage++) {
    nv.beginStage(game,stage);
    for(const power of [0,.5,1]) {
      const d=nv.difficulty(game,1,power);
      assert.ok(d.fireInterval>0 && d.waveInterval>0);
      assert.ok(d.bulletSpeed<226 && d.count<25);
    }
  }
  for(const [stage,skill] of [[4,'rain'],[5,'cross']]) {
    nv.beginStage(game,stage);nv.spawnBoss(game);
    const b=game.boss;
    Object.assign(b,{y:170,hp:b.maxHp*.2,fire:0,cursor:nv.DIFFICULTY.bossSkills[stage-1].findIndex(k=>k.name===skill)});
    nv.updateBoss(game,0);
    const w={...b.warning};
    assert.equal(b.skill,skill);
    assert.ok(w.left>=1);
    assert.equal(game.bullets.length,0);
    nv.render(game);
    nv.updateBoss(game,w.left);
    assert.ok(game.bullets.length>0);
    nv.render(game);
    if(skill==='rain') {
      for(const bullet of game.bullets) assert.ok(Math.abs(bullet.x-w.x)>=w.gap/2+4);
      assert.deepEqual([...new Set(game.bullets.map(b=>b.delay))],[0,.5]);
      const delayed=game.bullets.find(b=>b.delay===.5), first=game.bullets[0];
      game.state='playing';game.update(.25);
      assert.ok(game.bullets.includes(delayed),'Later rain rows survive offscreen cleanup');
      assert.equal(delayed.y,-20);assert.equal(delayed.delay,.25);
      assert.ok(first.y>-20);
    }
    else for(const bullet of game.bullets) {
      assert.equal(bullet.x,w.x);assert.equal(bullet.y,w.y);
      assert.ok(Math.abs(bullet.vx)<1e-8 || Math.abs(bullet.vy)<1e-8);
    }
  }
});

test('audio silently degrades and mute storage is optional', () => {
  for (const blocked of [false, true]) {
    const sim = load('', blocked);
    assert.equal(sim.nv.audio.loaded, true);
    assert.equal(sim.nv.audio.ready, false);
    for (const weapon of ['N', 'S', 'L', 'M']) sim.nv.sound.shoot({id: 0, weapon});
    sim.nv.sound.bomb();
    sim.nv.sound.unlock();
    sim.tap('KeyM');
    assert.equal(sim.nv.audio.muted, true);
    if (!blocked) assert.equal(sim.storage.get('neon-vector-muted'), 'true');
    sim.tap('KeyM');
    assert.equal(sim.nv.audio.muted, false);
    assert.equal(sim.nv.audio.ready, false);
    assert.ok(Object.isFrozen(sim.nv.audio));
  }
});

test('audio unlock, independent shot throttles, bomb and tracks', () => {
  let created = 0, oscillators = 0, explosions = 0;
  const param = () => ({setValueAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {}});
  const node = () => ({connect() {}, disconnect() {}, start() {}, stop() {},
    gain: param(), frequency: param(), threshold: param(), ratio: param()});
  class Audio {
    constructor() { Audio.last = this; created++; this.currentTime = 0; this.state = 'running'; this.sampleRate = 100; }
    createGain() { return node(); }
    createDynamicsCompressor() { return node(); }
    createBiquadFilter() { return node(); }
    createOscillator() { oscillators++; return node(); }
    createBuffer(channels, length) { return {getChannelData: () => new Float32Array(length)}; }
    createBufferSource() { explosions++; return node(); }
    resume() {}
  }
  const sim = load('', false, Audio);
  sim.tick();
  assert.equal(created, 0);
  sim.key('KeyX');
  assert.equal(created, 1);
  assert.equal(sim.nv.audio.ready, true);
  const player = {id: 0, weapon: 'N'};
  let before = oscillators;
  sim.nv.sound.shoot(player); sim.nv.sound.shoot(player);
  assert.equal(oscillators - before, 1);
  sim.nv.sound.shoot({id: 1, weapon: 'L'});
  assert.equal(oscillators - before, 2);
  Audio.last.currentTime = .081;
  sim.nv.sound.shoot(player);
  assert.equal(oscillators - before, 3);
  sim.nv.sound.update({state: 'playing', stage: 2});
  assert.equal(sim.nv.audio.track, 'stage-fleet');
  sim.nv.sound.update({state: 'playing', stage: 2, boss: {}});
  assert.equal(sim.nv.audio.track, 'boss-fleet');
  sim.nv.sound.update({state: 'menu', stage: 2});
  assert.equal(sim.nv.audio.track, 'menu');
  sim.game.start(1); sim.game.state = 'playing';
  sim.tap('KeyQ');
  assert.equal(explosions, 1);
  assert.equal(sim.game.players[0].bombs, 2);
  const pad = load('', false, Audio);
  const countBeforePad = created;
  pad.pads([{buttons: [{pressed: true}], axes: [0, 0]}]);
  pad.tick();
  assert.equal(created, countBeforePad + 1);
  assert.equal(pad.nv.audio.ready, true);
  const broken = load('', false, class { constructor() { throw new Error('unavailable'); } });
  assert.doesNotThrow(() => broken.tap('KeyX'));
  assert.equal(broken.nv.audio.ready, false);
  const pointer = load('', false, Audio);
  pointer.pointer();
  assert.equal(pointer.nv.audio.ready, true);
});

console.log(`\n${checks} offline simulation groups passed.`);
