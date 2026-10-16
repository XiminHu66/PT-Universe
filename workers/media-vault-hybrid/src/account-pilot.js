// Fixed public recipes for one bounded, explicitly approved metadata pilot.
// No live task or account access is created by importing this module.
export const PILOT_JOBS=4;
export const PILOT_PRESETS=[
 {label:'小说：单章纯文字 EPUB',spec:{kind:'novel',url:'https://www.wenku8.net/book/3551.htm',indices:[1],text_only:true}},
 {label:'图片：两页已许可 Commons CBZ',spec:{kind:'manga',title:'國防online 漫畫敘花蓮震災',files:['File:國防online漫畫敘花蓮震災 01.jpg','File:國防online漫畫敘花蓮震災 02.jpg']}},
 {label:'视频：五秒样例',spec:{kind:'video',url:'https://download.samplelib.com/mp4/sample-5s.mp4'}},
 {label:'BT：仓库自有 WebSeed 小文件',spec:{kind:'torrent',url:'https://raw.githubusercontent.com/XiminHu66/PT-Universe/6571b98d8abc313d67bcebf29b25168414793c02/workers/media-vault-hybrid/fixtures/owned-webseed.torrent'}}
];
const stable=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const pilotPermits=spec=>PILOT_PRESETS.some(p=>stable(p.spec)===stable(spec));
