import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
// configFile:false and envDir:false prevent loading production configuration/secrets.
const server=await createServer({configFile:false,envDir:false,plugins:[react(),{
  name:'isolated-stage3-fixture',configureServer(server){server.middlewares.use(async (request,response,next)=>{
    const pathname=new URL(request.url,'http://localhost').pathname;
    if(pathname==='/'||pathname==='/onboarding'||pathname.startsWith('/invite/')){
      response.setHeader('Content-Type','text/html');response.setHeader('Cache-Control','no-store');response.setHeader('Referrer-Policy','no-referrer');
      response.end(await server.transformIndexHtml(pathname,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><script src="/invitation-bootstrap.js"></script></head><body><div id="root"></div><script type="module" src="/scripts/stage3-browser-fixture.jsx"></script></body></html>'));return;
    }next();
  });}
}],server:{host:'127.0.0.1',port:5179,strictPort:true}});
await server.listen();server.printUrls();
