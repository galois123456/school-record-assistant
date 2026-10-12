-- 생기부 작성 도우미 웹 ver3.00
-- 기존 todolist Supabase 프로젝트의 SQL Editor에서 실행합니다.
-- 기존 테이블/사용자/인증 정책/다른 앱의 RLS에는 접근하지 않습니다.
begin;
create table if not exists public.school_record_workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.school_record_workspaces enable row level security;
revoke all on table public.school_record_workspaces from anon, authenticated;
grant select on table public.school_record_workspaces to authenticated;
drop policy if exists school_record_owner_read on public.school_record_workspaces;
create policy school_record_owner_read on public.school_record_workspaces
  for select to authenticated using ((select auth.uid()) = owner_id);

-- Only this RPC can write. It derives the owner from the signed-in JWT,
-- and atomically compares revisions to prevent cross-device lost updates.
create or replace function public.school_record_save_workspace(
  p_payload jsonb, p_expected_revision bigint
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.school_record_workspaces%rowtype;
  v_item record;
  v_app jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid revision' using errcode='22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload->>'schemaVersion' is distinct from '1'
    or jsonb_typeof(p_payload->'storage') is distinct from 'object'
    or octet_length(p_payload::text) > 8388608 then
    raise exception '저장 자료 형식이 올바르지 않거나 전체 자료가 8MB를 초과했습니다.' using errcode='22023';
  end if;
  for v_item in select key, value from jsonb_each(p_payload->'storage') loop
    if v_item.key not in (
      'school-record-combined-shell-v1','school-record-student-journal-v1',
      'school-record-class-activity-manager-v2','student-sentence-macro-v1',
      'student-record-helper-v1','school-record-assessment-v1','school-record-byte-manager-v1','school-record-byte-manager-v2'
    ) or jsonb_typeof(v_item.value) <> 'string' then
      raise exception '저장 항목 형식 오류: %', v_item.key using errcode='22023';
    end if;
    begin
      v_app := (v_item.value #>> '{}')::jsonb;
    exception when invalid_text_representation then
      raise exception 'JSON 자료 형식 오류: %', v_item.key using errcode='22023';
    end;
    if jsonb_typeof(v_app) is distinct from 'object' then
      raise exception '객체 형식이 아닌 저장 자료: %', v_item.key using errcode='22023';
    end if;
  end loop;
  if p_expected_revision = 0 then
    insert into public.school_record_workspaces(owner_id,payload,revision)
    values(v_uid,p_payload,1) on conflict(owner_id) do nothing returning * into v_row;
  else
    update public.school_record_workspaces set payload=p_payload,
      revision=revision+1,updated_at=now()
    where owner_id=v_uid and revision=p_expected_revision
      and payload is distinct from p_payload returning * into v_row;
  end if;
  if v_row.owner_id is null then
    -- If a response was lost, repeating the identical save is safe.
    select * into v_row from public.school_record_workspaces
      where owner_id=v_uid and payload=p_payload;
    if not found then
      raise exception '다른 기기에서 자료가 변경되었습니다.' using errcode='40001';
    end if;
  end if;
  return jsonb_build_object('revision',v_row.revision,'updated_at',v_row.updated_at);
end;
$$;
revoke all on function public.school_record_save_workspace(jsonb,bigint) from public, anon, authenticated;
grant execute on function public.school_record_save_workspace(jsonb,bigint) to authenticated;
comment on table public.school_record_workspaces is '생기부 작성 도우미: 계정별 전용 저장소 (todolist와 인증만 공유)';
commit;
