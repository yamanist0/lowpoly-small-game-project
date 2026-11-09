import type { Abilities } from './upgrades';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { findPath, type Point } from './pathfinding';
import type { ShopCustomerVisual } from './agents';
import { clearSegment, type CombatResult, type CombatTarget } from './combat';

// These URLs are bundled at build time, while the models and textures are
// loaded only when a player first visits a shop.
const miniFiles=import.meta.glob('../assets/kenney_mini-market/Models/GLB format/{shelf-bags,shelf-boxes,shelf-end,freezer,freezers-standing,display-bread,display-fruit,cash-register,character-employee,shopping-cart,shopping-basket}.glb',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const furnitureFiles=import.meta.glob('../assets/kenney_furniture-kit/Models/GLTF format/{bookcaseOpen,bookcaseClosed,table,pottedPlant,stoolBar}.glb',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const wallFiles=import.meta.glob(['../assets/walls/**/*_color_1k.png','../assets/walls/**/*_basecolor_1k.png'],{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const floorFiles=import.meta.glob(['../assets/floors/**/*_baseColor_1k.png','../assets/floors/**/*_basecolor_1k.png'],{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const miniNames=['shelf-bags','shelf-boxes','shelf-end','freezer','freezers-standing','display-bread','display-fruit','cash-register','character-employee','shopping-cart','shopping-basket'];
const furnitureNames=['bookcaseOpen','bookcaseClosed','table','pottedPlant','stoolBar'];
type Assets={models:Map<string,THREE.Group>;walls:THREE.Texture[];floors:THREE.Texture[]};
export type ShopSafeState={openedAt:number;cashierOutside?:boolean};
let assetsPromise:Promise<Assets>|null=null;
function urlFor(files:Record<string,string>,name:string){
 const entry=Object.entries(files).find(([path])=>path.endsWith(`/${name}.glb`));
 if(!entry)throw new Error(`Missing shop model: ${name}`);return entry[1];
}
function prepareModel(source:THREE.Group,height:number,maxWidth:number){
 source.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(source),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
 source.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));const root=new THREE.Group();root.add(source);
 root.scale.setScalar(Math.min(height/Math.max(size.y,.01),maxWidth/Math.max(size.x,size.z,.01)));
 root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});return root;
}
export function loadShopAssets(){
 if(!assetsPromise){
  const loader=new GLTFLoader(),textures=new THREE.TextureLoader();
  const modelList=[...miniNames.map(name=>({name,files:miniFiles})),...furnitureNames.map(name=>({name,files:furnitureFiles}))];
  const colors=(files:Record<string,string>)=>Object.entries(files).filter(([name])=>/(?:_color|_basecolor)_1k\.png$/i.test(name)).sort(([a],[b])=>a.localeCompare(b)).map(([,url])=>url);
  assetsPromise=Promise.all([
   Promise.all(modelList.map(async ({name,files})=>{
    const source=(await loader.loadAsync(urlFor(files,name))).scene;
    const isSmall=name==='pottedPlant'||name==='stoolBar'||name==='shopping-basket';
    const isTable=name==='table'||name==='freezer'||name.startsWith('display-');
    const height=name==='cash-register'?1.05:name==='character-employee'?1.45:name==='shopping-cart'?.85:isSmall?.8:isTable?.95:1.7;
    const width=name==='cash-register'?1.6:name==='character-employee'?1.5:name==='shopping-cart'?.9:isSmall?.8:1.5;
    return [name,prepareModel(source,height,width)] as const;
   })),
   Promise.all(colors(wallFiles).map(url=>textures.loadAsync(url))),
   Promise.all(colors(floorFiles).map(url=>textures.loadAsync(url)))
  ]).then(([models,walls,floors])=>{
   if(!walls.length||!floors.length)throw new Error('Shop wall or floor textures are missing');
   for(const texture of [...walls,...floors])texture.colorSpace=THREE.SRGBColorSpace;
   return {models:new Map(models),walls,floors};
  }).catch(error=>{assetsPromise=null;throw error;});
 }
 return assetsPromise;
}

type Obstacle={x:number;z:number;halfX:number;halfZ:number;counter?:boolean};
type Shopper={id:string;visual:ShopCustomerVisual;x:number;z:number;route:Point[];index:number;wait:number;blocked:number;speed:number;health:number;panic?:number;reaction?:{x:number;z:number;time:number}};
type ShopRagdoll={id:string;root:THREE.Group;parts:RAPIER.RigidBody[];blood?:THREE.Mesh;timer:number;settled?:boolean;left?:THREE.Bone;right?:THREE.Bone};
export type ShopMap={width:number;depth:number;exit:Point};
export type ShopStep={x:number;z:number;dx:number;dz:number;running:boolean;pulse:number;exit:boolean};
function seeded(seedX:number,seedZ:number){
 let n=(Math.imul(seedX,374761393)^Math.imul(seedZ,668265263)^0x4c7a91)>>>0;
 return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
}

export class ShopInterior {
 readonly scene=new THREE.Scene();
 readonly width:number;readonly depth:number;readonly exit:Point;
 private readonly physics=new RAPIER.World({x:0,y:0,z:0});
 private readonly player:RAPIER.RigidBody;
 private readonly collider:RAPIER.Collider;
 private readonly controller:RAPIER.KinematicCharacterController;
 private readonly obstacles:Obstacle[]=[];
 private readonly walls:{mesh:THREE.Object3D;x:number;z:number}[]=[];
 private readonly owned:({dispose:()=>void})[]=[];
 private readonly lineGeometry=new THREE.BufferGeometry();
 private readonly line:THREE.Line;
 private readonly floor:THREE.Mesh;
 private readonly raycaster=new THREE.Raycaster();
 private readonly pointer=new THREE.Vector2();
 private readonly particleGeometry=new THREE.SphereGeometry(.12,6,4);
 private readonly particles:{mesh:THREE.Mesh<THREE.SphereGeometry,THREE.MeshBasicMaterial>;velocity:THREE.Vector3;life:number}[]=[];
 private readonly shoppers:Shopper[]=[];
 private readonly shopperSpawns:{id:string;x:number;z:number;variant:number;speed:number;wait:number}[]=[];
 private readonly createCustomer?: (variant:number)=>ShopCustomerVisual;
 private readonly cashierTemplate:THREE.Object3D|undefined;
 private readonly ragdolls:ShopRagdoll[]=[];
 private readonly bloodDrops:THREE.Mesh[]=[];
 private ragWorld:RAPIER.World|null=null;
 private cashierRoot:THREE.Group|null=null;private cashierHealth=300;
 private cashierHostile=false;private cashierPlan=0;private cashierFire=1.5;private pendingShot:THREE.Vector3|null=null;
 private cashierAimed=false;private cashierDashTime=0;private cashierDashCooldown=0;private cashierDodgeCooldown=0;private dodgeX=0;private dodgeZ=0;private dodgeTime=0;
 private cashierShieldTime=0;private cashierShieldCooldown=3;private cashierShield:THREE.Mesh|null=null;
 private readonly wind:{line:THREE.Line;life:number}[]=[];
 private readonly cash:{mesh:THREE.Mesh;velocity:THREE.Vector3;value:number}[]=[];private collectedCash=0;
 private cashierReaction:{x:number;z:number;time:number}|null=null;
 private readonly shopperCells:Point[]=[];
 private readonly random:()=>number;
 private cashierPosition:Point={x:0,z:0};
 private counterPosition:Point={x:0,z:0};
 private counter:THREE.Object3D|null=null;
 private safeRoot:THREE.Object3D|null=null;private safeMarker:THREE.Mesh|null=null;private safePoint:Point={x:0,z:0};private safeDifficulty:0|1|2=0;private safeValue=0;
 private safeOpenedHere=false;
 private route:Point[]=[];private routeIndex=0;private exitAfterRoute=false;
 private dashTime=0;private pulse=0;private dashFollowingRoute=false;
 private direction=new THREE.Vector3(0,0,-1);private blockedTime=0;
 private requestedExit=false;

 constructor(assets:Assets,seedX:number,seedZ:number,private readonly abilities:Abilities,createCustomer?:(variant:number)=>ShopCustomerVisual,private readonly bloodMaterial:THREE.Material|null=null,private readonly deaths:Map<string,number>=new Map(),safeModel?:THREE.Group,private readonly safeState:ShopSafeState={openedAt:0}){
  this.createCustomer=createCustomer;this.cashierTemplate=assets.models.get('character-employee');
  for(const [id,until] of deaths)if(Date.now()>=until)deaths.delete(id);
  const random=seeded(seedX,seedZ);
  this.random=random;
  this.width=8.5+random()*5.5;this.depth=9+random()*6.5;this.exit={x:0,z:this.depth/2-1.1};
  this.owned.push(this.particleGeometry);this.scene.background=new THREE.Color(0xb3b9d1);
  this.scene.add(new THREE.HemisphereLight(0xf7f5e8,0x8c897f,2.2));
  const light=new THREE.DirectionalLight(0xfff4dc,2.1);light.position.set(-6,16,9);this.scene.add(light);
  const tile=(source:THREE.Texture,x:number,y:number)=>{const map=source.clone();map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(x,y);map.needsUpdate=true;this.owned.push(map);return map;};
  const floorMap=tile(assets.floors[Math.floor(random()*assets.floors.length)],this.width/2.8,this.depth/2.8);
  const wallMap=tile(assets.walls[Math.floor(random()*assets.walls.length)],2,1);
  const floorMaterial=new THREE.MeshStandardMaterial({map:floorMap,roughness:.9});
  const wallMaterial=new THREE.MeshStandardMaterial({map:wallMap,roughness:1,side:THREE.DoubleSide});
  this.owned.push(floorMaterial,wallMaterial);
  const floorGeometry=new THREE.PlaneGeometry(this.width,this.depth);this.owned.push(floorGeometry);
  this.floor=new THREE.Mesh(floorGeometry,floorMaterial);this.floor.rotation.x=-Math.PI/2;this.floor.receiveShadow=true;this.scene.add(this.floor);
  const wallHeight=3.3,thickness=.16;
  const wall=(x:number,z:number,w:number,d:number,nx:number,nz:number)=>{
   const geometry=new THREE.BoxGeometry(w,wallHeight,d);this.owned.push(geometry);
   const mesh=new THREE.Mesh(geometry,wallMaterial);mesh.position.set(x,wallHeight/2,z);mesh.receiveShadow=true;this.scene.add(mesh);this.walls.push({mesh,x:nx,z:nz});
   const body=this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,wallHeight/2,z));
   this.physics.createCollider(RAPIER.ColliderDesc.cuboid(w/2,wallHeight/2,d/2),body);
   return mesh;
  };
  wall(-this.width/2,0,thickness,this.depth,-1,0);wall(this.width/2,0,thickness,this.depth,1,0);
  const backWall=wall(0,-this.depth/2,this.width,thickness,0,-1);
  // Attach the sign to the wall so it participates in the camera cutaway.
  const signCanvas=document.createElement('canvas');signCanvas.width=512;signCanvas.height=128;
  const signContext=signCanvas.getContext('2d')!;signContext.fillStyle='#187b68';signContext.fillRect(0,0,512,128);
  signContext.fillStyle='#f5f3df';signContext.font='bold 74px Arial';signContext.textAlign='center';signContext.textBaseline='middle';signContext.fillText('MARKET',256,68);
  const signTexture=new THREE.CanvasTexture(signCanvas);signTexture.colorSpace=THREE.SRGBColorSpace;
  const signMaterial=new THREE.MeshBasicMaterial({map:signTexture,side:THREE.DoubleSide});
  const signGeometry=new THREE.PlaneGeometry(3,.75);this.owned.push(signTexture,signMaterial,signGeometry);
  const sign=new THREE.Mesh(signGeometry,signMaterial);sign.position.set(0,.88,thickness/2+.012);backWall.add(sign);
  const doorway=1.7,wing=(this.width-doorway)/2;
  wall(-(doorway+wing)/2,this.depth/2,wing,thickness,0,1);wall((doorway+wing)/2,this.depth/2,wing,thickness,0,1);
  // A visibly marked threshold doubles as a click target for leaving the shop.
  const markerCanvas=document.createElement('canvas');markerCanvas.width=256;markerCanvas.height=96;
  const markerContext=markerCanvas.getContext('2d')!;markerContext.fillStyle='#164c50';markerContext.fillRect(0,0,256,96);
  markerContext.strokeStyle='#b9f7ec';markerContext.lineWidth=5;markerContext.strokeRect(4,4,248,88);
  markerContext.fillStyle='#ffffff';markerContext.font='bold 46px Arial';markerContext.textAlign='center';markerContext.textBaseline='middle';markerContext.fillText('EXIT',128,48);
  const markerTexture=new THREE.CanvasTexture(markerCanvas);markerTexture.colorSpace=THREE.SRGBColorSpace;
  const markerMaterial=new THREE.MeshBasicMaterial({map:markerTexture,transparent:true,depthWrite:false,side:THREE.DoubleSide});
  const markerGeometry=new THREE.PlaneGeometry(1.5,.56);this.owned.push(markerTexture,markerMaterial,markerGeometry);
  const marker=new THREE.Mesh(markerGeometry,markerMaterial);marker.rotation.x=-Math.PI/2;marker.position.set(0,.035,this.depth/2-.65);this.scene.add(marker);
  const wallStock=['shelf-bags','shelf-boxes','shelf-end','freezers-standing','display-bread','bookcaseOpen'];
  const aisleStock=['shelf-bags','shelf-boxes','shelf-end'];
  const addProp=(name:string,x:number,z:number,rotation:number,solid=true,heightOffset=0)=>{
   const prototype=assets.models.get(name);if(!prototype)return;
   const root=name==='character-employee'?cloneSkeleton(prototype):prototype.clone();root.position.set(x,.025+heightOffset,z);root.rotation.y=rotation;root.updateMatrixWorld(true);this.scene.add(root);
   if(!solid)return root;
   const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3()),dim=box.getSize(new THREE.Vector3());
   const halfX=Math.max(.15,dim.x*.46),halfZ=Math.max(.15,dim.z*.46),height=Math.max(.35,dim.y);
   this.obstacles.push({x:center.x,z:center.z,halfX:halfX+.38,halfZ:halfZ+.38,counter:name==='cash-register'});
   const body=this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x,height/2,center.z));
   this.physics.createCollider(RAPIER.ColliderDesc.cuboid(halfX,height/2,halfZ),body);
   return root;
  };
  // Perimeter refrigerators and stocked shelves frame the sales floor.
  for(const side of [-1,1])for(let z=-this.depth/2+1.4;z<this.depth/2-3;z+=1.8){
   addProp(wallStock[Math.floor(random()*wallStock.length)],side*(this.width/2-.9),z,side===-1?Math.PI/2:-Math.PI/2);
  }
  // Real aisles, with a clear entrance apron and passages around both ends.
  const aisleX=this.width>=11.5?[-2.0,2.0]:[0];
  for(const x of aisleX)for(let z=-this.depth/2+2.9;z<=this.depth/2-3.3;z+=1.55){
   addProp(aisleStock[Math.floor(random()*aisleStock.length)],x,z,Math.PI/2);
  }
  const counterX=-this.width/2+2.1,counterZ=this.depth/2-1.65;
  this.counterPosition={x:counterX,z:counterZ};
  this.counter=addProp('cash-register',counterX,counterZ,Math.PI/2)??null;
  if(this.safeState.openedAt&&Date.now()-this.safeState.openedAt>=180000)this.safeState.openedAt=0;
  if(safeModel){
   this.safeDifficulty=Math.floor(random()*3) as 0|1|2;this.safeValue=[700+Math.floor(random()*200),900+Math.floor(random()*200),1100+Math.floor(random()*201)][this.safeDifficulty];
   this.safePoint={x:this.width/2-1.45,z:this.depth/2-1.5};this.safeRoot=safeModel.clone();this.safeRoot.scale.multiplyScalar(.48);this.safeRoot.position.set(this.safePoint.x,.03,this.safePoint.z);this.scene.add(this.safeRoot);
   const body=this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.safePoint.x,.6,this.safePoint.z));this.physics.createCollider(RAPIER.ColliderDesc.cuboid(.55,.6,.55),body);this.obstacles.push({x:this.safePoint.x,z:this.safePoint.z,halfX:.85,halfZ:.85});
   const geometry=new THREE.OctahedronGeometry(.22),material=new THREE.MeshBasicMaterial({color:0xffc45e,depthTest:false});this.owned.push(geometry,material);this.safeMarker=new THREE.Mesh(geometry,material);this.safeMarker.position.set(this.safePoint.x,1.9,this.safePoint.z);this.safeMarker.renderOrder=24;this.safeMarker.visible=!this.safeState.openedAt;this.scene.add(this.safeMarker);
  }
  this.cashierPosition={x:-this.width/2+.75,z:counterZ};
  if(!this.deaths.has('cashier')&&!this.safeState.cashierOutside)this.cashierRoot=(addProp('character-employee',this.cashierPosition.x,this.cashierPosition.z,Math.PI/2,false) as THREE.Group|undefined)??null;
  addProp('shopping-basket',this.width/2-.65,this.depth/2-1.2,0,false);
  addProp('shopping-cart',this.width/2-.7,this.depth/2-2.0,Math.PI/2,false);
  addProp('display-fruit',this.width/2-.85,-this.depth/2+.85,0);
  addProp('pottedPlant',-this.width/2+.55,-this.depth/2+.55,0,false);
  const spawn={x:0,z:this.depth/2-1.6};
  this.player=this.physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x,1,spawn.z));
  this.collider=this.physics.createCollider(RAPIER.ColliderDesc.ball(.3),this.player);this.controller=this.physics.createCharacterController(.05);
  const lineMaterial=new THREE.LineDashedMaterial({color:0x53efff,transparent:true,opacity:.9,dashSize:.5,gapSize:.45,depthWrite:false});this.owned.push(this.lineGeometry,lineMaterial);
  this.line=new THREE.Line(this.lineGeometry,lineMaterial);this.line.visible=false;this.line.frustumCulled=false;this.scene.add(this.line);
  this.physics.step();
  if(createCustomer)this.createShoppers(createCustomer);
 }
 get position(){const p=this.player.translation();return {x:p.x,z:p.z};}
 get map():ShopMap{return {width:this.width,depth:this.depth,exit:this.exit};}
 get path(){return this.route;}
 get pathIndex(){return this.routeIndex;}
 get dashCharge(){return this.abilities.dashProgress;}
 get nearExit(){const p=this.player.translation();return Math.hypot(p.x-this.exit.x,p.z-this.exit.z)<1.3;}
 get nearCounter(){if(this.deaths.has('cashier')||this.cashierHostile||(!this.cashierRoot&&!this.shoppers.some(s=>s.id==='cashier')))return false;const p=this.player.translation();return Math.hypot(p.x-this.counterPosition.x,p.z-this.counterPosition.z)<2.1;}
 get nearSafe(){const p=this.position;return !!this.safeRoot&&!this.safeState.openedAt&&Math.hypot(p.x-this.safePoint.x,p.z-this.safePoint.z)<1.9;}
 get prompt(){return this.nearSafe?`E  CRACK SAFE | ${['EASY','MEDIUM','HARD'][this.safeDifficulty]}`:this.nearCounter?'E  BROWSE WEAPONS':this.nearExit?'E  EXIT SHOP':'CLICK THE EXIT TO LEAVE';}
 startSafe(){if(!this.nearSafe)return null;this.stopMoving();const p=this.position;this.frighten(p.x,p.z);return this.safeDifficulty;}
 completeSafe(){if(this.safeState.openedAt)return 0;this.safeState.openedAt=Date.now();this.safeOpenedHere=true;if(this.safeMarker)this.safeMarker.visible=false;return this.safeValue;}
 takeCashierOutside(){
  if(!this.safeOpenedHere||this.deaths.has('cashier'))return null;
  const index=this.shoppers.findIndex(s=>s.id==='cashier');let root:THREE.Group|null=null,health=this.cashierHealth;
  if(index>=0){const cashier=this.shoppers.splice(index,1)[0];root=cashier.visual.root;health=cashier.health;}else if(this.cashierRoot){root=this.cashierRoot;this.cashierRoot=null;}
  if(!root||health<=0)return null;root.removeFromParent();this.safeState.cashierOutside=true;this.safeOpenedHere=false;
  return {root,health,onRemove:(dead:boolean)=>{this.safeState.cashierOutside=false;if(dead)this.deaths.set('cashier',Date.now()+180000);}};
 }
 stopMoving(){this.route=[];this.routeIndex=0;this.exitAfterRoute=false;this.dashTime=0;this.updateLine();}
 lineOfSight(from:THREE.Vector3,to:THREE.Vector3){return clearSegment(from.x,from.z,to.x,to.z,this.obstacles.filter(o=>!o.counter).map(o=>({...o,halfX:Math.max(.1,o.halfX-.38),halfZ:Math.max(.1,o.halfZ-.38)})));}
 combatTargets():CombatTarget[]{
  const targets=this.shoppers.map(s=>({id:s.id,kind:'person' as const,police:false,position:new THREE.Vector3(s.x,.8,s.z),radius:.8}));
  if(this.cashierRoot&&this.cashierHealth>0)targets.push({id:'cashier',kind:'person',police:false,position:new THREE.Vector3(this.cashierPosition.x,.8,this.cashierPosition.z),radius:.8});
  for(const rag of this.ragdolls){const p=rag.parts[0].translation();targets.push({id:rag.id,kind:'person',police:false,position:new THREE.Vector3(p.x,p.y,p.z),radius:.8});}
  return targets;
 }
 frighten(x:number,z:number){
  if(this.cashierRoot||this.shoppers.some(s=>s.id==='cashier'))this.cashierHostile=true;
  if(this.cashierRoot&&this.cashierHealth>0){const root=this.cashierRoot;this.cashierRoot=null;const visual:ShopCustomerVisual={root,update:(px,pz,vx,vz)=>{root.position.set(px,.025,pz);if(Math.hypot(vx,vz)>.001)root.rotation.y=Math.atan2(vx,vz);},dispose:()=>{}};this.shoppers.push({id:'cashier',visual,x:this.cashierPosition.x,z:this.cashierPosition.z,route:[],index:0,wait:0,blocked:0,speed:3,health:this.cashierHealth});}
  for(const shopper of this.shoppers){if(shopper.id==='cashier')continue;if(Math.hypot(shopper.x-x,shopper.z-z)>20)continue;
   const alreadyPanicking=shopper.panic!==undefined&&shopper.panic>1;shopper.panic=5;shopper.speed=3;shopper.wait=0;if(alreadyPanicking)continue;
   const start=this.findGoal(shopper.x,shopper.z);if(!start)continue;
   const options=[...this.shopperCells].sort((a,b)=>Math.hypot(b.x-x,b.z-z)-Math.hypot(a.x-x,a.z-z));
   for(const target of options.slice(0,20)){const path=findPath(start,target,(px,pz)=>this.cost(px,pz));if(path.length){shopper.route=path;shopper.index=0;break;}}
  }
 }
 damageTarget(id:string,damage:number,dx:number,dz:number,flight:number):CombatResult|null{
  const corpse=this.ragdolls.find(r=>r.id===id);if(corpse){if(corpse.blood){const scale=Math.min(3,corpse.blood.scale.x*1.16);corpse.blood.scale.set(scale,1,scale);}const p=corpse.parts[0].translation();return {killed:false,kind:'person',police:false,position:new THREE.Vector3(p.x,p.y,p.z)};}
  const shopper=this.shoppers.find(s=>s.id===id),cashier=id==='cashier'&&this.cashierRoot&&this.cashierHealth>0;
  if(!shopper&&!cashier)return null;
  const x=shopper?.x??this.cashierPosition.x,z=shopper?.z??this.cashierPosition.z;
  if(id==='cashier'&&this.cashierShieldTime>0)return {killed:false,kind:'person',police:false,position:new THREE.Vector3(x,.8,z)};
  const health=shopper?(shopper.health-=damage):(this.cashierHealth-=damage);
  const position=new THREE.Vector3(x,.8,z),length=Math.hypot(dx,dz)||1;
  if(this.bloodMaterial){const geometry=new THREE.PlaneGeometry(.65,.65);geometry.rotateX(-Math.PI/2);const blood=new THREE.Mesh(geometry,this.bloodMaterial);blood.position.set(x,.04,z);blood.renderOrder=2;this.scene.add(blood);this.bloodDrops.push(blood);if(this.bloodDrops.length>100){const old=this.bloodDrops.shift()!;this.scene.remove(old);old.geometry.dispose();}}
  if(health>0){const reaction={x:dx/length,z:dz/length,time:.35};if(shopper)shopper.reaction=reaction;else this.cashierReaction=reaction;return {killed:false,kind:'person',police:false,position};}
  const root=shopper?shopper.visual.root:this.cashierRoot!;
  if(shopper){this.shoppers.splice(this.shoppers.indexOf(shopper),1);shopper.visual.dispose();}else this.cashierReaction=null;
  this.deaths.set(id,Date.now()+180000);
  if(id==='cashier'){this.cashierHealth=0;this.cashierRoot=null;if(this.cashierShield)this.cashierShield.visible=false;this.dropCash();}
  this.makeRagdoll(id,root,x,z,dx/length,dz/length,flight);
  return {killed:true,kind:'person',police:false,position};
 }
 private dropCash(){
  const total=200+Math.floor(Math.random()*101),geometry=new THREE.BoxGeometry(.32,.025,.15),material=new THREE.MeshStandardMaterial({color:0x80b76b,roughness:1});this.owned.push(geometry,material);
  for(let i=0;i<12;i++){const mesh=new THREE.Mesh(geometry,material),angle=i*Math.PI*2/12,speed=1.2+Math.random()*2;mesh.position.set(this.counterPosition.x,1.25,this.counterPosition.z);mesh.rotation.y=angle;this.scene.add(mesh);this.cash.push({mesh,velocity:new THREE.Vector3(Math.cos(angle)*speed,2+Math.random()*2,Math.sin(angle)*speed),value:Math.floor(total/12)+(i<total%12?1:0)});}
 }
 setCashierAimed(aimed:boolean){this.cashierAimed=aimed;}
 private dashWind(x:number,z:number,dx:number,dz:number){
  const length=Math.hypot(dx,dz)||1,nx=dx/length,nz=dz/length;
  for(const side of [-.35,0,.35]){const points=[new THREE.Vector3(x+side*nz,.45,z-side*nx),new THREE.Vector3(x+side*nz-nx*(.6+Math.random()*.5),.45,z-side*nx-nz*(.6+Math.random()*.5))];const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xc3f9ff,transparent:true,opacity:.9,depthWrite:false}));this.scene.add(line);this.wind.push({line,life:.3});}
 }
 takeCollectedCash(){const amount=this.collectedCash;this.collectedCash=0;return amount;}
 takeCashierShot(){const shot=this.pendingShot;this.pendingShot=null;return shot;}
 private updateCashier(dt:number,player:Point){
  const cashier=this.shoppers.find(s=>s.id==='cashier');if(!cashier||!this.cashierHostile)return;
  this.cashierPlan-=dt;this.cashierFire-=dt;this.cashierDashCooldown=Math.max(0,this.cashierDashCooldown-dt);this.cashierDodgeCooldown=Math.max(0,this.cashierDodgeCooldown-dt);this.cashierDashTime=Math.max(0,this.cashierDashTime-dt);this.dodgeTime=Math.max(0,this.dodgeTime-dt);
  this.cashierShieldCooldown-=dt;this.cashierShieldTime=Math.max(0,this.cashierShieldTime-dt);
  if(this.cashierShieldCooldown<=0){this.cashierShieldTime=1;this.cashierShieldCooldown=3;}
  if(!this.cashierShield){this.cashierShield=new THREE.Mesh(new THREE.SphereGeometry(1.05,20,12),new THREE.MeshBasicMaterial({color:0x62dfff,transparent:true,opacity:.25,wireframe:true,depthWrite:false}));this.scene.add(this.cashierShield);}
  this.cashierShield.visible=this.cashierShieldTime>0;this.cashierShield.position.set(cashier.x,1,cashier.z);
  if(this.cashierAimed&&this.cashierDodgeCooldown<=0&&this.dodgeTime<=0){const dx=cashier.x-player.x,dz=cashier.z-player.z,len=Math.hypot(dx,dz)||1;for(const side of [Math.random()<.5?1:-1,-1,1]){const sx=dz/len*side,sz=-dx/len*side;if(Number.isFinite(this.cost(cashier.x+sx*.7,cashier.z+sz*.7,true))){this.dodgeX=sx;this.dodgeZ=sz;this.dodgeTime=.14;this.cashierDodgeCooldown=.4;this.dashWind(cashier.x,cashier.z,sx,sz);break;}}}
  const from=new THREE.Vector3(cashier.x,.8,cashier.z),to=new THREE.Vector3(player.x,.8,player.z),visible=this.lineOfSight(from,to);
  if(this.cashierPlan<=0){this.cashierPlan=2.5;const start=this.findGoal(cashier.x,cashier.z,true);if(start){const cover=this.shopperCells.filter(p=>!this.lineOfSight(new THREE.Vector3(p.x,.8,p.z),to)).sort((a,b)=>Math.hypot(a.x-cashier.x,a.z-cashier.z)-Math.hypot(b.x-cashier.x,b.z-cashier.z));const choices=visible?cover:this.shopperCells.filter(p=>this.lineOfSight(new THREE.Vector3(p.x,.8,p.z),to)&&Math.hypot(p.x-player.x,p.z-player.z)>2);for(const target of choices.slice(0,20)){const path=findPath(start,target,(x,z)=>this.cost(x,z,true));if(path.length){cashier.route=path;cashier.index=0;cashier.wait=0;cashier.speed=3;if(visible&&this.cashierDashCooldown<=0){this.cashierDashTime=.22;this.cashierDashCooldown=.8;const next=path[0];if(next)this.dashWind(cashier.x,cashier.z,next.x-cashier.x,next.z-cashier.z);}break;}}}}
  if(visible&&this.cashierFire<=0){this.pendingShot=from;this.cashierFire=.675;cashier.visual.root.rotation.y=Math.atan2(player.x-cashier.x,player.z-cashier.z);}
 }
 private makeRagdoll(id:string,root:THREE.Group,x:number,z:number,dx:number,dz:number,flight:number){
  if(!this.ragWorld){
   const physics=this.ragWorld=new RAPIER.World({x:0,y:-9.81,z:0});
   const fixed=(px:number,py:number,pz:number,hx:number,hy:number,hz:number)=>{const body=physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(px,py,pz));physics.createCollider(RAPIER.ColliderDesc.cuboid(hx,hy,hz),body);};
   fixed(0,-.1,0,this.width/2,.1,this.depth/2);
   // Combat impulses can lift a body above the visible cutaway walls.
   fixed(-this.width/2,10,0,.1,10,this.depth/2);fixed(this.width/2,10,0,.1,10,this.depth/2);
   fixed(0,10,-this.depth/2,this.width/2,10,.1);fixed(0,10,this.depth/2,this.width/2,10,.1);
   for(const o of this.obstacles)fixed(o.x,.65,o.z,Math.max(.1,o.halfX-.38),.65,Math.max(.1,o.halfZ-.38));
  }
  const physics=this.ragWorld,parts:RAPIER.RigidBody[]=[],gravity=flight>1.5?.35:.5,speed=flight>1.5?7:4.5;
  const make=(px:number,py:number,pz:number,hx:number,hy:number,hz:number)=>{
   const body=physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(px,py,pz).setLinvel(dx*speed,flight*9.81*gravity*.5,dz*speed).setGravityScale(gravity).setLinearDamping(.08).setAngularDamping(1.1).setCcdEnabled(true));
   physics.createCollider(RAPIER.ColliderDesc.cuboid(hx,hy,hz).setCollisionGroups(0x00020001),body);parts.push(body);return body;
  };
  // Ragdoll parts only collide with the static shop geometry, never each other.
  const torso=make(x,.94,z,.27,.38,.16),head=make(x,1.48,z,.18,.18,.18),left=make(x-.17,.34,z,.12,.28,.12),right=make(x+.17,.34,z,.12,.28,.12);
  physics.createImpulseJoint(RAPIER.JointData.spherical({x:0,y:.38,z:0},{x:0,y:-.18,z:0}),torso,head,true);
  physics.createImpulseJoint(RAPIER.JointData.spherical({x:-.17,y:-.38,z:0},{x:0,y:.28,z:0}),torso,left,true);
  physics.createImpulseJoint(RAPIER.JointData.spherical({x:.17,y:-.38,z:0},{x:0,y:.28,z:0}),torso,right,true);torso.setAngvel({x:dz*3,y:0,z:-dx*3},true);
  let blood:THREE.Mesh|undefined;
  if(this.bloodMaterial){const geometry=new THREE.PlaneGeometry(1.8,1.8);geometry.rotateX(-Math.PI/2);blood=new THREE.Mesh(geometry,this.bloodMaterial);blood.visible=false;blood.renderOrder=2;this.scene.add(blood);}
  const bones:THREE.Bone[]=[];root.traverse(node=>{if(node instanceof THREE.Bone)bones.push(node);});
  this.ragdolls.push({id,root,parts,blood,timer:flight,left:bones.find(b=>/L_Thigh/i.test(b.name)),right:bones.find(b=>/R_Thigh/i.test(b.name))});
 }
 private updateRagdolls(dt:number){
  if(!this.ragWorld)return;this.ragWorld.timestep=Math.max(.001,dt);this.ragWorld.step();
  for(const rag of this.ragdolls){
   const p=rag.parts[0].translation(),q=rag.parts[0].rotation(),rotation=new THREE.Quaternion(q.x,q.y,q.z,q.w),offset=new THREE.Vector3(0,-.85,0).applyQuaternion(rotation);
   rag.root.position.set(p.x+offset.x,p.y+offset.y,p.z+offset.z);rag.root.quaternion.copy(rotation);
   for(const [bone,part] of [[rag.left,rag.parts[2]],[rag.right,rag.parts[3]]] as const)if(bone){const r=part.rotation();bone.quaternion.copy(rotation.clone().invert().multiply(new THREE.Quaternion(r.x,r.y,r.z,r.w)));}
   rag.timer-=dt;if(rag.blood&&rag.timer<=0&&!rag.settled&&(p.y<1.1||rag.timer< -2)){rag.blood.position.set(p.x,.04,p.z);rag.blood.visible=true;rag.settled=true;for(const part of rag.parts)part.setBodyType(RAPIER.RigidBodyType.Fixed,true);}
  }
 }
 private cost(x:number,z:number,ignoreCounter=false){
  if(Math.abs(x)>this.width/2-.55||Math.abs(z)>this.depth/2-.55)return Infinity;
  return this.obstacles.some(o=>(!ignoreCounter||!o.counter)&&Math.abs(x-o.x)<o.halfX&&Math.abs(z-o.z)<o.halfZ)?Infinity:1;
 }
 private shopperCost(x:number,z:number){
  if(Math.hypot(x-this.cashierPosition.x,z-this.cashierPosition.z)<1.2)return Infinity;
  return this.cost(x,z);
 }
 private createShoppers(createCustomer:(variant:number)=>ShopCustomerVisual){
  for(let x=Math.ceil(-this.width/2+.65);x<this.width/2-.65;x++){
   for(let z=Math.ceil(-this.depth/2+.65);z<this.depth/2-.65;z++){
    if(Number.isFinite(this.shopperCost(x,z))&&Math.hypot(x-this.exit.x,z-this.exit.z)>2.2)this.shopperCells.push({x,z});
   }
  }
  const count=2+Math.floor(this.random()*2),available=[...this.shopperCells];
  for(let i=0;i<count&&available.length;i++){
   const index=Math.floor(this.random()*available.length),position=available[index];
   for(let j=available.length-1;j>=0;j--)if(Math.hypot(available[j].x-position.x,available[j].z-position.z)<1.5)available.splice(j,1);
   const spawn={id:`shopper-${i}`,x:position.x,z:position.z,variant:Math.floor(this.random()*10000),speed:.8+this.random()*.25,wait:.25+i*.4};this.shopperSpawns.push(spawn);
   if(!this.deaths.has(spawn.id))this.spawnShopper(spawn,createCustomer);
  }
 }
 private spawnShopper(spawn:{id:string;x:number;z:number;variant:number;speed:number;wait:number},createCustomer:(variant:number)=>ShopCustomerVisual){
  const visual=createCustomer(spawn.variant);this.scene.add(visual.root);const shopper:Shopper={id:spawn.id,visual,x:spawn.x,z:spawn.z,route:[],index:0,wait:spawn.wait,blocked:0,speed:spawn.speed,health:100};visual.update(shopper.x,shopper.z,0,0,0);this.shoppers.push(shopper);
 }
 private respawnResidents(){
  for(const [id,until] of this.deaths){if(Date.now()<until)continue;this.deaths.delete(id);
   const index=this.ragdolls.findIndex(r=>r.id===id);if(index>=0){const rag=this.ragdolls[index];this.scene.remove(rag.root);if(rag.blood){this.scene.remove(rag.blood);rag.blood.geometry.dispose();}for(const part of rag.parts)this.ragWorld?.removeRigidBody(part);this.ragdolls.splice(index,1);}
   if(id==='cashier'){if(this.cashierTemplate){this.cashierRoot=cloneSkeleton(this.cashierTemplate) as THREE.Group;this.cashierRoot.position.set(this.cashierPosition.x,.025,this.cashierPosition.z);this.cashierRoot.rotation.y=Math.PI/2;this.scene.add(this.cashierRoot);}this.cashierHealth=300;this.cashierHostile=false;this.cashierShieldTime=0;this.cashierShieldCooldown=3;if(this.cashierShield)this.cashierShield.visible=false;}
   else{const spawn=this.shopperSpawns.find(s=>s.id===id);if(spawn&&this.createCustomer)this.spawnShopper(spawn,this.createCustomer);}
  }
 }
 private planShopper(shopper:Shopper){
  const start=this.findGoal(shopper.x,shopper.z);if(!start||!Number.isFinite(this.shopperCost(start.x,start.z)))return false;
  for(let attempt=0;attempt<20;attempt++){
   const target=this.shopperCells[Math.floor(this.random()*this.shopperCells.length)];
   if(!target||Math.hypot(target.x-shopper.x,target.z-shopper.z)<2||
      this.shoppers.some(other=>other!==shopper&&Math.hypot(other.x-target.x,other.z-target.z)<1.1))continue;
   const path=findPath(start,target,(x,z)=>this.shopperCost(x,z));if(!path.length)continue;
   if(Math.hypot(start.x-shopper.x,start.z-shopper.z)>.01)path.unshift(start);
   shopper.route=path;shopper.index=0;shopper.blocked=0;return true;
  }
  return false;
 }
 private updateShoppers(dt:number,player:Point){
  for(const shopper of this.shoppers){
   if(shopper.id==='cashier'&&this.dodgeTime>0){const nx=shopper.x+this.dodgeX*5*dt,nz=shopper.z+this.dodgeZ*5*dt;if(Number.isFinite(this.cost(nx,nz,true))&&Math.hypot(nx-player.x,nz-player.z)>.85){shopper.x=nx;shopper.z=nz;}shopper.visual.update(shopper.x,shopper.z,this.dodgeX,this.dodgeZ,dt);continue;}
   if(shopper.id==='cashier'&&this.cashierHostile&&shopper.index>=shopper.route.length){shopper.visual.update(shopper.x,shopper.z,0,0,dt);continue;}
   if(shopper.panic!==undefined){shopper.panic-=dt;if(shopper.panic<=0){shopper.panic=undefined;shopper.speed=1;}}
   let vx=0,vz=0;
   if(shopper.wait>0)shopper.wait=Math.max(0,shopper.wait-dt);
   else{
    while(shopper.index<shopper.route.length&&Math.hypot(shopper.route[shopper.index].x-shopper.x,shopper.route[shopper.index].z-shopper.z)<.01)shopper.index++;
    if(shopper.index>=shopper.route.length){
     if(shopper.route.length){shopper.route=[];shopper.wait=1+this.random()*2;}
     else if(!this.planShopper(shopper))shopper.wait=.5;
    }
    const target=shopper.wait<=0?shopper.route[shopper.index]:undefined;
    if(target){
     const dx=target.x-shopper.x,dz=target.z-shopper.z,distance=Math.hypot(dx,dz),step=Math.min(distance,(shopper.id==='cashier'&&this.cashierDashTime>0?12:shopper.speed)*dt);
     const nx=shopper.x+dx/distance*step,nz=shopper.z+dz/distance*step;
     const approachingPlayer=Math.hypot(nx-player.x,nz-player.z)<.85&&Math.hypot(nx-player.x,nz-player.z)<Math.hypot(shopper.x-player.x,shopper.z-player.z);
     const approachingShopper=this.shoppers.some(other=>other!==shopper&&Math.hypot(nx-other.x,nz-other.z)<.95&&Math.hypot(nx-other.x,nz-other.z)<Math.hypot(shopper.x-other.x,shopper.z-other.z));
     if(Number.isFinite(shopper.id==='cashier'?this.cost(nx,nz,true):shopper.panic!==undefined?this.cost(nx,nz):this.shopperCost(nx,nz))&&!approachingPlayer&&!approachingShopper){
      vx=nx-shopper.x;vz=nz-shopper.z;shopper.x=nx;shopper.z=nz;shopper.blocked=0;
     }else if((shopper.blocked+=dt)>1.2){shopper.route=[];shopper.index=0;shopper.wait=.4;shopper.blocked=0;}
    }
   }
   shopper.visual.update(shopper.x,shopper.z,vx,vz,dt);
   const reaction=shopper.reaction;if(reaction){reaction.time-=dt;const strength=Math.max(0,reaction.time/.35);shopper.visual.root.position.x+=reaction.x*strength*.32;shopper.visual.root.position.z+=reaction.z*strength*.32;shopper.visual.root.rotation.z=strength*.2;if(reaction.time<=0){shopper.visual.root.rotation.z=0;shopper.reaction=undefined;}}
  }
  if(this.cashierRoot&&this.cashierReaction){const reaction=this.cashierReaction;reaction.time-=dt;const strength=Math.max(0,reaction.time/.35);this.cashierRoot.position.x=this.cashierPosition.x+reaction.x*strength*.32;this.cashierRoot.position.z=this.cashierPosition.z+reaction.z*strength*.32;this.cashierRoot.rotation.z=strength*.2;if(reaction.time<=0)this.cashierReaction=null;}
 }
 private findGoal(x:number,z:number,ignoreCounter=false){
  const ix=Math.round(x),iz=Math.round(z);let goal:Point|null=null,best=Infinity;
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
   const px=ix+dx,pz=iz+dz,dist=Math.hypot(px-x,pz-z);
   if(dist<best&&Number.isFinite(this.cost(px,pz,ignoreCounter))){best=dist;goal={x:px,z:pz};}
  }
  return goal;
 }
 private routeTo(goal:Point,exit:boolean){
  const target=this.findGoal(goal.x,goal.z);if(!target)return;
  const start=this.position,startCell=this.findGoal(start.x,start.z);if(!startCell)return;
  const path=findPath(startCell,target,(x,z)=>this.cost(x,z));
  if(path.length===0&&(startCell.x!==target.x||startCell.z!==target.z))return;
  // The player can stop between grid cells, including beside a wall where
  // rounding the position would select an invalid cell.
  if(Math.hypot(start.x-startCell.x,start.z-startCell.z)>.01)path.unshift(startCell);
  this.route=path;this.routeIndex=0;this.exitAfterRoute=exit;this.blockedTime=0;this.updateLine();
 }
 private routeToSafe(){
  const start=this.position,startCell=this.findGoal(start.x,start.z);if(!startCell)return;
  const candidates:Point[]=[];for(let x=Math.floor(this.safePoint.x-2);x<=Math.ceil(this.safePoint.x+2);x++)for(let z=Math.floor(this.safePoint.z-2);z<=Math.ceil(this.safePoint.z+2);z++)if(Math.hypot(x-this.safePoint.x,z-this.safePoint.z)<1.9&&Number.isFinite(this.cost(x,z)))candidates.push({x,z});
  candidates.sort((a,b)=>Math.hypot(a.x-start.x,a.z-start.z)-Math.hypot(b.x-start.x,b.z-start.z));
  for(const target of candidates){const path=findPath(startCell,target,(x,z)=>this.cost(x,z));if(!path.length&&(startCell.x!==target.x||startCell.z!==target.z))continue;if(Math.hypot(start.x-startCell.x,start.z-startCell.z)>.01)path.unshift(startCell);this.route=path;this.routeIndex=0;this.exitAfterRoute=false;this.blockedTime=0;this.updateLine();return;}
 }
 click(event:MouseEvent,camera:THREE.Camera,canvas:HTMLCanvasElement){
  const rect=canvas.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
  this.raycaster.setFromCamera(this.pointer,camera);
  if(this.safeRoot&&!this.safeState.openedAt&&this.raycaster.intersectObject(this.safeRoot,true).length){this.routeToSafe();return false;}
  if(this.counter&&this.raycaster.intersectObject(this.counter,true).length){
   if(this.nearCounter)return true;
   this.routeTo({x:this.counterPosition.x+1.5,z:this.counterPosition.z},false);return false;
  }
  const hit=this.raycaster.intersectObject(this.floor)[0];if(!hit)return false;
  const point=hit.point,exit=Math.abs(point.x)<1.15&&point.z>this.depth/2-1.55;
  this.routeTo(exit?this.exit:{x:point.x,z:point.z},exit);
  return false;
 }
 useExit(){if(this.nearExit)this.requestedExit=true;}
 tryDash(heading:number){
  if(this.abilities.charges<=0)return;
  const target=this.route[this.routeIndex],p=this.player.translation();
  this.direction.set(target?target.x-p.x:Math.sin(heading),0,target?target.z-p.z:Math.cos(heading)).normalize();
  if(this.direction.lengthSq()<.01)return;
  this.dashFollowingRoute=!!target;this.dashTime=.22;this.abilities.useDash();this.pulse=1;
  for(let i=0;i<10;i++){
   const material=new THREE.MeshBasicMaterial({color:i%2?0x7af3ff:0xffffff,transparent:true,opacity:.8,depthWrite:false});
   const mesh=new THREE.Mesh(this.particleGeometry,material),angle=Math.random()*Math.PI*2;
   mesh.position.set(p.x,.18,p.z);this.scene.add(mesh);
   this.particles.push({mesh,velocity:new THREE.Vector3(Math.cos(angle)*(1+Math.random()*2),.5+Math.random(),Math.sin(angle)*(1+Math.random()*2)),life:.4+Math.random()*.2});
  }
 }
 private updateLine(){
  const p=this.position,points=[new THREE.Vector3(p.x,.13,p.z)];
  for(let i=this.routeIndex;i<this.route.length;i++)points.push(new THREE.Vector3(this.route[i].x,.13,this.route[i].z));
  this.lineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(point=>[point.x,point.y,point.z]),3));
  this.line.visible=points.length>1;if(this.line.visible)this.line.computeLineDistances();
 }
 update(dt:number,running=false):ShopStep{
  if(this.safeState.openedAt&&Date.now()-this.safeState.openedAt>=180000){this.safeState.openedAt=0;if(this.safeMarker)this.safeMarker.visible=true;}
  this.respawnResidents();
  const p=this.player.translation();
  for(let i=this.wind.length-1;i>=0;i--){const w=this.wind[i];w.life-=dt;(w.line.material as THREE.LineBasicMaterial).opacity=Math.max(0,w.life/.3);if(w.life<=0){this.scene.remove(w.line);w.line.geometry.dispose();(w.line.material as THREE.Material).dispose();this.wind.splice(i,1);}}
  for(let i=this.particles.length-1;i>=0;i--){const particle=this.particles[i];particle.life-=dt;particle.mesh.position.addScaledVector(particle.velocity,dt);particle.mesh.material.opacity=Math.max(0,particle.life/.6)*.8;particle.mesh.scale.setScalar(Math.max(0,particle.life/.6));if(particle.life<=0){this.scene.remove(particle.mesh);particle.mesh.material.dispose();this.particles.splice(i,1);}}
  while(this.routeIndex<this.route.length&&Math.hypot(this.route[this.routeIndex].x-p.x,this.route[this.routeIndex].z-p.z)<.01){this.routeIndex++;this.updateLine();}
  this.dashTime=Math.max(0,this.dashTime-dt);this.pulse=THREE.MathUtils.damp(this.pulse,0,9,dt);
  if(this.dashFollowingRoute&&this.routeIndex>=this.route.length)this.dashTime=0;
  const target=this.route[this.routeIndex],movement=new THREE.Vector3();
  if(target){
   const dx=target.x-p.x,dz=target.z-p.z,distance=Math.hypot(dx,dz);
   if(distance>0){this.direction.set(dx,0,dz).normalize();movement.copy(this.direction).multiplyScalar(Math.min(distance,dt*(this.dashTime>0?17:running?this.abilities.runSpeed:4.5)));}
  }else if(this.dashTime>0&&!this.exitAfterRoute)movement.copy(this.direction).multiplyScalar(dt*17);
  const attemptedMovement=movement.length();
  if(!Number.isFinite(this.cost(p.x+movement.x,p.z+movement.z)))movement.set(0,0,0);
  this.controller.computeColliderMovement(this.collider,{x:movement.x,y:0,z:movement.z});
  const delta=this.controller.computedMovement();
  if(attemptedMovement>0&&Math.hypot(delta.x,delta.z)<attemptedMovement*.15){this.blockedTime+=dt;if(this.blockedTime>.75){this.route=[];this.routeIndex=0;this.exitAfterRoute=false;this.updateLine();}}
  else this.blockedTime=0;
  this.player.setNextKinematicTranslation({x:p.x+delta.x,y:1,z:p.z+delta.z});this.physics.timestep=Math.max(.001,dt);this.physics.step();
  const pos=this.player.translation();
  this.updateCashier(dt,{x:pos.x,z:pos.z});this.updateShoppers(dt,{x:pos.x,z:pos.z});
  for(let i=this.cash.length-1;i>=0;i--){const bill=this.cash[i];bill.velocity.y-=9.8*dt;bill.mesh.position.addScaledVector(bill.velocity,dt);if(bill.mesh.position.y<.08){bill.mesh.position.y=.08;bill.velocity.set(0,0,0);const counter=this.obstacles.find(o=>o.counter),front=counter?counter.x+counter.halfX+.2:this.counterPosition.x+1;const safe=this.shopperCells.filter(p=>p.x>=front).sort((a,b)=>Math.hypot(a.x-bill.mesh.position.x,a.z-bill.mesh.position.z)-Math.hypot(b.x-bill.mesh.position.x,b.z-bill.mesh.position.z))[0];if(safe){bill.mesh.position.x=safe.x;bill.mesh.position.z=safe.z;}}bill.mesh.rotation.y+=dt*3;if(Math.hypot(bill.mesh.position.x-pos.x,bill.mesh.position.z-pos.z)<1){this.collectedCash+=bill.value;this.scene.remove(bill.mesh);this.cash.splice(i,1);}}
  this.updateRagdolls(dt);
  if(this.line.visible){const attr=this.lineGeometry.getAttribute('position') as THREE.BufferAttribute;attr.setXYZ(0,pos.x,.13,pos.z);attr.needsUpdate=true;}
  if(this.exitAfterRoute&&this.routeIndex>=this.route.length&&this.nearExit)this.requestedExit=true;
  return {x:pos.x,z:pos.z,dx:delta.x,dz:delta.z,running:this.dashTime>0||(running&&this.abilities.levels.run>0&&Math.hypot(delta.x,delta.z)>.01),pulse:this.pulse,exit:this.requestedExit};
 }
 updateWalls(yaw:number){const dx=Math.sin(yaw),dz=Math.cos(yaw);for(const wall of this.walls)wall.mesh.visible=wall.x*dx+wall.z*dz<=.05;}
 dispose(){for(const w of this.wind){w.line.geometry.dispose();(w.line.material as THREE.Material).dispose();}if(this.cashierShield){this.cashierShield.geometry.dispose();(this.cashierShield.material as THREE.Material).dispose();}for(const shopper of this.shoppers){this.scene.remove(shopper.visual.root);shopper.visual.dispose();}this.shoppers.length=0;for(const rag of this.ragdolls)rag.blood?.geometry.dispose();for(const blood of this.bloodDrops)blood.geometry.dispose();this.ragWorld?.free();for(const particle of this.particles)particle.mesh.material.dispose();this.particles.length=0;for(const item of this.owned)item.dispose();this.physics.free();}
}
