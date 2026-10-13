import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const sample=n=>({schemaVersion:1,storage:{'school-record-student-journal-v1':JSON.stringify({value:n})}});
test('PostgreSQL: existing todos survive, ownership RLS and atomic revision checks',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated,anon;
   grant execute on function auth.uid() to authenticated,anon;
   insert into auth.users values('${A}'),('${B}');
   create table public.todos(id int primary key, title text);
   insert into public.todos values(1,'기존 일정 유지');`);
  const schema=readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8');
  await db.exec(schema.replace("'school-record-assessment-v1',",''));await db.exec(readFileSync(new URL('../supabase/upgrade-3.16.sql',import.meta.url),'utf8'));await db.exec(schema); // repeatable, no app data destruction
  async function asUser(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);}
  const save=(p,r)=>db.query('select public.school_record_save_workspace($1::jsonb,$2::bigint) as result',[JSON.stringify(p),r]);
  await asUser(A);assert.equal((await save(sample('A'),0)).rows[0].result.revision,1);
  await asUser(B);assert.equal((await db.query('select * from public.school_record_workspaces')).rows.length,0);
  await save(sample('B'),0);const bRows=(await db.query('select * from public.school_record_workspaces')).rows;assert.equal(bRows.length,1);assert.equal(bRows[0].owner_id,B);
  await assert.rejects(db.query('update public.school_record_workspaces set revision=99'),e=>e.code==='42501');
  await assert.rejects(db.query('delete from public.school_record_workspaces'),e=>e.code==='42501');
  await asUser(A);assert.equal((await save(sample('A2'),1)).rows[0].result.revision,2);
  await assert.rejects(save(sample('stale'),1),e=>e.code==='40001');
  assert.equal((await save(sample('A2'),1)).rows[0].result.revision,2); // lost response retry
  await assert.rejects(save({schemaVersion:1,storage:{'sb-auth':'{}'}},2),e=>e.code==='22023');
  await assert.rejects(save({schemaVersion:1,storage:{'school-record-student-journal-v1':'null'}},2),e=>e.code==='22023');
  const withGrades={...sample('A2'),storage:{...sample('A2').storage,'school-record-assessment-v1':JSON.stringify({version:2,classes:[{id:'class-test',data:{students:[{id:'student-test',scores:{idone:'25'}}]}}]})}};
  assert.equal((await save(withGrades,2)).rows[0].result.revision,3);
  assert.equal((await db.query('select payload from public.school_record_workspaces')).rows[0].payload.storage['school-record-assessment-v1'],withGrades.storage['school-record-assessment-v1']);
  const before=(await db.query('select revision,updated_at,payload from public.school_record_workspaces')).rows[0];
  await db.exec('reset role');await db.exec(readFileSync(new URL('../supabase/upgrade-3.16.sql',import.meta.url),'utf8'));await asUser(A);
  assert.equal((await save(withGrades,3)).rows[0].result.revision,3);
  assert.deepEqual((await db.query('select revision,updated_at,payload from public.school_record_workspaces')).rows[0],before);
  await assert.rejects(save({schemaVersion:1,storage:{'school-record-assessment-v1':'broken JSON'}},3),e=>e.code==='22023'&&e.message.includes('school-record-assessment-v1'));
  await asUser('');await assert.rejects(save(sample('none'),0),e=>e.code==='42501');
  await asUser('','anon');await assert.rejects(db.query('select * from public.school_record_workspaces'),e=>e.code==='42501');await assert.rejects(save(sample('anon'),0),e=>e.code==='42501');
  await db.exec('reset role');assert.equal((await db.query('select title from public.todos')).rows[0].title,'기존 일정 유지');
  assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n,2);
 }finally{await db.close();}
});
