import type {Item} from './model';

export interface TocNode {
 item:Item;
 parent:number;
 children:number[];
 hidden:boolean;
}

/** Per-TOC view state. Source text and numbering never depend on visibility. */
export class TocFolding {
 nodes:TocNode[]=[];
 private initialDepth:number|undefined;
 update(items:Item[],initialDepth:number){
  const old=this.nodes,used=new Set<TocNode>();
  const identity=(item:Item)=>JSON.stringify([item.level,item.text]);
  const candidates=new Map<string,TocNode[]>();
  for(const node of old){const key=identity(node.item);const group=candidates.get(key)??[];group.push(node);candidates.set(key,group);}
  // Match unchanged headings before considering a rename at the same source position.
  const matches=items.map(item=>{const node=candidates.get(identity(item))?.shift();if(node)used.add(node);return node;});
  const reset=this.initialDepth!==initialDepth,stack:number[]=[];
  const nodes:TocNode[]=[];
  for(let i=0;i<items.length;i++){
   const item=items[i];
   while(stack.length&&items[stack[stack.length-1]].level>=item.level)stack.pop();
   const parent=stack.at(-1)??-1;
   let previous=matches[i];
   const samePosition=old[i];
   if(!previous&&old.length===items.length&&samePosition&&!used.has(samePosition)&&samePosition.item.line===item.line&&samePosition.item.level===item.level){previous=samePosition;used.add(previous);}
   nodes.push({item,parent,children:[],hidden:parent>=0&&(!reset&&previous?previous.hidden:initialDepth>0&&item.level>initialDepth)});
   if(parent>=0)nodes[parent].children.push(i);
   stack.push(i);
  }
  this.nodes=nodes;this.initialDepth=initialDepth;
 }
 expanded(index:number){return this.nodes[index].children.every(child=>!this.nodes[child].hidden);}
 toggle(index:number){
  const hide=this.expanded(index);
  for(const child of this.nodes[index].children)this.nodes[child].hidden=hide;
 }
 set(mode:'expand'|'collapse'|'reset',index?:number){
  const descendants=new Set<number>();
  if(index!==undefined){const visit=(i:number)=>{for(const c of this.nodes[i].children){descendants.add(c);visit(c);}};visit(index);}
  for(const [i,node] of this.nodes.entries())if(index===undefined||descendants.has(i))node.hidden=node.parent>=0&&(mode==='collapse'||mode==='reset'&&!!this.initialDepth&&node.item.level>this.initialDepth);
 }
 reveal(line:number){
  const index=this.nodes.findIndex(node=>node.item.line===line);if(index<0)return;
  let current=index;
  while(current>=0){this.nodes[current].hidden=false;current=this.nodes[current].parent;}
 }
}

/** Match only blocks outside the edited source span. Ambiguous blocks reset safely. */
export function remapFolds(oldText:string,text:string,oldBlocks:import('./model').TocBlock[],blocks:import('./model').TocBlock[],states:Map<number,TocFolding>){
 if(oldText===text)return states;
 let prefix=0,suffix=0;
 while(prefix<Math.min(oldText.length,text.length)&&oldText[prefix]===text[prefix])prefix++;
 while(suffix<Math.min(oldText.length,text.length)-prefix&&oldText[oldText.length-1-suffix]===text[text.length-1-suffix])suffix++;
 const offset=(value:string,line:number)=>value.split('\n').slice(0,line).reduce((n,row)=>n+row.length+1,0);
 const result=new Map<number,TocFolding>();
 for(const [index,block] of oldBlocks.entries()){
  // Inserting an identical block can look like an unchanged prefix. Do not guess identity.
  if(oldBlocks.length!==blocks.length&&(oldBlocks.filter(b=>b.source===block.source).length>1||blocks.filter(b=>b.source===block.source).length>1))continue;
  const start=offset(oldText,block.line),end=offset(oldText,(block.endLine??block.line)+1);
  const mapped=end<=prefix?start:start>=oldText.length-suffix?start+text.length-oldText.length:null;
  let next=mapped===null?-1:blocks.findIndex(b=>offset(text,b.line)===mapped&&b.source===block.source);
  if(next<0&&oldBlocks.filter(b=>b.source===block.source).length===1&&blocks.filter(b=>b.source===block.source).length===1)next=blocks.findIndex(b=>b.source===block.source);
  const state=states.get(index);if(next>=0&&state)result.set(next,state);
 }
 return result;
}
