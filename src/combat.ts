import * as THREE from 'three';
import flashUrl from '../assets/kenney_particle-pack/PNG (Transparent)/muzzle_01.png?url';
import sparkUrl from '../assets/kenney_particle-pack/PNG (Transparent)/spark_01.png?url';
import smokeUrl from '../assets/kenney_particle-pack/PNG (Transparent)/smoke_03.png?url';
import fireUrl from '../assets/kenney_particle-pack/PNG (Transparent)/fire_01.png?url';

export type CombatTarget={id:string;kind:'person'|'car';police:boolean;position:THREE.Vector3;radius:number};
export type CombatResult={killed:boolean;kind:'person'|'car';police:boolean;position:THREE.Vector3};
export type WeaponStats={damage:number;cooldown:number;range:number;radius:number;flight:number};
export const weaponStats:Record<string,WeaponStats>={
 MG1:{damage:42,cooldown:.23,range:30,radius:0,flight:0},
 MG2:{damage:55,cooldown:.20,range:32,radius:0,flight:0},
 MG3:{damage:65,cooldown:.18,range:34,radius:0,flight:0},
 MG4:{damage:78,cooldown:.16,range:36,radius:0,flight:0},
 MG5:{damage:100,cooldown:.15,range:38,radius:0,flight:0},
 MSR:{damage:95,cooldown:.38,range:44,radius:0,flight:0},
 SNIPER1:{damage:135,cooldown:.65,range:52,radius:0,flight:0},
 GL1:{damage:160,cooldown:.8,range:35,radius:3.5,flight:20},
 RPG:{damage:260,cooldown:1.1,range:42,radius:4.5,flight:24}
};
export function rewardFor(kind:'person'|'car',police:boolean,random=Math.random){
 const low=kind==='person'?(police?50:25):(police?150:50),high=kind==='person'?(police?75:50):(police?250:75);
 return low+Math.floor(random()*(high-low+1));
}

type Particle={scene:THREE.Scene;sprite:THREE.Sprite;velocity:THREE.Vector3;life:number;total:number;growth:number};
type Projectile={scene:THREE.Scene;mesh:THREE.Mesh;start:THREE.Vector3;end:THREE.Vector3;elapsed:number;duration:number;land:()=>void};
type Trace={scene:THREE.Scene;line:THREE.Line;life:number};

