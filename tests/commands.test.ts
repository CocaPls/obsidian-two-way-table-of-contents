import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pluginHarness,notices} from './plugin-harness';
test('human commands have unique stable IDs; availability checks do not execute actions',()=>{
 const p=pluginHarness(),commands:any[]=[];let executed=0;
 p.addCommand=(c:any)=>commands.push(c);p.app={workspace:{getActiveViewOfType:()=>null}};p.runAction=()=>executed++;
 p.registerActions();assert.equal(new Set(commands.map(c=>c.id)).size,15);
 for(const c of commands)assert.equal(c.checkCallback(true),c.id==='show-options');assert.equal(executed,0);
 commands.find(c=>c.id==='show-options').checkCallback(false);assert.equal(executed,1);
});
test('unrelated settings changes preserve unknown and invalid persisted values',async()=>{
 const p=pluginHarness();p.globalData={future:'keep',scale:'bad',minLevel:2};p.savedSettings={...p.settings};p.settings.guides=true;
 let saved:any;p.saveData=async(data:any)=>{saved=data;};await p.saveSettings();
 assert.equal(saved.future,'keep');assert.equal(saved.scale,'bad');assert.equal(saved.guides,true);assert.ok(p.settingsErrors.length>0);
});
test('next/previous use the editor source and do not modify it',async()=>{
 const p=pluginHarness(),file={path:'note.md'},text='# A\nbody\n## B\nbody';let line=1;
 const editor={getValue:()=>text,getCursor:()=>({line,ch:0}),setCursor:(pos:any)=>{line=pos.line;},scrollIntoView:()=>{},focus:()=>{}};
 const view={file,editor,getMode:()=> 'source'};p.app={vault:{read:async()=>text}};
 await p.runAction('next-heading',view);assert.equal(line,2);
 await p.runAction('previous-heading',view);assert.equal(line,0);
 line=3;await p.runAction('previous-heading',view);assert.equal(line,2);
});
test('command stops if the note switches while its source is read',async()=>{
 const p=pluginHarness(),file={path:'a.md'},view={file,getMode:()=> 'preview',getEphemeralState:()=>({scroll:0})};
 p.app={vault:{read:async()=>{view.file={path:'b.md'};return '# A';}}};
 const before=notices.length;await p.runAction('next-heading',view);assert.ok(notices.slice(before).some(s=>s.includes('문서가 바뀌었습니다')));
});
