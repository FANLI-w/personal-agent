from pathlib import Path
p=Path('/opt/research-openim/ops/task-handoff-20261029/deploy.sh')
s=p.read_text()
needle='if [[ "$stage" == draining || "$stage" == stopped ]]; then'
assert needle in s
probe='''schema=unknown
  if [[ "$stage" == migrating ]]; then
    schema=$(docker run --rm --network none -v "$research:/data:ro" "$image" node --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const d=new DatabaseSync("/data/platform.sqlite",{readOnly:true});try{console.log(d.prepare("SELECT count(*) n FROM schema_migrations").get().n)}finally{d.close()}')
  fi
  if [[ "$stage" == draining || "$stage" == stopped || "$schema" == 30 ]]; then'''
s=s.replace(needle,probe)
p.write_text(s)
print('RECOVERY_SCHEMA_GUARD_READY')
