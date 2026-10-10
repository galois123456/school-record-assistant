import { transformEditor } from './editor-transform.mjs';
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
try { loadEnvFile(resolve(root,'.env')); } catch(e) { if(e.code!=='ENOENT') throw e; }
const url=process.env.PUBLIC_SUPABASE_URL||'', key=process.env.PUBLIC_SUPABASE_ANON_KEY||'';
if(!/^https:\/\/[a-zA-Z0-9.-]+\/?$/.test(url)||!key) throw Error('PUBLIC_SUPABASE_URL과 PUBLIC_SUPABASE_ANON_KEY를 설정하세요. .env.example / README.md 참고');
if(key.startsWith('sb_secret_')) throw Error('비밀 키는 브라우저에 넣을 수 없습니다. publishable 또는 anon 키를 사용하세요.');
if(key.split('.').length===3) { let token; try { token=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()); } catch { throw Error('유효하지 않은 anon 키입니다.'); } if(token.role!=='anon') throw Error('JWT 키는 anon 역할이어야 합니다. service_role 키는 금지합니다.'); }
else if(!/^sb_publishable_[\w-]+$/.test(key)) throw Error('publishable 또는 anon 공개 키 형식을 확인하세요.');
let editor=await readFile(resolve(root,'src/editor.html'),'utf8');
editor=transformEditor(editor);
await mkdir(resolve(root,'dist/assets'),{recursive:true});
await build({entryPoints:[resolve(root,'src/main.js')],bundle:true,minify:true,format:'esm',target:['es2022'],outfile:resolve(root,'dist/assets/main.js'),define:{__SUPABASE_URL__:JSON.stringify(url),__SUPABASE_KEY__:JSON.stringify(key),__EDITOR_HTML__:JSON.stringify(editor)},logLevel:'info'});
await copyFile(resolve(root,'src/index.html'),resolve(root,'dist/index.html'));
await copyFile(resolve(root,'src/style.css'),resolve(root,'dist/assets/style.css'));
for(const file of ['icon.svg','apple-touch-icon.png','icon-192.png','icon-512.png','manifest.webmanifest']) await copyFile(resolve(root,'src',file),resolve(root,'dist',file));
console.log('Build complete: dist');
