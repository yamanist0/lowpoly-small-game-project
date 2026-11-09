import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import vehiclesUrl from '../assets/vehicles/All vehicles preview.fbx?url';
import peopleUrl from '../assets/people/source/people_freePack_webGl_ani.fbx?url';
import peoplePaletteUrl from '../assets/people/textures/people_pal.png?url';
import familyPaletteUrl from '../assets/people/textures/people_pal_s20.png?url';
import happyUrl from '../assets/kenney_emotes-pack/PNG/Vector/Style 1/emote_faceHappy.png?url';
import laughUrl from '../assets/kenney_emotes-pack/PNG/Vector/Style 1/emote_laugh.png?url';
import heartUrl from '../assets/kenney_emotes-pack/PNG/Vector/Style 1/emote_heart.png?url';
import musicUrl from '../assets/kenney_emotes-pack/PNG/Vector/Style 1/emote_music.png?url';
import { clearSegment, type CombatResult, type CombatTarget } from './combat';

export type Node = {x:number; z:number};
export type RagdollBuilding={id:string;x:number;y:number;z:number;halfX:number;halfY:number;halfZ:number};
type GardenTarget={road:Node;x:number;z:number};
type Kind = 'car'|'person';
type PersonState = 'walk'|'talk'|'enter'|'inside'|'exit'|'gardenEnter'|'garden'|'gardenWalk'|'gardenTalk'|'gardenExit';
type Visual = {root:THREE.Group; mixer?:THREE.AnimationMixer; left?:THREE.Bone; right?:THREE.Bone; emote?:THREE.Sprite};
type Agent = {
 id:string; kind:Kind; variant:number; node:Node; next:Node|null; previous:Node|null;
 progress:number; seed:number; steps:number; visual:Visual|null; bucket:string;
 mode:PersonState; timer:number; cooldown:number; door:Node|null; partner:string|null;
 x:number;z:number;heading:number; origin:Node; returning:boolean; startX:number;startZ:number;goalX:number;goalZ:number; gardenGoal:GardenTarget|null; gardenHome:GardenTarget|null; visitAfterStep:number;
 health?:number;
};
export type WorldHooks = {
 isRoad:(x:number,z:number)=>boolean; isUrban:(x:number,z:number)=>boolean; isGarden:(x:number,z:number)=>boolean;
 isPlayable:(x:number,z:number)=>boolean; isHome:(x:number,z:number)=>boolean; roadHeight:(x:number,z:number)=>number;
 ragdollBuildings:(x:number,z:number,radius:number)=>RagdollBuilding[];
 roundabout:(x:number,z:number)=>Node|null; garden:(x:number,z:number,seed:number)=>GardenTarget|null;
};
const directions:Node[]=[{x:1,z:0},{x:0,z:1},{x:-1,z:0},{x:0,z:-1}];
const tileSize=4,chunkTiles=8;
const crewMarkerGeometry=new THREE.ConeGeometry(.16,.3,6),guardMarkerMaterial=new THREE.MeshBasicMaterial({color:0x47d7ff}),thiefMarkerMaterial=new THREE.MeshBasicMaterial({color:0xffc95e});
const key=(p:Node)=>`${p.x},${p.z}`;
const equal=(a:Node,b:Node)=>a.x===b.x&&a.z===b.z;
function hash(x:number,z:number,seed:number){let v=Math.imul(x,374761393)+Math.imul(z,668265263)+Math.imul(seed,1442695041);v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967296;}
function bucketAt(p:Node){return `${Math.floor((p.x+.5)/chunkTiles)},${Math.floor((p.z+.5)/chunkTiles)}`;}
export function neighbours(node:Node,isRoad:WorldHooks['isRoad']){return directions.map(d=>({x:node.x+d.x,z:node.z+d.z})).filter(p=>isRoad(p.x,p.z));}
export function chooseRoad(node:Node,previous:Node|null,isRoad:WorldHooks['isRoad'],choice:number):Node|null {
 let options=neighbours(node,isRoad);if(!options.length)return null;
 const nonBack=previous?options.filter(p=>!equal(p,previous)):options;if(nonBack.length)options=nonBack;
 const straight=previous&&options.find(p=>p.x-node.x===node.x-previous.x&&p.z-node.z===node.z-previous.z);
 if(straight&&choice<.62)return straight;
 return options[Math.min(options.length-1,Math.floor(choice*options.length))];
}

type PersonTemplate={root:THREE.Group;clip:THREE.AnimationClip|null;left:string|null;right:string|null;police:boolean};
export type ShopCustomerVisual={
 root:THREE.Group;
 update:(x:number,z:number,vx:number,vz:number,dt:number)=>void;
 dispose:()=>void;
};
async function loadModels(){
 const textures=new THREE.TextureLoader();const [palette,familyPalette]=await Promise.all([textures.loadAsync(peoplePaletteUrl),textures.loadAsync(familyPaletteUrl)]);
 palette.colorSpace=familyPalette.colorSpace=THREE.SRGBColorSpace;
 const emoteTextures=await Promise.all([happyUrl,laughUrl,heartUrl,musicUrl].map(url=>textures.loadAsync(url)));
 const emotes=emoteTextures.map(map=>{map.colorSpace=THREE.SRGBColorSpace;return new THREE.SpriteMaterial({map,transparent:true,depthWrite:false});});
 // The FBX embeds a palette as a blob. The identical, user-supplied texture
 // files are used explicitly so no external asset is fetched.
 const manager=new THREE.LoadingManager();
 const handler={setPath(){return this;},load(){return palette;}};
 manager.addHandler(/\.(png|jpe?g)$/i,handler as unknown as THREE.Loader);
 const [vehicleSource,peopleSource]=await Promise.all([new FBXLoader().loadAsync(vehiclesUrl),new FBXLoader(manager).loadAsync(peopleUrl)]);
 vehicleSource.updateMatrixWorld(true);peopleSource.updateMatrixWorld(true);
 const carModels:THREE.Group[]=[],carNames:string[]=[];
 for(const name of ['Sedan','Hatchback','Taxi','SUV','Pickup','Van','Police_Sedan']){
  const parts=vehicleSource.children.filter(o=>o.name===name||o.name.startsWith(name+'_wheel_'));
  if(!parts.some(p=>p.name===name))continue;
  const model=new THREE.Group();for(const part of parts){const copy=part.clone();copy.matrix.copy(part.matrixWorld);copy.matrixAutoUpdate=false;copy.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});model.add(copy);}
  const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),dim=box.getSize(new THREE.Vector3());
  model.position.set(-center.x,-box.min.y,-center.z);const wrapper=new THREE.Group();wrapper.add(model);wrapper.scale.setScalar(2.6/Math.max(dim.x,dim.z));carModels.push(wrapper);carNames.push(name);
 }
 const people:PersonTemplate[]=[];
 const variants=[['casual_Female_G','rig_CharRoot'],['casual_Female_K_','rig_CharRoot001'],['casual_Male_G','rig_CharRoot002'],['casual_Male_K','rig_CharRoot003'],['Doctor_Male_B','rig_CharRoot004'],['elder_Female_A','rig_CharRoot005'],['little_boy_B','rig_CharRoot006'],['police_Female_A','rig_CharRoot007']];
 for(const [meshName,rigName] of variants){
  const clone=cloneSkeleton(peopleSource) as THREE.Group;
  const mesh=clone.getObjectByName(meshName) as THREE.SkinnedMesh|undefined,rig=clone.getObjectByName(rigName);
  if(!mesh||!rig)continue;
  for(const child of [...clone.children])if(child!==mesh&&child!==rig)clone.remove(child);
  const material=(m:THREE.Material)=>{const mat=m.clone() as THREE.MeshStandardMaterial;mat.map=m.name.includes('Fam')?familyPalette:palette;mat.color.set(0xffffff);mat.needsUpdate=true;return mat;};
  mesh.material=Array.isArray(mesh.material)?mesh.material.map(material):material(mesh.material);
  mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;clone.updateMatrixWorld(true);
  // The FBX characters are posed at an angle in the source scene. Derive
  // their forward direction from both feet instead of assuming +Z.
  const feet=['R','L'].map(side=>{const foot=mesh.skeleton.bones.find(b=>new RegExp(`bip_${side}_Foot`, 'i').test(b.name));const toe=mesh.skeleton.bones.find(b=>new RegExp(`bip_${side}_Toe0`, 'i').test(b.name));return foot&&toe?toe.getWorldPosition(new THREE.Vector3()).sub(foot.getWorldPosition(new THREE.Vector3())):new THREE.Vector3();});
  const forward=feet[0].add(feet[1]);const sourceHeading=Math.atan2(forward.x,forward.z);
  const bounds=new THREE.Box3().setFromObject(mesh),center=bounds.getCenter(new THREE.Vector3()),dim=bounds.getSize(new THREE.Vector3());
  if(!Number.isFinite(dim.y)||dim.y<.01)continue;
  const scale=(meshName==='little_boy_B'?1.05:1.45)/dim.y;clone.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);clone.scale.setScalar(scale);
  const wrapper=new THREE.Group();wrapper.add(clone);
  const boneNames=new Set(mesh.skeleton.bones.map(b=>b.name));boneNames.add(rigName);
  const original=peopleSource.animations[0];const tracks=original?.tracks.filter(t=>boneNames.has(t.name.split('.')[0]))??[];
  const clip=original&&tracks.length?new THREE.AnimationClip('supplied_idle',original.duration,tracks):null;
  const left=mesh.skeleton.bones.find(b=>/L_Thigh/i.test(b.name))?.name??null;
  const right=mesh.skeleton.bones.find(b=>/R_Thigh/i.test(b.name))?.name??null;
  wrapper.rotation.y=-sourceHeading;const oriented=new THREE.Group();oriented.add(wrapper);
  people.push({root:oriented,clip,left,right,police:meshName.startsWith('police_')});
 }
 if(!carModels.length||!people.length)throw new Error('Araç veya insan modelleri yüklenemedi.');
 return {carModels,carNames,people,emotes};
}

