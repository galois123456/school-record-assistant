/* Shared by the online application and the self-contained offline HTML. No network calls. */
(function(root){
 'use strict';
 const FORMAT='school-record-encrypted-backup',ITERATIONS=600000,MAX_BYTES=32*1024*1024;
 const encode=text=>new TextEncoder().encode(text);
 function cryptoAPI(){if(!root.crypto?.subtle||!root.crypto?.getRandomValues)throw Error('이 환경에서는 안전한 암호화를 사용할 수 없습니다. 최신 Chrome·Edge·Safari에서 HTTPS 사이트 또는 내려받은 HTML 파일을 직접 열어 주세요. 암호 없는 백업으로 대체하지 않습니다.');return root.crypto;}
 function to64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
 function from64(value,max){if(typeof value!=='string'||value.length>max||!value.length||value.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('암호화 백업의 데이터 형식이 올바르지 않습니다.');let s;try{s=atob(value);}catch{throw Error('암호화 백업이 손상되었습니다.');}return Uint8Array.from(s,c=>c.charCodeAt(0));}
 function header(e){return {format:e.format,version:e.version,kdf:{name:e.kdf.name,hash:e.kdf.hash,iterations:e.kdf.iterations,salt:e.kdf.salt},cipher:{name:e.cipher.name,iv:e.cipher.iv,tagLength:e.cipher.tagLength}};}
 function inspect(e){
  if(!e||e.format!==FORMAT||e.version!==1||e.kdf?.name!=='PBKDF2'||e.kdf.hash!=='SHA-256'||e.kdf.iterations!==ITERATIONS||e.cipher?.name!=='AES-GCM'||e.cipher.tagLength!==128)throw Error('지원하지 않거나 손상된 암호화 백업입니다.');
  const salt=from64(e.kdf.salt,24),iv=from64(e.cipher.iv,16),data=from64(e.ciphertext,Math.ceil((MAX_BYTES+16)/3)*4);
  if(salt.length!==16||iv.length!==12||data.length<16||data.length>MAX_BYTES+16)throw Error('암호화 백업의 길이가 올바르지 않습니다.');return {salt,iv,data};
 }
 async function keyFor(password,salt){
  if(typeof password!=='string'||!password.length||password.length>1024)throw Error('비밀번호를 입력해 주세요.');
  const api=cryptoAPI(),material=await api.subtle.importKey('raw',encode(password),'PBKDF2',false,['deriveKey']);
  return api.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 async function encrypt(payload,password){
  if(typeof password!=='string'||password.length<12||password.length>1024)throw Error('백업 비밀번호는 12자 이상으로 설정해 주세요.');
  const text=JSON.stringify(payload);if(typeof text!=='string')throw Error('백업할 자료가 없습니다.');const bytes=encode(text);if(bytes.length>MAX_BYTES)throw Error('백업 자료가 32MB를 초과합니다.');
  const api=cryptoAPI(),salt=api.getRandomValues(new Uint8Array(16)),iv=api.getRandomValues(new Uint8Array(12));
  const envelope={format:FORMAT,version:1,kdf:{name:'PBKDF2',hash:'SHA-256',iterations:ITERATIONS,salt:to64(salt)},cipher:{name:'AES-GCM',iv:to64(iv),tagLength:128}};
  const key=await keyFor(password,salt);
  const ciphertext=await api.subtle.encrypt({name:'AES-GCM',iv,tagLength:128,additionalData:encode(JSON.stringify(header(envelope)))},key,bytes);
  return {...envelope,ciphertext:to64(new Uint8Array(ciphertext))};
 }
 async function decrypt(envelope,password){
  const {salt,iv,data}=inspect(envelope),key=await keyFor(password,salt);let plain;
  try{plain=await cryptoAPI().subtle.decrypt({name:'AES-GCM',iv,tagLength:128,additionalData:encode(JSON.stringify(header(envelope)))},key,data);}
  catch{throw Error('비밀번호가 틀렸거나 백업 파일이 손상되었습니다. 원본 파일과 비밀번호를 확인해 주세요.');}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));}catch{throw Error('복호화된 백업의 JSON 형식이 올바르지 않습니다.');}
 }
 function parse(text){if(typeof text!=='string'||text.length>48*1024*1024)throw Error('백업 파일이 너무 크거나 올바르지 않습니다.');try{return JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('JSON 백업 파일을 선택해 주세요.');}}
 let active=false;
 function dialog(mode,operation,filename,allowSkip=false){
  if(active)return Promise.reject(Error('이미 백업·복원 작업 중입니다. 열려 있는 창을 먼저 완료해 주세요.'));
  active=true;
  return new Promise((resolve,reject)=>{
   const d=root.document.createElement('dialog');d.className='record-crypto-dialog';d.setAttribute('aria-labelledby','recordCryptoTitle');
   const style=root.document.createElement('style');style.textContent=`.record-crypto-dialog{box-sizing:border-box;width:min(460px,calc(100vw - 24px));max-height:90vh;overflow:auto;border:1px solid #bccbdf;border-radius:14px;padding:22px;background:#fff;color:#15253e;font:14px/1.6 system-ui,sans-serif}.record-crypto-dialog::backdrop{background:#10203799}.record-crypto-dialog h2{margin:0 0 8px;font-size:20px}.record-crypto-dialog p{margin:8px 0}.record-crypto-dialog label{display:block;margin:10px 0 3px}.record-crypto-dialog input{box-sizing:border-box;width:100%;font:inherit;padding:9px;border:1px solid #9cacc0;border-radius:6px;background:transparent;color:inherit}.record-crypto-dialog .crypto-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:16px}.record-crypto-dialog button{font:inherit;border:1px solid #96a7bc;border-radius:7px;padding:7px 12px;cursor:pointer;background:transparent;color:inherit}.record-crypto-dialog button[type=submit]{background:#1d4ed8;border-color:#1d4ed8;color:#fff}.record-crypto-dialog button:disabled{opacity:.5;cursor:wait}.record-crypto-dialog .crypto-message{min-height:24px;color:#b91c1c;overflow-wrap:anywhere}.record-crypto-dialog .crypto-warning{font-size:12px;color:#7b3c09;background:#fff7ed;padding:8px;border-radius:6px}html[data-theme=dark] .record-crypto-dialog{background:#142237;color:#edf4ff;border-color:#60728b}html[data-theme=dark] .record-crypto-dialog .crypto-message{color:#fca5a5}@media(prefers-color-scheme:dark){html:not([data-theme=light]) .record-crypto-dialog{background:#142237;color:#edf4ff;border-color:#60728b}html:not([data-theme=light]) .record-crypto-dialog .crypto-message{color:#fca5a5}}`;
   d.innerHTML='<form><h2 id="recordCryptoTitle"></h2><p class="crypto-description"></p><p class="crypto-warning">백업 비밀번호는 로그인 비밀번호와 별개입니다. 프로그램은 비밀번호를 보관하지 않으며, 잊으면 복구할 수 없습니다.</p><label for="recordCryptoPassword">백업 비밀번호</label><input id="recordCryptoPassword" type="password" required maxlength="1024" autocomplete="off" spellcheck="false"><div class="crypto-confirm"><label for="recordCryptoConfirm">비밀번호 다시 입력</label><input id="recordCryptoConfirm" type="password" maxlength="1024" autocomplete="off" spellcheck="false"></div><p class="crypto-message" role="status" aria-live="polite"></p><div class="crypto-actions"><button type="button" class="crypto-skip">백업하지 않음</button><button type="button" class="crypto-cancel">취소</button><button type="submit"></button></div></form>';
   const skip=d.querySelector('.crypto-skip');skip.hidden=mode!=='encrypt';
   const form=d.querySelector('form'),pw=d.querySelector('#recordCryptoPassword'),confirm=d.querySelector('#recordCryptoConfirm'),message=d.querySelector('.crypto-message'),submit=d.querySelector('[type=submit]'),cancel=d.querySelector('.crypto-cancel');
   d.querySelector('h2').textContent=mode==='encrypt'?'암호화 JSON 백업':'암호화 백업 열기';
   d.querySelector('.crypto-description').textContent=mode==='encrypt'?'12자 이상의 긴 비밀번호를 설정하세요. 암호화가 끝나면 파일 저장 버튼을 눌러 주세요.':'이 파일을 만들 때 사용한 백업 비밀번호를 입력하세요.';
   d.querySelector('.crypto-confirm').hidden=mode!=='encrypt';confirm.required=mode==='encrypt';if(mode==='encrypt')pw.minLength=12;
   if(mode==='encrypt'&&allowSkip)d.querySelector('.crypto-description').textContent+=' 백업하지 않음을 누르면 파일 없이 다음 작업을 계속하고, 취소를 누르면 작업을 중단합니다.';
   submit.textContent=mode==='encrypt'?'암호화 준비':'백업 열기';
   let busy=false,ready=null,finished=false;
   function close(result){if(finished)return;finished=true;pw.value=confirm.value='';ready=null;active=false;d.close();d.remove();style.remove();resolve(result);}
   skip.onclick=()=>{if(!busy)close('skip');};
   cancel.onclick=()=>close(null);d.addEventListener('cancel',e=>{e.preventDefault();if(!busy)close(null);});d.addEventListener('close',()=>{if(!finished)close(null);});
   form.onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    if(ready){
     let url;
     try{url=URL.createObjectURL(new Blob([JSON.stringify(ready,null,2)],{type:'application/json;charset=utf-8'}));const a=root.document.createElement('a');a.href=url;a.download=filename.replace(/[\\/:*?"<>|]/g,'_').replace(/\.json$/i,'')+'_암호화.json';d.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);close(true);}
     catch(err){if(url)URL.revokeObjectURL(url);message.textContent='다운로드를 시작하지 못했습니다: '+err.message;}
     return;
    }
    if(mode==='encrypt'&&(pw.value.length<12||pw.value!==confirm.value)){message.textContent=pw.value.length<12?'비밀번호를 12자 이상 입력하세요.':'두 비밀번호가 일치하지 않습니다.';return;}
    busy=true;skip.disabled=submit.disabled=cancel.disabled=pw.disabled=confirm.disabled=true;message.textContent=mode==='encrypt'?'암호화 중…':'비밀번호 확인 중…';
    try{
     const result=await operation(pw.value);pw.value=confirm.value='';
     if(mode==='decrypt'){close(result);return;}
     ready=result;pw.required=confirm.required=false;d.querySelectorAll('label,input,.crypto-confirm').forEach(el=>el.hidden=true);submit.textContent='암호화 JSON 저장';message.textContent='암호화가 완료되었습니다. 아래 버튼을 눌러 파일을 저장하세요.';
    }catch(err){message.textContent=err.message;pw.value=confirm.value='';}
    finally{busy=false;skip.disabled=submit.disabled=cancel.disabled=pw.disabled=confirm.disabled=false;if(!finished)(ready?submit:pw).focus();}
   };
   try{root.document.head.append(style);root.document.body.append(d);d.showModal();pw.focus();}catch(err){active=false;d.remove();style.remove();reject(err);}
  });
 }
 async function download(payload,filename='생기부_백업.json',{allowSkip=false}={}){
  try{cryptoAPI();const snapshot=JSON.stringify(payload);const result=await dialog('encrypt',password=>encrypt(JSON.parse(snapshot),password),filename,allowSkip);return result===true||(allowSkip&&result==='skip');}
  catch(err){root.alert('암호화 백업을 만들지 못했습니다: '+err.message);return false;}
 }
 async function read(text){
  const envelope=parse(text);
  if(envelope?.format!==FORMAT){if(envelope?.ciphertext||String(envelope?.format||'').startsWith('school-record-encrypted'))throw Error('지원하지 않는 암호화 백업입니다.');return envelope;}
  cryptoAPI();inspect(envelope);const result=await dialog('decrypt',password=>decrypt(envelope,password));if(result===null)throw Error('백업 열기를 취소했습니다.');return result;
 }
 root.RecordBackup=Object.freeze({encrypt,decrypt,parse,inspect,download,read,format:FORMAT});
})(globalThis);
