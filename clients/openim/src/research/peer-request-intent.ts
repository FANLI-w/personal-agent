/** An explicit file request only; ordinary questions, quotes and vague ideas remain chat. */
export function parsePeerChatRequest(
  text: string,
  members: readonly { id: string; displayName: string; username: string }[],
  deviceId: string,
) {
  const value = text.trim();
  if (/[?？]$/.test(value) || /^(比如|例如|假如|如果|引用)/.test(value))
    return undefined;
  const matches = members.flatMap((member) => {
    const names = [member.displayName, member.username].filter(Boolean);
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        new RegExp(
          `^(?:请|帮我|请帮我)?\\s*(?:找一下|找|查找|获取)\\s*@?${escaped}\\s*(?:的|共享的)\\s*(.+)$`,
        ),
        new RegExp(
          `^(?:请|帮我|请帮我)?\\s*(?:向|找)\\s*@?${escaped}\\s*(?:要|索取)\\s*(.+)$`,
        ),
      ];
      for (const p of patterns) {
        const match = value.match(p);
        if (match?.[1])
          return [
            {
              deviceId,
              providerId: member.id,
              query: match[1].replace(/[。！!]$/, "").trim(),
            },
          ];
      }
    }
    return [];
  });
  return matches.length === 1 && matches[0].query.length <= 300
    ? matches[0]
    : undefined;
}
