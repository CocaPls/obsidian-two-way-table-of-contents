import {labelText,labelParts} from '../src/inline-label';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {label} from '../src/model';

test('heading labels interpret emphasis and code instead of showing delimiters',()=>{
 assert.equal(label('**강조**와 [설명 링크](https://example.com)'),'강조와 설명 링크');
 assert.equal(label('`코드`가 있는 제목'),'코드가 있는 제목');
 assert.equal(label('***굵은 기울임*** ~~취소~~'),'굵은 기울임 취소');
});
test('literal symbols, escaped emphasis and inline code contents stay literal',()=>{
 assert.equal(label('C++ · file_name · 3 * 4'),'C++ · file_name · 3 * 4');
 assert.equal(label('\\*\\*글자\\*\\* `**코드 속 기호**`'),'**글자** **코드 속 기호**');
 assert.equal(label('``a ` b``'),'a ` b');
});
test('links and images contribute their labels, including nested formatting',()=>{
 assert.equal(label('[**안내**](https://example.com/a_(b)) [[문서|책방]]'),'안내 책방');
 assert.equal(label('![그림](https://example.com/a.png) ![[지도.png]]'),'그림 지도.png');
});

test('label parts carry formatting but never a link or HTML instruction',async()=>{
 const {labelParts}=await import('../src/inline-label');
 const parts=labelParts('**굵게** *기울게* ~~취소~~ `코드` [링크](https://example.com)');
 for(const [word,format] of [['굵게','strong'],['기울게','em'],['취소','s'],['코드','code']])assert.ok(parts.some(p=>p.text===word&&p.formats.includes(format as any)));
 assert.ok(parts.filter(p=>p.text==='링크').every(p=>p.formats.length===0));
 assert.equal(label('<img src=x onerror=alert(1)>'),'<img src=x onerror=alert(1)>');
 assert.equal(label('`[[문서|별명]]` \\[대괄호\\]'),'[[문서|별명]] [대괄호]');
});

test('highlight supports nested emphasis while preserving code and escaped markers',()=>{
 assert.equal(labelText(labelParts('==**bold** and `code`==')), 'bold and code');
 assert.deepEqual(labelParts('==**bold**==')[0].formats,['mark','strong']);
 assert.equal(labelText(labelParts('`==code==`')), '==code==');
 assert.equal(labelText(labelParts('\\==literal==')), '==literal==');
 assert.equal(labelText(labelParts('==a `==` b==')), 'a == b');
});
