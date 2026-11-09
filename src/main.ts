import { OnlineClient } from './online';
import { showStartMenu } from './startMenu';
import { CityMap } from './cityMap';
import { CityEmpire } from './cityEmpire';
import { CityManagement } from './cityManagement';
import { HouseInterior, loadHouseAssets, makeHouseState, type HouseState } from './houseInterior';
import { BankInterior, loadBankAssets, makeBankState, type BankState } from './bankInterior';
import { BankPuzzle } from './bankPuzzle';
import { WeaponSystem } from './weapons';
import { CombatEffects, clearSegment, rewardFor, weaponStats, type CombatTarget } from './combat';
import './combat.css';
import { ShopInterior, loadShopAssets, type ShopSafeState } from './shopInterior';
import { districtIndex, districtName, boundaryDistance } from './districts';
import { createHud } from './hud';
import bloodUrl from '../assets/water_spitesheet/waterE_spritesheet.png?url';
import crosshairUrl from '../assets/kenney_crosshair-pack/PNG/Glow/crosshair-010.png?url';
import aim20 from '../assets/kenney_crosshair-pack/PNG/Outline/crosshair-020.png?url';
import aim16 from '../assets/kenney_crosshair-pack/PNG/Outline/crosshair-016.png?url';
import aim10 from '../assets/kenney_crosshair-pack/PNG/Outline/crosshair-010.png?url';
import aim31 from '../assets/kenney_crosshair-pack/PNG/Outline/crosshair-031.png?url';
import aim32 from '../assets/kenney_crosshair-pack/PNG/Outline/crosshair-032.png?url';
import aim28 from '../assets/kenney_crosshair-pack/PNG/Outline/crosshair-028.png?url';
import aim47 from '../assets/kenney_crosshair-pack/PNG/Outline/crosshair-047.png?url';
import aim51 from '../assets/kenney_crosshair-pack/PNG/Outline/crosshair-051.png?url';
import aim34 from '../assets/kenney_crosshair-pack/PNG/Outline/crosshair-034.png?url';
import { findPath, type Point } from './pathfinding';
import { shoreWater, appendShoreLand } from './shore';
import { buildingOccluder, releaseOccluder, updateBuildingOcclusion, type BuildingOccluder } from './camera';
import { CityAgents, type Node, type RagdollBuilding } from './agents';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import grassUrl from '../assets/grass/patern_1_basecolor.png?url';
import waterUrl from '../assets/water_spitesheet/water_spritesheet.png?url';
import mountainGrassUrl from '../assets/grass_with_rocks_01_1k/grass_with_rocks_01_color_1k.png?url';
import gravelUrl from '../assets/gravel/ground_with_rocks_03_color_1k.png?url';
import cliffUrl from '../assets/cliff_rocks_08_1k/cliff_rocks_08_baseColor_1k.png?url';
import wildRockUrl from '../assets/wild_rock/cliff_rocks_07_basecolor_1k.png?url';
import benchUrl from '../assets/bench/bench.fbx?url';
import bankUrl from '../assets/bank/source/Banca.fbx?url';
import bankTextureUrl from '../assets/bank/textures/lowpoly_tex-2.png?url';
import bushTextureUrl from '../assets/bush/Bush_temp_climate/Textures/T_Bush_temp_climate.png?url';
import gardenSource from '../assets/garden/scene.gltf?raw';
import gardenBin from '../assets/garden/scene.bin?url';
import gardenTexture1 from '../assets/garden/textures/Material.001_baseColor.png?url';
import gardenTexture2 from '../assets/garden/textures/Material.002_baseColor.png?url';

await RAPIER.init();
const world = new RAPIER.World({x:0,y:0,z:0});
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.style.cssText = 'margin:0;overflow:hidden';
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb3b9d1);
scene.fog = new THREE.Fog(0xb3b9d1, 65, 115);
const camera = new THREE.OrthographicCamera(-20,20,20,-20,0.1,250);
const ambient = new THREE.HemisphereLight(0xe5edff,0x77758c,2.1); scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff3df,2.4); sun.position.set(-25,45,20); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:120}); sun.shadow.bias=-0.0003; scene.add(sun, sun.target);
const files = import.meta.glob(['../assets/kenney_city-kit-commercial_*/Models/GLB format/*.glb','../assets/kenney_city-kit-roads/Models/GLB format/*.glb','../assets/kenney_city-kit-suburban_*/Models/GLB format/*.glb','../assets/kenney_city-kit-industrial_*/Models/GLB format/*.glb'], {eager:true, query:'?url', import:'default'}) as Record<string,string>;
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const [grassTexture, waterAtlas, mountainGrass, gravel, cliff, wildRock] = await Promise.all(
 [grassUrl,waterUrl,mountainGrassUrl,gravelUrl,cliffUrl,wildRockUrl].map(url=>textureLoader.loadAsync(url))
);
for(const texture of [mountainGrass,gravel,cliff,wildRock]){
 texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
 texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
}
const terrainMaterials=[new THREE.MeshStandardMaterial({map:mountainGrass,roughness:1})];
terrainMaterials[0].onBeforeCompile=shader=>{
 shader.uniforms.terrainGravel={value:gravel};shader.uniforms.terrainCliff={value:cliff};shader.uniforms.terrainWild={value:wildRock};shader.uniforms.shoreGrass={value:grassTexture};
 shader.vertexShader='attribute float shoreBlend; varying float terrainShore; varying vec3 terrainNormal; varying vec3 terrainWorld;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
 terrainShore=shoreBlend;
 terrainNormal=normalize(mat3(modelMatrix)*objectNormal);
 terrainWorld=(modelMatrix*vec4(transformed,1.0)).xyz;`);
 shader.fragmentShader='uniform sampler2D terrainGravel; uniform sampler2D terrainCliff; uniform sampler2D terrainWild; uniform sampler2D shoreGrass; varying float terrainShore; varying vec3 terrainNormal; varying vec3 terrainWorld;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
 vec4 grassSample=texture2D(map,vMapUv);
 vec4 gravelSample=texture2D(terrainGravel,vMapUv);
 vec3 terrainWeights=pow(abs(normalize(terrainNormal)),vec3(4.0));
 terrainWeights/=max(terrainWeights.x+terrainWeights.y+terrainWeights.z,0.001);
 vec4 cliffSample=texture2D(terrainCliff,terrainWorld.zy/5.0)*terrainWeights.x
                 +texture2D(terrainCliff,terrainWorld.xz/5.0)*terrainWeights.y
                 +texture2D(terrainCliff,terrainWorld.xy/5.0)*terrainWeights.z;
 vec4 wildSample=texture2D(terrainWild,terrainWorld.zy/5.0)*terrainWeights.x
                +texture2D(terrainWild,terrainWorld.xz/5.0)*terrainWeights.y
                +texture2D(terrainWild,terrainWorld.xy/5.0)*terrainWeights.z;
 float wildNoise=0.5+0.5*sin(terrainWorld.x*0.025+1.7)*sin(terrainWorld.z*0.027-0.8);
 cliffSample=mix(cliffSample,wildSample,smoothstep(0.82,0.95,wildNoise)*0.85);
 float gravelWeight=smoothstep(4.0,11.0,terrainWorld.y)*0.72;
 float cliffWeight=smoothstep(0.035,0.22,1.0-normalize(terrainNormal).y);
 vec2 bankUV=vec2(fract(terrainWorld.x/4.0+0.5),1.0-fract(terrainWorld.z/4.0+0.5))*0.55;
 vec4 bankGrass=texture2D(shoreGrass,bankUV)*vec4(0.694,0.765,0.647,1.0);
 vec4 mountain=mix(mix(grassSample,gravelSample,gravelWeight),cliffSample,cliffWeight);
 diffuseColor*=mix(mountain,bankGrass,clamp(terrainShore,0.0,1.0));
 #endif`);
};
grassTexture.colorSpace=THREE.SRGBColorSpace; grassTexture.wrapS=grassTexture.wrapT=THREE.RepeatWrapping;
grassTexture.repeat.set(.55,.55); grassTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
// Each atlas cell is an isometric diamond. Reproject each complete sprite to
// a square; the 16 original transparency patterns are a corner-mask tileset.
const maskToSprite=[12,8,13,1,0,14,3,2,15,9,4,5,11,10,7,6];
const waterClock={value:0};
const waterMaterials:THREE.MeshStandardMaterial[]=[], grassMaterials:THREE.MeshStandardMaterial[]=[], bankFillMaterials:THREE.MeshStandardMaterial[]=[], alphaFields:Uint8Array[]=[];
const bankMaterial=new THREE.MeshStandardMaterial({map:grassTexture,color:0x8e9a7b,roughness:1,side:THREE.DoubleSide});
// The curved road model has no rectangular sidewalk: the surrounding ground
// remains visible right up to its curved edge.
const curvedRoadGround=new THREE.PlaneGeometry(4,4);
const curvedRoadGroundMaterial=new THREE.MeshStandardMaterial({map:grassTexture,color:0xb1c3a5,roughness:1});
for(let mask=0;mask<16;mask++){
 const sprite=maskToSprite[mask],source=document.createElement('canvas');source.width=256;source.height=128;
 const sourceCtx=source.getContext('2d');if(!sourceCtx)throw new Error('Water sprite could not be read');
 sourceCtx.drawImage(waterAtlas.image,(sprite%4)*256,Math.floor(sprite/4)*128,256,128,0,0,256,128);
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Water sprite could not be projected');
 ctx.setTransform(.5,-.5,1,1,-64,64);ctx.drawImage(source,0,0);ctx.setTransform(1,0,0,1,0,0);
 const pixels=ctx.getImageData(0,0,128,128),alpha=new Uint8Array(128*128);
 // Transparent pixels at diamond tips otherwise form artificial holes where
 // four tiles meet. Resolve the tips using the shared wet/dry corner mask.
 const cornerBits=[1,2,4,8],cornerXY=[[0,0],[127,0],[127,127],[0,127]];
 for(let c=0;c<4;c++)for(let yy=0;yy<10;yy++)for(let xx=0;xx<10;xx++){
  const px=cornerXY[c][0]===0?xx:127-xx,py=cornerXY[c][1]===0?yy:127-yy,idx=(py*128+px)*4;
  const target=mask&cornerBits[c]?255:0, weight=Math.max(0,1-Math.max(xx,yy)/10);
  if(target && pixels.data[idx+3]<100){pixels.data[idx]=135;pixels.data[idx+1]=210;pixels.data[idx+2]=225;}
  pixels.data[idx+3]=Math.round(pixels.data[idx+3]*(1-weight)+target*weight);
 }
 ctx.putImageData(pixels,0,0);
 const maskCanvas=document.createElement('canvas');maskCanvas.width=128;maskCanvas.height=128;
 const maskCtx=maskCanvas.getContext('2d');if(!maskCtx)throw new Error('Bank mask could not be created');
 const land=maskCtx.createImageData(128,128);
 for(let i=0;i<alpha.length;i++){
  alpha[i]=pixels.data[i*4+3];const v=255-alpha[i];land.data.set([v,v,v,255],i*4);
 }
 alphaFields.push(alpha);maskCtx.putImageData(land,0,0);
 const spriteTexture=new THREE.CanvasTexture(canvas);spriteTexture.colorSpace=THREE.SRGBColorSpace;
 const landMask=new THREE.CanvasTexture(maskCanvas);
 const water=new THREE.MeshStandardMaterial({map:spriteTexture,transparent:true,alphaTest:.03,depthWrite:true,roughness:.28,metalness:.04,side:THREE.DoubleSide});
 water.onBeforeCompile=shader=>{
  shader.uniforms.riverTime=waterClock;shader.vertexShader='uniform float riverTime;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   transformed.y += sin(position.x * 1.8 + riverTime * 2.1) * 0.055 + sin(position.z * 2.4 - riverTime * 1.6) * 0.035;`);
 };
 waterMaterials.push(water);
 grassMaterials.push(new THREE.MeshStandardMaterial({map:grassTexture,alphaMap:landMask,alphaTest:.5,color:0xb1c3a5,roughness:1,side:THREE.DoubleSide}));
 bankFillMaterials.push(new THREE.MeshStandardMaterial({map:grassTexture,alphaMap:landMask,alphaTest:.5,color:0x708660,roughness:1,side:THREE.DoubleSide}));
}
async function model(pack:string, name:string) {
 const entry=Object.entries(files).find(([p])=>p.includes(pack) && p.endsWith('/'+name+'.glb'));
 if(!entry) throw new Error(`Missing asset ${pack}/${name}`);
 const obj=(await loader.loadAsync(entry[1])).scene;
 obj.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
 return obj;
}
// The supplied FBX pack references a texture_gradient.png file that is not
// present in the pack. Load the supplied geometry and give it simple materials
// using its vertex heights, without requesting or inventing another image asset.
const natureFiles=import.meta.glob('../assets/nature/**/*.fbx',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const natureManager=new THREE.LoadingManager();
const missingAtlasHandler={setPath(){return this;},load(){return new THREE.Texture();}};
natureManager.addHandler(/\.png$/i,missingAtlasHandler as unknown as THREE.Loader);
const natureLoader=new FBXLoader(natureManager);
const natureMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true});
async function natureModel(name:string,kind:'conifer'|'tree'|'bush'|'stone'|'flower'|'grass'|'log',width:number){
 const entry=Object.entries(natureFiles).find(([p])=>p.endsWith('/'+name+'.fbx'));
 if(!entry)throw new Error('Missing nature model: '+name);
 const source=await natureLoader.loadAsync(entry[1]);source.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(source),center=bounds.getCenter(new THREE.Vector3());
 const dim=bounds.getSize(new THREE.Vector3()),scale=width/Math.max(dim.x,dim.z);
 const out=new THREE.Group();
 source.traverse(node=>{
  if(!(node instanceof THREE.Mesh))return;
  const geometry=node.geometry.clone();geometry.applyMatrix4(node.matrixWorld);
  const positions=geometry.getAttribute('position'),colors:number[]=[];
  const leaf=new THREE.Color(kind==='conifer'?0x315e42:kind==='tree'?0x59824b:kind==='bush'?0x527d43:kind==='stone'?0x797b71:kind==='flower'?0x769957:kind==='log'?0x77583f:0x6b8d4e);
  const trunk=new THREE.Color(0x735039);
  for(let i=0;i<positions.count;i++){
   const y=(positions.getY(i)-bounds.min.y)/Math.max(dim.y,.001);
   const color=(kind==='conifer'||kind==='tree')&&y<.18?trunk:leaf;
   colors.push(color.r,color.g,color.b);
   positions.setXYZ(i,(positions.getX(i)-center.x)*scale,(positions.getY(i)-bounds.min.y)*scale,(positions.getZ(i)-center.z)*scale);
  }
  positions.needsUpdate=true;geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,natureMaterial);mesh.castShadow=true;mesh.receiveShadow=true;out.add(mesh);
 });
 return out;
}
const natureSpecs=[
 ['Tree_Spruce_small_01','conifer',2.4],['Tree_Spruce_small_02','conifer',2.6],['Tree_Spruce_tiny_01','conifer',1.4],
 ['Tree_average_lush','tree',3],['Tree_small_regular','tree',2],['Tree_average_bare','tree',2.7],
 ['Bush_average','bush',1.4],['Bush_group_small','bush',1.9],['Grass_bush_high_01','grass',1],
 ['Stone_average_01','stone',1.4],['Stone_group_average','stone',2],['Stone_group_average_mossy','stone',2],
 ['Flower_bush_blue','flower',1],['Flower_bush_white','flower',1],['Log_big_regular','log',1.8],['Stump_average_low','log',.9]
] as const;
const nature=await Promise.all(natureSpecs.map(([name,kind,width])=>natureModel(name,kind,width)));
// Each garden mesh is authored in a shared scene, so preserve its world
// transform before recentering it as an independently placeable object.
const gardenManager=new THREE.LoadingManager();
gardenManager.setURLModifier(url=>url.endsWith('scene.bin')?gardenBin:url.endsWith('Material.001_baseColor.png')?gardenTexture1:url.endsWith('Material.002_baseColor.png')?gardenTexture2:url);
const gardenScene=await new GLTFLoader(gardenManager).parseAsync(gardenSource,'');gardenScene.scene.updateMatrixWorld(true);
function gardenPart(name:string,width:number){
 const source=gardenScene.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));if(!source)throw new Error('Missing garden asset '+name);
 const part=source.clone();part.matrix.copy(source.matrixWorld);part.matrixAutoUpdate=false;
 const content=new THREE.Group();content.add(part);content.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(content),center=box.getCenter(new THREE.Vector3()),dim=box.getSize(new THREE.Vector3()),scale=width/Math.max(dim.x,dim.z);
 content.position.set(-center.x,-box.min.y,-center.z);const result=new THREE.Group();result.add(content);result.scale.setScalar(scale);
 result.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});return result;
}
const bushFiles=import.meta.glob('../assets/bush/Bush_temp_climate/Fbx/*.fbx',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const bushTexture=await textureLoader.loadAsync(bushTextureUrl);bushTexture.colorSpace=THREE.SRGBColorSpace;
const bushManager=new THREE.LoadingManager();
const bushHandler={setPath(){return this;},load(){return bushTexture;}};
bushManager.addHandler(/\.(png|jpe?g)$/i,bushHandler as unknown as THREE.Loader);
const cityBushes=await Promise.all(Object.values(bushFiles).map(async url=>{
 const bush=await new FBXLoader(bushManager).loadAsync(url);bush.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(bush),center=box.getCenter(new THREE.Vector3()),dim=box.getSize(new THREE.Vector3());
 bush.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));
 const root=new THREE.Group();root.add(bush);root.scale.setScalar(1.05/Math.max(dim.x,dim.z));
 const material=new THREE.MeshStandardMaterial({map:bushTexture,roughness:1,side:THREE.DoubleSide});
 root.traverse(o=>{if(o instanceof THREE.Mesh){o.material=material;o.castShadow=true;o.receiveShadow=true;}});return root;
}));
const gardenParts=[gardenPart('bush.003_13',1.3),gardenPart('bush.001_16',1.3),gardenPart('flower.001_15',.75),gardenPart('flower.002_18',.75),cityBushes[0],gardenPart('Lantern_32',.55),gardenPart('trash_can_38',.55)];
const benchSource=await new FBXLoader().loadAsync(benchUrl);benchSource.updateMatrixWorld(true);
const benchBox=new THREE.Box3().setFromObject(benchSource),benchCenter=benchBox.getCenter(new THREE.Vector3()),benchDim=benchBox.getSize(new THREE.Vector3());
const benchModel=new THREE.Group();benchSource.position.sub(new THREE.Vector3(benchCenter.x,benchBox.min.y,benchCenter.z));benchModel.add(benchSource);benchModel.scale.setScalar(1.8/Math.max(benchDim.x,benchDim.z));benchModel.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});

