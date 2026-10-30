from pathlib import Path
import json,hashlib,subprocess
old=Path('/opt/research-openim/ops/materials-workbench-20261029')
ops=Path('/opt/research-openim/ops/task-handoff-20261029')
stage=Path('/opt/research-openim/ops/task-handoff-20261029-stage')
revision='ea7350ff75847c9af6ff5c0b96b83b006e436517'
base='sha256:eccce1d9d1f7aa43ce197c314a6ea3bda0b2667ce7a74b46e861ad50056ef95b'
assert hashlib.sha256((stage/'source.tar.gz').read_bytes()).hexdigest()=='cec1e00a2788465b62d4b27a2344e0c6bf2b5663cbed092a02cc1a7cf64b330e'
assert not ops.exists()
ops.mkdir(mode=0o700)
subprocess.run(['tar','-xzf',str(stage/'source.tar.gz'),'-C',str(stage)],check=True)
source=stage/('personal-agent-'+revision)
def write(n,s):
 p=ops/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s,encoding='utf-8')
sha=lambda b:hashlib.sha256(b).hexdigest()
baseline=json.loads((old/'baseline-manifest.json').read_text())
baseline['files'].update(json.loads((old/'source-final.json').read_text())['sourceHashes'])
probe="""import{readdirSync,readFileSync}from'node:fs';import{createHash}from'node:crypto';const out={};for(const root of ['apps/api/dist','packages/contracts/dist'])for(const f of readdirSync('/app/'+root,{recursive:true,withFileTypes:true}))if(f.isFile()){const p=f.parentPath+'/'+f.name;out[p.slice(5)]=createHash('sha256').update(readFileSync(p,'utf8').replaceAll('\\r\\n','\\n')).digest('hex')}console.log(JSON.stringify(out))"""
baseline['files'].update(json.loads(subprocess.check_output(['docker','run','--rm','--network','none',base,'node','--input-type=module','-e',probe],text=True)))
overlay={}
for folder in ['apps/api/src','packages/contracts/src','apps/api/migrations']:
 for p in sorted((source/folder).rglob('*')):
  if not p.is_file():continue
  key=p.relative_to(source).as_posix()
  if key=='apps/api/src/community-catalog-seed.ts':continue
  data=p.read_text().replace('\r\n','\n')
  if sha(data.encode())!=baseline['files'].get(key):write('overlay/'+key,data);overlay[key]=sha(data.encode())
key='scripts/seed-b2b-demo.mjs'
baseline['files'][key]=subprocess.check_output(['docker','run','--rm','--network','none',base,'sha256sum','/app/'+key],text=True).split()[0]
data=(source/key).read_text().replace('\r\n','\n')
write('overlay/'+key,data);overlay[key]=sha(data.encode())
baseline['absent']=[p for p in overlay if p not in baseline['files']]
write('baseline-manifest.json',json.dumps(baseline))
write('manifest.json',json.dumps(dict(productRevision=revision,baseImageId=base,overlay=overlay,schema=31,contract='0.39.0')))
for name in ['baseline-guard.mjs','settings.py','config-proof.py','copy-api-check.mjs','source-check.mjs']:
 s=(old/name).read_text().replace('0.38.0','0.39.0')
 if name=='source-check.mjs':s=s.replace('length,30','length,31').replace('schema:30','schema:31').replace('c.routes.teamWork&&','c.routes.cancelInvitation&&c.routes.teamWork&&')
 write(name,s)
