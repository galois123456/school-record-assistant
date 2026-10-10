import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/editor.html',import.meta.url),'utf8');
const helper=Buffer.from(source.match(/helper:'([A-Za-z0-9+/=]+)'/)[1],'base64').toString();
const render=helper.slice(helper.indexOf('function renderCategory('),helper.indexOf('function renderItem('));
function context(settings){
 const document={createElement(){const classes=new Set(),button={};return {style:{setProperty(){}},dataset:{},classList:{add:c=>classes.add(c),contains:c=>classes.has(c),toggle(c){classes.has(c)?classes.delete(c):classes.add(c)}},querySelector:s=>s==='.cat-toggle'?button:{appendChild(){}}};}};
 const c=vm.createContext({document,state:{settings},esc:x=>x,renderItem:()=>({}),scheduleSave(){}});vm.runInContext(render,c);return c;
}
test('individual category stays open after rerender and serialized reload',()=>{
 const c=context({categoriesCollapsed:true}),cat={id:'a',name:'test',color:'#000000',items:[]};
 let section=c.renderCategory(cat,{});assert.equal(section.classList.contains('collapsed'),true);
 section.querySelector('.cat-toggle').onclick();assert.equal(c.state.settings.categoryCollapseStates.a,false);
 section=c.renderCategory(cat,{});assert.equal(section.classList.contains('collapsed'),false);
 const loaded=context(JSON.parse(JSON.stringify(c.state.settings)));assert.equal(loaded.renderCategory(cat,{}).classList.contains('collapsed'),false);
 assert.equal(loaded.renderCategory({...cat,id:'b'},{}).classList.contains('collapsed'),true);
 section.querySelector('.cat-toggle').onclick();assert.equal(c.renderCategory(cat,{}).classList.contains('collapsed'),true);
});
test('collapse-all handler updates per-category overrides',()=>{
 assert.ok(helper.includes('state.settings.categoryCollapseStates[x.dataset.catId]=shouldCollapse'));
});
