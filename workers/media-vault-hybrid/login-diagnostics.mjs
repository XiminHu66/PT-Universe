import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.D1_TOKEN;
assert.ok(account&&token);
const sql="SELECT EXISTS(SELECT 1 FROM mv_hybrid_login_config WHERE id='github') AS configured, EXISTS(SELECT 1 FROM mv_hybrid_login_flows WHERE kind='setup' AND consumed=1) AS setup_callback_seen, EXISTS(SELECT 1 FROM mv_hybrid_login_flows WHERE kind='login' AND consumed=1) AS login_callback_seen, EXISTS(SELECT 1 FROM mv_hybrid_login_connections WHERE status='error') AS failed_connection, EXISTS(SELECT 1 FROM mv_hybrid_app_sessions WHERE account_id='media-vault-personal' AND pair_code LIKE 'oauth:%') AS authenticated_parent_created";
const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/d1/database/86805c79-d903-46cd-b0e2-c079c1a7fc1a/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params:[]}),redirect:'error',signal:AbortSignal.timeout(20000)});
const d=await r.json();assert.ok(r.ok&&d.success===true&&d.result?.length===1&&d.result[0].success!==false,'Read-only login diagnosis unavailable');
const row=d.result[0].results?.[0];assert.ok(row);
const safe={};for(const key of ['configured','setup_callback_seen','login_callback_seen','failed_connection','authenticated_parent_created']){assert.ok([0,1].includes(row[key]));safe[key]=Boolean(row[key]);}
console.log('LOGIN_STAGE_DIAGNOSIS',JSON.stringify(safe));
console.log('PASS SELECT-only stage flags; no credential, identity, request ID, grant, consent, task, ticket or file accessed');
