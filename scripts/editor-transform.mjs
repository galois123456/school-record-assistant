export function transformEditor(editor){
const bridge=`<script>Object.defineProperty(window,'localStorage',{value:window.parent.__recordStorage});window.__recordStorage=window.parent.__recordStorage;<\/script>`;
const inject=html=>html.replace(/<head[^>]*>/i,head=>head+bridge);
for(const app of ['journal','integrated','macro','helper','assessment']) {
 const re=new RegExp(app+":'([A-Za-z0-9+/=]+)'"); const m=editor.match(re); if(!m)throw Error('편집기 모듈 누락: '+app);
 let inner=inject(Buffer.from(m[1],'base64').toString('utf8'));
 editor=editor.replace(m[0],app+":'"+Buffer.from(inner).toString('base64')+"'");
}
editor=inject(editor).replace("version:'2.16'","version:'3.17'").replace('ver2.16 made by yoonsungho','웹 ver3.17 made by yoonsungho')
 .replace('자료는 현재 브라우저의 로컬 저장소에 저장됩니다. 주기적으로 통합 백업해 주세요.','자료는 로그인한 계정에 저장됩니다. 상단의 서버 저장 상태를 확인하고 주기적으로 통합 백업해 주세요.')
 .replace("pending?'저장 중…':'자동 저장됨'","pending?'이 기기 반영 중…':'이 기기 반영됨'");
editor=editor.replace('</body>',`<script>
window.cloudFlush=function(){if(!rosterReady)return;flushSharedRoster();let failed=false;for(const name of Object.keys(frames))if(appApi(name).save()===false)failed=true;saveShell();if(failed)throw Error('편집기 변경 사항을 저장하지 못했습니다. 통합 백업 후 다시 시도하세요.');};
const cloudReady=setInterval(()=>{if(typeof rosterReady!=='undefined'&&rosterReady){clearInterval(cloudReady);parent.cloudEditorReady();}},50);
window.addEventListener('pagehide',()=>window.cloudFlush());
<\/script></body>`);
return editor;
}
