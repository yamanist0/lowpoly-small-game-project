import assert from 'node:assert/strict';
const base=process.env.GAME_TEST_URL??'http://127.0.0.1:8791';
async function post(path,data){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};}
const a=await post('/api/session',{name:'Smoke A'}),b=await post('/api/session',{name:'Smoke B'});assert.equal(a.status,200);assert.equal(b.status,200);
assert.equal((await post('/api/save',{token:a.body.token,money:25000,inventory:{test:true}})).status,200);
const target=a.body.spawn,claim=await post('/api/claim',{token:a.body.token,...target});assert.equal(claim.status,200);assert.equal(claim.body.money,5000);
const again=await post('/api/session',{token:a.body.token});assert.equal(again.body.player.money,5000);assert.notDeepEqual(again.body.spawn,target);
const ws=new WebSocket(base.replace(/^http/,'ws')+'/api/world');
const hello=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('websocket timeout')),5000);ws.onopen=()=>ws.send(JSON.stringify({type:'auth',token:b.body.token}));ws.onmessage=e=>{clearTimeout(timer);resolve(JSON.parse(e.data));};ws.onerror=reject;});assert.equal(hello.type,'hello');ws.close();
assert.equal((await fetch(base+'/')).status,200);
console.log('Workers runtime: session, D1, atomic claim, spawn, WebSocket auth and static assets passed.');
