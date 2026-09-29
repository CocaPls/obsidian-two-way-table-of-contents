import {APPEARANCE_KEYS,BLOCK_KEYS,blockSettings,buildItems,insertionBlock,scan,Settings,TocBlock,TocOverrides,Item} from './model';
import {parseSource} from './source';
import {TocFolding} from './folding';

/** Parse the same immutable source that is returned to callers, never a stale cache. */
export function documentSnapshot(text:string,settings:Settings){
 const parsed=parseSource(text),{tokens}=parsed,excluded=scan(text,parsed),headings=[];
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i];
  if(token.type==='heading_open'&&token.map&&!excluded.excluded.has(token.map[0]))headings.push({heading:tokens[i+1].content,level:Number(token.tag.slice(1)),position:{start:{line:token.map[0]},end:{line:token.map[1]-1}}});
 }
 return {text,headings,blocks:excluded.blocks,items:buildItems(headings,text,settings,excluded.excluded)};
}
export function patchBlock(source:string,overrides:TocOverrides,base:Settings,reset=false){
 const validation=insertionBlock(overrides,base);if(validation.errors.length)return {source,errors:validation.errors};
 const before=blockSettings(source,base).overrides;
 const changed=APPEARANCE_KEYS.filter(k=>reset||Object.prototype.hasOwnProperty.call(before,k)!==Object.prototype.hasOwnProperty.call(overrides,k)||before[k]!==overrides[k]);
 if(!changed.length)return {source,errors:[]};
 const rows=(source?source.split('\n'):[]).filter(row=>{const key=row.trim().match(/^([^:#]+):/)?.[1].trim();return !key||!changed.includes(BLOCK_KEYS[key] as typeof changed[number]);});
 const additions=insertionBlock(Object.fromEntries(changed.filter(k=>k in overrides).map(k=>[k,overrides[k]])),base).block.split('\n').slice(1,-2);
 return {source:[...rows,...additions].join('\n'),errors:[]};
}
export function replaceBlock(text:string,block:TocBlock,source:string){
 const eol=text.includes('\r\n')?'\r\n':'\n',rows=text.split(/\r?\n/),end=block.endLine??block.line;
 const open=rows[block.line]?.match(/^ {0,3}(`{3,}|~{3,})/),close=rows[end]?.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
 const closing=block.closed!==false&&open&&close&&end>block.line&&open[1][0]===close[1][0]&&close[1].length>=open[1].length;
 if(!closing)throw new Error('닫히지 않은 목차 블록은 먼저 닫아 주세요.');
 rows.splice(block.line+1,end-block.line-1,...(source?source.split(/\r?\n/):[]));return rows.join(eol);
}
export function sectionRange(snapshot:ReturnType<typeof documentSnapshot>,line:number){
 const heading=snapshot.headings.find(h=>h.position.start.line===line);if(!heading)return null;
 const end=snapshot.headings.find(h=>h.position.start.line>line&&h.level<=heading.level)?.position.start.line??snapshot.text.split('\n').length;
 return {start:line,end,text:snapshot.text.split('\n').slice(line,end).join('\n')};
}
export function tocText(items:Item[],style:'markdown'|'text',link:(item:Item)=>string){
 const tree=new TocFolding();tree.update(items,0);
 return tree.nodes.map((node,index)=>{
  let depth=0,parent=node.parent;while(parent>=0){depth++;parent=tree.nodes[parent].parent;}
  const item=items[index];
  return `${'  '.repeat(depth)}${style==='markdown'?'- ':''}${item.number} ${style==='markdown'?markdownLink(item,link(item)):item.label}`;
 }).join('\n');
}
export function headingLink(path:string,item:Item){return encodeURI(path).replace(/[#?()[\]]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`)+'#'+encodeURIComponent(item.text).replace(/[()]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);}
export function duplicateLinks(items:Item[]){const seen=new Set<string>();return items.some(i=>{const duplicate=seen.has(i.text);seen.add(i.text);return duplicate;});}

export function markdownLink(item:Item,href:string){return `[${item.label.replace(/[\\`*_[\]<>]/g,'\\$&')}](${href})`;}
