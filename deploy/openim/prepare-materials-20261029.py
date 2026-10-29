"""One-off preparation from the audited dsh-team deployment; no live data writes.
Run on the existing host with a verified source checkout argument, then review
the generated prepare/deploy scripts. Keeps private baseline receipts on host.
"""
from pathlib import Path
import hashlib, json, shutil, sys

source = Path(sys.argv[1]).resolve()
revision = sys.argv[2]
old = Path('/opt/research-openim/ops/dsh-team-20261028')
ops = Path('/opt/research-openim/ops/materials-workbench-20261029')
assert len(revision) == 40 and all(c in '0123456789abcdef' for c in revision)
assert not ops.exists()
ops.mkdir(mode=0o700)
base = 'sha256:3162c814d4e6a0d3c7cfdf8276145e1a53cadfff0184b809b8a6523043e209a0'
name = ops.name
sha = lambda b: hashlib.sha256(b).hexdigest()
def write(name, text):
    target = ops / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')

baseline = json.loads((old/'baseline-manifest.json').read_text())
baseline['files'].update(json.loads((old/'source-final.json').read_text())['sourceHashes'])
overlay = {}
for folder in ['apps/api/src', 'packages/contracts/src']:
    for file in sorted((source/folder).rglob('*.ts')):
        key = file.relative_to(source).as_posix()
        if key == 'apps/api/src/community-catalog-seed.ts':
            continue
        data = file.read_text(encoding='utf-8').replace('\r\n','\n')
        if sha(data.encode()) != baseline['files'].get(key):
            write('overlay/'+key, data)
            overlay[key] = sha(data.encode())
key = 'packages/contracts/package.json'
data = (source/key).read_text(encoding='utf-8').replace('\r\n','\n')
write('overlay/'+key, data)
overlay[key] = sha(data.encode())
baseline['absent'] = [f for f in overlay if f not in baseline['files']]
write('baseline-manifest.json', json.dumps(baseline))
write('manifest.json', json.dumps({'productRevision':revision,'baseImageId':base,'overlay':overlay,'schema':30,'contract':'0.38.0'}))
for file in ['baseline-guard.mjs','settings.py','config-proof.py','audit.mjs','source-check.mjs','copy-api-check.mjs','summary.py']:
    text = (old/file).read_text().replace('0.37.0','0.38.0')
    if file == 'source-check.mjs':
        text = text.replace('assert(c.routes.teamWork&&c.routes.workContext)', 'assert(c.routes.teamWork&&c.routes.workContext&&c.routes.beginResearchUpload)')
    if file == 'summary.py':
        text = text.replace('dsh-team-20261028',name).replace('620b4e883b3169fd1b7934f5646210a1c04a9af8',revision)
        text = text.replace('sha256:f58bf538a099a383b35993bf73eeb2a4ca66c5a2c11b4c529af61f8dd862ec52',base)
        text = text.replace("'migrationRun':True", "'migrationRun':False")
        # No migration or fallback image is needed; receipts verify an unchanged 030 copy.
        text = text.replace("'fallbackImage':(p/'fallback-image.txt').read_text().strip()", "'fallbackImage':None")
    write(file,text)
