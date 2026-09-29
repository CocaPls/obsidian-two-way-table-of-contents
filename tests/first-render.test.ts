import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pluginHarness} from './plugin-harness';

const tick=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
function fixture(){
 const p=pluginHarness(),file={path:'note.md'};
 const host={source:'title: Test',context:{sourcePath:file.path,getSectionInfo:()=>null},collapsed:false};
 const el={closest:()=>null};p.hosts.set(el,host);p.viewForHost=()=>undefined;
 const cache={headings:[{heading:'Title',level:2,position:{start:{line:4}}}]};
 p.app={vault:{getFileByPath:()=>file,cachedRead:async()=> '```tw-toc\n```\n\n\n## Title'},metadataCache:{getFileCache:()=>cache}};
 return {p,file,host,el,cache};
}
test('first TOC fills before scheduled work and without a mounted reading section',async()=>{
 const {p,host,el}=fixture();let painted=0;
 p.paintToc=()=>painted++;p.schedule=()=>{};
 await p.renderInitialHost(el,host);
 assert.equal(painted,1);assert.equal(p.models.get('note.md').items[0].text,'Title');
 // Attachment alone must not clear or rebuild the same TOC.
 p.paintHost(undefined,el,p.models.get('note.md'));assert.equal(painted,1);
});
for(const kind of ['unloaded','file changed','settings changed','plugin stopped'])test(`first render discards work after ${kind}`,async()=>{
 const {p,file,host,el}=fixture();let release:(s:string)=>void=()=>{},painted=0;
 p.app.vault.cachedRead=()=>new Promise<string>(r=>{release=r;});p.paintToc=()=>painted++;
 const pending=p.renderInitialHost(el,host);
 if(kind==='unloaded')p.hosts.delete(el);
 if(kind==='file changed')p.fileRevisions.set(file.path,1);
 if(kind==='settings changed')p.settingsRevision++;
 if(kind==='plugin stopped')p.stopped=true;
 release('## Old');await pending;assert.equal(painted,0);assert.equal(p.models.size,0);
});
test('metadata arriving later fills the existing host through normal refresh',async()=>{
 const {p,file,host,el,cache}=fixture();let metadata:any=null,painted=0;
 p.app.metadataCache.getFileCache=()=>metadata;
 p.paintToc=()=>painted++;await p.renderInitialHost(el,host);assert.equal(painted,0);
 const view={file};p.views=()=>[view];p.paint=(v:any,m:any)=>p.paintHost(undefined,el,m);
 metadata=cache;p.fileRevisions.set(file.path,1);await p.refresh(file.path);
 assert.equal(painted,1);assert.equal(p.models.get(file.path).items.length,1);
});
test('same-file simultaneous requests share a read; unrelated changes do not cancel it',async()=>{
 const {p,file}=fixture();let release:(s:string)=>void=()=>{},reads=0;
 p.app.vault.cachedRead=()=>{reads++;return new Promise<string>(r=>{release=r;});};
 const a=p.loadModel(file),b=p.loadModel(file);p.fileRevisions.set('other.md',1);p.revision++;
 release('## Title');const [first,second]=await Promise.all([a,b]);
 assert.equal(reads,1);assert.ok(first);assert.equal(first,second);
});
test('slow other file does not block a ready reading view',async()=>{
 const p=pluginHarness(),slow={file:{path:'slow.md'}},fast={file:{path:'fast.md'}};let release:(s:string)=>void=()=>{};
 const painted:string[]=[];p.views=()=>[slow,fast];p.paint=(v:any)=>painted.push(v.file.path);
 p.app={vault:{cachedRead:async(f:any)=>f.path==='slow.md'?new Promise<string>(r=>{release=r;}):'## Ready'},metadataCache:{getFileCache:()=>({headings:[]})}};
 const pending=p.refresh();await tick();assert.deepEqual(painted,['fast.md']);
 release('## Slow');await pending;assert.deepEqual(painted,['fast.md','slow.md']);
});
test('targeted refresh does not read unrelated open files',async()=>{
 const p=pluginHarness(),reads:string[]=[];
 p.views=()=>[{file:{path:'a.md'}},{file:{path:'b.md'}}];
 p.app={vault:{cachedRead:async(f:any)=>{reads.push(f.path);return '';}},metadataCache:{getFileCache:()=>({headings:[]})}};
 await p.refresh('b.md');assert.deepEqual(reads,['b.md']);
});
test('initial scheduler request cannot be postponed by an edit or another file',async()=>{
 const p=pluginHarness();delete p.schedule;p.views=()=>[];
 const calls:string[]=[];p.refresh=async(path:string)=>calls.push(path);
 p.schedule('a.md',0);const first=p.timers.get('a.md');p.schedule('a.md',80);p.schedule('b.md',80);
 assert.equal(p.timers.get('a.md'),first);
 await tick();assert.deepEqual(calls,['a.md']);
 for(const timer of p.timers.values())clearTimeout(timer.id);
});
test('edit bursts coalesce per file without cancelling another file',async()=>{
 const p=pluginHarness();delete p.schedule;p.views=()=>[];p.refresh=async()=>{};
 p.schedule('a.md');p.schedule('b.md');const other=p.timers.get('b.md'),first=p.timers.get('a.md');
 p.schedule('a.md');assert.notEqual(p.timers.get('a.md'),first);assert.equal(p.timers.get('b.md'),other);
 for(const timer of p.timers.values())clearTimeout(timer.id);
});

