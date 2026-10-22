import { parsePeerChatRequest } from "./peer-request-intent";
import { create } from "zustand";
import type {
  PeerRequest,
  PeerFile,
  ResponseFor,
} from "@research-agent-platform/contracts";
import type { PeerScope, PeerFolder, PeerReceived } from "@/types/peerLibrary";
import { researchApi } from "./api";
import { PeerFileReceiver, gatherPeerIce, sendPeerBytes } from "./peer-transfer";

type Member = ResponseFor<"labMembership">["data"]["members"][number];
type Snapshot = {
  ready: boolean;
  requests: PeerRequest[];
  members: Member[];
  folder?: PeerFolder;
  received: PeerReceived[];
  error: string;
  progress: Record<string, string>;
};
const empty: Snapshot = {
  ready: false,
  requests: [],
  members: [],
  received: [],
  error: "",
  progress: {},
};
export const usePeerLibrary = create<Snapshot>(() => ({ ...empty }));
type Transfer = {
  request: PeerRequest;
  pc: RTCPeerConnection;
  abort: AbortController;
  timer: ReturnType<typeof setTimeout>;
  remote: boolean;
  handling: boolean;
};
let runtime: PeerLibraryRuntime | undefined;
export const currentPeerLibrary = () => runtime;
export class PeerLibraryRuntime {
  readonly deviceId = crypto.randomUUID();
  readonly abort = new AbortController();
  private transfers = new Map<string, Transfer>();
  private matching = new Set<string>();
  private timer?: ReturnType<typeof setTimeout>;
  private snapshot: Snapshot = { ...empty };
  private heartbeat = 0;
  constructor(readonly scope: PeerScope) {
    runtime = this;
  }
  private set(value: Partial<Snapshot>) {
    if (!this.abort.signal.aborted) {
      this.snapshot = { ...this.snapshot, ...value };
      usePeerLibrary.setState(this.snapshot);
    }
  }
  private progress(id: string, value: string) {
    this.set({ progress: { ...this.snapshot.progress, [id]: value } });
  }
  async start() {
    await this.tick();
  }
  stop() {
    this.abort.abort();
    clearTimeout(this.timer);
    for (const t of this.transfers.values()) this.close(t);
    this.transfers.clear();
    if (runtime === this) {
      runtime = undefined;
      usePeerLibrary.setState({ ...empty }, true);
    }
  }
  private close(t: Transfer) {
    clearTimeout(t.timer);
    t.abort.abort();
    t.pc.close();
  }
  private async latest(request: PeerRequest) {
    const { data } = await researchApi("peerRequest", {
      params: { id: request.id },
      signal: this.abort.signal,
    });
    if (
      data.status !== "selected" ||
      data.attemptId !== request.attemptId ||
      data.version !== request.version
    )
      throw Error("请求或共享权限已变化，传输已停止。");
    return data;
  }
  async revokeSharing() {
    for (const t of this.transfers.values())
      if (t.request.providerId === this.scope.memberId) this.close(t);
    await window.electronAPI!.peerLibrary.revoke(this.scope);
    for (const request of this.snapshot.requests) {
      if (
        request.providerId === this.scope.memberId &&
        ["requested", "matched", "selected", "unavailable"].includes(request.status)
      ) {
        try {
          await this.update(request, "decline");
        } catch {
          /* Poll rechecks concurrent state or authority changes. */
        }
      }
    }
    await this.reload();
  }
  async reload() {
    const bridge = window.electronAPI!.peerLibrary;
    const [folder, received] = await Promise.all([
      bridge.folder(this.scope),
      bridge.received(this.scope),
    ]);
    this.set({ folder, received });
  }
  private async tick() {
    try {
      if (Date.now() - this.heartbeat > 10000) {
        await researchApi("peerDevice", {
          body: { deviceId: this.deviceId, enabled: true },
          signal: this.abort.signal,
        });
        this.heartbeat = Date.now();
      }
      const [requests] = await Promise.all([
        researchApi("peerRequests", {
          query: { deviceId: this.deviceId },
          signal: this.abort.signal,
        }),
        this.snapshot.folder ? Promise.resolve() : this.reload(),
      ]);
      if (this.abort.signal.aborted) return;
      if (!this.snapshot.members.length) {
        const roster = await researchApi("labMembership", {
          params: { id: this.scope.labId },
          signal: this.abort.signal,
        });
        this.set({ members: roster.data.members });
      }
      this.set({ ready: true, requests: requests.data, error: "" });
      for (const [id, t] of this.transfers) {
        const next = requests.data.find((r) => r.id === id);
        if (
          !next ||
          next.status !== "selected" ||
          next.attemptId !== t.request.attemptId
        ) {
          this.close(t);
          this.transfers.delete(id);
        }
      }
      let searched = false;
      for (const request of requests.data) {
        if (
          request.providerId === this.scope.memberId &&
          request.status === "requested" &&
          this.snapshot.folder?.configured &&
          this.snapshot.folder.automatic &&
          !this.matching.has(request.id) &&
          !searched
        ) {
          searched = true;
          await this.match(request);
        }
        if (
          request.requesterId === this.scope.memberId &&
          request.requesterDeviceId === this.deviceId &&
          request.status === "matched" &&
          request.files.length === 1
        ) {
          await this.update(request, "select", request.files[0].id);
          continue;
        }
        if (
          request.status === "selected" &&
          ((request.requesterId === this.scope.memberId &&
            request.requesterDeviceId === this.deviceId) ||
            (request.providerId === this.scope.memberId &&
              request.providerDeviceId === this.deviceId))
        ) {
          const saved = this.snapshot.received.find(
            (f) =>
              f.requestId === request.id &&
              f.sha256 ===
                request.files.find((v) => v.id === request.selectedFileId)?.sha256,
          );
          if (request.requesterId === this.scope.memberId && saved) {
            await this.update(request, "received");
            continue;
          }
          const transfer =
            this.transfers.get(request.id) ??
            (Array.from(this.transfers.values()).filter((t) => !t.abort.signal.aborted)
              .length < 2
              ? this.begin(request)
              : undefined);
          if (transfer) await this.signal(transfer);
        }
      }
    } catch (error) {
      if (!this.abort.signal.aborted) {
        this.set({
          ready: false,
          error: error instanceof Error ? error.message : "同事资料连接未完成。",
        });
        for (const t of this.transfers.values()) this.close(t);
        this.transfers.clear();
      }
    } finally {
      if (!this.abort.signal.aborted)
        this.timer = setTimeout(
          () => void this.tick(),
          this.snapshot.ready ? 4000 : 30000,
        );
    }
  }
  async ask(providerId: string, query: string) {
    if (!this.snapshot.ready) throw Error("同事资料服务尚未就绪，请稍后重试。");
    const { data } = await researchApi("createPeerRequest", {
      body: { deviceId: this.deviceId, providerId, query },
      signal: this.abort.signal,
    });
    this.set({
      requests: [data, ...this.snapshot.requests.filter((r) => r.id !== data.id)],
    });
    return data;
  }
  async update(
    request: PeerRequest,
    action: "select" | "decline" | "cancel" | "received" | "retry",
    fileId?: string,
  ) {
    const { data } = await researchApi("updatePeerRequest", {
      params: { id: request.id },
      body: {
        deviceId: this.deviceId,
        expectedVersion: request.version,
        action,
        ...(fileId ? { fileId } : {}),
      },
      signal: this.abort.signal,
    });
    this.set({
      requests: this.snapshot.requests.map((r) => (r.id === data.id ? data : r)),
    });
    return data;
  }
  async match(request: PeerRequest) {
    if (this.matching.has(request.id)) return;
    this.matching.add(request.id);
    try {
      const result = await window.electronAPI!.peerLibrary.search(this.scope, request);
      if (this.abort.signal.aborted) return;
      const fresh = (
        await researchApi("peerRequest", {
          params: { id: request.id },
          signal: this.abort.signal,
        })
      ).data;
      if (fresh.status !== "requested" || fresh.version !== request.version) return;
      if (!result) {
        await this.update(request, "decline");
        return;
      }
      const { data } = await researchApi("updatePeerRequest", {
        params: { id: request.id },
        body: {
          deviceId: this.deviceId,
          expectedVersion: request.version,
          action: "match",
          files: result.files,
        },
        signal: this.abort.signal,
      });
      this.set({
        requests: this.snapshot.requests.map((r) => (r.id === data.id ? data : r)),
      });
      if (result.truncated)
        this.progress(
          request.id,
          "已返回部分匹配；搜索达到数量或时间上限，可缩小关键词。",
        );
    } catch (error) {
      this.progress(
        request.id,
        error instanceof Error ? error.message : "查找未完成。",
      );
    } finally {
      this.matching.delete(request.id);
    }
  }
  private begin(request: PeerRequest) {
    const stun = import.meta.env.VITE_PEER_STUN_URL ?? "stun:stun.cloudflare.com:3478";
    const pc = new RTCPeerConnection({ iceServers: stun ? [{ urls: stun }] : [] }),
      abort = new AbortController();
    const t: Transfer = {
      request,
      pc,
      abort,
      remote: false,
      handling: false,
      timer: setTimeout(() => {
        this.progress(
          request.id,
          "未能完成直传。请确认双方客户端在线、网络可直连后重新查找。",
        );
        this.close(t);
      }, 90000),
    };
    this.transfers.set(request.id, t);
    this.progress(request.id, "正在建立加密直连…");
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        this.progress(request.id, "直连失败，请更换网络或稍后重试。文件未上传到云端。");
        this.close(t);
      }
    };
    if (request.requesterId === this.scope.memberId) {
      this.channel(t, pc.createDataChannel("acceptcat-file", { ordered: true }));
      void (async () => {
        await pc.setLocalDescription(await pc.createOffer());
        await gatherPeerIce(pc, abort.signal);
        await this.latest(request);
        if (abort.signal.aborted) return;
        await researchApi("sendPeerSignal", {
          params: { id: request.id },
          body: {
            deviceId: this.deviceId,
            attemptId: request.attemptId!,
            kind: "offer",
            sdp: pc.localDescription!.sdp,
          },
          signal: this.abort.signal,
        });
      })().catch((e) => {
        this.progress(request.id, String(e.message));
        this.close(t);
      });
    } else pc.ondatachannel = (event) => this.channel(t, event.channel);
    return t;
  }
  private async signal(t: Transfer) {
    if (t.remote || t.abort.signal.aborted) return;
    const { data } = await researchApi("peerSignals", {
      params: { id: t.request.id },
      query: { deviceId: this.deviceId, attemptId: t.request.attemptId! },
      signal: this.abort.signal,
    });
    const s = data[0];
    if (!s) return;
    t.remote = true;
    await t.pc.setRemoteDescription({ type: s.kind, sdp: s.sdp });
    if (s.kind === "offer") {
      await t.pc.setLocalDescription(await t.pc.createAnswer());
      await gatherPeerIce(t.pc, t.abort.signal);
      await this.latest(t.request);
      if (t.abort.signal.aborted) return;
      await researchApi("sendPeerSignal", {
        params: { id: t.request.id },
        body: {
          deviceId: this.deviceId,
          attemptId: t.request.attemptId!,
          kind: "answer",
          sdp: t.pc.localDescription!.sdp,
        },
        signal: this.abort.signal,
      });
    }
  }
  private channel(t: Transfer, channel: RTCDataChannel) {
    if (t.handling) {
      channel.close();
      return;
    }
    t.handling = true;
    channel.binaryType = "arraybuffer";
    const file = t.request.files.find((f) => f.id === t.request.selectedFileId)!;
    const fail = (error: unknown) => {
      this.progress(
        t.request.id,
        error instanceof Error ? error.message : "文件直传失败。",
      );
      this.close(t);
    };
    channel.onerror = () => fail(Error("文件直传中断，请重新查找后接收。"));
    if (t.request.providerId === this.scope.memberId) {
      channel.onopen = () => {
        void (async () => {
          await this.latest(t.request);
          const bytes = await window.electronAPI!.peerLibrary.read(
            this.scope,
            t.request.id,
            file.id,
          );
          await this.latest(t.request);
          await sendPeerBytes(channel, bytes, t.abort.signal, (n) =>
            this.progress(
              t.request.id,
              `正在发送 ${Math.round((n / file.size) * 100)}%`,
            ),
          );
          this.progress(t.request.id, "已发送，等待对方保存回执。");
        })().catch(fail);
      };
    } else {
      const receiver = new PeerFileReceiver(file);
      let chain = Promise.resolve();
      channel.onmessage = (event) => {
        chain = chain
          .then(async () => {
            if (t.abort.signal.aborted) return;
            const bytes = await receiver.push(event.data);
            this.progress(
              t.request.id,
              `正在接收 ${Math.round((receiver.receivedBytes / file.size) * 100)}%`,
            );
            if (bytes) {
              await this.latest(t.request);
              if (t.abort.signal.aborted) return;
              const saved = await window.electronAPI!.peerLibrary.save(
                this.scope,
                t.request,
                file,
                bytes,
              );
              this.set({received:[saved,...this.snapshot.received.filter(v=>v.id!==saved.id)]});
              try { await this.update(t.request, "received"); }
              catch { this.progress(t.request.id,"文件已保存到本机，后台回执尚未确认，稍后自动核对。");this.close(t);return; }
              this.progress(t.request.id, "已校验并保存到本机。");
              await this.reload();
              this.close(t);
            }
          })
          .catch(fail);
      };
    }
  }
}

export function peerChatRequest(text: string) {
  const active = runtime;
  if (!active || !usePeerLibrary.getState().ready) return undefined;
  return parsePeerChatRequest(
    text,
    usePeerLibrary.getState().members.filter((m) => m.id !== active.scope.memberId),
    active.deviceId,
  );
}
