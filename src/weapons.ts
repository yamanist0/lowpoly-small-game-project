import { Abilities, upgrades, upgradePrices, type UpgradeId } from './upgrades';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import gunsUrl from '../assets/guns/source/Guns.fbx?url';
import './weapons.css';

export type Weapon={id:string;name:string;price:number};
export const weaponCatalog:readonly Weapon[]=[
 {id:'MG1',name:'MG-1',price:500},
 {id:'MG2',name:'MG-2',price:950},
 {id:'MG3',name:'MG-3',price:1400},
 {id:'MG4',name:'MG-4',price:1900},
 {id:'MG5',name:'MG-5',price:2400},
 {id:'MSR',name:'MSR',price:3000},
 {id:'SNIPER1',name:'Sniper',price:3700},
 {id:'GL1',name:'Grenade Launcher',price:4300},
 {id:'RPG',name:'RPG',price:5000}
];
const unarmed:Weapon={id:'unarmed',name:'Unarmed',price:0};
const lockpick:Weapon={id:'lockpick',name:'Lockpick',price:250};
const slots=[unarmed,lockpick,...weaponCatalog];
const lockpickIcon='<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 47 42 18q4-4 8 0t0 8l-4 4-4-4 4-4-1-1-29 29z" fill="currentColor"/><path d="M18 52 49 30" fill="none" stroke="currentColor" stroke-width="3"/></svg>'; 
const fistIcon=`<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 31V18a5 5 0 0 1 10 0v9-14a5 5 0 0 1 10 0v14-11a5 5 0 0 1 10 0v14-7a5 5 0 0 1 10 0v15c0 13-8 20-20 20h-6c-6 0-10-3-13-8l-6-11a5 5 0 0 1 5-7Z" fill="currentColor"/></svg>`;

// Screenshots are rendered once from the user's FBX meshes. The preview
// renderer is then disposed; the live scene is never changed or paused for it.
let previewsPromise:Promise<Map<string,string>>|null=null;
async function loadWeaponPreviews(){
 if(!previewsPromise)previewsPromise=(async()=>{
  const manager=new THREE.LoadingManager();
  manager.addHandler(/\.(png|jpe?g)$/i,{setPath(){return this;},load(){return new THREE.Texture();}} as unknown as THREE.Loader);
  const source=await new FBXLoader(manager).loadAsync(gunsUrl);source.updateMatrixWorld(true);
  const meshes=new Map<string,THREE.Mesh>();source.traverse(o=>{if(o instanceof THREE.Mesh)meshes.set(o.name,o);});
  const missing=weaponCatalog.filter(weapon=>!meshes.has(weapon.id));
  if(missing.length)throw new Error(`Missing gun meshes: ${missing.map(weapon=>weapon.id).join(', ')}`);
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.setSize(216,126);renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-2,2,1.17,-1.17,.01,20);
  camera.position.set(3,1.55,1.5);camera.lookAt(0,0,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0x8c9897,2));
  const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(-3,5,4);scene.add(light);
  const material=new THREE.MeshPhongMaterial({color:0xdde5dd,shininess:25});
  const images=new Map<string,string>();
  try{
   for(const weapon of weaponCatalog){
    const original=meshes.get(weapon.id)!;const mesh=original.clone();mesh.material=material;mesh.matrix.copy(original.matrixWorld);mesh.matrixAutoUpdate=false;
    const group=new THREE.Group();group.add(mesh);group.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(group),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    group.position.sub(center);const holder=new THREE.Group();holder.add(group);holder.scale.setScalar(2.8/Math.max(size.x,size.y,size.z));
    scene.add(holder);renderer.render(scene,camera);images.set(weapon.id,renderer.domElement.toDataURL('image/png'));scene.remove(holder);
   }
  }finally{
   material.dispose();renderer.dispose();source.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});
  }
  return images;
 })().catch(error=>{previewsPromise=null;throw error;});
 return previewsPromise;
}

