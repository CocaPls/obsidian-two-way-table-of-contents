import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setLanguage,tr} from '../src/i18n';
test('English UI has translations for every literal and preserves supplied title text',()=>{
 setLanguage('en');
 for(const file of ['main','settings','insert-modal','preview']){
  const source=readFileSync(`src/${file}.ts`,'utf8');
  for(const match of source.matchAll(/tr\('([^']*)'/g))assert.ok(!/[가-힣]/.test(tr(match[1])),`${file}: ${match[1]}`);
 }
 assert.equal(tr('{title} 하위 항목 접기·펼치기',{title:'한국어 제목'}),'Toggle descendants of 한국어 제목');
 assert.equal(tr('잘못된 설정: scale'),'Invalid setting: scale');
 setLanguage('ko');assert.equal(tr('목차'),'목차');
});
