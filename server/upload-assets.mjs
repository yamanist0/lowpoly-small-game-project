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
for(const [i,file] of files.entries()){
 console.log(`[${i+1}/${files.length}] ${file.name}`);
 const args=[join(process.cwd(),'node_modules','wrangler','bin','wrangler.js'),'r2','object','put',`${bucket}/assets/${file.name}`,mode,'--file',join(directory,file.name),'--content-type',mime[extname(file.name).toLowerCase()]??'application/octet-stream','--cache-control','public, max-age=31536000, immutable'];
 const status=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit'});child.on('error',reject);child.on('close',resolve);});
 if(status!==0){console.error('Upload stopped. Re-run to retry; no remote objects were deleted.');process.exit(1);}
}