export class CityAgents {
 private readonly cars:THREE.Group[];private readonly carNames:string[];private readonly people:PersonTemplate[];private readonly emotes:THREE.SpriteMaterial[];
 private readonly all=new Map<string,Agent>();private readonly buckets=new Map<string,Set<Agent>>();
 private readonly active=new Set<Agent>();private readonly spawned=new Set<string>();private readonly loaded=new Set<string>();
 private readonly reserved=new Map<string,string>();private clock=0;
 private readonly physics=new RAPIER.World({x:0,y:-9.81,z:0});
 private readonly events=new RAPIER.EventQueue(true);
 private readonly sensors=new Map<Agent,{body:RAPIER.RigidBody;collider:RAPIER.Collider}>();
 private readonly sensorOwners=new Map<number,Agent>();
 private readonly ragdolls=new Map<Agent,{parts:RAPIER.RigidBody[];ground:RAPIER.RigidBody;buildings:string[];timer:number;dead:boolean;blood?:THREE.Mesh;settled?:boolean}>();
 private readonly ragdollBuildings=new Map<string,{body:RAPIER.RigidBody;references:number}>();
 private readonly impactCooldown=new Map<Agent,number>();
 private playerAgent:Agent|null=null;
 private readonly carBodies=new Map<Agent,RAPIER.RigidBody>();
 private readonly carSpeeds=new Map<Agent,number>();
 private bloodMaterial:THREE.MeshBasicMaterial|null=null;
 private readonly carImpactPause=new Map<Agent,number>();
 private readonly hitReactions=new Map<Agent,{x:number;z:number;time:number}>();
 private readonly bloodDrops:THREE.Mesh[]=[];
 private readonly fleeing=new Map<Agent,{threatX:number;threatZ:number;time:number;car?:Agent}>();
 private readonly outsideCashiers=new Map<Agent,{fire:number;onRemove:(dead:boolean)=>void}>();private readonly cashierShots:THREE.Vector3[]=[];
 private readonly escapingCars=new Map<Agent,{driver:Agent;threatX:number;threatZ:number;time:number}>();
 private readonly response=new Set<Agent>();
 private readonly crew=new Map<Agent,{role:'guard'|'thief';fire:number;escape:number}>();
 private readonly crewShots:{start:THREE.Vector3;end:THREE.Vector3}[]=[];
 // Nearby representatives are capped for performance; the economy retains every hire.
 syncCrew(guards:number,thieves:number,x:number,z:number){
  for(const a of this.crew.keys())if(!this.all.has(a.id))this.crew.delete(a);
  for(const role of ['guard','thief'] as const){
   const count=Math.min(6,Math.max(0,Math.floor(role==='guard'?guards:thieves)));
   const existing=[...this.crew].filter(([a,c])=>c.role===role&&this.all.has(a.id));
   for(const [a] of existing.slice(0,count)){if(!this.ragdolls.has(a)&&(Math.hypot(a.x-x,a.z-z)>40||!a.visual)){a.x=x+3;a.z=z+3;this.moveBucket(a);if(!a.visual)this.activate(a);}}
   for(const [a] of existing.slice(count)){this.crew.delete(a);this.deactivate(a);this.buckets.get(a.bucket)?.delete(a);this.all.delete(a.id);}
   for(let i=existing.length;i<count;i++){
    const angle=i*2.4+(role==='thief'?1:0),px=x+Math.cos(angle)*3,pz=z+Math.sin(angle)*3,node={x:Math.round(px/tileSize),z:Math.round(pz/tileSize)},bucket=bucketAt(node),id=`crew:${this.responseSerial++}`;
    const a:Agent={id,kind:'person',variant:role==='guard'?2:3,node,next:null,previous:null,progress:0,seed:this.responseSerial,steps:0,visual:null,bucket,mode:'walk',timer:0,cooldown:0,door:null,partner:null,x:px,z:pz,heading:0,origin:{...node},returning:false,startX:px,startZ:pz,goalX:px,goalZ:pz,gardenGoal:null,gardenHome:null,visitAfterStep:0};
    this.all.set(id,a);this.addToBucket(a,bucket);this.crew.set(a,{role,fire:2+i,escape:0});this.activate(a);
   }
  }
 }
 takeCrewShots(){return this.crewShots.splice(0);}
 private updateCrew(a:Agent,dt:number){
  const crew=this.crew.get(a),player=this.playerAgent;if(!crew||!player||!a.visual)return;
  crew.fire-=dt;crew.escape=Math.max(0,crew.escape-dt);
  let targetX=player.x,targetZ=player.z,stop=3;
  const officers=[...this.response].filter(p=>p.kind==='person'&&p.visual&&!this.ragdolls.has(p));
  const target=crew.role==='guard'?officers.sort((p,q)=>Math.hypot(p.x-a.x,p.z-a.z)-Math.hypot(q.x-a.x,q.z-a.z))[0]:undefined;
  if(target&&Math.hypot(target.x-a.x,target.z-a.z)<20){targetX=target.x;targetZ=target.z;stop=9;
   const obstacles=this.world.ragdollBuildings(a.x,a.z,22);
   if(crew.fire<=0&&clearSegment(a.x,a.z,target.x,target.z,obstacles)){
    crew.fire=1.5;const start=new THREE.Vector3(a.x,this.world.roadHeight(a.x/tileSize,a.z/tileSize)+1,a.z),end=new THREE.Vector3(target.x,this.world.roadHeight(target.x/tileSize,target.z/tileSize)+1,target.z);
    this.crewShots.push({start,end});this.damageTarget(target.id,35,target.x-a.x,target.z-a.z,1.2);
   }
  } else if(crew.role==='thief'){
   const victim=[...this.active].find(p=>p!==a&&p.kind==='person'&&!this.crew.has(p)&&!this.response.has(p)&&!this.people[p.variant%this.people.length].police&&!this.ragdolls.has(p)&&p.mode!=='inside'&&Math.hypot(p.x-a.x,p.z-a.z)<8);
   if(victim&&crew.fire<=0&&crew.escape<=0){targetX=victim.x;targetZ=victim.z;stop=1;if(Math.hypot(targetX-a.x,targetZ-a.z)<1.4){this.knockDown(victim,victim.x-a.x,victim.z-a.z,false,1.5,true);crew.fire=18;crew.escape=4;}}
   else {const phase=this.clock*.3+a.seed;targetX=player.x+Math.cos(phase)*(crew.escape?12:6);targetZ=player.z+Math.sin(phase)*(crew.escape?12:6);stop=1;}
  }
  const dx=targetX-a.x,dz=targetZ-a.z,d=Math.hypot(dx,dz);if(d>stop){const heading=Math.atan2(dx,dz),obstacles=this.world.ragdollBuildings(a.x,a.z,5);for(const turn of [0,.7,-.7,1.4,-1.4]){const angle=heading+turn,step=dt*(crew.escape?4.4:2.8),nx=a.x+Math.sin(angle)*step,nz=a.z+Math.cos(angle)*step;if(this.world.isPlayable(nx/tileSize,nz/tileSize)&&!obstacles.some(b=>Math.abs(nx-b.x)<b.halfX+.35&&Math.abs(nz-b.z)<b.halfZ+.35)){a.x=nx;a.z=nz;a.heading=angle;break;}}}else if(target)a.heading=Math.atan2(dx,dz);
  this.moveBucket(a);this.render(a,dt);
 }

