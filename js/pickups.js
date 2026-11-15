// 道具生成、吸附、拾取与奖励。
'use strict';

NV.pickupColors = {
  N: '#70ddff',
  S: '#ffca64',
  L: '#82ffae',
  M: '#ef92ff',
  P: '#ff784f',
  H: '#7af5ff',
  V: '#ff6f98',
  B: '#ffad58',
  F: '#fff08a'
};
/* 生成指定类型或随机类型的道具。 */
NV.drop = function (game, x, y, type) {
  const types = NV.DIFFICULTY.pickup.types;
  const first = game.stage === 1 && !game.firstDrop && !type;
  if (first) { type = 'P'; game.firstDrop = true; }
  game.pickups.push({
    x,
    y,
    type: type || types[Math.floor(Math.random() * types.length)],
    first,
    t: 0
  });
};
/* 将附近道具吸向存活玩家，并应用拾取效果。 */
NV.updatePickups = function (game, deltaTime) {
  const c = NV.DIFFICULTY.pickup;
  for (let pickup of game.pickups) {
    pickup.t += deltaTime;
    pickup.y += c.speed * deltaTime;
    let player = game.players
      .filter(player => player.lives > 0)
      .sort((player, otherPlayer) =>
        Math.hypot(player.x - pickup.x, player.y - pickup.y) -
        Math.hypot(otherPlayer.x - pickup.x, otherPlayer.y - pickup.y)
      )[0];
    if (!player) {
      continue;
    }
    let distance = Math.hypot(player.x - pickup.x, player.y - pickup.y);
    if (distance < (pickup.first ? c.firstMagnetRadius : c.magnetRadius) && distance > 0) {
      pickup.x += (player.x - pickup.x) / distance * c.magnetSpeed * deltaTime;
      pickup.y += (player.y - pickup.y) / distance * c.magnetSpeed * deltaTime;
    }
    if (distance < c.collectRadius) {
      let label;
      if ('NSLM'.includes(pickup.type)) {
        if (player.weapon === pickup.type) {
          game.award(player.id, c.keepBonus);
          label = pickup.type + ' KEEP +' + c.keepBonus;
        } else {
          player.weapon = pickup.type;
          label = pickup.type + ' WEAPON';
        }
      } else if (pickup.type === 'P') {
        if (player.level < 3) {
          player.level++;
          label = 'POWER LV.' + player.level;
        } else {
          game.award(player.id, c.maxBonus);
          label = 'POWER MAX +' + c.maxBonus;
        }
      } else if (pickup.type === 'H') {
        player.shield = c.shield;
        label = 'SHIELD 12s';
      } else if (pickup.type === 'V') {
        if (player.lives < NV.DIFFICULTY.player.maxLives) {
          player.lives++;
          label = 'LIFE +1';
        } else {
          game.award(player.id, c.maxBonus);
          label = 'LIFE MAX +500';
        }
      } else if (pickup.type === 'B') {
        if (player.bombs < NV.DIFFICULTY.player.maxBombs) {
          player.bombs++;
          label = 'BOMB +1';
        } else {
          game.award(player.id, c.maxBonus);
          label = 'BOMB MAX +500';
        }
      } else {
        game.award(player.id, c.score);
        label = 'SCORE +1000';
      }
      game.toast(player.x, player.y - 35, label, NV.pickupColors[pickup.type]);
      pickup.dead = true;
    }
  }
  game.pickups = game.pickups.filter(pickup => !pickup.dead && pickup.y < 830);
};
