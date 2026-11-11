// Public compatibility metadata only. The configured desktop service is bound
// to this renderer origin; changing it reloads the document and this module.
// Never persist account data or use a version as an authorization decision.
let version: string | undefined;
const listeners = new Set<() => void>();
export function validServiceVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 40 &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  );
}
export function observeServiceVersion(value: unknown) {
  if (!validServiceVersion(value) || value === version) return;
  version = value;
  for (const listener of listeners) listener();
}
export const getServiceVersion = () => version;
export function subscribeServiceVersion(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
