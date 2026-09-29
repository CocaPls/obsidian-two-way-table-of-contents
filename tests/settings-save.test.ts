import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pluginHarness,notices} from './plugin-harness';

test('rapid reversals persist immutable snapshots in request order',async()=>{
 const p=pluginHarness(),writes:any[]=[],finish:(()=>void)[]=[];
 p.saveData=(data:unknown)=>{writes.push(data);return new Promise<void>(resolve=>finish.push(resolve));};
 p.settings.guides=true;const first=p.saveSettings(['guides']);
 p.settings.guides=false;const second=p.saveSettings(['guides']);
 assert.deepEqual(writes.map(w=>w.guides),[true]);
 finish.shift()!();await first;await Promise.resolve();
 assert.deepEqual(writes.map(w=>w.guides),[true,false]);
 finish.shift()!();await second;assert.equal(p.globalData.guides,false);
});
test('explicit default repairs its raw value and preserves unrelated data',async()=>{
 const p=pluginHarness();p.globalData={scale:'bad',position:'bad',future:{keep:true}};
 let saved:any;p.saveData=async(data:unknown)=>{saved=data;};
 await p.saveSettings(['scale']);
 assert.equal(saved.scale,100);assert.equal(saved.position,'bad');assert.deepEqual(saved.future,{keep:true});
});
test('failed persistence reports failure and does not block the next save',async()=>{
 const p=pluginHarness();let attempts=0;
 p.saveData=async()=>{if(++attempts===1)throw new Error('disk');};
 assert.equal(await p.saveSettings(['scale']),false);
 assert.match(notices.at(-1)!,/저장하지 못했습니다/);
 p.settings.scale=90;assert.equal(await p.saveSettings(['scale']),true);assert.equal(attempts,2);
});