// The Blender source contains separate shop meshes; these GLBs are exports
// of those supplied meshes with their supplied palette embedded.
const shopFiles=import.meta.glob('../assets/shops/generated/*.glb',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const shops=await Promise.all(Object.entries(shopFiles).sort(([a],[b])=>a.localeCompare(b)).map(async ([,url])=>{
 const source=(await loader.loadAsync(url)).scene;source.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(source),center=bounds.getCenter(new THREE.Vector3()),dim=bounds.getSize(new THREE.Vector3());
 source.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));const root=new THREE.Group();root.add(source);root.scale.setScalar(3.25/Math.max(dim.x,dim.z));
 root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});return root;
}));
const bankTexture=await textureLoader.loadAsync(bankTextureUrl);bankTexture.colorSpace=THREE.SRGBColorSpace;
const bankSource=await new FBXLoader().loadAsync(bankUrl);
// The source also contains a large perimeter and ground plane; keep the bank
// building itself so it fits the reserved two-by-two urban parcel.
for(const child of [...bankSource.children])if(/^(Cube|Plane|cespugli|piante)/i.test(child.name))bankSource.remove(child);
bankSource.traverse(o=>{if(o instanceof THREE.Mesh){
 const setMaterial=(m:THREE.Material)=>{if(m.name!=='TEXTURE')return m;const copy=m.clone() as THREE.MeshStandardMaterial;copy.map=bankTexture;copy.color.set(0xffffff);copy.needsUpdate=true;return copy;};
 o.material=Array.isArray(o.material)?o.material.map(setMaterial):setMaterial(o.material);o.castShadow=true;o.receiveShadow=true;
}});
bankSource.updateMatrixWorld(true);
const bankBounds=new THREE.Box3().setFromObject(bankSource),bankCenter=bankBounds.getCenter(new THREE.Vector3()),bankDim=bankBounds.getSize(new THREE.Vector3());
bankSource.position.sub(new THREE.Vector3(bankCenter.x,bankBounds.min.y,bankCenter.z));
const bankModel=new THREE.Group();bankModel.add(bankSource);bankModel.scale.setScalar(7.2/Math.max(bankDim.x,bankDim.z));
if(!shops.length)throw new Error('Shop models could not be loaded.');
const roadNames=['road-straight','road-crossroad','road-crossing','tile-low','light-curved','road-bend-square','road-intersection','road-intersection-line','road-crossroad-line','road-end','road-sign-stop','traffic-light','dumpster','construction-cone','road-bridge','road-slant','road-slant-high','road-roundabout','road-roundabout-barrier','bridge-pillar','bridge-pillar-wide','road-bend-sidewalk','road-bend'];
const buildingNames=Array.from('abcdefghijklmn',c=>'building-'+c);
const [roads, buildings, factories, houses] = await Promise.all([
 Promise.all(roadNames.map(n=>model('city-kit-roads',n))),
 Promise.all(buildingNames.map(n=>model('city-kit-commercial',n))),
 Promise.all(Array.from('abcdefgh',c=>model('city-kit-industrial','building-'+c))),
 Promise.all(['building-type-a','building-type-b','building-type-c','building-type-d','building-type-e'].map(n=>model('city-kit-suburban',n)))
]);
const size=4, chunkTiles=8, chunkSize=size*chunkTiles;
function prepare(o:THREE.Object3D, max:number) { const box=new THREE.Box3().setFromObject(o); const s=box.getSize(new THREE.Vector3()); const scale=max/Math.max(s.x,s.z); o.scale.setScalar(scale); }
roads.forEach((o,i)=>{ if(i===17||i===18) prepare(o,size*3); else if(i===19||i===20) o.scale.setScalar(size); else prepare(o,i===4?1.4:i>=10&&i<=13?1.0:size); }); buildings.forEach(o=>prepare(o,3.35)); factories.forEach(o=>prepare(o,3.35)); houses.forEach(o=>prepare(o,3.2));
type AtmExterior={id:string;x:number;z:number};
type ShopExterior={kind:'shop'|'bank'|'house';id:string;x:number;z:number;doorX:number;doorZ:number;tileX:number;tileZ:number;object?:THREE.Object3D;bounds?:THREE.Box3};
const chunks=new Map<string,{group:THREE.Group, bodies:RAPIER.RigidBody[],occluders:BuildingOccluder[],shops:ShopExterior[],atms:AtmExterior[],ragdollBuildings:RagdollBuilding[],obstacles:{x:number;z:number;halfX:number;halfZ:number}[]}>();
function random(x:number,z:number,s=0){let n=Math.imul(x,374761393)+Math.imul(z,668265263)+Math.imul(s,1442695041); n=Math.imul(n^(n>>>13),1274126177); return ((n^(n>>>16))>>>0)/4294967296;}
// Each region contains one city surrounded by countryside. Coordinates and
// types are deterministic so adjacent streamed chunks describe the same city.
const CITY_SPACING=56;
function cityAt(x:number,z:number){
 const ix=Math.round(x/CITY_SPACING),iz=Math.round(z/CITY_SPACING);
 const dx=x-ix*CITY_SPACING,dz=z-iz*CITY_SPACING;
 const distance=Math.hypot(dx,dz),radius=17+random(ix,iz,601)*2;
 const type=((ix+2*iz)%3+3)%3;
 return {ix,iz,distance,radius,type,urban:districtIndex(ix,iz)>=0&&distance<radius&&boundaryDistance(x,z,CITY_SPACING)>=8};
}
function axisDistance(value:number){const r=((value%CITY_SPACING)+CITY_SPACING)%CITY_SPACING;return Math.min(r,CITY_SPACING-r);}
function highwayRow(x:number,row:number){
 const range=safeBanksAt(x,Math.round(row/48));
 // Take a connected detour along the near bank when a river meets the route.
 return range?Math.min(row,range.low-1):row;
}
function highwayAt(x:number,z:number){
 if(axisDistance(x)===0)return true;
 const row=Math.round(z/CITY_SPACING)*CITY_SPACING;
 const here=highwayRow(x,row),previous=highwayRow(x-1,row);
 return z>=Math.min(here,previous)&&z<=Math.max(here,previous);
}
function lakeDistance(x:number,z:number):number {
 // Lakes live between four cities, away from their connecting highway axes.
 const ix=Math.floor(x/CITY_SPACING),iz=Math.floor(z/CITY_SPACING);
 let d=100;
 for(let a=-1;a<=0;a++)for(let b=-1;b<=0;b++){
  const rx=ix+a,rz=iz+b;if(random(rx,rz,610)<.27)continue;
  const cx=(rx+.5)*CITY_SPACING+(random(rx,rz,611)-.5)*4;
  const cz=(rz+.5)*CITY_SPACING+(random(rx,rz,612)-.5)*4;
  const sx=4.5+random(rx,rz,613)*2.5,sz=3.3+random(rx,rz,614)*2.0;
  const dx=(x-cx)/sx,dz=(z-cz)/sz;
  d=Math.min(d,(Math.hypot(dx,dz)-1)*Math.min(sx,sz));
 }
 return d;
}
function valueNoise(x:number,z:number,scale:number,seed:number){
 const ix=Math.floor(x/scale),iz=Math.floor(z/scale),u=smooth((x-ix*scale)/scale),v=smooth((z-iz*scale)/scale);
 const a=random(ix,iz,seed)*(1-u)+random(ix+1,iz,seed)*u;
 const b=random(ix,iz+1,seed)*(1-u)+random(ix+1,iz+1,seed)*u;
 return a*(1-v)+b*v;
}
function terrainHeight(x:number,z:number){
 const edge=boundaryDistance(x,z,CITY_SPACING);
 if(edge<8){const ridge=edge<0?1:smooth((8-edge)/8);return ridge*(30+valueNoise(x,z,5,638)*5);}
 const city=cityAt(x,z);
 const rural=smooth((city.distance-city.radius-1)/10);
 const roadClearance=smooth((Math.min(axisDistance(x),axisDistance(z))-1.15)/6);
 const waterClearance=smooth((Math.min(riverDistance(x,z),lakeDistance(x,z))-1.2)/6);
 // Offset peaks form irregular pointed ridges rather than a single rounded
 // noise mound. The same world-coordinate field is evaluated on every chunk.
 const cell=18,ix=Math.floor(x/cell),iz=Math.floor(z/cell);
 let peaks=0;
 for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
  const px=ix+a,pz=iz+b;
  const cx=(px+.2+random(px,pz,625)*.6)*cell,cz=(pz+.2+random(px,pz,626)*.6)*cell;
  const angle=random(px,pz,627)*Math.PI,dx=x-cx,dz=z-cz;
  const u=dx*Math.cos(angle)+dz*Math.sin(angle),v=-dx*Math.sin(angle)+dz*Math.cos(angle);
  const radiusX=7+random(px,pz,628)*6,radiusZ=4.5+random(px,pz,629)*3;
  const radial=Math.hypot(u/radiusX,v/radiusZ);
  const peak=Math.pow(Math.max(0,1-radial),1.45)*(22+random(px,pz,630)*14);
  peaks=Math.max(peaks,peak);
 }
 const foothills=valueNoise(x,z,15,620)*5+valueNoise(x,z,5,621)*2;
 return rural*roadClearance*waterClearance*(peaks+foothills);
}
// Finite sections fade in and out independently while a meandering side
// channel can branch away from a main river. World-coordinate sampling makes
// both banks agree exactly across chunk boundaries and for negative positions.
function smooth(t:number){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}
function riverDistance(x:number,z:number):number {
 let best=Infinity;
 const nearest=Math.round(z/48);
 for(let band=nearest-1;band<=nearest+1;band++){
  const segment=Math.floor(x/72), t=(x-segment*72)/72;
  const presence=(i:number)=>(band===0&&(i===0||i===-1))||random(i,band,301)>.32?1:0;
  const active=presence(segment);
  const left=presence(segment-1)?1:smooth(t/.18);
  const right=presence(segment+1)?1:smooth((1-t)/.18);
  const endFade=active*Math.min(left,right);
  const center=band*48+Math.sin(x*.20+band*3.8)*3.4+Math.sin(x*.058+band*1.4)*2.3;
  const width=(1.1+.32*Math.sin(x*.19+band)+.2*Math.sin(x*.47+band*2))*endFade;
  if(width>.03) best=Math.min(best,Math.abs(z-center)-width);
  if(presence(segment)&&random(segment,band,302)>.38 && t>.15 && t<.85){
   const u=(t-.15)/.70, side=random(segment,band,303)>.5?1:-1;
   const branchCenter=center+side*(u*8.5);
   const branchWidth=.62*smooth(u/.12)*smooth((1-u)/.18);
   if(branchWidth>.03) best=Math.min(best,Math.abs(z-branchCenter)-branchWidth);
  }
 }
 return Math.min(best,100);
}
// River occupancy is decided before roads, independently of loaded chunks.
const riverMaskCache=new Map<string,number>();
function riverMask(gx:number,gz:number){
  // Vertex noise changes the shape at tile corners, so water can turn,
  // widen and branch; shared vertex coordinates keep adjacent tiles aligned.
  const rawWet=(x:number,z:number)=>Math.min(riverDistance(x,z),lakeDistance(x,z))+.15*Math.sin(x*1.7+z*.9)+.10*Math.sin(z*1.9-x*.6)<0;
  const wet=(x:number,z:number)=>rawWet(x,z)||[rawWet(x-1,z),rawWet(x+1,z),rawWet(x,z-1),rawWet(x,z+1)].filter(Boolean).length>=3;
  return Number(wet(gx-.5,gz-.5))+2*Number(wet(gx+.5,gz-.5))+4*Number(wet(gx+.5,gz+.5))+8*Number(wet(gx-.5,gz+.5));
 }

