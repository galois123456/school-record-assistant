import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceRemote} from '../src/remote.js';
import {emptyPayload} from '../src/sync.js';
test('request pins original account token even if session changes during request construction',async()=>{
 let active={user:{id:'A'},access_token:'token-A'},headers={},called=0;
 const client={auth:{async getSession(){return{data:{session:active}};}},rpc(){called++;active={user:{id:'B'},access_token:'token-B'};return{setHeader(k,v){headers[k]=v;return Promise.resolve({data:{revision:2}});}};}};
 const remote=createWorkspaceRemote(client);await remote.save('A',emptyPayload(),1);assert.equal(headers.Authorization,'Bearer token-A');assert.equal(called,1);
 await assert.rejects(remote.save('A',emptyPayload(),1));assert.equal(called,1);
});
test('read failure is propagated, never converted to an empty workspace',async()=>{
 const client={auth:{async getSession(){return{data:{session:{user:{id:'A'},access_token:'x'}}};}},from(){return this;},select(){return this;},eq(){return this;},maybeSingle(){return this;},setHeader(){return Promise.resolve({error:Error('network')});}};
 await assert.rejects(createWorkspaceRemote(client).read('A'),/network/);
});
