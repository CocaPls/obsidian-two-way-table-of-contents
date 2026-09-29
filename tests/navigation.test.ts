import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pluginHarness,PreviewElement} from './plugin-harness';

function scenario(change:(p:any,v:any)=>void){
 const p=pluginHarness(),view={containerEl:{ownerDocument:{visibilityState:'visible'}},file:{path:'first.md'},getMode:()=> 'preview',previewMode:{renderer:null}};
 const model={blocks:[{line:0}],settings:{...p.settings,expandOnNavigate:true}};
 const entry={dataset:{twLine:'12'},classList:{add:()=>{},remove:()=>{}}};
 const toc={querySelectorAll:()=>[{...entry,querySelector:()=>entry}]};
 let painted=0,touched=0;
 p.models.set('first.md',model);p.hosts=new WeakMap([[toc,{line:0,collapsed:true}]]);
 p.move=async()=>{p.navigation++;return true;};
 p.delay=async()=>change(p,view);
 p.hostElements=()=>{touched++;return [toc];};p.paint=()=>painted++;
 return {p,view,painted:()=>painted,touched:()=>touched};
}

for(const [name,change] of [
 ['document switch',(_p:any,v:any)=>{v.file={path:'second.md'};}],
 ['view close',(_p:any,v:any)=>{v.file=null;}],
 ['editing mode',(_p:any,v:any)=>{v.getMode=()=> 'source';}],
 ['new navigation',(p:any)=>{p.navigation++;}],
 ['window hidden',(_p:any,v:any)=>{v.containerEl.ownerDocument.visibilityState='hidden';}],
 ['source or settings change',(p:any)=>{p.revision++;}],
 ['model replaced',(p:any)=>{p.models.set('first.md',{});}],
] as const)test(`TOC return cancels after ${name} during wait`,async()=>{
 const s=scenario(change);await s.p.goBack(s.view,12);
 assert.equal(s.touched(),0);assert.equal(s.painted(),0);
});

test('unchanged TOC return still expands the target',async()=>{
 const s=scenario(()=>{});await s.p.goBack(s.view,12);
 assert.equal(s.touched(),1);assert.equal(s.painted(),1);
});

// Exercise the actual scrolling method, including both asynchronous waits.
function movement(change:(p:any,v:any)=>void,at:number){
 const p=pluginHarness();
 const r={sections:[{start:{line:0},end:{line:20},el:new PreviewElement(),shown:true}],previewEl:new PreviewElement(),
  applyScroll:()=>true,getSectionInfo:()=>null,getFoldInfo:()=>({folds:[],lines:20}),applyFoldInfo:()=>{},queueRender:()=>{}};
 const view={containerEl:{ownerDocument:{visibilityState:'visible'}},file:{path:'note.md'},getMode:()=> 'preview',previewMode:{renderer:r}};
 const model={settings:{...p.settings},headings:[],blocks:[{line:0}]};
 p.models.set('note.md',model);let waits=0,painted=0;
 p.delay=async()=>{if(++waits===at)change(p,view);};p.paint=()=>painted++;
 return {p,view,model,painted:()=>painted};
}
for(const at of [1,2])for(const [name,change] of [
 ['settings/source revision',(p:any)=>{p.revision++;}],
 ['model replacement',(p:any)=>{p.models.set('note.md',{});}],
 ['editing mode',(_p:any,v:any)=>{v.getMode=()=> 'source';}],
 ['document switch',(_p:any,v:any)=>{v.file={path:'other.md'};}],
 ['view close',(_p:any,v:any)=>{v.file=null;}],
 ['new navigation',(p:any)=>{p.navigation++;}],
 ['window hidden',(_p:any,v:any)=>{v.containerEl.ownerDocument.visibilityState='hidden';}],
] as const)test(`movement cancels after ${name} at wait ${at}`,async()=>{
 const s=movement(change,at);assert.equal(await s.p.move(s.view,0,s.model),false);assert.equal(s.painted(),0);
});
test('unchanged movement still paints the current model',async()=>{
 const s=movement(()=>{},0);assert.equal(await s.p.move(s.view,0,s.model),true);assert.equal(s.painted(),1);
});

