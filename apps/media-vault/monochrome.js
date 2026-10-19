// Monochrome's own Tracks client uses these public search/track endpoints.
// No credentials, third-party mirror rotation or audio transcoding is involved.
export const MONOCHROME='https://tracks.monochrome.st';
export function trackURL(id){
 if(!/^[0-9]{1,24}$/.test(String(id)))throw Error('Monochrome 音轨编号无效');
 return MONOCHROME+'/track/'+id;
}
export async function searchMonochrome(query,{fetch:request=fetch,signal}={}){
 const q=String(query).trim();if(!q||q.length>200)throw Error('请输入 1–200 字的歌曲名或歌手');
 const r=await request(MONOCHROME+'/search/tracks?'+new URLSearchParams({q,limit:'20'}),{credentials:'omit',redirect:'error',signal:signal||AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Monochrome 搜索暂不可用：HTTP '+r.status);
 const text=await r.text();if(text.length>1024*1024)throw Error('Monochrome 返回结果过大');
 const d=JSON.parse(text);if(!Array.isArray(d.tracks))throw Error('Monochrome 返回格式不受支持');
 return {source:'Monochrome · 官方 Tracks 音源',items:d.tracks.slice(0,20).filter(t=>/^[0-9]{1,24}$/.test(String(t.trackId||t.id))).map(t=>({id:String(t.trackId||t.id),title:String(t.title||'未命名音轨'),artist:(t.artistNames||t.artists?.map(a=>a.name)||[]).join(' / '),album:String(t.albumTitle||t.releaseTitle||''),artwork:typeof t.artwork==='string'&&t.artwork.startsWith(MONOCHROME+'/')?t.artwork:'',available:t.playable!==false,url:trackURL(t.trackId||t.id)}))};
}
