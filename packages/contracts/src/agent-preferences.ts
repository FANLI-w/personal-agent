// The UI recognizes exactly the same explicit owner commands as the service.
// Quoted material, questions and frustration never become persistent preferences.
export function agentStyleInstruction(text: string) {
  const value = text.trim()
  if (/[?？]/.test(value) || /(?:只是(?:引用|举例|讨论)|(?:不要|别|暂不)(?:真的|实际)?(?:保存|记住|修改|更改|调整)|不是真的)/.test(value)) return null
  if (/^(?:请)?清除你的交流偏好[。！!\s]*$/.test(value)) return { kind: 'clear' as const }
  const match = /^(?:请)?(?:调整|纠正|更正)(?:你的)?(?:交流方式|说话方式|沟通方式)\s*[:：]\s*(.+)$/s.exec(value)
    ?? /^(?:请)?记住(?:你|这个助手)的交流偏好\s*[:：]\s*(.+)$/s.exec(value)
    ?? /^以后(?:请)?(?:跟我|和我)(?:聊天|交流|讨论)(?:时)?\s*[，,:：]\s*(.+)$/s.exec(value)
  return match ? { kind: 'save' as const, content: match[1]!.trim() } : null
}
