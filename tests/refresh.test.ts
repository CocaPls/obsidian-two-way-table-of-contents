import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pluginHarness,notices} from './plugin-harness';

test('late heading cache updates replace a model built from old metadata',async()=>{
 const p=pluginHarness(),view={file:{path:'note.md'}};
 const cache={headings:[{heading:'Old title',level:2,position:{start:{line:0}}}]};
 p.app={vault:{cachedRead:async()=> '## New title'},metadataCache:{getFileCache:()=>cache}};
 p.views=()=>[view];
 await p.refresh();assert.equal(p.models.get('note.md').items[0].text,'Old title');
 // The source text has already arrived; only metadata changes this time.
 cache.headings[0].heading='New title';p.revision++;
 await p.refresh();assert.equal(p.models.get('note.md').items[0].text,'New title');
 const stable=p.models.get('note.md');await p.refresh();assert.equal(p.models.get('note.md'),stable);
 cache.headings[0].level=3;cache.headings[0].position.start.line=1;p.revision++;
 await p.refresh();assert.equal(p.models.get('note.md').items[0].level,3);assert.equal(p.models.get('note.md').items[0].line,1);
});

test('document properties never override global settings and are not read',async()=>{
 const p=pluginHarness(),view={file:{path:'note.md'}};
 const cache={headings:[{heading:'Title',level:2,position:{start:{line:4}}}],get frontmatter(){throw Error('Properties must not be read');}};
 p.app={vault:{cachedRead:async()=> '---\ntw-toc-numbering: true\ntw-toc-min-level: 2\n---\n## Title'},metadataCache:{getFileCache:()=>cache}};
 p.views=()=>[view];await p.refresh();const model=p.models.get('note.md');
 assert.equal(model.settings.numbering,false);assert.equal(model.settings.minLevel,1);assert.equal(model.items[0].text,'Title');
});

for(const kind of ['closed','detached','switched','editing'])test(`refresh skips a ${kind} view and continues other views`,async()=>{
 const p=pluginHarness(),first:any={file:{path:'first.md'}},second={file:{path:'second.md'}};
 let active=[first,second];const painted:string[]=[];const before=notices.length;
 p.views=()=>active;p.paint=(v:any)=>painted.push(v.file.path);
 p.app={vault:{cachedRead:async(file:any)=>{
  if(file.path==='first.md'){
   if(kind==='closed')first.file=null;
   if(kind==='switched')first.file={path:'other.md'};
   if(kind==='detached'||kind==='editing')active=[second];
  }
  return '## Title';
 }},metadataCache:{getFileCache:()=>({headings:[]})}};
 await p.refresh();assert.deepEqual(painted,['second.md']);assert.equal(notices.length,before);
});
test('refresh uses captured files if a later view closes during the first read',async()=>{
 const p=pluginHarness(),first={file:{path:'first.md'}},second:any={file:{path:'second.md'}};
 const painted:string[]=[];const before=notices.length;
 p.views=()=>[first,second];p.paint=(v:any)=>painted.push(v.file.path);
 p.app={vault:{cachedRead:async()=>{second.file=null;return '## Title';}},metadataCache:{getFileCache:()=>({headings:[]})}};
 await p.refresh();assert.deepEqual(painted,['first.md']);assert.equal(notices.length,before);
});
