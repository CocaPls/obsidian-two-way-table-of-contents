import {tr} from './i18n';
import {MarkdownView, Notice} from 'obsidian';
export interface Section {start:{line:number};end:{line:number};el:HTMLElement;shown:boolean;headingCollapsed:boolean;level:number;resetCompute():void}
export interface Renderer {sections:Section[];previewEl:HTMLElement;getSectionInfo(el:HTMLElement):{lineStart:number;lineEnd:number}|null;getFoldInfo():{folds:{from:number;to:number}[];lines:number};applyFoldInfo(info:unknown):void;applyScroll(line:number,options?:{highlight?:boolean;center?:boolean}):boolean;queueRender():void}
// Version-sensitive reading-view adapter. No prototype patching or source text changes.
export function renderer(view:MarkdownView):Renderer|null {
 const r=(view.previewMode as unknown as {renderer?:Renderer}).renderer;
 return r&&Array.isArray(r.sections)&&typeof r.applyScroll==='function'&&typeof r.getSectionInfo==='function'&&typeof r.getFoldInfo==='function'&&typeof r.applyFoldInfo==='function'&&typeof r.queueRender==='function'&&!!r.previewEl&&r.previewEl.nodeType===1?r:null;
}
export function lineFor(view:MarkdownView,el:HTMLElement):{lineStart:number;lineEnd:number}|null {return renderer(view)?.getSectionInfo(el)??null;}
export function targetLine(view:MarkdownView,line:number,expand:boolean,headings:{line:number;level:number}[]):number {
 const r=renderer(view);if(!r)return line;
 const stack:typeof headings=[];
 for(const h of headings){if(h.line>line)break;while(stack.length&&stack[stack.length-1].level>=h.level)stack.pop();stack.push(h);}
 const info=r.getFoldInfo();const ancestors=new Set(stack.map(h=>h.line));
 if(expand){const folds=info.folds.filter(f=>!ancestors.has(f.from));if(folds.length!==info.folds.length)r.applyFoldInfo({...info,folds});return line;}
 const hidden=info.folds.filter(f=>ancestors.has(f.from)&&f.from<line).map(f=>f.from);
 return hidden.length?Math.min(...hidden):line;
}
export function scrollToLine(view:MarkdownView,line:number):boolean {
 const r=renderer(view);if(!r){new Notice(tr('이 Obsidian 버전에서는 목차 이동을 사용할 수 없습니다.'));return false;}
 return r.applyScroll(line,{highlight:false,center:false});
}

// Recompute a rendered section after an asynchronously generated TOC changes its height.
export function invalidate(view:MarkdownView,el:HTMLElement):void {
 const r=renderer(view);if(!r)return;
 const section=r.sections.find(s=>s.el===el||s.el.contains(el));
 if(section&&typeof section.resetCompute==='function'){section.resetCompute();r.queueRender();}
}
export function targetVisible(view:MarkdownView,line:number):boolean {
 const r=renderer(view);if(!r)return false;
 const section=r.sections.find(s=>s.start.line<=line&&s.end.line>=line&&s.el.isConnected&&s.shown);
 if(!section)return false;
 const box=section.el.getBoundingClientRect(),pane=r.previewEl.getBoundingClientRect();
 return box.height>0&&box.bottom>pane.top&&box.top<pane.bottom;
}
