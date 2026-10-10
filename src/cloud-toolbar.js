// Keep the original controls as the single action/state source for mobile and loading.
export function attachCloudToolbar(outer, inner) {
  const brand=inner.querySelector('.brand'), roster=inner.getElementById('rosterManager'), settings=inner.getElementById('globalSettingsBtn');
  if(!brand||!roster||!settings)return ()=>{};
  const style=inner.createElement('style');
  style.textContent=`
  .desktop-cloud-status,.desktop-cloud-email,.desktop-cloud-actions{display:none}
  @media(min-width:761px){
    .switchbar .brand{display:flex!important;align-items:center;gap:12px;flex-shrink:0}
    .brand h1{white-space:nowrap}.brand p{display:none}
    .desktop-cloud-status{display:inline-flex;gap:8px;align-items:center;font-size:11px;white-space:nowrap}
    .desktop-cloud-status b{font-size:10px;letter-spacing:1px;color:#2563eb}
    .desktop-cloud-status span{color:#15803d}
    .desktop-cloud-status span[data-state=pending],.desktop-cloud-status span[data-state=saving]{color:#a16207}
    .desktop-cloud-status span[data-state=offline],.desktop-cloud-status span[data-state=error],.desktop-cloud-status span[data-state=conflict]{color:#b91c1c}
    .desktop-cloud-email{display:block;max-width:210px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:#64748b;margin-right:5px}
    .desktop-cloud-actions{display:inline-flex;gap:4px;align-items:center}
    .shell-actions{align-items:center;flex-wrap:wrap;max-width:100%}
    .desktop-cloud-actions .shell-btn{font-size:11px;padding:5px 8px}
    html[data-theme=dark] .desktop-cloud-email{color:#a9bad0}
    html[data-theme=dark] .desktop-cloud-status b{color:#60a5fa}
    html[data-theme=dark] .desktop-cloud-status span{color:#9bcdb1}
    html[data-theme=dark] .desktop-cloud-status span[data-state=pending],html[data-theme=dark] .desktop-cloud-status span[data-state=saving]{color:#fcd34d}
    html[data-theme=dark] .desktop-cloud-status span[data-state=offline],html[data-theme=dark] .desktop-cloud-status span[data-state=error],html[data-theme=dark] .desktop-cloud-status span[data-state=conflict]{color:#fda4af}
  }
  @media(min-width:761px) and (max-width:1450px){.switchbar .shell-actions{flex-basis:100%;justify-content:flex-end;margin-left:0}.switchbar .tabs{margin-left:auto}}
  `;
  inner.head.append(style);
  const stateBox=inner.createElement('span');stateBox.className='desktop-cloud-status';
  const label=inner.createElement('b');label.textContent='CLOUD';
  const state=inner.createElement('span');state.setAttribute('role','status');state.setAttribute('aria-live','polite');stateBox.append(label,state);brand.append(stateBox);
  const email=inner.createElement('span');email.className='desktop-cloud-email';roster.before(email);
  const actions=inner.createElement('span');actions.className='desktop-cloud-actions';settings.after(actions);
  const pairs=['saveBtn','reloadBtn','logoutBtn'].map(id=>{
    const source=outer.getElementById(id),button=inner.createElement('button');
    button.type='button';button.id='desktop-'+id;button.className='shell-btn'+(id==='saveBtn'?' primary':'');
    button.onclick=()=>source.click();actions.append(button);return {source,button};
  });
  function sync(){
    const source=outer.getElementById('syncState'),account=outer.getElementById('userEmail');
    if(state.textContent!==source.textContent)state.textContent=source.textContent;
    state.dataset.state=source.dataset.state||'';
    email.textContent=account.textContent;email.title=account.textContent;
    for(const {source,button} of pairs){button.textContent=source.textContent;button.disabled=source.disabled;button.setAttribute('aria-live','polite');if(source.hasAttribute('aria-busy'))button.setAttribute('aria-busy',source.getAttribute('aria-busy'));else button.removeAttribute('aria-busy');}
  }
  const observer=new outer.defaultView.MutationObserver(sync);
  observer.observe(outer.querySelector('.cloud-bar'),{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','data-state','aria-busy']});
  sync();outer.getElementById('workspace').classList.add('cloud-toolbar-integrated');
  return ()=>{observer.disconnect();outer.getElementById('workspace').classList.remove('cloud-toolbar-integrated');stateBox.remove();email.remove();actions.remove();style.remove();};
}
