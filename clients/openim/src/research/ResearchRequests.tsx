import { Alert, Button, Modal, Space, Tag } from "antd";
import { useEffect, useRef, useState } from "react";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";

export function ResearchRequests() {
  const { data, error, refresh } = useResearchRead(
    () => researchApi("contactRequests", { query: { status: "all", limit: 100 } }),
    "requests",
  );
  const contacts = useResearchStore((s) => s.contacts);
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const generation = useResearchStore((s) => s.generation);
  const [names, setNames] = useState<Record<string, string>>({});
  const scope = useRef(0);
  const mounted = useRef(false);
  const confirmation = useRef<ReturnType<typeof Modal.confirm>>();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      confirmation.current?.destroy();
    };
  }, []);
  const profileIds = JSON.stringify(
    [
      ...new Set(
        data?.data.flatMap((request) => [
          request.requesterContactId,
          request.targetContactId,
        ]) || [],
      ),
    ].sort(),
  );
  useEffect(() => {
    const requestScope = ++scope.current;
    const controller = new AbortController();
    setNames({});
    setBusy(false);
    const missing = (JSON.parse(profileIds) as string[]).filter(
      (id) => !contacts.some((c) => c.contact.id === id),
    );
    void Promise.allSettled(
      missing.map(async (id) => ({
        id,
        contact: (
          await researchApi("chatContact", {
            params: { id },
            signal: controller.signal,
          })
        ).data,
      })),
    ).then((results) => {
      if (
        controller.signal.aborted ||
        scope.current !== requestScope ||
        useResearchStore.getState().generation !== generation
      )
        return;
      setNames(
        Object.fromEntries(
          results.flatMap((result) =>
            result.status === "fulfilled"
              ? [[result.value.id, result.value.contact.displayName]]
              : [],
          ),
        ),
      );
    });
    return () => {
      scope.current++;
      controller.abort();
    };
  }, [profileIds, generation]);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const requests = data?.data || [];
  const incoming = requests.filter(
    (request) => request.status === "pending" && request.deciderMemberId === actorId,
  );
  const outgoing = requests.filter(
    (request) => request.status === "pending" && request.requesterMemberId === actorId,
  );
  const history = requests.filter((request) => request.status !== "pending");
  const name = (id: string) =>
    contacts.find((c) => c.contact.id === id)?.contact.displayName ||
    names[id] ||
    "联系人资料待加载";
  const command = async (run: () => Promise<unknown>) => {
    const requestScope = scope.current;
    const isCurrent = () =>
      mounted.current &&
      requestScope === scope.current &&
      generation === useResearchStore.getState().generation;
    if (!isCurrent()) return;
    setBusy(true);
    setFailure("");
    try {
      await run();
      if (!isCurrent()) return;
      await researchApi("imSync", { body: {} });
      if (!isCurrent()) return;
      await useResearchStore.getState().refresh();
      if (!isCurrent()) return;
      await refresh();
    } catch (err) {
      if (isCurrent()) {
        setFailure(err instanceof Error ? err.message : "操作失败");
        await refresh();
      }
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  return (
    <div className="h-full space-y-3 overflow-auto bg-white p-5">
      <h2 className="text-base font-bold">好友申请</h2>
      {(error || failure) && <Alert type="error" message={error || failure} />}
      {!data && !error && <p role="status">正在读取好友申请…</p>}
      {data &&
        [
          { label: "收到的申请", items: incoming, empty: "没有待处理的申请" },
          { label: "发出的申请", items: outgoing, empty: "没有等待对方处理的申请" },
          { label: "历史申请", items: history, empty: "暂无历史申请" },
        ].map(({ label, items, empty }) => (
          <section key={label} aria-label={label} className="space-y-2">
            <h3 className="font-semibold">
              {label}（{items.length}）
            </h3>
            {!items.length && <p className="text-sm text-slate-500">{empty}</p>}
            {items.map((request) => (
              <article key={request.id} className="space-y-2 rounded border p-3">
                <p>
                  <strong>{name(request.requesterContactId)}</strong>
                  {" 申请联系 "}
                  <strong>{name(request.targetContactId)}</strong>{" "}
                  <Tag>
                    {
                      {
                        pending:
                          request.requesterMemberId === actorId
                            ? "等待对方处理"
                            : "待你处理",
                        accepted: "已同意",
                        declined: "已拒绝",
                        revoked: "已撤销",
                      }[request.status]
                    }
                  </Tag>
                </p>
                <p className="text-xs text-slate-500">
                  <time dateTime={request.updatedAt}>
                    {new Date(request.updatedAt).toLocaleString()}
                  </time>
                  {request.status !== "pending" &&
                    (request.requesterMemberId === actorId ? " · 发出" : " · 收到")}
                </p>
                <Space wrap>
                  {request.status === "pending" &&
                    request.deciderMemberId === actorId &&
                    request.allowedDecisions.map((decision) => (
                      <Button
                        key={decision}
                        type={decision === "accept" ? "primary" : "default"}
                        loading={busy}
                        onClick={() =>
                          void command(() =>
                            researchApi("decideContactRequest", {
                              params: { id: request.id },
                              body: { expectedVersion: request.version, decision },
                            }),
                          )
                        }
                      >
                        {decision === "accept" ? "同意" : "拒绝"}
                      </Button>
                    ))}
                  {((request.status === "pending" &&
                    request.requesterMemberId === actorId) ||
                    (request.status === "accepted" &&
                      [request.requesterMemberId, request.deciderMemberId].includes(
                        actorId || "",
                      ))) && (
                    <Button
                      danger
                      disabled={busy}
                      onClick={() => {
                        const confirmationScope = scope.current;
                        confirmation.current = Modal.confirm({
                          title:
                            request.status === "pending" ? "撤回申请？" : "撤销授权？",
                          content:
                            "取消此联系人关系，不自动撤销独立群成员身份和已承接任务。",
                          onOk: () => {
                            if (
                              scope.current !== confirmationScope ||
                              generation !== useResearchStore.getState().generation
                            )
                              return;
                            return command(() =>
                              researchApi("revokeContactRequest", {
                                params: { id: request.id },
                                body: { expectedVersion: request.version },
                              }),
                            );
                          },
                        });
                      }}
                    >
                      {request.status === "pending" ? "撤回申请" : "撤销授权"}
                    </Button>
                  )}
                </Space>
              </article>
            ))}
          </section>
        ))}
    </div>
  );
}
