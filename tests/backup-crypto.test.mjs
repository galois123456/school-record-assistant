import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/backup-crypto.js',import.meta.url),'utf8');
function context(crypto=webcrypto){const ctx={crypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,setTimeout,JSON};vm.runInNewContext(source,ctx);return ctx.RecordBackup;}
const crypto=context(),password='별도의-백업-암호-2026!';
const original={app:'school-record-combined',schemaVersion:2,apps:{journal:{classes:[{students:[{name:'가상학생',number:'10101'}],records:[{text:'수학 활동 관찰 🧮'}]}],inputSizing:{manualHeights:{'id:recordText':245}}}},theme:'dark'};
test('encrypted JSON roundtrips Unicode, records and settings without plaintext or password',async()=>{
 const a=await crypto.encrypt(original,password),b=await crypto.encrypt(original,password);
 assert.equal(a.format,crypto.format);assert.notEqual(a.kdf.salt,b.kdf.salt);assert.notEqual(a.cipher.iv,b.cipher.iv);assert.notEqual(a.ciphertext,b.ciphertext);
 const text=JSON.stringify(a);for(const secret of ['가상학생','수학 활동 관찰','recordText',password])assert.equal(text.includes(secret),false);
 assert.deepEqual(await crypto.decrypt(JSON.parse(text),password),original);
});
test('wrong password and changed ciphertext/header are rejected',async()=>{
 const e=await crypto.encrypt(original,password);
 await assert.rejects(crypto.decrypt(e,'완전히다른비밀번호123'),/틀렸거나/);
 const altered=structuredClone(e);altered.ciphertext=(altered.ciphertext[0]==='A'?'B':'A')+altered.ciphertext.slice(1);
 await assert.rejects(crypto.decrypt(altered,password),/틀렸거나/);
 const changed=structuredClone(e);changed.cipher.iv=(changed.cipher.iv[0]==='A'?'B':'A')+changed.cipher.iv.slice(1);
 await assert.rejects(crypto.decrypt(changed,password),/틀렸거나/);
});
test('unsupported format, excessive KDF work, malformed base64 and weak new passwords are rejected',async()=>{
 const e=await crypto.encrypt(original,password);
 for(const change of [x=>x.version=99,x=>x.kdf.iterations=999999999999,x=>x.cipher.tagLength=32,x=>x.kdf.salt='?',x=>x.ciphertext='']){
  const bad=structuredClone(e);change(bad);await assert.rejects(crypto.decrypt(bad,password));
 }
 await assert.rejects(crypto.encrypt(original,'1234'),/12자/);
 assert.throws(()=>crypto.parse('not-json'),/JSON/);
});
test('legacy plaintext backup is readable but encryption never silently falls back',async()=>{
 assert.deepEqual(await crypto.read('\ufeff'+JSON.stringify(original)),original);
 const unsupported=context({});await assert.rejects(unsupported.encrypt(original,password),/암호화를 사용할 수 없습니다/);
});
test('single-file embedded codec and online codec decrypt one another',async()=>{
 const offline=readFileSync(new URL('../src/editor.html',import.meta.url),'utf8');
 assert.ok(offline.includes(source));
 const embedded=offline.match(/<script>(\/\* Shared by[\s\S]*?)<\/script>/)[1];
 const ctx={crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,setTimeout,JSON};vm.runInNewContext(embedded,ctx);
 const envelope=await crypto.encrypt(original,password);assert.deepEqual(await ctx.RecordBackup.decrypt(envelope,password),original);
 const reverse=await ctx.RecordBackup.encrypt(original,password);assert.deepEqual(await crypto.decrypt(reverse,password),original);
});
