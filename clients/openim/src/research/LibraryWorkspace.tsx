import "./workspace.scss";
import "./library-workspace.scss";

import { Segmented } from "antd";
import { useSearchParams } from "react-router-dom";

import { LabStandards } from "./LabStandards";
import { LibraryIndexPage } from "./LibraryIndexPage";
import { ResearchLibrary } from "./ResearchLibrary";
import { useWorkspaceAvailability } from "./useWorkspaceAvailability";
import { WorkspaceReports } from "./WorkspaceReports";
import { TeamLibraryWorkspace } from './TeamLibraryWorkspace';

export function LibraryWorkspace() {
  const [params, setParams] = useSearchParams();
  // The standards page needs its own routes, so the tab only appears once the
  // server can answer for it; older servers keep the plain library.
  const availability = useWorkspaceAvailability(true);
  const standardsReady = availability.supports(40);
  const indexReady = availability.supports(41);
  const reports = params.get("panel") === "reports";
  const standards = params.get("panel") === "standards" && standardsReady;
  const index = params.get("panel") === "index" && indexReady;
  if(availability.supports(44)) return <main className="social-workspace workspace-library"><header className="workspace-heading"><h1>资料</h1></header><TeamLibraryWorkspace supported initialPanel={params.get('panel')}/></main>;
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
          value={
            reports
              ? "reports"
              : standards
              ? "standards"
              : index
              ? "index"
              : "collections"
          }
          options={[
            { label: "资料库", value: "collections" },
            ...(indexReady ? [{ label: "资料索引", value: "index" }] : []),
            ...(standardsReady ? [{ label: "课题组规范", value: "standards" }] : []),
            { label: "本机报告", value: "reports" },
          ]}
          onChange={(value) => {
            const next = new URLSearchParams(params);
            // Old "peers" links fall back to the library instead of a blank tab.
            if (value === "reports" || value === "standards" || value === "index")
              next.set("panel", value);
            else next.delete("panel");
            setParams(next);
          }}
        />
      </div>
      <div className={`library-workspace-content ${reports ? "is-reports" : ""}`}>
        {reports ? (
          <WorkspaceReports active />
        ) : standards ? (
          <LabStandards />
        ) : index ? (
          <LibraryIndexPage />
        ) : (
          <ResearchLibrary />
        )}
      </div>
    </main>
  );
}
