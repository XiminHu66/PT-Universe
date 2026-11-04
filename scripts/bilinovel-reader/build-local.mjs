import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../../apps/bilinovel-reader/',import.meta.url),core=readFileSync(new URL('core.js',root),'utf8');
writeFileSync(new URL('source-cleaner.js',root),core+'\n__PT_BILINOVEL_LOCAL_V2.boot();\n');
const hosts=['www.bilinovel.net','bilinovel.net','www.bilinovel.com','bilinovel.com','www.linovelib.com','tw.linovelib.com','w.linovelib.com'];
const header=['// ==UserScript==','// @name         PT 净读 · Bilinovel 原站版','// @namespace    https://ximinhu66.github.io/PT-Universe/','// @version      2.0.0','// @description  在原站本机净化阅读，不调用代理、VPS 或模型接口。',...hosts.map(h=>'// @match        https://'+h+'/*'),'// @run-at       document-idle','// @grant        none','// @noframes','// ==/UserScript=='];
writeFileSync(new URL('pt-bilinovel.user.js',root),header.join('\n')+'\n'+core+'\n__PT_BILINOVEL_LOCAL_V2.boot("extension");\n');
console.log('Local reader generated: standalone bookmark script and self-contained userscript.');
