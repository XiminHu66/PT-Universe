export function mountPikPak({client,$,note,current,reload}){
 let accounts=[],busy=false,epoch=0;
 function render(state){
  const personal=state.scope==='personal-vps-downloads'&&state.status==='approved'&&!state.unverified;
  $('pikpakAccounts').hidden=!personal;$('pikpakAccountFields').disabled=!personal||!state.can_submit||busy;
  if(!personal){++epoch;$('pikpakToken').value='';accounts=[];$('pikpakProfile').replaceChildren();}
 }
 async function refresh(){
  if(current().scope!=='personal-vps-downloads')return;
  const generation=epoch,d=await client.read('/pikpak/accounts');if(generation!==epoch||current().status!=='approved'||current().scope!=='personal-vps-downloads')return;accounts=d.accounts||[];
  const selected=$('pikpakProfile').value;
  $('pikpakProfile').replaceChildren();
  for(const a of accounts){const option=$('pikpakProfile').ownerDocument.createElement('option');option.value=a.id;option.textContent=a.label;$('pikpakProfile').append(option);}
  if(accounts.some(a=>a.id===selected))$('pikpakProfile').value=selected;
  $('pikpakAccountStatus').textContent=accounts.length?'已连接 '+accounts.length+' 个账号；额度按账号独立计算，不会自动绕过限制。':'尚未连接账号；添加后选择该账号提交视频链接。';
 }
 $('pikpakAccountForm').onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;render(current());
  try{
   const token=$('pikpakToken').value.trim(),label=$('pikpakLabel').value.trim();
   if(!label||label.length>24||token.length<20||token.length>4096||/\s/.test(token))throw Error('请填写账号昵称和有效的个人访问令牌。');
   const result=await client.submit({kind:'pikpak-account',label,token});
   $('pikpakToken').value='';note('账号验证已提交：'+result.id+'。验证成功后会出现在账号选择中。');await reload();
  }catch(e){note(e.message,true);}finally{busy=false;render(current());}
 };
 return {render,refresh};
}
