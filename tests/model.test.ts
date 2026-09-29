import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,buildItems,blockSettings,scan,validate,color,label,headingRange,insertionBlock,insertionTouchesProperties} from '../src/model';
const heads=(levels:number[],texts?:string[])=>levels.map((level,line)=>({level,heading:texts?.[line]??'제목',position:{start:{line}}}));
test('defaults: numbers off, auto unfold off',()=>{assert.equal(DEFAULTS.numbering,false);assert.equal(DEFAULTS.expandOnNavigate,false);});
test('number sequence and missing levels',()=>{assert.deepEqual(buildItems(heads([2,4,3,4,2]),'a\nb\nc\nd\ne',{...DEFAULTS,minLevel:2,maxLevel:4}).map(i=>i.number),['1.','1.1.1.','1.2.','1.2.1.','2.']);});
test('first deep heading starts with filled ancestors',()=>assert.equal(buildItems(heads([4]),'a',{...DEFAULTS,minLevel:2,maxLevel:4})[0].number,'1.1.1.'));
test('range starts at H3, ignored heading does not reset',()=>{assert.deepEqual(buildItems(heads([3,4,2,3,6]),'a\nb\nc\nd\ne',{...DEFAULTS,minLevel:3,maxLevel:5}).map(i=>i.number),['1.','1.1.','2.']);});
test('manual numbers are never stripped',()=>assert.equal(buildItems(heads([2],['2. 3.1 운동']),'a',DEFAULTS)[0].label,'2. 3.1 운동'));
test('frontmatter, quoted headers, and fence examples excluded',()=>{const text='---\ntitle: hi\n---\n> ## callout\n````markdown\n```tw-toc\n```\n````\n```tw-toc\ntitle: okay\n```\n## yes';const r=scan(text);assert.deepEqual(r.blocks,[{line:8,source:'title: okay',endLine:10}]);assert.equal(buildItems([{level:2,heading:'callout',position:{start:{line:3}}},{level:2,heading:'yes',position:{start:{line:11}}}],text,DEFAULTS).length,1);});
test('duplicate headings stay distinct by line',()=>{const r=buildItems(heads([2,2],['동일','동일']),'a\nb',DEFAULTS);assert.deepEqual(r.map(i=>i.line),[0,1]);});
test('settings reject arbitrary keys, object poison and invalid types',()=>{const r=validate(JSON.parse('{"__proto__":{"polluted":true},"numbering":"false","minLevel":99,"background":"url(https://example.com)"}'));assert.equal(r.errors.length,4);assert.deepEqual(r.settings,DEFAULTS);assert.equal(({} as any).polluted,undefined);});
test('inverted range falls back',()=>{assert.equal(validate({minLevel:5,maxLevel:2}).settings.minLevel,1);});
test('block grammar preserves colon and # in title and handles false',()=>{const r=blockSettings('title: A: B # C\nborder: false\nbackground: #12ab34',DEFAULTS);assert.equal(r.settings.title,'A: B # C');assert.equal(r.settings.border,false);assert.equal(r.errors.length,0);});
test('empty title and literal HTML are data',()=>{assert.equal(blockSettings('title:',DEFAULTS).settings.title,'');assert.equal(blockSettings('title: <img onerror=alert(1)>',DEFAULTS).settings.title,'<img onerror=alert(1)>');});
test('large option body rejected',()=>assert.equal(blockSettings('x'.repeat(9000),DEFAULTS).errors.length,1));
test('only explicit colors accepted',()=>{assert.ok(color('#AABBCC'));assert.ok(color('transparent'));assert.equal(color('red; background:url(x)'),false);});
test('labels retain text while nested links become plain labels',()=>assert.equal(label('[[도서관|책방]] [안내](https://example.com)'),'책방 안내'));

test('position migration defaults to left and accepts endpoints and decimals',()=>{assert.equal(validate({title:'Old settings'}).settings.position,0);for(const position of [0,12.5,50,100])assert.equal(validate({position}).settings.position,position);});
test('invalid positions fall back rather than overflow',()=>{for(const position of [-1,100.1,NaN,Infinity,'50',null]){const r=validate({position},{...DEFAULTS,position:25});assert.equal(r.settings.position,25);assert.equal(r.errors.length,1);}});
test('block position accepts numbers and percent notation',()=>{for(const [raw,value] of [['0',0],['50%',50],['12.5',12.5],['100',100]] as const)assert.equal(blockSettings('position: '+raw,DEFAULTS).settings.position,value);for(const raw of ['','-1','101','NaN','calc(50%)'])assert.equal(blockSettings('position: '+raw,DEFAULTS).errors.length,1);});
test('scale defaults to 100 percent and accepts percent notation',()=>{
 assert.equal(validate({title:'Old settings'}).settings.scale,100);
 for(const [raw,value] of [['25',25],['80%',80],['100',100],['125.5',125.5],['200',200]] as const)assert.equal(blockSettings('scale: '+raw,DEFAULTS).settings.scale,value);
 for(const scale of [0,24.9,200.1,NaN,Infinity,'80',null]){const r=validate({scale},{...DEFAULTS,scale:90});assert.equal(r.settings.scale,90);assert.equal(r.errors.length,1);}
 for(const raw of ['','24','201','NaN','calc(80%)'])assert.equal(blockSettings('scale: '+raw,DEFAULTS).errors.length,1);
});