test('metadata notification updates an open TOC automatically, without reopening or manual refresh',async()=>{
 const {p,file,el,host,cache}=fixture();let displayed='';
 p.paintToc=(_el:any,_host:any,model:any)=>{displayed=model.items[0]?.text;};
 const view={file};p.views=()=>[view];p.paint=(_v:any,model:any)=>p.paintHost(undefined,el,model);
 await p.renderInitialHost(el,host);assert.equal(displayed,'Title');
 delete p.schedule;
 cache.headings[0].heading='Edited';p.onMetadataChanged(file);
 assert.equal(displayed,'Title');
 await new Promise(r=>setTimeout(r,110));assert.equal(displayed,'Edited');
});

test('attached reading TOC remains discoverable before renderer section publication',()=>{
 const p=pluginHarness(),el={closest:()=>null};
 const view={containerEl:{querySelectorAll:()=>[el]},previewMode:{renderer:null}};
 assert.equal(p.hostElements(view)[0],el);
});
test('late initial metadata schedules immediate work rather than the edit debounce',()=>{
 const {p,file}=fixture();p.views=()=>[{file}];const requests:any[]=[];p.schedule=(...args:any[])=>requests.push(args);
 p.onMetadataChanged(file);assert.deepEqual(requests,[[file.path,0]]);
});
test('a block attached to editing mode during the first read is not painted',async()=>{
 const {p,host,el}=fixture();let inSource=false,release:(s:string)=>void=()=>{},painted=0;
 el.closest=()=>inSource?{} as any:null;p.app.vault.cachedRead=()=>new Promise<string>(r=>{release=r;});p.paintToc=()=>painted++;
 const pending=p.renderInitialHost(el,host);inSource=true;release('## Title');await pending;assert.equal(painted,0);
});

test('reload reprocesses reading views using the public renderer API after layout is ready',async()=>{
 const p=pluginHarness();let ready=()=>{},rendered=0;
 p.loadData=async()=>null;p.registerMarkdownCodeBlockProcessor=()=>{};p.registerMarkdownPostProcessor=()=>{};
 p.registerEvent=()=>{};p.addCommand=()=>{};p.addSettingTab=()=>{};
 p.views=()=>[{previewMode:{rerender:(full:boolean)=>{assert.equal(full,true);rendered++;}}}];
 p.app={metadataCache:{on:()=>{}},workspace:{on:()=>{},onLayoutReady:(fn:()=>void)=>{ready=fn;}}};
 await p.onload();assert.equal(rendered,0);ready();assert.equal(rendered,1);
 p.stopped=true;ready();assert.equal(rendered,1);
});

test('refresh timers use the visible owner window and migrate pending immediate requests',()=>{
 const p=pluginHarness();delete p.schedule;
 const scheduled:any[]=[],cleared:any[]=[],refreshed:string[]=[];
 const win=(name:string)=>({setTimeout:(run:()=>void,delay:number)=>{scheduled.push({name,run,delay});return scheduled.length;},clearTimeout:(id:number)=>cleared.push([name,id])});
 const main={visibilityState:'hidden',defaultView:win('main')},popout={visibilityState:'visible',defaultView:win('popout')};
 p.views=()=>[{file:{path:'a.md'},containerEl:{ownerDocument:main}}];p.refresh=(path:string)=>refreshed.push(path);
 p.schedule('a.md',0);
 p.views=()=>[{file:{path:'a.md'},containerEl:{ownerDocument:main}},{file:{path:'a.md'},containerEl:{ownerDocument:popout}}];
 p.schedule('a.md',80);
 assert.deepEqual(cleared,[['main',1]]);assert.equal(scheduled[1].name,'popout');assert.equal(scheduled[1].delay,0);
 p.schedule('a.md',80);assert.equal(scheduled.length,2);
 scheduled[1].run();assert.deepEqual(refreshed,['a.md']);assert.equal(p.timers.size,0);
});
