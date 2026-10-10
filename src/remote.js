import {validatePayload,emptyPayload} from './sync.js';
// Bind each request to the intended account, including during cross-tab sign-in.
// An explicit token prevents a later SDK session switch from changing its owner.
export function createWorkspaceRemote(client){
 async function tokenFor(uid){const {data,error}=await client.auth.getSession();if(error)throw error;const session=data.session;if(!session||session.user.id!==uid)throw Error('로그인 계정이 변경되었습니다. 다시 로그인해 주세요.');return session.access_token;}
 return {
  async read(uid){const token=await tokenFor(uid);const {data,error}=await client.from('school_record_workspaces').select('payload,revision,updated_at').eq('owner_id',uid).maybeSingle().setHeader('Authorization',`Bearer ${token}`);if(error)throw error;return data?{...data,revision:Number(data.revision),payload:validatePayload(data.payload)}:{revision:0,payload:emptyPayload()};},
  async save(uid,payload,revision){const token=await tokenFor(uid);const {data,error}=await client.rpc('school_record_save_workspace',{p_payload:payload,p_expected_revision:revision}).setHeader('Authorization',`Bearer ${token}`);if(error)throw error;if(!data)throw Error('서버 저장 응답을 확인할 수 없습니다.');return data;}
 };
}
