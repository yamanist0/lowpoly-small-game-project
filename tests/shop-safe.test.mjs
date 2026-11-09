import {createServer} from 'vite';
import * as THREE from 'three';
const context={fillRect(){},strokeRect(){},fillText(){}};
globalThis.document={createElement(){return {width:0,height:0,getContext(){return context;},addEventListener(){},removeEventListener(){}};}};
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},ssr:{noExternal:['@dimforge/rapier3d-compat']}});
try{
 const rapier=await vite.ssrLoadModule('/node_modules/@dimforge/rapier3d-compat/rapier.es.js');await rapier.init();
 const {ShopInterior}=await vite.ssrLoadModule('/src/shopInterior.ts');const {Abilities}=await vite.ssrLoadModule('/src/upgrades.ts');
 const model=()=>{const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());mesh.position.y=.5;group.add(mesh);return group;};
 const names=['shelf-bags','shelf-boxes','shelf-end','freezers-standing','display-bread','bookcaseOpen','cash-register','character-employee','shopping-basket','shopping-cart','display-fruit','pottedPlant'];
 const assets={models:new Map(names.map(name=>[name,model()])),floors:[new THREE.Texture()],walls:[new THREE.Texture()]},failures=[];
 for(let seed=0;seed<30;seed++){
  const state={openedAt:0},shop=new ShopInterior(assets,seed*17,seed*11,new Abilities(),undefined,null,new Map(),model(),state);
  shop.routeToSafe();
  const end=shop.route.at(-1)??shop.position;if(Math.hypot(end.x-shop.safePoint.x,end.z-shop.safePoint.z)>=1.9)failures.push(`${seed}: safe route inaccessible`);
  shop.player.setTranslation({x:end.x,y:1,z:end.z},true);if(shop.startSafe()===null||!shop.cashierHostile)failures.push(`${seed}: safe did not alert cashier`);
  const amount=shop.completeSafe();if(amount<700||amount>1300||shop.completeSafe()!==0)failures.push(`${seed}: safe payout`);
  const cashier=shop.takeCashierOutside();if(!cashier||!state.cashierOutside||shop.takeCashierOutside())failures.push(`${seed}: cashier did not leave exactly once`);
  if(cashier){cashier.onRemove(true);if(state.cashierOutside||!shop.deaths.has('cashier'))failures.push(`${seed}: outside cashier death was not saved`);}
  shop.dispose();
 }
 console.log(JSON.stringify({tested:30,failures},null,2));if(failures.length)process.exitCode=1;
}finally{await vite.close();}
