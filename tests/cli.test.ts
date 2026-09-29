import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executeCli,sourceHash} from '../src/cli';
import {DEFAULTS} from '../src/model';
const text='```tw-toc\ndepth: 3\nunknown: x\n```\n# Root\n## Same\none\n## Same\ntwo';
const env={version:'test',settings:{...DEFAULTS},globalData:{},errors:[],read:async(path:string)=>path==='note.md'?text:null};
test('CLI describes included headings and block overrides without inventing view visibility',async()=>{
 const r:any=await executeCli('inspect',{path:'note.md'},env);assert.equal(r.ok,true);assert.equal(r.sourceHash,await sourceHash(text));assert.equal(r.sourceKind,'vault-file');assert.equal(r.headings[1].parentLine,5);
 assert.deepEqual(r.blocks[0].settings.initialDepth,{value:3,source:'block'});assert.equal(r.headings[0].visible,undefined);
 const validation:any=await executeCli('validate',{path:'note.md'},env);assert.equal(validation.valid,false);assert.equal(validation.diagnostics[0].line,3);
});
test('CLI rejects stale source and reads exact duplicated heading section with truncation',async()=>{
 const stale:any=await executeCli('section',{path:'note.md',headingLine:'8',expectedHash:'old'},env);assert.equal(stale.error.code,'STALE_SOURCE');
 const r:any=await executeCli('section',{path:'note.md',headingLine:'8',expectedHash:await sourceHash(text),maxChars:'5'},env);assert.equal(r.text,'## Sa');assert.equal(r.truncated,true);assert.equal(r.startLine,8);
});
test('CLI validates arguments and never falls back to an active file',async()=>{
 for(const [params,code] of [[{},'INVALID_PATH'],[{path:'missing.md'},'FILE_NOT_FOUND'],[{path:'../note.md'},'INVALID_PATH'],[{path:'note.md',typo:'true'},'UNKNOWN_ARGUMENT'],[{path:'note.md',blockLine:'2'},'BLOCK_NOT_FOUND']] as const){const r:any=await executeCli('inspect',params,env);assert.equal(r.error.code,code);}
});
test('CLI block only writes explicit overrides and rejects malformed numbers or multiline titles',async()=>{
 const r:any=await executeCli('block',{depth:'3',title:'목차'},env);assert.equal(r.block,'```tw-toc\ntitle: "목차"\ndepth: 3\n```\n');
 for(const p of ([{depth:'3garbage'},{depth:'7'},{depth:'3.5'},{branches:'yes'},{title:'one\ntwo'}] as Record<string,string>[])){const bad:any=await executeCli('block',p,env);assert.equal(bad.ok,false);}
});
test('export and section operations do not invoke any writing capability',async()=>{
 const r:any=await executeCli('export',{path:'note.md',style:'text'},env);assert.match(r.text,/1\.1\. Same/);
 const markdown:any=await executeCli('export',{path:'note.md'},env);assert.deepEqual(markdown.warnings,['DUPLICATE_HEADING_LINKS']);
});
