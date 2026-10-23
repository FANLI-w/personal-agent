import { Alert, Button, Checkbox, Input, Select, Space } from "antd";
import { useState } from "react";
import type { PeerRequest } from "@research-agent-platform/contracts";
import { useNavigate } from "react-router-dom";
import { usePeerLibrary, currentPeerLibrary } from "./peer-library-runtime";
import { useResearchStore } from "./store";
import "./peer-library.scss";

const states: Record<PeerRequest["status"], string> = {
  requested: "等待同事设备查找或本人同意",
  matched: "找到匹配文件，请选择接收",
  selected: "等待双方设备完成直传",
  received: "已收到并保存到本机",
  declined: "同事未同意本次请求",
  cancelled: "已取消",
  unavailable: "目录中未找到匹配文件",
};
export function PeerLibraryPanel() {
  const member = useResearchStore((s) => s.actor?.member.id),
    lab = useResearchStore((s) => s.actor?.member.labId),
    generation = useResearchStore((s) => s.generation);
  return <ScopedPeerLibraryPanel key={`${member}:${lab}:${generation}`} />;
}
function ScopedPeerLibraryPanel() {
  const member = useResearchStore((s) => s.actor?.member.id),
    kind = useResearchStore((s) => s.actor?.spaceKind);
  const { ready, requests, members, folder, received, error, progress } =
    usePeerLibrary();
  const [provider, setProvider] = useState(""),
    [query, setQuery] = useState(""),
    [automatic, setAutomatic] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const runtime = currentPeerLibrary();
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      await fn();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "操作未完成，请重试。");
    } finally {
      setBusy(false);
    }
  };
  if (!window.electronAPI?.peerLibrary)
    return (
      <Alert type="info" message="同事本机资料需要支持此功能的 Windows 客户端。" />
    );
  if (kind !== "laboratory")
    return (
      <Alert
        type="info"
        message="请先在“我的 → 课题组”创建或加入课题组，并切换到该课题组。"
      />
    );
  const scope = runtime?.scope;
  return (
    <section className="peer-library-panel">
      <div>
        <h2>同事资料</h2>
        <p>让个人助理向同组同事请求本机资料。原件通过电脑直传，不保存到平台云端。</p>
      </div>
      {(error || failure) && (
        <Alert
          type="warning"
          showIcon
          message={failure || error}
          description="需要配套后台已升级、双方设备在线。未确认成功的操作请先刷新核对请求状态。"
        />
      )}
      <div className="peer-library-setting">
        <h3>我的共享目录</h3>
        <p>
          {folder?.configured
            ? `已选择“${folder.label}” · ${
                folder.automatic ? "允许同组成员自动获取匹配文件" : "每次请求需我同意"
              }`
            : "尚未开放本机文件。选择一个专门用于共享的文件夹。"}
        </p>
        <Checkbox checked={automatic} onChange={(e) => setAutomatic(e.target.checked)}>
          新选目录允许同组成员自动获取
        </Checkbox>
        <Space wrap>
          <Button
            disabled={busy || !ready || !scope}
            onClick={() =>
              void run(async () => {
                await window.electronAPI!.peerLibrary.configure(scope!, automatic);
                await runtime?.reload();
              })
            }
          >
            选择共享文件夹
          </Button>
          {folder?.configured && (
            <Button
              disabled={busy || !scope}
              onClick={() =>
                void run(async () => {
                  await runtime?.revokeSharing();
                })
              }
            >
              停止共享
            </Button>
          )}
        </Space>
        <small>
          仅按文件名中的关键词查找；每份最多 10 MiB，每次最多返回 10
          份。设备离线时无法读取目录；已下载的副本不能远程收回。
        </small>
      </div>
      <div className="peer-library-ask">
        <h3>向同事要资料</h3>
        <Select
          aria-label="资料提供者"
          placeholder="选择同组同事"
          value={provider || undefined}
          options={members
            .filter((m) => m.id !== member)
            .map((m) => ({ value: m.id, label: `${m.displayName}（${m.username}）` }))}
          onChange={setProvider}
          disabled={!ready || busy}
        />
        <Input.TextArea
          aria-label="需要的资料"
          value={query}
          maxLength={300}
          rows={2}
          placeholder="告诉助理需要什么，例如：实验记录（按文件名关键词查找）"
          onChange={(e) => setQuery(e.target.value)}
          disabled={busy}
        />
        <Button
          type="primary"
          disabled={!ready || busy || !provider || !query.trim()}
          onClick={() =>
            void run(async () => {
              await runtime!.ask(provider, query.trim());
              setQuery("");
            })
          }
        >
          请个人助理索取
        </Button>
        <small>
          也可以在个人助理聊天中说“帮我找小王的实验记录”，名字或 AcceptCat
          号需要能唯一对应同组成员。
        </small>
      </div>
      <div className="peer-library-requests">
        <h3>资料请求</h3>
        {!requests.length && <p>尚无资料请求。</p>}
        {requests.map((r) => (
          <article key={r.id}>
            <strong>
              {r.requesterId === member
                ? `向 ${r.providerName} 索取`
                : `${r.requesterName} 向我索取`}
              ：{r.query}
            </strong>
            <p>
              {states[r.status]}
              {progress[r.id] ? ` · ${progress[r.id]}` : ""}
            </p>
            {r.providerId === member && r.status === "requested" && (
              <Space>
                <Button
                  disabled={busy || !ready || !folder?.configured}
                  onClick={() => void run(() => runtime!.match(r))}
                >
                  查找并处理请求
                </Button>
                <Button
                  disabled={busy || !ready}
                  onClick={() => void run(() => runtime!.update(r, "decline"))}
                >
                  拒绝
                </Button>
              </Space>
            )}
            {r.requesterId === member &&
              r.status === "matched" &&
              r.files.map((f) => (
                <div className="peer-library-file" key={f.id}>
                  <span>
                    {f.name} · {(f.size / 1024).toFixed(0)} KiB ·{" "}
                    {new Date(f.modifiedAt).toLocaleString()}
                  </span>
                  <Button
                    disabled={busy || !ready}
                    onClick={() => void run(() => runtime!.update(r, "select", f.id))}
                  >
                    接收到本机
                  </Button>
                </div>
              ))}
            {r.requesterId === member &&
              ["selected", "unavailable"].includes(r.status) && (
                <Button
                  disabled={busy || !ready}
                  onClick={() => void run(() => runtime!.update(r, "retry"))}
                >
                  重新查找 / 重试
                </Button>
              )}
            {r.requesterId === member &&
              ["requested", "matched", "selected", "unavailable"].includes(
                r.status,
              ) && (
                <Button
                  disabled={busy || !ready}
                  onClick={() => void run(() => runtime!.update(r, "cancel"))}
                >
                  取消请求
                </Button>
              )}
          </article>
        ))}
      </div>
      <div>
        <h3>收到的资料</h3>
        {!received.length && <p>接收成功的原文件会保存在此电脑。</p>}
        {received.map((f) => (
          <div className="peer-library-file" key={f.id}>
            <span>
              {f.name} · 来自 {f.providerName} ·{" "}
              {new Date(f.receivedAt).toLocaleString()}
            </span>
            <Button
              disabled={busy || !scope}
              onClick={() =>
                void run(() => window.electronAPI!.peerLibrary.open(scope!, f.id))
              }
            >
              打开文件
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PeerLibraryChatLink() {
  const navigate = useNavigate(),
    requests = usePeerLibrary((s) => s.requests),
    kind = useResearchStore((s) => s.actor?.spaceKind);
  if (kind !== "laboratory" || !window.electronAPI?.peerLibrary) return null;
  const matched = requests.filter(
    (r) =>
      r.status === "matched" && r.requesterId === currentPeerLibrary()?.scope.memberId,
  ).length;
  return (
    <Button size="small" onClick={() => navigate("/library?panel=peers")}>
      {matched ? `${matched} 个资料请求可接收` : "向同事要资料"}
    </Button>
  );
}
