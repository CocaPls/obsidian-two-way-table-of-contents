import {parseSource} from './source';
import {labelParts,labelText,LabelPart} from './inline-label';
export interface Settings { minLevel:number; maxLevel:number; numbering:boolean; replaceManualNumbering:boolean; expandOnNavigate:boolean; title:string; border:boolean; background:string; collapsible:boolean; position:number; scale:number; branches:boolean; initialDepth:number; backgroundColor:string; guides:boolean; hoverPreview:boolean }
export const DEFAULTS:Settings={minLevel:1,maxLevel:6,numbering:false,replaceManualNumbering:false,expandOnNavigate:false,title:'목차',border:true,background:'transparent',collapsible:true,position:0,scale:100,branches:true,initialDepth:0,backgroundColor:'#ffffff',guides:false,hoverPreview:false};
export interface Heading {heading:string;level:number;position:{start:{line:number};end?:{line:number}}}
export interface Item {text:string;label:string;parts:LabelPart[];level:number;line:number;depth:number;number:string}
export interface TocBlock {line:number;source:string;endLine?:number;closed?:false}
const own=(o:object,k:string)=>Object.prototype.hasOwnProperty.call(o,k);
const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
type InputKey=keyof Settings|'style'|'links'|'returnLink';
const LEGACY:Record<string,(v:unknown)=>boolean>={style:v=>typeof v==='string'&&['number','bullet','none'].includes(v),links:v=>typeof v==='string'&&['marker','title','none'].includes(v),returnLink:v=>typeof v==='boolean'};
const booleans=new Set(['numbering','replaceManualNumbering','expandOnNavigate','border','collapsible','branches','guides','hoverPreview']);
export function color(v:unknown):v is string {return typeof v==='string'&&(v==='transparent'||/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(v));}
export function validate(raw:unknown,base:Settings=DEFAULTS,allowed:ReadonlySet<string>=new Set([...Object.keys(DEFAULTS),...Object.keys(LEGACY)])):{settings:Settings;errors:string[];accepted:Set<string>} {
 const values=object(raw), settings={...base},errors:string[]=[],accepted=new Set<string>();
 for(const key of Object.keys(values)) {
  if(allowed.has(key)&&own(LEGACY,key)){if(!LEGACY[key](values[key]))errors.push(`잘못된 설정: ${key}`);continue;}
  if(!allowed.has(key)||!own(DEFAULTS,key)){errors.push(`알 수 없는 설정: ${key.slice(0,80)}`);continue;}
  const value=values[key];let valid=false;
  if(booleans.has(key)) valid=typeof value==='boolean';
  else if(key==='minLevel'||key==='maxLevel') valid=typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=6;
  else if(key==='position') valid=typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
  else if(key==='scale') valid=typeof value==='number'&&Number.isFinite(value)&&value>=25&&value<=200;
  else if(key==='initialDepth') valid=typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=6;
  else if(key==='backgroundColor') valid=color(value)&&value!=='transparent';
  else if(key==='title') valid=typeof value==='string'&&value.length<=200;
  else if(key==='background') valid=color(value);
  if(valid){(settings as unknown as Record<string,unknown>)[key]=value;accepted.add(key);} else errors.push(`잘못된 설정: ${key}`);
 }
 if(settings.minLevel>settings.maxLevel){errors.push('제목 범위는 시작 단계가 끝 단계보다 깊을 수 없습니다.');settings.minLevel=base.minLevel;settings.maxLevel=base.maxLevel;accepted.delete('minLevel');accepted.delete('maxLevel');}
 return {settings,errors,accepted};
}
// Validate both draft fields together; incomplete typing must never save a new range.
export function headingRange(start:string,end:string,base:Settings){
 const a=start.trim(),b=end.trim();
 if(!/^[1-6]$/.test(a)||!/^[1-6]$/.test(b))return {settings:{...base},errors:['시작과 끝에 1부터 6까지의 정수를 입력하세요.']};
 return validate({minLevel:Number(a),maxLevel:Number(b)},base);
}
export const BLOCK_KEYS:Record<string,InputKey>={title:'title',style:'style',links:'links',border:'border',background:'background',collapsible:'collapsible',position:'position',scale:'scale',branches:'branches',depth:'initialDepth',guides:'guides'};
export interface Diagnostic {code:string;message:string;key?:string;line?:number;severity:'error'|'warning'}
export function blockSettings(source:string,base:Settings) {
 const raw=Object.create(null) as Record<string,unknown>,diagnostics:Diagnostic[]=[],sources:Record<string,number>={};
 const issue=(code:string,message:string,line?:number,key?:string,severity:'error'|'warning'='error')=>diagnostics.push({code,message,line,key,severity});
 if(source.length>8192)issue('OPTIONS_TOO_LONG','목차 옵션은 8KB 이내로 입력하세요.');
 else for(const [i,row] of source.split('\n').entries()){
  const line=row.trim();if(!line||line.startsWith('#'))continue;
  const index=line.indexOf(':');if(index<0){issue('INVALID_SYNTAX','옵션은 이름: 값 형식으로 입력하세요.',i+1);continue;}
  const key=line.slice(0,index).trim();if(!own(BLOCK_KEYS,key)){issue('UNKNOWN_OPTION',`알 수 없는 옵션: ${key.slice(0,80)}`,i+1,key);continue;}
  let value:unknown=line.slice(index+1).trim();
  if(typeof value==='string'&&((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))))value=value.slice(1,-1);
  if(['border','collapsible','branches','guides'].includes(key))value=value==='true'?true:value==='false'?false:value;
  if((key==='position'||key==='scale')&&typeof value==='string'&&/^(?:\d+(?:\.\d+)?|\.\d+)\s*%?$/.test(value))value=Number(value.replace('%','').trim());
  if(key==='depth'&&typeof value==='string'&&/^[0-6]$/.test(value))value=Number(value);
  const name=BLOCK_KEYS[key];
  if(own(raw,name))issue('DUPLICATE_OPTION','중복 옵션은 마지막 값을 사용합니다.',i+1,key,'warning');
  raw[name]=value;sources[name]=i+1;
  if(own(LEGACY,name))issue('LEGACY_OPTION','이 과거 옵션은 적용되지 않습니다.',i+1,key,'warning');
 }
 const result=validate(raw,base,new Set(Object.values(BLOCK_KEYS)));
 for(const message of result.errors){const key=message.split(': ')[1];issue('INVALID_OPTION',message,sources[key],key);}
 const overrides:TocOverrides={};
 for(const key of APPEARANCE_KEYS)if(result.accepted.has(key))(overrides as Record<string,unknown>)[key]=raw[key];
 return {settings:result.settings,errors:diagnostics.filter(d=>d.severity==='error').map(d=>d.message),diagnostics,overrides,raw};
}
export function settingsReport(values:Settings,globalData:Record<string,unknown>,block?:ReturnType<typeof blockSettings>){
 const valid=validate(globalData).accepted;
 return Object.fromEntries((Object.keys(values) as (keyof Settings)[]).map(key=>{
  const rejectedInputs:{source:'global'|'block';input:unknown;reason:string}[]=[];
  if(own(globalData,key)&&!valid.has(key))rejectedInputs.push({source:'global',input:globalData[key],reason:'INVALID_SETTING'});
  if(block&&own(block.raw,key)&&!own(block.overrides,key))rejectedInputs.push({source:'block',input:block.raw[key],reason:'INVALID_OPTION'});
  return [key,{value:values[key],source:block&&own(block.overrides,key)?'block':valid.has(key)?'global':'default',...(rejectedInputs.length?{rejectedInputs}:{})}];
 }));
}
export function tocDiagnostics(block:TocBlock,base:Settings):Diagnostic[]{
 return [...blockSettings(block.source,base).diagnostics,...(block.closed===false?[{code:'UNCLOSED_BLOCK',message:'닫히지 않은 목차 블록은 먼저 닫아 주세요.',severity:'error' as const}]:[])];
}
// Deliberately requires a trailing dot and a space/tab; never guesses semantic numbers.
export function manualPrefix(text:string):string {return text.match(/^\d+(?:\.\d+)*\.[ \t]+/)?.[0]??'';}
export function label(text:string):string {return labelText(labelParts(text));}
export function scan(text:string,parsed=parseSource(text)):{excluded:Set<number>;blocks:TocBlock[]} {
 const lines=text.split('\n'),excluded=new Set<number>(),blocks:TocBlock[]=[];
 const {tokens,hidden}=parsed;
 for(const line of hidden)excluded.add(line);
 for(const token of tokens){
  if(!token.map)continue;
  if(['fence','code_block','html_block','blockquote_open'].includes(token.type))for(let i=token.map[0];i<token.map[1];i++)excluded.add(i);
  if(token.type==='fence'&&token.level===0&&token.info.trim()==='tw-toc'){
   const line=token.map[0],endLine=token.map[1]-1,close=lines[endLine].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
   const closed=endLine>line&&close&&close[1][0]===token.markup[0]&&close[1].length>=token.markup.length;
   blocks.push({line,endLine,source:lines.slice(line+1,closed?endLine:token.map[1]).join('\n'),...(!closed?{closed:false as const}:{})});
  }
 }
 return {excluded,blocks};
}

