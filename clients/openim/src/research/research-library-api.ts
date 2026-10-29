import { ErrorResponse } from "@research-agent-platform/contracts";
import type { ResponseFor } from "@research-agent-platform/contracts";
import { ResearchApiError, researchApi } from "./api";
import type { RequestFor } from '@research-agent-platform/contracts';
import { readLargeOriginalAvailability } from './workspace-availability';
import { assertRequestActive, withRequestDeadline } from "./request-deadline";

export const researchScopeLabels = {
  owner_private: "仅自己",
  task_scoped: "任务授权",
  lab_shared: "课题组",
  public: "公开",
} as const;

export type ResearchFileVersion =
  ResponseFor<"researchFile">["data"]["versions"][number];

export async function readResearchFileBytes(id: string, version: ResearchFileVersion, signal?: AbortSignal) {
  return withRequestDeadline(async requestSignal => {
    if (!Number.isSafeInteger(version.byteLength) || version.byteLength < 1 || version.byteLength > 512 * 1048576)
      throw Error('共享原件大小无效或超过 512 MiB。');
    const invalid = () => new Error('原件响应与此版本不符，未保存文件。请重新读取来源后重试。');
    const mismatch = () => new Error('原件大小或校验值与此版本不一致，未保存文件。请重新读取来源后重试。');
    const bytes = new Uint8Array(version.byteLength);
    const large = version.byteLength > 10 * 1048576, chunkSize = large ? 1048576 : version.byteLength;
    for (let offset = 0; offset < version.byteLength; offset += chunkSize) {
      assertRequestActive(requestSignal);
      const expected = Math.min(chunkSize, version.byteLength - offset);
      const url = `/api/v1/research-library/files/${encodeURIComponent(id)}/content?version=${version.version}` + (large ? `&offset=${offset}&length=${expected}` : '');
      const response = await fetch(url, { credentials: 'same-origin', signal: requestSignal });
      assertRequestActive(requestSignal);
      if (!response.ok) {
        const value = await response.json().catch(() => null), error = ErrorResponse.safeParse(value);
        throw new ResearchApiError(error.success ? error.data.error.code : 'HTTP_ERROR', response.status,
          response.status === 401 ? '登录已失效，请重新登录后下载。' : response.status === 403 || response.status === 404 ? '当前未获准下载此资料，请刷新后核对权限。' : '原始文件下载失败，请检查连接后重试。');
      }
      const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase(), length = response.headers.get('content-length');
      if (type !== version.mediaType.toLowerCase() || (length !== null && (!/^\d+$/.test(length) || Number(length) !== expected)) || !response.body) {
        await response.body?.cancel(); throw invalid();
      }
      const reader = response.body.getReader();
      const cancel = () => { void reader.cancel().catch(() => {}); };
      requestSignal.addEventListener('abort', cancel, { once: true });
      let received = 0;
      try {
        while (true) {
          assertRequestActive(requestSignal); const part = await reader.read(); assertRequestActive(requestSignal);
          if (part.done) break;
          if (received + part.value.byteLength > expected) throw mismatch();
          bytes.set(part.value, offset + received); received += part.value.byteLength;
        }
        if (received !== expected) throw mismatch();
      } catch (error) { cancel(); throw error; }
      finally { requestSignal.removeEventListener('abort', cancel); reader.releaseLock(); }
    }
    const digest = await crypto.subtle.digest('SHA-256', bytes); assertRequestActive(requestSignal);
    const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
    if (hash !== version.sha256) throw mismatch();
    return new Blob([bytes], { type: version.mediaType });
  }, 10 * 60 * 1000, signal);
}
export function fileAsBase64(file: File): Promise<string> {
  if (!file.size || file.size > 10 * 1024 * 1024)
    return Promise.reject(new Error("请选择非空且不超过 10 MiB 的文件。"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("本机文件读取失败，请重新选择文件。"));
    reader.readAsDataURL(file);
  });
}

export function researchFileMediaType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    md: "text/markdown",
    txt: "text/plain",
    csv: "text/csv",
    pdf: "application/pdf",
  };
  return types[extension || ""] || file.type || "application/octet-stream";
}

export async function uploadResearchOriginal(collection:{id:string;scope:RequestFor<'beginResearchUpload'>['body']['scope']},
  file:File,body:RequestFor<'importResearchFile'>['body'],attempt:{key:string;uploadId:string;ready?:boolean},isCurrent:()=>boolean,onProgress:(value:number)=>void) {
  if(!file.size||file.size>512*1024*1024)throw Error('共享文件须为非空文件，单份不超过 512 MiB；本地使用不受此限制。');
  const ensure=()=>{if(!isCurrent())throw new DOMException('页面或账号已切换','AbortError');};
  const complete=()=>researchApi('completeResearchUpload',{params:{id:collection.id},body:{uploadId:attempt.uploadId,expectedCollectionVersion:body.expectedCollectionVersion},idempotencyKey:attempt.key});
  ensure();
  if(!(await readLargeOriginalAvailability()).available)throw Error('当前后台尚未支持大文件共享，请更新配套后台至 0.38 或更高版本；本地工作仍可继续。');
  ensure();
  if(attempt.ready){try{return await complete()}catch(error){if(!(error instanceof ResearchApiError)||error.code!=='NOT_FOUND')throw error;attempt.ready=false;}}
  const {contentBase64:_,expectedCollectionVersion:__,...metadata}=body;
  const started=await researchApi('beginResearchUpload',{params:{id:collection.id},body:{...metadata,uploadId:attempt.uploadId,scope:collection.scope,byteLength:file.size},idempotencyKey:attempt.uploadId});
  for(let index=0;index<Math.ceil(file.size/1048576);index++){
    ensure();
    if(!started.data.receivedParts.includes(index)){
      const bytes=await file.slice(index*1048576,(index+1)*1048576).arrayBuffer();ensure();
      let binary='';const view=new Uint8Array(bytes);for(let offset=0;offset<view.length;offset+=8192)binary+=String.fromCharCode(...view.subarray(offset,offset+8192));
      await researchApi('putResearchUploadPart',{params:{id:collection.id},body:{uploadId:attempt.uploadId,index,contentBase64:btoa(binary)},idempotencyKey:`${attempt.uploadId}-${index}`});
    }
    ensure();onProgress(Math.round(Math.min(file.size,(index+1)*1048576)/file.size*100));
  }
  attempt.ready=true;ensure();return complete();
}
