/** Keep older strict desktop readers usable while advertising handoff actions
 * only to clients that understand them. Business authorization is unchanged. */
export function taskWorkflowProjection(name: string, value: unknown, modern: boolean): unknown {
  if (modern) return value;
  const result = JSON.parse(JSON.stringify(value));
  const visit = (item: any) => {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item.allowedActions)) item.allowedActions = item.allowedActions.filter((action: string) => action !== 'cancel_invitation');
    // Older event readers use a closed enum. Keep the precise summary while
    // presenting the cancellation as a withdrawal of the invitation.
    if (item.kind === 'invitation_cancelled' && typeof item.taskId === 'string' && typeof item.resourceVersion === 'number') item.kind = 'withdrawn';
    for (const child of Object.values(item)) if (child && typeof child === 'object') visit(child);
  };
  visit(result);
  if (name === 'overview') Object.assign(result.data, { blockedTaskIds: [], blockedTaskIdsTruncated: false });
  if (name === 'researchWorkspace') result.summary.blocked = 0;
  return result;
}
