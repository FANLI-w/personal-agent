export type DependencyNode = {
  id: string;
  title: string;
  dependencies: string[];
  needsClaim?: boolean;
};

/** Plans are model output: invalid references/cycles must not crash rendering. */
export function dependencyLayers(items: DependencyNode[]): {
  layers: DependencyNode[][];
  error?: string;
} {
  const nodes = new Map(items.map((item) => [item.id, item]));
  if (nodes.size !== items.length)
    return { layers: [], error: "任务步骤编号重复，请在对话中调整方案。" };
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const item of items) {
    const deps = [...new Set(item.dependencies)];
    if (deps.some((id) => !nodes.has(id)))
      return { layers: [], error: "方案引用了不存在的前置步骤，请在对话中调整。" };
    incoming.set(item.id, deps.length);
    for (const id of deps) {
      const next = outgoing.get(id) ?? [];
      next.push(item.id);
      outgoing.set(id, next);
    }
  }
  let ready = items.filter((item) => incoming.get(item.id) === 0);
  const layers: DependencyNode[][] = [];
  let visited = 0;
  while (ready.length) {
    layers.push(ready);
    visited += ready.length;
    const next: DependencyNode[] = [];
    for (const item of ready) {
      for (const id of outgoing.get(item.id) ?? []) {
        const count = incoming.get(id)! - 1;
        incoming.set(id, count);
        if (count === 0) next.push(nodes.get(id)!);
      }
    }
    ready = next;
  }
  if (visited !== items.length)
    return { layers: [], error: "方案存在循环依赖，请在对话中调整先后顺序。" };
  return { layers };
}
