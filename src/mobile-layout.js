/* Mobile layout only. Move existing controls so handlers and state remain intact.
   Comment anchors restore their exact desktop positions on viewport changes. */
(function(){
 const app=document.documentElement.dataset.app;
 const by=id=>document.getElementById(id),q=s=>document.querySelector(s);
 const media=matchMedia('(max-width:760px)'),moves=[],rows=[];
 function move(node,row){if(!node)return;const anchor=document.createComment('desktop-position');node.before(anchor);moves.push({node,anchor});row.append(node);}
 function row(parent,nodes,name){const box=document.createElement('div');box.className='mobile311-row '+name;parent.append(box);rows.push(box);nodes.forEach(n=>move(n,box));return box;}
 function restore(){for(const {node,anchor} of moves.reverse()){anchor.replaceWith(node);}moves.length=0;rows.forEach(r=>r.remove());rows.length=0;}
 function update(){
  restore();if(!media.matches)return;
  if(app==='integrated'){
   const bar=q('.combined-toolbar');
   const first=row(bar,[by('activityManageBtn'),by('toggleAllMergedBtn'),by('bulkMergeBtn')],'mobile311-main');
   const second=row(bar,[q('.byte-settings-trigger'),by('inputSizeTrigger'),by('selectedOnly').closest('label'),bar.querySelector('.export-green')],'mobile311-secondary');
   bar.prepend(first,second);
  }else if(app==='macro'){
   const bar=q('.tools'),filters=q('.filters');
   const heading=row(bar,[q('.project-picker'),by('selectedOnly').closest('label')],'mobile312-project');bar.prepend(heading);
   const first=row(filters,[by('search').closest('.field'),by('studentMode'),by('variableMode'),bar.querySelector('.export-green')],'mobile311-search');
   const second=row(filters,[by('status').closest('.field'),by('missing').closest('.field'),q('.student-navigation')],'mobile311-filter');
   // Keep the hidden class-filter field first; rows follow in mobile order.
  }else if(app==='helper'){
   const bar=q('.toolbar'),filters=q('.filters');
   const first=row(bar,[q('.category-set-picker'),by('categoryManageBtn')],'mobile311-category');
   const second=row(bar,[by('studentViewBtn'),by('itemViewBtn'),by('collapseAllBtn'),by('inputSizeTrigger')],'mobile311-views');
   bar.prepend(first,second);
   row(filters,[by('selectedOnly').closest('label'),q('.student-navigation'),bar.querySelector('.export-green')],'mobile311-selection');
  }
 }
 media.addEventListener('change',update);update();
})();
