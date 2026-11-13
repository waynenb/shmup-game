// 道具生成、吸附、拾取与奖励。
'use strict';

NV.pickupColors = {
  N: '#70ddff',
  S: '#ffca64',
  L: '#82ffae',
  M: '#ef92ff',
  H: '#7af5ff',
  V: '#ff6f98',
  B: '#ffad58',
  F: '#fff08a'
};
/* 生成指定类型或随机类型的道具。 */
NV.drop = function (game, x, y, type) {
  let types = ['N', 'S', 'L', 'M', 'H', 'V', 'B', 'F'];
  game.pickups.push({
    x,
    y,
    type: type || types[Math.floor(Math.random() * types.length)],
    t: 0
  });
};
/* 将附近道具吸向存活玩家，并应用拾取效果。 */
NV.updatePickups = function (game, deltaTime) {
  for (let pickup of game.pickups) {
    pickup.t += deltaTime;
    pickup.y += 40 * deltaTime;
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
    if (distance < 110 && distance > 0) {
      pickup.x += (player.x - pickup.x) / distance * 210 * deltaTime;
      pickup.y += (player.y - pickup.y) / distance * 210 * deltaTime;
    }
    if (distance < 25) {
      let label;
      if ('NSLM'.includes(pickup.type)) {
        if (player.weapon === pickup.type) {
          if (player.level === 3) {
            game.award(player.id, 500);
            label = 'MAX +500';
          } else {
            player.level++;
            player.levels[pickup.type] = player.level;
          }
        } else {
          player.weapon = pickup.type;
          player.level = player.levels[pickup.type] || 1;
        }
        label = label || pickup.type + ' WEAPON LV.' + player.level;
      } else if (pickup.type === 'H') {
        player.shield = 12;
        label = 'SHIELD 12s';
      } else if (pickup.type === 'V') {
        player.lives++;
        label = 'LIFE +1';
      } else if (pickup.type === 'B') {
        player.bombs++;
        label = 'BOMB +1';
      } else {
        game.award(player.id, 1000);
        label = 'SCORE +1000';
      }
      game.toast(player.x, player.y - 35, label, NV.pickupColors[pickup.type]);
      pickup.dead = true;
    }
  }
  game.pickups = game.pickups.filter(pickup => !pickup.dead && pickup.y < 830);
};