 private responseSerial=0;
 private driven:Agent|null=null;
 private readonly parked=new Set<Agent>();
 private readonly carImpulses=new Map<Agent,{x:number;z:number}>();
 impactCar(handle:number,vx:number,vz:number){for(const [a,body] of this.carBodies){if(body.numColliders()&&body.collider(0).handle===handle){const old=this.carImpulses.get(a);if(!old||Math.hypot(old.x,old.z)<Math.hypot(vx,vz)*.5)this.carImpulses.set(a,{x:vx*.5,z:vz*.5});break;}}}
 stealCar(x:number,z:number){
  const car=[...this.active].filter(a=>a.kind==='car'&&!this.response.has(a)&&Math.hypot(a.x-x,a.z-z)<4).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0];if(!car)return null;
  if(car.next&&this.reserved.get(key(car.next))===car.id)this.reserved.delete(key(car.next));car.next=null;this.driven=car;
  const hadDriver=!this.parked.delete(car);
  const body=this.carBodies.get(car);if(body)this.playerWorld.removeRigidBody(body);this.carBodies.delete(car);
  this.sensors.get(this.playerAgent!)?.collider.setEnabled(false);
  const node={x:Math.round(car.x/tileSize),z:Math.round(car.z/tileSize)},bucket=bucketAt(node),id=`driver:${this.responseSerial++}`,side=car.heading+Math.PI/2;
  const a:Agent={id,kind:'person',variant:2,node,next:null,previous:null,progress:0,seed:this.responseSerial,steps:0,visual:null,bucket,mode:'walk',timer:0,cooldown:8,door:null,partner:null,x:car.x+Math.sin(side)*1.4,z:car.z+Math.cos(side)*1.4,heading:side,origin:{...node},returning:false,startX:car.x,startZ:car.z,goalX:0,goalZ:0,gardenGoal:null,gardenHome:null,visitAfterStep:0};
  if(hadDriver){this.all.set(id,a);this.addToBucket(a,bucket);this.activate(a);this.knockDown(a,Math.sin(side),Math.cos(side),false,1.6,true);}
  return {x:car.x,z:car.z,heading:car.heading};
 }
 driveCar(x:number,z:number,heading:number){const a=this.driven;if(!a)return;a.x=x;a.z=z;a.heading=heading;this.moveBucket(a);this.render(a,0);}
 leaveCar(){const a=this.driven;if(!a)return;this.driven=null;this.parked.add(a);a.node={x:Math.round(a.x/tileSize),z:Math.round(a.z/tileSize)};a.next=null;a.progress=0;a.startX=a.x;a.startZ=a.z;
  const y=this.world.roadHeight(a.x/tileSize,a.z/tileSize),body=this.playerWorld.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(a.x,y+.7,a.z));this.playerWorld.createCollider(RAPIER.ColliderDesc.cuboid(.8,.65,1.25).setCollisionGroups(0x00020004),body);this.carBodies.set(a,body);this.sensors.get(this.playerAgent!)?.collider.setEnabled(true);
 }
 isDriving(){return !!this.driven;}

 policeMarkers(){return [...this.active].filter(a=>a.visual&&a.mode!=='inside'&&!this.ragdolls.has(a)&&(a.kind==='car'?this.carNames[a.variant%this.carNames.length]==='Police_Sedan':this.people[a.variant%this.people.length].police)).map(a=>({x:a.x,z:a.z,kind:a.kind}));}
 dispatchPolice(x:number,z:number,level:number){
  const living=[...this.response].filter(a=>this.all.has(a.id)&&!this.ragdolls.has(a));
  for(const kind of ['person','car'] as Kind[]){
   const target=kind==='person'?level+1:Math.ceil(level/2);
   let count=living.filter(a=>a.kind===kind).length;
   while(count<target){
    const variant=kind==='person'?this.people.findIndex(p=>p.police):this.carNames.indexOf('Police_Sedan');if(variant<0)break;
    const angle=(this.responseSerial*2.4),distance=24+(this.responseSerial%3)*5;let node:Node|null=null;
    const tx=Math.round((x+Math.cos(angle)*distance)/tileSize),tz=Math.round((z+Math.sin(angle)*distance)/tileSize);
    for(let r=0;r<12&&!node;r++)for(let dx=-r;dx<=r&&!node;dx++)for(let dz=-r;dz<=r;dz++)if(this.world.isRoad(tx+dx,tz+dz)){node={x:tx+dx,z:tz+dz};break;}
    if(!node)break;
    const id=`response:${this.responseSerial++}`,bucket=bucketAt(node),a:Agent={id,kind,variant,node,next:null,previous:null,progress:0,seed:this.responseSerial,steps:0,visual:null,bucket,mode:'walk',timer:0,cooldown:20,door:null,partner:null,x:node.x*tileSize,z:node.z*tileSize,heading:0,origin:{...node},returning:false,startX:node.x*tileSize,startZ:node.z*tileSize,goalX:0,goalZ:0,gardenGoal:null,gardenHome:null,visitAfterStep:0};
    this.all.set(id,a);this.addToBucket(a,bucket);this.response.add(a);this.activate(a);count++;
   }
  }
 }
 clearPoliceResponse(){for(const a of this.response){this.deactivate(a);this.buckets.get(a.bucket)?.delete(a);this.all.delete(a.id);}this.response.clear();}
 updatePolice(dt:number,x:number,z:number,chase:boolean){
  for(const a of this.response){if(!a.visual||this.ragdolls.has(a))continue;
   const phase=this.clock*.28+a.seed*2.4,tx=chase?x:x+Math.cos(phase)*13,tz=chase?z:z+Math.sin(phase)*13,dx=tx-a.x,dz=tz-a.z,d=Math.hypot(dx,dz);
   if(d>(chase?8:2)){const heading=Math.atan2(dx,dz),obstacles=this.world.ragdollBuildings(a.x,a.z,5);for(const turn of [0,.6,-.6,1.2,-1.2]){const angle=heading+turn,step=dt*(a.kind==='car'?7:3.2),nx=a.x+Math.sin(angle)*step,nz=a.z+Math.cos(angle)*step;if(this.world.isPlayable(nx/tileSize,nz/tileSize)&&!obstacles.some(b=>Math.abs(nx-b.x)<b.halfX+.6&&Math.abs(nz-b.z)<b.halfZ+.6)){a.x=nx;a.z=nz;a.heading=angle;break;}}}else a.heading=Math.atan2(dx,dz);
   this.moveBucket(a);this.render(a,dt);
  }
 }
 private constructor(private readonly scene:THREE.Scene,private readonly world:WorldHooks,private readonly playerWorld:RAPIER.World,models:Awaited<ReturnType<typeof loadModels>>){this.cars=models.carModels;this.carNames=models.carNames;this.people=models.people;this.emotes=models.emotes;}
 static async create(scene:THREE.Scene,world:WorldHooks,playerWorld:RAPIER.World){return new CityAgents(scene,world,playerWorld,await loadModels());}
 setBloodTexture(source:HTMLImageElement){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return;
  const tile=document.createElement('canvas');tile.width=256;tile.height=128;const tileCtx=tile.getContext('2d');if(!tileCtx)return;
  tileCtx.drawImage(source,512,128,256,128,0,0,256,128);
  ctx.setTransform(.5,-.5,1,1,-64,64);ctx.drawImage(tile,0,0);ctx.setTransform(1,0,0,1,0,0);const pixels=ctx.getImageData(0,0,128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
   const i=(y*128+x)*4,dx=(x-64)/56,dz=(y-64)/48,angle=Math.atan2(dz,dx),radius=Math.hypot(dx,dz),edge=.83+.09*Math.sin(angle*5)+.06*Math.sin(angle*9+1);
   pixels.data[i+3]=Math.round(pixels.data[i+3]*.83*THREE.MathUtils.clamp((edge-radius)*12,0,1));
  }
  ctx.putImageData(pixels,0,0);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  this.bloodMaterial=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,side:THREE.DoubleSide});
 }
 registerPlayer(root:THREE.Group,x:number,z:number,left?:THREE.Bone,right?:THREE.Bone){
  const agent={id:'player',kind:'person',x,z,heading:0,mode:'walk',visual:{root,left,right},cooldown:0,partner:null,gardenHome:null} as Agent;
  this.playerAgent=agent;this.createSensor(agent);
 }
 setPlayerPosition(x:number,z:number){if(this.playerAgent&&!this.ragdolls.has(this.playerAgent)){this.playerAgent.x=x;this.playerAgent.z=z;}}
 playerRagdoll(){return this.playerAgent?this.ragdolls.has(this.playerAgent):false;}
 playerPosition(){return this.playerAgent?{x:this.playerAgent.x,z:this.playerAgent.z}:null;}
 getBloodMaterial(){return this.bloodMaterial;}
 releaseCashier(x:number,z:number,cashier:{root:THREE.Group;health:number;onRemove:(dead:boolean)=>void}){
  const node={x:Math.round(x/tileSize),z:Math.round(z/tileSize)},bucket=bucketAt(node),id=`cashier:${this.responseSerial++}`;
  const a:Agent={id,kind:'person',variant:0,node,next:null,previous:null,progress:0,seed:this.responseSerial,steps:0,visual:{root:cashier.root},bucket,mode:'walk',timer:0,cooldown:0,door:null,partner:null,x,z,heading:0,origin:{...node},returning:false,startX:x,startZ:z,goalX:x,goalZ:z,gardenGoal:null,gardenHome:null,visitAfterStep:0,health:cashier.health};
  this.all.set(id,a);this.addToBucket(a,bucket);this.outsideCashiers.set(a,{fire:1.2,onRemove:cashier.onRemove});this.active.add(a);this.scene.add(cashier.root);this.createSensor(a);this.render(a,0);
 }
 takeOutsideCashierShots(){return this.cashierShots.splice(0);}
 combatTargets():CombatTarget[]{
  const targets:CombatTarget[]=[];
  for(const a of this.active){
   if(!a.visual||a.mode==='inside'||a===this.driven)continue;
   const rag=this.ragdolls.get(a),p=rag?.dead?rag.parts[0].translation():null,y=this.world.roadHeight(a.x/tileSize,a.z/tileSize);
   targets.push({id:a.id,kind:a.kind,police:a.kind==='car'?this.carNames[a.variant%this.carNames.length]==='Police_Sedan':this.people[a.variant%this.people.length].police,position:new THREE.Vector3(p?.x??a.x,p?.y??(y+.8),p?.z??a.z),radius:a.kind==='car'?1.3:.8});
  }
  return targets;
 }
 damageTarget(id:string,damage:number,dx:number,dz:number,flight:number):CombatResult|null{
  const a=this.all.get(id);if(!a||!a.visual)return null;
  const corpse=this.ragdolls.get(a);if(corpse?.dead){if(corpse.blood){const scale=Math.min(3,corpse.blood.scale.x*1.16);corpse.blood.scale.set(scale,1,scale);}return {killed:false,kind:'person',police:false,position:new THREE.Vector3(a.x,this.world.roadHeight(a.x/tileSize,a.z/tileSize)+.3,a.z)};}
  const police=a.kind==='car'?this.carNames[a.variant%this.carNames.length]==='Police_Sedan':this.people[a.variant%this.people.length].police;
  a.health=(a.health??(a.kind==='car'?220:100))-damage;
  const position=new THREE.Vector3(a.x,this.world.roadHeight(a.x/tileSize,a.z/tileSize)+(a.kind==='car'?.8:.8),a.z);
  if(a.kind==='person')this.dropBlood(a.x,a.z);
  if(a.health>0){if(a.kind==='person'){const length=Math.hypot(dx,dz)||1;this.hitReactions.set(a,{x:dx/length,z:dz/length,time:.35});}return {killed:false,kind:a.kind,police,position};}
  const cashier=this.outsideCashiers.get(a);if(cashier){this.outsideCashiers.delete(a);cashier.onRemove(true);}
  this.hitReactions.delete(a);
  if(a.kind==='person'){
   if(this.ragdolls.has(a))this.removeRagdoll(a);
   this.fleeing.delete(a);this.knockDown(a,dx,dz,true,flight,true);
  }else{
   this.deactivate(a);this.buckets.get(a.bucket)?.delete(a);this.all.delete(a.id);this.parked.delete(a);
  }
  return {killed:true,kind:a.kind,police,position};
 }
 private dropBlood(x:number,z:number){
  if(!this.bloodMaterial)return;const geometry=new THREE.PlaneGeometry(.65,.65,4,4);geometry.rotateX(-Math.PI/2);const mesh=new THREE.Mesh(geometry,this.bloodMaterial),attr=geometry.getAttribute('position') as THREE.BufferAttribute;
  mesh.position.set(x,0,z);for(let i=0;i<attr.count;i++)attr.setY(i,this.world.roadHeight((x+attr.getX(i))/tileSize,(z+attr.getZ(i))/tileSize)+.2);attr.needsUpdate=true;mesh.renderOrder=2;this.scene.add(mesh);this.bloodDrops.push(mesh);
  if(this.bloodDrops.length>100){const old=this.bloodDrops.shift()!;this.scene.remove(old);old.geometry.dispose();}
 }
 frighten(x:number,z:number){
  for(const a of this.active){if(a.kind!=='person'||this.crew.has(a)||this.people[a.variant%this.people.length].police||!a.visual||a.mode==='inside'||this.ragdolls.has(a)||Math.hypot(a.x-x,a.z-z)>20)continue;
   const current=this.fleeing.get(a);if(current){current.threatX=x;current.threatZ=z;current.time=5;continue;}
   const car=[...this.active].find(b=>b.kind==='car'&&!this.parked.has(b)&&!this.escapingCars.has(b)&&![...this.fleeing.values()].some(f=>f.car===b)&&Math.hypot(a.x-b.x,a.z-b.z)<4);
   this.fleeing.set(a,{threatX:x,threatZ:z,time:5,car});a.partner=null;a.mode='walk';a.next=null;
  }
 }
 createShopCustomer(variant:number):ShopCustomerVisual{
  const choices=[0,1,3,5,6];return this.createInteriorPerson(choices[variant%choices.length]%this.people.length,variant);
 }
 createPoliceVisual():ShopCustomerVisual{
  const index=this.people.findIndex(p=>p.police);return this.createInteriorPerson(Math.max(0,index),0);
 }
 private createInteriorPerson(index:number,variant:number):ShopCustomerVisual{
  const template=this.people[index];
  const root=cloneSkeleton(template.root) as THREE.Group;
  const mixer=template.clip?new THREE.AnimationMixer(root):undefined;
  if(mixer&&template.clip)mixer.clipAction(template.clip).play();
  const left=template.left?root.getObjectByName(template.left) as THREE.Bone|undefined:undefined;
  const right=template.right?root.getObjectByName(template.right) as THREE.Bone|undefined:undefined;
  const leftRest=left?.quaternion.clone(),rightRest=right?.quaternion.clone();
  const axis=new THREE.Vector3(0,0,1),rotation=new THREE.Quaternion();let phase=variant;
  return {root,update:(x,z,vx,vz,dt)=>{
   root.position.set(x,.09,z);
   if(left&&leftRest)left.quaternion.copy(leftRest);if(right&&rightRest)right.quaternion.copy(rightRest);
   mixer?.update(dt);
   if(Math.hypot(vx,vz)>.001){
    const heading=Math.atan2(vx,vz);root.rotation.y+=Math.atan2(Math.sin(heading-root.rotation.y),Math.cos(heading-root.rotation.y))*Math.min(1,dt*8);
    phase+=dt*8;const swing=Math.sin(phase)*.4;
    left?.quaternion.multiply(rotation.setFromAxisAngle(axis,swing));right?.quaternion.multiply(rotation.setFromAxisAngle(axis,-swing));
   }
  },dispose:()=>{mixer?.stopAllAction();mixer?.uncacheRoot(root);}};
 }
 createPlayer(){
  const template=this.people[Math.min(2,this.people.length-1)],root=cloneSkeleton(template.root) as THREE.Group;
  const mixer=template.clip?new THREE.AnimationMixer(root):undefined;if(mixer&&template.clip)mixer.clipAction(template.clip).play();
  const left=template.left?root.getObjectByName(template.left) as THREE.Bone|undefined:undefined;
  const right=template.right?root.getObjectByName(template.right) as THREE.Bone|undefined:undefined;
  const axis=new THREE.Vector3(0,0,1),rotation=new THREE.Quaternion();let phase=0;
  this.scene.add(root);
  return {
   root,left,right,
   update:(x:number,y:number,z:number,vx:number,vz:number,dt:number,running:boolean)=>{
    root.position.set(x,y+.09,z);mixer?.update(dt);
    if(Math.hypot(vx,vz)>.01){
     const target=Math.atan2(vx,vz);root.rotation.y+=Math.atan2(Math.sin(target-root.rotation.y),Math.cos(target-root.rotation.y))*Math.min(1,dt*12);
     phase+=dt*(running?13:8);const swing=Math.sin(phase)*(running?.64:.43);
     left?.quaternion.multiply(rotation.setFromAxisAngle(axis,swing));right?.quaternion.multiply(rotation.setFromAxisAngle(axis,-swing));
    }
   }
  };
 }

 loadChunk(cx:number,cz:number,roadTiles:Node[],gardens:GardenTarget[]=[]){
  const chunk=`${cx},${cz}`;this.loaded.add(chunk);
  if(!this.spawned.has(chunk)){
   this.spawned.add(chunk);
   const urban=roadTiles.filter(p=>this.world.isUrban(p.x,p.z));
   const ranked=(candidates:Node[],salt:number)=>[...candidates].sort((a,b)=>hash(a.x,a.z,salt)-hash(b.x,b.z,salt));
   const vehicleSpawns=ranked(roadTiles.filter(p=>!this.world.roundabout(p.x,p.z)),801).slice(0,urban.length?2:(hash(cx,cz,802)>.55?1:0));
   const peopleSpawns=ranked(urban,803).slice(0,3);
   for(const [kind,points] of [['car',vehicleSpawns],['person',peopleSpawns]] as [Kind,Node[]][]){
    points.forEach((node,i)=>{
     const id=`${chunk}:${kind}:${i}`,seed=Math.floor(hash(cx,cz,810+i+(kind==='car'?0:10))*1000000),bucket=bucketAt(node);
     const a:Agent={id,kind,variant:seed,node:{...node},next:null,previous:null,progress:0,seed,steps:0,visual:null,bucket,mode:'walk',timer:0,cooldown:8+hash(cx,cz,812+i)*15,door:null,partner:null,x:node.x*tileSize,z:node.z*tileSize,heading:0,origin:{...node},returning:false,startX:node.x*tileSize,startZ:node.z*tileSize,goalX:0,goalZ:0,gardenGoal:null,gardenHome:null,visitAfterStep:0};
     this.all.set(id,a);this.addToBucket(a,bucket);
    });
   }
   // Spread residents through the open centre of each garden, with a
   // minimum separation and staggered idle/conversation timers.
   for(const garden of gardens){
    const used:{x:number;z:number}[]=[];
    for(let i=0;i<12;i++){
     const seed=Math.floor(hash(garden.road.x,garden.road.z,920+i)*1000000);
     let x=garden.x,z=garden.z;
     for(let attempt=0;attempt<80;attempt++){
      x=garden.x+(hash(garden.road.x,garden.road.z,1100+i*163+attempt*2)*2-1)*3.2;
      z=garden.z+(hash(garden.road.x,garden.road.z,1101+i*163+attempt*2)*2-1)*3.2;
      if(used.every(p=>Math.hypot(p.x-x,p.z-z)>1.05))break;
     }
     used.push({x,z});const angle=hash(cx,cz,932+i)*Math.PI*2;
     const id=`garden:${garden.road.x},${garden.road.z}:${i}`,bucket=bucketAt({x:x/tileSize,z:z/tileSize});
     const a:Agent={id,kind:'person',variant:seed,node:{...garden.road},next:null,previous:null,progress:0,seed,steps:0,visual:null,bucket,mode:'garden',timer:3+hash(cx,cz,940+i)*9,cooldown:12+hash(cx,cz,970+i)*20,door:null,partner:null,x,z,heading:angle,origin:{...garden.road},returning:false,startX:x,startZ:z,goalX:x,goalZ:z,gardenGoal:garden,gardenHome:garden,visitAfterStep:0};
     this.all.set(id,a);this.addToBucket(a,bucket);
    }
   }
  }

 }
 unloadChunk(cx:number,cz:number){const chunk=`${cx},${cz}`;this.loaded.delete(chunk);for(const a of this.buckets.get(chunk)??[])this.deactivate(a);}
 // Keep only agents intersecting the actual camera frustum alive. Stored
 // records outside it are dormant and resume when that area becomes visible.
 syncVisibility(camera:THREE.Camera){
  camera.updateMatrixWorld();const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const sphere=new THREE.Sphere(new THREE.Vector3(),2.2);let activations=0;
  for(const chunk of this.loaded)for(const a of this.buckets.get(chunk)??[]){
   sphere.center.set(a.x,1,a.z);
   if(a===this.driven||this.response.has(a)||this.crew.has(a)||this.outsideCashiers.has(a)||frustum.intersectsSphere(sphere)){if(!a.visual&&activations<4){this.activate(a);activations++;}}else this.deactivate(a);
  }
 }
 private addToBucket(a:Agent,bucket:string){let set=this.buckets.get(bucket);if(!set){set=new Set();this.buckets.set(bucket,set);}set.add(a);a.bucket=bucket;}
 private moveBucket(a:Agent){const next=bucketAt({x:a.x/tileSize,z:a.z/tileSize});if(next===a.bucket)return;this.buckets.get(a.bucket)?.delete(a);this.addToBucket(a,next);if(!this.loaded.has(next)&&a!==this.driven)this.deactivate(a);}
 private activate(a:Agent){
  if(a.visual)return;
  if(a.kind==='car')a.visual={root:this.cars[a.variant%this.cars.length].clone()};
  else{
   const template=this.people[a.variant%this.people.length],root=cloneSkeleton(template.root) as THREE.Group;
   const mixer=template.clip?new THREE.AnimationMixer(root):undefined;if(mixer&&template.clip)mixer.clipAction(template.clip).play();
   const emote=new THREE.Sprite(this.emotes[a.variant%this.emotes.length]);emote.position.set(0,2.15,0);emote.scale.set(.8,.8,.8);root.add(emote);
   const crew=this.crew.get(a);if(crew){const marker=new THREE.Mesh(crewMarkerGeometry,crew.role==='guard'?guardMarkerMaterial:thiefMarkerMaterial);marker.position.y=2.35;marker.rotation.x=Math.PI;root.add(marker);}
   a.visual={root,mixer,emote,left:template.left?root.getObjectByName(template.left) as THREE.Bone:undefined,right:template.right?root.getObjectByName(template.right) as THREE.Bone:undefined};
  }
  this.scene.add(a.visual.root);this.active.add(a);this.createSensor(a);
  if(a.kind==='car'){
   const y=this.world.roadHeight(a.x/tileSize,a.z/tileSize),body=this.playerWorld.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(a.x,y+.7,a.z));
   this.playerWorld.createCollider(RAPIER.ColliderDesc.cuboid(.8,.65,1.25).setCollisionGroups(0x00020004),body);this.carBodies.set(a,body);
  }if(a.kind==='car'&&a.next&&!this.reserved.has(key(a.next)))this.reserved.set(key(a.next),a.id);this.render(a,0);
 }
 private deactivate(a:Agent){
  if(!a.visual)return;
  const cashier=this.outsideCashiers.get(a);if(cashier){this.outsideCashiers.delete(a);cashier.onRemove(false);this.buckets.get(a.bucket)?.delete(a);this.all.delete(a.id);}
  const escaping=this.escapingCars.get(a);if(escaping){this.escapingCars.delete(a);const driver=escaping.driver;if(driver.visual){driver.mode='walk';driver.x=a.x;driver.z=a.z;driver.node={x:Math.round(a.x/tileSize),z:Math.round(a.z/tileSize)};driver.next=null;driver.visual.root.visible=true;}}
  this.fleeing.delete(a);
  const rag=this.ragdolls.get(a),dead=rag?.dead??false;
  if(rag)this.removeRagdoll(a);
  const sensor=this.sensors.get(a);if(sensor){this.sensorOwners.delete(sensor.collider.handle);this.physics.removeRigidBody(sensor.body);this.sensors.delete(a);}
  const carBody=this.carBodies.get(a);if(carBody){this.playerWorld.removeRigidBody(carBody);this.carBodies.delete(a);this.carSpeeds.delete(a);}
  this.impactCooldown.delete(a);this.carImpactPause.delete(a);this.carImpulses.delete(a);this.hitReactions.delete(a);this.scene.remove(a.visual.root);a.visual.mixer?.stopAllAction();a.visual=null;this.active.delete(a);
  if(a.next&&this.reserved.get(key(a.next))===a.id)this.reserved.delete(key(a.next));
  if(dead){this.buckets.get(a.bucket)?.delete(a);this.all.delete(a.id);}
 }
 private createSensor(a:Agent){
  const y=this.world.roadHeight(a.x/tileSize,a.z/tileSize);
  const body=this.physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(a.x,y+(a.kind==='car'?.7:.75),a.z));
  const shape=a.kind==='car'?RAPIER.ColliderDesc.cuboid(.8,.65,1.25):RAPIER.ColliderDesc.capsule(.42,.3);
  const collider=this.physics.createCollider(shape.setSensor(true).setCollisionGroups(a===this.playerAgent?0x00080001:a.kind==='car'?0x00010009:0x00010001).setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),body);
  this.sensors.set(a,{body,collider});this.sensorOwners.set(collider.handle,a);
 }
 private removeRagdoll(a:Agent){
  const rag=this.ragdolls.get(a);if(!rag)return;
  if(rag.blood){this.scene.remove(rag.blood);rag.blood.geometry.dispose();}
  for(const part of rag.parts)this.physics.removeRigidBody(part);this.physics.removeRigidBody(rag.ground);
  for(const id of rag.buildings){const item=this.ragdollBuildings.get(id);if(item&&--item.references===0){this.physics.removeRigidBody(item.body);this.ragdollBuildings.delete(id);}}
  this.ragdolls.delete(a);
 }
 private knockDown(a:Agent,dx:number,dz:number,dead:boolean,flight=1.6,shot=false){
  if(a.kind!=='person'||this.ragdolls.has(a))return;
  const sensor=this.sensors.get(a);if(sensor)sensor.collider.setEnabled(false);
  const len=Math.hypot(dx,dz)||1;dx/=len;dz/=len;
  const y=this.world.roadHeight(a.x/tileSize,a.z/tileSize),parts:RAPIER.RigidBody[]=[];
  // Only nearby building volumes are mirrored, and only while a ragdoll needs them.
  const reach=shot?32:12;
  const buildings=this.world.ragdollBuildings(a.x,a.z,reach).map(obstacle=>{
   let item=this.ragdollBuildings.get(obstacle.id);
   if(!item){
    const body=this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(obstacle.x,obstacle.y,obstacle.z));
    this.physics.createCollider(RAPIER.ColliderDesc.cuboid(obstacle.halfX,obstacle.halfY,obstacle.halfZ).setCollisionGroups(0x00020004),body);
    item={body,references:0};this.ragdollBuildings.set(obstacle.id,item);
   }
   item.references++;return obstacle.id;
  });
  const ground=this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(a.x,y-.1,a.z));
  this.physics.createCollider(RAPIER.ColliderDesc.cuboid(reach,.1,reach).setCollisionGroups(0x00020004),ground);
  const make=(x:number,py:number,z:number,hx:number,hy:number,hz:number)=>{
   const gravity=shot?(flight>1.5?.35:.5):1,speed=shot?(flight>1.5?7:4.5):3.4,lift=shot?flight*9.81*gravity*.5:2.8;
   const body=this.physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,py,z).setLinvel(dx*speed,lift,dz*speed).setGravityScale(gravity).setLinearDamping(shot?.08:.9).setAngularDamping(1.1).setCcdEnabled(true));
   this.physics.createCollider(RAPIER.ColliderDesc.cuboid(hx,hy,hz).setCollisionGroups(0x00040002).setFriction(.8),body);parts.push(body);return body;
  };
  const torso=make(a.x,y+.94,a.z,.27,.38,.16),head=make(a.x,y+1.48,a.z,.18,.18,.18);
  const left=make(a.x-.17,y+.34,a.z,.12,.28,.12),right=make(a.x+.17,y+.34,a.z,.12,.28,.12);
  this.physics.createImpulseJoint(RAPIER.JointData.spherical({x:0,y:.38,z:0},{x:0,y:-.18,z:0}),torso,head,true);
  this.physics.createImpulseJoint(RAPIER.JointData.spherical({x:-.17,y:-.38,z:0},{x:0,y:.28,z:0}),torso,left,true);
  this.physics.createImpulseJoint(RAPIER.JointData.spherical({x:.17,y:-.38,z:0},{x:0,y:.28,z:0}),torso,right,true);
  torso.setAngvel({x:dz*3,y:0,z:-dx*3},true);
  let blood:THREE.Mesh|undefined;
  if(dead&&this.bloodMaterial){const geometry=new THREE.PlaneGeometry(1.8,1.8,8,8);geometry.rotateX(-Math.PI/2);blood=new THREE.Mesh(geometry,this.bloodMaterial);blood.renderOrder=2;blood.visible=false;this.scene.add(blood);}
  this.ragdolls.set(a,{parts,ground,buildings,timer:flight,dead,blood});a.partner=null;a.cooldown=5;
  if(a.visual?.emote)a.visual.emote.visible=false;
 }
 // This isolated world contains only NPC sensors and temporary ragdolls.
 stepPhysics(dt:number){
  for(const [a,time] of this.carImpactPause){if(time<=dt)this.carImpactPause.delete(a);else this.carImpactPause.set(a,time-dt);}
  for(const [a,time] of this.impactCooldown){if(time<=dt)this.impactCooldown.delete(a);else this.impactCooldown.set(a,time-dt);}
  for(const [a,sensor] of this.sensors){
   if(this.ragdolls.has(a))continue;
   sensor.collider.setEnabled(a.mode!=='inside'&&!(a===this.playerAgent&&this.driven));
   if(a.kind==='car'){
    const previous=sensor.body.translation();this.carSpeeds.set(a,Math.hypot(a.x-previous.x,a.z-previous.z)/Math.max(dt,.001));
    const body=this.carBodies.get(a);if(body){body.setNextKinematicTranslation({x:a.x,y:this.world.roadHeight(a.x/tileSize,a.z/tileSize)+.7,z:a.z});body.setNextKinematicRotation({x:0,y:Math.sin(a.heading/2),z:0,w:Math.cos(a.heading/2)});}
   }
   const y=this.world.roadHeight(a.x/tileSize,a.z/tileSize);
   sensor.body.setNextKinematicTranslation({x:a.x,y:y+(a.kind==='car'?.7:.75),z:a.z});
   sensor.body.setNextKinematicRotation({x:0,y:Math.sin(a.heading/2),z:0,w:Math.cos(a.heading/2)});
  }
  this.physics.timestep=Math.max(.001,dt);this.physics.step(this.events);
  this.events.drainCollisionEvents((h1,h2,started)=>{
   if(!started)return;const a=this.sensorOwners.get(h1),b=this.sensorOwners.get(h2);
   if(!a||!b||this.ragdolls.has(a)||this.ragdolls.has(b))return;
   // Suppress NPC impacts at the garden boundary as well as inside it.
   if(a!==this.playerAgent&&b!==this.playerAgent&&a!==this.driven&&b!==this.driven&&(a.kind==='person'||b.kind==='person')&&
      (this.world.isGarden(a.x/tileSize,a.z/tileSize)||this.world.isGarden(b.x/tileSize,b.z/tileSize)))return;
   if((a.kind==='person'&&this.impactCooldown.has(a))||(b.kind==='person'&&this.impactCooldown.has(b))||(a.kind==='car'&&b.kind==='car'&&(this.impactCooldown.has(a)||this.impactCooldown.has(b))))return;
   let dx=a.x-b.x,dz=a.z-b.z;if(Math.hypot(dx,dz)<.01){dx=Math.sin(a.heading)||1;dz=Math.cos(a.heading);}
   if(a===this.playerAgent||b===this.playerAgent){const car=a===this.playerAgent?b:a;if(car.kind!=='car'||(this.carSpeeds.get(car)??0)<.3)return;}
   if(a.kind==='car'&&b.kind==='car'){this.carImpactPause.set(a,.7);this.carImpactPause.set(b,.7);}
   if(a.kind==='person')this.knockDown(a,dx,dz,b.kind==='car'&&a!==this.playerAgent);
   if(b.kind==='person')this.knockDown(b,-dx,-dz,a.kind==='car'&&b!==this.playerAgent);
   this.impactCooldown.set(a,2.2);this.impactCooldown.set(b,2.2);
  });
  for(const [a,rag] of this.ragdolls){
   const torso=rag.parts[0],p=torso.translation(),q=torso.rotation();
   if(a===this.playerAgent&&!this.world.isPlayable(p.x/tileSize,p.z/tileSize)){
    const dx=a.x-p.x,dz=a.z-p.z;
    for(const part of rag.parts){const pos=part.translation();part.setTranslation({x:pos.x+dx,y:pos.y,z:pos.z+dz},true);const vel=part.linvel();part.setLinvel({x:0,y:vel.y,z:0},true);}
    p.x=a.x;p.z=a.z;
   }
   a.x=p.x;a.z=p.z;if(a!==this.playerAgent)this.moveBucket(a);
   if(!this.ragdolls.has(a)||!a.visual)continue;
   const root=a.visual.root,rotation=new THREE.Quaternion(q.x,q.y,q.z,q.w);
   const offset=new THREE.Vector3(0,-.85,0).applyQuaternion(rotation);
   root.position.set(p.x+offset.x,p.y+offset.y,p.z+offset.z);root.quaternion.copy(rotation);
   for(const [bone,body] of [[a.visual.left,rag.parts[2]],[a.visual.right,rag.parts[3]]] as const){if(bone){const r=body.rotation();bone.quaternion.copy(rotation.clone().invert().multiply(new THREE.Quaternion(r.x,r.y,r.z,r.w)));}}
   rag.timer-=dt;
   if(rag.blood&&rag.timer<=0&&!rag.settled){
    const blood=rag.blood;
    if(p.y<=this.world.roadHeight(p.x/tileSize,p.z/tileSize)+1.1||rag.timer< -2){
     blood.position.set(p.x,0,p.z);
     const positions=blood.geometry.getAttribute('position') as THREE.BufferAttribute;
     for(let i=0;i<positions.count;i++)positions.setY(i,this.world.roadHeight((p.x+positions.getX(i))/tileSize,(p.z+positions.getZ(i))/tileSize)+.2);
     positions.needsUpdate=true;blood.geometry.computeBoundingSphere();
     blood.visible=true;rag.settled=true;for(const part of rag.parts)part.setBodyType(RAPIER.RigidBodyType.Fixed,true);
    }
   }
   if(!rag.dead&&rag.timer<=0){
    this.removeRagdoll(a);const sensor=this.sensors.get(a);sensor?.collider.setEnabled(true);
    a.startX=a.x;a.startZ=a.z;a.progress=0;a.partner=null;a.mode=a.gardenHome?'garden':'walk';a.timer=2;
    a.visual.root.rotation.set(0,a.heading,0);
   }
  }
 }
 private render(a:Agent,dt:number){
  const v=a.visual;if(!v)return;v.root.visible=a.mode!=='inside';v.root.position.set(a.x,this.world.roadHeight(a.x/tileSize,a.z/tileSize)+(a.kind==='person'?.09:.07),a.z);v.root.rotation.y=a.heading;
  const reaction=this.hitReactions.get(a);if(reaction){reaction.time-=dt;const strength=Math.max(0,reaction.time/.35);v.root.position.x+=reaction.x*strength*.32;v.root.position.z+=reaction.z*strength*.32;v.root.rotation.z=strength*.2;if(reaction.time<=0){v.root.rotation.z=0;this.hitReactions.delete(a);}}
  if(v.emote)v.emote.visible=a.mode==='talk'||a.mode==='gardenTalk';
  v.mixer?.update(dt);
  if(a.kind==='person'&&((a.mode==='walk'&&a.next)||a.mode==='gardenEnter'||a.mode==='gardenWalk'||a.mode==='gardenExit'||a.mode==='enter'||a.mode==='exit')){
   const swing=Math.sin(this.clock*9+a.seed)*.43;
   v.left?.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),swing));
   v.right?.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-swing));
  }
 }
 private homes(a:Agent){return directions.map(d=>({x:a.node.x+d.x,z:a.node.z+d.z})).filter(p=>this.world.isHome(p.x,p.z));}
 private pathTo(start:Node,target:Node):Node|null {
  if(equal(start,target))return null;
  const queue:Node[]=[start],first=new Map<string,Node|null>([[key(start),null]]);
  for(let i=0;i<queue.length&&i<1800;i++)for(const next of neighbours(queue[i],this.world.isRoad)){
   const k=key(next);if(first.has(k))continue;first.set(k,i===0?next:first.get(key(queue[i]))!);
   if(equal(next,target))return first.get(k)!;queue.push(next);
  }
  return null;
 }
 private pickNext(a:Agent){
  if(a.kind==='person'){
   if(!a.gardenGoal&&a.gardenHome&&a.steps>=a.visitAfterStep)a.gardenGoal=a.gardenHome;
   if(!a.gardenGoal&&a.steps>0&&a.steps%8===0&&hash(a.node.x,a.node.z,a.seed+a.steps)>.3)a.gardenGoal=this.world.garden(a.node.x,a.node.z,a.seed+a.steps);
   if(a.gardenGoal){if(equal(a.node,a.gardenGoal.road))return null;const path=this.pathTo(a.node,a.gardenGoal.road);if(path)return path;a.gardenGoal=null;}
   const distance=Math.abs(a.node.x-a.origin.x)+Math.abs(a.node.z-a.origin.z);
   if(distance>16)a.returning=true;
   if(a.returning&&distance===0)a.returning=false;
   if(a.returning){const path=this.pathTo(a.node,a.origin);if(path)return path;}
  }
  return chooseRoad(a.node,a.previous,this.world.isRoad,hash(a.node.x,a.node.z,a.seed+a.steps*31));
 }
 update(dt:number){
  this.clock+=dt;const agents=[...this.active];
  // A reserved destination and an occupied node protect intersections and
  // prevent two cars from entering the same piece of road at once.
  const occupied=new Map<string,string>();for(const a of agents)if(a.kind==='car')occupied.set(key(a.node),a.id);
  for(const a of agents){
   if(!this.active.has(a)||this.ragdolls.has(a)||this.response.has(a)||a===this.driven)continue;
   if(this.crew.has(a)){this.updateCrew(a,dt);continue;}
   const cashier=this.outsideCashiers.get(a);if(cashier){
    const player=this.playerAgent;if(player&&!this.ragdolls.has(player)){const dx=player.x-a.x,dz=player.z-a.z,d=Math.hypot(dx,dz),heading=Math.atan2(dx,dz),obstacles=this.world.ragdollBuildings(a.x,a.z,20);a.heading=heading;
     if(d>5)for(const turn of [0,.7,-.7,1.3,-1.3]){const angle=heading+turn,nx=a.x+Math.sin(angle)*dt*3,nz=a.z+Math.cos(angle)*dt*3;if(this.world.isPlayable(nx/tileSize,nz/tileSize)&&!obstacles.some(b=>Math.abs(nx-b.x)<b.halfX+.3&&Math.abs(nz-b.z)<b.halfZ+.3)){a.x=nx;a.z=nz;break;}}
     cashier.fire-=dt;if(d<18&&cashier.fire<=0&&clearSegment(a.x,a.z,player.x,player.z,obstacles)){cashier.fire=.675;this.cashierShots.push(new THREE.Vector3(a.x,this.world.roadHeight(a.x/tileSize,a.z/tileSize)+1,a.z));}
    }
    this.moveBucket(a);this.render(a,dt);continue;
   }
   const impulse=this.carImpulses.get(a);if(impulse){const nx=a.x+impulse.x*dt,nz=a.z+impulse.z*dt,obstacles=this.world.ragdollBuildings(a.x,a.z,4);if(this.world.isPlayable(nx/tileSize,nz/tileSize)&&!obstacles.some(b=>Math.abs(nx-b.x)<b.halfX+.8&&Math.abs(nz-b.z)<b.halfZ+.8)){a.x=nx;a.z=nz;}impulse.x*=Math.exp(-3*dt);impulse.z*=Math.exp(-3*dt);this.moveBucket(a);this.render(a,dt);if(Math.hypot(impulse.x,impulse.z)<.2){this.carImpulses.delete(a);a.node={x:Math.round(a.x/tileSize),z:Math.round(a.z/tileSize)};a.next=null;}continue;}
   if(this.parked.has(a))continue;
   if(a.kind==='person'&&[...this.escapingCars.values()].some(e=>e.driver===a))continue;
   const escape=this.escapingCars.get(a);
   if(escape){
    escape.time-=dt;const toward=escape.time>3,tx=this.playerAgent?.x??escape.threatX,tz=this.playerAgent?.z??escape.threatZ,dx=(toward?tx-a.x:a.x-tx),dz=(toward?tz-a.z:a.z-tz),heading=Math.atan2(dx,dz);
    const obstacles=this.world.ragdollBuildings(a.x,a.z,8);
    for(const turn of [0,.6,-.6,1.2,-1.2]){const angle=heading+turn,nx=a.x+Math.sin(angle)*dt*7,nz=a.z+Math.cos(angle)*dt*7;
     if(this.world.isPlayable(nx/tileSize,nz/tileSize)&&!obstacles.some(b=>Math.abs(nx-b.x)<b.halfX+.8&&Math.abs(nz-b.z)<b.halfZ+.8)){a.x=nx;a.z=nz;a.heading=angle;break;}}
    escape.driver.x=a.x;escape.driver.z=a.z;this.moveBucket(escape.driver);
    this.moveBucket(a);this.render(a,dt);
    if(escape.time<=0||!this.active.has(a)){this.escapingCars.delete(a);const driver=escape.driver;if(driver.visual){driver.x=a.x;driver.z=a.z;driver.mode='walk';driver.node={x:Math.round(a.x/tileSize),z:Math.round(a.z/tileSize)};driver.next=null;driver.visual.root.visible=true;this.fleeing.set(driver,{threatX:escape.threatX,threatZ:escape.threatZ,time:3});}a.node={x:Math.round(a.x/tileSize),z:Math.round(a.z/tileSize)};a.next=null;}
    continue;
   }
   const flee=this.fleeing.get(a);
   if(flee&&a.kind==='person'){
    flee.time-=dt;const car=flee.car&&this.active.has(flee.car)&&!this.escapingCars.has(flee.car)?flee.car:undefined;
    const dx=car?car.x-a.x:a.x-flee.threatX,dz=car?car.z-a.z:a.z-flee.threatZ,len=Math.hypot(dx,dz)||1;
    if(car&&len<1.5){a.mode='inside';a.visual!.root.visible=false;this.fleeing.delete(a);if(car.next&&this.reserved.get(key(car.next))===car.id)this.reserved.delete(key(car.next));car.next=null;this.escapingCars.set(car,{driver:a,threatX:flee.threatX,threatZ:flee.threatZ,time:6});continue;}
    const heading=Math.atan2(dx/len,dz/len),obstacles=this.world.ragdollBuildings(a.x,a.z,4);
    for(const turn of [0,.7,-.7,1.3,-1.3]){const angle=heading+turn,nx=a.x+Math.sin(angle)*dt*3.2,nz=a.z+Math.cos(angle)*dt*3.2;
     if(this.world.isPlayable(nx/tileSize,nz/tileSize)&&!obstacles.some(b=>Math.abs(nx-b.x)<b.halfX+.3&&Math.abs(nz-b.z)<b.halfZ+.3)){a.x=nx;a.z=nz;a.heading=angle;break;}}
    this.moveBucket(a);this.render(a,dt);if(flee.time<=0){this.fleeing.delete(a);a.node={x:Math.round(a.x/tileSize),z:Math.round(a.z/tileSize)};a.next=null;a.cooldown=8;}continue;
   }
   if(this.carImpactPause.has(a)){this.render(a,dt);continue;}
   a.cooldown=Math.max(0,a.cooldown-dt);
   if(a.kind==='person'&&a.mode==='walk'&&!a.next&&a.gardenGoal&&equal(a.node,a.gardenGoal.road)){
    a.startX=a.x;a.startZ=a.z;const angle=hash(a.node.x,a.node.z,a.seed)*Math.PI*2;
    a.goalX=a.gardenGoal.x+Math.cos(angle)*2.0;a.goalZ=a.gardenGoal.z+Math.sin(angle)*2.0;
    a.mode='gardenEnter';a.timer=Math.max(1,Math.hypot(a.goalX-a.x,a.goalZ-a.z)/1.05);a.heading=Math.atan2(a.goalX-a.x,a.goalZ-a.z);
   }
   if(a.kind==='person'&&a.mode!=='walk'){
    a.timer-=dt;
    if(a.mode==='enter'&&a.door){const t=1-Math.max(0,a.timer)/1.6;a.x=THREE.MathUtils.lerp(a.startX,a.goalX,t);a.z=THREE.MathUtils.lerp(a.startZ,a.goalZ,t);if(a.timer<=0){a.mode='inside';a.timer=4+hash(a.node.x,a.node.z,a.seed+a.steps)*8;}}
    else if(a.mode==='inside'&&a.timer<=0){a.mode='exit';a.timer=1.6;a.heading+=Math.PI;}
    else if(a.mode==='exit'&&a.door){const t=Math.max(0,a.timer)/1.6;a.x=THREE.MathUtils.lerp(a.startX,a.goalX,t);a.z=THREE.MathUtils.lerp(a.startZ,a.goalZ,t);if(a.timer<=0){a.mode='walk';a.door=null;a.cooldown=15;}}
    else if(a.mode==='gardenEnter'){
     const duration=Math.max(1,Math.hypot(a.goalX-a.startX,a.goalZ-a.startZ)/1.05),t=1-Math.max(0,a.timer)/duration;
     a.x=THREE.MathUtils.lerp(a.startX,a.goalX,t);a.z=THREE.MathUtils.lerp(a.startZ,a.goalZ,t);
     if(a.timer<=0){a.mode='garden';a.gardenHome=a.gardenGoal;a.timer=3+hash(a.node.x,a.node.z,a.seed+a.steps)*7;a.cooldown=10+hash(a.node.x,a.node.z,a.seed+22)*15;a.partner=null;}
    } else if(a.mode==='garden'){
     const other=a.cooldown<=0?agents.find(b=>b!==a&&b.kind==='person'&&b.mode==='garden'&&b.cooldown<=0&&Math.hypot(a.x-b.x,a.z-b.z)<2.6):undefined;
     if(other){
      a.mode=other.mode='gardenTalk';a.timer=other.timer=2.5+hash(a.seed,other.seed,a.steps)*2.5;
      a.partner=other.id;other.partner=a.id;a.heading=Math.atan2(other.x-a.x,other.z-a.z);other.heading=a.heading+Math.PI;
     } else if(a.timer<=0&&a.gardenHome){
      a.steps++;const g=a.gardenHome;
      a.startX=a.x;a.startZ=a.z;
      a.goalX=g.x+(hash(a.seed,a.steps,1011)*2-1)*3.2;
      a.goalZ=g.z+(hash(a.seed,a.steps,1012)*2-1)*3.2;
      a.mode='gardenWalk';a.timer=Math.max(.1,Math.hypot(a.goalX-a.x,a.goalZ-a.z)/1.05);
      a.heading=Math.atan2(a.goalX-a.x,a.goalZ-a.z);
     }
    } else if(a.mode==='gardenWalk'){
     const duration=Math.max(.1,Math.hypot(a.goalX-a.startX,a.goalZ-a.startZ)/1.05),t=1-Math.max(0,a.timer)/duration;
     a.x=THREE.MathUtils.lerp(a.startX,a.goalX,t);a.z=THREE.MathUtils.lerp(a.startZ,a.goalZ,t);
     if(a.timer<=0){a.mode='garden';a.timer=3+hash(a.seed,a.steps,1013)*9;}
    } else if(a.mode==='gardenTalk'){
     if(a.timer<=0){a.mode='garden';a.partner=null;a.timer=2+hash(a.seed,a.steps,1014)*5;a.cooldown=18+hash(a.seed,a.steps,1015)*22;}
    } else if(a.mode==='gardenExit'){
     const duration=Math.max(1,Math.hypot(a.goalX-a.startX,a.goalZ-a.startZ)/1.05),t=Math.max(0,a.timer)/duration;
     a.x=THREE.MathUtils.lerp(a.startX,a.goalX,t);a.z=THREE.MathUtils.lerp(a.startZ,a.goalZ,t);
     if(a.timer<=0){a.mode='walk';a.gardenGoal=null;a.cooldown=12;a.visitAfterStep=a.steps+2+(a.seed%4);}
    } else if(a.mode==='talk'&&a.timer<=0){a.mode='walk';a.partner=null;a.cooldown=14;}
    this.moveBucket(a);this.render(a,dt);continue;
   }
   if(a.kind==='person'&&a.cooldown<=0){
    const other=agents.find(b=>b!==a&&b.kind==='person'&&b.mode==='walk'&&b.cooldown<=0&&Math.hypot(a.x-b.x,a.z-b.z)<3);
    if(other){a.mode=other.mode='talk';a.timer=other.timer=2.5;a.partner=other.id;other.partner=a.id;a.heading=Math.atan2(other.x-a.x,other.z-a.z);other.heading=a.heading+Math.PI;this.render(a,dt);continue;}
    const houses=a.next?[]:this.homes(a);if(houses.length&&hash(a.node.x,a.node.z,a.seed+a.steps*17)>.45){a.door=houses[Math.floor(hash(a.node.x,a.node.z,a.seed+33)*houses.length)];a.startX=a.x;a.startZ=a.z;a.goalX=a.door.x*tileSize+(a.node.x-a.door.x)*1.55;a.goalZ=a.door.z*tileSize+(a.node.z-a.door.z)*1.55;a.mode='enter';a.timer=1.6;a.heading=Math.atan2(a.door.x-a.node.x,a.door.z-a.node.z);this.render(a,dt);continue;}
    if(!a.next)a.cooldown=5;
   }
   if(!a.next){
    const candidate=this.pickNext(a);if(!candidate){this.render(a,dt);continue;}
    if(a.kind==='car'){
     const dest=key(candidate),owner=this.reserved.get(dest),occupant=occupied.get(dest);
     const opposing=agents.find(b=>b.id===occupant&&b.next&&b.next.x-b.node.x===a.node.x-candidate.x&&b.next.z-b.node.z===a.node.z-candidate.z);
     const junction=neighbours(candidate,this.world.isRoad).length>=3;
     const vertical=candidate.z!==a.node.z,green=(Math.floor(this.clock/9)+(Math.abs(candidate.x*7+candidate.z*11)%2))%2===0;
     if((owner&&owner!==a.id)||(occupant&&occupant!==a.id&&(!opposing||junction))||(junction&&vertical!==green)){this.render(a,dt);continue;}
     this.reserved.set(dest,a.id);
    }
    a.next=candidate;a.progress=0;a.startX=a.x;a.startZ=a.z;
   }
   const dx=a.next.x-a.node.x,dz=a.next.z-a.node.z;
   let blocked=false;
   if(a.kind==='car')for(const b of agents){if(b!==a&&b.kind==='car'&&b.next&&(b.next.x-b.node.x)*dx+(b.next.z-b.node.z)*dz>0&&Math.hypot(a.x-b.x,a.z-b.z)<2.9){const ahead=(b.x-a.x)*dx+(b.z-a.z)*dz;if(ahead>0){blocked=true;break;}}}
   if(!blocked)a.progress=Math.min(1,a.progress+dt*(a.kind==='car'?3.6:1.05)/tileSize);
   const lane=a.kind==='car'?.52:1.48;
   const blend=THREE.MathUtils.smoothstep(a.progress,0,.65);
   const offsetX=THREE.MathUtils.lerp(a.startX-a.node.x*tileSize,-dz*lane,blend),offsetZ=THREE.MathUtils.lerp(a.startZ-a.node.z*tileSize,dx*lane,blend);
   a.x=(a.node.x+dx*a.progress)*tileSize+offsetX;a.z=(a.node.z+dz*a.progress)*tileSize+offsetZ;
   let target=Math.atan2(dx,dz);
   if(a.kind==='car'){
    const center=this.world.roundabout(a.node.x,a.node.z)||this.world.roundabout(a.next.x,a.next.z);
    const arriving=center&&equal(a.next,center),leaving=center&&equal(a.node,center)&&a.previous;
    if(center&&(arriving||leaving)){
     const entry=arriving?a.node:a.previous!;
     const ex=entry.x-center.x,ez=entry.z-center.z;
     // Road-lane offsets determine the entry and exit angles, so the arc
     // joins each approach without cutting through the central island.
     const entryAngle=Math.atan2(ex*tileSize+ez*lane,ez*tileSize-ex*lane);
     let angle=entryAngle+.22*a.progress;
     if(leaving){
      const ox=a.next.x-center.x,oz=a.next.z-center.z;
      const exitAngle=Math.atan2(ox*tileSize-oz*lane,oz*tileSize+ox*lane);
      const sweep=((exitAngle-entryAngle+Math.PI*2)%(Math.PI*2))||Math.PI*2;
      angle=entryAngle+.22+Math.max(0,sweep-.22)*a.progress;
     }
     const radius=Math.hypot(tileSize,lane);a.x=center.x*tileSize+Math.sin(angle)*radius;a.z=center.z*tileSize+Math.cos(angle)*radius;target=angle+Math.PI/2;
    }
   }
   a.heading+=Math.atan2(Math.sin(target-a.heading),Math.cos(target-a.heading))*Math.min(1,dt*7);
   if(a.progress>=1){if(a.kind==='car'&&this.reserved.get(key(a.next))===a.id)this.reserved.delete(key(a.next));a.previous=a.node;a.node=a.next;a.next=null;a.progress=0;a.steps++;}
   this.moveBucket(a);
   this.render(a,dt);
  }
 }
}
