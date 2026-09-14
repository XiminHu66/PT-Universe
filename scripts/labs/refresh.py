
from pathlib import Path
from datetime import datetime,timezone
import json,sys
import financials,games,events
ROOT=Path(__file__).resolve().parents[2]
def main():
 config=json.loads((Path(__file__).parent/"config.json").read_text())
 now=datetime.now(timezone.utc).isoformat()
 tasks=[("thesis-lab","financials.json",financials.collect,"companies"),("game-deals","deals.json",games.collect,"games"),("eastside-weekend","events.json",events.collect,"events")]
 failed=[]
 for app,file,fn,key in tasks:
  path=ROOT/"apps"/app/"data"/file
  old=json.loads(path.read_text()) if path.exists() else {}
  try:
   data=fn(config,old,now);path.parent.mkdir(parents=True,exist_ok=True)
   path.write_text(json.dumps(data,ensure_ascii=False,indent=2,allow_nan=False)+"\n")
   print("RESULT",app,len(data[key]),"fresh_sources",sum(s["ok"] for s in data["sources"]))
   if not data[key]:failed.append(app)
  except Exception as e:print("COLLECTOR FAILED",app,type(e).__name__,str(e));failed.append(app)
 if failed:raise SystemExit("No usable dataset for: "+", ".join(failed))
if __name__=="__main__":main()
