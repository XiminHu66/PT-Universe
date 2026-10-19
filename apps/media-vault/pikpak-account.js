export function mountPikPak({client,$,note,current,reload}){
 let accounts=[],busy=false,epoch=0;
 function render(state){
  const personal=state.scope==='personal-vps-downloads'&&state.status==='approved'&&!state.unverified;
  $('pikpakAccounts').hidden=!personal;$('pikpakAccountFields').disabled=!personal||!state.can_submit||busy;
  if(!personal){++epoch;$('pikpakToken').value='';$('pikpakPassword').value='';$('pikpakUsername').value='';$('pikpakStoreCredentials').checked=false;accounts=[];$('pikpakProfile').replaceChildren();}
 }
 async function refresh(){
  if(current().scope!=='personal-vps-downloads')return;
  const generation=epoch,d=await client.read('/pikpak/accounts');if(generation!==epoch||current().status!=='approved'||current().scope!=='personal-vps-downloads')return;accounts=d.accounts||[];
  const selected=$('pikpakProfile').value;
  $('pikpakProfile').replaceChildren();
  for(const a of accounts){const option=$('pikpakProfile').ownerDocument.createElement('option');option.value=a.id;option.textContent=a.label+(a.auth_type==='rclone'?' · 可确认永久删除':' · PAT / 回收站');$('pikpakProfile').append(option);}
  if(accounts.some(a=>a.id===selected))$('pikpakProfile').value=selected;
  $('pikpakAccountStatus').textContent=accounts.length?'已连接 '+accounts.length+' 个账号；额度按账号独立计算，不会自动绕过限制。':'尚未连接账号；添加后选择该账号提交视频链接。';
 }
 $('pikpakAccountForm').onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;render(current());
  try{
   const label=$('pikpakLabel').value.trim(),full=$('pikpakAuthType').value==='rclone';
   if(!label||label.length>24)throw Error('请填写账号昵称。');
   let spec={kind:'pikpak-account',label};
   if(full){const username=$('pikpakUsername').value.trim(),password=$('pikpakPassword').value;
    if(!username||!password||!$('pikpakStoreCredentials').checked)throw Error('请填写登录信息，并确认在 VPS 加密保存。');
    spec={...spec,auth_type:'rclone',username,password,store_credentials:true};
   }else{const token=$('pikpakToken').value.trim();if(token.length<20||token.length>4096||/\s/.test(token))throw Error('请填写有效的个人访问令牌。');spec.token=token;}
   const result=await client.submit(spec);
   $('pikpakToken').value='';$('pikpakPassword').value='';$('pikpakUsername').value='';$('pikpakStoreCredentials').checked=false;note('账号验证已提交：'+result.id+'。验证成功后会出现在账号选择中。');await reload();
  }catch(e){note(e.message,true);}finally{busy=false;render(current());}
 };
 function authMode(){const full=$('pikpakAuthType').value==='rclone';$('pikpakFullFields').hidden=!full;$('pikpakPatFields').hidden=full;$('pikpakUsername').required=full;$('pikpakPassword').required=full;$('pikpakStoreCredentials').required=full;$('pikpakToken').required=!full;$('pikpakToken').value='';$('pikpakPassword').value='';}
 $('pikpakAuthType').onchange=authMode;authMode();
 return {render,refresh};
}
