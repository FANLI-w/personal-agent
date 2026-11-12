import { useEffect, useRef, useSyncExternalStore } from "react";
import { useResearchRead } from "./useResearchRead";
import {
  readWorkspaceAvailability,
  workspaceAvailability,
} from "./workspace-availability";
import { getServiceVersion, subscribeServiceVersion } from "./service-version";

// Remember only the public contract version, never task data or authorization.
// A failed health recheck or actor refresh must not unmount editors. Changing
// the configured service loads a new renderer origin, which resets this ref;
// account/lab data and authorization are still fenced by useResearchRead.
export function useWorkspaceAvailability(enabled: boolean) {
  const observed = useSyncExternalStore(
    subscribeServiceVersion,
    getServiceVersion,
    getServiceVersion,
  );
  const read = useResearchRead(
    readWorkspaceAvailability,
    "workspace-availability",
    enabled,
    { poll: false },
  );
  const confirmed = useRef<string>();
  if (!enabled) confirmed.current = undefined;
  if (enabled) confirmed.current = observed ?? read.data?.version ?? confirmed.current;
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
      if (!confirmed.current && document.visibilityState === "visible")
        void read.refresh();
    };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [enabled, read.refresh]);
  return {
    ...read,
    // Version probes cannot stand in for the current task connection status.
    // Once compatibility is known, a failed probe does not block real reads.
    data: enabled && version ? { available: supports(21), version } : read.data,
    error: version ? "" : read.error,
    loading: !version && read.loading,
    version,
    supports,
  };
}
