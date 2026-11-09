import assert from 'node:assert/strict';
import { createServer } from 'vite';
const originalFetch=globalThis.fetch;
const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))};globalThis.window=globalThis;globalThis.location={href:'http://localhost:5173/'};
let requests=[];globalThis.fetch=async (path,init)=>{requests.push({path,body:JSON.parse(init.body)});if(path==='/api/session')return new Response(JSON.stringify({token:'test-token',player:{id:'me',name:'Ada',money:500,inventory:{}},cities:[],spawn:{ix:0,iz:0}}),{status:200});if(path==='/api/claim')return new Response(JSON.stringify({city:{ix:0,iz:0,ownerId:'me',ownerName:'Ada'},money:0}),{status:200});return new Response(JSON.stringify({ok:true}),{status:200});};
class Socket extends EventTarget {
 static OPEN=1;static latest;readyState=0;sent=[];
 constructor(url){super();this.url=url;Socket.latest=this;queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}
 send(data){const message=JSON.parse(data);this.sent.push(message);if(message.type==='auth')queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'hello',id:'me',players:[{id:'friend',name:'Ece',x:1,z:2,heading:0}],cities:[]})})));}
 close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
}
globalThis.WebSocket=Socket;
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}});
try{
 const {OnlineClient}=await vite.ssrLoadModule('/src/online.ts');const client=new OnlineClient(),seen=[];client.onPlayer=p=>seen.push(p.id);const session=await client.connect('Ada');assert.equal(session.player.money,500);assert.equal(Socket.latest.sent[0].type,'auth');assert.equal(Socket.latest.sent[0].token,'test-token');assert.deepEqual(seen,['friend']);assert.equal(values.get('sonsuz-sehirler-token'),'test-token');
 client.sendMove(12,13,1);assert.ok(Socket.latest.sent.some(m=>m.type==='move'&&m.x===12));const claim=await client.claim(0,0);assert.equal(claim.money,0);assert.equal(client.cities.get('0,0').ownerName,'Ada');await client.save(10,{weapons:['MG1']});assert.deepEqual(requests.at(-1).body.inventory.weapons,['MG1']);client.close();console.log('Online session, world events, movement, claim and save passed');
}finally{globalThis.fetch=originalFetch;await vite.close();}
