// 游戏状态机、调试入口、自动化接口与固定步长主循环。
'use strict';

(() => {
  const params = new URLSearchParams(location.search);
  const debug = params.get('debug') === '1';
  let savedHighScore = 0;
  try {
    savedHighScore = Number(localStorage.getItem('neon-vector-high')) || 0;
  } catch (storageError) {}
  const game = NV.game = {
    ctx: document.getElementById('game').getContext('2d'),
    state: 'menu',
    stage: 1,
    mode: 1,
    menu: 0,
    clock: 0,
    stateTime: 0,
    theme: NV.themes[0],
    debug,
    god: debug && params.get('god') === '1',
    players: [],
    enemies: [],
    boss: null,
    pickups: [],
    shots: [],
    bullets: [],
    particles: [],
    texts: [],
    flash: 0,
    highScore: savedHighScore,
    stars: Array.from({
      length: 95
    }, () => ({
      x: NV.rand(0, 480),
      y: NV.rand(0, 800),
      speed: NV.rand(12, 70),
      size: NV.rand(1, 2),
      alpha: NV.rand(.2, .8)
    })),
    /* 增加玩家分数，并尝试持久化最高总分。 */
    award(id, count) {
      let player = this.players[id] || this.players[0];
      if (player) {
        player.score += count;
      }
      let total = this.players.reduce((totalScore, player) => totalScore + player.score, 0);
      if (total > this.highScore) {
        this.highScore = total;
        try {
          localStorage.setItem('neon-vector-high', String(total));
        } catch (storageError) {}
      }
    },
    /* 创建一组短生命周期的爆炸粒子。 */
    spark(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        let life = NV.rand(.25, .8);
        this.particles.push({
          x,
          y,
          vx: NV.rand(-160, 160),
          vy: NV.rand(-160, 160),
          life,
          max: life,
          col: color,
          size: NV.rand(1, 4)
        });
      }
    },
    /* 添加会向上漂移的提示文字。 */
    toast(x, y, text, color) {
      this.texts.push({
        x,
        y,
        text,
        col: color,
        life: 1.6
      });
    },
    /* 进入结算状态并更新最高分。 */
    finish(state) {
      this.state = state;
      this.stateTime = 0;
      this.award(0, 0);
    },
    /* 创建单人或双人队伍并开始关卡。 */
    start(mode) {
      this.mode = mode;
      this.players = Array.from({
        length: mode
      }, (_, i) => NV.makePlayer(i, mode));
      this.particles = [];
      this.texts = [];
      this.flash = 0;
      NV.beginStage(this, debug ? NV.clamp(parseInt(params.get('stage'), 10) || 1, 1, 3) : 1);
    },
    /* 按固定时间步长处理输入、状态转换与战场更新。 */
    update(deltaTime) {
      this.clock += deltaTime;
      NV.input.poll();
      const input = NV.input;
      if (this.state === 'menu') {
        if (input.tap('ArrowUp') || input.tap('KeyW') || input.tap('ArrowDown') || input.tap('KeyS')) {
          this.menu = 1 - this.menu;
        }
        if (input.tap('Digit1') || input.tap('Digit2')) {
          this.start(input.tap('Digit2') ? 2 : 1);
        } else if (input.tap('Enter') || input.tap('Space') || input.tap('pad0b9')) {
          this.start(this.menu + 1);
        }
        input.end();
        return;
      }
      if (input.tap('KeyP') || input.tap('Escape') || input.tap('pad0b9') || input.tap('pad1b9')) {
        if (this.state === 'paused') {
          this.state = this.resumeState || 'playing';
        } else if (['playing', 'intro', 'clear'].includes(this.state)) {
          this.resumeState = this.state;
          this.state = 'paused';
        }
      }
      if (['gameover', 'victory'].includes(this.state)) {
        if (input.tap('Enter') || input.tap('KeyR')) {
          this.state = 'menu';
          this.players = [];
          this.bullets = [];
          this.shots = [];
          this.pickups = [];
          this.enemies = [];
          this.boss = null;
        }
        input.end();
        return;
      }
      if (this.state === 'paused') {
        input.end();
        return;
      }
      if (debug) {
        if (input.tap('KeyI')) {
          this.god = !this.god;
        }
        if (input.tap('KeyN')) {
          NV.beginStage(this, this.stage + 1);
        }
        if (input.tap('KeyB')) {
          this.state = 'playing';
          NV.spawnBoss(this);
        }
        if (input.tap('KeyK') && this.boss) {
          this.boss.hp -= 1200;
          this.boss.lastHit = 0;
        }
        if (input.tap('KeyU')) {
          for (let player of this.players.filter(player => player.lives > 0)) {
            ['N', 'S', 'L', 'M', 'H', 'V', 'B', 'F'].forEach((type, i) => NV.drop(
              this,
              NV.clamp(player.x + (i % 4 - 1.5) * 33, 18, 462),
              player.y - 90 - Math.floor(i / 4) * 40,
              type
            ));
          }
        }
      }
      this.stateTime += deltaTime;
      this.flash = Math.max(0, this.flash - deltaTime * 1.7);
      for (let particle of this.particles) {
        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;
        particle.life -= deltaTime;
      }
      this.particles = this.particles.filter(effect => effect.life > 0);
      for (let message of this.texts) {
        message.life -= deltaTime;
        message.y -= 22 * deltaTime;
      }
      this.texts = this.texts.filter(effect => effect.life > 0);
      if (this.state === 'intro') {
        if (this.stateTime > 2.2) {
          this.state = 'playing';
          this.stateTime = 0;
        }
      } else if (this.state === 'clear') {
        NV.updatePickups(this, deltaTime);
        NV.updatePlayers(this, deltaTime);
        if (this.state === 'clear' && this.stateTime > 3.8) {
          NV.beginStage(this, this.stage + 1);
        }
      } else if (this.state === 'playing') {
        NV.updateStage(this, deltaTime);
        NV.updateShots(this, deltaTime);
        NV.updateEnemies(this, deltaTime);
        NV.updateBoss(this, deltaTime);
        for (let bullet of this.bullets) {
          bullet.x += bullet.vx * deltaTime;
          bullet.y += bullet.vy * deltaTime;
        }
        this.bullets = this.bullets.filter(bullet => bullet.y > -40 && bullet.y < 840 && bullet.x > -40 && bullet.x < 520);
        NV.updatePlayers(this, deltaTime);
        NV.updatePickups(this, deltaTime);
      }
      input.end();
    }
  };
  // A read-only state facade keeps automation from depending on rendering internals.
  window.__game = {
    /* 返回独立且冻结的状态副本，避免测试修改游戏数据。 */
  snapshot() {
      return Object.freeze({
        state: game.state,
        stage: game.stage,
        mode: game.mode,
        bossActive: !!game.boss,
        bossHp: game.boss ? game.boss.hp : 0,
        enemies: game.enemies.length,
        pickups: game.pickups.length,
        players: Object.freeze(game.players.map(player => Object.freeze({
          weapon: player.weapon,
          level: player.level,
          lives: player.lives,
          bombs: player.bombs,
          score: player.score,
          shield: player.shield
        })))
      });
    },
    get state() {
      return game.state;
    },
    get stage() {
      return game.stage;
    },
    get players() {
      return game.players;
    },
    get enemies() {
      return game.enemies.length;
    },
    get pickups() {
      return game.pickups.length;
    },
    get boss() {
      return !!game.boss;
    },
    get god() {
      return game.god;
    },
    get mode() {
      return game.mode;
    }
  };
  NV.input.init();
  if (debug && params.get('mode') === '2') {
    game.start(2);
  } else if (debug && (params.has('stage') || params.get('mode') === '1')) {
    game.start(1);
  }
  let previous = null;
  let accumulator = 0;
  /* 以 60Hz 固定步长模拟，并请求下一帧绘制。 */
  function frame(now) {
    if (previous === null) {
      previous = now;
    }
    accumulator += Math.min(.1, (now - previous) / 1000);
    previous = now;
    let count = 0;
    while (accumulator >= 1 / 60 && count++ < 6) {
      game.update(1 / 60);
      accumulator -= 1 / 60;
    }
    NV.render(game);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
