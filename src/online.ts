export type OnlinePlayer={id:string;name:string;x:number;z:number;heading:number};
export type OnlineCity={ix:number;iz:number;ownerId:string;ownerName:string};
export type OnlineSession={token:string;player:{id:string;name:string;money:number;inventory:Record<string,unknown>};cities:OnlineCity[];spawn:{ix:number;iz:number}};
type WorldMessage={type:string;id?:string;players?:OnlinePlayer[];cities?:OnlineCity[];player?:OnlinePlayer;city?:OnlineCity;message?:string};
const TOKEN_KEY='sonsuz-sehirler-token';
function readToken(){try{return localStorage.getItem(TOKEN_KEY)??undefined;}catch{return undefined;}}
function storeToken(token:string){try{localStorage.setItem(TOKEN_KEY,token);}catch{/* The session remains usable until the tab closes. */}}
async function post<T>(path:string,body:unknown):Promise<T>{
 let response:Response;try{response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}catch{throw new Error('Sunucuya ulaşılamadı. Bağlantını kontrol et ve tekrar dene.');}
 const data=await response.json().catch(()=>({})) as {error?:string};
 if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'Sunucu isteği tamamlayamadı. Tekrar dene.');
 return data as T;
}
export class OnlineClient {
 session:OnlineSession|null=null;
 players=new Map<string,OnlinePlayer>();
 cities=new Map<string,OnlineCity>();
 onPlayer:(player:OnlinePlayer)=>void=()=>{};
 onLeave:(id:string)=>void=()=>{};
 onCity:(city:OnlineCity)=>void=()=>{};
 onStatus:(status:'connected'|'reconnecting'|'disconnected')=>void=()=>{};
 private socket:WebSocket|null=null;
 private retryTimer=0;
 private stopped=false;
 private lastMove=0;
 private pendingMove:{x:number;z:number;heading:number}|null=null;
 async connect(name:string){
  const session=await post<OnlineSession>('/api/session',{name,token:readToken()});
  if(!session.token||!session.player||!session.spawn)throw new Error('Sunucudan geçersiz oturum yanıtı geldi.');
  this.session=session;storeToken(session.token);this.cities.clear();for(const city of session.cities??[])this.cities.set(`${city.ix},${city.iz}`,city);
  this.stopped=false;await this.openSocket();return session;
 }
 private openSocket():Promise<void>{
  const token=this.session?.token;if(!token)return Promise.reject(new Error('Oturum bulunamadı.'));
  return new Promise((resolve,reject)=>{
   let settled=false,authenticated=false;const url=new URL('/api/world',location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';const socket=new WebSocket(url);this.socket=socket;
   const timer=window.setTimeout(()=>{if(!settled){settled=true;socket.close();reject(new Error('Dünya sunucusu yanıt vermedi. Tekrar dene.'));}},12000);
   socket.addEventListener('open',()=>socket.send(JSON.stringify({type:'auth',token})));
   socket.addEventListener('message',event=>{
    let message:WorldMessage;try{message=JSON.parse(String(event.data)) as WorldMessage;}catch{return;}
    if(message.type==='hello'){
     authenticated=true;
     const present=new Set<string>();for(const player of message.players??[]){if(player.id===this.session?.player.id)continue;present.add(player.id);this.players.set(player.id,player);this.onPlayer(player);}
     for(const id of this.players.keys())if(!present.has(id)){this.players.delete(id);this.onLeave(id);}
     for(const city of message.cities??[]){this.cities.set(`${city.ix},${city.iz}`,city);this.onCity(city);}
     if(!settled){settled=true;clearTimeout(timer);resolve();}this.onStatus('connected');
     if(this.pendingMove){const move=this.pendingMove;this.pendingMove=null;this.lastMove=0;this.sendMove(move.x,move.z,move.heading);}
    }else if(message.type==='player'&&message.player&&message.player.id!==this.session?.player.id){this.players.set(message.player.id,message.player);this.onPlayer(message.player);}
    else if(message.type==='leave'&&message.id){this.players.delete(message.id);this.onLeave(message.id);}
    else if(message.type==='city'&&message.city){this.cities.set(`${message.city.ix},${message.city.iz}`,message.city);this.onCity(message.city);}
    else if(message.type==='error'&&!settled){settled=true;clearTimeout(timer);reject(new Error(message.message??'Dünya sunucusuna bağlanılamadı.'));socket.close();}
   });
   socket.addEventListener('close',()=>{clearTimeout(timer);if(!authenticated){if(!settled){settled=true;reject(new Error('Dünya sunucusuna bağlanılamadı. Tekrar dene.'));}return;}if(this.socket!==socket||this.stopped)return;this.onStatus('reconnecting');this.retryTimer=window.setTimeout(()=>{void this.openSocket().catch(()=>{if(!this.stopped){this.onStatus('disconnected');this.retryTimer=window.setTimeout(()=>this.reconnect(),3000);}});},2000);});
   socket.addEventListener('error',()=>{/* close carries the connection failure */});
  });
 }
 private reconnect(){if(this.stopped)return;this.onStatus('reconnecting');void this.openSocket().catch(()=>{if(!this.stopped){this.onStatus('disconnected');this.retryTimer=window.setTimeout(()=>this.reconnect(),3000);}});}
 sendMove(x:number,z:number,heading:number){if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(heading))return;this.pendingMove={x,z,heading};if(!this.socket||this.socket.readyState!==WebSocket.OPEN||performance.now()-this.lastMove<120)return;this.lastMove=performance.now();this.socket.send(JSON.stringify({type:'move',x,z,heading}));this.pendingMove=null;}
 async claim(ix:number,iz:number){if(!this.session)throw new Error('Önce oyuna bağlan.');const result=await post<{city:OnlineCity;money:number}>('/api/claim',{token:this.session.token,ix,iz});this.cities.set(`${ix},${iz}`,result.city);this.onCity(result.city);return result;}
 async save(money:number,inventory:Record<string,unknown>){if(!this.session)throw new Error('Önce oyuna bağlan.');return post<{ok:boolean}>('/api/save',{token:this.session.token,money,inventory});}
 close(){this.stopped=true;clearTimeout(this.retryTimer);this.socket?.close();this.socket=null;}
}
