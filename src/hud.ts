import './hud.css';
import type { Point } from './pathfinding';
import type { ShopMap } from './shopInterior';

type MapHooks={isRoad:(x:number,z:number)=>boolean;isWater:(x:number,z:number)=>boolean;isUrban:(x:number,z:number)=>boolean;shops:()=>(Point&{kind?:'shop'|'bank'|'house'})[]};
type HudState={health:number;maxHealth?:number;dash:number;dashCount?:number;dashMax?:number;shield:number;shieldSeconds?:number;driving?:boolean;money:number;wanted:number;district:string;x:number;z:number;heading:number;route:Point[];routeIndex:number;interior?:ShopMap;police?:{x:number;z:number;kind:string}[];wantedMode?:string};

export function createHud(world:MapHooks){
 const hud=document.createElement('aside');hud.className='game-hud';hud.setAttribute('aria-label','Player status');
 hud.innerHTML=`<div class="hud-district" data-district></div><div class="hud-prompt" data-prompt hidden></div><div class="hud-status">
  <div class="hud-money"><span class="hud-caption">CASH</span><strong data-money>$0</strong></div>
  <div class="hud-wanted" aria-label="Wanted level: 0 / 5"><span class="hud-caption" data-wanted-mode>WANTED</span><div class="hud-stars" data-stars></div></div>
  <div class="hud-meter health"><div class="hud-meter-head"><span>HEALTH</span><span data-health>100</span></div><div class="hud-track"><div class="hud-fill" data-health-fill></div></div></div>
  <div class="hud-meter dash"><div class="hud-meter-head"><span data-dash-label>DASH <kbd>SPACE</kbd></span><span data-dash>READY</span></div><div class="hud-track"><div class="hud-fill" data-dash-fill></div></div></div>
  <div class="hud-meter shield"><div class="hud-meter-head"><span>SHIELD <kbd>Q</kbd></span><span data-shield>READY</span></div><div class="hud-track"><div class="hud-fill" data-shield-fill></div></div></div>
 </div><div class="hud-map-wrap"><div class="hud-map"><canvas width="192" height="192" aria-label="Nearby map"></canvas><span class="hud-north">N</span></div><span class="hud-map-label">M HARİTA · N ŞEHİR</span></div>`;
 document.body.appendChild(hud);
 const select=<T extends Element>(q:string)=>hud.querySelector<T>(q)!;
 const health=select<HTMLElement>('[data-health]'),healthFill=select<HTMLElement>('[data-health-fill]'),dash=select<HTMLElement>('[data-dash]'),dashFill=select<HTMLElement>('[data-dash-fill]'),money=select<HTMLElement>('[data-money]');
 const stars=select<HTMLElement>('[data-stars]'),wanted=select<HTMLElement>('.hud-wanted'),district=select<HTMLElement>('[data-district]'),prompt=select<HTMLElement>('[data-prompt]');
 const star='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.7 2.8 5.7 6.3.9-4.5 4.4 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.5-4.4 6.3-.9z"/></svg>';
 stars.innerHTML=star.repeat(5);
 const canvas=select<HTMLCanvasElement>('canvas'),ctx=canvas.getContext('2d')!;
 const mapCache=new Map<string,string>(),mapBase=document.createElement('canvas');mapBase.width=mapBase.height=192;const base=mapBase.getContext('2d')!;
 const radius=15,tilePixels=192/(radius*2+1),tileSize=4;
 let lastTile='',lastTime=0,lastHealth=-1,lastMoney=-1,lastWanted=-1,lastDash=-1,lastDistrict='',lastDriving=false;
 function setMoney(value:number){
  if(value===lastMoney)return;lastMoney=value;
  money.textContent=`$${Math.max(0,Math.floor(value)).toLocaleString('en-US')}`;
  money.style.fontSize=`${Math.min(27,Math.max(5,Math.floor(115/money.textContent.length)))}px`;
 }
 function tileColor(x:number,z:number){
  const k=`${x},${z}`;let color=mapCache.get(k);if(color)return color;
  color=world.isRoad(x,z)?'#dce0d0':world.isWater(x,z)?'#6babb8':world.isUrban(x,z)?'#a5ab97':'#839b7f';
  if(mapCache.size>5000)mapCache.clear();mapCache.set(k,color);return color;
 }
 function drawMap(s:HudState){
  let point:(x:number,z:number)=>{x:number;z:number};
  if(s.interior){
   const {width,depth,exit}=s.interior,scale=150/Math.max(width,depth);
   ctx.fillStyle='#263c3c';ctx.fillRect(0,0,192,192);
   ctx.fillStyle='#dbd7c2';ctx.fillRect(96-width*scale/2,96-depth*scale/2,width*scale,depth*scale);
   ctx.strokeStyle='#fff5df';ctx.lineWidth=2;ctx.strokeRect(96-width*scale/2,96-depth*scale/2,width*scale,depth*scale);
   point=(x,z)=>({x:96+x*scale,z:96+z*scale});
   const door=point(exit.x,exit.z);ctx.fillStyle='#258f8c';ctx.fillRect(door.x-4,door.z-3,8,6);
  }else{
   const tx=Math.round(s.x/tileSize),tz=Math.round(s.z/tileSize),key=`${tx},${tz}`;
   if(key!==lastTile){
    lastTile=key;
    for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
     base.fillStyle=tileColor(tx+dx,tz+dz);base.fillRect((dx+radius)*tilePixels,(dz+radius)*tilePixels,Math.ceil(tilePixels),Math.ceil(tilePixels));
    }
   }
   ctx.clearRect(0,0,192,192);ctx.drawImage(mapBase,0,0);
   point=(x,z)=>({x:96+(x/tileSize-tx)*tilePixels,z:96+(z/tileSize-tz)*tilePixels});
   for(const shop of world.shops()){
    const p=point(shop.x,shop.z);if(p.x<-6||p.x>198||p.z<-6||p.z>198)continue;
    // A small storefront silhouette keeps shops distinct from roads and the player.
    ctx.fillStyle='#fff8e8';ctx.fillRect(p.x-5,p.z-5,10,10);
    ctx.fillStyle=shop.kind==='bank'?'#355d96':'#a3543d';ctx.fillRect(p.x-4,p.z-4,8,3);ctx.fillRect(p.x-3,p.z,6,4);
    ctx.fillStyle='#fff8e8';ctx.fillRect(p.x-1,p.z+1,2,3);
   }
  }
  for(const unit of s.police??[]){const p=point(unit.x,unit.z);if(p.x<3||p.x>189||p.z<3||p.z>189)continue;ctx.fillStyle=unit.kind==='car'?'#1863e8':'#75bbff';ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.z,unit.kind==='car'?4:3,0,Math.PI*2);ctx.fill();ctx.stroke();}
  if(s.routeIndex<s.route.length){ctx.beginPath();const start=point(s.x,s.z);ctx.moveTo(start.x,start.z);for(let i=s.routeIndex;i<s.route.length;i++){const p=point(s.route[i].x,s.route[i].z);ctx.lineTo(p.x,p.z);}ctx.strokeStyle='#126879';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);const end=point(s.route[s.route.length-1].x,s.route[s.route.length-1].z);ctx.fillStyle='#1d7783';ctx.beginPath();ctx.arc(end.x,end.z,3,0,Math.PI*2);ctx.fill();}
  const pos=point(s.x,s.z);ctx.save();ctx.translate(pos.x,pos.z);ctx.rotate(Math.PI-s.heading);ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,5);ctx.lineTo(0,3);ctx.lineTo(-5,5);ctx.closePath();ctx.fillStyle='#fff';ctx.strokeStyle='#152c33';ctx.lineWidth=2;ctx.fill();ctx.stroke();ctx.restore();
 }
 return {setMoney,setPrompt(message:string){prompt.hidden=!message;if(prompt.textContent!==message)prompt.textContent=message;},update(s:HudState,now:number){
  if(s.district!==lastDistrict){lastDistrict=s.district;district.textContent=s.district;}
  const hp=Math.max(0,Math.min(s.maxHealth??100,Math.round(s.health))),charge=Math.max(0,Math.min(1,s.dash)),dashPct=Math.round(charge*100);
  if(hp!==lastHealth){lastHealth=hp;health.textContent=String(hp);healthFill.style.transform=`scaleX(${hp/(s.maxHealth??100)})`;hud.classList.toggle('low-health',hp<=30);}
  select<HTMLElement>('[data-dash-label]').innerHTML=s.driving?'BOOST <kbd>Q</kbd>':'DASH <kbd>SPACE</kbd>';
  if(dashPct!==lastDash||!s.driving||lastDriving!==!!s.driving){lastDriving=!!s.driving;lastDash=dashPct;dashFill.style.transform=`scaleX(${charge})`;dash.textContent=s.driving?(charge>=.999?'READY':`${dashPct}%`):`${s.dashCount??0}/${s.dashMax??1}`;}
  const shieldCharge=Math.max(0,Math.min(1,s.shield));select<HTMLElement>('[data-shield-fill]').style.transform=`scaleX(${shieldCharge})`;select<HTMLElement>('[data-shield]').textContent=shieldCharge>=.999?'READY':`${Math.ceil(s.shieldSeconds??0)}s`;
  setMoney(s.money);
  select<HTMLElement>('[data-wanted-mode]').textContent=s.wantedMode??'WANTED';
  if(s.wanted!==lastWanted){lastWanted=s.wanted;[...stars.children].forEach((el,i)=>el.classList.toggle('active',i<s.wanted));wanted.setAttribute('aria-label',`Wanted level: ${s.wanted} / 5`);}
  if(now-lastTime>=150){lastTime=now;drawMap(s);}
 }};
}
