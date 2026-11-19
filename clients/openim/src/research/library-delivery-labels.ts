import type { ResearchCollection, WorkbenchCard } from "@research-agent-platform/contracts";

const deliveryPrefix = "任务交付 · ";

export function deliveryTaskId(collection: ResearchCollection) {
  const [taskId] = collection.taskIds;
  if (
    collection.scope === "task_scoped" &&
    collection.taskIds.length === 1 &&
    collection.name === deliveryPrefix + taskId &&
    !collection.externalSource
  )
    return taskId;
}

export function authorizedDeliveryTitles(cards: WorkbenchCard[]) {
  const titles = new Map<string, string | undefined>();
  for (const card of cards) {
    if (!card.taskId || card.source === "followup") continue;
    titles.set(card.taskId, card.summaryOnly || titles.has(card.taskId) ? undefined : card.title);
  }
  return titles;
}
