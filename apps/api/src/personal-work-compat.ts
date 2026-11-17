const personalTaskRoutes = new Set(["personalWorkTask", "createPersonalWorkTask", "activatePersonalWorkTask", "decidePersonalWorkTask", "invitePersonalWorkContact", "runPersonalWorkTask", "submitPersonalWorkResult", "reviewPersonalWorkResult", "cancelPersonalWorkTask"]);
/** Project only known DTOs after current authorization, including idempotent replays. */
export function personalWorkProjection(name: string, value: unknown, modern: boolean): unknown {
  if (modern || (name !== "workbench" && !personalTaskRoutes.has(name))) return value;
  const result = value as { data: any };
  const legacy = (task: any) => {
    const { fileDeliverySupported: _supported, ...rest } = task;
    if (rest.result) {
      const { sources: _sources, reviewComment: _comment, changesRequested: _changesRequested, ...result } = rest.result;
      rest.result = result;
    }
    return rest;
  };
  return { ...result, data: name === "workbench" ? result.data.map(legacy) : legacy(result.data) };
}
