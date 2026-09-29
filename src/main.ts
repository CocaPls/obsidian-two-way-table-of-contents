import {tr,setLanguage,settingName} from './i18n';
import {getLanguage,MarkdownView,MarkdownPostProcessorContext,MarkdownRenderChild,Plugin,Notice,TFile,Menu} from 'obsidian';
import {DEFAULTS,Settings,Item,TocBlock,validate,blockSettings,buildItems,scan,manualPrefix,insertionTouchesProperties,settingsReport,tocDiagnostics} from './model';
import {renderer,lineFor,targetLine,scrollToLine,invalidate,targetVisible} from './preview';
import {renderLabel} from './inline-label';
import {ManualNumberDisplay} from './manual-number';
import {TocSettings} from './settings';
import {TocFolding,remapFolds} from './folding';
import {InsertTocModal} from './insert-modal';
import {documentSnapshot,replaceBlock,sectionRange,tocText,headingLink,duplicateLinks,markdownLink} from './actions';
import {choose,Information,OPTION_HELP} from './ui';
import {registerCli} from './cli';
type Model={text:string;headingSignature:string;items:Item[];blocks:TocBlock[];settings:Settings;errors:string[];headings:{line:number;level:number}[]};
type Host={source:string;context:MarkdownPostProcessorContext;signature?:string;collapsed:boolean;line?:number;folding?:TocFolding;syncFolds?:()=>void};
let nextGroupId=0;
const SELECTOR='h1[data-heading],h2[data-heading],h3[data-heading],h4[data-heading],h5[data-heading],h6[data-heading]';
export default class TwoWayToc extends Plugin {
 settings:Settings={...DEFAULTS}; settingsErrors:string[]=[]; globalData:Record<string,unknown>={}; private savedSettings:Settings={...DEFAULTS}; private saveQueue?:Promise<void>; private hosts=new WeakMap<HTMLElement,Host>();
 private folds=new WeakMap<MarkdownView,{path:string;states:Map<number,TocFolding>;text:string;blocks:TocBlock[]}>();private timers=new Map<string,{id:number;delay:number;win:Window}>();
 private stopped=false;private revision=0;private models=new Map<string,Model>();
 private fileRevisions=new Map<string,number>();private settingsRevision=0;
 private reads=new Map<string,{version:number;settings:number;promise:Promise<Model|null>}>();
 private manualNumbers=new ManualNumberDisplay();
 private lastHost=new WeakMap<MarkdownView,HTMLElement>();
 private cleanups=new Set<()=>void>();private navigation=0;
 async onload(){
  setLanguage(getLanguage());
  const data:unknown=await this.loadData();
  this.globalData=data&&typeof data==='object'&&!Array.isArray(data)?data as Record<string,unknown>:{};
  const checked=validate(this.globalData,{...DEFAULTS,title:tr('목차')});this.settings=checked.settings;this.settingsErrors=checked.errors;this.savedSettings={...this.settings};
  this.registerMarkdownCodeBlockProcessor('tw-toc',(source,el,ctx)=>{
   const host:Host={source,context:ctx,collapsed:false};this.hosts.set(el,host);el.classList.add('tw-toc-host');
   const child=new MarkdownRenderChild(el);child.onunload=()=>{this.hosts.delete(el);this.schedule(ctx.sourcePath);};ctx.addChild(child);
   // Fill the supplied block during its first render; do not wait for the workspace debounce.
   return this.renderInitialHost(el,host);
  });
  this.registerMarkdownPostProcessor((_el,ctx)=>this.schedule(ctx.sourcePath,0));
  this.registerEvent(this.app.metadataCache.on('changed',file=>this.onMetadataChanged(file)));
  this.registerEvent(this.app.workspace.on('layout-change',()=>this.schedule()));
  this.registerEvent(this.app.workspace.on('active-leaf-change',()=>this.schedule()));
  this.addCommand({id:'insert-toc',name:tr('목차 삽입'),editorCallback:(editor,context)=>{
   const original=editor.getValue(),path=context.file?.path,cur=editor.getCursor();
   if(insertionTouchesProperties(original,cur.line)){new Notice(tr('문서 속성 아래의 본문에 커서를 두고 실행하세요.'));return;}
   new InsertTocModal(this.app,this.settings,block=>{
    if(this.stopped||context.file?.path!==path||editor.getValue()!==original){new Notice(tr('문서가 바뀌었습니다. 삽입할 위치에서 목차 삽입을 다시 실행하세요.'));return false;}
    const prefix=editor.getLine(cur.line).slice(0,cur.ch);editor.replaceRange(`${prefix?'\n\n':''}${block}`,cur);return true;
   }).open();
  }});
  this.registerActions();registerCli(this);
  this.registerHoverLinkSource(this.manifest.id,{display:this.manifest.name,defaultMod:true});
  this.addSettingTab(new TocSettings(this.app,this));
  this.app.workspace.onLayoutReady(()=>{
   if(this.stopped)return;
   for(const view of this.views())view.previewMode.rerender(true);
   this.schedule();
  });
 }
 onunload(){this.manualNumbers.restoreAll();this.stopped=true;this.navigation++;for(const timer of this.timers.values())timer.win.clearTimeout(timer.id);this.timers.clear();for(const cancel of this.cleanups)cancel();this.cleanups.clear();
  for(const view of this.views()){
   for(const el of this.headingElements(view))for(const n of Array.from(el.children))if(n.classList.contains('tw-heading-number'))n.remove();
   view.containerEl.querySelectorAll('.tw-toc-host').forEach(el=>el.replaceChildren());
  }this.models.clear();
 }
 private views():MarkdownView[]{return this.app.workspace.getLeavesOfType('markdown').map(l=>l.view).filter((v):v is MarkdownView=>v instanceof MarkdownView&&v.getMode()==='preview'&&!!v.file);}
 private headingElements(view:MarkdownView):HTMLElement[]{
  const r=renderer(view);if(!r)return [];
  return [...new Set(r.sections.flatMap(s=>Array.from(s.el.querySelectorAll<HTMLElement>(SELECTOR))))].filter(h=>!h.closest('.callout,.markdown-embed,.tw-toc-host'));
 }
 private onMetadataChanged(file:TFile){
  if(!this.reads.has(file.path)&&!this.views().some(v=>v.file?.path===file.path))return;
  this.revision++;this.fileRevisions.set(file.path,(this.fileRevisions.get(file.path)??0)+1);this.schedule(file.path,this.models.has(file.path)?80:0);
 }
 // A first-render request cannot be postponed by later edit notifications or another file.
 schedule(path?:string,delay=80){
  if(this.stopped)return;
  const views=this.views(),paths=path?[path]:[...new Set(views.map(v=>v.file!.path))];
  for(const target of paths){
   const matching=views.filter(v=>v.file?.path===target);
   const doc=(matching.find(v=>v.containerEl?.ownerDocument.visibilityState==='visible')??matching[0])?.containerEl?.ownerDocument;
   const win=doc?.defaultView??window,previous=this.timers.get(target);
   if(previous?.delay===0&&previous.win===win)continue;
   if(previous)previous.win.clearTimeout(previous.id);
   const wait=previous?.delay===0?0:delay;
   const id=win.setTimeout(()=>{this.timers.delete(target);void this.refresh(target);},wait);
   this.timers.set(target,{id,delay:wait,win});
  }
 }

