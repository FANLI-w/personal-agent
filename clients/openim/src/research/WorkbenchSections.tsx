import { useSearchParams } from "react-router-dom";
import { PersonalFollowupPanel } from "./PersonalFollowupPanel";
import { PlanningHistory } from "./PlanningHistory";

export function WorkbenchPlanning() {
  const [params, setParams] = useSearchParams();
  const scheduled = params.get("panel") === "scheduled";
  return (
    <div className="workspace-group-panel">
      {scheduled ? (
        <div className="workspace-full-panel">
          <PersonalFollowupPanel active />
        </div>
      ) : (
        <PlanningHistory />
      )}
    </div>
  );
}
