import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createCipheriv,createDecipheriv,randomUUID} from 'node:crypto';
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
export class Store{
 constructor(dir,{key}={}){
  mkdirSync(dir,{recursive:true,mode:0o700});const keyPath=dir+'/encryption.key';if(!key){if(!existsSync(keyPath))writeFileSync(keyPath,randomBytes(32),{mode:0o600,flag:'wx'});key=readFileSync(keyPath);}this.key=key;
  this.db=new DatabaseSync(dir+'/monitoring.sqlite');this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,parent TEXT,body TEXT NOT NULL,created TEXT NOT NULL);CREATE INDEX IF NOT EXISTS parent_kind ON records(parent,kind);`);
 }
 seal(value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',this.key,iv),b=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return [iv,c.getAuthTag(),b].map(x=>x.toString('base64')).join('.');}
 open(value){const [iv,tag,b]=value.split('.').map(x=>Buffer.from(x,'base64')),d=createDecipheriv('aes-256-gcm',this.key,iv);d.setAuthTag(tag);return JSON.parse(Buffer.concat([d.update(b),d.final()]));}
 put(kind,value,parent=null){const item={...value,id:value.id||randomUUID()},created=item.createdAt||new Date().toISOString();this.db.prepare('INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,parent=excluded.parent').run(item.id,kind,parent,this.seal(item),created);return item;}
 get(id,kind){const r=this.db.prepare('SELECT * FROM records WHERE id=?').get(id);return r&&(!kind||r.kind===kind)?this.open(r.body):null;}
 list(kind,parent=null,limit=500){const rs=parent===null?this.db.prepare('SELECT body FROM records WHERE kind=? ORDER BY created DESC LIMIT ?').all(kind,limit):this.db.prepare('SELECT body FROM records WHERE kind=? AND parent=? ORDER BY created DESC LIMIT ?').all(kind,parent,limit);return rs.map(r=>this.open(r.body));}
 deleteObject(id){this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('DELETE FROM records WHERE parent=? OR id=?').run(id,id);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
 prune(){const cut=new Date(Date.now()-30*86400000).toISOString();this.db.prepare("DELETE FROM records WHERE kind='check' AND created<?").run(cut);}
 close(){this.db.close();}
}