 async saveSettings(keys?:readonly (keyof Settings)[]){
  this.revision++;this.settingsRevision++;this.schedule();
  const requested={...this.settings};
  for(const key of keys??Object.keys(requested) as (keyof Settings)[])if(keys||requested[key]!==this.savedSettings[key])this.globalData[key]=requested[key];
  // Capture each request before awaiting; subsequent changes must see the latest intent.
  this.savedSettings=requested;const data={...this.globalData};this.settingsErrors=validate(data).errors;
  const write=()=>this.saveData(data),pending=this.saveQueue?this.saveQueue.then(write):write();
  this.saveQueue=pending.catch(()=>{});
  try{await pending;return true;}catch{new Notice(tr('설정을 저장하지 못했습니다. 바꾼 항목을 다시 설정해 주세요.'));return false;}
 }
 private async loadModel(file:TFile):Promise<Model|null>{
  const path=file.path,version=this.fileRevisions.get(path)??0,settings=this.settingsRevision;
  const existing=this.reads.get(path);
  if(existing&&existing.version===version&&existing.settings===settings)return existing.promise;
  const promise=(async()=>{
   const text=await this.app.vault.cachedRead(file);
   if(this.stopped||file.path!==path||version!==(this.fileRevisions.get(path)??0)||settings!==this.settingsRevision)return null;
   const cache=this.app.metadataCache.getFileCache(file);if(!cache)return null;
   const scanned=scan(text),options={...this.settings},errors:string[]=this.settingsErrors??[],previous=this.models.get(path);
   const headingSignature=JSON.stringify((cache.headings??[]).map(h=>[h.heading,h.level,h.position.start.line]));
   return previous&&previous.text===text&&previous.headingSignature===headingSignature&&JSON.stringify(previous.settings)===JSON.stringify(options)&&JSON.stringify(previous.errors)===JSON.stringify(errors)?previous:{text,headingSignature,settings:options,errors,items:buildItems(cache.headings??[],text,options,scanned.excluded),blocks:scanned.blocks,headings:(cache.headings??[]).filter(h=>!scanned.excluded.has(h.position.start.line)).map(h=>({line:h.position.start.line,level:h.level}))};
  })();
  const request={version,settings,promise};this.reads.set(path,request);
  try{return await promise;}finally{if(this.reads.get(path)===request)this.reads.delete(path);}
 }
 private viewForHost(el:HTMLElement,path:string):MarkdownView|undefined {
  return this.views().find(v=>v.file?.path===path&&(v.containerEl.contains(el)||renderer(v)?.sections.some(s=>s.el===el||s.el.contains(el))));
 }
 private async renderInitialHost(el:HTMLElement,host:Host){
  try{
   const path=host.context.sourcePath,file=this.app.vault.getFileByPath(path);
   if(!file||el.closest('.callout,.markdown-embed,.markdown-source-view'))return;
   const model=await this.loadModel(file);
   if(!model||this.stopped||this.hosts.get(el)!==host||host.context.sourcePath!==file.path||el.closest('.callout,.markdown-embed,.markdown-source-view'))return;
   this.models.set(path,model);
   // Section/leaf attachment can follow this callback. Resolve navigation when clicked.
   this.paintHost(this.viewForHost(el,path),el,model);
   this.schedule(path,0);
  }catch{if(!this.stopped)new Notice(tr('목차를 갱신하지 못했습니다. 문서를 다시 열어 주세요.'));}
 }
 private async refresh(path?:string){
  if(this.stopped)return;
  const views=this.views().map(view=>({view,file:view.file!}));
  const paths=new Set(views.map(v=>v.file.path));for(const key of this.models.keys())if(!paths.has(key))this.models.delete(key);
  const files=new Map(views.filter(v=>!path||v.file.path===path).map(v=>[v.file.path,v.file]));
  await Promise.all([...files].map(async([sourcePath,file])=>{
   try{
    const model=await this.loadModel(file);if(!model||this.stopped)return;
    const active=new Set(this.views());
    for(const entry of views){
     if(entry.file!==file||!active.has(entry.view)||entry.view.file!==file||file.path!==sourcePath)continue;
     this.models.set(sourcePath,model);this.paint(entry.view,model);
    }
   }catch{if(!this.stopped)new Notice(tr('목차를 갱신하지 못했습니다. 문서를 다시 열어 주세요.'));}
  }));
  if(!this.stopped)this.manualNumbers.retain(new Set(this.views().flatMap(v=>this.headingElements(v))));
 }
 private paintHost(view:MarkdownView|undefined,el:HTMLElement,model:Model){
  const host=this.hosts.get(el);if(!host)return;
  const info=(view?lineFor(view,el):null)??host.context.getSectionInfo(el);
  const block=model.blocks.find(b=>info&&b.line>=info.lineStart&&b.line<=info.lineEnd);
  // Missing section information means attachment is in progress, not that the TOC was removed.
  if(info&&!block){el.replaceChildren();host.signature=undefined;return;}
  if(block){host.line=block.line;host.source=block.source;}
  let stateChanged=false;
  if(view&&block){
   const existing=this.folds.get(view);
   const states=existing&&existing.path===view.file?.path?remapFolds(existing.text,model.text,existing.blocks,model.blocks,existing.states):new Map<number,TocFolding>();
   this.folds.set(view,{path:view.file!.path,states,text:model.text,blocks:model.blocks});
   const index=model.blocks.indexOf(block),state=states.get(index)??new TocFolding();
   stateChanged=host.folding!==state;host.folding=state;states.set(index,state);
  }
  const options=blockSettings(block?.source??host.source,model.settings);
  const signature=JSON.stringify([model.items,options,model.errors,block?.closed]);
  if(stateChanged||host.signature!==signature){host.signature=signature;this.paintToc(el,host,model,options.settings,[...model.errors,...options.errors,...(block?.closed===false?[tr('닫히지 않은 목차 블록은 먼저 닫아 주세요.')]:[])]);}
 }
 private hostElements(view:MarkdownView):HTMLElement[]{
  const sections=renderer(view)?.sections??[];
  // The rendered block can be attached before Obsidian publishes its section list.
  return [...new Set([...Array.from(view.containerEl.querySelectorAll<HTMLElement>('.markdown-preview-view .tw-toc-host')),...sections.flatMap(s=>Array.from(s.el.querySelectorAll<HTMLElement>('.tw-toc-host')))])].filter(e=>!e.closest('.callout,.markdown-embed'));
 }
 private paint(view:MarkdownView,model:Model){
  for(const el of this.hostElements(view))this.paintHost(view,el,model);
  const assigned=new Set<number>();
  for(const heading of this.headingElements(view)){
   const info=lineFor(view,heading);const level=Number(heading.tagName.slice(1));const text=heading.getAttribute('data-heading');
   const item=model.items.find(x=>!assigned.has(x.line)&&x.level===level&&x.text===text&&info&&x.line>=info.lineStart&&x.line<=info.lineEnd);
   const existing=Array.from(heading.children).find(n=>n.classList.contains('tw-heading-number')) as HTMLElement|undefined;
   const prefix=item&&model.settings.numbering&&model.settings.replaceManualNumbering?manualPrefix(item.text):'';
   if(this.manualNumbers.set(heading,prefix))invalidate(view,heading);
   if(!item||!model.settings.numbering){if(existing){existing.remove();invalidate(view,heading);}continue;}assigned.add(item.line);
   const clickable=model.blocks.length>0;
   const sig=JSON.stringify([item.line,item.number,clickable,model.settings.expandOnNavigate,model.blocks[0]?.line]);
   if(existing?.dataset.twSignature===sig)continue;existing?.remove();
   const number=heading.createEl(clickable?'a':'span');number.className='tw-heading-number';number.dataset.twSignature=sig;number.dataset.twLine=String(item.line);number.textContent=item.number+' ';
   if(clickable){const a=number as HTMLAnchorElement;a.href='#';a.setAttribute('aria-label',tr('{number} 목차로 돌아가기',{number:item.number}));a.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();void this.goBack(view,item.line);});}
   const indicator=heading.querySelector(':scope > .heading-collapse-indicator');if(indicator)indicator.after(number);else heading.prepend(number);invalidate(view,heading);
  }
 }
 private paintToc(el:HTMLElement,host:Host,model:Model,s:Settings,errors:string[]){
  const currentView=()=>this.viewForHost(el,host.context.sourcePath);
  const resize=()=>{const view=currentView();if(view)invalidate(view,el);};
  el.replaceChildren();el.style.setProperty('--tw-toc-position',String(s.position));el.style.setProperty('--tw-toc-scale',String(s.scale/100));const box=el.createDiv({cls:'tw-toc-box'});box.classList.toggle('tw-toc-guides',s.guides);box.classList.toggle('tw-toc-border',s.border);box.style.backgroundColor=s.background;
  const remember=()=>{const view=currentView();if(view)this.lastHost.set(view,el);};
  box.addEventListener('focusin',remember);box.addEventListener('pointerdown',remember);
  box.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();remember();this.contextMenu(event,currentView(),el);});
  const bar=box.createDiv({cls:'tw-toc-bar'});bar.createSpan({text:s.title,cls:'tw-toc-title'});
  if(!s.collapsible)host.collapsed=false;
  const list=box.createEl('ul',{cls:'tw-toc-list'});list.hidden=host.collapsed;
  if(s.collapsible){const toggle=bar.createEl('button',{cls:'tw-toc-toggle',attr:{type:'button','aria-label':tr('목차 접기·펼치기'),'aria-expanded':String(!host.collapsed)}});toggle.textContent=host.collapsed?'›':'⌄';toggle.addEventListener('click',()=>{host.collapsed=!host.collapsed;list.hidden=host.collapsed;toggle.setAttribute('aria-expanded',String(!host.collapsed));toggle.textContent=host.collapsed?'›':'⌄';resize();});}
  const folding=host.folding??=new TocFolding();folding.update(model.items,s.initialDepth);
  const nodes=folding.nodes,groups=new Map<number,HTMLElement>(),entries=new Map<number,HTMLElement>(),buttons=new Map<number,HTMLButtonElement>();
  const sync=()=>{
   for(const [index,entry] of entries)entry.hidden=s.branches&&nodes[index].hidden;
   for(const [index,group] of groups){
    group.hidden=s.branches&&nodes[index].children.every(child=>nodes[child].hidden);
    const button=buttons.get(index);if(button){
     button.setAttribute('aria-expanded',String(!group.hidden));
     const label=tr(folding.expanded(index)?'{title} 하위 항목 접기':'{title} 숨겨진 하위 항목 펼치기',{title:nodes[index].item.label});
     button.setAttribute('aria-label',label);button.title=label;
    }
   }
   resize();
  };
  host.syncFolds=sync;
  for(let index=0;index<nodes.length;index++){
   const node=nodes[index],item=node.item,parent=node.parent<0?list:groups.get(node.parent)!;
   const li=parent.createEl('li',{cls:'tw-toc-item'});li.dataset.twLine=String(item.line);entries.set(index,li);
   const row=li.createDiv({cls:'tw-toc-row'});
   if(s.branches&&node.children.length){
    const toggle=row.createEl('button',{cls:'tw-toc-branch',attr:{type:'button','aria-label':tr('{title} 하위 항목 접기·펼치기',{title:item.label})}});
    toggle.createSpan({text:'›',attr:{'aria-hidden':'true'}});buttons.set(index,toggle);
    toggle.addEventListener('click',()=>{folding.toggle(index);sync();});
   }else if(s.branches)row.createSpan({cls:'tw-toc-branch-spacer',attr:{'aria-hidden':'true'}});
   const number=row.createEl('a',{cls:'tw-toc-marker',text:item.number,href:'#',attr:{'aria-label':tr('{number} {title} 절로 이동',{number:item.number,title:item.label})}});
   number.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();const view=currentView();if(view)void this.goHeading(view,item.line);});
   row.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();remember();this.contextMenu(event,currentView(),el,item);});
   if(s.hoverPreview)number.addEventListener('mouseover',event=>{const view=currentView();if(view)this.app.workspace.trigger('hover-link',{event,source:this.manifest.id,hoverParent:view,targetEl:number,linktext:`${host.context.sourcePath}#${item.text}`,sourcePath:host.context.sourcePath});});
   renderLabel(row.createSpan({cls:'tw-toc-label'}),item.parts);
   if(node.children.length){
    const children=li.createEl('ul',{cls:'tw-toc-children'});children.id=`tw-toc-children-${++nextGroupId}`;buttons.get(index)?.setAttribute('aria-controls',children.id);groups.set(index,children);
   }
  }
  sync();
  if(!model.items.length)list.createEl('li',{text:tr('표시할 제목이 없습니다'),cls:'tw-toc-empty'});
  for(const error of errors)box.createDiv({text:tr(error),cls:'tw-toc-error'});resize();
 }
 private registerActions(){
  const commands=[['edit-toc','이 목차 편집'],['find-heading','목차에서 제목 찾기'],['back-to-toc','첫 목차로 돌아가기'],['copy-toc-markdown','목차를 Markdown으로 복사'],['copy-toc-text','목차를 텍스트로 복사'],['copy-heading-link','현재 제목 링크 복사'],['inspect-toc','목차 설정·오류 보기'],['expand-all','목차 모두 펼치기'],['collapse-all','목차 하위 항목 모두 접기'],['reset-folds','처음 펼침으로 되돌리기'],['next-heading','다음 제목'],['previous-heading','이전 제목'],['copy-section-toc','현재 절 목차 복사'],['copy-section','현재 절 내용 복사'],['show-options','목차 옵션 설명 보기']];
  for(const [id,name] of commands)this.addCommand({id,name:tr(name),checkCallback:checking=>{
   const view=this.app.workspace.getActiveViewOfType(MarkdownView),needsPreview=['expand-all','collapse-all','reset-folds','back-to-toc'].includes(id);
   const available=id==='show-options'||!!view?.file&&(!needsPreview||view.getMode()==='preview');
   if(available&&!checking)void this.runAction(id,view??undefined);return available;
  }});
 }
 private contextMenu(event:MouseEvent,view:MarkdownView|undefined,el:HTMLElement,item?:Item){
  if(!view)return;const menu=new Menu();
  const entries=item?[['copy-heading-link','현재 제목 링크 복사'],['copy-section','현재 절 내용 복사'],['copy-section-toc','현재 절 목차 복사']]:[['edit-toc','이 목차 편집'],['find-heading','목차에서 제목 찾기'],['copy-toc-markdown','목차를 Markdown으로 복사'],['copy-toc-text','목차를 텍스트로 복사'],['inspect-toc','목차 설정·오류 보기']];
  const host=this.hosts.get(el),s=blockSettings(host?.source??'',this.settings).settings;
  if(s.branches)entries.push(['expand-all',item?'이 가지 모두 펼치기':'목차 모두 펼치기'],['collapse-all',item?'이 가지 모두 접기':'목차 하위 항목 모두 접기']);
  if(!item&&s.branches)entries.push(['reset-folds','처음 펼침으로 되돌리기']);
  for(const [id,name] of entries)menu.addItem(entry=>entry.setTitle(tr(name)).onClick(()=>{void this.runAction(id,view,el,item);}));
  menu.showAtMouseEvent(event);
 }
 private currentLine(view:MarkdownView){
  if(view.getMode()==='source')return view.editor.getCursor().line;
  const state=view.getEphemeralState();if(typeof state.scroll==='number'&&Number.isFinite(state.scroll))return Math.floor(state.scroll);
  const r=renderer(view),top=r?.previewEl.getBoundingClientRect().top??0;
  return r?.sections.find(section=>section.shown&&section.el.getBoundingClientRect().bottom>top)?.start.line??0;
 }
 private async runAction(id:string,view?:MarkdownView,el?:HTMLElement,clicked?:Item){
  try{
   if(id==='show-options'){new Information(this.app,tr('목차 옵션 설명 보기'),OPTION_HELP.map(r=>({...r,value:tr(r.value)}))).open();return;}
   const file=view?.file;if(!view||!file)return;
   const path=file.path,editing=view.getMode()==='source',text=editing?view.editor.getValue():await this.app.vault.read(file);
   const snap=documentSnapshot(text,this.settings),position=this.currentLine(view);
   const valid=async()=>!this.stopped&&view.file===file&&file.path===path&&view.getMode()===(editing?'source':'preview')&&(editing?view.editor.getValue():await this.app.vault.read(file))===text;
   if(!await valid())throw new Error('문서가 바뀌었습니다. 다시 실행하세요.');
   const navigate=async(line:number)=>{
    if(!await valid())throw new Error('문서가 바뀌었습니다. 다시 실행하세요.');
    if(editing){view.editor.setCursor({line,ch:0});view.editor.scrollIntoView({from:{line,ch:0},to:{line,ch:0}},true);view.editor.focus();}
    else {const model=await this.loadModel(file);if(model&&await valid()){this.models.set(path,model);await this.move(view,line,model);}}
   };
   const current=clicked?snap.items.find(i=>i.line===clicked.line&&i.text===clicked.text):snap.items.filter(i=>i.line<=position).at(-1);
   if(id==='find-heading'){
    if(!snap.items.length){new Notice(tr('표시할 제목이 없습니다'));return;}
    const tree=new TocFolding();tree.update(snap.items,0);
    const item=await choose(this.app,snap.items,i=>{const node=tree.nodes[snap.items.indexOf(i)];return `${i.number} ${i.label} · H${i.level}${node.parent<0?'':` · ${snap.items[node.parent].label}`}`;},tr('목차에서 제목 찾기'));
    if(item)await navigate(item.line);return;
   }
   if(id==='next-heading'||id==='previous-heading'){
    const item=id==='next-heading'?snap.items.find(i=>i.line>position):snap.items.filter(i=>i.line<position).at(-1);
    if(item)await navigate(item.line);else new Notice(tr('이 방향에 더 이상 제목이 없습니다.'));return;
   }
   if(id==='back-to-toc'){
    if(!snap.blocks.length){new Notice(tr('이 문서에 목차가 없습니다.'));return;}
    const model=await this.loadModel(file);if(model&&await valid()){this.models.set(path,model);await this.goBack(view,current?.line??snap.items[0]?.line??0);}return;
   }
   let block:TocBlock|undefined;
   if(!['copy-heading-link','copy-section','copy-section-toc'].includes(id)){
    const target=el??this.lastHost.get(view),host=target?this.hosts.get(target):undefined;
    if(editing&&!el)block=snap.blocks.find(b=>b.line<=position&&(b.endLine??b.line)>=position);
    block??=target&&(el||target.isConnected)&&host?.context.sourcePath===path?snap.blocks.find(b=>b.line===host.line&&b.source===host.source):undefined;
    if(!block&&snap.blocks.length===1)block=snap.blocks[0];
    if(!block&&snap.blocks.length>1)block=await choose(this.app,snap.blocks,b=>`${b.line+1} · ${blockSettings(b.source,this.settings).settings.title}`,tr('목차 선택'))??undefined;
    if(!block){if(!snap.blocks.length)new Notice(tr('이 문서에 목차가 없습니다.'));return;}
    if(!await valid())throw new Error('문서가 바뀌었습니다. 다시 실행하세요.');
   }
   if(id==='edit-toc'&&block){
    const selected=block;if(selected.closed===false){new Notice(tr('닫히지 않은 목차 블록은 먼저 닫아 주세요.'));return;}
    new InsertTocModal(this.app,this.settings,async source=>{
     if(this.stopped||!this.app.workspace.getLeavesOfType('markdown').includes(view.leaf)||view.file!==file||view.getMode()!==(editing?'source':'preview')){new Notice(tr('문서가 바뀌었습니다. 다시 실행하세요.'));return false;}
     if(editing){if(view.editor.getValue()!==text){new Notice(tr('문서가 바뀌었습니다. 다시 실행하세요.'));return false;}
      const end=selected.endLine!;const changed=replaceBlock(text,selected,source).split(/\r?\n/);const original=text.split(/\r?\n/);
      const replacement=changed.slice(selected.line,changed.length-(original.length-end-1)).join('\n');
      view.editor.replaceRange(replacement,{line:selected.line,ch:0},{line:end,ch:original[end].length});
     }else await this.app.vault.process(file,original=>{if(original!==text)throw new Error('문서가 바뀌었습니다. 다시 실행하세요.');return replaceBlock(original,selected,source);});
     return true;
    },selected.source).open();return;
   }
   if(id==='inspect-toc'&&block){
    const options=blockSettings(block.source,this.settings);
    const report=settingsReport(options.settings,this.globalData,options);
    const rows=Object.entries(report).map(([key,entry])=>({name:settingName(key as keyof Settings),value:`${typeof entry.value==='boolean'?tr(entry.value?'켜기':'끄기'):entry.value} · ${tr(entry.source==='block'?'이 목차의 설정':entry.source==='global'?'전역 설정':'기본값')}${entry.rejectedInputs?' · '+tr('잘못된 입력은 적용하지 않았습니다.'):''}`}));
    rows.push(...this.settingsErrors.map(message=>({name:tr('전역 설정'),value:tr(message)})),...tocDiagnostics(block,this.settings).map(d=>({name:`${d.line?block.line+d.line+1:block.line+1} · ${d.key??d.code}`,value:tr(d.message)})));
    new Information(this.app,tr('목차 설정·오류 보기'),rows).open();return;
   }
   if(['expand-all','collapse-all','reset-folds'].includes(id)&&block){
    const model=await this.loadModel(file);if(!model||!await valid())return;this.models.set(path,model);this.paint(view,model);
    const hostEl=this.hostElements(view).find(e=>this.hosts.get(e)?.line===block.line),host=hostEl?this.hosts.get(hostEl):undefined;
    if(!host?.folding){new Notice(tr('목차가 화면에 준비된 뒤 다시 실행하세요.'));return;}
    if(!blockSettings(block.source,this.settings).settings.branches)return;
    const index=clicked?host.folding.nodes.findIndex(n=>n.item.line===clicked.line&&n.item.text===clicked.text):undefined;
    if(index===-1)return;
    host.folding.set(id==='expand-all'?'expand':id==='collapse-all'?'collapse':'reset',index);host.syncFolds?.();return;
   }
   let output='';let linkItems:Item[]=[];
   if(id==='copy-heading-link'){
    if(!current){new Notice(tr('현재 절의 제목을 찾을 수 없습니다.'));return;}
    output=markdownLink(current,headingLink(path,current));linkItems=snap.items;
   }else if(id==='copy-section'||id==='copy-section-toc'){
    if(!current){new Notice(tr('현재 절의 제목을 찾을 수 없습니다.'));return;}
    const range=sectionRange(snap,current.line);if(!range)return;
    linkItems=snap.items.filter(i=>i.line>current.line&&i.line<range.end);
    output=id==='copy-section'?range.text:tocText(linkItems,'markdown',i=>headingLink(path,i));
   }else {linkItems=snap.items;output=tocText(snap.items,id==='copy-toc-text'?'text':'markdown',i=>headingLink(path,i));}
   if(!await valid())throw new Error('문서가 바뀌었습니다. 다시 실행하세요.');
   await navigator.clipboard.writeText(output);new Notice(tr('복사했습니다.'));
   if(id!=='copy-section'&&id!=='copy-toc-text'&&duplicateLinks(linkItems))new Notice(tr('같은 제목의 외부 링크는 목적지에서 구별되지 않을 수 있습니다.'));
  }catch(error){new Notice(tr(error instanceof Error?error.message:'명령을 실행하지 못했습니다.'));}
 }
 private delay(ms:number,view:MarkdownView):Promise<void>{
  const doc=view.containerEl.ownerDocument,win=doc.defaultView??window;
  if(doc.visibilityState==='hidden')return Promise.resolve();
  return new Promise(resolve=>{
   let timer:number;
   const done=()=>{win.clearTimeout(timer);doc.removeEventListener('visibilitychange',hidden);this.cleanups.delete(done);resolve();};
   const hidden=()=>{if(doc.visibilityState==='hidden')done();};
   timer=win.setTimeout(done,ms);doc.addEventListener('visibilitychange',hidden);this.cleanups.add(done);
  });
 }
 private async move(view:MarkdownView,line:number,model:Model){
  const token=++this.navigation,path=view.file?.path,revision=this.revision;
  const valid=()=>!this.stopped&&view.containerEl.ownerDocument.visibilityState!=='hidden'&&token===this.navigation&&view.file?.path===path&&view.getMode()==='preview'&&this.revision===revision&&this.models.get(path!)===model;
  if(!valid())return false;
  const target=targetLine(view,line,model.settings.expandOnNavigate,model.headings);
  await this.delay(40,view);
  for(let i=0;i<20;i++){
   if(!valid())return false;
   if(scrollToLine(view,target)){
    await this.delay(50,view);if(!valid())return false;
    if(targetVisible(view,target)){this.paint(view,model);return true;}
   }else await this.delay(50,view);
  }
  if(valid())new Notice(tr('이동할 위치가 아직 준비되지 않았습니다. 다시 눌러 주세요.'));return false;
 }
 private async goHeading(view:MarkdownView,line:number){const model=this.models.get(view.file!.path);if(model)await this.move(view,line,model);}
 private async goBack(view:MarkdownView,line:number){
  const path=view.file?.path;if(!path)return;const model=this.models.get(path);if(!model?.blocks.length)return;
  const revision=this.revision;const moving=this.move(view,model.blocks[0].line,model);const navigation=this.navigation;
  if(!await moving)return;await this.delay(100,view);
  if(this.stopped||view.containerEl.ownerDocument.visibilityState==='hidden'||view.file?.path!==path||view.getMode()!=='preview'||this.navigation!==navigation||this.revision!==revision||this.models.get(path)!==model)return;
  const el=this.hostElements(view).find(e=>this.hosts.get(e)?.line===model.blocks[0].line);if(!el)return;
  const host=this.hosts.get(el)!;
  if(host.collapsed){host.collapsed=false;host.signature=undefined;this.paint(view,model);renderer(view)?.queueRender();}
  host.folding?.reveal(line);host.syncFolds?.();
  const target=Array.from(el.querySelectorAll<HTMLElement>('.tw-toc-item')).find(n=>n.dataset.twLine===String(line))?.querySelector<HTMLElement>(':scope > .tw-toc-row');
  if(target){target.classList.add('tw-toc-highlight');void this.delay(1200,view).then(()=>target.classList.remove('tw-toc-highlight'));}
 }
}
