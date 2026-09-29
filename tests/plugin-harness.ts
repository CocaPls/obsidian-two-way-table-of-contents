import {buildSync} from 'esbuild';
import {runInNewContext} from 'node:vm';
import {DEFAULTS} from '../src/model';

// Run production methods with isolated adapters, without an Obsidian app or vault.
const code=buildSync({entryPoints:['src/main.ts'],bundle:true,format:'cjs',platform:'node',external:['obsidian'],write:false}).outputFiles[0].text;
const module={exports:{} as any};
export const notices:string[]=[];
export class PreviewElement {
 nodeType=1;
 isConnected=true;
 getBoundingClientRect(){return {top:0,bottom:100,height:100};}
}
runInNewContext(code,{module,exports:module.exports,HTMLElement:PreviewElement,window:{setTimeout,clearTimeout},require:(id:string)=>{
 if(id!=='obsidian')throw new Error(`Unexpected dependency: ${id}`);
 return {getLanguage:()=> 'ko',FuzzySuggestModal:class {},Modal:class {},Plugin:class {},MarkdownView:class {},PluginSettingTab:class {},Notice:class {constructor(message:string){notices.push(message);}}};
}});
export function pluginHarness(){
 return Object.assign(Object.create(module.exports.default.prototype),{
  manifest:{id:'two-way-table-of-contents',name:'Test',version:'test'},registerCliHandler:()=>{},registerHoverLinkSource:()=>{},lastHost:new WeakMap(),settings:{...DEFAULTS},savedSettings:{...DEFAULTS},globalData:{},settingsErrors:[],models:new Map(),timers:new Map(),reads:new Map(),fileRevisions:new Map(),settingsRevision:0,hosts:new WeakMap(),folds:new WeakMap(),stopped:false,revision:0,navigation:0,
  schedule:()=>{},paint:()=>{},headingElements:()=>[],manualNumbers:{retain:()=>{}},
 });
}
