import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const editor=readFileSync(new URL('../src/editor.html',import.meta.url),'utf8');
test('combined restore requires successful encrypted safety backup before mutating data',async()=>{
 const line=editor.split('\n').find(l=>l.startsWith("document.getElementById('combinedFile').onchange="));
 for(const outcome of ['cancel','failure','success']){
  const input={},messages=[];let applied=0,backupCalls=0;
  const ctx={document:{getElementById:()=>input},RecordBackup:{read:async()=>{if(outcome==='failure')throw Error('wrong password');return {app:'school-record-combined',apps:{}};}},validateCombined:x=>x,confirm:()=>true,getCombinedBackup:()=>({before:true}),downloadCombined:async()=>{backupCalls++;return outcome==='success';},applyCombined:()=>applied++,shellToast:t=>messages.push(t)};
  vm.runInNewContext(line,ctx);const e={target:{files:[{text:async()=>'{"encrypted":"fixture"}'}],value:'file.json'}};
  await input.onchange(e);assert.equal(applied,outcome==='success'?1:0);assert.equal(backupCalls,outcome==='failure'?0:1);assert.equal(e.target.value,'');
 }
});
test('cancelled safety backup aborts reset',async()=>{
 const start=editor.lastIndexOf("ux('resetAllRecords').onclick=async()=>{"),end=editor.indexOf('\n};',start)+3;
 let mutations=0;const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='resetConfirm'?'초기화':id==='resetScope'?'all':'',close(){mutations++;}});return nodes.get(id);};
 const ctx={ux:node,getCombinedBackup:()=>({}),buildResetBackup:()=>({}),downloadCombined:async()=>false,confirm:()=>true,applyCombined:()=>mutations++,shellToast:()=>{},localStorage:{removeItem:()=>mutations++}};
 vm.runInNewContext(editor.slice(start,end),ctx);await node('resetAllRecords').onclick();assert.equal(mutations,0);
});
test('all embedded JSON download and restore paths route through the encryption interface',()=>{
 for(const name of ['journal','integrated','macro','helper','assessment']){
  const inner=Buffer.from(editor.match(new RegExp(name+":'([A-Za-z0-9+/=]+)'"))[1],'base64').toString();
  assert.match(inner,/return parent\.RecordBackup\.download\(JSON\.parse\(/,name);
  assert.match(inner,/await parent\.RecordBackup\.read\(/,name);
 }
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/return window\.RecordBackup\.download\(payload/);
 assert.match(editor,/return RecordBackup\.download\(payload/);
});
