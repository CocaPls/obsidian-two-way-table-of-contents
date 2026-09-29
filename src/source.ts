import MarkdownIt from 'markdown-it';

// HTML is recognized only to identify source blocks. These tokens are never rendered.
const structure=new MarkdownIt({html:true,linkify:false,typographer:false});

/** Mask Obsidian comments without moving source lines or interpreting code examples. */
function visibleSource(text:string){
 const original=text.split('\n'),rows=[...original];let front=rows[0]?.trim()==='---';
 for(let line=0;front&&line<rows.length;line++){
  const end=line>0&&/^(---|\.\.\.)\s*$/.test(rows[line]);rows[line]=' '.repeat(rows[line].length);if(end)front=false;
 }
 const source=rows.join('\n'),masked=source.split(''),offsets=[0];
 for(const row of rows)offsets.push(offsets[offsets.length-1]+row.length+1);
 const literalBlocks=new Map(structure.parse(source,{}).filter(t=>t.map&&['fence','code_block','html_block'].includes(t.type)).map(t=>[offsets[t.map![0]],Math.min(source.length,offsets[t.map![1]])]));
 let fence:{char:string;length:number}|undefined;
 for(let i=0;i<source.length;){
  if(i===0||source[i-1]==='\n'){
   const literalEnd=literalBlocks.get(i);if(!fence&&literalEnd!==undefined){i=literalEnd;continue;}
   const end=source.indexOf('\n',i),line=source.slice(i,end<0?source.length:end);
   const marker=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
   if(fence){if(marker&&marker[1][0]===fence.char&&marker[1].length>=fence.length&&!marker[2].trim())fence=undefined;i=end<0?source.length:end+1;continue;}
   if(marker&&(marker[1][0]!=='`'||!marker[2].includes('`'))){fence={char:marker[1][0],length:marker[1].length};i=end<0?source.length:end+1;continue;}
   if(/^(?: {4}|\t)/.test(line)){i=end<0?source.length:end+1;continue;}
  }
  if(source[i]==='\\'){i+=2;continue;}
  if(source.startsWith('<!--',i)){const end=source.indexOf('-->',i+4);i=end<0?source.length:end+3;continue;}
  if(source[i]==='`'){
   const run=source.slice(i).match(/^`+/)![0];let end=source.indexOf(run,i+run.length);
   while(end>=0&&(source[end-1]==='`'||source[end+run.length]==='`'))end=source.indexOf(run,end+run.length);
   i=end<0?i+run.length:end+run.length;continue;
  }
  if(source.startsWith('%%',i)){
   const lineStart=source.lastIndexOf('\n',i-1)+1,lineEnd=source.indexOf('\n',i);
   const end=source.indexOf('%%',i+2),stop=end<0?source.length:end+2;
   // A comment starting a block can span blocks. Inline comments stay within their line.
   if(!source.slice(lineStart,i).trim()){
    for(let j=i;j<stop;j++)if(source[j]!=='\n'&&source[j]!=='\r')masked[j]=' ';
    i=stop;
   }else i=end>=0&&(lineEnd<0||end<lineEnd)?stop:lineEnd<0?source.length:lineEnd+1;
   continue;
  }

  i++;
 }
 const visible=masked.join(''),visibleRows=visible.split('\n');
 return {visible,hidden:new Set(original.flatMap((row,line)=>row!==visibleRows[line]?[line]:[]))};
}

export function parseSource(text:string){const {visible,hidden}=visibleSource(text);return {tokens:structure.parse(visible,{}),hidden};}
