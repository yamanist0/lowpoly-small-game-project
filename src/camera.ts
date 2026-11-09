import * as THREE from 'three';

type FadedMesh={mesh:THREE.Mesh;original:THREE.Material|THREE.Material[];copies:THREE.Material[]};
export type BuildingOccluder={root:THREE.Object3D;box:THREE.Box3;opacity:number;faded:FadedMesh[]};
export function buildingOccluder(root:THREE.Object3D,box:THREE.Box3):BuildingOccluder {
 return {root,box:box.clone(),opacity:1,faded:[]};
}
export function releaseOccluder(building:BuildingOccluder){
 for(const item of building.faded){item.mesh.material=item.original;for(const m of item.copies)m.dispose();}
 building.faded=[];building.opacity=1;
}
function setOpacity(building:BuildingOccluder,value:number){
 if(value>=.999){if(building.faded.length)releaseOccluder(building);return;}
 if(!building.faded.length)building.root.traverse(o=>{
  if(!(o instanceof THREE.Mesh))return;
  const original=o.material,source=Array.isArray(original)?original:[original];
  const copies=source.map(m=>{const copy=m.clone();copy.transparent=true;copy.depthWrite=false;return copy;});
  o.material=Array.isArray(original)?copies:copies[0];building.faded.push({mesh:o,original,copies});
 });
 for(const item of building.faded){
  const originals=Array.isArray(item.original)?item.original:[item.original];
  item.copies.forEach((m,i)=>{m.opacity=originals[i].opacity*value;});
 }
 building.opacity=value;
}
// The camera is orthographic: all sight lines have the same direction.
// Test the whole character rather than only the point at their feet.
export function updateBuildingOcclusion(camera:THREE.Camera,player:THREE.Vector3,buildings:Iterable<BuildingOccluder>,dt:number){
 const toCamera=new THREE.Vector3().subVectors(camera.position,player),distance=toCamera.length(),direction=toCamera.normalize();
 const side=new THREE.Vector3(direction.z,0,-direction.x).normalize();
 const rays=[new THREE.Ray(),new THREE.Ray(),new THREE.Ray()];
 rays[0].set(player.clone().add(new THREE.Vector3(0,.35,0)),direction);
 rays[1].set(player.clone().add(new THREE.Vector3(0,1.05,0)).addScaledVector(side,.28),direction);
 rays[2].set(player.clone().add(new THREE.Vector3(0,1.5,0)).addScaledVector(side,-.28),direction);
 const hit=new THREE.Vector3();
 for(const building of buildings){
  let blocked=false;
  for(const ray of rays){if(ray.intersectBox(building.box,hit)&&hit.distanceToSquared(ray.origin)<distance*distance){blocked=true;break;}}
  const target=blocked?.3:1,step=Math.max(0,dt)*3.5;
  const opacity=building.opacity<target?Math.min(target,building.opacity+step):Math.max(target,building.opacity-step);
  setOpacity(building,opacity);
 }
}
