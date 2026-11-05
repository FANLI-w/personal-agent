import { Button } from "antd";
import {
  type ChatPlan,
  type PlannerSupplement,
  plannerDiscussionIssue,
  plannerSupplementMap,
  planQuestionOptions,
  planQuestionText,
} from "./planner-chat";

type Props = {
  plan: Pick<
    ChatPlan,
    "goal" | "outcome" | "supplements" | "proposedItems" | "unresolvedQuestions"
  >;
  version: number;
  disabled: boolean;
  onReassess: () => void;
  onOption: (option: string) => void;
};

/** Displays saved metadata; it never invents a blocker or starts a model call. */
export function PlanningDiscussion({
  plan,
  version,
  disabled,
  onReassess,
  onOption,
}: Props) {
  const issue = plannerDiscussionIssue(plan);
  // Plans written before the outcome field keep showing their closing step's deliverable.
  const terminal = plan.outcome?.trim() || plan.proposedItems.at(-1)?.deliverable.trim();
  const supplements = plannerSupplementMap(
    plan.proposedItems,
    (plan.supplements ?? []) as PlannerSupplement[],
  );
  return (
    <article className="planning-chat-discussion" aria-label="讨论中的任务方向">
      <header>
        <span>小鲸鱼的理解</span>
        <b>讨论中</b>
      </header>
      <div className="discussion-panel">
        <div className="discussion-row">
          <span>目标</span>
          <p>{plan.goal}</p>
        </div>
        <div className="discussion-row">
          <span>流程</span>
          <div className="discussion-flow">
            {plan.proposedItems.map((step, index) => {
              const attached = supplements.get(step.id);
              const label = { material: "材料", constraint: "约束", note: "备注" };
              const bubble = (s: { id: string; kind: "material" | "constraint" | "note"; text: string }, side: "above" | "below") => (
                <span
                  className={`discussion-supp is-${side}`}
                  key={s.id}
                  title={`${label[s.kind]}：${s.text}`}
                >
                  <i>{label[s.kind]}</i>
                  {s.text}
                </span>
              );
              return (
                <span className="discussion-slot" key={step.id}>
                  {attached?.above.map((s) => bubble(s, "above"))}
                  <span className="discussion-step">
                    {index > 0 && <i aria-hidden="true">→</i>}
                    <em
                      title={
                        !step.status ? "原方案未标注规划状态，需要重新核对" : step.status
                      }
                      className={
                        !step.status
                          ? "is-unclassified"
                          : step.status === "阻塞"
                          ? "is-blocked"
                          : step.status === "可执行"
                          ? "is-ready"
                          : "is-pending"
                      }
                    >
                      {step.title}
                    </em>
                  </span>
                  {attached?.below.map((s) => bubble(s, "below"))}
                </span>
              );
            })}
            {!!terminal && (
              <span className="discussion-step">
                <i aria-hidden="true">→</i>
                <em title="计划中的最终成果，尚未完成">{terminal}</em>
              </span>
            )}
          </div>
        </div>
        <div className="discussion-legend">
          <span>
            <em className="is-blocked">阻塞</em>缺关键信息
          </span>
          <span>
            <em className="is-pending">待定</em>可后续补
          </span>
        </div>
      </div>
      {issue && (
        <div className="discussion-question" role="status">
          <p>{issue}</p>
          <Button disabled={disabled} onClick={onReassess}>
            按新版规则重新梳理
          </Button>
        </div>
      )}
      {!!plan.unresolvedQuestions.length && (
        <div className="discussion-question">
          <span>需要你先确认一件事</span>
          <p>{planQuestionText(plan.unresolvedQuestions[0])}</p>
          {!!planQuestionOptions(plan.unresolvedQuestions[0])?.length && (
            <div className="discussion-options">
              {planQuestionOptions(plan.unresolvedQuestions[0])?.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="discussion-option"
                  disabled={disabled}
                  onClick={() => onOption(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          {plan.unresolvedQuestions.length > 1 && (
            <details>
              <summary>还有 {plan.unresolvedQuestions.length - 1} 个待确认</summary>
              {plan.unresolvedQuestions.slice(1).map((q, i) => (
                <p key={i}>{planQuestionText(q)}</p>
              ))}
            </details>
          )}
        </div>
      )}
      <footer className="discussion-meta">
        <span>讨论中 · 版本 {version}</span>
        <span>未创建任何任务</span>
      </footer>
    </article>
  );
}
