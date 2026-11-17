/** Both task types use verified file delivery; personal tasks also accept text. */
export function taskDeliveryMode(_kind: "personal" | "research") {
  return "files";
}
export function taskDeliveryAction(_kind: "personal" | "research") {
  return "提交文件成果";
}
