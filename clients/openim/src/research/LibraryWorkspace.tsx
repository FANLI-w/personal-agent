import { Segmented } from "antd";
import { useSearchParams } from "react-router-dom";
import { ResearchLibrary } from "./ResearchLibrary";
import { WorkspaceReports } from "./WorkspaceReports";
import "./workspace.scss";
import "./library-workspace.scss";

export function LibraryWorkspace() {
  const [params, setParams] = useSearchParams();
  const reports = params.get("panel") === "reports";
  return (
    <main className="social-workspace workspace-library">
      <header className="workspace-heading">
        <div>
          <h1>资料</h1>
          <p>整理科研资料、查看来源，和资料 Agent 直接聊。</p>
        </div>
      </header>
      <div className="workspace-toolbar">
        <Segmented
          aria-label="资料栏目"
          value={reports ? "reports" : "collections"}
          options={[
            { label: "资料库", value: "collections" },
            { label: "本机报告", value: "reports" },
          ]}
          onChange={(value) => {
            const next = new URLSearchParams(params);
            if (value === "reports") next.set("panel", "reports");
            else next.delete("panel");
            setParams(next);
          }}
        />
      </div>
      <div className={`library-workspace-content ${reports ? "is-reports" : ""}`}>
        {reports ? <WorkspaceReports active /> : <ResearchLibrary />}
      </div>
    </main>
  );
}
