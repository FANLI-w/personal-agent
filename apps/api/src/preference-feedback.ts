// An explicit limit to the current task/turn must not become a lasting habit,
// even when the reflection model returns syntactically valid evidence.
const temporaryScope = /这(?:一)?次|本(?:次|轮|条|回)|这(?:轮|回)|临时|一次性|(?:上线|发布|部署|发版)前(?:的)?(?:测试|检查|验收)|\b(?:this (?:time|reply|response|turn|message|task|test)|for now|one[- ]off|(?:pre[- ]?flight|smoke)[ -]?test)\b/iu
// "Remember" by itself is not a statement of recurring preference. Explicit
// memory commands have a separate owner-controlled path, before this worker.
const durableScope = /以后|今后|始终|每次|通常|平时|(?:我|我的)(?:更)?(?:习惯|喜欢|偏好)|\b(?:from now on|always|usually|every time|prefer|preference)\b/iu
const doNotRemember = /(?:不要|别|不用|无需|不必|不需要)(?:再)?(?:保存|记住|记忆|长期记)|(?:do not|don't|never)\s+(?:save|remember|store)/iu
const quotedSource = /^\s*(?:[「『“"'`]|(?:附件|文档|材料|引用|原文|摘录|示例)(?:文字|内容|中|里)?\s*(?:写着|写道|说|要求|如下|为|是|[:：])|(?:the\s+)?(?:attachment|document|quote|example)\s*(?:says?|reads?|requires?|[:：]))/iu
const replyCommand = /(?:请\s*)?(?:(?:只|仅)(?:需|要)?\s*)?(?:回复|回答|输出|返回)\s*(?:为|成)?\s*[:：]?\s*(.+?)\s*$|\b(?:reply|respond|answer|output|return|say)\s+(?:(?:only|exactly|verbatim)\s+)*(?:with\s+)?(.+?)\s*$/iu
function literalReply(text: string) {
  const command = replyCommand.exec(text)
  const value = command?.[1] ?? command?.[2]
  return !!value && (/^[「『“"'`]/u.test(value) || /^[A-Z][A-Z0-9_ -]{0,79}[。.!！]?$/u.test(value) || /^(?:ok|ack|pong|received|收到(?:\s+[A-Z0-9_-]+)?|好的|明白|已连接)[。.!！]?$/iu.test(value))
}
const sentenceBoundary = /(?<=[。！？!?;；\n])|(?<=\.)(?=\s|$)/u
const scopeBoundary = /[，,](?=\s*(?:(?:但|不过|另外|而且|but|and)\s*)?(?:以后|今后|平时|通常|每次|始终|我习惯|我通常|我一般|我更喜欢|这次|这一次|本次|本轮|这轮|临时|from now on|always|usually|every time|this time|for now))/iu

/** Keep independent feedback sentences; never promote an explicitly temporary
 * instruction or a literal response probe into reusable preference evidence.
 * The model still interprets ordinary corrections and praises semantically. */
export function reusablePreferenceFeedback(text: string): string {
  // An excerpt may span several sentences; do not reclassify its later
  // sentences as the author's own feedback after removing its opening label.
  if (quotedSource.test(text)) return ''
  const sentences = text.split(sentenceBoundary)
  const eligible: string[] = []
  let excluded = false
  for (const sentence of sentences) {
    // Never turn a quoted attachment's "always" into the author's habit.
    if (quotedSource.test(sentence) || doNotRemember.test(sentence)) { excluded = true; continue }
    for (const clause of sentence.split(scopeBoundary)) {
      if (temporaryScope.test(clause) || (literalReply(clause) && !durableScope.test(clause))) { excluded = true; continue }
      if (clause.trim()) eligible.push(clause.trim())
    }
  }
  return excluded ? eligible.join('\n') : text.trim()
}
