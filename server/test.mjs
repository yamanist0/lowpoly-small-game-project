import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('./migrations/0001_initial.sql',import.meta.url),'utf8'));
class D1 {
 prepare(sql){let args=[];const statement={bind(...params){args=params;return statement;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};return statement;}
 async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}
}
const source=(await readFile(new URL('./index.js',import.meta.url),'utf8')).replace("import { DurableObject } from 'cloudflare:workers';",'class DurableObject { constructor(ctx,env){this.ctx=ctx;this.env=env;} }').replace("import { districtIndex, districtColumns, districtRows } from '../src/districts.ts';",'const districtColumns=11,districtRows=11; const districtIndex=(x,z)=>Math.abs(x)<=5&&Math.abs(z)<=5?1:-1;');
const {World}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const world=new World({getWebSockets:()=>[]},{DB:new D1()});
const call=async(path,body)=>{const r=await world.fetch(new Request('https://example.com'+path,{method:'POST',body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};};
const blocked=[];for(let ix=-5;ix<=5;ix++)for(let iz=-5;iz<=5;iz++)if(!(ix===3&&iz===3)&&!(ix===4&&iz===0))blocked.push({ix,iz});assert.deepEqual(world.spawn(blocked),{ix:4,iz:0});
const a=await call('/api/session',{name:'Alpha'});assert.equal(a.status,200);assert.equal(a.data.player.money,500);assert.deepEqual(a.data.spawn,{ix:0,iz:0});
assert.equal((await call('/api/claim',{token:a.data.token,ix:0,iz:0})).status,409);
assert.equal((await call('/api/save',{token:a.data.token,money:22000,inventory:{weapons:['RPG']}})).status,200);
const claim=await call('/api/claim',{token:a.data.token,ix:0,iz:0});assert.equal(claim.data.money,2000);assert.equal(claim.data.city.ownerName,'Alpha');
const b=await call('/api/session',{name:'Bravo'});assert.equal(b.status,200);assert.equal(Math.hypot(b.data.spawn.ix,b.data.spawn.iz),1);
assert.equal((await call('/api/save',{token:b.data.token,money:30000,inventory:{}})).status,200);
assert.equal((await call('/api/claim',{token:b.data.token,ix:0,iz:0})).status,409);
const restored=await call('/api/session',{token:a.data.token});assert.equal(restored.data.player.money,2000);assert.deepEqual(restored.data.player.inventory,{weapons:['RPG']});
assert.equal((await call('/api/save',{token:a.data.token,money:-1,inventory:{}})).status,400);
const sockets=[];function socket(){let attachment;return {sent:[],serializeAttachment(value){attachment=value;},deserializeAttachment(){return attachment;},send(value){this.sent.push(JSON.parse(value));},close(){}};}
const live=new World({getWebSockets:()=>sockets},{DB:new D1()}),one=socket(),two=socket();sockets.push(one,two);
await live.webSocketMessage(one,JSON.stringify({type:'auth',token:a.data.token}));
await live.webSocketMessage(two,JSON.stringify({type:'auth',token:b.data.token}));
assert.equal(one.sent[0].type,'hello');assert.equal(two.sent[0].players[0].id,a.data.player.id);
await live.webSocketMessage(one,JSON.stringify({type:'move',x:12,z:16,heading:1}));assert.equal(two.sent.at(-1).type,'player');assert.equal(two.sent.at(-1).player.x,12);
await live.webSocketMessage(one,JSON.stringify({type:'move',x:50,z:16,heading:1}));assert.equal(two.sent.at(-1).player.x,12);
live.webSocketClose(one);assert.equal(two.sent.at(-1).type,'leave');
console.log('Session, persistence, city ownership, spawn, validation and socket messaging passed.');
