import { useEffect } from "react";
import { useResearchStore } from "./store";
import { PeerLibraryRuntime } from "./peer-library-runtime";

export function PeerLibraryBridge() {
  const member = useResearchStore((s) => s.actor?.member.id),
    lab = useResearchStore((s) => s.actor?.member.labId),
    kind = useResearchStore((s) => s.actor?.spaceKind),
    generation = useResearchStore((s) => s.generation),
    sessionActor = useResearchStore((s) => s.sessionActorId);
  useEffect(() => {
    if (
      !window.electronAPI?.peerLibrary ||
      !member ||
      !lab ||
      kind !== "laboratory" ||
      sessionActor !== member
    )
      return;
    const runtime = new PeerLibraryRuntime({ memberId: member, labId: lab });
    void runtime.start();
    return () => runtime.stop();
  }, [member, lab, kind, generation, sessionActor]);
  return null;
}
