import type { PeerFile } from "@research-agent-platform/contracts";

/** Ordered reliable channel; bounded binary chunks, one terminal marker, exact size/hash. */
export class PeerFileReceiver {
  private chunks: Uint8Array[] = [];
  private size = 0;
  private ended = false;
  constructor(readonly file: PeerFile) {}
  async push(value: unknown): Promise<Uint8Array | null> {
    if (this.ended) throw Error("传输已经结束。");
    if (value instanceof ArrayBuffer) {
      if (
        value.byteLength < 1 ||
        value.byteLength > 16384 ||
        this.size + value.byteLength > this.file.size ||
        this.chunks.length >= 4096
      )
        throw Error("文件传输超过声明范围。");
      this.chunks.push(new Uint8Array(value));
      this.size += value.byteLength;
      return null;
    }
    if (value !== "acceptcat:file:end" || this.size !== this.file.size)
      throw Error("文件传输不完整。");
    this.ended = true;
    const bytes = new Uint8Array(this.size);
    let offset = 0;
    for (const chunk of this.chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.chunks = [];
    const actual = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (actual !== this.file.sha256) throw Error("文件校验失败。");
    return bytes;
  }
  get receivedBytes() {
    return this.size;
  }
}

export function gatherPeerIce(pc: RTCPeerConnection, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(Error("传输已取消。"));
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      pc.removeEventListener("icegatheringstatechange", check);
      error ? reject(error) : resolve();
    };
    const check = () => {
        if (pc.iceGatheringState === "complete") finish();
      },
      abort = () => finish(Error("传输已取消。"));
    const timer = setTimeout(() => finish(), 8000);
    signal.addEventListener("abort", abort, { once: true });
    pc.addEventListener("icegatheringstatechange", check);
    check();
  });
}
export async function sendPeerBytes(
  channel: RTCDataChannel,
  bytes: Uint8Array,
  signal: AbortSignal,
  progress: (n: number) => void,
) {
  for (let offset = 0; offset < bytes.length; offset += 16384) {
    const start = Date.now();
    while (channel.bufferedAmount > 262144) {
      if (signal.aborted || channel.readyState !== "open" || Date.now() - start > 20000)
        throw Error("直传中断，请重试。");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (signal.aborted || channel.readyState !== "open") throw Error("传输已停止。");
    const chunk = bytes.slice(offset, Math.min(offset + 16384, bytes.length));
    channel.send(chunk);
    progress(offset + chunk.length);
  }
  if (signal.aborted || channel.readyState !== "open") throw Error("传输已停止。");
  channel.send("acceptcat:file:end");
}
