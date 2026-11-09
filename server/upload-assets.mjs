import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join } from 'node:path';

// Explicit mode and bucket prevent accidentally uploading to a remote account.
const [mode,bucket]=process.argv.slice(2);
if(!['--local','--remote'].includes(mode)||!bucket||!/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket)){
 console.error('Usage: node server/upload-assets.mjs --local|--remote <bucket-name>');process.exit(1);
}
const directory=join(process.cwd(),'dist','assets');
const entries=await readdir(directory,{withFileTypes:true});
const files=entries.filter(e=>e.isFile()&&/-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(e.name));
const mime={'.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.json':'application/json'};
if(!files.length){console.error('No hashed assets found; build the app first.');process.exit(1);}
let next=0,completed=0,failed=false;
async function worker(){while(!failed){const index=next++;if(index>=files.length)return;const file=files[index];
 const args=[join(process.cwd(),'node_modules','wrangler','bin','wrangler.js'),'r2','object','put',`${bucket}/assets/${file.name}`,mode,'--file',join(directory,file.name),'--content-type',mime[extname(file.name).toLowerCase()]??'application/octet-stream','--cache-control','public, max-age=31536000, immutable'];
 let result;for(let attempt=0;attempt<4;attempt++){result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('close',code=>resolve({code,error}));});if(result.code===0)break;await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}
 if(result.code!==0){failed=true;console.error(`Upload failed: ${file.name}\n${result.error}`);return;}completed++;if(completed%20===0||completed===files.length)console.log(`Uploaded ${completed}/${files.length}`);
}}
await Promise.all(Array.from({length:2},worker));if(failed){console.error('Upload stopped. Re-run to retry; no remote objects were deleted.');process.exitCode=1;}
