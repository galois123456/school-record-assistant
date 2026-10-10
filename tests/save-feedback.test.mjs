import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSaveFeedback} from '../src/save-feedback.js';
function button(){return{disabled:false,textContent:'지금 저장',attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}};}
test('manual save keeps button label stable and prevents duplicate clicks',async()=>{
 const b=button();let done,calls=0;
 bindSaveFeedback({button:b,save:()=>{calls++;return new Promise(r=>done=r);},onError:()=>assert.fail()});
 const pending=b.onclick();assert.equal(b.textContent,'지금 저장');assert.equal(b.disabled,true);
 await b.onclick();assert.equal(calls,1);done();await pending;
 assert.equal(b.textContent,'지금 저장');assert.equal(b.disabled,false);
});
test('save failure reports error without relabeling the button and allows retry',async()=>{
 const b=button();let fail=true,seen;
 bindSaveFeedback({button:b,save:async()=>{if(fail)throw Error('network');},onError:e=>seen=e});
 await b.onclick();assert.equal(b.textContent,'지금 저장');assert.equal(seen.message,'network');assert.equal(b.disabled,false);
 fail=false;await b.onclick();assert.equal(b.textContent,'지금 저장');
});
test('account switch discards stale save errors and UI updates',async()=>{
 const b=button();let reject;
 const reset=bindSaveFeedback({button:b,save:()=>new Promise((_,r)=>reject=r),onError:()=>assert.fail()});
 const pending=b.onclick();reset();b.disabled=true;reject(Error('old session'));await pending;
 assert.equal(b.textContent,'지금 저장');assert.equal(b.disabled,true);
});
