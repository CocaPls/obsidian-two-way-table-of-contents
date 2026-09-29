import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,blockSettings,buildItems,label,scan,settingsReport,validate} from '../src/model';
import {documentSnapshot,patchBlock,replaceBlock,sectionRange} from '../src/actions';
import {executeCli} from '../src/cli';

test('snapshots and cached headings exclude hidden blocks without shortening sections',()=>{
 const text=['```tw-toc','```','# Public','paragraph','%%','# Hidden','```tw-toc','title: hidden','```','%%','','<!--','# HTML comment','-->','','<div>','# HTML block','</div>','','## Child %% secret %% shown','## Code `%%literal%%`'].join('\n');
 const snap=documentSnapshot(text,DEFAULTS);
 assert.deepEqual(snap.items.map(i=>[i.line,i.text,i.label]),[[2,'Public','Public'],[19,'Child %% secret %% shown','Child  shown'],[20,'Code `%%literal%%`','Code %%literal%%']]);
 assert.equal(snap.blocks.length,1);assert.equal(sectionRange(snap,2)?.text,text.split('\n').slice(2).join('\n'));
 const ghost=[{heading:'Hidden',level:1,position:{start:{line:5}}},...snap.headings];
 assert.deepEqual(buildItems(ghost,text,DEFAULTS),snap.items);
});
test('comment masks respect code, escaped markers, setext and Obsidian heading boundaries',()=>{
 const text=['# Before %% inline unfinished','# Still visible','%%','Hidden setext','====','%%','','    %% literal','','```md','%% literal','```','','## Escaped \\%% literal','## Next','', 'Setext %% private %%','----'].join('\n');
 const snap=documentSnapshot(text,DEFAULTS);
 assert.deepEqual(snap.items.map(i=>i.label),['Before %% inline unfinished','Still visible','Escaped %% literal','Next','Setext ']);
 assert.equal(buildItems([{heading:'Hidden setext',level:1,position:{start:{line:3}}}],text,DEFAULTS).length,0);
 assert.equal(label('Text <!-- private --> `<!--literal-->`'),'Text  <!--literal-->');
 assert.equal(label('**%% private %%shown**'),'shown');
});
test('percent signs in HTML and nested code examples cannot hide later headings',()=>{
 for(const example of ['<div>\n%% literal\n</div>','- example\n\n  ```md\n  %% literal\n  ```','    %% literal']){
  const snap=documentSnapshot('# Before\n\n'+example+'\n\n# After',DEFAULTS);
  assert.deepEqual(snap.items.map(i=>i.label),['Before','After']);
 }
});
test('reset removes invalid and duplicate appearance rows while no-op edits preserve them',()=>{
 const source='# keep\nscale: bad\nscale: nope\ndepth: 9\nfuture: keep\nstyle: bullet';
 assert.equal(patchBlock(source,{},DEFAULTS).source,source);
 assert.equal(patchBlock(source,{},DEFAULTS,true).source,'# keep\nfuture: keep\nstyle: bullet');
 const resetThenEdit=patchBlock(source,{scale:90},DEFAULTS,true);
 assert.equal(blockSettings(resetThenEdit.source,DEFAULTS).settings.scale,90);
 assert.equal((resetThenEdit.source.match(/scale:/g)??[]).length,1);
});
test('provenance distinguishes accepted overrides from rejected raw inputs',()=>{
 const raw={scale:'bad',minLevel:6,maxLevel:2,guides:true},effective=validate(raw).settings;
 const global=settingsReport(effective,raw);
 assert.equal(global.scale.source,'default');assert.equal(global.scale.value,100);
 assert.deepEqual(global.scale.rejectedInputs,[{source:'global',input:'bad',reason:'INVALID_SETTING'}]);
 assert.equal(global.minLevel.source,'default');assert.equal(global.maxLevel.source,'default');assert.equal(global.guides.source,'global');
 const block=blockSettings('scale: 80\nguides: nope',effective),report=settingsReport(block.settings,raw,block);
 assert.equal(report.scale.source,'block');assert.equal(report.scale.value,80);assert.equal(report.guides.source,'global');
 assert.deepEqual(report.guides.rejectedInputs,[{source:'block',input:'nope',reason:'INVALID_OPTION'}]);
});
test('unclosed or mismatched fences are diagnosed and cannot be edited',async()=>{
 for(const text of ['```tw-toc\ndepth: 3','````tw-toc\ndepth: 3\n```','~~~tw-toc\n```']){
  const block=scan(text).blocks[0];assert.equal(block.closed,false);assert.throws(()=>replaceBlock(text,block,''),/닫히지/);
  const result:any=await executeCli('validate',{path:'a.md'},{version:'test',settings:DEFAULTS,globalData:{},errors:[],read:async()=>text});
  assert.equal(result.valid,false);assert.ok(result.diagnostics.some((d:any)=>d.code==='UNCLOSED_BLOCK'&&d.line===1));
 }
 assert.equal(scan('````tw-toc\n\n`````').blocks[0].closed,undefined);
});