export function buildItems(headings:Heading[],text:string,settings:Settings,excluded=scan(text).excluded):Item[]{
 let counts:number[]=[];
 return headings.filter(h=>!excluded.has(h.position.start.line)&&h.level>=settings.minLevel&&h.level<=settings.maxLevel).map(h=>{
  const depth=h.level-settings.minLevel+1;
  if(counts.length>=depth){counts=counts.slice(0,depth);counts[depth-1]++;}else while(counts.length<depth)counts.push(1);
  const parts=labelParts(settings.replaceManualNumbering?h.heading.slice(manualPrefix(h.heading).length):h.heading);
  return {text:h.heading,label:labelText(parts),parts,level:h.level,line:h.position.start.line,depth:depth-1,number:counts.join('.')+'.'};
 });
}

export const APPEARANCE_KEYS=['title','position','scale','border','background','collapsible','branches','initialDepth','guides'] as const;
export type AppearanceKey=typeof APPEARANCE_KEYS[number];
export type TocOverrides=Partial<Pick<Settings,AppearanceKey>>;
// Store only deliberately overridden values. Missing options keep following global settings.
export function insertionBlock(overrides:TocOverrides,base:Settings){
 const result=validate(overrides,base,new Set(APPEARANCE_KEYS));
 if(typeof overrides.title==='string'&&/[\r\n]/.test(overrides.title))result.errors.push('목차 제목은 한 줄로 입력하세요.');
 if(result.errors.length)return {block:'',errors:result.errors};
 const lines=APPEARANCE_KEYS.filter(k=>own(overrides,k)).map(k=>{
  const value=overrides[k];return `${k==='initialDepth'?'depth':k}: ${typeof value==='string'?'"'+value+'"':value}`;
 });
 return {block:['```tw-toc',...lines,'```',''].join('\n'),errors:[]};
}

export function insertionTouchesProperties(text:string,line:number):boolean {
 const rows=text.split('\n');if(rows[0]?.trim()!=='---')return false;
 const end=rows.findIndex((row,index)=>index>0&&/^(---|\.\.\.)\s*$/.test(row));
 return end===-1||line<=end;
}

export function percentage(raw:string,min:number,max:number):number|null {
 const value=Number(raw);
 return raw.trim()!==''&&Number.isFinite(value)&&value>=min&&value<=max?value:null;
}
export function setTransparent(settings:Settings,transparent:boolean){
 if(transparent){if(settings.background!=='transparent')settings.backgroundColor=settings.background;settings.background='transparent';}
 else settings.background=settings.backgroundColor;
}

// The persisted initialDepth/depth keys now represent an absolute Markdown H level.
export function headingLimit(raw:string):number|null {
 return /^[0-6]$/.test(raw.trim())?Number(raw.trim()):null;
}
