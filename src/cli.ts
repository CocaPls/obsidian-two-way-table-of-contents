import type TwoWayToc from './main';
import {APPEARANCE_KEYS,BLOCK_KEYS,DEFAULTS,Settings,TocOverrides,blockSettings,insertionBlock,settingsReport,tocDiagnostics} from './model';
import {documentSnapshot,headingLink,sectionRange,tocText,duplicateLinks} from './actions';
import {TocFolding} from './folding';
type Params=Record<string,string>;
interface Environment {version:string;settings:Settings;globalData:Record<string,unknown>;errors:string[];read:(path:string)=>Promise<string|null>}
class CliError extends Error {constructor(public code:string,message:string){super(message);}}
const fail=(code:string,message:string):never=>{throw new CliError(code,message);};
function integer(value:string|undefined,key:string,min=1,max=Number.MAX_SAFE_INTEGER){if(value===undefined||!/^\d+$/.test(value)||Number(value)<min||Number(value)>max)fail('INVALID_ARGUMENT',`${key}: expected an integer from ${min} to ${max}`);return Number(value);}
export async function sourceHash(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');}
export async function executeCli(action:string,params:Params,env:Environment){
 const envelope={schemaVersion:1,pluginVersion:env.version};
 try{
  const options=['path','blockLine'],allowed:Record<string,string[]>={inspect:options,validate:options,section:['path','headingLine','expectedHash','maxChars'],export:[...options,'style'],block:Object.keys(BLOCK_KEYS).filter(k=>APPEARANCE_KEYS.includes(BLOCK_KEYS[k] as typeof APPEARANCE_KEYS[number]))};
  if(!allowed[action])fail('UNKNOWN_COMMAND','Unknown command');
  for(const key of Object.keys(params))if(key!=='vault'&&!allowed[action].includes(key))fail('UNKNOWN_ARGUMENT',`Unknown argument: ${key}`);
  if(action==='block'){
   const overrides:TocOverrides={};
   for(const [key,value] of Object.entries(params)){
    if(key==='vault')continue;const name=BLOCK_KEYS[key] as keyof TocOverrides;let parsed:unknown=value;
    if(typeof DEFAULTS[name]==='boolean'){if(value!=='true'&&value!=='false')fail('INVALID_OPTION',`${key}: expected true or false`);parsed=value==='true';}
    if(typeof DEFAULTS[name]==='number'){if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value))fail('INVALID_OPTION',`${key}: expected a number`);parsed=Number(value);}
    (overrides as Record<string,unknown>)[name]=parsed;
   }
   const result=insertionBlock(overrides,env.settings);if(result.errors.length)fail('INVALID_OPTION',result.errors.join('; '));
   return {...envelope,ok:true,block:result.block};
  }
  const path=params.path;if(!path||path.startsWith('/')||path.split('/').some(p=>p==='..'||p==='.'||!p))fail('INVALID_PATH','Use an exact vault-relative file path');
  const text=await env.read(path);if(text===null)fail('FILE_NOT_FOUND','File not found');
  const snap=documentSnapshot(text!,env.settings),hash=await sourceHash(text!),common={...envelope,ok:true,path,sourceKind:'vault-file',sourceHash:hash};
  if(action==='section'){
   if(!params.expectedHash)fail('INVALID_ARGUMENT','expectedHash is required');
   if(params.expectedHash!==hash)fail('STALE_SOURCE','The source changed; inspect it again');
   const line=integer(params.headingLine,'headingLine')-1,range=sectionRange(snap,line);if(!range)fail('HEADING_NOT_FOUND','No heading starts at headingLine');
   const max=integer(params.maxChars??'20000','maxChars',1,1000000),content=range!.text;
   return {...common,startLine:range!.start+1,endLineExclusive:range!.end+1,totalChars:content.length,truncated:content.length>max,text:content.slice(0,max)};
  }
  const blockLine=params.blockLine===undefined?undefined:integer(params.blockLine,'blockLine');
  const blocks=blockLine===undefined?snap.blocks:snap.blocks.filter(b=>b.line===blockLine-1);
  if(blockLine!==undefined&&!blocks.length)fail('BLOCK_NOT_FOUND','No TOC starts at blockLine');
  const diagnostics=[...env.errors.map(message=>({scope:'global',severity:'error',code:'INVALID_SETTING',message})),...blocks.flatMap(b=>tocDiagnostics(b,env.settings).map(d=>({...d,scope:'block',blockLine:b.line+1,line:d.line===undefined?b.line+1:b.line+d.line+1})))];
  if(action==='validate')return {...common,valid:!diagnostics.some(d=>d.severity==='error'),hasToc:snap.blocks.length>0,headingCount:snap.headings.length,includedCount:snap.items.length,diagnostics};
  if(action==='export'){
   const style=params.style??'markdown';if(style!=='markdown'&&style!=='text')fail('INVALID_ARGUMENT','style must be markdown or text');
   return {...common,style,text:tocText(snap.items,style as 'markdown'|'text',item=>headingLink(path,item)),warnings:style==='markdown'&&duplicateLinks(snap.items)?['DUPLICATE_HEADING_LINKS']:[]};
  }
  const tree=new TocFolding();tree.update(snap.items,0);const indexed=new Map(tree.nodes.map(n=>[n.item.line,n]));
  return {...common,settings:settingsReport(env.settings,env.globalData),hasToc:snap.blocks.length>0,headingCount:snap.headings.length,truncated:snap.headings.length>5000,
   headings:snap.headings.slice(0,5000).map(h=>{const node=indexed.get(h.position.start.line);return {headingLine:h.position.start.line+1,sourceHeading:h.heading,level:h.level,included:!!node,...(node?{label:node.item.label,number:node.item.number,parentLine:node.parent<0?null:tree.nodes[node.parent].item.line+1}:{exclusionReason:'heading-range'})};}),
   blocks:blocks.map(b=>{const options=blockSettings(b.source,env.settings);return {blockLine:b.line+1,endLine:(b.endLine??b.line)+1,settings:settingsReport(options.settings,env.globalData,options)};}),diagnostics};
 }catch(error){return {...envelope,ok:false,error:{code:error instanceof CliError?error.code:'READ_FAILED',message:error instanceof Error?error.message:String(error)}};}
}
export function registerCli(plugin:TwoWayToc){
 const flags={path:{value:'path',description:'Exact vault-relative Markdown path',required:true},blockLine:{value:'n',description:'TOC opening fence line (1-based)'}};
 for(const action of ['inspect','validate','section','block','export']){
  const options=action==='block'?Object.fromEntries(Object.keys(BLOCK_KEYS).filter(k=>APPEARANCE_KEYS.includes(BLOCK_KEYS[k] as typeof APPEARANCE_KEYS[number])).map(k=>[k,{value:'value',description:`TOC override: ${k}`}])):action==='section'?{path:flags.path,headingLine:{value:'n',description:'Heading line (1-based)',required:true},expectedHash:{value:'sha256',description:'Source hash from inspect',required:true},maxChars:{value:'n',description:'Maximum characters, default 20000'}}:action==='export'?{...flags,style:{value:'markdown|text',description:'Output style'}}:flags;
  plugin.registerCliHandler(`${plugin.manifest.id}:${action}`,`Table of contents: ${action} (JSON)`,options,async params=>JSON.stringify(await executeCli(action,params,{version:plugin.manifest.version,settings:plugin.settings,globalData:plugin.globalData,errors:plugin.settingsErrors,read:async path=>{const file=plugin.app.vault.getFileByPath(path);return file&&file.extension==='md'?plugin.app.vault.read(file):null;}})));
 }
}
