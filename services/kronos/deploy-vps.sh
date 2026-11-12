#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "$EUID" == 0 && "$(uname -m)" == aarch64 ]]
stage=$1
revision=$2
[[ "$stage" =~ ^/tmp/pt-kronos-deploy\.[A-Za-z0-9]{8}$ && -d "$stage" && "$revision" =~ ^[a-f0-9]{40}$ ]]
cd /srv/pt-universe/stacks/tools-hub
compose(){ docker compose --env-file .env -f compose.yml "$@"; }
kronos(){ docker compose -p pt-kronos -f kronos-compose.yml "$@"; }
python3 - <<'PY'
import shutil
from pathlib import Path
disk = shutil.disk_usage('/')
memory = {line.split(':')[0]: int(line.split()[1])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith(('MemTotal:', 'MemAvailable:'))}
assert disk.free - 3*1024**3 > disk.total*.15
assert memory['MemAvailable'] - 3*1024**3 > memory['MemTotal']*.15
PY
echo 'PASS: VPS capacity preflight'

backup=$(mktemp -d .kronos-rollback.XXXXXXXX)
cp -a compose.yml "$backup/"
if [[ -f kronos-compose.yml ]]; then cp -a kronos-compose.yml "$backup/"; fi
old_service=$(docker inspect pt-kronos --format '{{.State.Running}}' 2>/dev/null || true)
gateway_changed=0
service_changed=0
rollback(){
  code=$?
  trap - ERR
  set +e
  if [[ "$gateway_changed" == 1 ]]; then
    cp -a "$backup/compose.yml" compose.yml
    compose up -d --no-deps --no-build hub-gateway >/dev/null 2>&1
  fi
  if [[ "$service_changed" == 1 ]]; then
    if [[ "$old_service" == true && -f "$backup/kronos-compose.yml" ]]; then
      cp -a "$backup/kronos-compose.yml" kronos-compose.yml
      kronos up -d --no-build >/dev/null 2>&1
    else
      kronos down >/dev/null 2>&1
      if [[ -f "$backup/kronos-compose.yml" ]]; then
        cp -a "$backup/kronos-compose.yml" kronos-compose.yml
      else
        rm -f kronos-compose.yml
      fi
    fi
  fi
  echo 'Kronos deployment failed; previous gateway and service configuration restored'
  exit "$code"
}
trap rollback ERR

docker build -t "pt-kronos:$revision" "$stage/runtime" >"$backup/build.log" 2>&1
install -d -m 700 -o 1000 -g 1000 /srv/pt-universe/data/kronos
network=$(docker inspect pt-tools-hub-gateway --format '{{range $name,$v := .NetworkSettings.Networks}}{{println $name}}{{end}}' | sed -n '1p')
[[ "$network" =~ ^[A-Za-z0-9_-]+$ ]]
service_changed=1
cat > kronos-compose.yml <<YAML
services:
  model:
    image: pt-kronos:$revision
    container_name: pt-kronos
    restart: unless-stopped
    init: true
    read_only: true
    user: '1000:1000'
    cpus: 0.5
    mem_limit: 3g
    memswap_limit: 3g
    pids_limit: 96
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    tmpfs:
      - /tmp:rw,nosuid,nodev,size=256m,mode=1777
    volumes:
      - /srv/pt-universe/data/kronos:/data
    networks: [hub]
    logging:
      driver: json-file
      options: {max-size: 2m, max-file: '2'}
    healthcheck:
      test: [CMD, python, -c, "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=3).read()"]
      interval: 30s
      timeout: 5s
      start_period: 12s
      retries: 3
networks:
  hub:
    external: true
    name: $network
YAML
kronos config -q
kronos up -d --wait --wait-timeout 90 >/dev/null 2>&1
echo 'PASS: bounded private Kronos runtime healthy'

mkdir -m 700 "$stage/gateway"
current=$(docker inspect pt-tools-hub-gateway --format '{{.Image}}')
docker tag "$current" "pt-kronos-gateway-parent:$revision"
docker cp pt-tools-hub-gateway:/app/router.mjs "$stage/gateway/router.mjs"
cp "$stage/runtime/gateway.mjs" "$stage/gateway/kronos.mjs"
python3 - "$stage/gateway/router.mjs" <<'PY'
from pathlib import Path
import sys
path=Path(sys.argv[1])
source=path.read_text()
if "from './kronos.mjs'" not in source:
    handler='  const server=http.createServer(async(req,res)=>{\n    const url=new URL(req.url,siteOrigin);'
    assert source.count(handler)==1,'expected one main HTTP handler'
    source="import {createKronosGateway} from './kronos.mjs';\n"+source
    source=source.replace(handler,'  const kronos=createKronosGateway({siteOrigin});\n'+handler+'\n    if(await kronos(req,res,url))return;')
path.write_text(source)
PY
cat > "$stage/gateway/Dockerfile" <<DOCKER
FROM pt-kronos-gateway-parent:$revision
WORKDIR /app
USER root
COPY --chown=node:node router.mjs kronos.mjs ./
USER node
CMD ["node","router.mjs"]
DOCKER
docker build -t "pt-kronos-gateway:$revision" "$stage/gateway" >"$backup/gateway-build.log" 2>&1
gateway_changed=1
python3 - "$revision" <<'PY'
import re,sys
from pathlib import Path
p=Path('compose.yml')
lines=p.read_text().splitlines()
inside=False
replaced=0
for i,line in enumerate(lines):
    if re.match(r'^  [a-zA-Z0-9_-]+:',line):
        inside=line=='  hub-gateway:'
    if inside and line.startswith('    image:'):
        lines[i]='    image: pt-kronos-gateway:'+sys.argv[1]
        replaced+=1
assert replaced==1
p.write_text('\n'.join(lines)+'\n')
PY
compose config -q
compose up -d --no-deps --wait --wait-timeout 90 hub-gateway >/dev/null 2>&1
compose exec -T hub-gateway node --input-type=module - <<'JS'
import assert from 'node:assert/strict';
const origin='https://pt-vps-tools.h1nano.chatgpt.site', root='http://127.0.0.1:8899';
const get=(path,headers={origin})=>fetch(root+path,{headers,signal:AbortSignal.timeout(8000)});
const status=await get('/hub/api/kronos?symbol=QQQ');
assert.equal(status.status,200);
const result=await status.json();
assert.match(result.session,/^\d{4}-\d{2}-\d{2}$/);
assert.ok(['fresh','stale','empty','running'].includes(result.state));
assert.equal((await get('/hub/api/kronos?symbol=QQQ',{})).status,403);
assert.equal((await get('/hub/api/kronos?symbol=QQQ&symbol=AMD')).status,400);
assert.equal((await get('/hub/api/on-demand/stock?symbol=NVDA')).status,200);
assert.equal((await get('/hub/status')).status,200);
console.log('PASS: Kronos route, access boundaries and existing hub/data routes verified');
JS
trap - ERR
echo 'PASS: Kronos VPS deployment complete'
