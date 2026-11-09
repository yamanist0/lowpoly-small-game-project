// Samples the same reprojected atlas alpha used by the visible shoreline.
export function shoreWater(mask:number,field:Uint8Array,u:number,v:number):boolean {
 if(mask===0)return false;if(mask===15)return true;
 const x=Math.max(0,Math.min(127,Math.round(u*127)));
 const y=Math.max(0,Math.min(127,Math.round(v*127)));
 return field[y*128+x]>=128;
}

// One static trimesh per chunk represents the grass portion of its shore.
export function appendShoreLand(mask:number,field:Uint8Array,x:number,z:number,size:number,y:number,out:number[],resolution=16){
 if(mask===15)return;
 for(let i=0;i<resolution;i++)for(let j=0;j<resolution;j++){
  const u=i/resolution,v=j/resolution,h=1/resolution;
  for(const tri of [[[u,v],[u+h,v+h],[u+h,v]],[[u,v],[u,v+h],[u+h,v+h]]]){
   const cu=(tri[0][0]+tri[1][0]+tri[2][0])/3,cv=(tri[0][1]+tri[1][1]+tri[2][1])/3;
   if(!shoreWater(mask,field,cu,cv))for(const [tu,tv] of tri)out.push(x+tu*size,y,z+tv*size);
  }
 }
}
