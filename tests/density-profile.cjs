// 离线、固定火力压力测试：不射击/拾取/炸弹，避免击杀与升级混淆弹幕密度。
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// HEAD: git archive HEAD | tar -x -C /tmp/neon-head; NV_DENSITY_ROOT=/tmp/neon-head node tests/density-profile.cjs --head --baseline
// Current: node tests/density-profile.cjs [--save] [--quick (3 seeds)]
const head = process.argv.includes('--head');
if (head && !process.env.NV_DENSITY_ROOT) throw new Error('--head requires NV_DENSITY_ROOT pointing to a clean HEAD export');
const root = path.resolve(process.env.NV_DENSITY_ROOT || path.join(__dirname, '..'));
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const modules = [...read('index.html').matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);
const sources = modules.map(m=>[m,read(m)]);
const seeds = Array.from({length:process.argv.includes('--quick')?3:12},(_,i)=>1009+i*7919);
function measure(stage, profile, seed) {
  const ctx = vm.createContext({URLSearchParams, location:{search:''},navigator:{getGamepads:()=>[]},document:{getElementById:()=>({getContext:()=>new Proxy({},{get:(t,k)=>t[k]??(()=>{})})})},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){},addEventListener(){}});
  ctx.window=ctx;
  let state=seed;
  ctx.nextRandom=()=>((state=(state*1664525+1013904223)>>>0)/2**32);
  vm.runInContext('Math.random=()=>nextRandom()',ctx);
  for(const [name,source] of sources) vm.runInContext(source,ctx,{filename:name});
  const nv=ctx.NV,g=nv.game;
  g.start(1);nv.beginStage(g,stage);g.state='playing';g.god=true;
  const power=profile==='S3'?.65:0;
  Object.assign(g.players[0],{weapon:profile==='S3'?'S':'N',level:profile==='S3'?3:1});
  nv.updateDifficulty=()=>{g.difficultyPower=power;};
  nv.updatePickups=()=>{g.pickups=[];};
  nv.input.controls=()=>({x:0,y:0,fire:false,bomb:false});
  // 普通段严格覆盖 duration；Boss 单独从干净战场开始，避免提前出现污染分段。
  const spawn=nv.spawnBoss;nv.spawnBoss=()=>{};
  const sums=[0,0,0,0],frames=[0,0,0,0];
  function sample(bucket) {sums[bucket]+=g.bullets.filter(b=>!b.dead&&!(b.delay>0)&&b.x>=0&&b.x<=480&&b.y>=0&&b.y<=800).length;frames[bucket]++;}
  const duration=nv.DIFFICULTY.stages[stage-1].duration;
  for(let i=0;i<duration*60;i++){g.update(1/60);sample(Math.min(2,Math.floor(i/(duration*60)*3)));}
  g.enemies=[];g.bullets=[];nv.spawnBoss=spawn;spawn(g);g.boss.y=170;
  for(let i=0;i<1800;i++){g.boss.hp=g.boss.maxHp*[1,.5,.2][Math.floor(i/600)];g.update(1/60);sample(3);}
  return sums.map((s,i)=>s/frames[i]);
}
const sourceHash = require('node:crypto').createHash('sha256').update(JSON.stringify(sources)).digest('hex');
const out={sourceHash,method:'fixed seeds (see seeds array); 60Hz; god; stationary (240,690); no fire/pickup/bomb; fixed power N1=0 / S3=.65; visible bullets in 480x800, delayed excluded; thirds of duration; clean Boss phase 1/2/3 each 10s, skills carry over',source:head?'HEAD':'working tree',seeds,profiles:{}};
for(const profile of ['N1','S3']) out.profiles[profile]=Array.from({length:8},(_,i)=>{
  const values=seeds.map(seed=>measure(i+1,profile,seed));
  return {stage:i+1,...Object.fromEntries(['early','middle','late','boss'].map((key,j)=>[key,+(values.reduce((s,v)=>s+v[j],0)/seeds.length).toFixed(2)]))};
});
if(process.argv.includes('--baseline')) fs.writeFileSync(path.join(__dirname,'density-baseline.json'),JSON.stringify(out,null,2)+'\n');
if(process.argv.includes('--save')) fs.writeFileSync(path.join(__dirname,'density-current.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
