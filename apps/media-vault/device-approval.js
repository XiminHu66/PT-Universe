// Public connection IDs only. This URL never contains a cookie, key or token.
export const APPROVAL_REPOSITORY='XiminHu66/PT-Universe';
export const APPROVAL_OWNER='XiminHu66';
export const APPROVAL_OWNER_ID=36136585;
export const APPROVAL_PREFIX='[Media Vault] 确认设备 ';
export function approvalBody(id,remember){
 if(!/^[a-f0-9]{24}$/.test(id||'')||typeof remember!=='boolean')throw Error('设备连接编号无效，请重新连接。');
 return `我确认这是我的浏览器，并授权此设备使用 Media Vault 下载任务及文件保存。\n\n设备编号：${id}\n设备保留：${remember?'30 天':'本次连接（最长 24 小时）'}\n权限范围：personal-vps-downloads\n\n提交此确认单后请返回 Media Vault，连接会自动完成。\n此确认不授予 VPS 管理或服务密钥访问权限。`;
}
export function selfApprovalURL(id,remember){
 const body=approvalBody(id,remember),url=new URL('https://github.com/'+APPROVAL_REPOSITORY+'/issues/new');
 url.searchParams.set('title',APPROVAL_PREFIX+id);url.searchParams.set('body',body);return url.href;
}
