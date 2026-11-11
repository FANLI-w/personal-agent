import { RequestTimeoutError } from "./request-deadline";

// A stale display is only allowed for transport/5xx failures. An authorization,
// validation or malformed-response failure must remove previous business facts.
export function transientReadFailure(failure: unknown) {
  if (failure instanceof RequestTimeoutError) return true;
  if (!failure || typeof failure !== "object") return false;
  const { status, code } = failure as { status?: number; code?: string };
  return (
    typeof status === "number" &&
    ((status >= 500 && status <= 599) ||
      (status === 0 && ["NETWORK_ERROR", "REQUEST_TIMEOUT"].includes(code || "")))
  );
}
