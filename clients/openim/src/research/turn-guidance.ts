import type { AgentTurn } from "@research-agent-platform/contracts";
import { serviceErrorMessage } from "./api-errors";

type Guidance = {
  title: string;
  nextStep: string;
  tone: "info" | "warning" | "error" | "success";
};

function modelGuidance(turn: AgentTurn, manager: boolean): Guidance {
  if (turn.availability.status === "available")
    return {
      title: "本次未能调用模型",
      nextStep:
        "模型配置现在已可用。这次请求仍保留失败状态，可以查看剩余预算后重试。",
      tone: "warning",
    };
  const settings = "打开“我的 → 模型设置”检查配置，保存后可以回来重试。";
  switch (turn.availability.reason) {
    case "platform_disabled":
      return {
        title: "平台模型服务尚未启用",
        nextStep: "请联系平台管理员启用模型服务；仅修改实验室设置无法启用平台服务。",
        tone: "warning",
      };
    case "lab_disabled":
      return { title: "模型尚未启用", nextStep: settings, tone: "warning" };
    case "missing_credentials":
      return {
        title: "模型密钥未配置或暂不可用",
        nextStep: settings,
        tone: "warning",
      };
    case "capability_unavailable":
      return {
        title: "这个 AI 的能力当前不可用",
        nextStep: "请核对其能力状态，或选择已加入且可用的 AI。",
        tone: "warning",
      };
    case "owner_authorization_required":
      return {
        title: "这个 AI 尚需负责人授权",
        nextStep: "请先获得 AI 所属负责人的同意，再提交请求。",
        tone: "warning",
      };
    case "not_connected":
      return { title: "模型服务暂未连通", nextStep: settings, tone: "warning" };
    default:
      return { title: "模型服务暂不可用", nextStep: settings, tone: "warning" };
  }
}

/** Present only the actual turn state; never infer a reply or successful task. */
export function turnGuidance(turn: AgentTurn, manager = false): Guidance {
  if (turn.memoryReceipt?.operation === "clarify") return {
    title: "确认一下你想记住的内容", nextStep: turn.memoryReceipt.question || "你想记住哪条偏好？", tone: "info",
  };
  if (turn.followupReceipt?.operation === "clarify") return {
    title: "这次提醒还没设好", nextStep: turn.followupReceipt.question || "你希望什么时候提醒？", tone: "info",
  };
  if (turn.failure?.startsWith("EXTERNAL_")) return {
    title: serviceErrorMessage(turn.failure, 0),
    nextStep: "请核对外部服务状态与记录。不会自动重试，也不会改用发送者的模型；重新发送仍需逐条授权。",
    tone: "warning",
  };
  if (
    turn.purpose === "create_agent" &&
    (turn.status === "queued" || turn.status === "running")
  )
    return {
      title: "正在创建 Agent",
      nextStep:
        turn.status === "queued"
          ? "创建请求已保存，正在等待处理；联系人尚未创建。"
          : "正在整理 Agent 档案；联系人尚未创建。",
      tone: "info",
    };
  if (turn.purpose === "create_agent" && turn.status === "waiting_input")
    return {
      title: "再聊清一个细节就能创建",
      nextStep: "接着回答助理刚才的问题即可，联系人还没有创建。",
      tone: "info",
    };
  if (turn.status === "succeeded" && turn.createdAgent)
    return {
      title: turn.createdAgent.reused ? "已找到你的 Agent" : "Agent 已添加",
      nextStep: "可以打开它的对话，从你正在做的研究聊起。",
      tone: "success",
    };
  if (turn.status === "queued")
    return {
      title: "等待 AI 回复",
      nextStep: "请求已保存，正在等待处理。",
      tone: "info",
    };
  if (turn.status === "running")
    return {
      title: "AI 正在回复",
      nextStep: "回复会显示在这段对话里。",
      tone: "info",
    };
  if (turn.status === "waiting_input")
    return {
      title: "聊到一个需要确认的地方",
      nextStep: "可以接着回复刚才的问题，也可以直接调整方向。",
      tone: "info",
    };
  if (turn.status === "succeeded")
    return {
      title: "AI 已回复",
      nextStep: "可以接着讨论。涉及任务安排时，确认后才会建立。",
      tone: "success",
    };
  switch (turn.failure) {
    case "AGENT_LIMIT_REACHED":
      return {
        title: "你的 Agent 数量已达上限",
        nextStep:
          "本次没有创建新的联系人。可以从通讯录打开已有 Agent，或修改已有 Agent 的资料后使用。",
        tone: "warning",
      };
    case "MODEL_UNAVAILABLE":
      return modelGuidance(turn, manager);
    case "BUDGET_EXCEEDED": {
      const usage = turn.usage;
      const tokensExceeded =
        usage?.inputTokens != null &&
        usage.outputTokens != null &&
        usage.inputTokens + usage.outputTokens > turn.budget.maxTokens;
      const timeExceeded =
        usage != null && usage.elapsedMs > turn.budget.maxSeconds * 1000;
      return {
        title:
          tokensExceeded && timeExceeded
            ? "本次用量和耗时超出预算"
            : tokensExceeded
            ? "本次上下文与回复总量超出预算"
            : timeExceeded
            ? "本次处理耗时超出预算"
            : "本次上下文、回复或耗时超出限制",
        nextStep: turn.remainingBudget
          ? "内容没能在本次预算内处理完。可以先选最相关的一段材料再发送；原预算不会自动提高。"
          : "本轮已没有可重试的预算。可以保留当前需求，下次先处理最相关的一段材料。",
        tone: "error",
      };
    }
    case "INVALID_MODEL_OUTPUT":
      return {
        title: "这次回复格式出了问题",
        nextStep: "原需求已保留，可以重试这次请求；协作建议没有执行。",
        tone: "error",
      };
    case "MODEL_FAILED":
      return {
        title: "这次没能收到模型回复",
        nextStep: "可以先重试；若仍失败，到“我的 → 模型设置”检查当前服务。",
        tone: "error",
      };
    case "LEASE_EXPIRED_USAGE_UNCERTAIN":
      return {
        title: "AI 处理已中断，用量尚无法确认",
        nextStep:
          "请先核对模型服务与本次用量，再决定是否提交新的请求；系统不会自动重试。",
        tone: "warning",
      };
    case "AUTHORITY_CHANGED":
      return {
        title: "本次请求的授权已变化",
        nextStep: "请重新核对会话成员、AI 和材料权限后再提交。旧请求不会继续执行。",
        tone: "warning",
      };
    case "INPUT_CHANGED":
      return {
        title: "本次请求的材料或资料已变化",
        nextStep: "重新读取当前材料后再发送，就能接着讨论。",
        tone: "warning",
      };
  }
  if (turn.status === "unavailable") return modelGuidance(turn, manager);
  if (turn.status === "cancelled")
    return {
      title: "AI 请求已取消",
      nextStep: "可以修改想法，再接着发送。",
      tone: "warning",
    };
  if (turn.status === "interrupted")
    return {
      title: "AI 处理已中断",
      nextStep: "请先核对处理状态和本次用量，再决定是否提交新的请求。",
      tone: "warning",
    };
  return {
    title: "AI 请求未完成",
    nextStep: "本次没有可用回复。请核对需求及服务状态后再提交。",
    tone: "error",
  };
}
