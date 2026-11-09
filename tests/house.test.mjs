import {createServer} from 'vite';import * as THREE from 'three';
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},ssr:{noExternal:['@dimforge/rapier3d-compat']}});
try{
 const rapier=await vite.ssrLoadModule('/node_modules/@dimforge/rapier3d-compat/rapier.es.js');await rapier.init();
 const {HouseInterior,makeHouseState}=await vite.ssrLoadModule('/src/houseInterior.ts');const {Abilities}=await vite.ssrLoadModule('/src/upgrades.ts');
 const model=(x,y,z)=>{const g=new THREE.Group(),m=new THREE.Mesh(new THREE.BoxGeometry(x,y,z),new THREE.MeshBasicMaterial());m.position.y=y/2;g.add(m);return g;};
 const failures=[];let minDifficulty=[Infinity,Infinity,Infinity],maxDifficulty=[0,0,0],layouts=new Set();
 for(let seed=0;seed<100;seed++){
  try{const count=5+seed%6,assets={safe:model(2.4,2.4,2),furniture:[model(1,1,1),model(2,1,1)],floors:[new THREE.Texture()],walls:[new THREE.Texture()],paintings:Array.from({length:count},(_,i)=>({index:i,texture:new THREE.Texture()}))},state=makeHouseState(),house=new HouseInterior(assets,seed*17-60,seed*19+13,new Abilities(),state),cells=house.reachableCells();
   layouts.add(`${house.width},${house.depth},${house.notch.side},${house.obstacles.length}`);
   if(house.paintings.length!==count)failures.push(`${seed}: painting count`);
   if(!Number.isFinite(house.cost(house.position.x,house.position.z)))failures.push(`${seed}: spawn blocked`);
   for(const art of house.paintings)if(art.value<250||art.value>700||!cells.some(p=>Math.hypot(p.x-art.x,p.z-art.z)<1.9&&house.canReachItem(p,art)))failures.push(`${seed}: inaccessible painting`);
   if(!cells.some(p=>Math.hypot(p.x-house.safePoint.x,p.z-house.safePoint.z)<1.9&&house.canReachItem(p,house.safePoint)))failures.push(`${seed}: inaccessible safe`);
   minDifficulty[house.difficulty]=Math.min(minDifficulty[house.difficulty],house.safeValue);maxDifficulty[house.difficulty]=Math.max(maxDifficulty[house.difficulty],house.safeValue);
   if(house.completeSafe()!==house.safeValue||house.completeSafe()!==0||!state.safeOpened)failures.push(`${seed}: safe payout`);
   if(seed<10){const art=house.paintings[0],point=cells.find(p=>Math.hypot(p.x-art.x,p.z-art.z)<1.8&&house.canReachItem(p,art));house.player.setTranslation({x:point.x,y:1,z:point.z},true);const result=house.interact();if(!result||result.kind!=='painting'||result.amount<250||result.amount>700||state.stolen.size!==1)failures.push(`${seed}: painting theft`);}
   house.dispose();
   if(seed<10){const revisit=new HouseInterior(assets,seed*17-60,seed*19+13,new Abilities(),state);if(!revisit.state.safeOpened||revisit.safeMarker.visible||revisit.paintings.filter(a=>!a.root.visible).length!==1)failures.push(`${seed}: stolen items returned on reentry`);revisit.dispose();}
  }catch(error){failures.push(`${seed}: ${error.message}`);}
 }
 if(layouts.size<20)failures.push('insufficient layout variation');if(minDifficulty[0]<700||maxDifficulty[0]>899||minDifficulty[1]<900||maxDifficulty[1]>1099||minDifficulty[2]<1100||maxDifficulty[2]>1300)failures.push('safe difficulty reward ranges');
 console.log(JSON.stringify({tested:100,layouts:layouts.size,minDifficulty,maxDifficulty,failures},null,2));if(failures.length)process.exitCode=1;
}finally{await vite.close();}
