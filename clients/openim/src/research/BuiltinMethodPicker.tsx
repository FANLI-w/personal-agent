import { Alert, Button, Input, Modal, Spin } from "antd";
import { useEffect, useState } from "react";
import type { RequestFor } from "@research-agent-platform/contracts";
import type { BuiltinMethod } from "@research-agent-platform/research-skills/builtin-methods";
import type { AgentRoleProfile } from "@research-agent-platform/research-skills/roles";
import { builtinMethodDraft, matchingBuiltinMethods, suggestedRoleMethods } from "./builtin-methods";

export function BuiltinMethodPicker({ disabled, profile, onChoose }: {
  disabled: boolean;
  profile?: AgentRoleProfile;
  onChoose: (draft: RequestFor<"installSkill">["body"]) => void;
}) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const [methods, setMethods] = useState<readonly BuiltinMethod[]>();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    setFailure("");
    void import("@research-agent-platform/research-skills/builtin-methods").then(value => {
      if (active) setMethods(value.builtinMethods);
    }).catch(() => { if (active) setFailure("内置方法未能载入，请关闭后重新打开。"); });
    return () => { active = false; };
  }, [open]);
  const suggested = new Set(suggestedRoleMethods(profile));
  const matches = matchingBuiltinMethods(methods || [], search, profile);
  return <>
    <Button disabled={disabled} onClick={() => setOpen(true)}>内置方法</Button>
    <Modal title="内置方法" open={open} footer={null} width={680} onCancel={() => setOpen(false)}>
      <Input.Search aria-label="搜索内置方法" placeholder="搜索选题、文献、绘图、申请书、PPT、专利、软著…" value={search} onChange={event => setSearch(event.target.value)} allowClear />
      {failure && <Alert className="mt-3" type="warning" message={failure} />}
      {!methods && !failure && <Spin className="my-6" />}
      <div className="mt-4 max-h-[55vh] space-y-3 overflow-auto">
        {matches.map(method => <article key={method.id} className="rounded-lg border border-slate-200 p-4">
          <strong>{method.displayName}{suggested.has(method.id) ? " · 适合这位助手" : ""}</strong>
          <p className="my-2 text-sm leading-6">{method.package.description}</p>
          <Button disabled={disabled} onClick={() => { onChoose(builtinMethodDraft(method)); setOpen(false); }}>预览并安装</Button>
        </article>)}
        {methods && !matches.length && <p>没有找到匹配的方法。</p>}
      </div>
    </Modal>
  </>;
}