function waterMask(x:number,z:number):number {
 if(boundaryDistance(x,z,CITY_SPACING)<8)return 0;
 const key=`${x},${z}`;let mask=riverMaskCache.get(key);
 if(mask===undefined){const raw=riverMask(x,z);mask=raw===5||raw===10?15:raw;riverMaskCache.set(key,mask);}
 return mask;
}
type BankRange={low:number,high:number};
const bankCache=new Map<string,BankRange|null>();
function banksAt(x:number,band:number):BankRange|null {
 const key=`${x},${band}`;if(bankCache.has(key))return bankCache.get(key)!;
 let low=Infinity,high=-Infinity;
 for(let z=band*48-18;z<=band*48+18;z++) if(riverDistance(x,z)<3.5 && waterMask(x,z)){low=Math.min(low,z);high=Math.max(high,z);}
 const range=Number.isFinite(low)?{low,high}:null;bankCache.set(key,range);return range;
}
// Keep both banks outside the widest water footprint in neighbouring columns.
// Thus a connecting segment cannot be removed by a bend or a branch.
function safeBanksAt(x:number,band:number):BankRange|null {
 let low=Infinity,high=-Infinity;
 for(let dx=-2;dx<=2;dx++){
  const r=banksAt(x+dx,band);if(r){low=Math.min(low,r.low);high=Math.max(high,r.high);}
 }
 return Number.isFinite(low)?{low,high}:null;
}
// One-tile quays follow the river's outside bank; vertical connectors fill in
// whenever the course changes between adjacent columns.
function bankRoadAt(x:number,z:number):boolean {
 if(waterMask(x,z))return false;
 const band=Math.round(z/48);
 for(let b=band-1;b<=band+1;b++){
  const now=safeBanksAt(x,b);if(!now)continue;
  for(const side of [-1,1]){
   const edge=side<0?now.low-1:now.high+1;
   if(z===edge)return true;
   const prev=safeBanksAt(x-1,b);if(!prev)continue;
   const other=side<0?prev.low-1:prev.high+1;
   if(z>=Math.min(edge,other)&&z<=Math.max(edge,other))return true;
  }
 }
 return false;
}
// At most one crossing in each 48-tile stretch of each river. The deck spans
// all water cells; the two ramp tiles connect directly to the bank roads.
type RiverBridge={part:'deck'|'north'|'south'};
function riverBridgeAt(x:number,z:number):RiverBridge|null {
 if(((x%CITY_SPACING)+CITY_SPACING)%CITY_SPACING!==0)return null;
 const band=Math.round(z/48), range=safeBanksAt(x,band);if(!range)return null;
 if(range.high-range.low>9)return null;
 if(z>=range.low&&z<=range.high)return {part:'deck'};
 if(z===range.low-1)return {part:'north'};
 if(z===range.high+1)return {part:'south'};
 return null;
}
// Each 12Ã—12 district has perimeter avenues and two irregular through streets.
// Decisions use world coordinates, so neighbouring chunks always agree at their edges.
function baseRoadAt(x:number,z:number):boolean {
 const district=12, mx=Math.floor(x/district), mz=Math.floor(z/district);
 const lx=((x%district)+district)%district, lz=((z%district)+district)%district;
 if(lx===0||lz===0) return true;
 const h1=3+Math.floor(random(mx,mz,11)*3), h2=6+Math.floor(random(mx,mz,12)*3);
 const hx=3+Math.floor(random(mx,mz,13)*5);
 const v1=3+Math.floor(random(mx,mz,14)*3), v2=6+Math.floor(random(mx,mz,15)*3);
 const vz=3+Math.floor(random(mx,mz,16)*5);
 const horizontal=(lx<=hx&&lz===h1)||(lx>=hx&&lz===h2)||(lx===hx&&lz>=Math.min(h1,h2)&&lz<=Math.max(h1,h2));
 const vertical=(lz<=vz&&lx===v1)||(lz>=vz&&lx===v2)||(lz===vz&&lx>=Math.min(v1,v2)&&lx<=Math.max(v1,v2));
 // Omit some local streets to create larger, less uniform blocks.
 return (random(mx,mz,17)>.2&&horizontal)||(random(mx,mz,18)>.2&&vertical);
}
// Reserve a complete 3Ã—3 footprint for each roundabout and keep side streets
// away from its perimeter. Decisions are independent of chunk loading order.
function roundaboutAt(x:number,z:number) {
 const ix=Math.round(x/12), iz=Math.round(z/12), cx=ix*12, cz=iz*12;
 return random(ix,iz,110)>.87 && cityAt(cx,cz).urban && riverDistance(cx,cz)>4 && lakeDistance(cx,cz)>4 ? {cx,cz} : null;
}
function roadAt(x:number,z:number):boolean {
 if(waterMask(x,z))return false;
 // Existing streets stop at the green corridor; its bank road replaces them.
 if(bankRoadAt(x,z))return true;
 const r=roundaboutAt(x,z);
 if(r && Math.abs(x-r.cx)<=2 && Math.abs(z-r.cz)<=2 && x!==r.cx && z!==r.cz) return false;
 return highwayAt(x,z)||(cityAt(x,z).urban&&baseRoadAt(x,z));
}
type Bridge = {index:number,length:number,axis:0|1,ramps:number,variant:number,side:number};
const bridgeCache = new Map<string, Bridge | null>();
function bridgePart(x:number,z:number):Bridge|null {
 const key=`${x},${z}`;
 if(bridgeCache.has(key)) return bridgeCache.get(key)!;
 // Avenues on both axes are candidates; each span is generated as a unit.
 for(const axis of [0,1] as const){
  const along=axis===0?x:z, across=axis===0?z:x;
  if(((across%12)+12)%12!==0 || ((along%12)+12)%12===0 || riverDistance(x,z)<5 || !cityAt(x,z).urban) continue;
  const district=Math.floor(along/12), row=Math.floor(across/12);
  const r=random(district,row,axis===0?71:72);
  if(r<.18) continue;
  const variant=Math.floor(random(district,row,axis===0?73:74)*3);
  const length=variant===0?3:variant===1?5:7, ramps=variant===0?1:2;
  const start=district*12+6-Math.floor(length/2), index=along-start;
  if(index<0 || index>=length)continue;
  let clear=true;
  for(let i=0;i<length;i++){
   const a=start+i, px=axis===0?a:across, pz=axis===0?across:a;
   const side1=axis===0?roadAt(px,pz-1):roadAt(px-1,pz);
   const side2=axis===0?roadAt(px,pz+1):roadAt(px+1,pz);
   const round=roundaboutAt(px,pz);
   if(side1||side2||!roadAt(px,pz)||riverDistance(px,pz)<5||(round&&Math.abs(px-round.cx)<=1&&Math.abs(pz-round.cz)<=1)){clear=false;break;}
  }
  if(clear){
   // A second parallel span is used only where the whole corridor and its
   // approach tiles are free; this also prevents buildings under the new lane.
   let side=0;
   if(random(district,row,axis===0?81:82)>.38){
    for(const candidate of (random(district,row,83)>.5?[1,-1]:[-1,1])){
     let free=true;
     for(let i=-1;i<=length;i++){
      const a=start+i, px=axis===0?a:across+candidate, pz=axis===0?across+candidate:a;
      const r=roundaboutAt(px,pz);
      if(roadAt(px,pz)||(r&&Math.abs(px-r.cx)<=1&&Math.abs(pz-r.cz)<=1)){free=false;break;}
     }
     if(free){side=candidate;break;}
    }
   }
   const result={index,length,axis,ramps,variant,side}; bridgeCache.set(key,result);return result;
  }
 }
 bridgeCache.set(key,null);return null;
}
function secondaryBridgeAt(x:number,z:number):Bridge|null {
 for(const axis of [0,1] as const) for(const side of [-1,1]){
  const b=bridgePart(x-(axis===1?side:0),z-(axis===0?side:0));
  if(b&&b.axis===axis&&b.side===side)return b;
 }
 return null;
}
function bridgeApproachAt(x:number,z:number):boolean {
 for(const axis of [0,1] as const) for(const side of [-1,1]) for(const step of [-1,1]){
  const mx=x-(axis===1?side:0)+(axis===0?step:0);
  const mz=z-(axis===0?side:0)+(axis===1?step:0);
  const b=bridgePart(mx,mz);
  if(b&&b.axis===axis&&b.side===side && (step===1?b.index===0:b.index===b.length-1))return true;
 }
 return false;
}
function effectiveRoadAt(x:number,z:number):boolean {
 if(boundaryDistance(x,z,CITY_SPACING)<8)return false;
 if(waterMask(x,z))return !!riverBridgeAt(x,z);
 return !!riverBridgeAt(x,z)||roadAt(x,z)||!!secondaryBridgeAt(x,z)||bridgeApproachAt(x,z);
}
type BenchSpot={x:number,z:number,rotation:number};
type Garden={x:number,z:number,road:Node,tiles:Set<string>,edges:[number,number,number,number][],benches:Map<string,BenchSpot>};
const gardenCache=new Map<string,Garden[]>();
const gardenKey=(x:number,z:number)=>`${x},${z}`;
function* planCityGardens(ix:number,iz:number):Generator<void,Garden[],void> {
 const id=`${ix},${iz}`;if(gardenCache.has(id))return gardenCache.get(id)!;
 const candidates:{garden:Garden;score:number}[]=[];
 const cx=ix*CITY_SPACING,cz=iz*CITY_SPACING,availability=new Map<string,boolean>();
 const free=(x:number,z:number)=>{
  const k=gardenKey(x,z),cached=availability.get(k);if(cached!==undefined)return cached;
  const city=cityAt(x,z),r=roundaboutAt(x,z);
  const valid=city.ix===ix&&city.iz===iz&&city.urban&&!waterMask(x,z)&&!effectiveRoadAt(x,z)&&!(r&&Math.abs(x-r.cx)<=1&&Math.abs(z-r.cz)<=1);
  availability.set(k,valid);return valid;
 };
 for(let dx=-13;dx<=13;dx++)for(let dz=-13;dz<=13;dz++){
  yield;
  const x=cx+dx,z=cz+dz;let valid=true;
  for(let a=0;a<3;a++)for(let b=0;b<3;b++)if(!free(x+a,z+b))valid=false;
  if(!valid)continue;
  const tiles=new Set<string>();for(let a=0;a<3;a++)for(let b=0;b<3;b++)tiles.add(gardenKey(x+a,z+b));
  // A solid 3x3 heart keeps the park broad; irregular extensions use only
  // adjacent, vacant blocks, never remove streets or cross water.
  for(let i=0;i<3;i++)for(const [a,b] of [[-1,i],[3,i],[i,-1],[i,3]]){
   if(free(x+a,z+b)&&random(x+a,z+b,850)>.17)tiles.add(gardenKey(x+a,z+b));
  }
  for(const [a,b] of [[-1,-1],[-1,3],[3,-1],[3,3]]){
   if(free(x+a,z+b)&&random(x+a,z+b,851)>.5&&(tiles.has(gardenKey(x+(a===-1?0:2),z+b))||tiles.has(gardenKey(x+a,z+(b===-1?0:2)))))tiles.add(gardenKey(x+a,z+b));
  }
  const approaches:Node[]=[];
  for(const tile of tiles){const [px,pz]=tile.split(',').map(Number);for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const tx=px+a,tz=pz+b;if(!tiles.has(gardenKey(tx,tz))&&effectiveRoadAt(tx,tz)&&!riverBridgeAt(tx,tz)&&!bridgePart(tx,tz))approaches.push({x:tx,z:tz});
  }}
  if(!approaches.length)continue;
  const score=tiles.size*4-Math.hypot(dx,dz)*.8+random(x,z,843)*3;
  candidates.push({garden:{x,z,road:approaches[0],tiles,edges:[],benches:new Map()},score});
 }
 candidates.sort((a,b)=>b.score-a.score);
 const chosen:Garden[]=[];
 for(const {garden} of candidates){
  if(chosen.some(other=>Math.hypot(garden.x-other.x,garden.z-other.z)<8||[...garden.tiles].some(tile=>{const [x,z]=tile.split(',').map(Number);return [[0,0],[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>other.tiles.has(gardenKey(x+a,z+b)));})))continue;
  chosen.push(garden);if(chosen.length===2)break;
 }
 for(const best of chosen)for(const tile of best.tiles){const [x,z]=tile.split(',').map(Number);
  if(!best.tiles.has(gardenKey(x-1,z)))best.edges.push([x-.5,z-.5,x-.5,z+.5]);
  if(!best.tiles.has(gardenKey(x+1,z)))best.edges.push([x+.5,z-.5,x+.5,z+.5]);
  if(!best.tiles.has(gardenKey(x,z-1)))best.edges.push([x-.5,z-.5,x+.5,z-.5]);
  if(!best.tiles.has(gardenKey(x,z+1)))best.edges.push([x-.5,z+.5,x+.5,z+.5]);
 }
 // Reserve roadside bench positions before placing any plants, including
 // across tile and streamed-chunk boundaries.
 for(const g of chosen){
  const spots:{tile:string;spot:BenchSpot;rank:number}[]=[];
  for(const tile of g.tiles){const [x,z]=tile.split(',').map(Number);
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const rx=x+dx,rz=z+dz;
    if(!effectiveRoadAt(rx,rz)||riverBridgeAt(rx,rz)||bridgePart(rx,rz)||secondaryBridgeAt(rx,rz))continue;
    spots.push({tile,spot:{x:x*size+dx*1.42,z:z*size+dz*1.42,rotation:dx?0:Math.PI/2},rank:random(x,z,855+dx*3+dz*7)});
   }
  }
  spots.sort((a,b)=>a.rank-b.rank);
  for(const {tile,spot} of spots){
   if(g.benches.has(tile)||[...g.benches.values()].some(b=>Math.hypot(b.x-spot.x,b.z-spot.z)<3))continue;
   g.benches.set(tile,spot);if(g.benches.size===3)break;
  }
 }
 gardenCache.set(id,chosen);return chosen;
}
function cityGardens(ix:number,iz:number):Garden[]{
 const cached=gardenCache.get(`${ix},${iz}`);if(cached)return cached;
 const job=planCityGardens(ix,iz);let result=job.next();while(!result.done)result=job.next();return result.value;
}
function gardenAt(x:number,z:number){const city=cityAt(x,z);if(!city.urban)return null;return cityGardens(city.ix,city.iz).find(g=>g.tiles.has(gardenKey(x,z)))??null;}
type CityFeature={kind:'bank'|'shop'|'atm';x:number;z:number;rotation:number;variant:number;anchor:boolean};
const cityFeatureCache=new Map<string,Map<string,CityFeature>>();
function* planCityFeatures(ix:number,iz:number):Generator<void,Map<string,CityFeature>,void>{
 const id=`${ix},${iz}`,cached=cityFeatureCache.get(id);if(cached)return cached;
 const result=new Map<string,CityFeature>(),cx=ix*CITY_SPACING,cz=iz*CITY_SPACING;
 const valid=(x:number,z:number)=>{
  const city=cityAt(x,z),r=roundaboutAt(x,z);
  return city.ix===ix&&city.iz===iz&&city.urban&&!waterMask(x,z)&&!effectiveRoadAt(x,z)&&!gardenAt(x,z)&&!(r&&Math.abs(x-r.cx)<=1&&Math.abs(z-r.cz)<=1);
 };
 const roadSide=(x:number,z:number,w:number)=>{
  const options:{dx:number;dz:number}[]=[];
  for(let i=0;i<w;i++)for(const [px,pz,dx,dz] of [[x-1,z+i,-1,0],[x+w,z+i,1,0],[x+i,z-1,0,-1],[x+i,z+w,0,1]]){
   if(effectiveRoadAt(px,pz)&&!riverBridgeAt(px,pz)&&!bridgePart(px,pz)&&!secondaryBridgeAt(px,pz))options.push({dx,dz});
  }
  return options[0]??null;
 };
 const banks:{x:number;z:number;dx:number;dz:number;score:number}[]=[];
 for(let dx=-15;dx<=14;dx++)for(let dz=-15;dz<=14;dz++){
  yield;
  const x=cx+dx,z=cz+dz;if(!valid(x,z)||!valid(x+1,z)||!valid(x,z+1)||!valid(x+1,z+1))continue;
  const side=roadSide(x,z,2);if(side)banks.push({x,z,...side,score:Math.hypot(dx,dz)+random(x,z,1001)*4});
 }
 banks.sort((a,b)=>a.score-b.score);const bank=banks[0];
 if(bank)for(let a=0;a<2;a++)for(let b=0;b<2;b++)result.set(gardenKey(bank.x+a,bank.z+b),{kind:'bank',x:bank.x,z:bank.z,rotation:Math.atan2(-bank.dz,bank.dx),variant:0,anchor:a===0&&b===0});
 const candidates:{x:number;z:number;dx:number;dz:number;score:number}[]=[];
 for(let dx=-17;dx<=17;dx++)for(let dz=-17;dz<=17;dz++){
  yield;
  const x=cx+dx,z=cz+dz;if(!valid(x,z)||result.has(gardenKey(x,z)))continue;
  const side=roadSide(x,z,1);if(side)candidates.push({x,z,...side,score:random(x,z,1002)});
 }
 candidates.sort((a,b)=>a.score-b.score);
 const selected:Node[]=[],count=5+Number(random(ix,iz,1003)>.5);
 for(const c of candidates){
  if(selected.some(p=>Math.hypot(c.x-p.x,c.z-p.z)<2.5))continue;
  selected.push(c);result.set(gardenKey(c.x,c.z),{kind:'shop',x:c.x,z:c.z,rotation:Math.atan2(-c.dz,c.dx),variant:Math.floor(random(c.x,c.z,1004)*shops.length),anchor:true});
  if(selected.length===count)break;
 }
 const atmCandidates=candidates.filter(c=>!result.has(gardenKey(c.x,c.z))).sort((a,b)=>random(a.x,a.z,1100)-random(b.x,b.z,1100));
 const atms:Node[]=[],atmCount=4+Number(random(ix,iz,1101)>.5);
 for(const c of atmCandidates){if(atms.some(p=>Math.hypot(c.x-p.x,c.z-p.z)<4))continue;atms.push(c);result.set(gardenKey(c.x,c.z),{kind:'atm',x:c.x,z:c.z,rotation:Math.atan2(-c.dz,c.dx),variant:0,anchor:true});if(atms.length===atmCount)break;}
 cityFeatureCache.set(id,result);return result;
}
function cityFeatures(ix:number,iz:number):Map<string,CityFeature>{
 const cached=cityFeatureCache.get(`${ix},${iz}`);if(cached)return cached;
 const job=planCityFeatures(ix,iz);let result=job.next();while(!result.done)result=job.next();return result.value;
}
function cityFeatureAt(x:number,z:number){const city=cityAt(x,z);return city.urban?cityFeatures(city.ix,city.iz).get(gardenKey(x,z))??null:null;}
// Edge distance makes the raised terrain meet roads and other plots smoothly,
// including the irregular extensions and independently streamed chunks.
function gardenHeight(g:Garden,x:number,z:number){
 let distance=Infinity;
 for(const [x1,z1,x2,z2] of g.edges){
  const dx=x2-x1,dz=z2-z1,t=Math.max(0,Math.min(1,((x-x1)*dx+(z-z1)*dz)/(dx*dx+dz*dz)));
  distance=Math.min(distance,Math.hypot(x-(x1+dx*t),z-(z1+dz*t)));
 }
 const fade=smooth(distance/1.15),cx=g.x+1,cz=g.z+1;
 const mound=(x0:number,z0:number,r:number)=>Math.exp(-((x-x0)**2+(z-z0)**2)/r);
 return fade*(.18+2.8*mound(cx-.55,cz-.45,.70)+2.1*mound(cx+.72,cz+.55,.85));
}
// Street benches sit along straight roads, with their long axis parallel to
// the curb. Garden-adjacent benches are handled by the garden layout instead.
function streetBenchAt(x:number,z:number):BenchSpot|null {
 if(random(x,z,870)<.965||!cityAt(x,z).urban||!effectiveRoadAt(x,z)||riverBridgeAt(x,z)||bridgePart(x,z)||secondaryBridgeAt(x,z))return null;
 const round=roundaboutAt(x,z);if(round&&Math.abs(x-round.cx)<=1&&Math.abs(z-round.cz)<=1)return null;
 const n=effectiveRoadAt(x,z-1),s=effectiveRoadAt(x,z+1),e=effectiveRoadAt(x+1,z),w=effectiveRoadAt(x-1,z);
 const vertical=n&&s&&!e&&!w,horizontal=e&&w&&!n&&!s;if(!vertical&&!horizontal)return null;
 const side=random(x,z,871)>.5?1:-1,dx=vertical?side:0,dz=horizontal?side:0;
 if(effectiveRoadAt(x+dx,z+dz)||waterMask(x+dx,z+dz)||gardenAt(x+dx,z+dz))return null;
 return {x:x*size+dx*1.48,z:z*size+dz*1.48,rotation:vertical?0:Math.PI/2};
}
function clearOfBenches(x:number,z:number,radius=1.65){
 const gx=Math.round(x/size),gz=Math.round(z/size),seen=new Set<Garden>();
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
  const street=streetBenchAt(gx+dx,gz+dz);
  if(street&&Math.hypot(street.x-x,street.z-z)<radius)return false;
  const garden=gardenAt(gx+dx,gz+dz);if(garden)seen.add(garden);
 }
 for(const garden of seen)for(const spot of garden.benches.values())if(Math.hypot(spot.x-x,spot.z-z)<radius)return false;
 return true;
}
// The shoreline sprites contain both grass and water in one tile. Sampling
// their original alpha field keeps movement aligned with the visible coast.
function isWaterAt(x:number,z:number){
 const gx=Math.round(x),gz=Math.round(z),mask=waterMask(gx,gz);
 if(!mask)return false;if(mask===15)return true;
 return shoreWater(mask,alphaFields[mask],x-gx+.5,z-gz+.5);
}
function surfaceHeight(x:number,z:number){
 if(boundaryDistance(x,z,CITY_SPACING)<8)return terrainHeight(x,z)+.075;
 const gx=Math.round(x),gz=Math.round(z),garden=gardenAt(gx,gz);
 if(garden)return gardenHeight(garden,x,z)+.012;
 const river=riverBridgeAt(gx,gz);
 if(river){if(river.part==='deck')return 1;const t=THREE.MathUtils.clamp(z-gz+.5,0,1);return river.part==='north'?t:1-t;}
 const bridge=bridgePart(gx,gz)||secondaryBridgeAt(gx,gz);
 if(bridge){const {index,length,ramps,axis}=bridge,t=THREE.MathUtils.clamp((axis===0?x-gx:z-gz)+.5,0,1);
  if(index<ramps)return index+t;if(index>=length-ramps)return length-1-index+1-t;return ramps;}
 if(waterMask(gx,gz))return isWaterAt(x,z)?-1.32:.082;
 if(!cityAt(gx,gz).urban&&!effectiveRoadAt(gx,gz))return terrainHeight(x,z)+.075;
 return 0;
}
const agents=await CityAgents.create(scene, {
 isRoad:effectiveRoadAt,
 roundabout:(x,z)=>{const r=roundaboutAt(x,z);return r&&Math.abs(x-r.cx)<=1&&Math.abs(z-r.cz)<=1?{x:r.cx,z:r.cz}:null;},
 isUrban:(x,z)=>cityAt(x,z).urban,
 isGarden:(x,z)=>!!gardenAt(Math.round(x),Math.round(z)),
 isPlayable:(x,z)=>boundaryDistance(x,z,CITY_SPACING)>=2,
 ragdollBuildings:(x,z,radius)=>{
  const cx=Math.floor((x+size/2)/chunkSize),cz=Math.floor((z+size/2)/chunkSize),result:RagdollBuilding[]=[];
  const reach=Math.ceil(radius/chunkSize)+1;
  for(let a=cx-reach;a<=cx+reach;a++)for(let b=cz-reach;b<=cz+reach;b++){
   const chunk=chunks.get(`${a},${b}`);if(!chunk)continue;
   for(const item of chunk.ragdollBuildings)if(Math.abs(x-item.x)<=radius+item.halfX&&Math.abs(z-item.z)<=radius+item.halfZ)result.push(item);
  }
  return result;
 },
 garden:(x,z,seed)=>{const c=cityAt(x,z),gardens=cityGardens(c.ix,c.iz),g=gardens.length?gardens[seed%gardens.length]:null;return g?{road:g.road,x:(g.x+1)*size,z:(g.z+1)*size}:null;},
 isHome:(x,z)=>{const city=cityAt(x,z),r=roundaboutAt(x,z);return city.urban&&city.type!==1&&!gardenAt(x,z)&&!cityFeatureAt(x,z)&&!waterMask(x,z)&&!effectiveRoadAt(x,z)&&!(r&&Math.abs(x-r.cx)<=1&&Math.abs(z-r.cz)<=1);},
 roadHeight:surfaceHeight
},world);
const bloodAtlas=await new THREE.TextureLoader().loadAsync(bloodUrl);
agents.setBloodTexture(bloodAtlas.image as HTMLImageElement);
const atmBodyGeometry=new THREE.BoxGeometry(1,1.65,.75),atmScreenGeometry=new THREE.BoxGeometry(.7,.43,.04);
const atmBodyMaterial=new THREE.MeshStandardMaterial({color:0x647a79}),atmScreenMaterial=new THREE.MeshBasicMaterial({color:0x64ebbd});
function* addChunk(cx:number,cz:number):Generator<void,void,void>{
 const group=new THREE.Group(), bodies:RAPIER.RigidBody[]=[], roadTiles:Node[]=[], occluders:BuildingOccluder[]=[],chunkShops:ShopExterior[]=[],chunkAtms:AtmExterior[]=[];
 const colliderSpecs:{center:THREE.Vector3;dim:THREE.Vector3;factor:number}[]=[],bankTopTriangles:number[]=[];
 let committed=false;
 try{
 const planningCity=cityAt(cx*chunkTiles+chunkTiles/2,cz*chunkTiles+chunkTiles/2);
 yield* planCityGardens(planningCity.ix,planningCity.iz);
 yield* planCityFeatures(planningCity.ix,planningCity.iz);
 const waterVertices:number[][]=Array.from({length:16},()=>[]), waterUVs:number[][]=Array.from({length:16},()=>[]);
 const grassVertices:number[][]=Array.from({length:16},()=>[]), grassUVs:number[][]=Array.from({length:16},()=>[]);
 const terrainVertices:number[][]=[[],[],[]],terrainNormals:number[][]=[[],[],[]],terrainUVs:number[][]=[[],[],[]],terrainShore:number[][]=[[],[],[]];
 const bankVertices:number[]=[], bankUVs:number[]=[], bankFillVertices:number[][]=Array.from({length:16},()=>[]), bankFillUVs:number[][]=Array.from({length:16},()=>[]);
 // Shared-coordinate height samples make the mountain surface continuous
 // across tiles and streamed chunks. Road and water corridors remain flat.
 function landscapeTile(gx:number,gz:number){
  const subdivisions=4,step=1/subdivisions;
  type V={x:number,z:number,y:number,n:THREE.Vector3};
  function vertex(x:number,z:number):V {
   const y=terrainHeight(x,z),d=.08;
   const n=new THREE.Vector3(terrainHeight(x-d,z)-terrainHeight(x+d,z),2*d*size,terrainHeight(x,z-d)-terrainHeight(x,z+d)).normalize();
   return {x,z,y,n};
  }
  function tri(a:V,b:V,c:V){
   const material=0;
   for(const v of [a,b,c]){terrainVertices[material].push(v.x*size,v.y+.075,v.z*size);terrainNormals[material].push(v.n.x,v.n.y,v.n.z);terrainUVs[material].push(v.x*size/5,v.z*size/5);terrainShore[material].push(1-smooth((Math.min(riverDistance(v.x,v.z),lakeDistance(v.x,v.z))-2.5)/3.5));}
  }
  for(let a=0;a<subdivisions;a++)for(let b=0;b<subdivisions;b++){
   const x=gx-.5+a*step,z=gz-.5+b*step;
   const p=vertex(x,z),q=vertex(x+step,z),r=vertex(x+step,z+step),t=vertex(x,z+step);
   tri(p,r,q);tri(p,t,r);
  }
 }
 function waterTile(gx:number,gz:number,mask:number){
  const x=(gx-.5)*size,z=(gz-.5)*size, waterY=-.60, bankY=.082;
  function quad(vertices:number[],uv:number[],y:number){
   for(const [u,v] of [[0,0],[1,1],[1,0],[0,0],[0,1],[1,1]]){
    vertices.push(x+u*size,y,z+v*size);uv.push(u,1-v);
   }
  }
  quad(waterVertices[mask],waterUVs[mask],waterY);
  if(mask!==15){
   quad(grassVertices[mask],grassUVs[mask],bankY);
   // Extrude the exact same alpha silhouette as the top surface. Thin layers
   // close discontinuities where sprite contours touch tile/chunk boundaries.
   const layers=20;
   for(let layer=1;layer<=layers;layer++)quad(bankFillVertices[mask],bankFillUVs[mask],bankY+(waterY-bankY)*layer/layers);
  }
  // Build vertical bank faces along the actual alpha boundary of the source
  // sprite, rather than along an unrelated mathematical curve.
  const field=alphaFields[mask],resolution=16;
  const sample=(u:number,v:number)=>shoreWater(mask,field,u,v);
  appendShoreLand(mask,field,x,z,size,bankY,bankTopTriangles,resolution);
  const emitWall=(a:[number,number],b:[number,number])=>{
   for(const [p,y] of [[a,bankY],[a,waterY],[b,bankY],[b,bankY],[a,waterY],[b,waterY]] as [[number,number],number][]){
    bankVertices.push(x+p[0]*size,y,z+p[1]*size);bankUVs.push((x+p[0]*size+z+p[1]*size)/8,y/2);
   }
  };
  if(mask!==15)for(let i=0;i<resolution;i++)for(let j=0;j<resolution;j++){
   const u=i/resolution,v=j/resolution,h=1/resolution;
   const corners=[sample(u,v),sample(u+h,v),sample(u+h,v+h),sample(u,v+h)];
   const pts:[[number,number],[number,number],[number,number],[number,number]]=[[u+h/2,v],[u+h,v+h/2],[u+h/2,v+h],[u,v+h/2]];
   const edges:number[]=[];for(let k=0;k<4;k++)if(corners[k]!==corners[(k+1)%4])edges.push(k);
   if(edges.length===2)emitWall(pts[edges[0]],pts[edges[1]]);
   else if(edges.length===4){emitWall(pts[edges[0]],pts[edges[1]]);emitWall(pts[edges[2]],pts[edges[3]]);}
  }
 }
 function place(proto:THREE.Object3D,x:number,z:number,rot=0,y=0){const o=proto.clone();o.position.set(x,y,z);o.rotation.y=rot;group.add(o);return o;}
 for(let ix=0;ix<chunkTiles;ix++) for(let iz=0;iz<chunkTiles;iz++){
  yield;
  const gx=cx*chunkTiles+ix,gz=cz*chunkTiles+iz,x=gx*size,z=gz*size;
  const mask=waterMask(gx,gz), nearRiver=mask!==0, city=cityAt(gx,gz);
  if(effectiveRoadAt(gx,gz))roadTiles.push({x:gx,z:gz});
  const riverCrossing=boundaryDistance(gx,gz,CITY_SPACING)>=8?riverBridgeAt(gx,gz):null;
  // Water is generated even below a bridge; ordinary streets cannot claim it.
  if(nearRiver)waterTile(gx,gz,mask);
  const round=roundaboutAt(gx,gz);
  if(round && Math.abs(gx-round.cx)<=1 && Math.abs(gz-round.cz)<=1){
   if(gx===round.cx && gz===round.cz){ place(roads[17],x,z); if(random(gx,gz,112)>.5) place(roads[18],x,z); }
   continue;
  }
  if(effectiveRoadAt(gx,gz)){
   const n=effectiveRoadAt(gx,gz-1),e=effectiveRoadAt(gx+1,gz),s=effectiveRoadAt(gx,gz+1),w=effectiveRoadAt(gx-1,gz);
   const count=Number(n)+Number(e)+Number(s)+Number(w); let type=0,rotation=0;
   if(count===4) { type=random(gx,gz,21)>.5?8:1; }
   else if(count===3){type=random(gx,gz,22)>.5?7:6; rotation=!n?0:!e?-Math.PI/2:!s?Math.PI:Math.PI/2;}
   else if(count===2 && ((n&&s)||(e&&w))){ type=random(gx,gz,23)>.8?2:0; rotation=n&&s?Math.PI/2:0; }
   else if(count===2){type=22;rotation=n&&e?Math.PI:e&&s?Math.PI/2:s&&w?0:-Math.PI/2;}
   else if(count===1){type=9;rotation=n?Math.PI/2:e?0:s?-Math.PI/2:Math.PI;}
   else type=1;
   const bridge=riverCrossing?null:bridgePart(gx,gz)||secondaryBridgeAt(gx,gz);
   if(riverCrossing){
    if(riverCrossing.part==='deck'){
     const deck=place(roads[14],x,z);deck.scale.y*=.5;
     for(const side of [-1,1]){const pillar=place(roads[19],x+side*1.35,z);pillar.scale.y*=.5;}
    }else place(roads[15],x,z,riverCrossing.part==='north'?-Math.PI/2:Math.PI/2);
   } else if(bridge){
    const {index,length,axis,ramps,variant}=bridge;
    const descending=index>=length-ramps, ascending=index<ramps;
    const level=ascending?index:descending?length-1-index:ramps;
    const angle=(axis===0?0:-Math.PI/2)+(descending?Math.PI:0);
    // The bridge deck asset runs along Z; ramp assets run along X.
    const deckAngle=axis===0?Math.PI/2:0;
    const part=place(roads[ascending||descending?15:14],x,z,ascending||descending?angle:deckAngle,ascending||descending?level:0);
    if(!ascending&&!descending&&ramps===1)part.scale.y*=.5;
    // Narrow and wide supports alternate with span style, beneath elevated decks.
    if(!ascending&&!descending && (index===ramps || variant===2)){
     const pillar=roads[variant===2?20:19];
     for(const side of [-1,1]){const support=place(pillar,x+(axis===1?side*1.35:0),z+(axis===0?side*1.35:0));if(ramps===1)support.scale.y*=.5;}
    }
   } else {
    if(type===22){
     const ground=new THREE.Mesh(curvedRoadGround,curvedRoadGroundMaterial);
     ground.rotation.x=-Math.PI/2;ground.position.set(x,.012,z);ground.receiveShadow=true;group.add(ground);
    }
    place(roads[type],x,z,rotation);
   }
   const streetBench=streetBenchAt(gx,gz);if(streetBench)place(benchModel,streetBench.x,streetBench.z,streetBench.rotation,.08);
   if(!bridge && !riverCrossing && count>=3 && random(gx,gz,27)>.45) place(roads[random(gx,gz,28)>.5?10:11],x+1.7,z+1.7,rotation);
   else if(!bridge && !riverCrossing && count===2&&random(gx,gz,29)>.68)place(roads[4],x+1.7,z+1.7,rotation);
  } else if(!nearRiver && !city.urban){
   landscapeTile(gx,gz);
   const elevation=terrainHeight(gx,gz);
   const steep=Math.hypot(terrainHeight(gx+.2,gz)-terrainHeight(gx-.2,gz),terrainHeight(gx,gz+.2)-terrainHeight(gx,gz-.2));
   const density=random(gx,gz,711);
   if(density>.66 && riverDistance(gx,gz)>1.8 && lakeDistance(gx,gz)>1.8){
    const choice=random(gx,gz,712);let index:number;
    if(elevation>9 || steep>2) index=choice<.72?9+Math.floor(choice/.72*3):Math.floor(random(gx,gz,716)*3);
    else if(choice<.48)index=Math.floor(random(gx,gz,716)*6);
    else if(choice<.69)index=6+Math.floor(random(gx,gz,716)*3);
    else if(choice<.85)index=9+Math.floor(random(gx,gz,716)*3);
    else index=12+Math.floor(random(gx,gz,716)*4);
    const dx=(random(gx,gz,713)-.5)*1.3,dz=(random(gx,gz,714)-.5)*1.3;
    const object=place(nature[index],x+dx*size,z+dz*size,random(gx,gz,717)*Math.PI*2,terrainHeight(gx+dx,gz+dz)+.075);
    object.scale.multiplyScalar(.72+random(gx,gz,715)*.55);
   }
  } else if(!nearRiver&&gardenAt(gx,gz)){
   const g=gardenAt(gx,gz)!;
   place(roads[3],x,z,0,-.08);
   const geometry=new THREE.PlaneGeometry(size,size,8,8);geometry.rotateX(-Math.PI/2);
   const positions=geometry.getAttribute('position');
   const occupied=(dx:number,dz:number)=>g.tiles.has(gardenKey(gx+dx,gz+dz));
   for(let i=0;i<positions.count;i++){
    let px=positions.getX(i),pz=positions.getZ(i);
    // Round convex exposed corners; shared tile edges remain untouched.
    for(const [sx,sz] of [[-1,-1],[-1,1],[1,-1],[1,1]])if(!occupied(sx,0)&&!occupied(0,sz)){
     const u=size/2-sx*px,v=size/2-sz*pz,r=.72;
     if(u<r&&v<r){
      if(u<.001)px-=sx*(r-Math.sqrt(Math.max(0,r*r-(r-v)**2)));
      if(v<.001)pz-=sz*(r-Math.sqrt(Math.max(0,r*r-(r-u)**2)));
     }
    }
    positions.setXYZ(i,px,gardenHeight(g,gx+px/size,gz+pz/size),pz);
   }
   positions.needsUpdate=true;
   const normals:number[]=[],epsilon=.02;
   for(let i=0;i<positions.count;i++){
    const tx=gx+positions.getX(i)/size,tz=gz+positions.getZ(i)/size;
    const normal=new THREE.Vector3(gardenHeight(g,tx-epsilon,tz)-gardenHeight(g,tx+epsilon,tz),2*epsilon*size,gardenHeight(g,tx,tz-epsilon)-gardenHeight(g,tx,tz+epsilon)).normalize();
    normals.push(normal.x,normal.y,normal.z);
   }
   geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
   const ground=new THREE.Mesh(geometry,curvedRoadGroundMaterial);ground.position.set(x,.012,z);ground.receiveShadow=true;group.add(ground);
   // The centre is open for gatherings; plants and furniture sit on the terrain.
   const lx=gx-g.x,lz=gz-g.z;
   const put=(proto:THREE.Object3D,px:number,pz:number,rot=0)=>place(proto,px,pz,rot,gardenHeight(g,px/size,pz/size)+.012);
   const bench=g.benches.get(gardenKey(gx,gz));
   if(bench)put(benchModel,bench.x,bench.z,bench.rotation);
   // The 3x3 centre is a clear social space; planting is kept around its edge.
   if(lx<0||lx>2||lz<0||lz>2){
    const ox=Math.sign(lx-1)*1.05,oz=Math.sign(lz-1)*1.05,px=x+ox,pz=z+oz;
    if(clearOfBenches(px,pz))put(gardenParts[((gx+gz)%4+4)%4],px,pz,random(gx,gz,850)*Math.PI*2);
    if(random(gx,gz,852)>.65&&clearOfBenches(x,z))put(cityBushes[Math.floor(random(gx,gz,854)*cityBushes.length)],x,z);
   }

  } else if(!nearRiver&&cityFeatureAt(gx,gz)){
   const feature=cityFeatureAt(gx,gz)!;place(roads[3],x,z);
   if(feature.anchor&&feature.kind==='atm'){
    const machine=new THREE.Group(),body=new THREE.Mesh(atmBodyGeometry,atmBodyMaterial),screen=new THREE.Mesh(atmScreenGeometry,atmScreenMaterial);
    body.position.y=.825;screen.position.set(0,1.15,.39);machine.add(body,screen);machine.rotation.y=Math.PI/2+feature.rotation;machine.position.set(x,.08,z);group.add(machine);chunkAtms.push({id:`atm:${gx},${gz}`,x,z});
   }else if(feature.anchor){
    const bank=feature.kind==='bank',prototype=bank?bankModel:shops[feature.variant];
    const object=place(prototype,x+(bank?size/2:0),z+(bank?size/2:0),feature.rotation,.08);
    {
     const id=`${feature.kind}:${gx},${gz}`,dx=Math.round(Math.cos(feature.rotation)),dz=-Math.round(Math.sin(feature.rotation));
     const centerX=x+(bank?size/2:0),centerZ=z+(bank?size/2:0),distance=bank?4.7:3;
     object.userData.shopId=id;chunkShops.push({kind:bank?'bank':'shop',id,x:centerX,z:centerZ,doorX:centerX+dx*distance,doorZ:centerZ+dz*distance,tileX:gx,tileZ:gz});
    }
    const box=new THREE.Box3().setFromObject(object),center=box.getCenter(new THREE.Vector3()),dim=box.getSize(new THREE.Vector3());
    occluders.push(buildingOccluder(object,box));
    colliderSpecs.push({center,dim,factor:.48});
   }
  } else if(!nearRiver){
   place(roads[3],x,z);
   const nearRoad=effectiveRoadAt(gx+1,gz)||effectiveRoadAt(gx-1,gz)||effectiveRoadAt(gx,gz+1)||effectiveRoadAt(gx,gz-1);
   if(nearRoad||random(gx,gz,31)>.48){
    const choices=city.type===0?buildings:city.type===1?factories:houses;
    const b=place(choices[Math.floor(random(gx,gz,2)*choices.length)],x,z,Math.floor(random(gx,gz,3)*4)*Math.PI/2);
    const box=new THREE.Box3().setFromObject(b), center=box.getCenter(new THREE.Vector3()), dim=box.getSize(new THREE.Vector3());
    if(city.type!==1){const id=`house:${gx},${gz}`;b.userData.shopId=id;chunkShops.push({kind:'house',id,x:center.x,z:center.z,doorX:center.x+2.5,doorZ:center.z,tileX:gx,tileZ:gz,object:b,bounds:box.clone().expandByScalar(.12)});}
    occluders.push(buildingOccluder(b,box));
    colliderSpecs.push({center,dim,factor:.43});
    if(random(gx,gz,4)>.45&&clearOfBenches(x+1.65,z+1.65)) place(cityBushes[Math.floor(random(gx,gz,5)*cityBushes.length)],x+1.65,z+1.65);
    if(random(gx,gz,32)>.88)place(roads[12],x-1.6,z+1.6);
   } else {for(let t=0;t<3;t++){const px=x+(t-1)*1.2,pz=z+(random(gx,gz,37+t)-.5)*2;if(clearOfBenches(px,pz))place(cityBushes[Math.floor(random(gx,gz,33+t)*cityBushes.length)],px,pz);}}
  }
 }
 function addTerrain(vertices:number[],uvs:number[],material:THREE.Material){
  if(!vertices.length)return;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;group.add(mesh);
 }
 for(let mask=1;mask<16;mask++){addTerrain(waterVertices[mask],waterUVs[mask],waterMaterials[mask]);addTerrain(grassVertices[mask],grassUVs[mask],grassMaterials[mask]);addTerrain(bankFillVertices[mask],bankFillUVs[mask],bankFillMaterials[mask]);}
 addTerrain(bankVertices,bankUVs,bankMaterial);
 for(let i=0;i<terrainMaterials.length;i++)if(terrainVertices[i].length){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(terrainVertices[i],3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(terrainNormals[i],3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(terrainUVs[i],2));geometry.setAttribute('shoreBlend',new THREE.Float32BufferAttribute(terrainShore[i],1));
  const mesh=new THREE.Mesh(geometry,terrainMaterials[i]);mesh.receiveShadow=true;mesh.castShadow=true;group.add(mesh);
 }
 for(const {center,dim,factor} of colliderSpecs){
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x,center.y,center.z));
  world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(.1,dim.x*factor),Math.max(.1,dim.y*.5),Math.max(.1,dim.z*factor)).setCollisionGroups(0x00010004),body);bodies.push(body);
 }
 if(bankTopTriangles.length){
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const vertices=new Float32Array(bankTopTriangles),indices=new Uint32Array(vertices.length/3);
  for(let i=0;i<indices.length;i++)indices[i]=i;
  world.createCollider(RAPIER.ColliderDesc.trimesh(vertices,indices).setCollisionGroups(0x00010004),body);bodies.push(body);
 }
 scene.add(group);chunks.set(`${cx},${cz}`,{group,bodies,occluders,shops:chunkShops,atms:chunkAtms,ragdollBuildings:colliderSpecs.map(({center,dim,factor},i)=>({id:`${cx},${cz}:${i}`,x:center.x,y:center.y,z:center.z,halfX:Math.max(.1,dim.x*factor),halfY:Math.max(.1,dim.y*.5),halfZ:Math.max(.1,dim.z*factor)})),obstacles:colliderSpecs.map(({center,dim,factor})=>({x:center.x,z:center.z,halfX:Math.max(.1,dim.x*factor)+.4,halfZ:Math.max(.1,dim.z*factor)+.4}))});
 const city=cityAt(cx*chunkTiles+chunkTiles/2,cz*chunkTiles+chunkTiles/2);
 const gardens=cityGardens(city.ix,city.iz).filter(g=>Math.floor(g.road.x/chunkTiles)===cx&&Math.floor(g.road.z/chunkTiles)===cz).map(g=>({road:g.road,x:(g.x+1)*size,z:(g.z+1)*size}));
 agents.loadChunk(cx,cz,roadTiles,gardens);committed=true;
 } finally {
  if(!committed){disposeChunkGroup(group);for(const body of bodies)world.removeRigidBody(body);}
 }
}
function disposeChunkGroup(group:THREE.Group){
 group.traverse(o=>{if(o instanceof THREE.Mesh&&((o.material===curvedRoadGroundMaterial&&o.geometry!==curvedRoadGround)||o.material===bankMaterial||waterMaterials.includes(o.material as THREE.MeshStandardMaterial)||grassMaterials.includes(o.material as THREE.MeshStandardMaterial)||bankFillMaterials.includes(o.material as THREE.MeshStandardMaterial)||terrainMaterials.includes(o.material as THREE.MeshStandardMaterial)))o.geometry.dispose();});
}
type ChunkJob={x:number;z:number;key:string;generator:Generator<void,void,void>};
let jobs:ChunkJob[]=[],lastChunkRequest='',streamTicks=0;
function updateChunks(x:number,z:number){
 const cx=Math.floor((x+size/2)/chunkSize),cz=Math.floor((z+size/2)/chunkSize);
 const aspect=innerWidth/innerHeight,radius=Math.max(2,Math.ceil(zoom*Math.hypot(aspect,1/Math.sin(pitch))/chunkSize-.5));
 const request=`${cx},${cz},${radius}`;
 if(request!==lastChunkRequest){
  lastChunkRequest=request;
  jobs=jobs.filter(job=>{if(Math.abs(job.x-cx)<=radius&&Math.abs(job.z-cz)<=radius)return true;job.generator.return();return false;});
  for(const [key,c] of chunks){const [a,b]=key.split(',').map(Number);if(Math.abs(a-cx)>radius+1||Math.abs(b-cz)>radius+1){agents.unloadChunk(a,b);c.occluders.forEach(releaseOccluder);scene.remove(c.group);disposeChunkGroup(c.group);c.bodies.forEach(body=>world.removeRigidBody(body));chunks.delete(key);}}
  const pending=new Set(jobs.map(job=>job.key));
  for(let a=-radius;a<=radius;a++)for(let b=-radius;b<=radius;b++){
   const x=cx+a,z=cz+b,key=`${x},${z}`;if(!chunks.has(key)&&!pending.has(key))jobs.push({x,z,key,generator:addChunk(x,z)});
  }
  jobs.sort((a,b)=>Math.hypot(a.x-cx,a.z-cz)-Math.hypot(b.x-cx,b.z-cz));
 }
 // Remove old cache entries in small batches rather than clearing all maps
 // at once as the player travels through the infinite world.
 if(++streamTicks%120===0)for(const cache of [bridgeCache,riverMaskCache,bankCache]){
  if(cache.size<=150000)continue;let removed=0;
  for(const key of cache.keys()){cache.delete(key);if(++removed>=500)break;}
 }
 // Limit world construction work per frame. No collider is installed until
 // its entire visible chunk is ready, and cancelled partial chunks are freed.
 const deadline=performance.now()+4;
 while(jobs.length&&performance.now()<deadline){const result=jobs[0].generator.next();if(result.done)jobs.shift();}
}
// Connect before choosing a spawn so occupied cities are never selected locally.
const online=new OnlineClient();
// Render a small in-engine streetscape behind the title screen.
const titleScene=new THREE.Scene();titleScene.background=new THREE.Color(0x85988e);titleScene.add(new THREE.HemisphereLight(0xeaf3df,0x54675e,2));const titleSun=new THREE.DirectionalLight(0xffeed4,2);titleSun.position.set(-10,20,8);titleScene.add(titleSun);
for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++){const road=roads[(x===0||z===0)?0:3].clone();road.position.set(x*size,0,z*size);titleScene.add(road);if(x!==0&&z!==0){const building=buildings[((x+3)*7+z+3)%buildings.length].clone();building.position.set(x*size,.05,z*size);titleScene.add(building);}}
const titleCamera=new THREE.OrthographicCamera(-20,20,20,-20,.1,150);titleCamera.position.set(25,30,25);titleCamera.lookAt(0,0,0);renderer.render(titleScene,titleCamera);
const session=await showStartMenu(name=>online.connect(name));
// Start on a dry, connected street in the server-selected city.
function playerStart(){
 for(let radius=0;radius<=30;radius++)for(let x=-radius;x<=radius;x++)for(let z=-radius;z<=radius;z++){
  if(Math.max(Math.abs(x),Math.abs(z))!==radius)continue;
  const gx=x+session.spawn.ix*CITY_SPACING,gz=z+session.spawn.iz*CITY_SPACING,r=roundaboutAt(gx,gz);
  if(effectiveRoadAt(gx,gz)&&!waterMask(gx,gz)&&!riverBridgeAt(gx,gz)&&!bridgePart(gx,gz)&&!secondaryBridgeAt(gx,gz)&&!(r&&Math.abs(gx-r.cx)<=1&&Math.abs(gz-r.cz)<=1))return {x:gx*size,z:gz*size};
 }
 return {x:session.spawn.ix*CITY_SPACING*size,z:session.spawn.iz*CITY_SPACING*size};
}
const start=playerStart(),startHeight=surfaceHeight(start.x/size,start.z/size);
const player=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x,startHeight+1,start.z));
const collider=world.createCollider(RAPIER.ColliderDesc.ball(.3).setCollisionGroups(0x00040003),player),controller=world.createCharacterController(.05);
const vehicleCollider=world.createCollider(RAPIER.ColliderDesc.ball(1.15).setCollisionGroups(0x00040003),player);vehicleCollider.setEnabled(false);
const playerVisual=agents.createPlayer();playerVisual.update(start.x,startHeight,start.z,0,0,0,false);agents.registerPlayer(playerVisual.root,start.x,start.z,playerVisual.left,playerVisual.right);
const weapons=new WeaponSystem(session.player.money);
const saved=session.player.inventory;
if(Array.isArray(saved.weapons))for(const id of saved.weapons)if(typeof id==='string')weapons.owned.add(id);
if(typeof saved.lockpicks==='number')weapons.lockpicks=Math.max(0,Math.min(5,Math.floor(saved.lockpicks)));
if(saved.upgrades&&typeof saved.upgrades==='object')for(const [id,level] of Object.entries(saved.upgrades))if(id in weapons.abilities.levels&&typeof level==='number')for(let i=0;i<Math.min(3,Math.max(0,Math.floor(level)));i++)weapons.abilities.upgrade(id as keyof typeof weapons.abilities.levels);
const combatEffects=new CombatEffects();
let route:Point[]=[], routeIndex=0, blockedTime=0;
let interior:ShopInterior|BankInterior|HouseInterior|null=null,pendingShop:ShopExterior|null=null,shopLoading=false;
const bankStates=new Map<string,BankState>();let bankCash=0;
const houseStates=new Map<string,HouseState>();let houseSessionLoot=0,housePursuitLoot=0,housePursuitActive=false;
const bankPuzzle=new BankPuzzle();
const bossStatus=document.createElement('div');bossStatus.className='bank-boss-status';bossStatus.hidden=true;bossStatus.innerHTML='<span data-boss-label>HEAVY OFFICER</span><div><i></i></div>';document.body.appendChild(bossStatus);
const heistStatus=document.createElement('div');heistStatus.className='bank-heist-status';heistStatus.hidden=true;document.body.appendChild(heistStatus);
const bankFailure=document.createElement('div');bankFailure.className='bank-failure-overlay';bankFailure.hidden=true;bankFailure.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="bank-failure-title"><h2 id="bank-failure-title">BUSTED</h2><p data-bank-message>The police seized the money from your bank robbery.</p><button type="button">CONTINUE</button></section>';document.body.appendChild(bankFailure);
bankFailure.querySelector('button')!.addEventListener('click',()=>{bankFailure.hidden=true;});
const houseFailure=document.createElement('div');houseFailure.className='bank-failure-overlay';houseFailure.hidden=true;houseFailure.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="house-failure-title"><h2 id="house-failure-title">BUSTED</h2><p data-house-message></p><button type="button">CONTINUE</button></section>';document.body.appendChild(houseFailure);houseFailure.querySelector('button')!.addEventListener('click',()=>{houseFailure.hidden=true;});
type HouseLoss={earned:number;lost:number;penalty:number};
function takeHousePursuitLoss():HouseLoss|null{if(!housePursuitActive||wantedLevel<=0)return null;const earned=housePursuitLoot,penalty=Math.floor(earned/2),lost=weapons.removeMoney(penalty);return {earned,lost,penalty};}
function showHouseFailure(loss:HouseLoss){houseFailure.querySelector<HTMLElement>('[data-house-message]')!.textContent=loss.lost===loss.penalty?`The police seized 50% of your house robbery earnings. You lost $${loss.lost.toLocaleString('en-US')} of $${loss.earned.toLocaleString('en-US')}.`:`The 50% penalty was $${loss.penalty.toLocaleString('en-US')}. The police seized your available $${loss.lost.toLocaleString('en-US')}.`;houseFailure.hidden=false;houseFailure.querySelector('button')!.focus();}
function addHouseLoot(amount:number){if(amount<=0)return;houseSessionLoot+=amount;weapons.addMoney(amount);rewardLabel.textContent=`+$${amount}`;rewardLabel.hidden=false;rewardUntil=performance.now()+1800;}

