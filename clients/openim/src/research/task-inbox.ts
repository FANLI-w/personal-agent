import type { ResponseFor } from "@research-agent-platform/contracts";

type Cards = ResponseFor<"workbench">;
type Mine = Pick<ResponseFor<"researchWorkspace">, "data"> & { truncated: boolean };

/** Identity comes from scope=mine, never a name, title, inferred contact ID or claim permission. */
export async function collectTaskInbox(
  readCards: (cursor: string | undefined, signal: AbortSignal) => Promise<Cards>,
  readMine: ((signal: AbortSignal) => Promise<Mine>) | undefined,
  signal: AbortSignal,
) {
  const cards = async () => {
    const data: Cards["data"] = [],
      ids = new Set<string>(),
      cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      signal.throwIfAborted();
      const next = await readCards(cursor, signal);
      signal.throwIfAborted();
      for (const card of next.data) {
        if (ids.has(card.id)) throw new Error("任务在读取期间发生变化，请重新读取。");
        ids.add(card.id);
        data.push(card);
      }
      if (!next.nextCursor) return { data, truncated: false };
      if (cursors.has(next.nextCursor)) throw new Error("任务分页重复，请重新读取。");
      cursors.add(next.nextCursor);
      cursor = next.nextCursor;
    }
    return { data, truncated: true };
  };
  const [all, mine] = await Promise.all([cards(), readMine?.(signal)]);
  signal.throwIfAborted();
  const own = new Set(mine?.data.map((row) => row.task.id));
  return {
    data: all.data.filter(
      (card) =>
        card.source !== "research_task" ||
        !readMine ||
        (!!card.taskId && own.has(card.taskId)),
    ),
    truncated: all.truncated || !!mine?.truncated,
  };
}
