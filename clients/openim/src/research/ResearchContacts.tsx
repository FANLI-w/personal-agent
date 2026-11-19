import { UserAddOutlined } from "@ant-design/icons";
import { Alert, Button, Input, Modal } from "antd";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Id } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { ResearchUserCard } from "./ResearchUserCard";
import type { OverlayVisibleHandle } from "@/hooks/useOverlayVisible";
import { ContactFinder } from "./ContactFinder";
import type { Contact } from "@research-agent-platform/contracts";
import { ContactDirectoryRow } from "./ContactDirectoryRow";
import { readCombinedDirectoryPage, sortDirectoryContacts, type DirectoryCursor } from "./contact-directory";
import { useContactStars } from "./useContactStars";
import { usePersonalOperation } from "./usePersonalOperation";
import { WorkspaceContactCard } from "./WorkspaceContactCard";
import "./workspace.scss";
import "./directory-skills.scss";

const DirectorySkillLibrary = lazy(() => import("./DirectorySkillLibrary").then(module => ({ default: module.DirectorySkillLibrary })));

export function ResearchContacts() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedView = params.get("view");
  const library = params.get("panel") === "skills";
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [pageFailure, setPageFailure] = useState("");
  const [selectedContact, setSelected] = useState<string>();
  const generation = useResearchStore((s) => s.generation);
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const filterKey = `${generation}:${search}`;
  const [paging, setPaging] = useState<{ key: string; cursors: (DirectoryCursor | undefined)[] }>();
  const pages = paging?.key === filterKey ? paging.cursors : [undefined];
  const setPages = (update: (old: (DirectoryCursor | undefined)[]) => (DirectoryCursor | undefined)[]) => setPaging({ key: filterKey, cursors: update(pages) });
  const cursor = pages[pages.length - 1];
  const stars = useContactStars();
  const directoryOperation = usePersonalOperation(true, `contact-directory:${library}`);
  const profile = useRef<OverlayVisibleHandle>(null);
  const { data, error, refresh, refreshChecked } = useResearchRead(
    signal => readCombinedDirectoryPage((view, next) => researchApi("chatContacts", {
      query: { view, scope: "local", limit: 50, cursor: next, search: search.trim() }, signal,
    }), "people", signal, cursor),
    `${filterKey}:${JSON.stringify(cursor) || ""}`,
    !library,
  );
  useLayoutEffect(() => {
    setAdding(false);
    setSelected(undefined);
    setPaging(undefined);
    setSearch("");
    setPageFailure("");
  }, [generation]);
  useEffect(() => {
    if (!actorId) return;
    const action = params.get("action"), sharedId = params.get("contact");
    if (!action && sharedId === null && requestedView !== "search") return;
    const controller = new AbortController();
    const sameActor = () => !controller.signal.aborted && generation === useResearchStore.getState().generation && actorId === useResearchStore.getState().actor?.member.id;
    const next = new URLSearchParams(params);
    next.delete("action"); next.delete("contact");
    if (requestedView === "search") next.delete("view");
    if (sharedId !== null) {
      if (!Id.safeParse(sharedId).success) {
        setPageFailure("联系人名片链接无效，请重新复制完整链接。"); setParams(next, { replace: true });
      } else void researchApi("chatContact", { params: { id: sharedId }, signal: controller.signal }).then(result => {
        if (!sameActor()) return;
        next.delete("kind"); setSelected(result.data.id); setParams(next, { replace: true });
      }).catch(error => { if (sameActor()) { setPageFailure(error instanceof Error ? error.message : "名片暂未打开。"); setParams(next, { replace: true }); } });
    } else {
      next.delete("kind");
      setAdding(action === "add-contact" || requestedView === "search");
      setParams(next, { replace: true });
    }
    return () => controller.abort();
  }, [params, requestedView, setParams, actorId, generation]);
  const selectContact = (contact: Contact) => {
    setAdding(false);
    setSelected(contact.id);
  };
  const openProfile = (id: string) => {
    const ticket = directoryOperation.capture();
    void researchApi("chatContact", { params: { id } }).then(result => {
      if (!ticket.isCurrent()) return;
      selectContact(result.data);
      const next = new URLSearchParams(params); next.delete("kind");
      ["panel", "agent", "skill", "catalog", "returnContact"].forEach(key => next.delete(key));
      setParams(next);
    }).catch(error => { if (ticket.isCurrent()) setPageFailure(error instanceof Error ? error.message : "资料暂未打开。"); });
  };
  const manageProfile = (id: string) => {
    setSelected(id); profile.current?.openOverlay();
  };
  const filtered = sortDirectoryContacts(data?.data || [], stars.ids);
  const openSkills = (skillId?: string, agentId?: string) => {
    setAdding(false);
    const next = new URLSearchParams({ kind: "agents", panel: "skills" });
    if (skillId) next.set("skill", skillId);
    if (agentId) next.set("agent", agentId);
    if (selectedContact) next.set("returnContact", selectedContact);
    setParams(next);
  };
  const closeSkills = () => {
    const next = new URLSearchParams({ kind: "agents" });
    const agent = params.get("returnContact") || params.get("agent");
    if (agent) next.set("contact", agent);
    setParams(next);
  };
  return (
    <div className={`social-workspace desktop-contacts-content${library ? " is-skill-library" : ""}`}>
      <div className="workspace-split">
        {!library && <aside className="workspace-list-pane">
          <div className="workspace-heading">
            <h1>通讯录</h1>
          </div>
          <div className="workspace-toolbar workspace-contact-toolbar">
            <Input
              className="max-w-[320px]"
              maxLength={200}
              aria-label="搜索联系人"
              placeholder="搜索姓名或 DeepChat 号"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button icon={<UserAddOutlined />} onClick={() => setAdding(true)}>添加联系人</Button>
          </div>
          <div className="workspace-list-scroll">
            <div className="workspace-contact-shortcuts">
              <button onClick={() => navigate("/contact/newFriends")}>好友申请</button>
              <button onClick={() => navigate("/contact/groupNotifications")}>
                群邀请
              </button>
              <button onClick={() => navigate("/contact/myGroups")}>我的群组</button>
            </div>
            {pageFailure && (
              <Alert
                type="warning"
                message={pageFailure}
                closable
                onClose={() => setPageFailure("")}
              />
            )}
            {error && <Alert type="error" message={error} />}
            {stars.error && <Alert type="warning" message={stars.error} />}
            {!data && !error && (
              <p role="status" className="p-4 text-sm text-slate-500">
                正在读取通讯录…
              </p>
            )}
            {filtered.map(contact => <ContactDirectoryRow key={`${filterKey}:${contact.id}`} contact={contact}
              selected={selectedContact === contact.id} starred={stars.ids.includes(contact.id)}
              onSelect={() => selectContact(contact)} onDetails={() => { selectContact(contact); manageProfile(contact.id); }}
              onStar={() => stars.toggle(contact.id)} onRemoved={async () => { setSelected(previous => previous === contact.id ? undefined : previous); await refreshChecked(); }} />)}
            {data && !filtered.length && (
              <p className="py-10 text-center text-sm text-slate-500">
                {search ? "没有匹配的联系人" : "暂无联系人"}
              </p>
            )}
            {(pages.length > 1 || data?.nextCursor) && (
              <div className="workspace-pages">
                <Button
                  size="small"
                  disabled={pages.length === 1}
                  onClick={() => setPages((v) => v.slice(0, -1))}
                >
                  上一页
                </Button>
                <Button
                  size="small"
                  disabled={!data?.nextCursor}
                  onClick={() => {
                    if (data?.nextCursor) setPages((v) => [...v, data.nextCursor!]);
                  }}
                >
                  更多联系人
                </Button>
              </div>
            )}
          </div>
        </aside>}
        <main className="workspace-detail-pane">
          {library ? (
            <Suspense fallback={<p role="status">正在打开技能库…</p>}>
              <DirectorySkillLibrary onBack={closeSkills} />
            </Suspense>
          ) : selectedContact ? (
            <WorkspaceContactCard
              key={selectedContact}
              contactId={selectedContact}
              onManage={manageProfile}
              onOpenContact={setSelected}
              onChanged={refresh}
              onOpenSkills={openSkills}
            />
          ) : (
            <div className="workspace-empty">
              <h2>选择一位联系人</h2>
              <p>从左侧列表选择，查看资料并开始聊天。</p>
            </div>
          )}
        </main>
      </div>
      <ResearchUserCard contactId={selectedContact} ref={profile} />
      <Modal
        title="添加联系人"
        className="workspace-add-dialog"
        open={adding}
        onCancel={() => setAdding(false)}
        footer={null}
        width={800}
        destroyOnClose
      >
        <ContactFinder kind="people" onOpen={openProfile} active={adding} />
      </Modal>
    </div>
  );
}
