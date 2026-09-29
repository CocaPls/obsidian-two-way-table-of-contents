import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TocFolding} from '../src/folding';
import {buildItems,DEFAULTS,blockSettings,insertionBlock,setTransparent,percentage,headingLimit} from '../src/model';
const items=(levels=[2,3,4,3,2],names=levels.map((_,i)=>`Title ${i}`),offset=0)=>buildItems(levels.map((level,i)=>({level,heading:names[i],position:{start:{line:i+offset}}})),'\n'.repeat(30),{...DEFAULTS,minLevel:2});
test('folding follows real ancestry, including missing levels and first deep headings',()=>{
 const f=new TocFolding();f.update(items([4,2,4,3,2]),1);
 assert.deepEqual(f.nodes.map(n=>[n.parent,n.children]),[[-1,[]],[-1,[2,3]],[1,[]],[1,[]],[-1,[]]]);
 assert.deepEqual(f.nodes.map(n=>n.hidden),[false,false,true,true,false]);
});
test('return reveals target path without unfolding unrelated siblings or branches',()=>{
 const f=new TocFolding(),source=items([2,3,4,3,2,3]);f.update(source,1);
 f.reveal(2);assert.deepEqual(f.nodes.map(n=>n.hidden),[false,false,false,true,false,true]);
 assert.deepEqual(f.nodes.map(n=>n.item.number),source.map(i=>i.number));
 f.update(source,0);assert.ok(f.nodes.every(n=>!n.hidden));
});
test('collapse survives shifted source lines, title edits and deletion',()=>{
 const f=new TocFolding();f.update(items(),0);f.toggle(0);
 f.update(items(undefined,undefined,4),0);assert.equal(f.nodes[1].hidden,true);
 f.update(items(undefined,['Renamed','Title 1','Title 2','Title 3','Title 4'],4),0);assert.equal(f.nodes[1].hidden,true);
 f.update(items([2,3],['Renamed','Title 3'],8),0);assert.equal(f.nodes[1].hidden,true);assert.equal(f.nodes.length,2);
});
test('duplicate headings have independent fold state; separate TOCs remain independent',()=>{
 const a=new TocFolding(),b=new TocFolding(),source=items([2,3,2,3],['Same','Child','Same','Child']);
 a.update(source,0);b.update(source,0);a.toggle(2);a.update(source,0);
 assert.equal(a.nodes[1].hidden,false);assert.equal(a.nodes[3].hidden,true);assert.equal(b.nodes[3].hidden,false);
});
test('changed initial heading limit resets view state, unchanged settings preserve it',()=>{
 const f=new TocFolding();f.update(items(),1);f.toggle(0);f.update(items(),1);assert.equal(f.nodes[1].hidden,false);
 f.update(items(),2);assert.equal(f.nodes[1].hidden,true);
});
test('folding options inherit and round-trip; invalid depths are rejected',()=>{
 const block=insertionBlock({branches:false,initialDepth:2},DEFAULTS);assert.equal(block.errors.length,0);
 const result=blockSettings(block.block.split('\n').slice(1,-2).join('\n'),DEFAULTS);
 assert.equal(result.settings.branches,false);assert.equal(result.settings.initialDepth,2);
 for(const value of ['-1','7','1.5','all'])assert.equal(blockSettings(`depth: ${value}`,DEFAULTS).errors.length,1);
});
test('transparent toggle restores the chosen color, including alpha',()=>{
 const s={...DEFAULTS,background:'#12345678'};setTransparent(s,true);assert.equal(s.background,'transparent');setTransparent(s,false);assert.equal(s.background,'#12345678');
});
test('percentage validation keeps decimal values and rejects incomplete or nonfinite input',()=>{
 assert.equal(percentage('90.5',25,200),90.5);
 for(const value of ['', ' ', '24', '201', 'Infinity','NaN'])assert.equal(percentage(value,25,200),null);
});

test('heading limit uses absolute H levels, with all expanded by default',()=>{
 const f=new TocFolding();f.update(items([2,3,4,2,3]),DEFAULTS.initialDepth);
 assert.ok(f.nodes.every(n=>!n.hidden));
 f.update(items([2,3,4,2,3]),3);
 assert.deepEqual(f.nodes.map(n=>n.hidden),[false,false,true,false,false]);
 f.update(items([2,3,4,2,3]),1);
 assert.deepEqual(f.nodes.filter(n=>n.parent<0).map(n=>[n.item.level,n.hidden]),[[2,false],[2,false]]);
 f.update(items([2,3,4,2,3]),6);assert.ok(f.nodes.every(n=>!n.hidden));
});
test('skipped H4 folds without hiding a following H3; toggle opens missing children first',()=>{
 const f=new TocFolding();f.update(items([2,4,3,4,2,4]),3);
 assert.deepEqual(f.nodes.map(n=>n.hidden),[false,true,false,true,false,true]);
 assert.equal(f.expanded(0),false);f.toggle(0);
 assert.deepEqual(f.nodes.map(n=>n.hidden),[false,false,false,true,false,true]);
 assert.equal(f.expanded(0),true);f.toggle(0);
 assert.deepEqual(f.nodes.map(n=>n.hidden),[false,true,true,true,false,true]);
 f.reveal(3);assert.deepEqual(f.nodes.map(n=>n.hidden),[false,true,false,false,false,true]);
});
test('a previously hidden heading promoted to root remains accessible',()=>{
 const f=new TocFolding();f.update(items([2,4],['Parent','Child']),1);
 f.update(items([4],['Child']),1);assert.equal(f.nodes[0].hidden,false);
});
test('heading limit numeric drafts reject missing, fractional and out-of-range input',()=>{
 for(const raw of ['0','1','3','6',' 3 '])assert.equal(headingLimit(raw),Number(raw));
 for(const raw of ['', ' ', '-1','7','3.5','NaN','Infinity'])assert.equal(headingLimit(raw),null);
});
