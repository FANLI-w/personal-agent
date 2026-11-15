/** Personal task results are text; research tasks support file delivery. */
export function taskDeliveryMode(kind: "personal" | "research") {
  return kind === "research" ? "files" : "text";
}

export function taskDeliveryAction(kind: "personal" | "research") {
  return taskDeliveryMode(kind) === "files" ? "提交文件成果" : "提交文字成果";
}
