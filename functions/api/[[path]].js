export async function onRequest({request}) {
 const incoming=new URL(request.url);
 const target=new URL(incoming.pathname+incoming.search,'https://neon-coast-online.neon-coast.workers.dev');
 const headers=new Headers(request.headers);
 if(headers.has('Origin'))headers.set('Origin',target.origin);
 return fetch(new Request(target,request),{headers});
}
