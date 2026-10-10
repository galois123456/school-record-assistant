import './build.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=new URL('../dist/',import.meta.url);
createServer(async(req,res)=>{
 const path=req.url.split('?')[0];
 const routes={'/':'index.html','/index.html':'index.html','/assets/main.js':'assets/main.js','/assets/style.css':'assets/style.css'};
 if(!routes[path]){res.writeHead(404);res.end();return;}
 try { const body=await readFile(fileURLToPath(new URL(routes[path],root)));res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(body); }
 catch {res.writeHead(500);res.end('Build first');}
}).listen(5173,'127.0.0.1',()=>console.log('http://localhost:5173 (소스 수정 후 재시작)'));
