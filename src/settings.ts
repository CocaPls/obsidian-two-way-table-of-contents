import {tr} from './i18n';
import {App,PluginSettingTab,Setting,SettingDefinition,SettingDefinitionItem} from 'obsidian';
import type TwoWayToc from './main';
import {headingRange,percentage,setTransparent,headingLimit} from './model';

export class TocSettings extends PluginSettingTab {
 constructor(app:App,private plugin:TwoWayToc){super(app,plugin);}
 getSettingDefinitions():SettingDefinitionItem[]{
  const s=this.plugin.settings;
  // Custom render callbacks retain queued saves, live refresh and unknown saved values.
  // Names/descriptions are still indexed by Obsidian's settings search.
  const row=(name:string,desc:string,render:(setting:Setting)=>void):SettingDefinition=>({name:tr(name),desc:tr(desc),render});
  const toggle=(key:'numbering'|'replaceManualNumbering'|'expandOnNavigate'|'border'|'collapsible'|'guides'|'hoverPreview',name:string,desc:string)=>row(name,desc,r=>{
   r.addToggle(t=>t.setValue(s[key]).onChange(async value=>{s[key]=value;await this.plugin.saveSettings([key]);}));
  });
  const percent=(key:'position'|'scale',name:string,desc:string,min:number,max:number)=>row(name,desc,r=>{
   const error=r.descEl.createDiv({cls:'tw-toc-settings-error',attr:{role:'status','aria-live':'polite'}});
   r.addText(t=>{t.inputEl.type='number';t.inputEl.min=String(min);t.inputEl.max=String(max);t.inputEl.step='any';t.inputEl.setAttribute('aria-label',tr(name));t.setValue(String(s[key]));
    t.onChange(async raw=>{const value=percentage(raw,min,max),message=value===null?tr('{min}~{max} 사이의 숫자를 입력하세요.',{min,max}):'';
     error.textContent=message;t.inputEl.setCustomValidity(message);t.inputEl.setAttribute('aria-invalid',String(value===null));
     if(value!==null){s[key]=value;await this.plugin.saveSettings([key]);}
    });
   });
  });
  return [
   {name:tr('읽기 화면에 적용됩니다. 목차별 외형과 접기는 목차 삽입·편집 창에서 따로 정할 수 있습니다.'),searchable:false},
   {type:'group',heading:tr('제목과 번호'),items:[
    row('포함할 제목','H1~H6에서 시작과 끝을 정합니다. 목차와 본문 번호에 함께 적용됩니다.',range=>{
     range.controlEl.classList.add('tw-toc-range');
     const inputs:HTMLInputElement[]=[];
     const rangeError=range.descEl.createDiv({cls:'tw-toc-settings-error',attr:{role:'status','aria-live':'polite'}});
     for(const [key,label] of [['minLevel',tr('시작 제목 단계')],['maxLevel',tr('끝 제목 단계')]] as const){
      range.controlEl.createSpan({text:key==='minLevel'?'H':'~ H'});
      range.addText(t=>{t.inputEl.type='number';t.inputEl.min='1';t.inputEl.max='6';t.inputEl.step='1';t.inputEl.setAttribute('aria-label',label);t.setValue(String(s[key]));inputs.push(t.inputEl);
       t.onChange(async()=>{const result=headingRange(inputs[0].value,inputs[1].value,s),error=tr(result.errors[0]??'');
        rangeError.textContent=error;for(const input of inputs){input.setCustomValidity(error);input.setAttribute('aria-invalid',String(!!error));}
        if(!error){s.minLevel=result.settings.minLevel;s.maxLevel=result.settings.maxLevel;await this.plugin.saveSettings(['minLevel','maxLevel']);}
       });
      });
     }
    }),
    toggle('numbering','본문 자동 번호','목차가 없어도 제목 앞에 번호를 표시합니다. 원문은 바꾸지 않습니다.'),
    toggle('replaceManualNumbering','기존 절 번호 대체','제목 앞의 “2. ” 또는 “2.1. ”을 화면에서 대체합니다. 본문에는 자동 번호를 켰을 때 적용됩니다.'),
   ]},
   {type:'group',heading:tr('목차 모양'),items:[
    row('목차 제목','빈칸이면 제목 글자만 숨깁니다.',title=>{
     const error=title.descEl.createDiv({cls:'tw-toc-settings-error',attr:{role:'status'}});
     title.addText(t=>t.setValue(s.title).onChange(async value=>{const valid=value.length<=200;error.textContent=valid?'':tr('200자 이내로 입력하세요.');t.inputEl.setAttribute('aria-invalid',String(!valid));if(valid){s.title=value;await this.plugin.saveSettings(['title']);}}));
    }),
    percent('position','목차 위치 (%)','0 왼쪽 · 50 가운데 · 100 오른쪽. 남은 본문 공간을 기준으로 합니다.',0,100),
    percent('scale','목차 크기 (%)','글자와 상자 여백을 함께 조절합니다. 100%가 원래 크기입니다.',25,200),
    toggle('guides','계층 가이드선','하위 항목 옆에 얇은 선을 표시합니다.'),
    toggle('border','목차 테두리','목차 둘레의 선을 표시합니다.'),
    row('투명 배경','끄면 마지막에 선택한 배경색을 사용합니다.',r=>{
     r.addToggle(t=>t.setValue(s.background==='transparent').onChange(async value=>{setTransparent(s,value);await this.plugin.saveSettings(['background','backgroundColor']);this.update();}));
    }),
    row('목차 배경색','투명 배경을 끄면 적용됩니다.',r=>{
     r.addColorPicker(c=>c.setValue((s.background==='transparent'?s.backgroundColor:s.background).slice(0,7)).setDisabled(s.background==='transparent').onChange(async value=>{s.backgroundColor=value;s.background=value;await this.plugin.saveSettings(['background','backgroundColor']);}));
    }),
   ]},
   {type:'group',heading:tr('접기와 이동'),items:[
    toggle('collapsible','목차 전체 접기 버튼','목차 제목 옆에 전체 목록을 접는 버튼을 표시합니다.'),
    row('하위 항목 접기','하위 제목이 있는 항목에 접기 버튼을 표시합니다.',r=>{
     r.addToggle(t=>t.setValue(s.branches).onChange(async value=>{s.branches=value;await this.plugin.saveSettings(['branches']);this.update();}));
    }),
    row('처음 펼쳐둘 제목 단계','0은 전부 펼침(기본값). 3이면 H3까지 펼치고 H4부터 접습니다. 최상위 항목은 항상 보입니다.',limit=>{
     limit.descEl.createDiv({text:tr('하위 항목 접기를 켜면 적용됩니다.')});
     const errorEl=limit.descEl.createDiv({cls:'tw-toc-settings-error',attr:{role:'status','aria-live':'polite'}});
     limit.addText(t=>{t.setDisabled(!s.branches);t.inputEl.type='number';t.inputEl.min='0';t.inputEl.max='6';t.inputEl.step='1';t.inputEl.setAttribute('aria-label',tr('처음 펼쳐둘 제목 단계'));t.setValue(String(s.initialDepth));
      t.onChange(async raw=>{const value=headingLimit(raw),error=value===null?tr('0부터 6까지의 정수를 입력하세요.'):'';
       errorEl.textContent=error;t.inputEl.setCustomValidity(error);t.inputEl.setAttribute('aria-invalid',String(value===null));
       if(value!==null){s.initialDepth=value;await this.plugin.saveSettings(['initialDepth']);}
      });
     });
    }),
    toggle('hoverPreview','본문 미리보기','숫자 링크에 보조키를 누르고 마우스를 올리면 본문을 미리 봅니다.'),
    toggle('expandOnNavigate','본문 이동 시 접힌 절 펼치기','꺼져 있으면 접힌 상위 절로 이동합니다. 목차로 돌아올 때는 해당 항목의 상위 가지만 펼칩니다.'),
   ]},
  ];
 }
}
