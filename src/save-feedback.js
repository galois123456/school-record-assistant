// A manual save gets visible feedback even when autosave already stored everything.
export function bindSaveFeedback({button,save,hasPending,onError,duration=2500}) {
  let generation=0,timer;
  button.setAttribute('aria-live','polite');
  const reset=()=>{generation++;clearTimeout(timer);button.textContent='지금 저장';button.removeAttribute('aria-busy');};
  button.onclick=async()=>{
    if(button.disabled)return;
    const ticket=++generation;clearTimeout(timer);
    button.disabled=true;button.textContent='저장 중…';button.setAttribute('aria-busy','true');
    try {
      await save();
      if(ticket!==generation)return;
      button.textContent=hasPending()?'추가 변경 저장 중…':'저장 완료 ✓';
    } catch(error) {
      if(ticket!==generation)return;
      button.textContent='저장 실패 · 재시도';onError(error);
    } finally {
      if(ticket===generation){
        button.disabled=false;button.removeAttribute('aria-busy');
        if(button.textContent!=='저장 실패 · 재시도')timer=setTimeout(()=>{if(ticket===generation)button.textContent='지금 저장';},duration);
      }
    }
  };
  return reset;
}