function updateBankCash(){heistStatus.textContent=`UNSECURED BANK CASH  $${bankCash.toLocaleString('en-US')}  |  EXIT TO KEEP IT`;}
function showBankFailure(loss:HouseLoss|null=null){bankFailure.querySelector<HTMLElement>('[data-bank-message]')!.textContent='The police seized the money from your bank robbery.'+(loss?` They also seized $${loss.lost.toLocaleString('en-US')} toward the 50% house robbery penalty.`:'');bankFailure.hidden=false;bankFailure.querySelector('button')!.focus();}
function raiseBankAlarm(){wantedLevel=5;wantedMode='combat';lastSeen=performance.now();searchTime=0;const p=player.translation();lastKnownX=p.x;lastKnownZ=p.z;dispatchTime=0;}

const atmCooldowns=new Map<string,number>();
function nearestAtm(x:number,z:number){let nearest:AtmExterior|null=null,best=2.2;for(const chunk of chunks.values())for(const atm of chunk.atms){const distance=Math.hypot(x-atm.x,z-atm.z);if(distance<best){best=distance;nearest=atm;}}return nearest;}
function alarmAtLevel(level:number){wantedLevel=Math.max(wantedLevel,level);wantedMode='combat';lastSeen=performance.now();searchTime=0;const p=player.translation();lastKnownX=p.x;lastKnownZ=p.z;dispatchTime=0;}
function hackAtm(atm:AtmExterior){const remaining=(atmCooldowns.get(atm.id)??0)-Date.now();if(remaining>0){shopMessage(`ATM READY IN ${Math.ceil(remaining/1000)}s`);return;}const reward=500+Math.floor(Math.random()*1501);atmCooldowns.set(atm.id,Date.now()+300000);route=[];routeIndex=0;setAim(false);bankPuzzle.open('atm',()=>{weapons.addMoney(reward);alarmAtLevel(5);rewardLabel.textContent=`+$${reward}`;rewardLabel.hidden=false;rewardUntil=performance.now()+2200;},{atmReward:reward,onFailure:()=>{alarmAtLevel(4);shopMessage('ATM HACK FAILED');}});}
const shopDeaths=new Map<string,Map<string,number>>(),shopSafeStates=new Map<string,ShopSafeState>();let currentShopId:string|null=null;
let shopNotice='',shopNoticeUntil=0;
function visibleShops(){const all:ShopExterior[]=[];for(const chunk of chunks.values())all.push(...chunk.shops);return all;}
function entryOptions(shop:ShopExterior,from:Point){
 if(shop.kind!=='house')return [shop];
 return [0,1,2,3,4,5,6,7].flatMap(i=>[2.5,3.2,4].map(radius=>({x:shop.x+Math.cos(i*Math.PI/4)*radius,z:shop.z+Math.sin(i*Math.PI/4)*radius}))).filter(p=>Number.isFinite(navigationCost(p.x,p.z))).sort((a,b)=>Math.hypot(a.x-from.x,a.z-from.z)-Math.hypot(b.x-from.x,b.z-from.z)).map(p=>({...shop,doorX:p.x,doorZ:p.z}));
}
function nearestShop(x:number,z:number){let nearest:ShopExterior|null=null,best=1.65;for(const shop of visibleShops()){if(shop.kind==='house')continue;for(const door of entryOptions(shop,{x,z})){const d=Math.hypot(x-door.doorX,z-door.doorZ);if(d<best){best=d;nearest=door;}}}return nearest;}
function approachBuilding(shop:ShopExterior){
 if(shop.kind!=='house'){void enterShop(shop);return;}
 pendingShop=null;route=[];routeIndex=0;dashTime=0;selectedHouseObject=null;showHouseOutline(null);if(weapons.lockpicks<=0){shopMessage('BUY A LOCKPICK AT A MARKET');return;}if(weapons.selected!=='lockpick'){shopMessage('EQUIP LOCKPICK WITH TAB');return;}if(bankPuzzle.isOpen||shopLoading||agents.playerRagdoll())return;
 setAim(false);bankPuzzle.open('house-door',()=>{const p=player.translation();if(!agents.playerRagdoll()&&Math.hypot(p.x-shop.doorX,p.z-shop.doorZ)<2.2)void enterShop(shop);},{onFailure:()=>{weapons.breakLockpick();shopMessage('LOCKPICK BROKE');}});
}