/** Short-lived sprites use the supplied Kenney particle textures; no physics bodies. */
export class CombatEffects {
 private readonly textureLoader=new THREE.TextureLoader();
 private readonly flash=this.textureLoader.load(flashUrl);
 private readonly spark=this.textureLoader.load(sparkUrl);
 private readonly smoke=this.textureLoader.load(smokeUrl);
 private readonly fire=this.textureLoader.load(fireUrl);
 private readonly projectileGeometry=new THREE.SphereGeometry(.14,8,6);
 private readonly projectileMaterial=new THREE.MeshBasicMaterial({color:0xffb34d});
 private readonly particles:Particle[]=[];private readonly projectiles:Projectile[]=[];private readonly traces:Trace[]=[];
 private sprite(scene:THREE.Scene,map:THREE.Texture,position:THREE.Vector3,color:number,size:number,life:number,velocity:THREE.Vector3,growth=0){
  const material=new THREE.SpriteMaterial({map,color,transparent:true,depthWrite:false});
  const sprite=new THREE.Sprite(material);sprite.position.copy(position);sprite.scale.setScalar(size);material.rotation=Math.random()*Math.PI*2;scene.add(sprite);
  this.particles.push({scene,sprite,velocity,life,total:life,growth});
 }
 shot(scene:THREE.Scene,start:THREE.Vector3,end:THREE.Vector3){
  this.sprite(scene,this.flash,start,0xffe7a5,.75,.11,new THREE.Vector3());
  const geometry=new THREE.BufferGeometry().setFromPoints([start,end]);
  const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xffe8ac,transparent:true,opacity:.9,depthWrite:false}));scene.add(line);this.traces.push({scene,line,life:.09});
 }
 impact(scene:THREE.Scene,position:THREE.Vector3,blood:boolean){
  for(let i=0;i<5;i++){
   const angle=Math.random()*Math.PI*2,speed=1+Math.random()*2;
   this.sprite(scene,this.spark,position,blood?0xc52b28:0xffdc91,.18+Math.random()*.17,.28+Math.random()*.18,new THREE.Vector3(Math.cos(angle)*speed,Math.random()*2,Math.sin(angle)*speed));
  }
 }
 explosion(scene:THREE.Scene,position:THREE.Vector3,scale=1){
  this.sprite(scene,this.flash,position,0xffd590,3.4*scale,.25,new THREE.Vector3(),1.3);
  for(let i=0;i<18;i++){
   const angle=Math.random()*Math.PI*2,speed=(1+Math.random()*4)*scale,smoke=i%3===0;
   this.sprite(scene,smoke?this.smoke:i%2?this.fire:this.spark,position,smoke?0x5a5450:i%2?0xff842e:0xffd16f,(smoke?.9:.35)+Math.random()*.5,(smoke?.9:.45)+Math.random()*.45,new THREE.Vector3(Math.cos(angle)*speed,(1+Math.random()*4)*scale,Math.sin(angle)*speed),smoke?1.2:.2);
  }
 }
 projectile(scene:THREE.Scene,start:THREE.Vector3,end:THREE.Vector3,speed:number,land:()=>void){
  const mesh=new THREE.Mesh(this.projectileGeometry,this.projectileMaterial);mesh.position.copy(start);scene.add(mesh);
  this.projectiles.push({scene,mesh,start:start.clone(),end:end.clone(),elapsed:0,duration:Math.max(.08,start.distanceTo(end)/speed),land});
 }
 update(dt:number){
  for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;p.sprite.position.addScaledVector(p.velocity,dt);p.velocity.y-=dt*2;p.sprite.scale.multiplyScalar(1+p.growth*dt);p.sprite.material.opacity=Math.max(0,p.life/p.total);if(p.life<=0){p.scene.remove(p.sprite);p.sprite.material.dispose();this.particles.splice(i,1);}}
  for(let i=this.traces.length-1;i>=0;i--){const p=this.traces[i];p.life-=dt;if(p.life<=0){p.scene.remove(p.line);p.line.geometry.dispose();(p.line.material as THREE.Material).dispose();this.traces.splice(i,1);}}
  for(let i=this.projectiles.length-1;i>=0;i--){const p=this.projectiles[i];p.elapsed+=dt;p.mesh.position.lerpVectors(p.start,p.end,Math.min(1,p.elapsed/p.duration));if(p.elapsed>=p.duration){p.scene.remove(p.mesh);this.projectiles.splice(i,1);p.land();}}
 }
 clear(scene:THREE.Scene){
  for(let i=this.projectiles.length-1;i>=0;i--)if(this.projectiles[i].scene===scene){scene.remove(this.projectiles[i].mesh);this.projectiles.splice(i,1);}
  for(let i=this.particles.length-1;i>=0;i--)if(this.particles[i].scene===scene){const p=this.particles[i];scene.remove(p.sprite);p.sprite.material.dispose();this.particles.splice(i,1);}
  for(let i=this.traces.length-1;i>=0;i--)if(this.traces[i].scene===scene){const p=this.traces[i];scene.remove(p.line);p.line.geometry.dispose();(p.line.material as THREE.Material).dispose();this.traces.splice(i,1);}
 }
}

export function clearSegment(x1:number,z1:number,x2:number,z2:number,obstacles:readonly {x:number;z:number;halfX:number;halfZ:number}[]){
 for(const box of obstacles){
  // Let a person standing close to a facade shoot away from it.
  if(Math.abs(x1-box.x)<box.halfX&&Math.abs(z1-box.z)<box.halfZ)continue;
  let low=0,high=1;
  for(const [origin,delta,min,max] of [[x1,x2-x1,box.x-box.halfX,box.x+box.halfX],[z1,z2-z1,box.z-box.halfZ,box.z+box.halfZ]]){
   if(Math.abs(delta)<1e-6){if(origin<min||origin>max){low=2;break;}continue;}
   let a=(min-origin)/delta,b=(max-origin)/delta;if(a>b)[a,b]=[b,a];low=Math.max(low,a);high=Math.min(high,b);
  }
  if(low<=high&&high>0&&low<.98)return false;
 }
 return true;
}
