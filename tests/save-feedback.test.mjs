import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSaveFeedback} from '../src/save-feedback.js';
function button(){return{disabled:false,textContent:'지금 저장',attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}};}
test('manual save acknowledges already-saved data and resets label',async()=>{
 const b=button();let done,calls=0;
 bindSaveFeedback({button:b,save:()=>{calls++;return new Promise(r=>done=r);},hasPending:()=>false,onError:()=>assert.fail(),duration:5});
 const pending=b.onclick();assert.equal(b.textContent,'저장 중…');assert.equal(b.disabled,true);
 await b.onclick();assert.equal(calls,1);done();await pending;
 assert.equal(b.textContent,'저장 완료 ✓');assert.equal(b.disabled,false);
 await new Promise(r=>setTimeout(r,15));assert.equal(b.textContent,'지금 저장');
});
test('save failure remains visible and retry can succeed',async()=>{
 const b=button();let fail=true,seen;
 const reset=bindSaveFeedback({button:b,save:async()=>{if(fail)throw Error('network');},hasPending:()=>false,onError:e=>seen=e});
 await b.onclick();assert.equal(b.textContent,'저장 실패 · 재시도');assert.equal(seen.message,'network');assert.equal(b.disabled,false);
 fail=false;await b.onclick();assert.equal(b.textContent,'저장 완료 ✓');reset();
});
test('new edits are not falsely reported as saved and account switch discards stale results',async()=>{
 const b=button();let done;
 const reset=bindSaveFeedback({button:b,save:()=>new Promise(r=>done=r),hasPending:()=>true,onError:()=>assert.fail()});
 let pending=b.onclick();done();await pending;assert.equal(b.textContent,'추가 변경 저장 중…');
 pending=b.onclick();reset();b.disabled=true;done();await pending;
 assert.equal(b.textContent,'지금 저장');assert.equal(b.disabled,true);
});
