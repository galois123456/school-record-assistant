// The legacy apps see only this account's isolated memory storage.
export const APP_KEYS = Object.freeze([
  'school-record-combined-shell-v1', 'school-record-student-journal-v1',
  'school-record-class-activity-manager-v2', 'student-sentence-macro-v1',
  'student-record-helper-v1','school-record-assessment-v1', 'school-record-byte-manager-v1', 'school-record-byte-manager-v2'
]);
export function validatePayload(payload) {
  if (!payload || payload.schemaVersion !== 1 || !payload.storage || Array.isArray(payload.storage) || typeof payload.storage !== 'object') throw Error('지원하지 않는 서버 자료 형식입니다.');
  for (const [key, value] of Object.entries(payload.storage)) {
    if (!APP_KEYS.includes(key) || typeof value !== 'string') throw Error('저장 자료의 항목이 올바르지 않습니다.');
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('저장 자료가 손상되었습니다.');
  }
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 8 * 1024 * 1024) throw Error('자료가 8MB를 넘었습니다. 통합 백업 후 오래된 자료를 정리하세요.');
  return payload;
}
export const emptyPayload = () => ({ schemaVersion: 1, storage: {} });
export const fingerprint = p => JSON.stringify(Object.fromEntries(Object.entries(p.storage).sort(([a],[b])=>a.localeCompare(b))));
export class AccountStorage {
  constructor(payload, onChange = () => {}) {
    validatePayload(payload);
    this.values = new Map(Object.entries(payload.storage)); this.onChange = onChange; this.active = true;
  }
  get length() { return this.values.size; }
  key(i) { return [...this.values.keys()][i] ?? null; }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  setItem(key, value) {
    if (!this.active) throw Error('종료된 계정입니다.');
    if (!APP_KEYS.includes(key)) throw Error('허용되지 않은 저장 항목입니다.');
    value = String(value); if (this.values.get(key) === value) return;
    this.values.set(key, value); this.onChange();
  }
  removeItem(key) { if (!this.active) throw Error('종료된 계정입니다.'); if (this.values.delete(key)) this.onChange(); }
  clear() { if (!this.active) throw Error('종료된 계정입니다.'); this.values.clear(); this.onChange(); }
  snapshot() { return { schemaVersion: 1, storage: Object.fromEntries(this.values) }; }
  close() { this.active = false; this.onChange = () => {}; }
}
export class WorkspaceSync {
  constructor({remote, cache, revision, payload, pending = null, onState = () => {}, delay = 1500, isOnline = () => true}) {
    validatePayload(payload);
    this.remote=remote; this.cache=cache; this.revision=revision; this.onState=onState; this.delay=delay;
    this.isOnline=isOnline;this.confirmedAt=null;
    this.base=fingerprint(payload); this.paused=true; this.blocked=false; this.closed=false; this.cacheError=false;
    if(pending) {
      validatePayload(pending.payload);
      if(fingerprint(pending.payload)!==this.base) {
        this.blocked=pending.baseRevision!==revision; this.revision=pending.baseRevision; payload=pending.payload;
      } else cache.remove();
    }
    this.storage=new AccountStorage(payload,()=>this.changed());
    if(this.dirty) this.persist();
  }
  get dirty() { return fingerprint(this.storage.snapshot())!==this.base; }
  status(state, detail='') { if(!this.closed)this.onState({state:!this.isOnline()&&state!=='conflict'?'offline':state,detail,cacheError:this.cacheError,confirmedAt:this.confirmedAt}); }
  connectionLost() { clearTimeout(this.timer);if(this.dirty)this.persist();this.status(this.blocked?'conflict':'offline'); }
  persist() {
    try { this.cache.write({baseRevision:this.revision,payload:this.storage.snapshot(),savedAt:new Date().toISOString()}); this.cacheError=false; }
    catch { this.cacheError=true; }
  }
  changed() {
    this.persist();
    this.status(this.blocked?'conflict':'pending');
    clearTimeout(this.timer);
    if(!this.paused&&!this.blocked&&this.isOnline()) this.timer=setTimeout(()=>this.flush().catch(()=>{}),this.delay);
  }
  start() { this.paused=false; if(this.blocked) this.status('conflict'); else if(this.dirty) this.changed(); else this.status('saved'); }
  async flush({force=false}={}) {
    clearTimeout(this.timer);
    if(this.closed||this.paused) return;
    if(this.inflight) { await this.inflight; if((this.dirty||force)&&!this.blocked) return this.flush({force}); return; }
    if(this.blocked) throw Error('다른 기기의 변경 사항을 먼저 확인하세요.');
    if(!this.isOnline()){if(this.dirty)this.persist();this.status('offline');throw Error('인터넷 연결이 끊겨 서버에 저장하지 못했습니다. 연결 후 다시 저장해 주세요.');}
    if(!this.dirty&&!force) { return; }
    this.inflight=this.send();
    try { await this.inflight; } finally { this.inflight=null; }
  }
  async send() {
    const payload=this.storage.snapshot(), sent=fingerprint(payload);
    this.status('saving');
    try {
      validatePayload(payload);
      const row=await this.remote.save(payload,this.revision);
      if(this.closed) return;
      this.confirmedAt=Date.now();
      this.revision=Number(row.revision); this.base=sent;
      if(this.dirty) { this.persist(); this.status('pending'); }
      else { try { this.cache.remove(); this.cacheError=false; } catch { this.cacheError=true; } this.status('saved'); }
    } catch(error) {
      if(this.closed) throw error;
      if(error.code==='40001') this.blocked=true;
      this.persist(); this.status(this.blocked?'conflict':'error',error.message); throw error;
    }
  }
  async replaceRemote(revision) { if(this.inflight) await this.inflight.catch(()=>{}); this.revision=revision; this.blocked=false; this.persist(); await this.flush(); }
  close() { clearTimeout(this.timer); if(this.dirty)this.persist(); this.closed=true; this.storage.close(); }
}
