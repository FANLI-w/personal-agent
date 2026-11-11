import { useEffect, useRef } from "react";
import { useResearchRead } from "./useResearchRead";
import {
  readWorkspaceAvailability,
  workspaceAvailability,
} from "./workspace-availability";

// Remember only the public contract version, never task data or authorization.
// A failed health recheck or actor refresh must not unmount editors. Changing
// the configured service loads a new renderer origin, which resets this ref;
// account/lab data and authorization are still fenced by useResearchRead.
export function useWorkspaceAvailability(enabled: boolean) {
  const read = useResearchRead(
    readWorkspaceAvailability,
    "workspace-availability",
    enabled,
  );
  const confirmed = useRef<string>();
  if (!enabled) confirmed.current = undefined;
  if (enabled && read.data) confirmed.current = read.data.version;
  const version = confirmed.current;
  const supports = (minimumMinor: number) =>
    !!version &&
    workspaceAvailability(
      { data: { status: "ok", contractVersion: version } },
      minimumMinor,
    ).available;
  useEffect(() => {
    if (!enabled) return;
    const resume = () => {
      if (document.visibilityState === "visible") void read.refresh();
    };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [enabled, read.refresh]);
  return { ...read, version, supports };
}
