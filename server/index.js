import { DurableObject } from 'cloudflare:workers';
import { districtIndex, districtColumns, districtRows } from '../src/districts.ts';

const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=(message,status=400)=>json({error:message},status);
const tokenHash=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
const validToken=token=>typeof token==='string'&&/^[a-f0-9]{64}$/.test(token);
const validName=name=>typeof name==='string'&&name.trim().length>=2&&name.trim().length<=20&&!/[\x00-\x1f\x7f]/.test(name);
const validCity=(ix,iz)=>Number.isInteger(ix)&&Number.isInteger(iz)&&districtIndex(ix,iz)>=0;

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')){
   const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return fail('Invalid origin',403);
   return env.WORLD.get(env.WORLD.idFromName('main')).fetch(request);
  }
  if(url.pathname.startsWith('/media/')||url.pathname.startsWith('/assets/')){
   const isAsset=url.pathname.startsWith('/assets/');
   if(request.method!=='GET'&&request.method!=='HEAD')return fail('Method not allowed',405);
   let key;try{key=decodeURIComponent(isAsset?url.pathname.slice(1):url.pathname.slice(7));}catch{return fail('Invalid path');}
   if(!key||key.split('/').some(part=>part==='..'||part==='.')||key.startsWith('/'))return fail('Invalid path');
   const object=await env.MEDIA.get(key);if(!object)return isAsset?env.ASSETS.fetch(request):fail('Not found',404);
   const headers=new Headers();object.writeHttpMetadata(headers);headers.set('etag',object.httpEtag);
   if(!headers.has('cache-control'))headers.set('cache-control',isAsset&&/-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(key)?'public, max-age=31536000, immutable':'public, max-age=3600');
   return new Response(request.method==='HEAD'?null:object.body,{headers});
  }
  return env.ASSETS.fetch(request);
 }
};