type PurchaseResult='purchased'|'owned'|'insufficient'|'unknown';
export class WeaponSystem {
 money:number;
 lockpicks=0;
 private lockpickStatus!:HTMLElement;private lockpickButton!:HTMLButtonElement;
 readonly abilities=new Abilities();
 onUpgrade:(id:UpgradeId)=>void=()=>{};
 private readonly upgradeRows=new Map<UpgradeId,{button:HTMLButtonElement;status:HTMLElement}>();
 onMoneyChange:(money:number)=>void=()=>{};
 readonly owned=new Set<string>();
 selected='unarmed';
 private highlighted=0;
 private wheelOpen=false;
 private storeOpen=false;
 private images=new Map<string,string>();
 private readonly indicator:HTMLElement;
 private readonly wheel:HTMLElement;
 private readonly wheelPanel:HTMLElement;
 private readonly wheelLabel:HTMLElement;
 private readonly wheelSlots:HTMLElement[]=[];
 private readonly store:HTMLElement;
 private readonly storeRows=new Map<string,{button:HTMLButtonElement;image:HTMLElement;status:HTMLElement}>();
 private readonly storeBalance:HTMLElement;
 private readonly feedback:HTMLElement;
 constructor(initialMoney=500){
  this.money=initialMoney;
  this.indicator=document.createElement('div');this.indicator.className='weapon-indicator';this.indicator.setAttribute('aria-label','Selected weapon');
  this.indicator.innerHTML=`<div class="weapon-indicator-icon" data-icon>${fistIcon}</div><div class="weapon-indicator-copy"><span>WEAPON</span><strong data-name>UNARMED</strong></div>`;
  document.body.appendChild(this.indicator);
  this.wheel=document.createElement('div');this.wheel.className='weapon-wheel-overlay';this.wheel.hidden=true;
  this.wheel.innerHTML='<div class="weapon-wheel" role="group" aria-label="Weapon wheel"><svg class="wheel-sectors" viewBox="0 0 400 400" aria-hidden="true"></svg><div class="wheel-center"><span>SELECT WEAPON</span><strong data-wheel-name>UNARMED</strong><small data-wheel-state>RELEASE TAB</small></div></div><div class="wheel-help">MOVE MOUSE OR USE ARROWS · RELEASE TAB TO EQUIP</div>';
  document.body.appendChild(this.wheel);
  this.wheelPanel=this.wheel.querySelector<HTMLElement>('.weapon-wheel')!;this.wheelLabel=this.wheel.querySelector<HTMLElement>('[data-wheel-name]')!;
  const svg=this.wheel.querySelector<SVGElement>('svg')!,svgNS='http://www.w3.org/2000/svg';
  const point=(radius:number,angle:number)=>[200+radius*Math.cos(angle),200+radius*Math.sin(angle)];
  slots.forEach((weapon,i)=>{
   const mid=-Math.PI/2+i*2*Math.PI/slots.length,half=Math.PI/slots.length-.018;
   const [x1,y1]=point(196,mid-half),[x2,y2]=point(196,mid+half),[x3,y3]=point(86,mid+half),[x4,y4]=point(86,mid-half);
   const path=document.createElementNS(svgNS,'path');path.setAttribute('d',`M ${x1} ${y1} A 196 196 0 0 1 ${x2} ${y2} L ${x3} ${y3} A 86 86 0 0 0 ${x4} ${y4} Z`);path.setAttribute('class','wheel-sector');svg.appendChild(path);
   const slot=document.createElement('div');slot.className='wheel-slot';slot.style.left=`${50+35.5*Math.cos(mid)}%`;slot.style.top=`${50+35.5*Math.sin(mid)}%`;
   slot.innerHTML=`<span class="wheel-icon">${weapon.id==='unarmed'?fistIcon:''}</span><span class="wheel-slot-name"></span>`;
   slot.querySelector<HTMLElement>('.wheel-slot-name')!.textContent=weapon.name;this.wheelPanel.appendChild(slot);this.wheelSlots.push(slot);
  });
  this.store=document.createElement('div');this.store.className='weapon-store-overlay';this.store.hidden=true;
  this.store.innerHTML='<section class="weapon-store" role="dialog" aria-modal="true" aria-labelledby="weapon-store-title"><div class="weapon-store-header"><div><span class="weapon-store-kicker">MARKET COUNTER</span><h2 id="weapon-store-title">MARKET</h2><p>Weapons and character upgrades.</p></div><div class="weapon-store-balance"><span>AVAILABLE CASH</span><strong data-balance></strong></div><button class="weapon-store-close" type="button" aria-label="Close weapon shop">×</button></div><div class="weapon-store-list" data-store-list></div><div class="weapon-store-footer"><span data-feedback aria-live="polite">Purchased weapons are equipped automatically.</span><span>ESC TO CLOSE</span></div></section>';
  document.body.appendChild(this.store);
  this.storeBalance=this.store.querySelector<HTMLElement>('[data-balance]')!;this.feedback=this.store.querySelector<HTMLElement>('[data-feedback]')!;
  this.store.querySelector<HTMLButtonElement>('.weapon-store-close')!.addEventListener('click',()=>this.closeStore());
  this.store.addEventListener('pointerdown',event=>{if(event.target===this.store)this.closeStore();});
  const list=this.store.querySelector<HTMLElement>('[data-store-list]')!;
  for(const weapon of weaponCatalog){
   const card=document.createElement('article');card.className='weapon-card';
   card.innerHTML='<div class="weapon-card-image"></div><div class="weapon-card-copy"><strong></strong><span></span></div><button type="button"></button>';
   const image=card.querySelector<HTMLElement>('.weapon-card-image')!,copy=card.querySelector<HTMLElement>('.weapon-card-copy')!,status=copy.querySelector('span')!,button=card.querySelector<HTMLButtonElement>('button')!;
   copy.querySelector('strong')!.textContent=weapon.name;status.textContent=`$${weapon.price.toLocaleString('en-US')}`;
   button.addEventListener('click',()=>{const result=this.purchase(weapon.id);this.feedback.textContent=result==='purchased'?`${weapon.name.toUpperCase()} ADDED TO INVENTORY`:result==='insufficient'?'NOT ENOUGH CASH':'ALREADY OWNED';});
   list.appendChild(card);this.storeRows.set(weapon.id,{button,image,status});
  }
  {const card=document.createElement('article');card.className='weapon-card upgrade-card';card.innerHTML='<div class="weapon-card-copy"><strong>LOCKPICK</strong><span>Reusable; breaks on a failed house lock.</span><span data-lockpick-status></span></div><button type="button">BUY</button>';this.lockpickStatus=card.querySelector<HTMLElement>('[data-lockpick-status]')!;this.lockpickButton=card.querySelector<HTMLButtonElement>('button')!;this.lockpickButton.addEventListener('click',()=>{if(this.money<250||this.lockpicks>=5)return;this.money-=250;this.lockpicks++;this.feedback.textContent='LOCKPICK ADDED TO INVENTORY';this.refreshStore();this.onMoneyChange(this.money);});list.appendChild(card);}
  for(const upgrade of upgrades){const card=document.createElement('article');card.className='weapon-card upgrade-card';
   const copy=document.createElement('div');copy.className='weapon-card-copy';const name=document.createElement('strong');name.textContent=upgrade.name;const detail=document.createElement('span');detail.textContent=upgrade.detail;const status=document.createElement('span');copy.append(name,detail,status);const button=document.createElement('button');button.type='button';card.append(copy,button);list.appendChild(card);this.upgradeRows.set(upgrade.id,{button,status});
   button.addEventListener('click',()=>{const level=this.abilities.levels[upgrade.id],price=upgradePrices[level];if(price===undefined||this.money<price)return;this.money-=price;this.abilities.upgrade(upgrade.id);this.onUpgrade(upgrade.id);this.feedback.textContent=`${upgrade.name} LEVEL ${level+1} PURCHASED`;this.refreshStore();this.onMoneyChange(this.money);});
  }
  window.addEventListener('mousemove',event=>{
   if(!this.wheelOpen)return;const rect=this.wheelPanel.getBoundingClientRect(),dx=event.clientX-(rect.left+rect.width/2),dy=event.clientY-(rect.top+rect.height/2);
   if(Math.hypot(dx,dy)<rect.width*.19)return;
   this.highlighted=((Math.round((Math.atan2(dy,dx)+Math.PI/2)/(2*Math.PI/slots.length))%slots.length)+slots.length)%slots.length;this.refreshWheel();
  });
  this.refreshIndicator();this.refreshStore();
 }
 get isWheelOpen(){return this.wheelOpen;}
 get isStoreOpen(){return this.storeOpen;}
 get isBlocking(){return this.wheelOpen||this.storeOpen;}
 private preview(){
  if(this.images.size)return;
  void loadWeaponPreviews().then(images=>{this.images=images;this.refreshIndicator();this.refreshWheel();this.refreshStore();}).catch(error=>console.error('Weapon previews could not be loaded',error));
 }
 private icon(container:HTMLElement,id:string){
  if(id==='unarmed'||id==='lockpick'){container.innerHTML=id==='unarmed'?fistIcon:lockpickIcon;return;}
  const url=this.images.get(id);if(!url)return;
  let image=container.querySelector<HTMLImageElement>('img');if(!image){container.replaceChildren();image=document.createElement('img');image.alt='';container.appendChild(image);}if(image.src!==url)image.src=url;
 }
 private isAvailable(id:string){return id==='unarmed'||(id==='lockpick'?this.lockpicks>0:this.owned.has(id));}
 private refreshIndicator(){
  const weapon=slots.find(item=>item.id===this.selected)??unarmed;
  this.indicator.querySelector<HTMLElement>('[data-name]')!.textContent=weapon.name.toUpperCase();
  const icon=this.indicator.querySelector<HTMLElement>('[data-icon]')!;icon.replaceChildren();this.icon(icon,weapon.id);
  this.indicator.setAttribute('aria-label',`Selected weapon: ${weapon.name}`);
 }
 private refreshWheel(){
  const paths=this.wheel.querySelectorAll<SVGElement>('.wheel-sector');
  slots.forEach((weapon,i)=>{
   const available=this.isAvailable(weapon.id),active=i===this.highlighted;
   paths[i].classList.toggle('active',active);this.wheelSlots[i].classList.toggle('active',active);this.wheelSlots[i].classList.toggle('locked',!available);
   this.icon(this.wheelSlots[i].querySelector<HTMLElement>('.wheel-icon')!,weapon.id);
  });
  const weapon=slots[this.highlighted],available=this.isAvailable(weapon.id);
  this.wheelLabel.textContent=weapon.name.toUpperCase();this.wheel.querySelector<HTMLElement>('[data-wheel-state]')!.textContent=available?'RELEASE TAB':'NOT OWNED';
 }
 private refreshStore(){
  this.storeBalance.textContent=`$${this.money.toLocaleString('en-US')}`;
  this.lockpickStatus.textContent=`OWNED ${this.lockpicks}/5 | $250 EACH`;this.lockpickButton.disabled=this.money<250||this.lockpicks>=5;this.lockpickButton.textContent=this.lockpicks>=5?'MAX':this.money>=250?'BUY':'LOCKED';
  for(const upgrade of upgrades){const row=this.upgradeRows.get(upgrade.id)!;const level=this.abilities.levels[upgrade.id],price=upgradePrices[level];row.status.textContent=price===undefined?`LEVEL ${level}/3 - MAX`:`LEVEL ${level}/3 - NEXT $${price.toLocaleString('en-US')}`;row.button.textContent=price===undefined?'MAX':this.money>=price?'UPGRADE':'LOCKED';row.button.disabled=price===undefined||this.money<price;}
  for(const weapon of weaponCatalog){const row=this.storeRows.get(weapon.id)!,owned=this.owned.has(weapon.id),affordable=this.money>=weapon.price;
   this.icon(row.image,weapon.id);row.status.textContent=`$${weapon.price.toLocaleString('en-US')}`;row.button.textContent=owned?'OWNED':affordable?'BUY':'LOCKED';row.button.disabled=owned||!affordable;
   row.button.setAttribute('aria-label',owned?`${weapon.name}, owned`:affordable?`Buy ${weapon.name} for $${weapon.price}`:`${weapon.name}, $${weapon.price}, insufficient cash`);
  }
 }
 purchase(id:string):PurchaseResult{
  const weapon=weaponCatalog.find(item=>item.id===id);if(!weapon)return 'unknown';
  if(this.owned.has(id))return 'owned';if(this.money<weapon.price)return 'insufficient';
  this.money-=weapon.price;this.owned.add(id);this.selected=id;this.refreshStore();this.refreshIndicator();this.refreshWheel();this.onMoneyChange(this.money);return 'purchased';
 }
 breakLockpick(){if(this.lockpicks<=0)return false;this.lockpicks--;if(!this.lockpicks&&this.selected==='lockpick'){this.selected='unarmed';this.refreshIndicator();}this.refreshStore();this.refreshWheel();return true;}
 removeMoney(amount:number){const removed=Math.min(this.money,Math.max(0,Math.floor(amount)));this.money-=removed;this.refreshStore();this.onMoneyChange(this.money);return removed;}
 addMoney(amount:number){if(!Number.isFinite(amount)||amount<=0)return;this.money+=Math.floor(amount);this.refreshStore();this.onMoneyChange(this.money);}
 openStore(){if(this.wheelOpen)return;this.storeOpen=true;this.store.hidden=false;this.feedback.textContent='Purchased weapons are equipped automatically.';this.refreshStore();this.preview();this.store.querySelector<HTMLButtonElement>('.weapon-store-close')!.focus();}
 closeStore(){this.storeOpen=false;this.store.hidden=true;}
 openWheel(){if(this.storeOpen||this.wheelOpen)return;this.highlighted=Math.max(0,slots.findIndex(weapon=>weapon.id===this.selected));this.wheelOpen=true;this.wheel.hidden=false;this.refreshWheel();this.preview();}
 moveSelection(direction:number){if(!this.wheelOpen)return;this.highlighted=(this.highlighted+direction+slots.length)%slots.length;this.refreshWheel();}
 closeWheel(equip=true){if(!this.wheelOpen)return;const item=slots[this.highlighted];if(equip&&(this.isAvailable(item.id))){this.selected=item.id;this.refreshIndicator();}this.wheelOpen=false;this.wheel.hidden=true;}
}
