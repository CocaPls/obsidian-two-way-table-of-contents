import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
await build({entryPoints:['src/main.ts'],outfile:'main.js',bundle:true,format:'cjs',platform:'browser',target:'es2022',external:['obsidian'],sourcemap:false, minify:false,banner:{js:'/*!\n'+readFileSync('THIRD_PARTY_NOTICES.md','utf8').replaceAll('*/','* /')+'\n*/'}});
