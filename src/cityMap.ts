import { districtIndex,districtName } from './districts';
import './cityMap.css';

type MapWorld={isRoad:(x:number,z:number)=>boolean;isWater:(x:number,z:number)=>boolean;isUrban:(x:number,z:number)=>boolean;isOwned?:(ix:number,iz:number)=>boolean;owner?:(ix:number,iz:number)=>{name:string;mine:boolean}|null;onManage?:()=>void};
const CELL=24, CITY=224;
/** Explored areas are stored independently of streamed world chunks. Coordinates are world units. */
export class CityMap {
 private overlay=document.createElement('div');
 private canvas:HTMLCanvasElement;
 private ctx:CanvasRenderingContext2D;
 private explored=new Set<string>();
 private discovered=new Set<string>();
 private player={x:0,z:0};
 private center={x:0,z:0};
 private scale=.55;
 private drag:{x:number;y:number;cx:number;cz:number}|null=null;
 private dirty=true;
 constructor(private world:MapWorld){
  this.overlay.className='city-map-overlay';this.overlay.hidden=true;
  this.overlay.innerHTML=`<section class="city-map-panel" role="dialog" aria-modal="true" aria-labelledby="city-map-title"><header><div><h2 id="city-map-title">DÜNYA HARİTASI</h2><p>Gezdikçe haritan açılır.</p></div><button type="button" class="city-map-close" aria-label="Haritayı kapat">×</button></header><div class="city-map-stage"><canvas aria-label="Keşfedilen dünya haritası"></canvas><div class="city-map-compass" aria-hidden="true">K</div></div><footer><span><i class="city-map-dot player"></i> Konumun</span><span><i class="city-map-dot owned"></i> Himayendeki şehir</span><span class="city-map-help">Sürükle: haritayı kaydır &nbsp; · &nbsp; Tekerlek: yakınlaştır &nbsp; · &nbsp; M / ESC: kapat</span><button type="button" data-manage>Şehir yönetimi · N</button><button type="button" data-center>Konumuma dön</button></footer></section>`;
  document.body.appendChild(this.overlay);this.canvas=this.overlay.querySelector('canvas')!;this.ctx=this.canvas.getContext('2d')!;
  this.overlay.querySelector('.city-map-close')!.addEventListener('click',()=>this.close());
  this.overlay.querySelector('[data-manage]')!.addEventListener('click',()=>{this.close();this.world.onManage?.();});
  this.overlay.querySelector('[data-center]')!.addEventListener('click',()=>{this.center={...this.player};this.draw();});
  this.overlay.addEventListener('pointerdown',e=>e.stopPropagation());this.overlay.addEventListener('pointerup',e=>e.stopPropagation());this.overlay.addEventListener('click',e=>e.stopPropagation());this.overlay.addEventListener('contextmenu',e=>e.preventDefault());
  this.canvas.addEventListener('pointerdown',e=>{this.drag={x:e.clientX,y:e.clientY,cx:this.center.x,cz:this.center.z};this.canvas.setPointerCapture(e.pointerId);});
  this.canvas.addEventListener('pointermove',e=>{if(!this.drag)return;this.center.x=this.drag.cx-(e.clientX-this.drag.x)/this.scale;this.center.z=this.drag.cz-(e.clientY-this.drag.y)/this.scale;this.draw();});
  this.canvas.addEventListener('pointerup',()=>{this.drag=null;});this.canvas.addEventListener('pointercancel',()=>{this.drag=null;});
  this.overlay.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();this.scale=Math.max(.15,Math.min(2,this.scale*Math.exp(-e.deltaY*.001)));this.draw();},{passive:false});
  window.addEventListener('resize',()=>{if(this.isOpen)this.draw();});
 }
 snapshot(){return [...this.explored];}
 restore(value:unknown){if(!Array.isArray(value))return;for(const item of value.slice(0,5000)){if(typeof item!=='string'||!/^[-]?\d+,[-]?\d+$/.test(item))continue;const [x,z]=item.split(',').map(Number),ix=Math.round((x+.5)*CELL/CITY),iz=Math.round((z+.5)*CELL/CITY);if(districtIndex(ix,iz)<0)continue;this.explored.add(item);this.discovered.add(`${ix},${iz}`);}this.dirty=true;}
 get isOpen(){return !this.overlay.hidden;}
 toggle(){if(this.isOpen)this.close();else this.open();}
 open(){this.overlay.hidden=false;this.center={...this.player};this.draw();this.overlay.querySelector<HTMLButtonElement>('.city-map-close')!.focus();}
 close(){this.overlay.hidden=true;this.drag=null;}
 updatePlayer(x:number,z:number){if(this.player.x!==x||this.player.z!==z)this.dirty=true;this.player={x,z};this.reveal(x,z);if(this.isOpen&&this.dirty)this.draw();}
 reveal(x:number,z:number,radius=64){
  const cx=Math.floor(x/CELL),cz=Math.floor(z/CELL),r=Math.ceil(radius/CELL);
  for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
   const xx=cx+dx,zz=cz+dz,wx=(xx+.5)*CELL,wz=(zz+.5)*CELL;
   if(Math.hypot(wx-x,wz-z)>radius+CELL*.5)continue;
   const ix=Math.round(wx/CITY),iz=Math.round(wz/CITY);if(districtIndex(ix,iz)<0)continue;
   const key=`${xx},${zz}`;if(!this.explored.has(key)){this.explored.add(key);this.dirty=true;}this.discovered.add(`${ix},${iz}`);
  }
 }
 private draw(){
  if(!this.isOpen)return;this.dirty=false;
  const rect=this.canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2),w=rect.width,h=rect.height;
  if(!w||!h)return;this.canvas.width=Math.round(w*ratio);this.canvas.height=Math.round(h*ratio);const c=this.ctx;c.setTransform(ratio,0,0,ratio,0,0);
  c.fillStyle='#142324';c.fillRect(0,0,w,h);
  const project=(x:number,z:number)=>({x:w/2+(x-this.center.x)*this.scale,y:h/2+(z-this.center.z)*this.scale});
  const cellPixels=CELL*this.scale;
  for(const key of this.explored){const [cx,cz]=key.split(',').map(Number),p=project(cx*CELL,cz*CELL);if(p.x+cellPixels<0||p.y+cellPixels<0||p.x>w||p.y>h)continue;
   const tileX=Math.round((cx+.5)*CELL/4),tileZ=Math.round((cz+.5)*CELL/4);
   const owner=this.world.owner?.(Math.round((cx+.5)*CELL/CITY),Math.round((cz+.5)*CELL/CITY));c.fillStyle=owner?(owner.mine?'#86794e':'#805e66'):this.world.isWater(tileX,tileZ)?'#508c96':this.world.isRoad(tileX,tileZ)?'#c8cfb9':this.world.isUrban(tileX,tileZ)?'#879982':'#627f70';c.fillRect(p.x,p.y,Math.ceil(cellPixels)+.5,Math.ceil(cellPixels)+.5);
  }
  c.textAlign='center';c.textBaseline='middle';c.font='bold 11px Arial';
  for(const key of this.discovered){const [ix,iz]=key.split(',').map(Number),p=project(ix*CITY,iz*CITY);if(p.x < -90||p.x>w+90||p.y<0||p.y>h)continue;
   const owned=this.world.isOwned?.(ix,iz)??false;c.beginPath();c.arc(p.x,p.y,owned?5:3,0,Math.PI*2);c.fillStyle=owned?'#f3c477':'#e2e7cd';c.fill();
   const name=districtName(ix,iz);if(name){c.lineWidth=3;c.strokeStyle='#172b2b';c.strokeText(name,p.x,p.y+15);c.fillStyle='#f0f3df';c.fillText(name,p.x,p.y+15);const owner=this.world.owner?.(ix,iz);if(owner){c.font='10px Arial';c.strokeText(owner.name,p.x,p.y+28);c.fillText(owner.name,p.x,p.y+28);c.font='bold 11px Arial';}}
  }
  const pos=project(this.player.x,this.player.z);if(pos.x>=0&&pos.x<=w&&pos.y>=0&&pos.y<=h){c.beginPath();c.arc(pos.x,pos.y,6,0,Math.PI*2);c.fillStyle='#f8f9e5';c.fill();c.lineWidth=2;c.strokeStyle='#1d625c';c.stroke();}
 }
}
