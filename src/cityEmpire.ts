import { districtIndex } from './districts';

/** Prices increase with every member hired in the same city, regardless of role. */
export const CREW_ROLES = [
 {id:'mugger', name:'Kapkaççı', description:'Yoldan geçenleri soyar; düşük ama düzenli gelir.', basePrice:1000, income:30},
 {id:'atm', name:'ATM soyguncusu', description:'ATM soygunlarından düzenli gelir sağlar.', basePrice:5000, income:100},
 {id:'shop', name:'Dükkan soyguncusu', description:'Dükkanları soyarak gelir sağlar.', basePrice:9000, income:200},
 {id:'house', name:'Ev soyguncusu', description:'Ev soygunlarıyla yüksek gelir sağlar.', basePrice:14000, income:350},
 {id:'guard', name:'Koruma', description:'Şehirdeki polis çatışmalarında sana yardım eder.', basePrice:5000, income:0},
 {id:'scout', name:'Kaşif', description:'Şehir dışına çıkarak haritayı zamanla açar.', basePrice:4000, income:0},
] as const;
export type CrewRole = typeof CREW_ROLES[number]['id'];
type Scout={x:number;z:number;angle:number;heading:number};
type City={ix:number;iz:number;counts:Record<CrewRole,number>;scouts:Scout[];incomeRemainder:number};
const CITY_SIZE=224;
const emptyCounts=():Record<CrewRole,number>=>({mugger:0,atm:0,shop:0,house:0,guard:0,scout:0});
const key=(ix:number,iz:number)=>`${ix},${iz}`;

/** Session-scoped empire: the rest of the game (including money) is session-scoped too. */
export class CityEmpire {
 private readonly cities=new Map<string,City>();
 owns(ix:number,iz:number){return this.cities.has(key(ix,iz));}
 restore(data:unknown,owned:(ix:number,iz:number)=>boolean){
  if(!Array.isArray(data))return;
  for(const item of data){if(!item||!Number.isInteger(item.ix)||!Number.isInteger(item.iz)||!owned(item.ix,item.iz))continue;this.claim(item.ix,item.iz,()=>true);for(const role of CREW_ROLES){const n=Math.min(100,Math.max(0,Math.floor(Number(item.counts?.[role.id])||0)));for(let i=0;i<n;i++)this.hire(item.ix,item.iz,role.id,()=>true);}}
 }
 snapshot(){return [...this.cities.values()].map(({ix,iz,counts})=>({ix,iz,counts:{...counts}}));}

 claim(ix:number,iz:number,spend:(amount:number)=>boolean){
  if(!Number.isInteger(ix)||!Number.isInteger(iz)||districtIndex(ix,iz)<0||this.owns(ix,iz))return false;
  if(!spend(20000))return false;
  this.cities.set(key(ix,iz),{ix,iz,counts:emptyCounts(),scouts:[],incomeRemainder:0});return true;
 }
 count(ix:number,iz:number,role?:CrewRole){const city=this.cities.get(key(ix,iz));if(!city)return 0;return role?city.counts[role]:CREW_ROLES.reduce((sum,item)=>sum+city.counts[item.id],0);}
 price(ix:number,iz:number,role:CrewRole){const item=CREW_ROLES.find(r=>r.id===role);return item?item.basePrice+this.count(ix,iz)*1000:Infinity;}
 hire(ix:number,iz:number,role:CrewRole,spend:(amount:number)=>boolean){
  const city=this.cities.get(key(ix,iz)),item=CREW_ROLES.find(r=>r.id===role);if(!city||!item)return false;
  if(!spend(this.price(ix,iz,role)))return false;
  city.counts[role]++;
  if(role==='scout')city.scouts.push({x:ix*CITY_SIZE,z:iz*CITY_SIZE,angle:0,heading:(city.counts.scout-1)*2.399963});
  return true;
 }
 /** Income is dollars/minute. Scout coordinates are world units, suitable for map.reveal. */
 update(dt:number){
  if(!Number.isFinite(dt)||dt<=0)return {income:0,scouts:[] as {x:number;z:number}[]};
  let income=0;const scouts:{x:number;z:number}[]=[];
  for(const city of this.cities.values()){
   city.incomeRemainder+=CREW_ROLES.reduce((sum,role)=>sum+city.counts[role.id]*role.income,0)*dt/60;
   const dollars=Math.floor(city.incomeRemainder);city.incomeRemainder-=dollars;income+=dollars;
   for(const scout of city.scouts){
    // An expanding spiral explores neighboring districts over time.
    const radius=scout.angle*65;scout.angle+=6*dt/Math.sqrt(radius*radius+65*65);
    const r=scout.angle*65,theta=scout.angle+scout.heading;
    const x=city.ix*CITY_SIZE+Math.cos(theta)*r,z=city.iz*CITY_SIZE+Math.sin(theta)*r;
    if(districtIndex(Math.round(x/CITY_SIZE),Math.round(z/CITY_SIZE))<0){scout.angle=0;scout.heading+=Math.PI*.73;scout.x=city.ix*CITY_SIZE;scout.z=city.iz*CITY_SIZE;}else{scout.x=x;scout.z=z;}
    scouts.push({x:scout.x,z:scout.z});
   }
  }
  return {income,scouts};
 }
}

