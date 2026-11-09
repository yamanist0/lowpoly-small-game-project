export type Point = { x: number; z: number };
type Entry = { x: number; z: number; g: number; f: number; parent: Entry | null };

// A binary heap keeps the open set inexpensive even for routes across the view.
export function findPath(start: Point, goal: Point, costAt: (x: number, z: number) => number, step = 1): Point[] {
 const sx = Math.round(start.x / step), sz = Math.round(start.z / step);
 const gx = Math.round(goal.x / step), gz = Math.round(goal.z / step);
 const margin = 24, minX = Math.min(sx, gx) - margin, maxX = Math.max(sx, gx) + margin;
 const minZ = Math.min(sz, gz) - margin, maxZ = Math.max(sz, gz) + margin;
 const key = (x: number, z: number) => `${x},${z}`;
 const costs = new Map<string, number>();
 const cost = (x: number, z: number) => { const k = key(x,z); let c = costs.get(k); if (c === undefined) { c = costAt(x * step,z * step); costs.set(k,c); } return c; };
 const heap: Entry[] = [], best = new Map<string, number>();
 const push = (v: Entry) => { let i = heap.length; heap.push(v); while (i > 0) { const p = (i-1)>>1; if (heap[p].f <= v.f) break; heap[i] = heap[p]; i = p; } heap[i] = v; };
 const pop = () => { const first = heap[0], last = heap.pop()!; if (heap.length) { let i = 0; while (true) { let c = i*2+1; if (c >= heap.length) break; if (c+1 < heap.length && heap[c+1].f < heap[c].f) c++; if (heap[c].f >= last.f) break; heap[i] = heap[c]; i = c; } heap[i] = last; } return first; };
 const heuristic = (x:number,z:number) => Math.hypot(gx-x,gz-z);
 push({x:sx,z:sz,g:0,f:heuristic(sx,sz),parent:null}); best.set(key(sx,sz),0);
 const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
 let visited = 0;
 while (heap.length && visited++ < 30000) {
  const node = pop(); if (node.g > (best.get(key(node.x,node.z)) ?? Infinity)) continue;
  if (node.x === gx && node.z === gz) { const path: Point[] = []; let n: Entry | null = node; while (n?.parent) { path.push({x:n.x*step,z:n.z*step}); n=n.parent; } return path.reverse(); }
  for (const [dx,dz] of dirs) {
   const x=node.x+dx,z=node.z+dz; if(x<minX||x>maxX||z<minZ||z>maxZ) continue;
   const c=cost(x,z); if(!Number.isFinite(c)) continue;
   if(dx && dz && (!Number.isFinite(cost(node.x+dx,node.z)) || !Number.isFinite(cost(node.x,node.z+dz)))) continue;
   const g=node.g+(dx&&dz?Math.SQRT2:1)*(c+cost(node.x,node.z))/2, k=key(x,z);
   if(g >= (best.get(k) ?? Infinity)) continue;
   best.set(k,g); push({x,z,g,f:g+heuristic(x,z),parent:node});
  }
 }
 return [];
}
