// On-demand, daily observations of the official public wishlist search order.
// No wishlist counts, followers, synthetic historical data or scheduled collector.
type RankItem={appid:number;rank:number;title:string;image?:string;release?:string;url?:string};
type RankEnv={DB:D1Database};
export async function rankTables(env:RankEnv){
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS deal_lab_rank_daily(day TEXT NOT NULL,appid INTEGER NOT NULL,rank INTEGER NOT NULL,title TEXT NOT NULL,PRIMARY KEY(day,appid))').run();
 await env.DB.prepare('CREATE INDEX IF NOT EXISTS deal_lab_rank_app ON deal_lab_rank_daily(appid,day)').run();
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS deal_lab_rank_pages(day TEXT NOT NULL,page INTEGER NOT NULL,total INTEGER NOT NULL,received INTEGER NOT NULL,checked_at TEXT NOT NULL,PRIMARY KEY(day,page))').run();
}
export async function recordRankPage(env:RankEnv,items:RankItem[],page:number,total:number,at=new Date().toISOString()){
 await rankTables(env);const day=at.slice(0,10);
 const previous=await env.DB.prepare('SELECT appid,rank FROM deal_lab_rank_daily WHERE day=(SELECT MAX(day) FROM deal_lab_rank_daily WHERE day<?)').bind(day).all<{appid:number;rank:number}>();
 const previousRanks=new Map((previous.results||[]).map(x=>[x.appid,x.rank]));
 // Four bindings per row: keep each statement below D1's 100-parameter limit
 // and a 100-row page well below the Free plan's per-invocation query budget.
 const inserts=[];for(let i=0;i<items.length;i+=25){const chunk=items.slice(i,i+25);inserts.push(env.DB.prepare('INSERT INTO deal_lab_rank_daily(day,appid,rank,title) VALUES '+chunk.map(()=>'(?,?,?,?)').join(',')+' ON CONFLICT(day,appid) DO UPDATE SET rank=excluded.rank,title=excluded.title').bind(...chunk.flatMap(x=>[day,x.appid,x.rank,x.title])));}
 await env.DB.batch([...inserts,env.DB.prepare('INSERT OR REPLACE INTO deal_lab_rank_pages(day,page,total,received,checked_at) VALUES(?,?,?,?,?)').bind(day,page,total,items.length,at)]);
 if(page===0){const cutoff=new Date(Date.parse(at)-35*86400000).toISOString().slice(0,10);await env.DB.prepare('DELETE FROM deal_lab_rank_daily WHERE day<?').bind(cutoff).run();await env.DB.prepare('DELETE FROM deal_lab_rank_pages WHERE day<?').bind(cutoff).run();}
 return {items:items.map(x=>({...x,previousRank:previousRanks.get(x.appid)??null,change:previousRanks.has(x.appid)?previousRanks.get(x.appid)!-x.rank:null})),snapshotStored:true,day,previousDayAvailable:previousRanks.size>0};
}
export async function readRankTrends(env:RankEnv,days=30,at=Date.now()){
 await rankTables(env);const since=new Date(at-(days-1)*86400000).toISOString().slice(0,10);
 const coverage=await env.DB.prepare('SELECT day,COUNT(*) AS pages,MAX(total) AS total,MIN(page) AS firstPage,MAX(page) AS lastPage,MAX(checked_at) AS checkedAt FROM deal_lab_rank_pages WHERE day>=? GROUP BY day ORDER BY day').bind(since).all<any>();
 const runs=(coverage.results||[]).map(x=>({...x,complete:Number(x.firstPage)===0&&Number(x.pages)===Math.ceil(Number(x.total)/100)&&Number(x.lastPage)===Math.ceil(Number(x.total)/100)-1}));
 const baseline=runs.find(x=>x.complete)?.day||null;
 const rows=await env.DB.prepare(`WITH stats AS (
 SELECT appid,MAX(title) AS title,AVG(rank) AS averageRank,MIN(rank) AS bestRank,COUNT(*) AS observedDays,MIN(day) AS firstSeen,MAX(day) AS lastSeen FROM deal_lab_rank_daily WHERE day>=? GROUP BY appid
 ) SELECT s.*,c.rank AS currentRank,f.rank AS firstRank FROM stats s JOIN deal_lab_rank_daily c ON c.appid=s.appid AND c.day=s.lastSeen JOIN deal_lab_rank_daily f ON f.appid=s.appid AND f.day=s.firstSeen ORDER BY s.averageRank LIMIT 15000`).bind(since).all<any>();
 const items=(rows.results||[]).map(x=>({...x,averageRank:Math.round(Number(x.averageRank)*10)/10,change:x.observedDays>1?Number(x.firstRank)-Number(x.currentRank):null,newEntryConfirmed:!!baseline&&x.firstSeen>baseline,url:'https://store.steampowered.com/app/'+x.appid+'/'}));
 return {items,windowDays:days,observedDays:runs.length,completeDays:runs.filter(x=>x.complete).length,coverage:runs,firstObserved:runs[0]?.day||null,lastObserved:runs.at(-1)?.day||null,newEntryBaseline:baseline,monthlyAddCountsAvailable:false,metric:'本工具实际观测日期的平均排名 / 涨幅 / 新上榜；不是官方月榜或新增愿望单人数',historyWarning:runs.length<days?`近${days}天仅观测${runs.length}天，完整榜单${runs.filter(x=>x.complete).length}天；历史正在积累，不补造过去的数据。`:null};
}
