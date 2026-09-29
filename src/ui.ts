import {App,FuzzySuggestModal,Modal,Setting} from 'obsidian';
import {tr} from './i18n';
export class Choose<T> extends FuzzySuggestModal<T>{
 private chosen=false;
 constructor(app:App,private items:T[],private label:(item:T)=>string,private done:(item:T|null)=>void,title:string){super(app);this.setPlaceholder(title);}
 getItems(){return this.items;}
 getItemText(item:T){return this.label(item);}
 onChooseItem(item:T){this.chosen=true;this.done(item);}
 onClose(){// Obsidian closes a suggestion before invoking onChooseItem.
  (this.containerEl.ownerDocument.defaultView??window).setTimeout(()=>{if(!this.chosen)this.done(null);},0);
 }
}
export function choose<T>(app:App,items:T[],label:(item:T)=>string,title:string){return new Promise<T|null>(resolve=>new Choose(app,items,label,resolve,title).open());}
export class Information extends Modal {
 constructor(app:App,private title:string,private rows:{name:string;value:string}[]){super(app);}
 onOpen(){this.titleEl.setText(this.title);for(const row of this.rows)new Setting(this.contentEl).setName(row.name).setDesc(row.value);new Setting(this.contentEl).addButton(b=>b.setButtonText(tr('닫기')).onClick(()=>this.close()));}
 onClose(){this.contentEl.empty();}
}
export const OPTION_HELP=[
 ['title','목차 제목 · 한 줄, 최대 200자'],['position','0~100 · 0 왼쪽, 50 가운데, 100 오른쪽'],['scale','25~200 · 글자와 상자 크기 (%)'],['background','transparent 또는 #RRGGBB / #RRGGBBAA'],
 ['border / collapsible / branches / guides','true 또는 false'],['depth','0~6 · 0 전부 펼침, 3 H3까지 펼침'],
].map(([name,value])=>({name,value}));
