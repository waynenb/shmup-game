// 离线合成音频。所有 Web Audio 操作都允许失败，游戏不等待音频。
'use strict';
(() => {
  const safe = fn => { try { return fn(); } catch (error) {} };
  let ctx, master, layer, current = '', next = 0, step = 0;
  let muted = safe(() => localStorage.getItem('neon-vector-muted')) === 'true';
  const shots = new Map();
  NV.AUDIO = {
    tracks: [
      { name: 'harbor', root: 57, notes: [0, 7, 12, 10, 7, 3, 5, 7] },
      { name: 'rift', root: 55, notes: [0, 3, 7, 10, 12, 7, 5, 3] },
      { name: 'corona', root: 60, notes: [0, 5, 7, 12, 10, 7, 2, 5] }
    ]
  };
  function tone(bus, time, frequency, duration, volume, type = 'sine', end = frequency, cutoff = 1400) {
    const oscillator = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(end, time + duration);
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(cutoff, time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(filter); filter.connect(gain); gain.connect(bus);
    oscillator.onended = () => safe(() => { oscillator.disconnect(); filter.disconnect(); gain.disconnect(); });
    oscillator.start(time); oscillator.stop(time + duration + .02);
  }
  function select(game) {
    const data = NV.AUDIO.tracks[((game?.stage || 1) - 1) % NV.AUDIO.tracks.length];
    const menu = !game || ['menu', 'gameover', 'victory'].includes(game.state);
    const boss = !menu && !!game.boss;
    return { data, name: menu ? 'menu' : (boss ? 'boss-' : 'stage-') + data.name,
      beat: menu ? .48 : boss ? .21 : .34, root: menu ? 57 : data.root,
      notes: menu ? [0, 4, 7, 11, 7, 4, 2, 7] : boss ? [0, 12, 7, 3, 0, 10, 7, 5] : data.notes };
  }
  function update(game) {
    safe(() => {
      const track = select(game), changed = current !== track.name;
      current = track.name;
      if (!ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (changed || !layer) {
        if (layer) {
          const old = layer;
          old.gain.cancelScheduledValues(now);
          old.gain.setTargetAtTime(0, now, .10);
          // 已排音符最长 .7 秒；稍后释放旧总线。
          if (typeof setTimeout === 'function') setTimeout(() => safe(() => old.disconnect()), 1500);
        }
        layer = ctx.createGain(); layer.gain.setValueAtTime(0, now);
        layer.gain.linearRampToValueAtTime(1, now + .4); layer.connect(master);
        next = now + .02; step = 0;
      }
      if (next < now) next = now + .02; // 标签页恢复时不补排历史音符。
      while (next < now + .15) {
        const note = track.notes[step % track.notes.length];
        const hz = 440 * 2 ** ((track.root + note - 69) / 12);
        tone(layer, next, hz, .65, .045, 'triangle');
        if (step % 4 === 0) tone(layer, next, hz / 4, .7, .035);
        next += track.beat; step++;
      }
    });
  }
  function unlock() {
    safe(() => {
      if (!ctx) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        const candidate = new Audio();
        try {
          const bus = candidate.createGain(), compressor = candidate.createDynamicsCompressor();
          bus.gain.setValueAtTime(muted ? 0 : .65, candidate.currentTime);
          compressor.threshold.setValueAtTime(-18, candidate.currentTime);
          compressor.ratio.setValueAtTime(8, candidate.currentTime);
          bus.connect(compressor); compressor.connect(candidate.destination);
          ctx = candidate; master = bus;
        } catch (error) { safe(() => candidate.close()?.catch(() => {})); return; }
        if (typeof setInterval === 'function') setInterval(() => update(NV.game), 25);
      }
      if (ctx.state === 'suspended') {
        const pending = ctx.resume();
        if (pending?.then) pending.then(() => update(NV.game)).catch(() => {});
      }
      update(NV.game);
    });
  }
  function toggle() {
    muted = !muted;
    safe(() => localStorage.setItem('neon-vector-muted', String(muted)));
    safe(() => master.gain.setTargetAtTime(muted ? 0 : .65, ctx.currentTime, .04));
  }
  NV.sound = Object.freeze({
    unlock, toggle, update,
    shoot(player) {
      safe(() => {
        if (!ctx || muted || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        if (now - (shots.get(player.id) ?? -Infinity) < .08) return;
        shots.set(player.id, now);
        const voices = { N: [720, 320, 'sine'], S: [420, 160, 'triangle'], L: [1200, 600, 'sine'], M: [230, 70, 'triangle'] };
        const [start, end, type] = voices[player.weapon] || voices.N;
        tone(master, now, start, .065, .045, type, end, 1800);
      });
    },
    bomb() {
      safe(() => {
        if (!ctx || muted || ctx.state !== 'running') return;
        const now = ctx.currentTime, duration = .8;
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
        source.buffer = buffer; filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now); filter.frequency.exponentialRampToValueAtTime(65, now + duration);
        gain.gain.setValueAtTime(.16, now); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
        source.connect(filter); filter.connect(gain); gain.connect(master);
        source.onended = () => safe(() => { source.disconnect(); filter.disconnect(); gain.disconnect(); });
        source.start(now); source.stop(now + duration);
        tone(master, now, 95, .7, .18, 'sine', 28, 250);
      });
    }
  });
  Object.defineProperty(NV, 'audio', { value: Object.freeze({
    loaded: true, get muted() { return muted; }, get ready() { return !!ctx; }, get track() { return current || 'menu'; }
  }), writable: false });
})();
