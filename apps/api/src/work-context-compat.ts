/** Old strict desktop readers retain their rule/memory wire format. This is a
 * response projection only; live ACLs and the new source of truth stay shared. */
export function workContextProjection(value:unknown,modern:boolean):unknown{
  if(modern)return value
  const result=JSON.parse(JSON.stringify(value))
  const compatible=(r:any)=>r.kind!=='link'&&r.scope!=='personal'
  if(Array.isArray(result.data))result.data=result.data.filter(compatible)
  else if(result.data&&typeof result.data==='object'){
    if(Array.isArray(result.data.records))result.data.records=result.data.records.filter(compatible)
    delete result.data.personalRules
  }
  return result
}