test('settings invalidate movement before asynchronous persistence finishes',async()=>{
 const p=pluginHarness();let finish:()=>void=()=>{};let scheduled=0;
 p.saveData=()=>new Promise<void>(resolve=>{finish=resolve;});p.schedule=()=>scheduled++;
 const saving=p.saveSettings();assert.equal(p.revision,1);assert.equal(scheduled,1);
 finish();await saving;
});

test('rendered body number has an accessible label and click return',()=>{
 const p=pluginHarness();delete p.paint;
 const attributes=new Map<string,string>(),events=new Map<string,Function>();
 const anchor={dataset:{},setAttribute:(key:string,value:string)=>attributes.set(key,value),addEventListener:(key:string,fn:Function)=>events.set(key,fn)};
 const heading={tagName:'H2',children:[],getAttribute:()=> 'Heading',createEl:()=>anchor,querySelector:()=>null,prepend:()=>{}};
 const r={sections:[],previewEl:new PreviewElement(),getSectionInfo:()=>({lineStart:4,lineEnd:4}),applyScroll:()=>true,getFoldInfo:()=>({folds:[],lines:5}),applyFoldInfo:()=>{},queueRender:()=>{}};
 const view={previewMode:{renderer:r}},model={items:[{line:4,level:2,text:'Heading',number:'1.'}],blocks:[{line:0}],settings:{...p.settings,numbering:true}};
 p.hostElements=()=>[];p.headingElements=()=>[heading];p.manualNumbers={set:()=>false};
 let returned:number|undefined;p.goBack=(v:any,line:number)=>{assert.equal(v,view);returned=line;};
 p.paint(view,model);
 assert.equal(attributes.get('aria-label'),'1. 목차로 돌아가기');
 assert.ok(events.has('click'));events.get('click')!({preventDefault(){},stopPropagation(){}});
 assert.equal(returned,4);
});


test('navigation waits use the owning window and clear its timer on cancellation',async()=>{
 const p=pluginHarness();p.cleanups=new Set();let callback:()=>void=()=>{};let cleared=0,delay=0;
 const win={setTimeout:(fn:()=>void,ms:number)=>{callback=fn;delay=ms;return 42;},clearTimeout:(id:number)=>{assert.equal(id,42);cleared++;}};
 const view={containerEl:{ownerDocument:{defaultView:win,addEventListener(){},removeEventListener(){}}}};
 const waiting=p.delay(40,view);assert.equal(delay,40);assert.equal(p.cleanups.size,1);
 for(const cancel of p.cleanups)cancel();await waiting;assert.equal(cleared,1);assert.equal(p.cleanups.size,0);
 // Running the cancelled callback again is harmless and cannot retain a cleanup.
 callback();assert.equal(p.cleanups.size,0);
});
test('movement passes its view to both waits',async()=>{
 const s=movement(()=>{},0),views:any[]=[];
 s.p.delay=async(_ms:number,view:any)=>{views.push(view);};
 assert.equal(await s.p.move(s.view,0,s.model),true);assert.deepEqual(views,[s.view,s.view]);
});


test('hiding the owning window releases a throttled wait and its resources',async()=>{
 const p=pluginHarness();p.cleanups=new Set();let cleared=0;
 const listeners=new Set<()=>void>();
 const doc={visibilityState:'visible',defaultView:{setTimeout:()=>23,clearTimeout:(id:number)=>{assert.equal(id,23);cleared++;}},
  addEventListener:(_type:string,fn:()=>void)=>listeners.add(fn),removeEventListener:(_type:string,fn:()=>void)=>listeners.delete(fn)};
 const waiting=p.delay(50,{containerEl:{ownerDocument:doc}});
 assert.equal(listeners.size,1);doc.visibilityState='hidden';for(const listener of listeners)listener();
 await waiting;assert.equal(cleared,1);assert.equal(listeners.size,0);assert.equal(p.cleanups.size,0);
 await p.delay(50,{containerEl:{ownerDocument:doc}});assert.equal(listeners.size,0);assert.equal(p.cleanups.size,0);
});
