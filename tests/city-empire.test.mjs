import assert from 'node:assert/strict';
import { createServer } from 'vite';
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}});
try {
 const {CityEmpire}=await vite.ssrLoadModule('/src/cityEmpire.ts');
 const e=new CityEmpire();let money=25000;
 const spend=n=>{if(money<n)return false;money-=n;return true;};
 assert.equal(e.claim(0,0,spend),true);assert.equal(money,5000);
 assert.equal(e.claim(0,0,spend),false);assert.equal(money,5000);
 assert.equal(e.claim(1e7,1e7,spend),false);assert.equal(money,5000);
 assert.equal(e.price(0,0,'mugger'),1000);assert.equal(e.hire(0,0,'mugger',spend),true);
 assert.equal(e.price(0,0,'mugger'),2000);assert.equal(e.hire(0,0,'mugger',spend),true);
 assert.equal(e.count(0,0,'mugger'),2);assert.equal(e.price(1,0,'mugger'),1000);
 assert.equal(e.hire(0,0,'house',spend),false);assert.equal(e.count(0,0),2);
 assert.equal(e.update(60).income,60);assert.equal(e.update(30).income,30);
 money=10000;assert.equal(e.hire(0,0,'scout',spend),true);
 const first=e.update(1).scouts[0],second=e.update(10).scouts[0];
 assert.notDeepEqual(first,second);assert.ok(Math.hypot(second.x,second.z)>Math.hypot(first.x,first.z));
 console.log('City takeover, pricing, income and scouting passed');
} finally {await vite.close();}

