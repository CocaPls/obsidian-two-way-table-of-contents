import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const destination=process.argv[2];
if(!destination)throw new Error('Usage: npm run package -- /absolute/output/folder');
const manifest=JSON.parse(readFileSync('manifest.json','utf8'));
const pkg=JSON.parse(readFileSync('package.json','utf8'));
// The published ESLint preset checks source/package.json, not the manifest schema.
for(const key of ['id','name','version','minAppVersion','description','author'])if(typeof manifest[key]!=='string'||!manifest[key].trim())throw new Error(`Manifest requires ${key}.`);
if(!/^[a-z]+(?:-[a-z]+)*$/.test(manifest.id)||/obsidian|plugin$/.test(manifest.id))throw new Error('Invalid community plugin identifier.');
if(!/^[A-Za-z0-9 +()-]+$/.test(manifest.name)||/obsidian|plugin/i.test(manifest.name))throw new Error('Invalid community plugin name.');
if(typeof manifest.isDesktopOnly!=='boolean'||!/^\d+\.\d+\.\d+$/.test(manifest.minAppVersion))throw new Error('Invalid compatibility declaration.');
if(manifest.description.length>250||!manifest.description.endsWith('.'))throw new Error('Use a concise description of at most 250 characters ending in a period.');

const versions=JSON.parse(readFileSync('versions.json','utf8'));
if(pkg.version!==manifest.version||versions[manifest.version]!==manifest.minAppVersion)throw new Error('Package, manifest and compatibility versions must agree.');
if(!/^\d+\.\d+\.\d+$/.test(manifest.version))throw new Error('Use an x.y.z release tag matching manifest.version.');
for(const file of ['LICENSE','README.md','THIRD_PARTY_NOTICES.md'])if(!readFileSync(file,'utf8').trim())throw new Error(`Missing ${file}`);
const output=resolve(destination);if(output===process.cwd())throw new Error('Use a separate output directory.');
mkdirSync(output,{recursive:true});
const hashes=[];
for(const file of ['main.js','manifest.json','styles.css']){
 const data=readFileSync(file);writeFileSync(join(output,file),data);
 hashes.push(`${createHash('sha256').update(data).digest('hex')}  ${file}`);
}
writeFileSync(join(output,'SHA256SUMS'),hashes.join('\n')+'\n');
console.log(`Prepared ${manifest.version} in ${output}. No upload or publication performed.`);
