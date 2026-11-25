// Continuous stage 1-3 measurement. Uses boss-attribution.cjs and does not change game rules.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHarness, loadGame } = require('./boss-attribution.cjs');

const CONTROLLER_SHA256 = '3731bd14e8223e80b3e323540dcfae2a24faf64d8f883a4101769939f67be258';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function crew(game) {
  return game.players.map(player => ({
    id: player.id,
    lives: player.lives,
    level: player.level,
    weapon: player.weapon,
    bombs: player.bombs
  }));
}

function runCampaign(root, controllerSource, protocol, seed, mode) {
  const gameRandomSeed = ((seed * protocol.gameRandom.mixSeed + mode * protocol.gameRandom.mixMode) >>> 0) || protocol.gameRandom.zeroBecomes;
  const context = loadGame(root, gameRandomSeed);
  const nv = context.NV;
  const game = nv.game;
  vm.runInContext(controllerSource, context, { filename: 'controller.js' });
  context.installBot(context, seed);
  const rawControls = nv.input.controls;
  let bombButton = 0;
  nv.input.controls = index => {
    const value = rawControls(index);
    if (value && value.bomb) bombButton += 1;
    return value;
  };
  const harness = createHarness(nv);
  const originalHit = nv.hitPlayer;
  const downgrades = [];
  const recoveries = [];
  nv.hitPlayer = function (current, player) {
    const before = { lives: player.lives, level: player.level, weapon: player.weapon, bombs: player.bombs };
    originalHit.apply(this, arguments);
    if (player.lives < before.lives) {
      downgrades.push({ frame: harness.frame, stage: current.stage, player: player.id, before, after: { lives: player.lives, level: player.level, weapon: player.weapon, bombs: player.bombs } });
      recoveries.push({ frame: harness.frame, player: player.id, level: player.level, recoveredFrame: null });
    }
  };
  harness.attachUpdate(game);
  game.start(mode);
  game.god = false;
  const stages = {};
  function noteStage() {
    const stage = game.stage;
    if (stages[stage]) return;
    stages[stage] = { entryFrame: harness.frame, entry: crew(game) };
  }
  noteStage();
  let stopReason = 'frame-budget';
  let frames = 0;
  let bombCountChanges = 0;
  const started = Date.now();
  try {
    for (let index = 1; index <= protocol.frameBudget; index++) {
      const bombs = game.players.reduce((sum, player) => sum + player.bombs, 0);
      const novaBefore = game.texts.reduce((sum, message) => sum + (message.text === 'NOVA BOMB' ? 1 : 0), 0);
      game.update(1 / 60);
      frames = harness.frame;
      if (game.players.reduce((sum, player) => sum + player.bombs, 0) !== bombs) bombCountChanges += 1;
      const novaAfter = game.texts.reduce((sum, message) => sum + (message.text === 'NOVA BOMB' ? 1 : 0), 0);
      for (const recovery of recoveries) {
        if (recovery.recoveredFrame !== null) continue;
        const player = game.players[recovery.player];
        if (player && player.level > recovery.level) recovery.recoveredFrame = harness.frame;
      }
      noteStage();
      const stage3Defeated = harness.instances.some(inst => inst.stageAtSpawn === 3 && inst.reason === 'defeated');
      if (bombButton > 0 || novaAfter > novaBefore) { stopReason = 'bomb-button'; break; }
      if (game.state === 'gameover' && !stage3Defeated) { stopReason = 'gameover'; break; }
      if (stage3Defeated) { stopReason = 'stage3-boss-defeated'; break; }
    }
    const openReason = stopReason === 'gameover' ? 'gameover' : stopReason === 'frame-budget' ? 'frame-budget' : 'run-stopped';
    harness.finishOpen(openReason);
    const bosses = harness.instances.map(harness.view);
    const stage3 = harness.stageReport(3);
    return {
      seed, mode, route: 'campaign', gameRandomSeed, god: false, bombButton, bombCountChanges,
      stopReason, timeout: stopReason === 'frame-budget', frames, budget: protocol.frameBudget,
      endLives: game.players.reduce((sum, player) => sum + Math.max(0, player.lives), 0),
      endStage: game.stage, endState: game.state, endCrew: crew(game),
      stagesReached: Object.keys(stages).map(Number),
      stages,
      downgrades,
      recoveries,
      bosses,
      stage3Boss: stage3,
      legacyFirstBossAggregate: harness.legacyFirstBossAggregate(),
      elapsedMs: Date.now() - started,
      error: null
    };
  } catch (error) {
    return { seed, mode, route: 'campaign', gameRandomSeed, stopReason: 'exception', timeout: false, error: String(error && error.stack || error), elapsedMs: Date.now() - started };
  }
}

function main() {
  const root = path.resolve(process.argv[2]);
  const outFile = path.resolve(process.argv[3]);
  const label = process.argv[4] || path.basename(root);
  const controllerPath = path.resolve(process.argv[5]);
  const protocolPath = path.resolve(process.argv[6]);
  const protocol = JSON.parse(fs.readFileSync(protocolPath, 'utf8'));
  const controllerHash = sha256(controllerPath);
  const attributionHash = sha256(path.join(__dirname, 'boss-attribution.cjs'));
  const campaignHash = sha256(__filename);
  if (protocol.id !== 'campaign-stage3-v1-attribution' || protocol.frameBudget !== 63792 || protocol.god !== false || protocol.seeds.join(',') !== '1009,8928,16847,24766') {
    throw new Error('protocol constants do not match the frozen campaign');
  }
  if (controllerHash !== CONTROLLER_SHA256 || controllerHash !== protocol.controllerSha256) throw new Error('controller hash mismatch');
  if (attributionHash !== protocol.harness.attributionSha256 || campaignHash !== protocol.harness.campaignSha256) throw new Error('harness hash mismatch');
  const controllerSource = fs.readFileSync(controllerPath, 'utf8');
  const results = [];
  for (const mode of protocol.modes) {
    for (const seed of protocol.seeds) {
      const row = runCampaign(root, controllerSource, protocol, seed, mode);
      results.push(row);
      const stage3 = row.stage3Boss ? row.stage3Boss.status : 'error';
      console.error([label, 'mode', mode, 'seed', seed, row.stopReason, 'frames', row.frames, 'stage', row.endStage, 'lives', row.endLives, 'boss3', stage3, 'ms', row.elapsedMs].join(' '));
    }
  }
  fs.writeFileSync(outFile, JSON.stringify({
    label, root, protocolId: protocol.id, controllerSha256: controllerHash,
    harness: protocol.harness, acceptance: false, results
  }, null, 2));
  console.log(outFile);
}

if (require.main === module) main();
module.exports = { runCampaign, CONTROLLER_SHA256 };
