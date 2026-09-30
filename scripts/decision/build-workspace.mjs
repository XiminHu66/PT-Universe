// A single classic script lets the life workspace become interactive without serial ESM fetches.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../../workers/pt-universe-api/package.json',import.meta.url));
const {build}=require('esbuild');
const target=new URL('../../apps/_decision/workspace.bundle.js',import.meta.url);
const result=await build({absWorkingDir:new URL('../../',import.meta.url).pathname,define:{'import.meta.url':'document.currentScript.src'},entryPoints:[new URL('../../apps/_decision/workspace.js',import.meta.url).pathname],bundle:true,format:'iife',platform:'browser',target:'es2022',write:false,logLevel:'silent'});
const content=result.outputFiles[0].text;
if(process.argv.includes('--check')){if(await readFile(target,'utf8')!==content)throw Error('Regenerate workspace.bundle.js with node scripts/decision/build-workspace.mjs');console.log('Workspace bundle matches source');}
else await writeFile(target,content);