test('manual-number replacement is a global setting and not a TOC override',()=>{
 assert.equal(validate({}).settings.replaceManualNumbering,false);
 assert.equal(validate({replaceManualNumbering:'true'}).errors.length,1);
 assert.equal(blockSettings('replaceManualNumbering: true',DEFAULTS).errors.length,1);
});
test('replacement accepts only a leading dotted number followed by space',()=>{
 const texts=['2. 안내','2.1. 안내','2.1.1.\t안내','2026년 계획','3·1 운동','2.1 안내','2.안내','v2. 안내','1984. 작품 해설'];
 const result=buildItems(heads(texts.map(()=>2),texts),texts.join('\n'),{...DEFAULTS,replaceManualNumbering:true});
 assert.deepEqual(result.map(i=>i.label),['안내','안내','안내','2026년 계획','3·1 운동','2.1 안내','2.안내','v2. 안내','작품 해설']);
 assert.deepEqual(result.map(i=>i.text),texts);
});
test('replacement removes one prefix and preserves remaining formatting and numbering identity',()=>{
 const texts=['9. **소개**','7. [안내](https://example.com)','3. 2. 대상'];
 const result=buildItems(heads([2,3,2],texts),texts.join('\n'),{...DEFAULTS,minLevel:2,maxLevel:4,replaceManualNumbering:true});
 assert.deepEqual(result.map(i=>i.label),['소개','안내','2. 대상']);
 assert.deepEqual(result.map(i=>i.number),['1.','1.1.','2.']);
 assert.equal(result[0].text,'9. **소개**');
});
test('replacement can clean TOC labels independently of body numbering',()=>{
 assert.equal(buildItems(heads([2],['7. 소개']),'x',{...DEFAULTS,numbering:false,replaceManualNumbering:true})[0].label,'소개');
});

test('default range covers H1 through H6 and saved narrower range is preserved',()=>{
 assert.equal(DEFAULTS.minLevel,1);assert.equal(DEFAULTS.maxLevel,6);
 assert.equal(buildItems(heads([1,2,3,4,5,6]),'a\nb\nc\nd\ne\nf',DEFAULTS).length,6);
 const old=validate({minLevel:2,maxLevel:4,numbering:false}).settings;
 assert.equal(old.minLevel,2);assert.equal(old.maxLevel,4);assert.equal(old.numbering,false);
});
test('legacy style, link and return choices are accepted but absent from executable settings',()=>{
 for(const style of ['number','bullet','none'])for(const links of ['marker','title','none'])for(const returnLink of [true,false]){
  const r=validate({style,links,returnLink,position:50});assert.deepEqual(r.errors,[]);
  assert.deepEqual(r.settings,{...DEFAULTS,position:50});
  const b=blockSettings(`style: ${style}\nlinks: ${links}`,DEFAULTS);assert.deepEqual(b.errors,[]);assert.deepEqual(b.settings,DEFAULTS);
 }
 assert.equal(validate({style:'bogus',links:true,returnLink:'false'}).errors.length,3);
 assert.equal(blockSettings('returnLink: false',DEFAULTS).errors.length,1);
});
test('range drafts reject incomplete or invalid pairs without changing the saved range',()=>{
 const saved={...DEFAULTS,minLevel:2,maxLevel:4};
 for(const pair of [['','4'],['2',''],['1.5','4'],['0','4'],['1','7'],['5','4'],['NaN','6']]){
  const result=headingRange(pair[0],pair[1],saved);assert.ok(result.errors.length);assert.deepEqual(result.settings,saved);
 }
 for(const [a,b] of [['1','6'],['3','3'],[' 2 ',' 5 ']]){
  const result=headingRange(a,b,saved);assert.deepEqual(result.errors,[]);assert.equal(result.settings.minLevel,Number(a));assert.equal(result.settings.maxLevel,Number(b));
 }
});

test('insert with defaults stores an empty block and preserves inheritance',()=>{
 const result=insertionBlock({},DEFAULTS);assert.deepEqual(result,{block:'```tw-toc\n```\n',errors:[]});
 const modified={...DEFAULTS,title:'Changed globally',position:40,scale:80};
 assert.equal(blockSettings('',modified).settings.title,'Changed globally');
 assert.equal(blockSettings('',modified).settings.scale,80);
});
test('insertion stores only requested overrides and round-trips special title text',()=>{
 const overrides={title:'  "인용" : # 문구 `기호`  ',border:false,position:37.5,scale:80};
 const result=insertionBlock(overrides,DEFAULTS);assert.deepEqual(result.errors,[]);
 assert.equal(result.block.includes('numbering'),false);assert.equal(result.block.includes('background'),false);
 const source=result.block.split('\n').slice(1,-2).join('\n'),settings=blockSettings(source,{...DEFAULTS,background:'#112233'}).settings;
 assert.equal(settings.title,overrides.title);assert.equal(settings.position,37.5);assert.equal(settings.border,false);assert.equal(settings.background,'#112233');
 assert.equal(settings.scale,80);
});
test('insertion rejects newline injection, invalid appearance and non-appearance settings',()=>{
 for(const value of [{title:'hello\n```\n## injected'}, {position:101}, {scale:201}, {background:'url(x)'}, {numbering:true}]){
  const result=insertionBlock(value as any,DEFAULTS);assert.ok(result.errors.length);assert.equal(result.block,'');
 }
 assert.deepEqual(insertionBlock({title:''},DEFAULTS).errors,[]);
});

test('insertion refuses to write inside existing property boundaries',()=>{
 const source='---\ntitle: Keep this\n---\n\n## Body';
 for(const line of [0,1,2])assert.equal(insertionTouchesProperties(source,line),true);
 assert.equal(insertionTouchesProperties(source,3),false);
 assert.equal(insertionTouchesProperties('---\ntitle: unfinished',2),true);
 assert.equal(insertionTouchesProperties('## Plain note',0),false);
});
