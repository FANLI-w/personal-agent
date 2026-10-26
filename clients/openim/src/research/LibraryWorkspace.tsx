import { Segmented } from "antd";
import { useSearchParams } from "react-router-dom";
import { ResearchLibrary } from "./ResearchLibrary";
import { PeerLibraryPanel } from "./PeerLibraryPanel";
import { WorkspaceReports } from "./WorkspaceReports";
import "./workspace.scss";
import "./library-workspace.scss";

export function LibraryWorkspace() {
  const [params, setParams] = useSearchParams();
  const reports = params.get("panel") === "reports";
  const peers = params.get("panel") === "peers";
  return (
    <main className="social-workspace workspace-library">
      <header className="workspace-heading">
        <div>
          <h1>资料</h1>
        </div>
      </header>
      <div className="workspace-toolbar">
        <Segmented
          aria-label="资料栏目"
          value={peers ? "peers" : reports ? "reports" : "collections"}
          options={[
            { label: "资料库", value: "collections" },
            { label: "本机报告", value: "reports" },
            { label: "同事资料", value: "peers" },
          ]}
          onChange={(value) => {
            const next = new URLSearchParams(params);
            if (value === "reports" || value === "peers") next.set("panel", value);
            else next.delete("panel");
            setParams(next);
          }}
        />
      </div>
      <div className={`library-workspace-content ${reports ? "is-reports" : ""}`}>
        {peers ? <PeerLibraryPanel /> : reports ? <WorkspaceReports active /> : <ResearchLibrary />}
      </div>
    </main>
  );
}