audit=(old/'audit.mjs').read_text().replace('[27,30]','[30,31]').replace('migrations.length,30','migrations.length,31')
audit=audit.replace('const snapshot={history,objects,tables,files,stable};',"const migrationRows=Object.fromEntries(['tasks','task_versions','task_events','runtime_meta'].map(t=>[t,JSON.parse(JSON.stringify(db.prepare('SELECT * FROM '+t).all()))]));const snapshot={history,objects,tables,files,stable,migrationRows};")
a=audit.index('const old=JSON.parse(readFileSync(receipt');b=audit.index("}else if(['snapshot'",a)
audit=audit[:a]+'''const old=JSON.parse(readFileSync(receipt,'utf8'));
assert.equal(history.length,31);assert.equal(old.history.length,30);assert.deepEqual(history.slice(0,30),old.history);
assert.deepEqual(objects.filter(o=>o.tbl_name!=='task_handoffs'),old.objects);
assert.equal(db.prepare('SELECT count(*) n FROM task_handoffs').get().n,0);
const changed=new Set(['tasks','task_versions','task_events','runtime_meta','schema_migrations']);
assert.deepEqual(tables.filter(t=>!changed.has(t.name)&&t.name!=='task_handoffs'),old.tables.filter(t=>!changed.has(t.name)));
assert.deepEqual(files,old.files);assert.deepEqual(stable,old.stable);
const prior=old.migrationRows,blocked=prior.tasks.filter(t=>t.status==='blocked'),current=new Map(migrationRows.tasks.map(t=>[t.id,t]));
assert.equal(current.size,prior.tasks.length);
for(const row of prior.tasks){const next=current.get(row.id);if(row.status!=='blocked'){assert.deepEqual(next,row);continue}
 const before=JSON.parse(row.document),doc=JSON.parse(next.document),status=before.blocker?.resumeStatus??'ready';
 assert(Number.isFinite(Date.parse(doc.updatedAt))&&Date.parse(doc.updatedAt)>=Date.parse(before.updatedAt));
 assert.deepEqual(doc,{...before,status,version:before.version+1,blocker:null,updatedAt:doc.updatedAt});
 assert.deepEqual(next,{...row,status,version:row.version+1,document:next.document});}
const oldVersions=new Map(prior.task_versions.map(v=>[v.task_id+':'+v.version,v]));
for(const v of migrationRows.task_versions){const key=v.task_id+':'+v.version;if(oldVersions.has(key)){assert.deepEqual(v,oldVersions.get(key));oldVersions.delete(key)}else{const t=current.get(v.task_id);assert(blocked.some(b=>b.id===v.task_id));assert.equal(v.version,t.version);assert.equal(v.document,t.document)}}
assert.equal(oldVersions.size,0);assert.equal(migrationRows.task_versions.length,prior.task_versions.length+blocked.length);
const oldEvents=new Map(prior.task_events.map(e=>[e.id,e])),newEvents=[];
for(const e of migrationRows.task_events){if(oldEvents.has(e.id)){assert.deepEqual(e,oldEvents.get(e.id));oldEvents.delete(e.id)}else newEvents.push(e)}
assert.equal(oldEvents.size,0);assert.equal(newEvents.length,blocked.length);
for(const t of blocked){const events=newEvents.filter(e=>e.task_id===t.id);assert.equal(events.length,1);const e=events[0],d=JSON.parse(e.document);assert.equal(d.id,e.id);assert.equal(d.taskId,t.id);assert.equal(d.kind,'resumed');assert.deepEqual(d.actor,{kind:'system'});assert.equal(d.resourceVersion,t.version+1);assert.equal(d.timestamp,JSON.parse(current.get(t.id).document).updatedAt)}
assert.deepEqual(migrationRows.runtime_meta,prior.runtime_meta.map(r=>r.key==='revision'&&blocked.length?{...r,value:String(Number(r.value)+1+blocked.length)}:r));
''' +audit[b:]
write('audit.mjs',audit)
write('migrate.mjs',"import{processGuard}from'/app/apps/api/dist/process-guard.js';import{openDatabase,migrate,checkMigrationHistory}from'/app/apps/api/dist/database.js';const release=processGuard('/data/platform.sqlite',true),db=openDatabase('/data/platform.sqlite');try{migrate(db);migrate(db);console.log(JSON.stringify({schema:checkMigrationHistory(db).length,repeated:true}))}finally{db.close();release()}")
write('Dockerfile',f'''FROM research-openim-api:materials-workbench-20261029
COPY baseline-guard.mjs /tmp/agent-conversation-baseline-guard.mjs
COPY baseline-manifest.json /tmp/agent-conversation-baseline.json
RUN node /tmp/agent-conversation-baseline-guard.mjs
COPY overlay/ /app/
RUN pnpm --config.verify-deps-before-run=false --filter @research-agent-platform/contracts build && pnpm --config.verify-deps-before-run=false --filter @research-agent-platform/api build
LABEL org.opencontainers.image.revision="{revision}"
''')
prepare=(old/'prepare.sh').read_text().replace(str(old),str(ops)).replace('materials-workbench-20261029',ops.name).replace('sha256:3162c814d4e6a0d3c7cfdf8276145e1a53cadfff0184b809b8a6523043e209a0',base)
start=prepare.index('docker run --rm --network none --memory');end=prepare.index("printf 'PREPARATION_OK",start)
tests=' '.join('apps/api/tests/'+n+'.spec.ts' for n in ['task-handoffs','coordination','collaboration','research-team','local-dsh','team-work','openim'])
prepare=prepare[:start]+f'docker run --rm --network none --memory 1536m -v "{source}/apps/api/tests:/app/apps/api/tests:ro" "$image" pnpm --config.verify-deps-before-run=false exec vitest run {tests} --maxWorkers=1 > "$ops/isolated-tests.log" 2>&1\n'+prepare[end:]
write('prepare.sh',prepare)
deploy=(old/'deploy.sh').read_text().replace('materials-workbench-20261029',ops.name).replace('sha256:3162c814d4e6a0d3c7cfdf8276145e1a53cadfff0184b809b8a6523043e209a0',base).replace('0.38.0','0.39.0').replace("'schema':30,'migrationRun':False","'schema':31,'migrationRun':True")
needle='/opt/research-openim/ops/dsh-team-20261028/images.yaml)';assert needle in deploy
deploy=deploy.replace(needle,needle[:-1]+' '+str(old)+'/images.yaml)')
line='docker run --rm --network none -v "$restored:/data" -v "$ops:/ops:ro" "$image" node --no-warnings /ops/copy-api-check.mjs'
assert line in deploy
deploy=deploy.replace(line,'docker run --rm --network none -v "$restored:/data" -v "$ops:/ops:ro" "$image" node --no-warnings /ops/migrate.mjs > "$ops/copy-migration.json"\naudit "$restored" migrated > "$ops/copy-migration-preserved.json"\n'+line)
deploy=deploy.replace('audit "$restored" verify > "$ops/restore-after-http.json"','audit "$restored" migrated > "$ops/restore-after-http.json"').replace('cp "$ops/restore-verify.json" "$ops/copy-migration-preserved.json"','')
deploy=deploy.replace('cp "$ops/live-before-start.json" "$ops/live-migration-preserved.json"','stage=migrating\ndocker run --rm --network none -v "$research:/data" -v "$ops:/ops:ro" "$image" node --no-warnings /ops/migrate.mjs > "$ops/live-migration.json"\naudit "$research" migrated > "$ops/live-migration-preserved.json"')
write('deploy.sh',deploy)
print(json.dumps({'ops':str(ops),'overlay':list(overlay),'revision':revision,'schema':31}))
