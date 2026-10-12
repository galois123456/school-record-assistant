-- 웹 ver3.13: 기존 자료는 유지하고 수행평가 저장 항목을 추가합니다.
begin;
create or replace function public.school_record_save_workspace(
  p_payload jsonb, p_expected_revision bigint
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.school_record_workspaces%rowtype;
  v_item record;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid revision' using errcode='22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or p_payload->>'schemaVersion' is distinct from '1'
    or jsonb_typeof(p_payload->'storage') is distinct from 'object'
    or octet_length(p_payload::text) > 8388608 then
    raise exception 'Invalid workspace payload or size exceeds 8MB' using errcode='22023';
  end if;
  for v_item in select key, value from jsonb_each(p_payload->'storage') loop
    if v_item.key not in (
      'school-record-combined-shell-v1','school-record-student-journal-v1',
      'school-record-class-activity-manager-v2','student-sentence-macro-v1',
      'student-record-helper-v1','school-record-assessment-v1','school-record-byte-manager-v1','school-record-byte-manager-v2'
    ) or jsonb_typeof(v_item.value) <> 'string' then
      raise exception 'Invalid workspace storage key/value' using errcode='22023';
    end if;
    if jsonb_typeof((v_item.value #>> '{}')::jsonb) <> 'object' then
      raise exception 'Invalid app data' using errcode='22023';
    end if;
  end loop;
  if p_expected_revision = 0 then
    insert into public.school_record_workspaces(owner_id,payload,revision)
    values(v_uid,p_payload,1) on conflict(owner_id) do nothing returning * into v_row;
  else
    update public.school_record_workspaces set payload=p_payload,
      revision=revision+1,updated_at=now()
    where owner_id=v_uid and revision=p_expected_revision returning * into v_row;
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
commit;
