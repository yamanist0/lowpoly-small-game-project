export async function onRequest({request}) {
 const url=new URL(request.url);
 return fetch(new Request(new URL(url.pathname+url.search,'https://neon-coast-online.neon-coast.workers.dev'),request));
}
