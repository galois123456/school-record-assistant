import test from 'node:test';
import assert from 'node:assert/strict';
import {APP_KEYS, AccountStorage, WorkspaceSync, emptyPayload, validatePayload, fingerprint} from '../src/sync.js';
const key=APP_KEYS[1];
const payload=n=>({schemaVersion:1,storage:{[key]:JSON.stringify({value:n})}});
const cache=()=>({value:null,write(p){this.value=structuredClone(p);},remove(){this.value=null;}});
const backend=(revision=1,data=payload(1))=>({revision,data,calls:0,async save(p,r){this.calls++;if(r!==this.revision){if(fingerprint(p)===fingerprint(this.data))return{revision:this.revision};throw Object.assign(Error('conflict'),{code:'40001'});}this.data=structuredClone(p);return{revision:++this.revision};}});
function make(remote=backend(),options={}){return new WorkspaceSync({remote,cache:cache(),revision:remote.revision,payload:remote.data,delay:100000,...options});}
test('account memory storage never crosses accounts; closed account rejects edits',()=>{
 const a=new AccountStorage(payload('A')),b=new AccountStorage(payload('B'));
 a.setItem(key,JSON.stringify({value:'changed'}));assert.equal(b.getItem(key),JSON.stringify({value:'B'}));
 assert.throws(()=>a.setItem('supabase-auth-token','bad'));a.close();assert.throws(()=>a.setItem(key,'{}'));
});
test('invalid payloads rejected before editor opens',()=>{
 for(const p of [null,{}, {schemaVersion:2,storage:{}},{schemaVersion:1,storage:{untrusted:'{}'}},{schemaVersion:1,storage:{[key]:'null'}},{schemaVersion:1,storage:{[key]:'broken'}}])assert.throws(()=>validatePayload(p));
 assert.deepEqual(validatePayload(emptyPayload()),emptyPayload());
});
test('no writes before editor ready; same data does not write',async()=>{
 const r=backend(),e=make(r);await e.flush();assert.equal(r.calls,0);e.start();await e.flush();assert.equal(r.calls,0);
 e.storage.setItem(key,JSON.stringify({value:2}));await e.flush();assert.equal(r.revision,2);assert.equal(e.dirty,false);assert.equal(e.cache.value,null);e.close();
});
test('offline changes retain cache and retry succeeds',async()=>{
 const r=backend(),original=r.save;r.save=async()=>{throw Error('network');};const e=make(r);e.start();e.storage.setItem(key,'{"value":2}');await assert.rejects(e.flush());assert.equal(e.dirty,true);assert.equal(e.cache.value.baseRevision,1);
 r.save=original;await e.flush();assert.equal(e.dirty,false);e.close();
});
test('second device cannot overwrite newer server data',async()=>{
 const r=backend(),a=make(r),b=make(r);a.start();b.start();a.storage.setItem(key,'{"value":"A"}');b.storage.setItem(key,'{"value":"B"}');await a.flush();await assert.rejects(b.flush());assert.equal(b.blocked,true);assert.equal(r.data.storage[key],'{"value":"A"}');assert.equal(b.cache.value.payload.storage[key],'{"value":"B"}');a.close();b.close();
});
test('conflict recovery preserves original base revision across repeated reloads',()=>{
 const r=backend(7,payload('server')),draft={baseRevision:4,payload:payload('local')};const e=make(r,{pending:draft});assert.equal(e.blocked,true);assert.equal(e.cache.value.baseRevision,4);
 const again=make(r,{pending:e.cache.value});assert.equal(again.blocked,true);e.close();again.close();
});
test('matching already-saved pending snapshot is discarded',()=>{
 const r=backend(3,payload('same')),c=cache(),e=make(r,{cache:c,pending:{baseRevision:2,payload:payload('same')}});assert.equal(e.blocked,false);assert.equal(e.dirty,false);assert.equal(c.value,null);e.close();
});
test('edits during in-flight request are not marked saved or lost',async()=>{
 const r=backend();let finish;const save=r.save.bind(r);r.save=(p,rev)=>new Promise(resolve=>{finish=async()=>resolve(await save(p,rev));});const e=make(r);e.start();e.storage.setItem(key,'{"value":2}');const first=e.flush();e.storage.setItem(key,'{"value":3}');await finish();await first;assert.equal(e.dirty,true);assert.equal(e.cache.value.baseRevision,2);assert.equal(e.cache.value.payload.storage[key],'{"value":3}');r.save=save;await e.flush();assert.equal(r.data.storage[key],'{"value":3}');e.close();
});
test('explicit conflict replacement still uses a revision comparison',async()=>{
 const r=backend(),e=make(r);e.start();e.storage.setItem(key,'{"value":"local"}');r.revision=2;r.data=payload('remote');await assert.rejects(e.flush());await e.replaceRemote(2);assert.equal(r.revision,3);assert.equal(e.dirty,false);e.close();
});
test('pending changes restore after refresh at same server revision',async()=>{
 const r=backend(),e=make(r,{pending:{baseRevision:1,payload:payload(9)}});assert.equal(e.blocked,false);e.start();await e.flush();assert.equal(r.data.storage[key],'{"value":9}');e.close();
});
test('quota failure stays visible while server save still works',async()=>{
 const r=backend(),c={write(){throw Error('quota');},remove(){}},e=make(r,{cache:c});e.start();e.storage.setItem(key,'{"value":4}');assert.equal(e.cacheError,true);await e.flush();assert.equal(e.dirty,false);assert.equal(e.cacheError,false);e.close();
});
