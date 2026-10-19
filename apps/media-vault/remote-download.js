export const VPS_APP='https://pt-media-hybrid.summer07-nanjolno.workers.dev/app/';
export function remoteTaskURL(kind,url=''){
 if(!['video','torrent','pikpak'].includes(kind))throw Error('不支持的远端任务');
 const value=String(url).trim();if(value.length>2048)throw Error('来源链接过长');
 if(value&&!/^https:\/\//i.test(value)&&!(['torrent','pikpak'].includes(kind)&&/^magnet:\?xt=urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})(?:&[^#\r\n]*)?$/i.test(value)))throw Error('请填写 HTTPS 链接或有效磁力链接');
 if(value.startsWith('https:')){const u=new URL(value);if(u.username||u.password||u.port||u.hash||!u.hostname.includes('.'))throw Error('请填写不含登录信息、端口或片段的 HTTPS 链接');}
 // Fragment is not transmitted in the HTTP request or Referrer; the account
 // page consumes and clears it. No Owner credential travels in this link.
 return VPS_APP+'#'+new URLSearchParams({kind,url:value});
}
