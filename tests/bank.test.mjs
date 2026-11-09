import { createServer } from 'vite';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
globalThis.ProgressEvent=class ProgressEvent {constructor(type,init={}){this.type=type;Object.assign(this,init);}};
async function readAsset(name){const path=`assets/bank_interior/${name}/`,data=JSON.parse(await readFile(path+'scene.gltf','utf8')),bin=await readFile(path+'scene.bin');data.buffers[0].uri=`data:application/octet-stream;base64,${bin.toString('base64')}`;delete data.images;delete data.textures;for(const m of data.materials??[]){delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;if(m.pbrMetallicRoughness){delete m.pbrMetallicRoughness.baseColorTexture;delete m.pbrMetallicRoughness.metallicRoughnessTexture;}}const src=(await new GLTFLoader().parseAsync(JSON.stringify(data),'')).scene;src.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(src),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());src.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));const group=new THREE.Group();group.add(src);const height=name==='atm'?1.7:2.4,width=name==='atm'?1.15:2.4;group.scale.setScalar(Math.min(height/Math.max(.01,size.y),width/Math.max(.01,size.x,size.z)));return group;}
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},ssr:{noExternal:['@dimforge/rapier3d-compat']}});
try {
 const RAPIER=await vite.ssrLoadModule('/node_modules/@dimforge/rapier3d-compat/rapier.es.js');await RAPIER.init();
 const {BankInterior,makeBankState}=await vite.ssrLoadModule('/src/bankInterior.ts');
 const {Abilities}=await vite.ssrLoadModule('/src/upgrades.ts');
 function model(w,h,d){const group=new THREE.Group();const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial());mesh.position.y=h/2;group.add(mesh);return group;}
 const assets={atm:await readAsset('atm'),safe:await readAsset('bank_safe'),furniture:[model(1,1,1),model(1.2,1,1)],floors:[new THREE.Texture()],walls:[new THREE.Texture()]};
 const cop=()=>{const root=model(.5,1.5,.4);return {root,update(x,z){root.position.set(x,0,z);},dispose(){}};};
 const failures=[];
 for(let seed=0;seed<50;seed++){
  const state=makeBankState(),bank=new BankInterior(assets,seed*17-120,seed*11-31,new Abilities(),cop,state);
  if(seed===0){const saved=bank.sightObstacles.splice(0);bank.sightObstacles.push({x:0,z:0,halfX:.1,halfZ:2});const start=new THREE.Vector3(-2,1,0),end=new THREE.Vector3(2,0,0),impact=bank.projectileImpact(start,end);if(!impact||Math.abs(impact.x+.1)>.001||bank.lineOfSight(start,end))failures.push('projectile passed through wall');if(bank.projectileImpact(new THREE.Vector3(-2,1,3),new THREE.Vector3(2,0,3)))failures.push('projectile blocked without obstacle');bank.sightObstacles.splice(0,1,...saved);}
  if(bank.terminals.length<4||bank.terminals.length>6)failures.push(`seed ${seed}: ${bank.terminals.length-1} ATMs`);
  if(bank.guards.some(g=>!Number.isFinite(bank.cost(g.x,g.z))))failures.push(`seed ${seed}: guard inside obstacle`);
  if(bank.guards.length<8)failures.push(`seed ${seed}: too few guards`);
  if(bank.coverObjects.length<4)failures.push(`seed ${seed}: insufficient cover`);
  const queue=[{x:0,z:Math.round(bank.depth/2-1.5)}],seen=new Set(queue.map(p=>`${p.x},${p.z}`));
  for(let i=0;i<queue.length;i++){const p=queue[i];for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+dx,z=p.z+dz,k=`${x},${z}`;if(!seen.has(k)&&Number.isFinite(bank.cost(x,z))){seen.add(k);queue.push({x,z});}}}
  for(const t of bank.terminals){const reachable=queue.some(p=>Math.hypot(p.x-t.x,p.z-t.z)<2.2);if(!reachable)failures.push(`seed ${seed}: ${t.id} inaccessible at ${t.x},${t.z}`);}
  if(seed<5){
   const spawn=bank.position,short=queue.find(p=>Math.hypot(p.x-spawn.x,p.z-spawn.z)>1.1),far=queue.reduce((best,p)=>Math.hypot(p.x-spawn.x,p.z-spawn.z)>Math.hypot(best.x-spawn.x,best.z-spawn.z)?p:best,queue[0]);
   const checkRoute=target=>{bank.routeTo(target);const count=bank.route.length-bank.routeIndex+1,geometry=bank.line.geometry,position=geometry.getAttribute('position'),distance=geometry.getAttribute('lineDistance');if(!bank.route.length||geometry.drawRange.count!==count||position.count<count||distance.count<count)failures.push(`seed ${seed}: route buffer is incomplete`);else{const end=bank.route[bank.route.length-1];if(Math.hypot(position.getX(count-1)-end.x,position.getZ(count-1)-end.z)>.001)failures.push(`seed ${seed}: route endpoint missing`);}};
   checkRoute(short);checkRoute(far);if(!bank.destination.visible)failures.push(`seed ${seed}: destination marker missing`);checkRoute(short);bank.stopMoving();if(bank.destination.visible)failures.push(`seed ${seed}: destination marker remained visible`);checkRoute(far);bank.stopMoving();
  }
  if(!bank.exitMarker.visible||!bank.canExit)failures.push(`seed ${seed}: initial exit unavailable`);
  const first=bank.terminals[0],value=bank.complete(first.id);if(value<500||value>1000||bank.complete(first.id)!==0)failures.push(`seed ${seed}: bad ATM reward`);
  if(bank.canExit||bank.guards.some(g=>g.id==='boss'))failures.push(`seed ${seed}: ATM incorrectly unlocked exit or spawned boss`);
  bank.player.setTranslation({x:bank.exit.x,y:1,z:bank.exit.z},true);bank.useExit();if(bank.requestedExit)failures.push(`seed ${seed}: exit opened with officers alive`);
  const vault=bank.terminals.find(t=>t.id==='vault'),v=bank.complete('vault');if(!vault||v<2000||v>5000)failures.push(`seed ${seed}: bad vault reward`);
  const boss=bank.guards.find(g=>g.id==='boss');if(!boss||boss.health!==300||boss.boss.guns.length!==4||boss.visual.root.scale.x!==3)failures.push(`seed ${seed}: boss spawn invalid`);
  if(seed<3){const copy={...state,looted:new Set(state.looted),deadGuards:new Set(state.deadGuards)};const returned=new BankInterior(assets,seed*17-120,seed*11-31,new Abilities(),cop,copy);if(!returned.guards.some(g=>g.id==='boss')||returned.canExit)failures.push(`seed ${seed}: boss missing on reentry`);returned.dispose();}
  if(vault&&bank.lasers.some(l=>{const dx=l.x2-l.x1,dz=l.z2-l.z1,u=Math.max(0,Math.min(1,((vault.x-l.x1)*dx+(vault.z-l.z1)*dz)/(dx*dx+dz*dz)));return Math.hypot(vault.x-(l.x1+dx*u),vault.z-(l.z1+dz*u))<2.7;}))failures.push(`seed ${seed}: laser intersects vault interaction area`);
  bank.frighten(0,0);if(!bank.consumeAlarm()||!state.resetAt)failures.push(`seed ${seed}: no alarm`);
  state.resetAt=Date.now()-1;bank.update(.016);if(!state.looted.size||!state.robberyStarted||bank.canExit)failures.push(`seed ${seed}: active heist reset or unlocked`);
  if(boss&&seed<5){
   for(const guard of bank.guards.filter(g=>g.id!=='boss'))bank.damageTarget(guard.id,1000,1,0,1);
   if(bank.canExit||bank.remainingGuards!==1)failures.push(`seed ${seed}: boss did not lock exit`);
   boss.boss.emerge=0;boss.boss.shieldTime=0;boss.boss.shieldCooldown=.01;bank.setAimedTarget(null);bank.updateGuard(boss,{x:boss.x,z:boss.z+7},.05);
   const before=boss.health;bank.damageTarget('boss',100,1,0,1);if(boss.health!==before||boss.boss.shieldTime<=0)failures.push(`seed ${seed}: boss shield failed`);
   const oldCost=bank.cost,oldSight=bank.guardCanSee;bank.cost=()=>1;bank.guardCanSee=(x)=>x<boss.x;
   boss.boss.shieldTime=0;boss.boss.emerge=0;boss.mode='firing';boss.boss.angle=0;for(const gun of boss.boss.guns)gun.cooldown=0;bank.takeShots();bank.updateBossGear(boss,{x:boss.x,z:boss.z+7},.01);
   const shots=bank.takeShots();if(shots.length!==2||shots.some(shot=>shot.x>=boss.x))failures.push(`seed ${seed}: gun line of sight failed`);
   for(const gun of boss.boss.guns){const origin=gun.mount.getWorldPosition(new THREE.Vector3()),direction=gun.mount.getWorldDirection(new THREE.Vector3()),target=new THREE.Vector3(boss.x,1,boss.z+7).sub(origin).normalize();if(direction.dot(target)<.99)failures.push(`seed ${seed}: orbit gun not aiming at player`);}
   bank.setAimedTarget('boss');boss.boss.dodgeCooldown=0;const x=boss.x,z=boss.z;bank.prepareBoss(boss,{x:boss.x,z:boss.z+7},.05);if(Math.hypot(boss.x-x,boss.z-z)<.01||boss.boss.dodgeCooldown<1.4)failures.push(`seed ${seed}: boss dodge failed`);
   bank.setAimedTarget(null);boss.boss.dodgeTime=0;boss.boss.dashCooldown=2;boss.mode='toCover';boss.route=[{x:boss.x+1,z:boss.z}];boss.routeIndex=0;boss.timer=5;const startX=boss.x;bank.updateGuard(boss,{x:boss.x,z:boss.z+7},.1);if(Math.abs((boss.x-startX)-.429)>.01)failures.push(`seed ${seed}: boss speed not 1.3x`);
   boss.boss.dashCooldown=0;boss.mode='toCover';boss.route=[{x:boss.x+1,z:boss.z}];boss.routeIndex=0;boss.timer=5;bank.updateGuard(boss,{x:boss.x,z:boss.z+7},.05);if(boss.boss.dashCooldown<2.9||boss.boss.dashTime<=0)failures.push(`seed ${seed}: boss dash failed`);
   bank.cost=oldCost;bank.guardCanSee=oldSight;boss.boss.shieldTime=0;bank.damageTarget('boss',300,1,0,1);
   const backup=bank.guards.filter(g=>g.id.startsWith('reinforcement-')&&!g.dead);if(!state.bossDefeated||backup.length!==2||bank.canExit)failures.push(`seed ${seed}: boss reinforcements or exit lock failed`);
   if(seed<3){const copy={...state,looted:new Set(state.looted),deadGuards:new Set(state.deadGuards),resetAt:Date.now()+300000};const returned=new BankInterior(assets,seed*17-120,seed*11-31,new Abilities(),cop,copy);if(returned.guards.some(g=>g.id==='boss')||returned.guards.filter(g=>g.id.startsWith('reinforcement-')).length!==2||returned.canExit)failures.push(`seed ${seed}: reinforcements missing on reentry`);returned.dispose();}
   bank.updateBossCash(.2,{x:boss.x,z:boss.z});if(bank.takeBossCash()!==500||bank.takeBossCash()!==0)failures.push(`seed ${seed}: boss cash failed`);
   for(const guard of backup)bank.damageTarget(guard.id,1000,1,0,1);if(!bank.canExit)failures.push(`seed ${seed}: exit remained locked after victory`);
  }
  state.robberyStarted=false;bank.update(.016);if(state.looted.size||state.resetAt||state.bossSpawned)failures.push(`seed ${seed}: reset failed`);
  const laser=bank.lasers[0];bank.player.setTranslation({x:(laser.x1+laser.x2)/2,y:1,z:(laser.z1+laser.z2)/2},true);bank.elapsed=4-laser.phase;bank.update(.016);if(bank.takeLaserDamage()!==12||!bank.consumeAlarm())failures.push(`seed ${seed}: laser failed`);
  if(seed<10){
   const player=queue.reduce((best,p)=>Math.hypot(p.x,p.z)<Math.hypot(best.x,best.z)?p:best,queue[0]);bank.player.setTranslation({x:player.x,y:1,z:player.z},true);bank.frighten(0,0);
   const initial=new Map(bank.guards.map(g=>[g.id,{x:g.x,z:g.z}]));const hidden=new Set(),shooters=new Set();let shots=0,maxSlots=0;
   for(let step=0;step<300;step++){
    bank.update(.1);maxSlots=Math.max(maxSlots,bank.firingGuards.size);
    for(const g of bank.guards){if(!Number.isFinite(bank.cost(g.x,g.z)))failures.push(`seed ${seed}: guard walked into obstacle`);if(g.mode==='hidden'){hidden.add(g.id);if(bank.guardCanSee(g.x,g.z,player))failures.push(`seed ${seed}: guard hidden without cover`);}}
    for(const shot of bank.takeShots()){shots++;if(!bank.guardCanSee(shot.x,shot.z,player))failures.push(`seed ${seed}: shot through cover`);const guard=bank.guards.find(g=>Math.hypot(g.x-shot.x,g.z-shot.z)<.1);if(guard)shooters.add(guard.id);}
   }
   const moved=bank.guards.filter(g=>Math.hypot(g.x-initial.get(g.id).x,g.z-initial.get(g.id).z)>.3).length;
   if(maxSlots>2||hidden.size<2||shots<2||shooters.size<2||moved<2)failures.push(`seed ${seed}: tactics slots=${maxSlots} hidden=${hidden.size} shots=${shots} shooters=${shooters.size} moved=${moved}`);
  }
  bank.dispose();
 }
 {
  const bank=new BankInterior(assets,12,24,new Abilities(),cop,makeBankState()),guard=bank.guards[0],point=new THREE.Vector3(guard.x,.9,guard.z);
  bank.warnExplosive(point,point,3);if(!guard.shieldUsed||!guard.shieldMesh)failures.push('explosive shield did not activate');
  bank.damageTarget(guard.id,10,1,0,1,false);if(guard.health!==90||(guard.shieldTime??0)<=0)failures.push('ordinary bullets incorrectly consumed explosive shield');
  bank.damageTarget(guard.id,100,1,0,1,true);if(guard.health!==90||guard.shieldTime!==0||!guard.dashUsed)failures.push('explosive shield or escape dash failed');
  bank.dispose();
 }
 console.log(JSON.stringify({tested:50,failures},null,2));if(failures.length)process.exitCode=1;
} finally {await vite.close();}

