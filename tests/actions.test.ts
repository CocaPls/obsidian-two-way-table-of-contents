import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,scan,blockSettings} from '../src/model';
import {TocFolding,remapFolds} from '../src/folding';
import {documentSnapshot,patchBlock,replaceBlock,sectionRange,tocText,headingLink} from '../src/actions';
test('unchanged blocks keep state across inserted/deleted TOCs without swapping duplicates',()=>{
 const original='```tw-toc\n```\n\n# A\n## B\n',added='```tw-toc\ntitle: New\n```\n\n'+original;
 const state=new TocFolding();state.update(documentSnapshot(original,DEFAULTS).items,0);state.toggle(0);
 const remapped=remapFolds(original,added,scan(original).blocks,scan(added).blocks,new Map([[0,state]]));
 assert.equal(remapped.get(1),state);assert.equal(remapped.get(0),undefined);
 assert.equal(remapFolds(added,original,scan(added).blocks,scan(original).blocks,remapped).get(0),state);
});
test('source changes within a TOC reset only that block',()=>{
 const a='```tw-toc\ntitle: One\n```\n\n```tw-toc\ntitle: Two\n```\n',b=a.replace('One','Changed');
 const first=new TocFolding(),second=new TocFolding();
 const result=remapFolds(a,b,scan(a).blocks,scan(b).blocks,new Map([[0,first],[1,second]]));
 assert.equal(result.get(0),undefined);assert.equal(result.get(1),second);
});
test('edit preserves unknown options, comments, untouched values and CRLF fences',()=>{
 const source='# comment\ntitle: Old\nfuture: keep\nscale: 80%';
 const edited=patchBlock(source,{title:'New',scale:80,initialDepth:3},DEFAULTS);
 assert.equal(edited.errors.length,0);assert.match(edited.source,/# comment\nfuture: keep\nscale: 80%/);assert.match(edited.source,/title: "New"\ndepth: 3/);
 assert.equal(patchBlock(source,{title:'Old',scale:80},DEFAULTS).source,source);
 const text='before\r\n~~~tw-toc\r\n'+source.replaceAll('\n','\r\n')+'\r\n~~~\r\nafter';
 const changed=replaceBlock(text,scan(text).blocks[0],edited.source);
 assert.ok(changed.startsWith('before\r\n~~~tw-toc\r\n'));assert.ok(changed.endsWith('\r\n~~~\r\nafter'));
});
test('invalid, duplicate and ignored legacy options have located diagnostics',()=>{
 const parsed=blockSettings('# hi\ndepth: 2\ndepth: 3\nstyle: bullet\nscale: invalid',DEFAULTS);
 assert.equal(parsed.settings.initialDepth,3);assert.ok(parsed.diagnostics.some(d=>d.code==='DUPLICATE_OPTION'&&d.line===3));
 assert.ok(parsed.diagnostics.some(d=>d.code==='LEGACY_OPTION'&&d.line===4));assert.equal(parsed.errors.length,1);
});
test('snapshot skips properties, code and quotes and supports setext plus section boundaries',()=>{
 const text='---\ntitle: Note\n---\n\n# Root\n## Child\nbody\n```md\n# Code\n```\n> # Quote\n\nPeer\n====\nlast';
 const snap=documentSnapshot(text,DEFAULTS);assert.deepEqual(snap.items.map(i=>i.text),['Root','Child','Peer']);
 assert.equal(sectionRange(snap,4)?.end,12);assert.equal(sectionRange(snap,5)?.end,12);assert.equal(sectionRange(snap,8),null);
});
test('export preserves global numbers, skips levels by actual ancestry and escapes links',()=>{
 const items=documentSnapshot('## Root\n#### [Child]\n### Peer', {...DEFAULTS,minLevel:2}).items;
 const result=tocText(items,'markdown',i=>headingLink('a (1)#b.md',i));
 assert.match(result,/- 1\. \[Root\]/);assert.match(result,/\n  - 1\.1\.1\. \[\\\[Child\\\]\]/);assert.ok(result.includes('a%20%281%29%23b.md#'));
});
test('fold commands are idempotent and reset uses the absolute level',()=>{
 const f=new TocFolding();f.update(documentSnapshot('## A\n#### B\n### C',DEFAULTS).items,3);
 f.set('expand');f.set('expand');assert.ok(f.nodes.every(n=>!n.hidden));
 f.set('collapse');f.set('collapse');assert.deepEqual(f.nodes.map(n=>n.hidden),[false,true,true]);
 f.set('reset');assert.deepEqual(f.nodes.map(n=>n.hidden),[false,true,false]);
});
test('no-op editing preserves leading blanks; resetting overrides preserves unknown rows',()=>{
 const source='\n# note\ntitle: Old\nfuture: 1\n';
 assert.equal(patchBlock(source,{title:'Old'},DEFAULTS).source,source);
 assert.equal(patchBlock(source,{},DEFAULTS).source,'\n# note\nfuture: 1\n');
});

test('an inserted identical TOC never inherits the old block state',()=>{
 const text='```tw-toc\n```\n\n# Heading',next='```tw-toc\n```\n\n'+text,state=new TocFolding();
 const result=remapFolds(text,next,scan(text).blocks,scan(next).blocks,new Map([[0,state]]));
 assert.equal(result.size,0);
});
