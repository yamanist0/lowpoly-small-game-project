import { CREW_ROLES, CityEmpire } from './cityEmpire';
import { districtName } from './districts';
import './cityManagement.css';

type Hooks={location:()=>{ix:number;iz:number;urban:boolean}; money:()=>number; spend:(amount:number)=>boolean; onClose:()=>void; owner:(ix:number,iz:number)=>string|null; claim:(ix:number,iz:number)=>Promise<void>};
export class CityManagement {
 private overlay=document.createElement('div');
 constructor(private empire:CityEmpire,private hooks:Hooks){
  this.overlay.className='empire-overlay';this.overlay.hidden=true;document.body.appendChild(this.overlay);
  this.overlay.addEventListener('click',e=>{if(e.target===this.overlay)this.close();});
 }
 get isOpen(){return !this.overlay.hidden;}
 open(){this.overlay.hidden=false;this.render();}
 close(){this.overlay.hidden=true;this.hooks.onClose();}
 private render(){
  const {ix,iz,urban}=this.hooks.location(),name=urban?districtName(ix,iz):null,owned=urban&&this.empire.owns(ix,iz);
  this.overlay.innerHTML=`<section class="empire-panel" role="dialog" aria-modal="true" aria-labelledby="empire-title"><header><div><small>ŞEHİR YÖNETİMİ</small><h2 id="empire-title"></h2><p data-subtitle></p></div><button class="empire-close" aria-label="Kapat">×</button></header><div class="empire-content"></div><footer><span data-balance></span><span>ESC / N · KAPAT</span></footer></section>`;
  this.overlay.querySelector<HTMLElement>('#empire-title')!.textContent=name??'Şehir dışındasın';
  this.overlay.querySelector<HTMLElement>('[data-subtitle]')!.textContent=!urban?'Bir şehre girerek yönetimi aç.':owned?'Bu şehir senin himayende. Ekibini büyüt.':'Bu şehri himayene al ve yerel ekibini kur.';
  this.overlay.querySelector<HTMLElement>('[data-balance]')!.textContent=`KASA  $${this.hooks.money().toLocaleString('en-US')}`;
  this.overlay.querySelector<HTMLButtonElement>('.empire-close')!.onclick=()=>this.close();
  const content=this.overlay.querySelector<HTMLElement>('.empire-content')!;
  if(!urban)return;
  if(!owned){const owner=this.hooks.owner(ix,iz);if(owner){content.textContent=`Bu şehir ${owner} tarafından yönetiliyor.`;return;}const b=document.createElement('button');b.className='empire-claim';b.textContent='ŞEHRİ HİMAYEYE AL  ·  $20,000';b.disabled=this.hooks.money()<20000;b.onclick=async()=>{b.disabled=true;try{await this.hooks.claim(ix,iz);}catch(error){const msg=document.createElement('p');msg.textContent=error instanceof Error?error.message:'Şehir alınamadı.';content.append(msg);b.disabled=false;return;}this.render();};content.append(b);return;}
  const intro=document.createElement('p');intro.className='empire-intro';intro.textContent=`EKİP · ${this.empire.count(ix,iz)} ELEMAN  /  Her yeni eleman bu şehirde sonraki alımların fiyatını artırır.`;content.append(intro);
  for(const role of CREW_ROLES){const price=this.empire.price(ix,iz,role.id),row=document.createElement('div');row.className='empire-row';const text=document.createElement('div'),title=document.createElement('strong'),desc=document.createElement('p');title.textContent=`${role.name}  ·  ${this.empire.count(ix,iz,role.id)}`;desc.textContent=role.description+(role.income?` · $${role.income}/dk`:'');text.append(title,desc);const b=document.createElement('button');b.textContent=`İŞE AL  $${price.toLocaleString('en-US')}`;b.disabled=this.hooks.money()<price;b.onclick=()=>{this.empire.hire(ix,iz,role.id,this.hooks.spend);this.render();};row.append(text,b);content.append(row);}
 }
}
