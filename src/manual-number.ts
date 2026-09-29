import {manualPrefix} from './model';

type Part={node:Text;original:string;display:string};
type Change={prefix:string;parts:Part[]};

/** Reversible text-only decoration. Never replaces heading elements or anchors. */
export class ManualNumberDisplay {
 private changes=new Map<HTMLElement,Change>();
 set(heading:HTMLElement,prefix:string):boolean {
  const previous=this.changes.get(heading);
  if(previous?.prefix===prefix&&previous.parts.every(p=>heading.contains(p.node)&&p.node.data===p.display))return false;
  let changed=this.restore(heading);
  if(!prefix)return changed;
  const walker=heading.ownerDocument.createTreeWalker(heading,4);
  const nodes:Text[]=[];let content='';let node:Node|null;
  while((node=walker.nextNode())){
   if(node.parentElement?.closest('.tw-heading-number,.heading-collapse-indicator,.heading-extra,button,[aria-hidden="true"]'))continue;
   nodes.push(node as Text);content+=node.textContent??'';
  }
  const rendered=manualPrefix(content);
  // Markdown may normalize a tab or repeated spaces in the source prefix.
  if(!rendered||rendered.trim()!==prefix.trim())return changed;
  let remaining=rendered.length;const parts:Part[]=[];
  for(const node of nodes){
   if(!remaining)break;
   const original=node.data;const count=Math.min(remaining,original.length);
   if(!count)continue;
   const display=original.slice(count);parts.push({node,original,display});node.data=display;remaining-=count;
  }
  this.changes.set(heading,{prefix,parts});return true;
 }
 private restore(heading:HTMLElement):boolean {
  const change=this.changes.get(heading);if(!change)return false;
  // Do not overwrite text that another renderer/plugin has since changed.
  for(const p of change.parts)if(p.node.data===p.display)p.node.data=p.original;
  this.changes.delete(heading);return true;
 }
 retain(headings:Set<HTMLElement>){for(const heading of this.changes.keys())if(!headings.has(heading))this.restore(heading);}
 restoreAll(){for(const heading of this.changes.keys())this.restore(heading);}
}
