// 旗舰技能：预警 → 施放 → 休息；弹幕全部复用普通敌弹受击逻辑。
'use strict';
NV.spawnBoss = function (game) {
  if (game.boss) return;
  game.enemies = [];
  const hp = NV.difficulty(game).bossHp;
  game.boss = {x:240,y:-90,r:53,hp,maxHp:hp,t:0,fire:1,lastHit:0,phase:1,
    skill:null,skillsUsed:{},cursor:0,targetCursor:{},warning:null,active:null,targets:[]};
  game.toast(240,310,'WARNING / 旗舰接近','#ff647e');
};
// 转向只追踪施放时选中的存活玩家，死亡后不重新锁定。
NV.updateBossBullet = function (game, b, dt) {
  if (!b.homing) return;
  b.life -= dt;
  if (b.life <= 0) { b.dead = true; return; }
  const p = game.players.find(p => p.id === b.target && p.lives > 0);
  if (!p) return;
  let angle = Math.atan2(b.vy,b.vx);
  const desired = Math.atan2(p.y-b.y,p.x-b.x);
  const difference = Math.atan2(Math.sin(desired-angle),Math.cos(desired-angle));
  angle += NV.clamp(difference,-b.turn*dt,b.turn*dt);
  b.vx = Math.cos(angle)*b.speed; b.vy = Math.sin(angle)*b.speed;
};
NV.updateBoss = function (game, dt) {
  const b = game.boss;
  if (!b) return;
  const motion = NV.DIFFICULTY.bossMotion, c = NV.DIFFICULTY.skillTiers[game.stage-1], s = NV.DIFFICULTY.skill;
  if (b.hp <= 0) {
    game.award(b.lastHit,motion.reward*game.stage);
    game.spark(b.x,b.y,game.theme.accent,90);
    ['P','L','P','H','B','F'].forEach((type,i) => NV.drop(game,135+i*42,190+i%2*30,type));
    b.warning = b.active = null;
    game.enemies = game.enemies.filter(e => !e.summoned);
    game.boss = null; game.bullets = []; game.state = 'clear'; game.stateTime = 0; game.flash = .5;
    return;
  }
  b.t += dt;
  b.phase = b.hp/b.maxHp < motion.thresholds[1] ? 3 : b.hp/b.maxHp < motion.thresholds[0] ? 2 : 1;
  const homeX = 240+Math.sin(b.t*(motion.frequency+game.stage*motion.stageFrequency))*(motion.amplitude+game.stage*motion.stageAmplitude);
  if (!b.active || b.skill !== 'charge') {
    b.x = homeX; b.y = Math.min(170,b.y+motion.entry*dt);
  }
  const alive = game.players.filter(p => p.lives > 0);
  if (!alive.length) { b.warning = b.active = null; return; }
  const shot = (x,y,a,speed=c.speed,r=4,col='#ff657f') => NV.enemyBullet(game,x,y,a,speed,r,col);
  function pulse(a) {
    if (b.skill === 'laser') {
      shot(a.x,a.y,Math.PI/2,s.laserSpeed,s.laserRadius,'#ff77df');
      game.bullets[game.bullets.length-1].laser = true;
    } else if (b.skill === 'spiral') {
      shot(b.x,b.y+25,Math.PI/2+Math.sin(a.index*.65)*1.2,c.speed,4,'#c18aff');
    }
    a.index++;
  }
  if (b.active) {
    const a = b.active;
    a.elapsed += dt;
    if (b.skill === 'charge') {
      const t = Math.min(1,a.elapsed/s.chargeDuration);
      const f = Math.sin(Math.PI*t);
      b.x = a.startX+(a.x-a.startX)*f; b.y = 170+(s.chargeY-170)*f;
    } else {
      a.next -= dt;
      while (a.next <= 0 && a.index < a.count) { pulse(a); a.next += a.interval; }
    }
    if (a.elapsed >= a.duration) { b.active = null; b.fire = c.rest; }
    return;
  }
  if (b.warning) {
    b.warning.left -= dt;
    if (b.warning.left > 0) return;
    const w = b.warning; b.warning = null;
    // 被瞄准玩家在预警期间死亡则取消本次技能。
    if (w.target !== null && !alive.some(p => p.id === w.target)) { b.fire = c.rest; return; }
    b.skillsUsed[b.skill] = (b.skillsUsed[b.skill] || 0)+1;
    const d = NV.difficulty(game);
    if (b.skill === 'fan' || b.skill === 'sway') {
      for (const side of b.skill === 'sway' ? [-1,1] : [0])
        for (let i=0;i<d.bossVolley;i++) shot(b.x+side*38,b.y+30,Math.PI/2+(i-(d.bossVolley-1)/2)*motion.fanSpread+(side ? Math.sin(b.t)*motion.sway : 0));
    } else if (b.skill === 'ring') {
      for (let i=0;i<c.ring;i++) shot(b.x,b.y,Math.PI*2*i/c.ring+b.t*motion.rotation,c.speed,4,'#c18aff');
    } else if (b.skill === 'wall') {
      for (let x=12;x<480;x+=c.spacing) if (Math.abs(x-w.x)>=c.gap/2+4) shot(x,130,Math.PI/2);
    } else if (b.skill === 'homing') {
      for (let i=0;i<s.homingCount;i++) {
        shot(b.x+(i-.5)*30,b.y+30,Math.PI/2,s.homingSpeed,6,'#ffbb64');
        Object.assign(game.bullets[game.bullets.length-1],{homing:true,target:w.target,life:s.homingLife,turn:s.homingTurn,speed:s.homingSpeed});
      }
    } else if (b.skill === 'summon') {
      const count = Math.min(s.summonCount,s.summonCap-game.enemies.filter(e=>e.summoned).length);
      for (let i=0;i<count;i++) { NV.spawnEnemy(game,0,120+i*240); game.enemies[game.enemies.length-1].summoned = true; }
    } else {
      const laser = b.skill === 'laser', charge = b.skill === 'charge';
      b.active = {x:w.x,y:w.y,startX:b.x,elapsed:0,next:0,index:0,
        interval:laser?s.laserPulse:c.pulse,count:laser?Math.ceil(s.laserDuration/s.laserPulse):c.spiral,
        duration:charge?s.chargeDuration:laser?s.laserDuration:c.spiral*c.pulse};
    }
    b.fire = c.rest;
    return;
  }
  b.fire -= dt;
  if (b.fire > 0 || b.y < 100) return;
  const skills = NV.DIFFICULTY.bossSkills[game.stage-1].filter(k=>k.phase<=b.phase);
  b.skill = skills[b.cursor++ % skills.length].name;
  const aimed = ['laser','homing','charge'].includes(b.skill);
  const target = aimed ? alive[(b.targetCursor[b.skill] || 0) % alive.length] : null;
  if (aimed) b.targetCursor[b.skill] = (b.targetCursor[b.skill] || 0)+1;
  const x = target ? target.x : 240+Math.sin(b.t)*100;
  b.warning = {left:c.warning,x,y:130,target:target?target.id:null,gap:c.gap};
  if (target) b.targets.push({skill:b.skill,id:target.id});
  game.toast(240,260,'WARNING / '+b.skill.toUpperCase(),'#ffbb64');
};
