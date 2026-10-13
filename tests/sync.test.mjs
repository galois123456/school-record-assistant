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

test('manual save of unchanged data waits for actual server response',async()=>{
 const r=backend();let done;const original=r.save.bind(r),states=[];
 r.save=(p,rev)=>new Promise(resolve=>done=async()=>resolve(await original(p,rev)));
 const e=make(r,{onState:s=>states.push(s)});e.start();states.length=0;
 const pending=e.flush({force:true});assert.equal(states.at(-1).state,'saving');assert.equal(e.confirmedAt,null);
 await done();await pending;assert.equal(r.calls,1);assert.equal(states.at(-1).state,'saved');assert.ok(states.at(-1).confirmedAt);e.close();
});
test('unchanged data cannot report manual save success while offline',async()=>{
 const r=backend(),states=[];let online=true;const e=make(r,{isOnline:()=>online,onState:s=>states.push(s)});e.start();online=false;e.connectionLost();
 await assert.rejects(e.flush({force:true}),/인터넷 연결/);assert.equal(r.calls,0);assert.equal(states.at(-1).state,'offline');assert.equal(e.dirty,false);e.close();
});
test('network failure is reported even when browser reports online and data is unchanged',async()=>{
 const r=backend(),states=[];r.save=async()=>{r.calls++;throw Error('Failed to fetch');};const e=make(r,{onState:s=>states.push(s)});e.start();
 await assert.rejects(e.flush({force:true}),/fetch/);assert.equal(r.calls,1);assert.equal(states.at(-1).state,'error');
 await e.flush();assert.equal(states.at(-1).state,'error','passive no-op cannot pretend to confirm server state');e.close();
});
test('offline edits remain cached and reconnect sends and confirms them',async()=>{
 const r=backend(),states=[];let online=false;const e=make(r,{isOnline:()=>online,onState:s=>states.push(s)});e.start();e.storage.setItem(key,'{"value":42}');
 assert.equal(states.at(-1).state,'offline');assert.equal(e.cache.value.payload.storage[key],'{"value":42}');
 await assert.rejects(e.flush({force:true}));online=true;await e.flush({force:true});assert.equal(r.data.storage[key],'{"value":42}');assert.equal(states.at(-1).state,'saved');assert.equal(e.cache.value,null);e.close();
});
test('disconnect during an in-flight request does not replace offline indicator with success',async()=>{
 const r=backend(),states=[];let online=true,done;const original=r.save.bind(r);r.save=(p,rev)=>new Promise(resolve=>done=async()=>resolve(await original(p,rev)));
 const e=make(r,{isOnline:()=>online,onState:s=>states.push(s)});e.start();const pending=e.flush({force:true});online=false;e.connectionLost();await done();await pending;
 assert.equal(states.at(-1).state,'offline');e.close();
});
test('forced verification preserves revision conflict protection',async()=>{
 const r=backend(),e=make(r);e.start();r.revision++;r.data=payload('another device');
 await assert.rejects(e.flush({force:true}),/conflict/);assert.equal(e.blocked,true);assert.equal(r.data.storage[key],payload('another device').storage[key]);e.close();
});

test('assessment scores survive isolated account storage roundtrip',()=>{const key='school-record-assessment-v1';const value=JSON.stringify({version:2,classes:[{id:'class-a',data:{students:[{id:'student-a',scores:{idone:'25'}}]}}]});const storage=new AccountStorage(emptyPayload(),()=>{});storage.setItem(key,value);const restored=new AccountStorage(validatePayload(storage.snapshot()),()=>{});assert.equal(restored.getItem(key),value);storage.close();restored.close();});


