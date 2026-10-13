import { transformEditor } from '../scripts/editor-transform.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const editor=readFileSync(new URL('../src/editor.html',import.meta.url),'utf8');
test('all five integrated editor modules and inline scripts parse',()=>{
 const pages=[editor];
 for(const name of ['journal','integrated','macro','helper','assessment']){const m=editor.match(new RegExp(name+":'([A-Za-z0-9+/=]+)'"));assert.ok(m,name);pages.push(Buffer.from(m[1],'base64').toString());}
 for(const [i,page] of pages.entries())for(const [j,m] of [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries())new vm.Script(m[1],{filename:`editor-${i}-script-${j}`});
 assert.ok(editor.includes('ver2.16'));
});
test('SQL adds only prefixed app resources and enforces owner/revision checks',()=>{
 const sql=readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8');
 assert.match(sql,/enable row level security/i);assert.match(sql,/auth\.uid\(\)/);assert.match(sql,/owner_id=v_uid and revision=p_expected_revision/);assert.match(sql,/set search_path = ''/);assert.match(sql,/revoke all on table public.school_record_workspaces from anon, authenticated/);
 assert.doesNotMatch(sql,/drop table|delete from|update auth\./i);
});
test('cloud transformed modules parse and share only account storage',()=>{
 const cloud=transformEditor(editor); const pages=[cloud];
 for(const name of ['journal','integrated','macro','helper','assessment']){const m=cloud.match(new RegExp(name+":'([A-Za-z0-9+/=]+)'"));assert.ok(m,name);pages.push(Buffer.from(m[1],'base64').toString());}
 for(const [i,page] of pages.entries())for(const [j,m] of [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries())new vm.Script(m[1],{filename:`editor-${i}-script-${j}`});
 for(const page of pages){const first=page.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)[1];const shared={};const window={parent:{__recordStorage:shared}};vm.runInNewContext(first,{window});assert.equal(window.localStorage,shared);assert.equal(window.__recordStorage,shared);}
 assert.ok(cloud.includes('웹 ver3.17'));assert.ok(cloud.includes('parent.cloudEditorReady()'));
});
