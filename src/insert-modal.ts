import {tr} from './i18n';
import {App,Modal,Setting,TextComponent} from 'obsidian';
import {Settings,TocOverrides,insertionBlock,blockSettings} from './model';
import {patchBlock} from './actions';

export class InsertTocModal extends Modal {
 private overrides:TocOverrides={};private reset=false;
 constructor(app:App,private defaults:Settings,private insert:(block:string)=>boolean|Promise<boolean>,private source?:string){super(app);if(source!==undefined)this.overrides=blockSettings(source,defaults).overrides;}
 onOpen(){
  this.titleEl.setText(tr(this.source===undefined?'목차 삽입':'이 목차 편집'));
  const el=this.contentEl;el.empty();
  el.createEl('p',{text:tr(this.source===undefined?'그대로 삽입하면 전역 설정을 따릅니다. 이 목차만 다르게 꾸미려면 추가 설정을 펼치세요.':'이 목차에 따로 지정한 설정을 편집합니다. 전역 설정으로 되돌리면 잘못된 개별 설정도 제거됩니다.')});
  el.createEl('p',{text:tr('읽기 화면에서 목차를 볼 수 있습니다.')});
  const details=el.createEl('details');details.open=this.source!==undefined;details.createEl('summary',{text:tr('추가 설정')});
  details.createEl('p',{text:tr('따로 설정한 항목만 목차 안에 저장합니다. 문서 속성에는 아무것도 추가하지 않습니다.')});
  let depthField:TextComponent|undefined;
  const syncDepth=()=>depthField?.setDisabled(!('initialDepth' in this.overrides)||!(this.overrides.branches??this.defaults.branches));
  const textOption=(key:'title'|'position'|'scale'|'background'|'initialDepth',name:string,desc:string)=>{
   let field:TextComponent;let value=String(this.overrides[key]??this.defaults[key]);
   const read=()=>key==='position'||key==='scale'||key==='initialDepth'?(value.trim()===''?NaN:Number(value)):value;
   new Setting(details).setName(name).setDesc(desc).addToggle(t=>t.setValue(key in this.overrides).setTooltip(tr('이 목차만 따로 설정')).onChange(enabled=>{
    field.setDisabled(!enabled);if(enabled)(this.overrides as Record<string,unknown>)[key]=read();else delete this.overrides[key];syncDepth();
   })).addText(t=>{
    field=t;if(key==='initialDepth')depthField=t;t.setValue(value).setDisabled(!(key in this.overrides));t.inputEl.setAttribute('aria-label',name);
    if(key==='position'||key==='scale'||key==='initialDepth'){t.inputEl.type='number';t.inputEl.min=key==='scale'?'25':'0';t.inputEl.max=key==='initialDepth'?'6':key==='scale'?'200':'100';t.inputEl.step=key==='initialDepth'?'1':'any';}
    t.onChange(raw=>{value=raw;if(Object.prototype.hasOwnProperty.call(this.overrides,key))(this.overrides as Record<string,unknown>)[key]=read();});
   });
  };
  textOption('title',tr('목차 제목'),tr('스위치를 켜면 이 목차의 제목을 지정합니다. 빈 제목도 가능합니다.'));
  textOption('position',tr('목차 위치 (%)'),tr('스위치를 켜면 0~100으로 지정합니다. 0 왼쪽, 50 가운데, 100 오른쪽.'));
  textOption('scale',tr('목차 크기 (%)'),tr('스위치를 켜면 글자와 상자 여백을 함께 25~200%로 조절합니다. 100%가 원래 크기입니다.'));
  textOption('background',tr('목차 배경'),tr('스위치를 켜면 transparent(투명) 또는 #RRGGBB / #RRGGBBAA를 입력합니다.'));
  for(const [key,name] of [['border',tr('목차 테두리')],['collapsible',tr('목차 전체 접기 버튼')],['branches',tr('하위 항목 접기')],['guides',tr('계층 가이드선')]] as const){
   new Setting(details).setName(name).addDropdown(d=>d.addOption('global',tr('전역 설정 따르기')).addOption('true',tr('켜기')).addOption('false',tr('끄기')).setValue(key in this.overrides?String(this.overrides[key]):'global').onChange(value=>{
    if(value==='global')delete this.overrides[key];else this.overrides[key]=value==='true';syncDepth();
   }));
  }
  textOption('initialDepth',tr('처음 펼쳐둘 제목 단계'),tr('0은 전부 펼침(기본값). 3이면 H3까지 펼치고 H4부터 접습니다. 최상위 항목은 항상 보입니다.'));
  syncDepth();
  details.createEl('p',{text:tr('본문 자동 번호·제목 범위·기존 번호 대체·이동 시 펼침은 플러그인 설정창에서 정합니다.')});
  new Setting(details).addButton(b=>b.setButtonText(tr('전역 설정으로 되돌리기')).onClick(()=>{this.overrides={};this.reset=true;this.onOpen();}));
  const error=el.createDiv({cls:'tw-toc-error',attr:{role:'status','aria-live':'polite'}});error.hidden=true;
  new Setting(el).addButton(b=>b.setButtonText(tr('취소')).onClick(()=>this.close())).addButton(b=>b.setButtonText(tr(this.source===undefined?'삽입':'저장')).setCta().onClick(async()=>{
   const result=insertionBlock(this.overrides,this.defaults);error.textContent=result.errors.map(error=>tr(error)).join(' ');error.hidden=!result.errors.length;
   if(!result.errors.length){
    b.setDisabled(true);
    try{if(await this.insert(this.source===undefined?result.block:patchBlock(this.source,this.overrides,this.defaults,this.reset).source))this.close();}
    catch(reason){error.textContent=tr(reason instanceof Error?reason.message:'명령을 실행하지 못했습니다.');error.hidden=false;}
    finally{b.setDisabled(false);}
   }
  }));
 }
 onClose(){this.contentEl.empty();}
}