test('automatic failures back off, stop after three retries and preserve latest edits',async()=>{
 const r=backend(),original=r.save.bind(r);r.save=async()=>{r.calls++;throw Error('temporary network failure');};
 const e=make(r);e.schedule=()=>{};e.start();e.storage.setItem(key,'{"value":20}');
 for(let i=0;i<4;i++){e.nextAutoAt=0;await assert.rejects(e.flush({automatic:true}));assert.ok(e.nextAutoAt>Date.now()+9000);}
 assert.equal(r.calls,4);assert.equal(e.autoStopped,true);e.nextAutoAt=0;
 e.storage.setItem(key,'{"value":21}');await e.flush({automatic:true});assert.equal(r.calls,4);assert.equal(e.cache.value.payload.storage[key],'{"value":21}');
 r.save=original;await e.flush({force:true});assert.equal(e.dirty,false);assert.equal(e.autoStopped,false);e.close();
});
test('invalid SQL payload errors do not repeatedly hit server',async()=>{
 const r=backend();r.save=async()=>{r.calls++;throw Object.assign(Error('bad key'),{code:'22023'});};
 const e=make(r);e.schedule=()=>{};e.start();e.storage.setItem(key,'{"value":2}');
 await assert.rejects(e.flush({automatic:true}));e.nextAutoAt=0;await e.flush({automatic:true});assert.equal(r.calls,1);assert.equal(e.dirty,true);e.close();
});
test('changed data bypasses the ten second unchanged-confirmation interval',async()=>{
 const r=backend(),e=make(r);e.schedule=()=>{};e.start();e.storage.setItem(key,'{"value":2}');await e.flush({automatic:true});
 e.storage.setItem(key,'{"value":3}');await e.flush({automatic:true});assert.equal(r.calls,2);assert.equal(e.dirty,false);
 await e.flush({force:true,automatic:true});assert.equal(r.calls,2);assert.equal(e.dirty,false);e.close();
});
test('overlapping manual confirmations share the in-flight response',async()=>{
 const r=backend(),original=r.save.bind(r);let finish;r.save=(p,v)=>new Promise(resolve=>finish=async()=>resolve(await original(p,v)));
 const e=make(r);e.start();const a=e.flush({force:true}),b=e.flush({force:true});await finish();await Promise.all([a,b]);assert.equal(r.calls,1);e.close();
});

// Fake clock verifies debounce and exact retry deadlines without waiting real minutes.
test('three second debounce restarts on input and retries are not postponed by new input',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:100000});
 const r=backend(),e=new WorkspaceSync({remote:r,cache:cache(),revision:1,payload:r.data});
 const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 e.start();e.storage.setItem(key,'{"value":2}');t.mock.timers.tick(2999);await settle();assert.equal(r.calls,0);
 e.storage.setItem(key,'{"value":3}');t.mock.timers.tick(2999);await settle();assert.equal(r.calls,0);
 t.mock.timers.tick(1);await settle();assert.equal(r.calls,1);assert.equal(e.dirty,false);
 r.save=async()=>{r.calls++;throw Error('network');};
 e.storage.setItem(key,'{"value":4}');t.mock.timers.tick(3000);await settle();assert.equal(r.calls,2);
 for(const [i,wait] of [10000,30000,60000].entries()){
  t.mock.timers.tick(wait-1);await settle();assert.equal(r.calls,2+i);
  e.storage.setItem(key,JSON.stringify({value:10+i}));
  t.mock.timers.tick(1);await settle();assert.equal(r.calls,3+i);
 }
 assert.equal(e.autoStopped,true);e.storage.setItem(key,'{"value":99}');t.mock.timers.tick(120000);await settle();assert.equal(r.calls,5);assert.equal(e.cache.value.payload.storage[key],'{"value":99}');e.close();
});
test('in-flight edits are coalesced and wait only for remaining debounce',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:100000});
 const r=backend(),original=r.save.bind(r);let finish,requests=0;
 r.save=(p,v)=>{requests++;return new Promise(resolve=>finish=async()=>resolve(await original(p,v)));};
 const e=new WorkspaceSync({remote:r,cache:cache(),revision:1,payload:r.data});const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 e.start();e.storage.setItem(key,'{"value":2}');t.mock.timers.tick(3000);await settle();assert.equal(requests,1);
 e.storage.setItem(key,'{"value":3}');e.storage.setItem(key,'{"value":4}');t.mock.timers.tick(2000);await settle();assert.equal(requests,1);
 await finish();await settle();t.mock.timers.tick(999);await settle();assert.equal(requests,1);
 t.mock.timers.tick(1);await settle();assert.equal(requests,2);await finish();await settle();assert.equal(r.data.storage[key],'{"value":4}');assert.equal(e.dirty,false);e.close();
});
