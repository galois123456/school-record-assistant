// Saving progress belongs to the shared cloud status. Keep the action label stable.
export function bindSaveFeedback({button,save,onError}) {
  let generation=0;
  const reset=()=>{generation++;button.removeAttribute('aria-busy');};
  button.onclick=async()=>{
    if(button.disabled)return;
    const ticket=++generation;
    button.disabled=true;button.setAttribute('aria-busy','true');
    try { await save(); }
    catch(error) { if(ticket===generation)onError(error); }
    finally { if(ticket===generation){button.disabled=false;button.removeAttribute('aria-busy');} }
  };
  return reset;
}
