import { Link } from "react-router-dom";
import { useResearchStore } from "./store";
export function ResearchTeamAccountHint() {
  const actor = useResearchStore((s) => s.actor);
  return (
    <p className="research-team-scope workspace-muted">
      {actor?.spaceKind === "personal"
        ? "当前是个人空间，可先独立规划。"
        : "分工面向当前课题组成员。"}{" "}
      <Link to="/me?view=labs">创建、加入或管理课题组</Link>
      。已有账号可接受邀请，无需重新注册；添加好友不会自动加入课题组。
    </p>
  );
}