export class World extends DurableObject {
 async player(token){
  if(!validToken(token))return null;
  return await this.env.DB.prepare('SELECT id,name,money,inventory FROM players WHERE token_hash=?').bind(await tokenHash(token)).first();
 }
 async cities(){
  const rows=await this.env.DB.prepare('SELECT c.ix,c.iz,c.owner_id AS ownerId,p.name AS ownerName FROM cities c JOIN players p ON p.id=c.owner_id').all();return rows.results;
 }
 spawn(cities){
  const owned=new Set(cities.map(c=>`${c.ix},${c.iz}`));
  let best=null,bestDistance=Infinity;
  for(let iz=-Math.floor(districtRows/2);iz<districtRows-Math.floor(districtRows/2);iz++)for(let ix=-Math.floor(districtColumns/2);ix<districtColumns-Math.floor(districtColumns/2);ix++){
   const distance=ix*ix+iz*iz;if(distance<bestDistance&&validCity(ix,iz)&&!owned.has(`${ix},${iz}`)){best={ix,iz};bestDistance=distance;}
  }
  if(best)return best;
  return null;
 }
 broadcast(message,except){const text=JSON.stringify(message);for(const ws of this.ctx.getWebSockets()){if(ws!==except&&ws.deserializeAttachment()?.id){try{ws.send(text);}catch{}}}}
 async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/api/world'){
   if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return fail('WebSocket required',426);
   const pair=new WebSocketPair();this.ctx.acceptWebSocket(pair[1]);return new Response(null,{status:101,webSocket:pair[0]});
  }
  if(request.method!=='POST')return fail('Method not allowed',405);
  if(Number(request.headers.get('content-length')||0)>70000)return fail('Request too large',413);
  let data;try{const body=await request.text();if(body.length>70000)return fail('Request too large',413);data=JSON.parse(body);}catch{return fail('Invalid JSON');}
  if(!data||typeof data!=='object'||Array.isArray(data))return fail('Invalid request');
  if(url.pathname==='/api/session'){
   let token=data.token,player;
   if(token){player=await this.player(token);if(!player)return fail('Invalid session',401);}
   else{
    if(!validName(data.name))return fail('Name must be 2–20 characters');
    token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
    const id=crypto.randomUUID(),name=data.name.trim();await this.env.DB.prepare('INSERT INTO players(id,name,token_hash,updated_at) VALUES(?,?,?,?)').bind(id,name,await tokenHash(token),Date.now()).run();
    player={id,name,money:500,inventory:'{}'};
   }
   const cities=await this.cities(),spawn=this.spawn(cities);if(!spawn)return fail('No unowned city is available',409);
   return json({token,player:{...player,inventory:JSON.parse(player.inventory)},cities,spawn});
  }
  const player=await this.player(data.token);if(!player)return fail('Invalid session',401);
  if(url.pathname==='/api/save'){
   if(!Number.isSafeInteger(data.money)||data.money<0||data.money>1000000000||!data.inventory||typeof data.inventory!=='object'||Array.isArray(data.inventory))return fail('Invalid save');
   const inventory=JSON.stringify(data.inventory);if(inventory.length>65536)return fail('Save too large',413);
   await this.env.DB.prepare('UPDATE players SET money=?,inventory=?,updated_at=? WHERE id=?').bind(data.money,inventory,Date.now(),player.id).run();return json({ok:true});
  }
  if(url.pathname==='/api/claim'){
   if(!validCity(data.ix,data.iz))return fail('Invalid city');
   const [insert]=await this.env.DB.batch([
    this.env.DB.prepare('INSERT INTO cities(ix,iz,owner_id) SELECT ?,?,id FROM players WHERE id=? AND money>=20000 AND NOT EXISTS (SELECT 1 FROM cities WHERE ix=? AND iz=?)').bind(data.ix,data.iz,player.id,data.ix,data.iz),
    this.env.DB.prepare('UPDATE players SET money=money-20000,updated_at=? WHERE id=? AND changes()=1').bind(Date.now(),player.id)
   ]);
   if(!insert.meta.changes)return fail('City already owned or insufficient funds',409);
   const city={ix:data.ix,iz:data.iz,ownerId:player.id,ownerName:player.name};this.broadcast({type:'city',city});
   const updated=await this.env.DB.prepare('SELECT money FROM players WHERE id=?').bind(player.id).first();return json({city,money:updated.money});
  }
  return fail('Not found',404);
 }
 async webSocketMessage(ws,message){
  if(typeof message!=='string'||message.length>4096){ws.close(1009,'Message too large');return;}
  let data;try{data=JSON.parse(message);}catch{return;}
  const current=ws.deserializeAttachment();
  if(!current?.id){
   if(data?.type!=='auth'){ws.close(1008,'Authentication required');return;}
   const p=await this.player(data.token);if(!p){ws.close(1008,'Invalid session');return;}
   const state={id:p.id,name:p.name,x:0,z:0,heading:0,lastMove:0};ws.serializeAttachment(state);
   const players=this.ctx.getWebSockets().map(s=>s.deserializeAttachment()).filter(a=>a?.id&&a.id!==p.id).map(({id,name,x,z,heading})=>({id,name,x,z,heading}));
   ws.send(JSON.stringify({type:'hello',id:p.id,players,cities:await this.cities()}));return;
  }
  if(data?.type!=='move'||![data.x,data.z,data.heading].every(Number.isFinite))return;
  const now=Date.now();if(now-current.lastMove<80)return;
  if(!validCity(Math.round(data.x/224),Math.round(data.z/224))||Math.abs(data.x)>districtColumns*224||Math.abs(data.z)>districtRows*224)return;
  const next={...current,x:data.x,z:data.z,heading:data.heading,lastMove:now};ws.serializeAttachment(next);
  this.broadcast({type:'player',player:{id:next.id,name:next.name,x:next.x,z:next.z,heading:next.heading}},ws);
 }
 webSocketClose(ws){const state=ws.deserializeAttachment();if(state?.id)this.broadcast({type:'leave',id:state.id},ws);}
 webSocketError(ws){ws.close(1011,'Connection error');}
}
