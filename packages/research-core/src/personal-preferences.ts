/** Shared conflict resolution for server and local task consumers. Candidates
 * cannot override a saved preference; revocations remain authoritative. */
export function preferenceTopicKey(topic: string) {
  const normalized = topic
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
  const aliases: Record<string, string> = {
    回答方式: "回复方式",
    回复风格: "回复方式",
    回答风格: "回复方式",
    名字: "称呼",
  };
  return aliases[normalized] ?? normalized;
}

export function effectivePersonalPreferences<
  T extends { topic: string; status: string; updatedAt: string }
>(legacy: T[], assistant: T[]) {
  const effective = new Map<string, T>();
  // Equal timestamps retain the legacy authority, matching persisted server context.
  for (const value of [...assistant, ...legacy]) {
    if (value.status === "candidate") continue;
    const topic = preferenceTopicKey(value.topic),
      previous = effective.get(topic);
    if (!previous || value.updatedAt >= previous.updatedAt)
      effective.set(topic, value);
  }
  return [...effective.values()];
}