write('Dockerfile',f'''FROM research-openim-api:dsh-team-20261028
COPY baseline-guard.mjs /tmp/agent-conversation-baseline-guard.mjs
COPY baseline-manifest.json /tmp/agent-conversation-baseline.json
RUN node /tmp/agent-conversation-baseline-guard.mjs
COPY overlay/ /app/
RUN pnpm --config.verify-deps-before-run=false --filter @research-agent-platform/contracts build && pnpm --config.verify-deps-before-run=false --filter @research-agent-platform/api build
LABEL org.opencontainers.image.revision="{revision}"
''')
tests = ['research-library','local-dsh','work-context','team-work','personal-models','chat-message-actions']
tests = ['apps/api/tests/'+t+'.spec.ts' for t in tests if (source/'apps/api/tests'/(t+'.spec.ts')).exists()]
write('prepare.sh',f'''#!/bin/bash
set -Eeuo pipefail
umask 077
ops={ops}
image=research-openim-api:{name}
for c in research-openim-production-research-api-1 research-openim-production-research-worker-1; do
 [[ "$(docker inspect "$c" --format '{{{{.Image}}}}')" == {base} ]]
done
[[ $(df --output=avail -B1 /srv | tail -1) -gt 4294967296 ]]
docker build --pull=false --network none -f "$ops/Dockerfile" -t "$image" "$ops" > "$ops/build.log" 2>&1
docker image inspect "$image" --format '{{{{.Id}}}}' > "$ops/new-image.txt"
docker run --rm --network none -v "$ops:/ops:ro" "$image" node /ops/source-check.mjs > "$ops/source-check.json"
docker run --rm --network none --memory 1536m -v "{source}/apps/api/tests:/app/apps/api/tests:ro" "$image" pnpm --config.verify-deps-before-run=false exec vitest run {' '.join(tests)} --maxWorkers=1 > "$ops/isolated-tests.log" 2>&1
printf 'PREPARATION_OK\\n' > "$ops/preparation-ok.txt"
tail -8 "$ops/isolated-tests.log"
''')
text = (old/'deploy.sh').read_text().replace('dsh-team-20261028',name).replace('0.37.0','0.38.0')
text = text.replace('sha256:f58bf538a099a383b35993bf73eeb2a4ca66c5a2c11b4c529af61f8dd862ec52',base)
needle = '/opt/research-openim/ops/local-dsh-20261028/images.yaml)'
assert needle in text
text = text.replace(needle,needle[:-1]+' /opt/research-openim/ops/dsh-team-20261028/images.yaml)')
start = text.index('  # Never roll the data back')
end = text.index('  for attempt in {1..30}',start)
text = text[:start]+'''  # After starting the new API, preserve 0.38 reads even if new large originals exist.
  # Never restore the pre-deploy database over new writes.
  if [[ "$stage" == draining || "$stage" == stopped ]]; then
    "${old[@]}" up -d --no-build --no-deps research-api research-worker > "$ops/recovery-old.log" 2>&1
  else
    "${compose[@]}" up -d --no-build --no-deps research-api research-worker > "$ops/recovery-new.log" 2>&1
  fi
'''+text[end:]
start = text.index('docker run --rm --network none -v "$restored:/data"')
end = text.index('audit "$research" verify > "$ops/live-before-start.json"',start)
text = text[:start]+'''docker run --rm --network none -v "$restored:/data" -v "$ops:/ops:ro" "$image" node --no-warnings /ops/copy-api-check.mjs > "$ops/copy-api-check.json"
audit "$restored" verify > "$ops/restore-after-http.json"
cp "$ops/restore-verify.json" "$ops/copy-migration-preserved.json"
cp "$ops/copy-api-check.json" "$ops/fallback-http.json"
'''+text[end:]
start = text.index('stage=migrating')
end = text.index('stage=starting',start)
text = text[:start]+'cp "$ops/live-before-start.json" "$ops/live-migration-preserved.json"\n'+text[end:]
text = text.replace('python3 "$ops/summary.py" > "$ops/deployment-summary.json"','''python3 - "$ops" <<'PY'
import json,sys,pathlib
p=pathlib.Path(sys.argv[1]);m=json.loads((p/'manifest.json').read_text())
print(json.dumps({'source':m['productRevision'],'contract':'0.38.0','schema':30,'migrationRun':False,'image':(p/'new-image.txt').read_text().strip(),'backup':(p/'backup-path.txt').read_text().strip(),'preservation':json.loads((p/'preserved.json').read_text())}))
PY'''+ ' > "$ops/deployment-summary.json"')
# Keep the heredoc redirect on its invocation, not on its closing delimiter.
text = text.replace('python3 - "$ops" <<\'PY\'','python3 - "$ops" > "$ops/deployment-summary.json" <<\'PY\'').replace('PY > "$ops/deployment-summary.json"','PY')
write('deploy.sh',text)
print(json.dumps({'ops':str(ops),'overlay':list(overlay),'revision':revision}))
