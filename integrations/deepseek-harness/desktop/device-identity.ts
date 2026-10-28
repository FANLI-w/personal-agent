import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
export async function localDeviceId(root:string):Promise<string> {
  await mkdir(root,{recursive:true});
  const file=path.join(root,'device-id');
  try { await writeFile(file,randomUUID(),{flag:'wx',mode:0o600}); }
  catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
  const id=(await readFile(file,'utf8')).trim();
  if(!/^[a-f0-9-]{36}$/.test(id))throw Error('本机设备标识损坏，请保留工作目录并联系维护者。');
  return id;
}
