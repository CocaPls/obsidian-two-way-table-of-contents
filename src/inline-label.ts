import MarkdownIt from 'markdown-it';
import type {Token} from 'markdown-it';

type Format='strong'|'em'|'s'|'code'|'mark';
export interface LabelPart {text:string;formats:Format[]}
export const markdown=new MarkdownIt({html:false,linkify:false,typographer:false});

// Inline rules run after escapes and code spans, keeping literal examples intact.
markdown.inline.ruler.before('emphasis','tw_comment',(state)=>{
 const start=state.pos,percent=state.src.startsWith('%%',start),html=state.src.startsWith('<!--',start);
 if(!percent&&!html)return false;
 const end=state.src.indexOf(percent?'%%':'-->',start+(percent?2:4));
 if(percent&&end<0)return false;
 state.pos=end<0?state.posMax:end+(percent?2:3);return true;
});

// Parse wiki labels within the inline parser so code and escaped brackets stay literal.
markdown.inline.ruler.before('link','tw_wiki_label',(state,silent)=>{
 const start=state.pos,offset=state.src.startsWith('![[',start)?1:0;
 if(!state.src.startsWith('[[',start+offset))return false;
 const end=state.src.indexOf(']]',start+offset+2);if(end<0)return false;
 const body=state.src.slice(start+offset+2,end);
 if(!body||body.includes('\n'))return false;
 if(!silent){const token=state.push('tw_wiki_label','',0);token.content=body.includes('|')?body.slice(body.indexOf('|')+1):body;}
 state.pos=end+2;return true;
});

// Obsidian highlight syntax; code spans and escaped delimiters remain literal.
markdown.inline.ruler.before('emphasis','tw_highlight',(state,silent)=>{
 const start=state.pos;if(!state.src.startsWith('==',start))return false;
 let end=start+2;
 for(;end<state.posMax;end++){
  if(state.src[end]==='\\'){end++;continue;}
  if(state.src[end]==='`'){
   const run=state.src.slice(end).match(/^`+/)![0];let close=state.src.indexOf(run,end+run.length);
   while(close>=0&&(state.src[close-1]==='`'||state.src[close+run.length]==='`'))close=state.src.indexOf(run,close+run.length);
   if(close>=0){end=close+run.length-1;continue;}
  }
  if(state.src.startsWith('==',end))break;
 }
 if(end===start+2||end>=state.posMax||state.src.slice(start+2,end).includes('\n'))return false;
 if(!silent){state.push('mark_open','mark',1);const inner:Token[]=[];state.md.inline.parse(state.src.slice(start+2,end),state.md,state.env,inner);state.tokens.push(...inner);state.push('mark_close','mark',-1);}
 state.pos=end+2;return true;
});

/** Only formatted text. URLs, HTML attributes and embed rendering never enter the output. */
export function labelParts(source:string):LabelPart[]{
 const parts:LabelPart[]=[];
 function visit(tokens:Token[],inherited:Format[]=[]){
  const formats=[...inherited];
  for(const token of tokens){
   if(['strong_open','em_open','s_open','mark_open'].includes(token.type)){formats.push(token.tag as Format);continue;}
   if(['strong_close','em_close','s_close','mark_close'].includes(token.type)){formats.pop();continue;}
   if(token.type==='image'){visit(token.children??[],formats);continue;}
   if(token.type==='text'||token.type==='tw_wiki_label'||token.type==='code_inline'){
    if(token.content)parts.push({text:token.content,formats:token.type==='code_inline'?[...formats,'code']:[...formats]});
   }else if(token.type==='softbreak'||token.type==='hardbreak')parts.push({text:' ',formats:[...formats]});
  }
 }
 visit(markdown.parseInline(source,{})[0]?.children??[]);return parts;
}
export function labelText(parts:LabelPart[]):string{return parts.map(p=>p.text).join('');}
export function renderLabel(parent:HTMLElement,parts:LabelPart[]):void {
 for(const part of parts){
  let element=parent;
  for(const format of part.formats){element=element.createEl(format);}
  element.appendChild(parent.ownerDocument.createTextNode(part.text));
 }
}
