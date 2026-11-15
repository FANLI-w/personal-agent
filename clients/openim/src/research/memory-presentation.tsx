import { useState } from "react";
import type { PersonalMemory } from "@research-agent-platform/contracts";

export const memoryOrigins = {
  explicit: "本人明确保存",
  feedback: "来自聊天或任务反馈",
  inferred: "助理提出的候选",
};

export function generalHabits(memories: PersonalMemory[]) {
  return memories.filter(
    (memory) => memory.status === "confirmed" && memory.scope === "general",
  );
}

/** Display boundaries only; saving and searching continue to use the stored text. */
export function memoryPreferenceLines(text: string) {
  return text.split(/(?<=[。！？；;])(?=[^\r\n])|(?<=\n)(?=[^\r\n])/u).filter((line) => line.trim());
}

/** Presentation only: the full stored text remains intact and searchable. */
export function MemoryText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = memoryPreferenceLines(text);
  const canExpand = lines.length > 3 || (lines.length === 1 && text.length > 120);
  return (
    <div
      className={`habit-content ${canExpand ? "can-collapse" : ""} ${
        expanded ? "expanded" : ""
      }`}
    >
      {lines.length > 1 ? (
        <ul className="habit-preferences">
          {lines.map((line, index) => (
            <li key={index} hidden={!expanded && index >= 3}>
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <p>{text}</p>
      )}
      {canExpand && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起全文" : "展开全文"}
        </button>
      )}
    </div>
  );
}
