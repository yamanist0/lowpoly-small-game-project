import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import gunsUrl from '../assets/guns/source/Guns.fbx?url';
import atmSource from '../assets/bank_interior/atm/scene.gltf?raw';
import atmBin from '../assets/bank_interior/atm/scene.bin?url';
import safeSource from '../assets/bank_interior/bank_safe/scene.gltf?raw';
import safeBin from '../assets/bank_interior/bank_safe/scene.bin?url';
import safeMetal from '../assets/bank_interior/bank_safe/textures/Metal_metallicRoughness.png?url';
import safeNormal from '../assets/bank_interior/bank_safe/textures/Metal_normal.jpeg?url';
import type { Abilities } from './upgrades';
import type { ShopCustomerVisual } from './agents';
import { clearSegment, type CombatTarget, type CombatResult } from './combat';
import { findPath, type Point } from './pathfinding';
import type { ShopMap, ShopStep } from './shopInterior';

const furniture=import.meta.glob('../assets/kenney_furniture-kit/Models/GLTF format/{desk,chairDesk,bookcaseClosed,pottedPlant,benchCushion,computerScreen}.glb',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const floorUrls=import.meta.glob(['../assets/floors/**/*_baseColor_1k.png','../assets/floors/**/*_basecolor_1k.png'],{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const wallUrls=import.meta.glob(['../assets/walls/**/*_color_1k.png','../assets/walls/**/*_basecolor_1k.png'],{eager:true,query:'?url',import:'default'}) as Record<string,string>;
type Assets={atm:THREE.Group;safe:THREE.Group;furniture:THREE.Group[];guns?:THREE.Group[];floors:THREE.Texture[];walls:THREE.Texture[]};
let assetPromise:Promise<Assets>|null=null;
function prepare(source:THREE.Group,height:number,width:number){source.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(source),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());source.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));const root=new THREE.Group();root.add(source);root.scale.setScalar(Math.min(height/Math.max(.01,size.y),width/Math.max(.01,size.x,size.z)));root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});return root;}
async function parseModel(source:string,files:Record<string,string>){const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{for(const [suffix,value] of Object.entries(files))if(url.endsWith(suffix))return value;return url;});return (await new GLTFLoader(manager).parseAsync(source,'')).scene;}
export function loadBankAssets(){
 if(!assetPromise){const loader=new GLTFLoader(),textures=new THREE.TextureLoader();assetPromise=Promise.all([
  parseModel(atmSource,{'scene.bin':atmBin}),parseModel(safeSource,{'scene.bin':safeBin,'Metal_metallicRoughness.png':safeMetal,'Metal_normal.jpeg':safeNormal}),
  Promise.all(Object.values(furniture).map(async url=>(await loader.loadAsync(url)).scene)),
  new FBXLoader().loadAsync(gunsUrl),
  Promise.all(Object.values(floorUrls).map(url=>textures.loadAsync(url))),Promise.all(Object.values(wallUrls).map(url=>textures.loadAsync(url)))
 ]).then(([atm,safe,props,gunSource,floors,walls])=>{if(!floors.length||!walls.length||!props.length)throw new Error('Bank interior assets are missing');for(const tex of [...floors,...walls])tex.colorSpace=THREE.SRGBColorSpace;gunSource.updateMatrixWorld(true);const gunMaterial=new THREE.MeshStandardMaterial({color:0x626f7e,metalness:.55,roughness:.4});const guns=['MG1','MG2','MG3','MG4'].map(name=>{const original=gunSource.getObjectByName(name);if(!(original instanceof THREE.Mesh))throw new Error(`Missing boss weapon ${name}`);const copy=original.clone();copy.material=gunMaterial;copy.matrix.copy(original.matrixWorld);copy.matrixAutoUpdate=false;const group=new THREE.Group();group.add(copy);return prepare(group,.45,1.25);});return {atm:prepare(atm,1.7,1.15),safe:prepare(safe,2.4,2.4),furniture:props.map(p=>prepare(p,1.2,1.35)),guns,floors,walls};}).catch(e=>{assetPromise=null;throw e;});}
 return assetPromise;
}
export type BankState={resetAt:number;looted:Set<string>;deadGuards:Set<string>;robberyStarted:boolean;bossSpawned:boolean;bossDefeated:boolean};
export function makeBankState():BankState{return {resetAt:0,looted:new Set(),deadGuards:new Set(),robberyStarted:false,bossSpawned:false,bossDefeated:false};}
type Obstacle={x:number;z:number;halfX:number;halfZ:number};
type Terminal={id:string;kind:'atm'|'vault';x:number;z:number;value:number;root:THREE.Object3D;marker:THREE.Mesh};
type GuardMode='seeking'|'toCover'|'hidden'|'toPeek'|'firing'|'returning'|'open';
type OrbitGun={mount:THREE.Group;cooldown:number};
type BossDetails={emerge:number;shieldTime:number;shieldCooldown:number;shield:THREE.Mesh;orbit:THREE.Group;guns:OrbitGun[];angle:number;dashCooldown:number;dashTime:number;dodgeCooldown:number;dodgeTime:number;dodgeX:number;dodgeZ:number;};
type Guard={id:string;x:number;z:number;health:number;shot:number;visual:ShopCustomerVisual;dead:boolean;mode:GuardMode;route:Point[];routeIndex:number;cover:Point|null;peek:Point|null;timer:number;planDelay:number;blocked:number;boss?:BossDetails;shieldUsed?:boolean;shieldTime?:number;shieldMesh?:THREE.Mesh;dashUsed?:boolean;dashTime?:number;emerging?:{from:Point;time:number};};
type Laser={x1:number;z1:number;x2:number;z2:number;phase:number;mesh:THREE.Mesh};
function randomFor(x:number,z:number){let state=(Math.imul(x,374761393)^Math.imul(z,668265263)^0x41a7f)>>>0;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
function crossed(ax:number,az:number,bx:number,bz:number,cx:number,cz:number,dx:number,dz:number){const cross=(x1:number,z1:number,x2:number,z2:number)=>x1*z2-z1*x2,den=cross(bx-ax,bz-az,dx-cx,dz-cz);if(Math.abs(den)<1e-6)return false;const t=cross(cx-ax,cz-az,dx-cx,dz-cz)/den,u=cross(cx-ax,cz-az,bx-ax,bz-az)/den;return t>=0&&t<=1&&u>=0&&u<=1;}
function nearLaser(x:number,z:number,l:Laser){const dx=l.x2-l.x1,dz=l.z2-l.z1,length=dx*dx+dz*dz,t=THREE.MathUtils.clamp(((x-l.x1)*dx+(z-l.z1)*dz)/length,0,1);return Math.hypot(x-(l.x1+dx*t),z-(l.z1+dz*t))<.3;}
export class BankInterior {
 readonly scene=new THREE.Scene();readonly width:number;readonly depth:number;readonly exit:Point;
 private readonly physics=new RAPIER.World({x:0,y:0,z:0});private readonly player:RAPIER.RigidBody;private readonly collider:RAPIER.Collider;private readonly controller:RAPIER.KinematicCharacterController;
 private readonly obstacles:Obstacle[]=[];private readonly sightObstacles:Obstacle[]=[];private readonly walls:{mesh:THREE.Object3D;x:number;z:number}[]=[];private readonly owned:{dispose():void}[]=[];private readonly floor:THREE.Mesh;
 private readonly terminals:Terminal[]=[];private readonly guards:Guard[]=[];private readonly firingGuards=new Set<string>();private readonly coverObjects:Obstacle[]=[];private readonly guardPositions:Point[]=[];private readonly lasers:Laser[]=[];
 private readonly destination:THREE.Mesh;private readonly exitMarker:THREE.Group;private readonly gunModels:THREE.Group[];
 private bossAimed=false;private readonly cashDrops:{mesh:THREE.Mesh;velocity:THREE.Vector3;value:number;age:number}[]=[];private collectedBossCash=0;
 private readonly raycaster=new THREE.Raycaster();private readonly pointer=new THREE.Vector2();private readonly lineGeometry=new THREE.BufferGeometry();private readonly line:THREE.Line;
 private route:Point[]=[];private routeIndex=0;private exitAfterRoute=false;private requestedExit=false;private dashTime=0;private dashFollowing=false;private pulse=0;private readonly direction=new THREE.Vector3(0,0,-1);private blockedTime=0;
 private elapsed=0;private hazardCooldown=0;private alarm=false;private alarmEvent=false;private pendingLaserDamage=0;private shots:THREE.Vector3[]=[];
 constructor(assets:Assets,seedX:number,seedZ:number,private readonly abilities:Abilities,private readonly createPolice:()=>ShopCustomerVisual,readonly state:BankState){
  this.gunModels=assets.guns??[];const random=randomFor(seedX,seedZ);this.width=19+Math.floor(random()*7);this.depth=19+Math.floor(random()*7);this.exit={x:0,z:this.depth/2-1.2};
  this.refreshState();this.alarm=!!this.state.resetAt;this.alarmEvent=this.alarm;this.scene.background=new THREE.Color(0x9daab0);this.scene.add(new THREE.HemisphereLight(0xeaf6ff,0x89908a,1.9));const light=new THREE.DirectionalLight(0xfff1d7,2.1);light.position.set(-8,18,10);this.scene.add(light);
  const texture=(source:THREE.Texture,rx:number,ry:number)=>{const t=source.clone();t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rx,ry);t.needsUpdate=true;this.owned.push(t);return t;};
  const floorMaterial=new THREE.MeshStandardMaterial({map:texture(assets.floors[Math.floor(random()*assets.floors.length)],this.width/3,this.depth/3),roughness:.85});
  const wallMaterial=new THREE.MeshStandardMaterial({map:texture(assets.walls[Math.floor(random()*assets.walls.length)],3,1),roughness:1,side:THREE.DoubleSide});this.owned.push(floorMaterial,wallMaterial);
  const floorGeometry=new THREE.PlaneGeometry(this.width,this.depth);this.owned.push(floorGeometry);this.floor=new THREE.Mesh(floorGeometry,floorMaterial);this.floor.rotation.x=-Math.PI/2;this.floor.receiveShadow=true;this.scene.add(this.floor);
  const wall=(x:number,z:number,w:number,d:number,nx:number,nz:number,inside=false)=>{if(w<=0||d<=0)return;const h=inside?2.5:3.3,geometry=new THREE.BoxGeometry(w,h,d);this.owned.push(geometry);const mesh=new THREE.Mesh(geometry,wallMaterial);mesh.position.set(x,h/2,z);mesh.receiveShadow=true;this.scene.add(mesh);if(!inside)this.walls.push({mesh,x:nx,z:nz});const body=this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,h/2,z));this.physics.createCollider(RAPIER.ColliderDesc.cuboid(w/2,h/2,d/2),body);if(inside){const obstacle={x,z,halfX:w/2+.4,halfZ:d/2+.4};this.obstacles.push(obstacle);this.coverObjects.push(obstacle);}};
  wall(-this.width/2,0,.18,this.depth,-1,0);wall(this.width/2,0,.18,this.depth,1,0);wall(0,-this.depth/2,this.width,.18,0,-1);const wing=(this.width-2.4)/2;wall(-(2.4+wing)/2,this.depth/2,wing,.18,0,1);wall((2.4+wing)/2,this.depth/2,wing,.18,0,1);
  this.exitMarker=new THREE.Group();this.exitMarker.position.set(this.exit.x,.12,this.exit.z);this.scene.add(this.exitMarker);
  const exitGeometry=new THREE.PlaneGeometry(2.15,.86),exitMaterial=new THREE.MeshBasicMaterial({color:0x176358,side:THREE.DoubleSide,depthTest:false});this.owned.push(exitGeometry,exitMaterial);const exitBase=new THREE.Mesh(exitGeometry,exitMaterial);exitBase.rotation.x=-Math.PI/2;exitBase.renderOrder=20;this.exitMarker.add(exitBase);
  if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#114e49';ctx.fillRect(0,0,256,96);ctx.strokeStyle='#c0fff1';ctx.lineWidth=6;ctx.strokeRect(4,4,248,88);ctx.fillStyle='#ffffff';ctx.font='bold 48px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('EXIT',128,51);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;const material=new THREE.MeshBasicMaterial({map,transparent:true,side:THREE.DoubleSide,depthTest:false});this.owned.push(map,material);const label=new THREE.Mesh(exitGeometry,material);label.rotation.x=-Math.PI/2;label.position.y=.01;label.renderOrder=21;this.exitMarker.add(label);}
  const destinationGeometry=new THREE.RingGeometry(.38,.55,32),destinationMaterial=new THREE.MeshBasicMaterial({color:0x67f5ff,side:THREE.DoubleSide,depthTest:false});this.owned.push(destinationGeometry,destinationMaterial);this.destination=new THREE.Mesh(destinationGeometry,destinationMaterial);this.destination.rotation.x=-Math.PI/2;this.destination.renderOrder=22;this.destination.visible=false;this.scene.add(this.destination);
  const divider=-1+Math.floor(random()*4),doorX=(Math.floor(random()*5)-2)*1.3,gap=3.5,left=doorX-gap/2+this.width/2,right=this.width/2-(doorX+gap/2);
  wall(-this.width/2+left/2,divider,left,.18,0,0,true);wall(doorX+gap/2+right/2,divider,right,.18,0,0,true);
  // The side-office partition and its doorway change position and orientation by bank.
  const side=random()>.5?1:-1,officeX=side*(this.width/2-(4+Math.floor(random()*2))),roomStart=-this.depth/2+1,roomEnd=divider-1.4,doorZ=roomStart+(roomEnd-roomStart)*(.35+random()*.3),officeGap=2.4;
  if(roomEnd-roomStart>officeGap+1){wall(officeX,(roomStart+doorZ-officeGap/2)/2,.18,doorZ-officeGap/2-roomStart,0,0,true);wall(officeX,(doorZ+officeGap/2+roomEnd)/2,.18,roomEnd-doorZ-officeGap/2,0,0,true);}
  const prop=(model:THREE.Group,x:number,z:number,rotation:number,solid=true)=>{const root=model.clone();root.position.set(x,.03,z);root.rotation.y=rotation;this.scene.add(root);if(solid){root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),c=box.getCenter(new THREE.Vector3()),d=box.getSize(new THREE.Vector3());const hx=Math.max(.3,d.x*.43),hz=Math.max(.3,d.z*.43);const obstacle={x:c.x,z:c.z,halfX:hx+.35,halfZ:hz+.35};this.obstacles.push(obstacle);if(d.y>.75)this.coverObjects.push(obstacle);const body=this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(c.x,.65,c.z));this.physics.createCollider(RAPIER.ColliderDesc.cuboid(hx,.65,hz),body);}return root;};
  const markerMaterial=new THREE.MeshBasicMaterial({color:0x5be6d1,transparent:true,opacity:.8,side:THREE.DoubleSide});this.owned.push(markerMaterial);
  const makeTerminal=(id:string,kind:'atm'|'vault',x:number,z:number,rotation:number,value:number)=>{const root=prop(kind==='atm'?assets.atm:assets.safe,x,z,rotation,true);const geometry=new THREE.RingGeometry(.65,.78,28);this.owned.push(geometry);const marker=new THREE.Mesh(geometry,markerMaterial.clone());this.owned.push(marker.material);marker.rotation.x=-Math.PI/2;marker.position.set(x+(kind==='atm'?(x<0?1.1:-1.1):0),.08,z+(kind==='vault'?1.7:0));this.scene.add(marker);this.terminals.push({id,kind,x,z,value,root,marker});};
  const atmCount=3+Math.floor(random()*3);for(let i=0;i<atmCount;i++){const side=i%2?1:-1,row=Math.floor(i/2),x=side*(this.width/2-1.4),z=divider+2.4+row*2.8;makeTerminal(`atm-${i}`,'atm',x,Math.min(z,this.depth/2-2),side===1?-Math.PI/2:Math.PI/2,500+Math.floor(random()*501));}
  makeTerminal('vault','vault',0,-this.depth/2+2,0,2000+Math.floor(random()*3001));
  for(let i=0;i<6;i++){const side=i%2?1:-1,x=side*(this.width/2-3.2-random()*1.1),z=(i<2?divider+4+(i%2)*2:-this.depth/2+3+(i-2)*1.6);if(Math.abs(x-doorX)<2.5&&Math.abs(z-divider)<3)continue;prop(assets.furniture[Math.floor(random()*assets.furniture.length)],x,z,Math.floor(random()*4)*Math.PI/2,random()>.35);}
  // Layout is checked before construction so new cover cannot seal off an ATM or the vault.
  const coverMaterial=new THREE.MeshStandardMaterial({color:0x796b58,roughness:.86}),topMaterial=new THREE.MeshStandardMaterial({color:0xb7b4a1,roughness:.72});this.owned.push(coverMaterial,topMaterial);
  const addCover=(x:number,z:number,w:number,d:number,height:number)=>{
   const obstacle={x,z,halfX:w/2+.4,halfZ:d/2+.4};
   if(Math.abs(x)+obstacle.halfX>this.width/2-.7||Math.abs(z)+obstacle.halfZ>this.depth/2-.7||Math.hypot(x,z-(this.depth/2-1.5))<3.2)return false;
   if(this.obstacles.some(o=>Math.abs(x-o.x)<obstacle.halfX+o.halfX+.3&&Math.abs(z-o.z)<obstacle.halfZ+o.halfZ+.3))return false;
   this.obstacles.push(obstacle);
   const start={x:0,z:Math.round(this.depth/2-1.5)},queue=[start],visited=new Set([`${start.x},${start.z}`]);
   for(let i=0;i<queue.length;i++)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const px=queue[i].x+dx,pz=queue[i].z+dz,key=`${px},${pz}`;if(!visited.has(key)&&Number.isFinite(this.cost(px,pz))){visited.add(key);queue.push({x:px,z:pz});}}
   if(!this.terminals.every(t=>queue.some(p=>Math.hypot(p.x-t.x,p.z-t.z)<2.15))){this.obstacles.pop();return false;}
   this.coverObjects.push(obstacle);const geometry=new THREE.BoxGeometry(w,height,d);this.owned.push(geometry);const mesh=new THREE.Mesh(geometry,height>1.5?wallMaterial:coverMaterial);mesh.position.set(x,height/2,z);mesh.castShadow=true;mesh.receiveShadow=true;this.scene.add(mesh);
   if(height<1.5){const top=new THREE.BoxGeometry(w+.08,.1,d+.08);this.owned.push(top);const cap=new THREE.Mesh(top,topMaterial);cap.position.set(x,height+.05,z);this.scene.add(cap);}
   const body=this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,height/2,z));this.physics.createCollider(RAPIER.ColliderDesc.cuboid(w/2,height/2,d/2),body);return true;
  };
  // Offset office walls and low counters create distinct firing lanes in both halves.
  for(let i=0;i<3;i++){const side=i%2?1:-1,x=side*(3.5+random()*1.5),z=i===0?divider+3:divider-3-(i-1)*2;addCover(x,z,i===1?.22:2.7,i===1?2.8:.75,2.35);}
  let coverCount=0;for(let i=0;i<24&&coverCount<6;i++){const side=i%2?1:-1,x=side*(2.2+random()*(this.width/2-5)),z=(i%3===0?divider+3+random()*3:-this.depth/2+3+random()*Math.max(1,this.depth/2+divider-5));if(addCover(x,z,i%3===0?1:2.2,i%3===0?2.2:1,1.05))coverCount++;}
  const laserMaterial=()=>new THREE.MeshBasicMaterial({color:0xff3e47,transparent:true,opacity:.78,depthWrite:false});
  const addLaser=(x1:number,z1:number,x2:number,z2:number,phase:number)=>{const len=Math.hypot(x2-x1,z2-z1),g=new THREE.CylinderGeometry(.035,.035,len,8),m=laserMaterial(),mesh=new THREE.Mesh(g,m);this.owned.push(g,m);mesh.position.set((x1+x2)/2,.85,(z1+z2)/2);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(x2-x1,0,z2-z1).normalize());this.scene.add(mesh);this.lasers.push({x1,z1,x2,z2,phase,mesh});};
  addLaser(doorX-gap/2+.3,divider,doorX+gap/2-.3,divider,random()*4);addLaser(-3,-this.depth/2+6,3,-this.depth/2+6,random()*4);addLaser(-3,divider+4,3,divider+4,random()*4);
  const spawn={x:0,z:this.depth/2-1.5};this.player=this.physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x,1,spawn.z));this.collider=this.physics.createCollider(RAPIER.ColliderDesc.ball(.3),this.player);this.controller=this.physics.createCharacterController(.05);
  const lineMat=new THREE.LineDashedMaterial({color:0x53efff,transparent:true,opacity:.9,dashSize:.5,gapSize:.45,depthWrite:false});this.owned.push(this.lineGeometry,lineMat);this.line=new THREE.Line(this.lineGeometry,lineMat);this.line.visible=false;this.line.frustumCulled=false;this.scene.add(this.line);
  const guardCount=8+Math.floor(random()*4);for(let i=0;i<guardCount;i++){const side=i%2?1:-1,z=i<4?divider+2+(Math.floor(i/2))*3:-this.depth/2+3+Math.floor((i-4)/2)*2,x=side*(2.5+(i%3)*1.2);let best:Point|null=null,bestDistance=Infinity;for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++){const px=Math.round(x)+dx,pz=Math.round(z)+dz,d=Math.hypot(px-x,pz-z);if(d<bestDistance&&Number.isFinite(this.cost(px,pz))&&Math.hypot(px-spawn.x,pz-spawn.z)>3&&this.guardPositions.every(g=>Math.hypot(g.x-px,g.z-pz)>1.3)){best={x:px,z:pz};bestDistance=d;}}if(best)this.guardPositions.push(best);}
  this.sightObstacles.push(...this.obstacles.map(o=>({...o,halfX:Math.max(.1,o.halfX-.35),halfZ:Math.max(.1,o.halfZ-.35)})),{x:-this.width/2,z:0,halfX:.09,halfZ:this.depth/2},{x:this.width/2,z:0,halfX:.09,halfZ:this.depth/2},{x:0,z:-this.depth/2,halfX:this.width/2,halfZ:.09},{x:-(2.4+wing)/2,z:this.depth/2,halfX:wing/2,halfZ:.09},{x:(2.4+wing)/2,z:this.depth/2,halfX:wing/2,halfZ:.09});
  this.refreshGuards();this.physics.step();this.updateTerminalMarkers();
 }
 private refreshState(){if(this.state.resetAt&&Date.now()>=this.state.resetAt){this.state.resetAt=0;this.state.looted.clear();this.state.deadGuards.clear();this.state.robberyStarted=false;this.state.bossSpawned=false;this.state.bossDefeated=false;return true;}return false;}
 private createGuard(id:string,p:Point,health=100):Guard{
  const visual=this.createPolice();this.scene.add(visual.root);visual.update(p.x,p.z,0,0,0);
  const guard:Guard={id,x:p.x,z:p.z,health,shot:0,visual,dead:false,mode:'seeking',route:[],routeIndex:0,cover:null,peek:null,timer:0,planDelay:.15+this.guards.length*.15,blocked:0};this.guards.push(guard);return guard;
 }
 private refreshGuards(){
  this.firingGuards.clear();for(const g of this.guards){this.scene.remove(g.visual.root);g.visual.dispose();if(g.boss){this.scene.remove(g.boss.orbit);this.scene.remove(g.boss.shield);}}
  this.guards.length=0;this.guardPositions.forEach((p,i)=>{const id=`guard-${i}`;if(!this.state.deadGuards.has(id))this.createGuard(id,p);});
  if(this.state.bossSpawned&&!this.state.bossDefeated)this.spawnBoss();else if(this.state.bossDefeated)this.spawnReinforcements(this.goal(0,-this.depth/2+5)??{x:0,z:0});
 }
 private guardIndex(guard:Guard){const value=Number(guard.id.split('-').at(-1));return Number.isFinite(value)?value:11;}
 private freeGuardPoint(x:number,z:number){
  const p=this.position;let best:Point|null=null,bestDistance=Infinity;
  for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=5;dz++){const px=Math.round(x)+dx,pz=Math.round(z)+dz,d=Math.hypot(px-x,pz-z);if(d<bestDistance&&Number.isFinite(this.cost(px,pz))&&Math.hypot(px-p.x,pz-p.z)>.9&&this.guards.every(g=>g.dead||Math.hypot(g.x-px,g.z-pz)>1.05)){best={x:px,z:pz};bestDistance=d;}}
  return best;
 }
 private spawnBoss(){
  if(this.state.bossDefeated||this.guards.some(g=>g.id==='boss'&&!g.dead))return;
  const p=this.freeGuardPoint(0,-this.depth/2+5)??this.goal(0,-this.depth/2+5);if(!p)return;
  const guard=this.createGuard('boss',p,300);guard.planDelay=.4;guard.visual.root.scale.setScalar(3);guard.visual.root.position.y=-4.5;
  const shieldGeometry=new THREE.SphereGeometry(2.25,24,16),shieldMaterial=new THREE.MeshBasicMaterial({color:0x6dd8ff,wireframe:true,transparent:true,opacity:.3,depthWrite:false});this.owned.push(shieldGeometry,shieldMaterial);
  const shield=new THREE.Mesh(shieldGeometry,shieldMaterial);shield.visible=false;this.scene.add(shield);
  const orbit=new THREE.Group();this.scene.add(orbit);const guns:OrbitGun[]=[];
  for(let i=0;i<4;i++){const mount=new THREE.Group(),model=this.gunModels[i];if(model)mount.add(model.clone());else{const geometry=new THREE.BoxGeometry(.22,.2,1),material=new THREE.MeshStandardMaterial({color:0x5a6775});this.owned.push(geometry,material);mount.add(new THREE.Mesh(geometry,material));}orbit.add(mount);guns.push({mount,cooldown:i*.17});}
  guard.boss={emerge:1.25,shieldTime:0,shieldCooldown:3,shield,orbit,guns,angle:0,dashCooldown:3,dashTime:0,dodgeCooldown:0,dodgeTime:0,dodgeX:0,dodgeZ:0};
 }
 private spawnReinforcements(origin:Point){
  for(let i=0;i<2;i++){const id=`reinforcement-${i}`;if(this.state.deadGuards.has(id)||this.guards.some(g=>g.id===id&&!g.dead))continue;const point=this.freeGuardPoint(origin.x+(i?1.5:-1.5),origin.z);if(point){const guard=this.createGuard(id,point);guard.emerging={from:{...origin},time:.5};guard.visual.root.position.set(origin.x,.09,origin.z);}}
 }
 private dropBossCash(x:number,z:number){
  const geometry=new THREE.BoxGeometry(.35,.025,.17),material=new THREE.MeshStandardMaterial({color:0x81bd6d,roughness:1});this.owned.push(geometry,material);
  for(let i=0;i<10;i++){const angle=i*Math.PI*2/10,mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,1.4,z);mesh.rotation.y=angle;this.scene.add(mesh);this.cashDrops.push({mesh,velocity:new THREE.Vector3(Math.cos(angle)*(1.2+Math.random()),2+Math.random()*1.5,Math.sin(angle)*(1.2+Math.random())),value:50,age:0});}
 }
 private updateBossCash(dt:number,player:Point){
  for(let i=this.cashDrops.length-1;i>=0;i--){const drop=this.cashDrops[i];drop.age+=dt;if(drop.velocity.lengthSq()>0){drop.velocity.y-=9.81*dt;drop.mesh.position.addScaledVector(drop.velocity,dt);drop.mesh.rotation.y+=dt*3;if(drop.mesh.position.y<.1){drop.mesh.position.y=.1;drop.velocity.set(0,0,0);if(!Number.isFinite(this.cost(drop.mesh.position.x,drop.mesh.position.z))){const safe=this.goal(drop.mesh.position.x,drop.mesh.position.z);if(safe){drop.mesh.position.x=safe.x;drop.mesh.position.z=safe.z;}}}}if(drop.age>=.2&&Math.hypot(drop.mesh.position.x-player.x,drop.mesh.position.z-player.z)<1){this.collectedBossCash+=drop.value;this.scene.remove(drop.mesh);this.cashDrops.splice(i,1);}}
 }
 takeBossCash(){const amount=this.collectedBossCash;this.collectedBossCash=0;return amount;}
 setAimedTarget(id:string|null){this.bossAimed=id==='boss';}
 bossStatus(){const guard=this.guards.find(g=>g.id==='boss'&&!g.dead);return guard?.boss?{health:guard.health,shielded:guard.boss.shieldTime>0,emerging:guard.boss.emerge>0}:null;}
 private updateTerminalMarkers(){for(const t of this.terminals){const used=this.state.looted.has(t.id);(t.marker.material as THREE.MeshBasicMaterial).color.set(used?0x697d79:0x5be6d1);(t.marker.material as THREE.MeshBasicMaterial).opacity=used?.35:.8;}}
 private beginAlarm(){if(!this.alarm){this.alarm=true;this.alarmEvent=true;}if(!this.state.resetAt)this.state.resetAt=Date.now()+300000;}
 interceptExplosive(start:THREE.Vector3){
  const boss=this.guards.find(g=>g.boss&&!g.dead&&g.boss.emerge<=0);if(!boss?.boss)return null;
  for(const gun of boss.boss.guns){const x=boss.x+gun.mount.position.x,z=boss.z+gun.mount.position.z;if(Number.isFinite(this.cost(x,z))&&this.guardCanSee(x,z,{x:start.x,z:start.z}))return new THREE.Vector3(x,2.2,z);}
  return null;
 }
 warnExplosive(start:THREE.Vector3,end:THREE.Vector3,radius:number){
  for(const guard of this.guards){if(guard.dead||guard.boss||guard.shieldUsed||Math.hypot(guard.x-end.x,guard.z-end.z)>radius+1||!this.lineOfSight(start,new THREE.Vector3(guard.x,.9,guard.z)))continue;
   guard.shieldUsed=true;guard.shieldTime=4;const geometry=new THREE.SphereGeometry(.95,16,12),material=new THREE.MeshBasicMaterial({color:0x76dbff,transparent:true,opacity:.3,wireframe:true,depthWrite:false});this.owned.push(geometry,material);guard.shieldMesh=new THREE.Mesh(geometry,material);this.scene.add(guard.shieldMesh);
  }
 }
 consumeAlarm(){const result=this.alarmEvent;this.alarmEvent=false;return result;}
 takeShots(){const result=this.shots;this.shots=[];return result;}
 takeLaserDamage(){const result=this.pendingLaserDamage;this.pendingLaserDamage=0;return result;}
 get isAlarmed(){return this.alarm;}
 get position(){const p=this.player.translation();return {x:p.x,z:p.z};}get map():ShopMap{return {width:this.width,depth:this.depth,exit:this.exit};}get path(){return this.route;}get pathIndex(){return this.routeIndex;}get dashCharge(){return this.abilities.dashProgress;}
 get remainingGuards(){return this.guards.filter(g=>!g.dead).length;}
 get canExit(){return !this.state.robberyStarted||(this.remainingGuards===0&&(!this.state.bossSpawned||this.state.bossDefeated));}
 get nearExit(){const p=this.position;return Math.hypot(p.x-this.exit.x,p.z-this.exit.z)<1.4;}get nearCounter(){return false;}
 get nearbyTerminal(){const p=this.position;return this.terminals.filter(t=>Math.hypot(p.x-t.x,p.z-t.z)<2.3).sort((a,b)=>Math.hypot(p.x-a.x,p.z-a.z)-Math.hypot(p.x-b.x,p.z-b.z))[0]??null;}
 get prompt(){const t=this.nearbyTerminal;if(t){if(this.state.looted.has(t.id)){const seconds=Math.max(0,Math.ceil((this.state.resetAt-Date.now())/1000));return `EMPTY | RESETS IN ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}return `E  ${t.kind==='atm'?'HACK ATM':'PICK VAULT LOCK'}`;}return this.nearExit?(this.canExit?'E  EXIT BANK':`EXIT LOCKED | ${this.remainingGuards} POLICE REMAIN`):'CLICK TO MOVE  |  AVOID ACTIVE LASERS';}
 interact(){const terminal=this.nearbyTerminal;if(!terminal||this.state.looted.has(terminal.id))return null;this.beginAlarm();this.state.robberyStarted=true;this.stopMoving();return {id:terminal.id,kind:terminal.kind};}
 complete(id:string){const t=this.terminals.find(item=>item.id===id);if(!t||this.state.looted.has(id))return 0;this.beginAlarm();this.state.robberyStarted=true;this.state.looted.add(id);if(t.kind==='vault'){this.state.bossSpawned=true;this.spawnBoss();}this.updateTerminalMarkers();return t.value;}
 frighten(_x:number,_z:number){this.beginAlarm();}
 setCashierAimed(_aimed:boolean){}takeCollectedCash(){return 0;}takeCashierShot():THREE.Vector3|null{return null;}
 combatTargets():CombatTarget[]{return this.guards.filter(g=>!g.dead&&!g.emerging&&(!g.boss||g.boss.emerge<=0)).map(g=>({id:g.id,kind:'person',police:true,position:new THREE.Vector3(g.x,g.boss?(g.mode==='hidden'?1.3:2.1):(g.mode==='hidden'?.6:.9),g.z),radius:g.boss?1.45:(g.mode==='hidden'?.55:.7)}));}
 damageTarget(id:string,damage:number,dx:number,dz:number,_flight:number,explosive=false):CombatResult|null{
  const guard=this.guards.find(g=>g.id===id&&!g.dead);if(!guard)return null;const position=new THREE.Vector3(guard.x,guard.boss?2:.9,guard.z);
  if(guard.boss&&(guard.boss.emerge>0||guard.boss.shieldTime>0))return {killed:false,kind:'person',police:true,position};
  if(explosive&&!guard.boss&&(guard.shieldTime??0)>0){guard.shieldTime=0;if(guard.shieldMesh)guard.shieldMesh.visible=false;if(!guard.dashUsed){this.firingGuards.delete(guard.id);guard.cover=null;guard.peek=null;let planned=this.planGuardCover(guard,this.position);if(!planned){const angle=Math.atan2(guard.x-this.position.x,guard.z-this.position.z);for(const turn of [0,.7,-.7,1.4,-1.4]){const target=this.goal(guard.x+Math.sin(angle+turn)*3,guard.z+Math.cos(angle+turn)*3);if(target&&Math.hypot(target.x-guard.x,target.z-guard.z)>1&&this.guardRoute(guard,target,'toCover')){planned=true;break;}}}if(planned){guard.dashUsed=true;guard.dashTime=.35;}}return {killed:false,kind:'person',police:true,position};}
  guard.health-=damage;if(guard.health<=0){guard.dead=true;if(guard.shieldMesh)guard.shieldMesh.visible=false;this.firingGuards.delete(guard.id);this.state.deadGuards.add(id);guard.visual.root.rotation.z=Math.PI/2;guard.visual.root.rotation.y=Math.atan2(dx,dz);guard.visual.root.position.y=.15;
   if(guard.boss){this.state.bossDefeated=true;guard.boss.shield.visible=false;guard.boss.orbit.visible=false;this.dropBossCash(guard.x,guard.z);this.spawnReinforcements({x:guard.x,z:guard.z});}
  }
  return {killed:guard.dead,kind:'person',police:true,position};
 }
 lineOfSight(from:THREE.Vector3,to:THREE.Vector3){return clearSegment(from.x,from.z,to.x,to.z,this.sightObstacles);}
 projectileImpact(from:THREE.Vector3,to:THREE.Vector3){
  const delta=to.clone().sub(from),length=Math.hypot(delta.x,delta.z);if(length<1e-6)return null;
  const ray=new THREE.Ray(new THREE.Vector3(from.x,0,from.z),new THREE.Vector3(delta.x/length,0,delta.z/length)),point=new THREE.Vector3();let best=length;
  for(const o of this.sightObstacles){if(Math.abs(from.x-o.x)<o.halfX&&Math.abs(from.z-o.z)<o.halfZ)continue;const box=new THREE.Box3(new THREE.Vector3(o.x-o.halfX,-1,o.z-o.halfZ),new THREE.Vector3(o.x+o.halfX,1,o.z+o.halfZ));if(ray.intersectBox(box,point)){const d=Math.hypot(point.x-from.x,point.z-from.z);if(d<best)best=d;}}
  return best<length?from.clone().lerp(to,best/length):null;
 }
 // Guards reserve cover and firing positions independently; a clear ray is required
 // from the exposed position, while the hidden position must actually block it.
 private guardCanSee(x:number,z:number,player:Point){return clearSegment(x,z,player.x,player.z,this.sightObstacles);}
 private guardRoute(guard:Guard,target:Point,mode:GuardMode){
  const start=this.goal(guard.x,guard.z);if(!start)return false;
  const path=findPath(start,target,(x,z)=>this.cost(x,z));if(!path.length&&(start.x!==target.x||start.z!==target.z))return false;
  if(Math.hypot(guard.x-start.x,guard.z-start.z)>.08)path.unshift(start);
  guard.route=path;guard.routeIndex=0;guard.blocked=0;guard.mode=mode;guard.timer=10;return true;
 }
 private planGuardCover(guard:Guard,player:Point){
  const candidates:{point:Point;score:number}[]=[],seen=new Set<string>();
  for(const box of this.coverObjects){
   const minX=Math.floor(box.x-box.halfX-1.6),maxX=Math.ceil(box.x+box.halfX+1.6),minZ=Math.floor(box.z-box.halfZ-1.6),maxZ=Math.ceil(box.z+box.halfZ+1.6);
   for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
    const key=`${x},${z}`,edgeX=Math.max(0,Math.abs(x-box.x)-box.halfX),edgeZ=Math.max(0,Math.abs(z-box.z)-box.halfZ);
    if(seen.has(key)||Math.hypot(edgeX,edgeZ)>1.6||!Number.isFinite(this.cost(x,z))||Math.hypot(x-player.x,z-player.z)<1.8||this.guardCanSee(x,z,player))continue;
    if(this.guards.some(other=>other!==guard&&!other.dead&&other.cover&&Math.hypot(other.cover.x-x,other.cover.z-z)<1.3))continue;
    seen.add(key);candidates.push({point:{x,z},score:Math.hypot(x-guard.x,z-guard.z)+Math.hypot(edgeX,edgeZ)*.7});
   }
  }
  candidates.sort((a,b)=>a.score-b.score);
  const start=this.goal(guard.x,guard.z);if(!start)return false;
  for(const {point:cover} of candidates.slice(0,24)){
   const peekCandidates:Point[]=[];
   for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
    const distance=Math.hypot(dx,dz),x=cover.x+dx,z=cover.z+dz;
    if(distance<.9||distance>3.2||!Number.isFinite(this.cost(x,z))||Math.hypot(x-player.x,z-player.z)<1.3||!this.guardCanSee(x,z,player))continue;
    peekCandidates.push({x,z});
   }
   peekCandidates.sort((a,b)=>Math.hypot(a.x-cover.x,a.z-cover.z)-Math.hypot(b.x-cover.x,b.z-cover.z));
   if(!peekCandidates.length)continue;
   const path=findPath(start,cover,(x,z)=>this.cost(x,z));if(!path.length&&(start.x!==cover.x||start.z!==cover.z))continue;
   const peek=peekCandidates.slice(0,12).find(point=>{const path=findPath(cover,point,(x,z)=>this.cost(x,z));return path.length>0&&path.length<=5;});
   if(!peek)continue;
   guard.cover=cover;guard.peek=peek;if(this.guardRoute(guard,cover,'toCover'))return true;
  }
  guard.cover=null;guard.peek=null;return false;
 }
 private finishGuardRoute(guard:Guard){
  if(guard.mode==='toCover'||guard.mode==='returning'){
   this.firingGuards.delete(guard.id);guard.mode=guard.peek?'hidden':'seeking';guard.timer=1.2+(this.guardIndex(guard)%4)*.35;guard.planDelay=.8;
  }else if(guard.mode==='toPeek'){guard.mode='firing';guard.timer=1.1;guard.shot=.15;}
 }
 private prepareBoss(guard:Guard,player:Point,dt:number){
  const boss=guard.boss;if(!boss)return false;
  if(boss.emerge>0){boss.emerge=Math.max(0,boss.emerge-dt);guard.visual.update(guard.x,guard.z,0,0,dt);guard.visual.root.scale.setScalar(3);guard.visual.root.position.y=.09-4.7*boss.emerge/1.25;boss.orbit.visible=false;return true;}
  boss.orbit.visible=true;boss.shieldCooldown-=dt;boss.shieldTime=Math.max(0,boss.shieldTime-dt);boss.dashCooldown=Math.max(0,boss.dashCooldown-dt);boss.dashTime=Math.max(0,boss.dashTime-dt);boss.dodgeCooldown=Math.max(0,boss.dodgeCooldown-dt);
  if(boss.shieldCooldown<=0){boss.shieldTime=1;boss.shieldCooldown=3;}
  if(this.bossAimed&&boss.dodgeCooldown<=0&&boss.dodgeTime<=0){const dx=guard.x-player.x,dz=guard.z-player.z,length=Math.hypot(dx,dz)||1;for(const side of [1,-1]){const x=dz/length*side,z=-dx/length*side;if(Number.isFinite(this.cost(guard.x+x*.9,guard.z+z*.9))&&Math.hypot(guard.x+x*.9-player.x,guard.z+z*.9-player.z)>.8){boss.dodgeX=x;boss.dodgeZ=z;boss.dodgeTime=.15;boss.dodgeCooldown=1.5;this.firingGuards.delete(guard.id);guard.mode='seeking';guard.cover=null;guard.peek=null;guard.route=[];guard.planDelay=.4;break;}}}
  if(boss.dodgeTime>0){const step=Math.min(dt,boss.dodgeTime),x=guard.x+boss.dodgeX*6*step,z=guard.z+boss.dodgeZ*6*step;boss.dodgeTime=Math.max(0,boss.dodgeTime-dt);if(Number.isFinite(this.cost(x,z))&&Math.hypot(x-player.x,z-player.z)>.7){guard.x=x;guard.z=z;}guard.visual.update(guard.x,guard.z,boss.dodgeX,boss.dodgeZ,dt);guard.visual.root.scale.setScalar(3);return true;}
  return false;
 }
 private updateBossGear(guard:Guard,player:Point,dt:number){
  const boss=guard.boss;if(!boss||guard.dead)return;
  boss.shield.visible=boss.emerge<=0&&boss.shieldTime>0;boss.shield.position.set(guard.x,2.1,guard.z);
  boss.orbit.visible=boss.emerge<=0;if(!boss.orbit.visible)return;
  boss.angle+=dt*1.15;boss.orbit.position.set(guard.x,0,guard.z);boss.orbit.updateMatrixWorld(true);
  for(let i=0;i<boss.guns.length;i++){
   const gun=boss.guns[i],angle=boss.angle+i*Math.PI/2;gun.mount.position.set(Math.sin(angle)*2.3,2.2,Math.cos(angle)*2.3);gun.mount.lookAt(player.x,1,player.z);
   if(guard.mode!=='firing')continue;gun.cooldown-=dt;
   const x=guard.x+gun.mount.position.x,z=guard.z+gun.mount.position.z;
   if(gun.cooldown<=0&&Number.isFinite(this.cost(x,z))&&Math.hypot(x-player.x,z-player.z)<20&&this.guardCanSee(x,z,player)){this.shots.push(new THREE.Vector3(x,2.2,z));gun.cooldown=1.8+i*.1;}
  }
 }
 private updateGuard(guard:Guard,player:Point,dt:number){
  if(guard.dead)return;
  if(guard.emerging){const emergence=guard.emerging;emergence.time=Math.max(0,emergence.time-dt);const t=1-emergence.time/.5;guard.visual.update(THREE.MathUtils.lerp(emergence.from.x,guard.x,t),THREE.MathUtils.lerp(emergence.from.z,guard.z,t),guard.x-emergence.from.x,guard.z-emergence.from.z,dt);guard.visual.root.position.y+=Math.sin(Math.PI*t)*.65;if(emergence.time<=0)guard.emerging=undefined;return;}
  if(guard.boss&&this.prepareBoss(guard,player,dt)){this.updateBossGear(guard,player,dt);return;}
  if(!this.alarm){guard.visual.update(guard.x,guard.z,0,0,dt);this.updateBossGear(guard,player,dt);return;}
  if(!guard.boss){guard.shieldTime=Math.max(0,(guard.shieldTime??0)-dt);guard.dashTime=Math.max(0,(guard.dashTime??0)-dt);if(guard.shieldMesh){guard.shieldMesh.visible=guard.shieldTime>0;guard.shieldMesh.position.set(guard.x,1,guard.z);}if(!guard.dashUsed&&!guard.shieldUsed&&this.elapsed>5&&(guard.mode==='toCover'||guard.mode==='returning')){guard.dashUsed=true;guard.dashTime=.3;}}
  guard.planDelay=Math.max(0,guard.planDelay-dt);
  if(guard.mode==='seeking'&&guard.planDelay<=0){
   if(!this.planGuardCover(guard,player)){guard.mode='open';guard.timer=.8+(this.guardIndex(guard)%3)*.4;guard.planDelay=2;}
  }
  if(guard.mode==='hidden'){
   guard.timer-=dt;
   if(guard.planDelay<=0&&this.guardCanSee(guard.x,guard.z,player)){
    guard.cover=null;guard.peek=null;guard.mode='seeking';guard.planDelay=.3;
   }else if(guard.timer<=0&&guard.peek&&this.firingGuards.size<2){
    if(this.guardCanSee(guard.peek.x,guard.peek.z,player)&&this.guardRoute(guard,guard.peek,'toPeek'))this.firingGuards.add(guard.id);
    else{guard.cover=null;guard.peek=null;guard.mode='seeking';guard.planDelay=.4;}
   }
  }
  if(guard.mode==='open'){
   guard.timer-=dt;
   if(guard.planDelay<=0){guard.mode='seeking';guard.planDelay=.1;}
   else if(guard.timer<=0&&this.firingGuards.size<2&&Math.hypot(guard.x-player.x,guard.z-player.z)<17&&this.guardCanSee(guard.x,guard.z,player)){
    this.firingGuards.add(guard.id);guard.mode='firing';guard.timer=.8;guard.shot=.15;
   }
  }
  let vx=0,vz=0;
  if(guard.mode==='toCover'||guard.mode==='toPeek'||guard.mode==='returning'){
   if(guard.boss&&guard.boss.dashCooldown<=0){guard.boss.dashTime=.24;guard.boss.dashCooldown=3;}
   guard.timer-=dt;while(guard.routeIndex<guard.route.length&&Math.hypot(guard.route[guard.routeIndex].x-guard.x,guard.route[guard.routeIndex].z-guard.z)<.04)guard.routeIndex++;
   if(guard.routeIndex>=guard.route.length)this.finishGuardRoute(guard);
   else{
    const target=guard.route[guard.routeIndex],dx=target.x-guard.x,dz=target.z-guard.z,distance=Math.hypot(dx,dz),step=Math.min(distance,dt*(guard.boss?(guard.boss.dashTime>0?11:3.3*1.3):((guard.dashTime??0)>0?10:3.3))),nx=guard.x+dx/distance*step,nz=guard.z+dz/distance*step;
    if(Number.isFinite(this.cost(nx,nz))&&Math.hypot(nx-player.x,nz-player.z)>.7){vx=nx-guard.x;vz=nz-guard.z;guard.x=nx;guard.z=nz;guard.blocked=0;}else guard.blocked+=dt;
    if(guard.blocked>.8||guard.timer<=0){this.firingGuards.delete(guard.id);guard.mode='seeking';guard.cover=null;guard.peek=null;guard.planDelay=.6;}
   }
  }
  if(guard.mode==='firing'){
   guard.timer-=dt;guard.shot-=dt;
   if(!guard.boss&&guard.shot<=0&&Math.hypot(guard.x-player.x,guard.z-player.z)<17&&this.guardCanSee(guard.x,guard.z,player)){this.shots.push(new THREE.Vector3(guard.x,1,guard.z));guard.shot=1;}
   if(guard.timer<=0){if(!guard.cover||!this.guardRoute(guard,guard.cover,'returning')){this.firingGuards.delete(guard.id);guard.mode='open';guard.timer=1.5;guard.planDelay=1;}}
  }
  guard.visual.update(guard.x,guard.z,vx,vz,dt);if(Math.hypot(vx,vz)<.001)guard.visual.root.rotation.y=Math.atan2(player.x-guard.x,player.z-guard.z);
  const scale=guard.boss?3:1;guard.visual.root.scale.y=THREE.MathUtils.damp(guard.visual.root.scale.y,guard.mode==='hidden'?scale*.68:scale,12,dt);this.updateBossGear(guard,player,dt);
 }
 private cost(x:number,z:number){if(Math.abs(x)>this.width/2-.55||Math.abs(z)>this.depth/2-.55)return Infinity;return this.obstacles.some(o=>Math.abs(x-o.x)<o.halfX&&Math.abs(z-o.z)<o.halfZ)?Infinity:1;}
 private goal(x:number,z:number){const ix=Math.round(x),iz=Math.round(z);let best:Point|null=null,distance=Infinity;for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const px=ix+dx,pz=iz+dz,d=Math.hypot(px-x,pz-z);if(d<distance&&Number.isFinite(this.cost(px,pz))){distance=d;best={x:px,z:pz};}}return best;}
 private routeTo(target:Point,exit=false){const p=this.position,start=this.goal(p.x,p.z),end=this.goal(target.x,target.z);if(!start||!end)return;const path=findPath(start,end,(x,z)=>this.cost(x,z));if(!path.length&&(start.x!==end.x||start.z!==end.z))return;if(Math.hypot(p.x-start.x,p.z-start.z)>.01)path.unshift(start);this.route=path;this.routeIndex=0;this.exitAfterRoute=exit;this.blockedTime=0;this.updateLine();}
 private updateLine(){
  const p=this.position,count=1+this.route.length-this.routeIndex;
  let positions=this.lineGeometry.getAttribute('position') as THREE.BufferAttribute|undefined;
  if(!positions||positions.count<count){
   // setFromPoints cannot resize an existing attribute; grow both buffers together.
   this.lineGeometry.dispose();const capacity=Math.max(2,2**Math.ceil(Math.log2(count)));
   positions=new THREE.BufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
   const distances=new THREE.BufferAttribute(new Float32Array(capacity),1).setUsage(THREE.DynamicDrawUsage);
   this.lineGeometry.setAttribute('position',positions);this.lineGeometry.setAttribute('lineDistance',distances);
  }
  positions.setXYZ(0,p.x,.13,p.z);
  for(let i=1;i<count;i++){const point=this.route[this.routeIndex+i-1];positions.setXYZ(i,point.x,.13,point.z);}
  positions.needsUpdate=true;this.lineGeometry.setDrawRange(0,count);this.line.visible=count>1;
  this.destination.visible=count>1;if(this.destination.visible){const end=this.route[this.route.length-1];this.destination.position.set(end.x,.22,end.z);}
  this.updateLineDistances();
 }
 private updateLineDistances(){
  const positions=this.lineGeometry.getAttribute('position') as THREE.BufferAttribute,distances=this.lineGeometry.getAttribute('lineDistance') as THREE.BufferAttribute,count=this.lineGeometry.drawRange.count;
  let distance=0;distances.setX(0,0);
  for(let i=1;i<count;i++){distance+=Math.hypot(positions.getX(i)-positions.getX(i-1),positions.getZ(i)-positions.getZ(i-1));distances.setX(i,distance);}
  distances.needsUpdate=true;
 }
 click(event:MouseEvent,camera:THREE.Camera,canvas:HTMLCanvasElement){const rect=canvas.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);this.raycaster.setFromCamera(this.pointer,camera);for(const t of this.terminals)if(this.raycaster.intersectObject(t.root,true).length){const p=this.position,dx=p.x-t.x,dz=p.z-t.z,len=Math.hypot(dx,dz)||1;this.routeTo({x:t.x+dx/len*1.7,z:t.z+dz/len*1.7});return false;}const hit=this.raycaster.intersectObject(this.floor)[0];if(!hit)return false;const exit=Math.abs(hit.point.x)<1.3&&hit.point.z>this.depth/2-1.7;this.routeTo(exit?this.exit:{x:hit.point.x,z:hit.point.z},exit);return false;}
 useExit(){if(this.nearExit&&this.canExit)this.requestedExit=true;}
 stopMoving(){this.route=[];this.routeIndex=0;this.exitAfterRoute=false;this.dashTime=0;this.updateLine();}
 tryDash(heading:number){if(!this.abilities.charges)return;const p=this.position,target=this.route[this.routeIndex];this.direction.set(target?target.x-p.x:Math.sin(heading),0,target?target.z-p.z:Math.cos(heading)).normalize();if(this.direction.lengthSq()<.01)return;this.dashFollowing=!!target;this.dashTime=.22;this.abilities.useDash();this.pulse=1;}
 update(dt:number,running=false):ShopStep{
  if(!this.state.robberyStarted&&this.refreshState()){this.alarm=false;this.refreshGuards();this.updateTerminalMarkers();}
  this.elapsed+=dt;this.hazardCooldown=Math.max(0,this.hazardCooldown-dt);const before=this.position;
  const previousIndex=this.routeIndex;while(this.routeIndex<this.route.length&&Math.hypot(this.route[this.routeIndex].x-before.x,this.route[this.routeIndex].z-before.z)<.05)this.routeIndex++;
  this.dashTime=Math.max(0,this.dashTime-dt);this.pulse=THREE.MathUtils.damp(this.pulse,0,9,dt);if(this.dashFollowing&&this.routeIndex>=this.route.length)this.dashTime=0;
  const target=this.route[this.routeIndex],movement=new THREE.Vector3();if(target){const dx=target.x-before.x,dz=target.z-before.z,d=Math.hypot(dx,dz);if(d>0){this.direction.set(dx,0,dz).normalize();movement.copy(this.direction).multiplyScalar(Math.min(d,dt*(this.dashTime>0?17:running?this.abilities.runSpeed:4.5)));}}else if(this.dashTime>0&&!this.exitAfterRoute)movement.copy(this.direction).multiplyScalar(dt*17);
  if(!Number.isFinite(this.cost(before.x+movement.x,before.z+movement.z)))movement.set(0,0,0);this.controller.computeColliderMovement(this.collider,movement);const delta=this.controller.computedMovement();if(movement.length()>.001&&Math.hypot(delta.x,delta.z)<movement.length()*.15){this.blockedTime+=dt;if(this.blockedTime>.75)this.stopMoving();}else this.blockedTime=0;
  this.player.setNextKinematicTranslation({x:before.x+delta.x,y:1,z:before.z+delta.z});this.physics.timestep=Math.max(.001,dt);this.physics.step();const p=this.position;
  for(const laser of this.lasers){const active=(this.elapsed+laser.phase)%4<2;laser.mesh.visible=active;if(active&&this.hazardCooldown<=0&&(crossed(before.x,before.z,p.x,p.z,laser.x1,laser.z1,laser.x2,laser.z2)||nearLaser(p.x,p.z,laser))){this.beginAlarm();this.pendingLaserDamage+=12;this.hazardCooldown=1;}}
  for(const guard of this.guards)this.updateGuard(guard,p,dt);
  this.updateBossCash(dt,p);
  if(this.exitAfterRoute&&this.routeIndex>=this.route.length&&this.nearExit){if(this.canExit)this.requestedExit=true;else this.exitAfterRoute=false;}if(!this.canExit)this.requestedExit=false;if(this.routeIndex!==previousIndex)this.updateLine();else if(this.line.visible){const position=this.lineGeometry.getAttribute('position') as THREE.BufferAttribute;position.setXYZ(0,p.x,.13,p.z);position.needsUpdate=true;this.updateLineDistances();}return {x:p.x,z:p.z,dx:delta.x,dz:delta.z,running:this.dashTime>0||(running&&this.abilities.levels.run>0&&Math.hypot(delta.x,delta.z)>.01),pulse:this.pulse,exit:this.requestedExit};
 }
 policeMarkers(){return this.guards.filter(g=>!g.dead).map(g=>({x:g.x,z:g.z,kind:'person'}));}
 updateWalls(yaw:number){const dx=Math.sin(yaw),dz=Math.cos(yaw);for(const wall of this.walls)wall.mesh.visible=wall.x*dx+wall.z*dz<=.05;}
 dispose(){for(const guard of this.guards){this.scene.remove(guard.visual.root);guard.visual.dispose();}for(const item of this.owned)item.dispose();this.physics.free();}
}
