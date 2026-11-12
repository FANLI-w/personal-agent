import { withRequestDeadline } from "./request-deadline";
import { observeServiceVersion, validServiceVersion } from "./service-version";

export function workspaceAvailability(value: unknown, minimumMinor = 21) {
  const data = (value as { data?: { status?: unknown; contractVersion?: unknown } })
    ?.data;
  const version = data?.contractVersion;
  if (data?.status !== "ok" || typeof version !== "string" || version.length > 40)
    throw new Error("无法确认服务状态，请检查连接后重试。");
  if (!validServiceVersion(version))
    throw new Error("无法确认服务版本，请联系管理员核对。");
  const [major, minor] = version.split(".").map(Number);
  return { available: major === 0 && minor >= minimumMinor, version };
}

// This detects compatibility, not DB/storage readiness. Actual task/material
// reads report their own failures; do not continuously run expensive ready checks.
function readAvailability(minimumMinor: number, callerSignal?: AbortSignal) {
  return withRequestDeadline(
    async (signal) => {
      const response = await fetch("/api/v1/health/live", {
        credentials: "omit",
        signal,
      });
      if (!response.ok) throw new Error("暂时无法连接服务，请稍后重新检查。");
      let value: unknown;
      try {
        value = await response.json();
      } catch {
        throw new Error("服务返回的状态无法确认，请稍后重新检查。");
      }
      const result = workspaceAvailability(value, minimumMinor);
      observeServiceVersion(result.version);
      return result;
    },
    10000,
    callerSignal,
  );
}
export function readWorkspaceAvailability(signal?: AbortSignal) {
  return readAvailability(21, signal);
}
export function readResearchTeamAvailability(signal?: AbortSignal) {
  return readAvailability(23, signal);
}
export function readFeishuLibrarySharingAvailability(signal?: AbortSignal) {
  return readAvailability(28, signal);
}
export function readLargeOriginalAvailability(signal?: AbortSignal) {
  return readAvailability(38, signal);
}