function shopMessage(message:string){shopNotice=message;shopNoticeUntil=performance.now()+2500;}
async function enterShop(shop:ShopExterior){
 if(interior||shopLoading||agents.playerRagdoll())return;
 shopLoading=true;pendingShop=null;route=[];routeIndex=0;dashTime=0;
 try{
  const assets=shop.kind==='bank'?await loadBankAssets():shop.kind==='house'?await loadHouseAssets(shop.tileX,shop.tileZ):await loadShopAssets(),safeModel=shop.kind==='shop'?(await loadBankAssets()).safe:undefined,position=player.translation();
  if(agents.playerRagdoll()||Math.hypot(position.x-shop.doorX,position.z-shop.doorZ)>2.2){if(shop.kind==='house')for(const art of (assets as Awaited<ReturnType<typeof loadHouseAssets>>).paintings)art.texture.dispose();return;}
  if(shop.kind==='bank'){
   let state=bankStates.get(shop.id);if(!state){state=makeBankState();bankStates.set(shop.id,state);}
   interior=new BankInterior(assets as Awaited<ReturnType<typeof loadBankAssets>>,shop.tileX,shop.tileZ,weapons.abilities,()=>agents.createPoliceVisual(),state);
   bankCash=0;heistStatus.hidden=false;updateBankCash();
  }else if(shop.kind==='house'){
   let state=houseStates.get(shop.id);if(!state){state=makeHouseState();houseStates.set(shop.id,state);}
   interior=new HouseInterior(assets as Awaited<ReturnType<typeof loadHouseAssets>>,shop.tileX,shop.tileZ,weapons.abilities,state);houseSessionLoot=0;
  }else{
   let deaths=shopDeaths.get(shop.id);if(!deaths){deaths=new Map();shopDeaths.set(shop.id,deaths);}
   let safeState=shopSafeStates.get(shop.id);if(!safeState){safeState={openedAt:0};shopSafeStates.set(shop.id,safeState);}
   interior=new ShopInterior(assets as Awaited<ReturnType<typeof loadShopAssets>>,shop.tileX,shop.tileZ,weapons.abilities,variant=>agents.createShopCustomer(variant),agents.getBloodMaterial(),deaths,safeModel,safeState);
  }
  currentShopId=shop.id;
  combatEffects.clear(scene);
  interior.scene.add(playerVisual.root);
  for(const particle of dashParticles){scene.remove(particle.mesh);particle.mesh.material.dispose();}dashParticles.length=0;
 }catch(error){console.error('Could not open shop',error);shopMessage('SHOP COULD NOT BE OPENED');}
 finally{shopLoading=false;}
}
function exitShop(failed=false){
 if(!interior)return;
 bankPuzzle.close();
 if(!failed&&interior instanceof ShopInterior){const cashier=interior.takeCashierOutside();if(cashier){const p=player.translation(),shop=visibleShops().find(s=>s.id===currentShopId),dx=shop?p.x-shop.x:1,dz=shop?p.z-shop.z:0,length=Math.hypot(dx,dz)||1;agents.releaseCashier(p.x+dx/length*1.5,p.z+dz/length*1.5,cashier);}}
 if(interior instanceof BankInterior){bankPuzzle.close();if(!failed&&bankCash>0)weapons.addMoney(bankCash);bankCash=0;heistStatus.hidden=true;bossStatus.hidden=true;lastSeen=performance.now();}
 if(interior instanceof HouseInterior){bankPuzzle.close();if(!failed){housePursuitLoot+=houseSessionLoot;housePursuitActive=true;raiseBankAlarm();}houseSessionLoot=0;}
 combatEffects.clear(interior.scene);interior.scene.remove(playerVisual.root);interior.dispose();interior=null;currentShopId=null;scene.add(playerVisual.root);
 route=[];routeIndex=0;pendingShop=null;dashTime=0;
}
const routeGeometry=new THREE.BufferGeometry();
const routeLine=new THREE.Mesh(routeGeometry,new THREE.ShaderMaterial({
 transparent:true,depthWrite:false,side:THREE.DoubleSide,
 vertexShader:`attribute float pathDistance; varying float vPathDistance; void main(){vPathDistance=pathDistance;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
 fragmentShader:`varying float vPathDistance; void main(){if(mod(vPathDistance,1.0)>.55)discard;gl_FragColor=vec4(.32,.94,1.0,.9);}`
}));
routeLine.renderOrder=2;scene.add(routeLine);
const crosshairTexture=new THREE.TextureLoader().load(crosshairUrl);crosshairTexture.colorSpace=THREE.SRGBColorSpace;
const targetMarker=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2),new THREE.MeshBasicMaterial({map:crosshairTexture,color:0x8af9ff,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
targetMarker.rotation.x=-Math.PI/2;targetMarker.renderOrder=3;targetMarker.visible=false;scene.add(targetMarker);
let drawnRoute:Point[]|null=null,drawnRouteIndex=-1;
function updateRouteVisual(x:number,z:number){
 const active=routeIndex<route.length;
 if(drawnRoute!==route||drawnRouteIndex!==routeIndex){
  const points:THREE.Vector3[]=[];
  if(active){
   points.push(new THREE.Vector3(x,surfaceHeight(x/size,z/size)+.22,z));
   for(let i=routeIndex;i<route.length;i++){const p=route[i];points.push(new THREE.Vector3(p.x,surfaceHeight(p.x/size,p.z/size)+.22,p.z));}
   const p=route[route.length-1];targetMarker.position.set(p.x,surfaceHeight(p.x/size,p.z/size)+.25,p.z);
  }
  const vertices:number[]=[],distances:number[]=[];let travelled=0;
  for(let i=0;i<points.length-1;i++){
   const a=points[i],b=points[i+1],length=Math.hypot(b.x-a.x,b.z-a.z)||1,nx=-(b.z-a.z)/length*.055,nz=(b.x-a.x)/length*.055;
   vertices.push(a.x+nx,a.y,a.z+nz,a.x-nx,a.y,a.z-nz,b.x+nx,b.y,b.z+nz,b.x+nx,b.y,b.z+nz,a.x-nx,a.y,a.z-nz,b.x-nx,b.y,b.z-nz);
   distances.push(travelled,travelled,travelled+length,travelled+length,travelled,travelled+length);travelled+=length;
  }
  routeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));routeGeometry.setAttribute('pathDistance',new THREE.Float32BufferAttribute(distances,1));routeGeometry.computeBoundingSphere();drawnRoute=route;drawnRouteIndex=routeIndex;
 }
 routeLine.visible=active;targetMarker.visible=active;
 if(active){
  const positions=routeGeometry.getAttribute('position') as THREE.BufferAttribute,target=route[routeIndex],length=Math.hypot(target.x-x,target.z-z)||1,nx=-(target.z-z)/length*.055,nz=(target.x-x)/length*.055,y=surfaceHeight(x/size,z/size)+.22;
  positions.setXYZ(0,x+nx,y,z+nz);positions.setXYZ(1,x-nx,y,z-nz);positions.setXYZ(4,x-nx,y,z-nz);positions.needsUpdate=true;routeGeometry.computeBoundingSphere();
 }
}
let dashTime=0,dashPulse=0,dashFollowingRoute=false,dashDirection=new THREE.Vector3();
let carHeading=0,carVX=0,carVZ=0,boost=1,boostActive=false;
const boostFlames=new THREE.Group();for(const side of [-.48,.48]){const flame=new THREE.Mesh(new THREE.ConeGeometry(.22,1.8,10),new THREE.MeshBasicMaterial({color:0x42dfff,transparent:true,opacity:.85}));flame.rotation.x=-Math.PI/2;flame.position.set(side,.55,-2);boostFlames.add(flame);}boostFlames.visible=false;scene.add(boostFlames);const driveKeys=new Set<string>();
addEventListener('keydown',e=>{if(agents.isDriving()&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyQ'].includes(e.code)){e.preventDefault();driveKeys.add(e.code);}});
addEventListener('keyup',e=>driveKeys.delete(e.code));addEventListener('blur',()=>driveKeys.clear());
let runHeld=false;addEventListener('keydown',e=>{if(e.code==='ShiftLeft'||e.code==='ShiftRight')runHeld=true;});addEventListener('keyup',e=>{if(e.code==='ShiftLeft'||e.code==='ShiftRight')runHeld=false;});addEventListener('blur',()=>{runHeld=false;});
let shieldTime=0,shieldCooldown=0,mouseX=innerWidth/2,mouseY=innerHeight/2,shieldHeading=0;
const shield=new THREE.Mesh(new THREE.CylinderGeometry(1.35,1.35,1.8,32,1,true,-Math.PI/3,Math.PI*2/3),new THREE.MeshBasicMaterial({color:0x65dfff,transparent:true,opacity:.48,side:THREE.DoubleSide,depthWrite:false}));
shield.visible=false;scene.add(shield);
addEventListener('mousemove',e=>{mouseX=e.clientX;mouseY=e.clientY;});
function updateShield(dt:number,x:number,y:number,z:number,activeScene:THREE.Scene){
 shieldCooldown=Math.max(0,shieldCooldown-dt);shieldTime=Math.max(0,shieldTime-dt);shield.visible=shieldTime>0;
 if(!shield.visible)return;
 if(shield.parent!==activeScene)activeScene.add(shield);
 const rect=renderer.domElement.getBoundingClientRect();pointer.set((mouseX-rect.left)/rect.width*2-1,1-(mouseY-rect.top)/rect.height*2);camera.updateMatrixWorld();raycaster.setFromCamera(pointer,camera);
 const hit=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-y),new THREE.Vector3());
 if(hit&&Math.hypot(hit.x-x,hit.z-z)>.01)shieldHeading=Math.atan2(hit.x-x,hit.z-z);
 shield.position.set(x,y+1,z);shield.rotation.y=shieldHeading;
}
const dashParticles:{mesh:THREE.Mesh<THREE.SphereGeometry,THREE.MeshBasicMaterial>;velocity:THREE.Vector3;life:number}[]=[];
const dashParticleGeometry=new THREE.SphereGeometry(.12,6,4);
function spawnDashEffect(x:number,y:number,z:number){
 for(let i=0;i<10;i++){
  const material=new THREE.MeshBasicMaterial({color:i%2?0x7af3ff:0xffffff,transparent:true,opacity:.8,depthWrite:false});
  const mesh=new THREE.Mesh(dashParticleGeometry,material),angle=Math.random()*Math.PI*2;
  mesh.position.set(x,y+.18,z);scene.add(mesh);
  dashParticles.push({mesh,velocity:new THREE.Vector3(Math.cos(angle)*(1+Math.random()*2),.5+Math.random(),Math.sin(angle)*(1+Math.random()*2)),life:.4+Math.random()*.2});
 }
}
addEventListener('keydown',e=>{
 if(e.repeat){if(cityMap.isOpen||management.isOpen){e.preventDefault();e.stopImmediatePropagation();}return;}
 if(cityMap.isOpen||management.isOpen){if(e.code==='Escape'||e.code==='KeyM'||e.code==='KeyN'){e.preventDefault();e.stopImmediatePropagation();if(cityMap.isOpen){cityMap.close();if(e.code==='KeyN')management.open();}else{management.close();if(e.code==='KeyM')cityMap.open();}}else e.stopImmediatePropagation();return;}
 if((e.code==='KeyM'||e.code==='KeyN')&&!interior&&!shopLoading&&!bankPuzzle.isOpen&&!weapons.isBlocking&&bankFailure.hidden&&houseFailure.hidden&&!agents.playerRagdoll()) {e.preventDefault();e.stopImmediatePropagation();driveKeys.clear();runHeld=false;setAim(false);if(e.code==='KeyM')cityMap.open();else management.open();}
},true);
addEventListener('keydown',e=>{
 if(cityMap.isOpen||management.isOpen||bankPuzzle.isOpen||!bankFailure.hidden||!houseFailure.hidden)return;
 if(weapons.isStoreOpen){if(e.code==='Escape'){e.preventDefault();weapons.closeStore();}return;}
 if(e.code==='Tab'){
  e.preventDefault();if(!e.repeat&&!shopLoading&&!agents.playerRagdoll())weapons.openWheel();return;
 }
 if(weapons.isWheelOpen){
  if(e.code==='Escape'){e.preventDefault();weapons.closeWheel(false);}
  else if(e.code==='ArrowLeft'||e.code==='ArrowUp'){e.preventDefault();weapons.moveSelection(-1);}
  else if(e.code==='ArrowRight'||e.code==='ArrowDown'){e.preventDefault();weapons.moveSelection(1);}
  return;
 }
 if(e.code==='KeyQ'){if(agents.isDriving())return;if(!e.repeat&&!shopLoading&&!agents.playerRagdoll()&&shieldCooldown<=0){shieldTime=1.5;shieldCooldown=weapons.abilities.shieldInterval;}return;}
 if(e.code==='KeyE'){
  if(e.repeat||shopLoading)return;
  if(agents.isDriving()){const p=player.translation(),side=carHeading+Math.PI/2;let x=p.x+Math.sin(side)*2.2,z=p.z+Math.cos(side)*2.2;if(!Number.isFinite(navigationCost(x,z))){x=p.x-Math.sin(side)*2.2;z=p.z-Math.cos(side)*2.2;}if(!Number.isFinite(navigationCost(x,z)))return;agents.leaveCar();vehicleCollider.setEnabled(false);collider.setEnabled(true);boostFlames.visible=false;player.setTranslation({x,y:surfaceHeight(x/size,z/size)+1,z},true);agents.setPlayerPosition(x,z);playerVisual.root.visible=true;carVX=carVZ=0;driveKeys.clear();return;}
  if(interior instanceof HouseInterior){const house=interior,action=house.interact();if(action?.kind==='painting')addHouseLoot(action.amount);else if(action?.kind==='safe'){setAim(false);bankPuzzle.open('house-safe',()=>{if(interior===house)addHouseLoot(house.completeSafe());},{difficulty:action.difficulty});}else if(house.nearExit)house.useExit();return;}
  if(interior instanceof BankInterior){const bank=interior,action=bank.interact();if(action){raiseBankAlarm();setAim(false);bankPuzzle.open(action.kind,()=>{if(interior!==bank)return;const amount=bank.complete(action.id);if(amount){bankCash+=amount;updateBankCash();rewardLabel.textContent=`+$${amount} UNSECURED`;rewardLabel.hidden=false;rewardUntil=performance.now()+2200;}});}else if(bank.nearExit)bank.useExit();return;}
  if(interior){const shop=interior;if(shop.nearSafe){const difficulty=shop.startSafe();if(difficulty!==null){wantedLevel=Math.max(1,wantedLevel);wantedMode='combat';lastSeen=performance.now();searchTime=0;const p=player.translation();lastKnownX=p.x;lastKnownZ=p.z;dispatchTime=0;setAim(false);bankPuzzle.open('house-safe',()=>{if(interior!==shop)return;const amount=shop.completeSafe();if(amount){weapons.addMoney(amount);rewardLabel.textContent=`+$${amount}`;rewardLabel.hidden=false;rewardUntil=performance.now()+1800;}},{difficulty});}}else if(shop.nearCounter)weapons.openStore();else shop.useExit();return;}
  if(agents.playerRagdoll())return;const position=player.translation(),atm=nearestAtm(position.x,position.z);if(atm){hackAtm(atm);return;}const shop=nearestShop(position.x,position.z);if(shop){approachBuilding(shop);return;}
  const car=agents.stealCar(position.x,position.z);if(car){collider.setEnabled(false);vehicleCollider.setEnabled(true);carHeading=car.heading;carVX=carVZ=0;route=[];routeIndex=0;pendingShop=null;shieldTime=0;setAim(false);playerVisual.root.visible=false;player.setTranslation({x:car.x,y:surfaceHeight(car.x/size,car.z/size)+1,z:car.z},true);agents.setPlayerPosition(car.x,car.z);}

  return;
 }
 if(agents.isDriving())return;
 if(e.code!=='Space')return;e.preventDefault();if(e.repeat||shopLoading)return;
 if(interior){interior.tryDash(playerVisual.root.rotation.y);return;}
 if(weapons.abilities.charges<=0||agents.playerRagdoll())return;
 const p=player.translation(),target=route[routeIndex];
 if(target)dashDirection.set(target.x-p.x,0,target.z-p.z).normalize();
 else dashDirection.set(Math.sin(playerVisual.root.rotation.y),0,Math.cos(playerVisual.root.rotation.y));
 if(dashDirection.lengthSq()<.01)return;
 dashFollowingRoute=!!target;dashTime=.22;weapons.abilities.useDash();dashPulse=1;spawnDashEffect(p.x,visualGround,p.z);
});
addEventListener('keyup',e=>{if(e.code==='Tab'&&weapons.isWheelOpen){e.preventDefault();weapons.closeWheel();}});
addEventListener('blur',()=>weapons.closeWheel(false));
const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
function navigationCost(x:number,z:number){
 if(boundaryDistance(x/size,z/size,CITY_SPACING)<2)return Infinity;
 const cx=Math.floor((x+size/2)/chunkSize),cz=Math.floor((z+size/2)/chunkSize);
 if(!chunks.has(`${cx},${cz}`))return Infinity;
 for(let a=cx-1;a<=cx+1;a++)for(let b=cz-1;b<=cz+1;b++){
  const chunk=chunks.get(`${a},${b}`);if(!chunk)continue;
  for(const o of chunk.obstacles)if(Math.abs(x-o.x)<o.halfX&&Math.abs(z-o.z)<o.halfZ)return Infinity;
 }
 const gx=Math.round(x/size),gz=Math.round(z/size),road=effectiveRoadAt(gx,gz);
 if(!road&&isWaterAt(x/size,z/size))return Infinity;
 return road?1:3.5;
}
let houseOutline:{object:THREE.Object3D;lines:THREE.LineSegments[];material:THREE.LineBasicMaterial}|null=null;
let selectedHouseObject:THREE.Object3D|null=null;
function showHouseOutline(object:THREE.Object3D|null){
 if(houseOutline?.object===object)return;
 if(houseOutline){for(const line of houseOutline.lines){line.removeFromParent();line.geometry.dispose();}houseOutline.material.dispose();houseOutline=null;}
 if(!object)return;const meshes:THREE.Mesh[]=[];object.traverse(part=>{if(part instanceof THREE.Mesh)meshes.push(part);});
 const material=new THREE.LineBasicMaterial({color:0x75f8ea,depthTest:false,transparent:true,opacity:.95}),lines:THREE.LineSegments[]=[];
 for(const mesh of meshes){const line=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,30),material);line.renderOrder=40;line.raycast=()=>{};mesh.add(line);lines.push(line);}houseOutline={object,lines,material};
}
function buildingFromHits(hits:THREE.Intersection[]){
 for(const hit of hits){let object:THREE.Object3D|null=hit.object;while(object&&!object.userData.shopId)object=object.parent;if(!object)continue;const building=visibleShops().find(item=>item.id===object!.userData.shopId);if(building&&building.kind!=='house')return {object,building};}return null;
}
function houseFromRay(){
 let result:{object:THREE.Object3D;building:ShopExterior}|null=null,best=Infinity;const point=new THREE.Vector3();
 for(const building of visibleShops()){
  if(building.kind!=='house'||!building.bounds||!building.object||!raycaster.ray.intersectBox(building.bounds,point))continue;
  const distance=raycaster.ray.origin.distanceToSquared(point);if(distance<best){best=distance;result={object:building.object,building};}
 }
 return result;
}
function updateHouseOutline(x:number,y:number){
 if(!aiming||weapons.selected!=='lockpick'||interior){showHouseOutline(selectedHouseObject);return;}
 const rect=renderer.domElement.getBoundingClientRect();pointer.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);camera.updateMatrixWorld();raycaster.setFromCamera(pointer,camera);
 const match=houseFromRay();showHouseOutline(match?.object??selectedHouseObject);
}
function setDestination(e:MouseEvent,houseOnly=false){
 if(shopLoading||weapons.isBlocking||bankPuzzle.isOpen||!bankFailure.hidden||!houseFailure.hidden)return;
 if(interior){if(interior.click(e,camera,renderer.domElement))weapons.openStore();return;}
 const rect=renderer.domElement.getBoundingClientRect();
 pointer.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);
 camera.updateMatrixWorld();raycaster.setFromCamera(pointer,camera);
 const hits=houseOnly?[]:raycaster.intersectObjects([...chunks.values()].map(c=>c.group),true);
 const match=houseOnly?houseFromRay():buildingFromHits(hits);
 if(match){
  const {object:selected,building:shop}=match;
  if(shop){
   if(shop.kind==='house'&&weapons.selected!=='lockpick'){shopMessage('EQUIP LOCKPICK WITH TAB');return;}
   selectedHouseObject=shop.kind==='house'?selected:null;showHouseOutline(selectedHouseObject);
   const position=player.translation();
   for(const door of entryOptions(shop,position)){
    if(Math.hypot(position.x-door.doorX,position.z-door.doorZ)<1.65){approachBuilding(door);return;}
    const goal={x:Math.round(door.doorX),z:Math.round(door.doorZ)};
    if(Number.isFinite(navigationCost(goal.x,goal.z))){const next=findPath({x:position.x,z:position.z},goal,navigationCost);if(next.length){route=next;routeIndex=0;blockedTime=0;pendingShop=door;return;}}
   }
   pendingShop=null;shopMessage('NO ROUTE TO SHOP');return;
  }
 }
 if(houseOnly){shopMessage('AIM AT A HOUSE');return;}
 selectedHouseObject=null;showHouseOutline(null);pendingShop=null;
 const hit=hits.find(h=>Math.abs(h.point.y-surfaceHeight(h.point.x/size,h.point.z/size))<.6);
 if(!hit)return;
 const goal={x:Math.round(hit.point.x),z:Math.round(hit.point.z)};
 if(!Number.isFinite(navigationCost(goal.x,goal.z)))return;
 const p=player.translation();route=findPath({x:p.x,z:p.z},goal,navigationCost);routeIndex=0;blockedTime=0;
}
let playerHealth=100,wantedLevel=0,wasRagdoll=false;
weapons.onUpgrade=id=>{if(id==='health')playerHealth+=10;if(id==='shieldArea'){const angle=weapons.abilities.shieldHalfAngle;shield.geometry.dispose();shield.geometry=new THREE.CylinderGeometry(1.35,1.35,1.8,32,1,true,-angle,angle*2);}};
let kills:number[]=[],wantedMode:'search'|'combat'='search',lastSeen=0,searchTime=0,dispatchTime=0,policeShot=0,lastKnownX=0,lastKnownZ=0;
function clearWanted(){wantedLevel=0;kills=[];searchTime=0;housePursuitLoot=0;housePursuitActive=false;agents.clearPoliceResponse();}
function registerCrime(){const now=performance.now();kills=kills.filter(t=>now-t<=60000);kills.push(now);if(kills.length>=2){wantedLevel=Math.max(wantedLevel,Math.min(5,1+Math.floor((kills.length-2)/2)));wantedMode='combat';lastSeen=now;const p=player.translation();lastKnownX=p.x;lastKnownZ=p.z;searchTime=0;dispatchTime=0;}}

const hud=createHud({isRoad:effectiveRoadAt,isWater:(x,z)=>!!waterMask(x,z),isUrban:(x,z)=>cityAt(x,z).urban,shops:()=>visibleShops().filter(s=>s.kind!=='house')});
const empire=new CityEmpire();
const cityOwner=(ix:number,iz:number)=>online.cities.get(`${ix},${iz}`);
empire.restore(saved.crews,(ix,iz)=>cityOwner(ix,iz)?.ownerId===session.player.id);
for(const city of online.cities.values())if(city.ownerId===session.player.id&&!empire.owns(city.ix,city.iz))empire.claim(city.ix,city.iz,()=>true);
let saving:Promise<void>=Promise.resolve();
function saveProgress(){const money=weapons.money,inventory={weapons:[...weapons.owned],lockpicks:weapons.lockpicks,upgrades:{...weapons.abilities.levels},crews:empire.snapshot()};saving=saving.catch(()=>{}).then(()=>online.save(money,inventory)).then(()=>{});return saving;}
const management=new CityManagement(empire,{location:()=>{const p=player.translation();return cityAt(p.x/size,p.z/size);},money:()=>weapons.money,spend:amount=>{if(weapons.money<amount)return false;weapons.removeMoney(amount);return true;},owner:(ix,iz)=>cityOwner(ix,iz)?.ownerName??null,claim:async(ix,iz)=>{await saveProgress();const result=await online.claim(ix,iz);weapons.money=result.money;empire.claim(ix,iz,()=>true);await saveProgress();},onClose:()=>{void saveProgress().catch(console.error);}});
const cityMap=new CityMap({isRoad:effectiveRoadAt,isWater:(x,z)=>!!waterMask(x,z),isUrban:(x,z)=>cityAt(x,z).urban,isOwned:(ix,iz)=>empire.owns(ix,iz),owner:(ix,iz)=>{const owner=cityOwner(ix,iz);return owner?{name:owner.ownerName,mine:owner.ownerId===session.player.id}:null;},onManage:()=>management.open()});
const remotePlayers=new Map<string,{visual:ReturnType<typeof agents.createPlayer>;x:number;z:number;heading:number;label:THREE.Sprite}>();
function updateRemote(p:import('./online').OnlinePlayer){let remote=remotePlayers.get(p.id);if(!remote){const visual=agents.createPlayer(),canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const ctx=canvas.getContext('2d')!;ctx.font='bold 25px Arial';ctx.textAlign='center';ctx.fillStyle='#132b2b';ctx.fillRect(0,4,256,48);ctx.fillStyle='#ffffff';ctx.fillText(p.name,128,37);const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false}));label.scale.set(3,.75,1);label.position.y=2.7;visual.root.add(label);remote={visual,x:p.x,z:p.z,heading:p.heading,label};remotePlayers.set(p.id,remote);}remote.x=p.x;remote.z=p.z;remote.heading=p.heading;}
online.onPlayer=updateRemote;online.onLeave=id=>{const remote=remotePlayers.get(id);if(remote){scene.remove(remote.visual.root);remote.label.material.map?.dispose();remote.label.material.dispose();remotePlayers.delete(id);}};for(const p of online.players.values())updateRemote(p);
let nextOnlineSave=performance.now()+10000;

cityMap.updatePlayer(start.x,start.z);

weapons.onMoneyChange=amount=>hud.setMoney(amount);
const initialZoom=25/2.5,minZoom=initialZoom*.7,maxZoom=initialZoom*1.3;
let zoom=initialZoom,yaw=Math.PI/4,pitch=Math.atan2(42,Math.hypot(32,32));
const aimImages:Record<string,string>={MG1:aim20,MG2:aim16,MG3:aim10,MG4:aim31,MG5:aim32,MSR:aim28,SNIPER1:aim47,GL1:aim51,RPG:aim34};
const reticle=document.createElement('img');reticle.className='combat-reticle';reticle.alt='';reticle.hidden=true;document.body.appendChild(reticle);
const rewardLabel=document.createElement('div');rewardLabel.className='combat-reward';rewardLabel.hidden=true;rewardLabel.setAttribute('aria-live','polite');document.body.appendChild(rewardLabel);
const combatHint=document.createElement('div');combatHint.className='combat-hint';combatHint.textContent='HOLD RIGHT CLICK TO AIM  Â·  LEFT CLICK TO FIRE';combatHint.hidden=true;document.body.appendChild(combatHint);
let aiming=false,firing=false,aimX=0,aimY=0,nextShot=0,combatShake=0,rewardUntil=0;
let moneyCode='';
addEventListener('keydown',event=>{
 if(weapons.isBlocking||bankPuzzle.isOpen||!bankFailure.hidden||!houseFailure.hidden||shopLoading){moneyCode='';return;}
 const target=event.target;if(target instanceof HTMLElement&&(target.isContentEditable||target.matches('input,textarea,select')))return;
 if(event.repeat||event.ctrlKey||event.altKey||event.metaKey)return;
 if(event.key==='Enter'&&moneyCode){
  event.preventDefault();event.stopImmediatePropagation();const match=/^mertkoca([0-9]+)$/.exec(moneyCode);moneyCode='';
  if(match){const amount=Number(match[1]);if(Number.isSafeInteger(amount)&&amount>0&&Number.isSafeInteger(weapons.money+amount)){weapons.addMoney(amount);rewardLabel.textContent=`+$${amount.toLocaleString('en-US')}`;rewardLabel.hidden=false;rewardUntil=performance.now()+1800;}}
  return;
 }
 if(event.key==='Backspace'&&moneyCode){event.preventDefault();event.stopImmediatePropagation();moneyCode=moneyCode.slice(0,-1);return;}
 if(event.key.length!==1){moneyCode='';return;}
 const next=moneyCode+event.key.toLowerCase();
 if(('mertkoca'.startsWith(next)||/^mertkoca[0-9]{0,16}$/.test(next))){moneyCode=next;event.preventDefault();event.stopImmediatePropagation();}
 else{moneyCode=event.key.toLowerCase()==='m'?'m':'';if(moneyCode){event.preventDefault();event.stopImmediatePropagation();}}
},true);
addEventListener('blur',()=>{moneyCode='';});
function setAim(enabled:boolean){
 aiming=enabled&&!bankPuzzle.isOpen&&bankFailure.hidden&&houseFailure.hidden&&!agents.isDriving()&&weapons.selected!=='unarmed'&&!shopLoading&&!weapons.isBlocking&&!agents.playerRagdoll();
 if(!aiming)firing=false;reticle.hidden=!aiming;renderer.domElement.style.cursor=aiming?'none':'';
 if(aiming){reticle.src=weapons.selected==='lockpick'?aim20:aimImages[weapons.selected];if(weapons.selected==='lockpick')updateHouseOutline(aimX,aimY);}else showHouseOutline(selectedHouseObject);
}
function updateAimPosition(x:number,y:number){aimX=x;aimY=y;reticle.style.left=`${x}px`;reticle.style.top=`${y}px`;}
function combatTargets(){return interior?interior.combatTargets():agents.combatTargets();}
function sightClear(from:THREE.Vector3,to:THREE.Vector3){
 if(interior)return interior.lineOfSight(from,to);
 const obstacles:RagdollBuilding[]=[];for(const chunk of chunks.values())obstacles.push(...chunk.ragdollBuildings);
 return clearSegment(from.x,from.z,to.x,to.z,obstacles);
}
function reward(kind:'person'|'car',police:boolean){
 const amount=rewardFor(kind,police);if(interior instanceof BankInterior){bankCash+=amount;updateBankCash();}else weapons.addMoney(amount);
 rewardLabel.textContent=`+$${amount}`;rewardLabel.hidden=false;rewardUntil=performance.now()+1800;
}
function damageCombatTarget(target:CombatTarget,damage:number,origin:THREE.Vector3,flight:number,depth=0,fallback?:THREE.Vector3,explosive=false){
 const currentScene=interior?.scene??scene;let dx=target.position.x-origin.x,dz=target.position.z-origin.z;
 if(Math.hypot(dx,dz)<.01){dx=fallback?.x??0;dz=fallback?.z??0;if(Math.hypot(dx,dz)<.01){dx=Math.sin(playerVisual.root.rotation.y);dz=Math.cos(playerVisual.root.rotation.y);}}
 const result=interior instanceof BankInterior?interior.damageTarget(target.id,damage,dx,dz,flight,explosive):interior?interior.damageTarget(target.id,damage,dx,dz,flight):agents.damageTarget(target.id,damage,dx,dz,flight);
 if(!result)return;
 combatEffects.impact(currentScene,result.position,result.kind==='person');
 if(!result.killed)return;
 if(target.id!=='boss'&&(target.id!=='cashier'||!interior))reward(result.kind,result.police);
 if(result.kind==='person')registerCrime();
 else {wantedLevel=Math.min(5,wantedLevel+1);wantedMode='combat';lastSeen=performance.now();const p=player.translation();lastKnownX=p.x;lastKnownZ=p.z;searchTime=0;dispatchTime=0;}
 if(result.kind==='car'){
  combatEffects.explosion(currentScene,result.position,1.25);combatShake=Math.max(combatShake,1.35);
  if(depth<3)blast(result.position,3.2,120,2,depth+1,new THREE.Vector3(dx,0,dz));
 }
}
function blast(position:THREE.Vector3,radius:number,damage:number,flight:number,depth=0,fallback?:THREE.Vector3){
 for(const target of combatTargets()){
  const distance=Math.hypot(target.position.x-position.x,target.position.z-position.z);
  if(distance<=radius&&sightClear(position,target.position))damageCombatTarget(target,damage*(1-.25*distance/radius),position,flight,depth,fallback,true);
 }
}
function fireWeapon(){
 const stats=weaponStats[weapons.selected],now=performance.now();
 if(!aiming||!stats||now<nextShot||shopLoading||weapons.isBlocking||agents.playerRagdoll())return;
 nextShot=now+stats.cooldown*1000;
 const activeInterior=interior,activeScene=activeInterior?.scene??scene,p=activeInterior?.position??player.translation();
 const ground=activeInterior?0:surfaceHeight(p.x/size,p.z/size),start=new THREE.Vector3(p.x,ground+1.1,p.z);
 if(activeInterior){activeInterior.frighten(start.x,start.z);if(activeInterior instanceof BankInterior)raiseBankAlarm();else if(!wantedLevel){wantedLevel=1;wantedMode='combat';lastSeen=performance.now();const outside=player.translation();lastKnownX=outside.x;lastKnownZ=outside.z;dispatchTime=0;}}else agents.frighten(start.x,start.z);
 const rect=renderer.domElement.getBoundingClientRect();pointer.set((aimX-rect.left)/rect.width*2-1,1-(aimY-rect.top)/rect.height*2);
 camera.updateMatrixWorld();raycaster.setFromCamera(pointer,camera);
 const hitPoint=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-ground),new THREE.Vector3());
 let end=hitPoint??start.clone().add(new THREE.Vector3(Math.sin(playerVisual.root.rotation.y),0,Math.cos(playerVisual.root.rotation.y)).multiplyScalar(stats.range));
 const horizontal=new THREE.Vector3(end.x-start.x,0,end.z-start.z);
 if(horizontal.length()>stats.range){horizontal.setLength(stats.range);end=new THREE.Vector3(start.x+horizontal.x,ground,start.z+horizontal.z);}
 let hit:CombatTarget|null=null,best=Infinity;const intersection=new THREE.Vector3();
 for(const target of combatTargets()){
  if(Math.hypot(target.position.x-start.x,target.position.z-start.z)>stats.range||!sightClear(start,target.position))continue;
  if(!raycaster.ray.intersectSphere(new THREE.Sphere(target.position,target.radius),intersection))continue;
  const distance=raycaster.ray.origin.distanceTo(intersection);if(distance<best){best=distance;hit=target;}
 }
 if(hit)end=hit.position.clone();
 if(activeInterior instanceof BankInterior){const impact=activeInterior.projectileImpact(start,end);if(impact){end=impact;hit=null;}}
 const dx=end.x-start.x,dz=end.z-start.z;if(Math.hypot(dx,dz)>.01)playerVisual.root.rotation.y=Math.atan2(dx,dz);
 if(activeInterior)activeInterior.stopMoving();else{route=[];routeIndex=0;pendingShop=null;dashTime=0;}
 combatShake=Math.max(combatShake,stats.radius?.16:.06);
 if(stats.radius){
  const muzzleEnd=start.clone().lerp(end,.06);combatEffects.shot(activeScene,start,muzzleEnd);
  const impact=end.clone();
  if(activeInterior instanceof BankInterior){const interceptor=activeInterior.interceptExplosive(start);if(interceptor){combatEffects.shot(activeScene,interceptor,start);combatEffects.explosion(activeScene,start,.5);playerHealth=Math.max(0,playerHealth-10);combatShake=Math.max(combatShake,.5);return;}activeInterior.warnExplosive(start,impact,stats.radius);}
  combatEffects.projectile(activeScene,start,impact,stats.flight,()=>{
   if((interior?.scene??scene)!==activeScene)return;
   combatEffects.explosion(activeScene,impact,stats.radius/3.5);combatShake=Math.max(combatShake,1);
   blast(impact,stats.radius,stats.damage,2,0,new THREE.Vector3(dx,0,dz));
  });
 }else{
  combatEffects.shot(activeScene,start,end);
  if(hit)damageCombatTarget(hit,stats.damage,start,1.25);else combatEffects.impact(activeScene,end,false);
 }
}
let orbitPointer:number|null=null,lastPointerX=0,lastPointerY=0;
renderer.domElement.addEventListener('contextmenu',event=>event.preventDefault());
renderer.domElement.addEventListener('mousedown',event=>{
 if(event.button===2){event.preventDefault();updateAimPosition(event.clientX,event.clientY);setAim(true);return;}
 if(event.button!==0||agents.isDriving())return;
 if(aiming){event.preventDefault();updateAimPosition(event.clientX,event.clientY);if(weapons.selected==='lockpick'){setDestination(event,true);return;}firing=true;fireWeapon();return;}
 setDestination(event);
});
addEventListener('mouseup',event=>{if(event.button===0)firing=false;if(event.button===2)setAim(false);});
addEventListener('mousemove',event=>{if(aiming){updateAimPosition(event.clientX,event.clientY);if(weapons.selected==='lockpick')updateHouseOutline(event.clientX,event.clientY);}});
addEventListener('blur',()=>setAim(false));
renderer.domElement.addEventListener('pointerdown',e=>{
 if(e.button!==1)return;e.preventDefault();orbitPointer=e.pointerId;lastPointerX=e.clientX;lastPointerY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove',e=>{
 if(e.pointerId!==orbitPointer)return;
 yaw-=(e.clientX-lastPointerX)*.006;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-lastPointerY)*.005,Math.PI/6,Math.PI*.43);
 lastPointerX=e.clientX;lastPointerY=e.clientY;updateShadowBounds();e.preventDefault();
});
const endOrbit=(e:PointerEvent)=>{if(e.pointerId===orbitPointer)orbitPointer=null;};
renderer.domElement.addEventListener('pointerup',endOrbit);renderer.domElement.addEventListener('pointercancel',endOrbit);
renderer.domElement.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
addEventListener('wheel',e=>{if(weapons.isBlocking||bankPuzzle.isOpen||!bankFailure.hidden||!houseFailure.hidden)return;zoom=THREE.MathUtils.clamp(zoom+e.deltaY*.006,minZoom,maxZoom);resize();},{passive:true});
function resize(){const aspect=innerWidth/innerHeight;camera.left=-zoom*aspect;camera.right=zoom*aspect;camera.top=zoom;camera.bottom=-zoom;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);updateShadowBounds();}addEventListener('resize',resize);
function updateShadowBounds(){const aspect=innerWidth/innerHeight,extent=zoom*Math.hypot(aspect,1/Math.sin(pitch))+12;Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:1,far:350});sun.shadow.camera.updateProjectionMatrix();if(scene.fog instanceof THREE.Fog){scene.fog.near=Math.max(65,extent*.7);scene.fog.far=Math.max(115,extent*1.5);}}
resize();
let visualGround=startHeight,last=performance.now();
function frame(now:number){
 requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;
 if(cityMap.isOpen||management.isOpen||weapons.isBlocking||!bankFailure.hidden||!houseFailure.hidden){if(aiming)setAim(false);renderer.render(interior?.scene??scene,camera);return;}
 if(now>=nextOnlineSave){nextOnlineSave=now+10000;void saveProgress().catch(console.error);}
 const empireStep=empire.update(dt);if(empireStep.income)weapons.addMoney(empireStep.income);for(const scout of empireStep.scouts)cityMap.reveal(scout.x,scout.z);
 weapons.abilities.tick(dt);
 combatHint.textContent=weapons.selected==='lockpick'?'HOLD RIGHT CLICK TO AIM | LEFT CLICK A HOUSE':'HOLD RIGHT CLICK TO AIM | LEFT CLICK TO FIRE';combatHint.hidden=weapons.selected==='unarmed'||aiming;
 if(aiming&&weapons.selected==='unarmed')setAim(false);
 if(pendingShop?.kind==='house'&&weapons.selected!=='lockpick'){pendingShop=null;route=[];routeIndex=0;selectedHouseObject=null;showHouseOutline(null);}
 if(selectedHouseObject&&!pendingShop&&!aiming){selectedHouseObject=null;showHouseOutline(null);}
 if(interior){let aimedTarget:string|null=null;if(aiming){const rect=renderer.domElement.getBoundingClientRect();pointer.set((aimX-rect.left)/rect.width*2-1,1-(aimY-rect.top)/rect.height*2);camera.updateMatrixWorld();raycaster.setFromCamera(pointer,camera);let nearest=Infinity;const intersection=new THREE.Vector3(),p=interior.position,origin=new THREE.Vector3(p.x,1,p.z);for(const target of interior.combatTargets()){if(!interior.lineOfSight(origin,target.position)||!raycaster.ray.intersectSphere(new THREE.Sphere(target.position,target.radius),intersection))continue;const distance=raycaster.ray.origin.distanceTo(intersection);if(distance<nearest){nearest=distance;aimedTarget=target.id;}}}interior.setCashierAimed(aimedTarget==='cashier');if(interior instanceof BankInterior)interior.setAimedTarget(aimedTarget);}
 if(aiming&&firing&&!bankPuzzle.isOpen)fireWeapon();
 combatEffects.update(dt);combatShake=THREE.MathUtils.damp(combatShake,0,4.5,dt);if(now>rewardUntil)rewardLabel.hidden=true;
 if(interior){
  const activeInterior=interior,step=activeInterior.update(dt,runHeld);
  if(activeInterior instanceof BankInterior){
   if(activeInterior.consumeAlarm())raiseBankAlarm();
   const boss=activeInterior.bossStatus();bossStatus.hidden=!boss;if(boss){bossStatus.querySelector<HTMLElement>('[data-boss-label]')!.textContent=boss.emerging?'HEAVY OFFICER APPROACHING':boss.shielded?'HEAVY OFFICER | SHIELDED':'HEAVY OFFICER';bossStatus.querySelector<HTMLElement>('i')!.style.transform=`scaleX(${Math.max(0,boss.health/300)})`;}
   const bossCash=activeInterior.takeBossCash();if(bossCash){bankCash+=bossCash;updateBankCash();rewardLabel.textContent=`+$${bossCash} UNSECURED`;rewardLabel.hidden=false;rewardUntil=now+1200;}
   playerHealth=Math.max(0,playerHealth-activeInterior.takeLaserDamage());
   for(const shot of activeInterior.takeShots()){const target=new THREE.Vector3(step.x,1,step.z);combatEffects.shot(activeInterior.scene,shot,target);const angle=Math.atan2(shot.x-step.x,shot.z-step.z);if(Math.random()<.7&&!(shieldTime>0&&Math.cos(angle-shieldHeading)>Math.cos(weapons.abilities.shieldHalfAngle)))playerHealth=Math.max(0,playerHealth-7);}
   if(playerHealth===0){const loss=takeHousePursuitLoss();exitShop(true);clearWanted();playerHealth=weapons.abilities.maxHealth;player.setTranslation({x:start.x,y:startHeight+1,z:start.z},true);agents.setPlayerPosition(start.x,start.z);showBankFailure(loss);return;}
  }
  if(step.exit){exitShop();return;}
  const collected=activeInterior.takeCollectedCash();if(collected){weapons.addMoney(collected);rewardLabel.textContent=`+$${collected}`;rewardLabel.hidden=false;rewardUntil=now+1200;}
  const shot=activeInterior.takeCashierShot();if(shot){const target=new THREE.Vector3(step.x,1,step.z);combatEffects.shot(activeInterior.scene,shot,target);const angle=Math.atan2(shot.x-step.x,shot.z-step.z);if(!(shieldTime>0&&Math.cos(angle-shieldHeading)>Math.cos(weapons.abilities.shieldHalfAngle)))playerHealth=Math.max(0,playerHealth-10);if(playerHealth===0){const loss=takeHousePursuitLoss();exitShop(true);clearWanted();playerHealth=weapons.abilities.maxHealth;player.setTranslation({x:start.x,y:startHeight+1,z:start.z},true);agents.setPlayerPosition(start.x,start.z);if(loss)showHouseFailure(loss);return;}}
  playerVisual.update(step.x,0,step.z,step.dx,step.dz,dt,step.running);
  updateShield(dt,step.x,0,step.z,activeInterior.scene);
  const horizontal=Math.cos(pitch)*62,shake=step.pulse*.22+combatShake;
  camera.zoom=zoom/Math.min(maxZoom,zoom*(1+step.pulse*.1));camera.updateProjectionMatrix();
  camera.position.set(step.x+Math.sin(yaw)*horizontal+(Math.random()-.5)*shake,Math.sin(pitch)*62+(Math.random()-.5)*shake,step.z+Math.cos(yaw)*horizontal+(Math.random()-.5)*shake);
  camera.lookAt(step.x,.75,step.z);activeInterior.updateWalls(yaw);
  const outside=player.translation();
  hud.setPrompt(activeInterior.prompt);
  hud.update({health:playerHealth,dash:activeInterior.dashCharge,shield:1-shieldCooldown/weapons.abilities.shieldInterval,shieldSeconds:shieldCooldown,maxHealth:weapons.abilities.maxHealth,dashCount:weapons.abilities.charges,dashMax:weapons.abilities.maxCharges,money:weapons.money,wanted:wantedLevel,district:(()=>{const ix=Math.round(outside.x/size/CITY_SPACING),iz=Math.round(outside.z/size/CITY_SPACING),name=districtName(ix,iz),owner=cityOwner(ix,iz);return name?name+(owner?`\n${owner.ownerName}`:'\nSAHİPSİZ'):'';})(),x:step.x,z:step.z,heading:playerVisual.root.rotation.y,route:activeInterior.path,routeIndex:activeInterior.pathIndex,interior:activeInterior.map,police:activeInterior instanceof BankInterior?activeInterior.policeMarkers():undefined},now);
  renderer.render(activeInterior.scene,camera);return;
 }
 const ragdoll=agents.playerRagdoll(),ragPosition=agents.playerPosition();
 if(ragPosition&&ragdoll){const y=surfaceHeight(ragPosition.x/size,ragPosition.z/size);player.setTranslation({x:ragPosition.x,y:y+1,z:ragPosition.z},true);route=[];routeIndex=0;dashTime=0;}
 const p0=player.translation(),movement=new THREE.Vector3();
 while(routeIndex<route.length && Math.hypot(route[routeIndex].x-p0.x,route[routeIndex].z-p0.z)<.12)routeIndex++;
 if(!ragdoll&&!agents.isDriving()&&routeIndex<route.length){
  const target=route[routeIndex],dx=target.x-p0.x,dz=target.z-p0.z,distance=Math.hypot(dx,dz);
  movement.set(dx,0,dz).multiplyScalar(Math.min(distance,dt*(runHeld?weapons.abilities.runSpeed:4.5))/distance);
 }
 if(agents.isDriving()){
  const forward=Number(driveKeys.has('KeyW')||driveKeys.has('ArrowUp'))-Number(driveKeys.has('KeyS')||driveKeys.has('ArrowDown'));
  const steer=Number(driveKeys.has('KeyD')||driveKeys.has('ArrowRight'))-Number(driveKeys.has('KeyA')||driveKeys.has('ArrowLeft'));
  const fx=Math.sin(carHeading),fz=Math.cos(carHeading),speed=carVX*fx+carVZ*fz,handbrake=driveKeys.has('Space'),boosting=driveKeys.has('KeyQ')&&boost>0&&forward>0;
  boostActive=boosting;boost=Math.max(0,Math.min(1,boost+(boosting?-.3:.1)*dt));
  carHeading-=steer*dt*Math.min(1,Math.abs(speed)/4)*(speed<-.5?-1:1)*(handbrake?2.7:1.8);
  const nx=Math.sin(carHeading),nz=Math.cos(carHeading),sideX=nz,sideZ=-nx,longitudinal=carVX*nx+carVZ*nz,lateral=carVX*sideX+carVZ*sideZ;
  const nextSpeed=THREE.MathUtils.clamp(longitudinal+(forward*(boosting?21:11)-longitudinal*(forward?0.35:1.2))*dt,-7,boosting?27:17);
  const slip=lateral*Math.exp(-(handbrake?1.2:5)*dt);carVX=nx*nextSpeed+sideX*slip;carVZ=nz*nextSpeed+sideZ*slip;movement.set(carVX*dt,0,carVZ*dt);
 }
 dashTime=Math.max(0,dashTime-dt);dashPulse=THREE.MathUtils.damp(dashPulse,0,9,dt);
 if(dashFollowingRoute&&routeIndex>=route.length)dashTime=0;
 if(dashTime>0){
  if(routeIndex<route.length){const target=route[routeIndex],dx=target.x-p0.x,dz=target.z-p0.z,distance=Math.hypot(dx,dz);dashDirection.set(dx,0,dz).normalize();movement.set(dx,0,dz).multiplyScalar(Math.min(distance,dt*17)/distance);}
  else movement.copy(dashDirection).multiplyScalar(dt*17);
  if(!Number.isFinite(navigationCost(p0.x+movement.x,p0.z+movement.z))){movement.set(0,0,0);dashTime=0;}
 }
 const running=dashTime>0||(runHeld&&weapons.abilities.levels.run>0&&movement.lengthSq()>0&&!agents.isDriving());
 for(let i=dashParticles.length-1;i>=0;i--){const particle=dashParticles[i];particle.life-=dt;particle.mesh.position.addScaledVector(particle.velocity,dt);particle.mesh.material.opacity=Math.max(0,particle.life/.6)*.8;particle.mesh.scale.setScalar(Math.max(0,particle.life/.6));if(particle.life<=0){scene.remove(particle.mesh);particle.mesh.material.dispose();dashParticles.splice(i,1);}}
 controller.computeColliderMovement(agents.isDriving()?vehicleCollider:collider,{x:movement.x,y:0,z:movement.z});
 const delta=controller.computedMovement(),p=player.translation();
 let nextX=p.x+delta.x,nextZ=p.z+delta.z;
 if(boundaryDistance(nextX/size,nextZ/size,CITY_SPACING)<2){nextX=p.x;nextZ=p.z;route=[];routeIndex=0;dashTime=0;}
 if(agents.isDriving()){
  for(let i=0;i<controller.numComputedCollisions();i++){const hit=controller.computedCollision(i);if(!hit)continue;const n=hit.normal1,len=Math.hypot(n.x,n.z);if(len<.5)continue;const nx=n.x/len,nz=n.z/len,impact=carVX*nx+carVZ*nz;if(impact<-.5){if(hit.collider)agents.impactCar(hit.collider.handle,carVX,carVZ);carVX-=1.45*impact*nx;carVZ-=1.45*impact*nz;carVX*=.8;carVZ*=.8;combatShake=Math.max(combatShake,Math.min(.7,-impact*.04));}}
 }
 if(movement.lengthSq()>0 && Math.hypot(delta.x,delta.z)<movement.length()*.15){blockedTime+=dt;if(blockedTime>.75){route=[];routeIndex=0;blockedTime=0;}}else blockedTime=0;
 const nextHeight=surfaceHeight(nextX/size,nextZ/size);
 visualGround=THREE.MathUtils.damp(visualGround,nextHeight,9,dt);
 player.setNextKinematicTranslation({x:nextX,y:visualGround+1,z:nextZ});world.step();waterClock.value=now*.001;
 const pos=player.translation(),ground=visualGround;
 updateShield(dt,pos.x,ground,pos.z,scene);
 if(pendingShop&&!ragdoll&&Math.hypot(pos.x-pendingShop.doorX,pos.z-pendingShop.doorZ)<1.4){const building=pendingShop;pendingShop=null;approachBuilding(building);}
 if(!ragdoll&&!agents.isDriving())playerVisual.update(pos.x,ground,pos.z,delta.x,delta.z,dt,running);
 if(agents.isDriving()){agents.driveCar(pos.x,pos.z,carHeading);boostFlames.visible=boostActive;boostFlames.position.set(pos.x,ground,pos.z);boostFlames.rotation.y=carHeading;boostFlames.scale.z=.8+Math.random()*.45;}else boostFlames.visible=false;
 updateChunks(pos.x,pos.z);
 updateRouteVisual(pos.x,pos.z);
 const distance=62,horizontal=Math.cos(pitch)*distance;
 const shake=dashPulse*.22+combatShake;
 camera.zoom=zoom/Math.min(maxZoom,zoom*(1+dashPulse*.1));camera.updateProjectionMatrix();
 camera.position.set(pos.x+Math.sin(yaw)*horizontal+(Math.random()-.5)*shake,ground+Math.sin(pitch)*distance+(Math.random()-.5)*shake,pos.z+Math.cos(yaw)*horizontal+(Math.random()-.5)*shake);
 camera.lookAt(pos.x,ground+.75,pos.z);
 online.sendMove(pos.x,pos.z,playerVisual.root.rotation.y);for(const remote of remotePlayers.values()){const v=remote.visual.root.position,dx=remote.x-v.x,dz=remote.z-v.z;remote.visual.update(v.x+dx*Math.min(1,dt*10),surfaceHeight(remote.x/size,remote.z/size),v.z+dz*Math.min(1,dt*10),dx,dz,dt,false);if(Math.hypot(dx,dz)<.1)remote.visual.root.rotation.y=remote.heading;}
 const crewCity=cityAt(pos.x/size,pos.z/size);cityMap.updatePlayer(pos.x,pos.z);agents.syncCrew(crewCity.urban?empire.count(crewCity.ix,crewCity.iz,'guard'):0,crewCity.urban?empire.count(crewCity.ix,crewCity.iz,'mugger'):0,pos.x,pos.z);
 agents.syncVisibility(camera);agents.update(dt);for(const shot of agents.takeCrewShots())combatEffects.shot(scene,shot.start,shot.end);agents.setPlayerPosition(pos.x,pos.z);
 for(const shot of agents.takeOutsideCashierShots()){combatEffects.shot(scene,shot,new THREE.Vector3(pos.x,ground+1,pos.z));const angle=Math.atan2(shot.x-pos.x,shot.z-pos.z);if(!(shieldTime>0&&Math.cos(angle-shieldHeading)>Math.cos(weapons.abilities.shieldHalfAngle)))playerHealth=Math.max(0,playerHealth-10);if(playerHealth===0){const loss=takeHousePursuitLoss();bankPuzzle.close();if(agents.isDriving()){agents.leaveCar();vehicleCollider.setEnabled(false);collider.setEnabled(true);boostFlames.visible=false;playerVisual.root.visible=true;carVX=carVZ=0;driveKeys.clear();}playerHealth=weapons.abilities.maxHealth;player.setTranslation({x:start.x,y:startHeight+1,z:start.z},true);agents.setPlayerPosition(start.x,start.z);clearWanted();if(loss)showHouseFailure(loss);break;}}
 if(wantedLevel){
  if(now>=dispatchTime){agents.dispatchPolice(pos.x,pos.z,wantedLevel);dispatchTime=now+3000;}
  const units=agents.policeMarkers(),playerPoint=new THREE.Vector3(pos.x,ground+1,pos.z);
  const seeing=units.filter(u=>Math.hypot(u.x-pos.x,u.z-pos.z)<22&&sightClear(new THREE.Vector3(u.x,surfaceHeight(u.x/size,u.z/size)+1,u.z),playerPoint));
  if(seeing.length){wantedMode='combat';lastSeen=now;lastKnownX=pos.x;lastKnownZ=pos.z;searchTime=0;}
  else if(now-lastSeen>6000)wantedMode='search';
  if(wantedMode==='search'){searchTime+=dt;if(searchTime>=30)clearWanted();}
  if(wantedLevel){agents.updatePolice(dt,wantedMode==='combat'?pos.x:lastKnownX,wantedMode==='combat'?pos.z:lastKnownZ,wantedMode==='combat');
   if(wantedMode==='combat'&&seeing.some(u=>u.kind==='person')&&now>=policeShot){policeShot=now+1100;const shooter=seeing.find(u=>u.kind==='person')!;combatEffects.shot(scene,new THREE.Vector3(shooter.x,surfaceHeight(shooter.x/size,shooter.z/size)+1,shooter.z),playerPoint);const attackAngle=Math.atan2(shooter.x-pos.x,shooter.z-pos.z),blocked=shieldTime>0&&Math.cos(attackAngle-shieldHeading)>Math.cos(weapons.abilities.shieldHalfAngle);if(!blocked)playerHealth=Math.max(0,playerHealth-5);if(playerHealth===0){const loss=takeHousePursuitLoss();bankPuzzle.close();if(agents.isDriving()){agents.leaveCar();vehicleCollider.setEnabled(false);collider.setEnabled(true);boostFlames.visible=false;playerVisual.root.visible=true;carVX=carVZ=0;driveKeys.clear();}playerHealth=weapons.abilities.maxHealth;player.setTranslation({x:start.x,y:startHeight+1,z:start.z},true);agents.setPlayerPosition(start.x,start.z);clearWanted();if(loss)showHouseFailure(loss);}}
  }
 }
 agents.stepPhysics(dt);
 const nowRagdoll=agents.playerRagdoll();
 if(nowRagdoll&&!wasRagdoll)playerHealth=Math.max(0,playerHealth-20);
 const respawn=wasRagdoll&&!nowRagdoll&&playerHealth===0;
 if(respawn){const loss=takeHousePursuitLoss();bankPuzzle.close();clearWanted();if(loss)showHouseFailure(loss);playerHealth=weapons.abilities.maxHealth;player.setTranslation({x:start.x,y:startHeight+1,z:start.z},true);agents.setPlayerPosition(start.x,start.z);}
 wasRagdoll=nowRagdoll;
 const physicsPosition=agents.playerPosition();if(physicsPosition&&ragdoll&&!agents.playerRagdoll()&&!respawn)player.setTranslation({x:physicsPosition.x,y:surfaceHeight(physicsPosition.x/size,physicsPosition.z/size)+1,z:physicsPosition.z},true);
 const occluders:BuildingOccluder[]=[];for(const chunk of chunks.values())occluders.push(...chunk.occluders);
 updateBuildingOcclusion(camera,new THREE.Vector3(pos.x,ground,pos.z),occluders,dt);
 sun.position.set(pos.x-75,ground+135,pos.z+60);sun.target.position.set(pos.x,ground,pos.z);
 const prompt=agents.isDriving()?'WASD DRIVE  |  SPACE DRIFT  |  Q BOOST  |  E EXIT':shopLoading?'LOADING SHOP...':now<shopNoticeUntil?shopNotice:nearestAtm(pos.x,pos.z)&&!ragdoll?'E  HACK ATM':nearestShop(pos.x,pos.z)&&!ragdoll?`E  ${nearestShop(pos.x,pos.z)?.kind==='house'?'LEFT CLICK HOUSE WITH LOCKPICK':nearestShop(pos.x,pos.z)?.kind==='bank'?'ENTER BANK':'ENTER SHOP'}`:'';
 hud.setPrompt(prompt);
 hud.update({health:playerHealth,dash:agents.isDriving()?boost:weapons.abilities.dashProgress,driving:agents.isDriving(),shield:1-shieldCooldown/weapons.abilities.shieldInterval,shieldSeconds:shieldCooldown,maxHealth:weapons.abilities.maxHealth,dashCount:weapons.abilities.charges,dashMax:weapons.abilities.maxCharges,money:weapons.money,wanted:wantedLevel,district:(()=>{const ix=Math.round(pos.x/size/CITY_SPACING),iz=Math.round(pos.z/size/CITY_SPACING),name=districtName(ix,iz),owner=cityOwner(ix,iz);return name?name+(owner?`\n${owner.ownerName}`:'\nSAHİPSİZ'):'';})(),x:pos.x,z:pos.z,heading:playerVisual.root.rotation.y,route,routeIndex,police:agents.policeMarkers(),wantedMode:wantedLevel?(wantedMode==='search'?'POLIS ARIYOR':'POLIS TAKIPTE'):'WANTED'},now);
 renderer.render(scene,camera);
}
updateChunks(start.x,start.z);requestAnimationFrame(frame);
