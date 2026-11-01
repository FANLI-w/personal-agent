import { useEffect, useState } from "react";

import type { LocalLibraryManifest, LocalLibraryStatus } from "@/types/localLibrary";

/**
 * The registered local folder, as this machine sees it. Nothing here is
 * uploaded; the index only needs to know which files exist right now.
 */
export function useLocalLibrary() {
  const bridge = window.electronAPI?.localLibrary;
  const [status, setStatus] = useState<LocalLibraryStatus>();
  const [manifest, setManifest] = useState<LocalLibraryManifest>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const refresh = async () => {
    if (!bridge) {
      setStatus({ registered: false });
      return;
    }
    try {
      const next = await bridge.status();
      setStatus(next);
      // Entering the page always rescans, so a moved file shows up as missing.
      if (next.registered && next.available) setManifest(await bridge.scan());
      else setManifest(undefined);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "无法读取本地资料文件夹。");
    }
  };
  useEffect(() => {
    void refresh();
    // The bridge is a stable preload object; scanning again on mount is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pick = async () => {
    if (!bridge) return;
    setBusy(true);
    setFailure("");
    try {
      const picked = await bridge.pick();
      if (picked) setManifest(picked);
      await refresh();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "无法读取这个文件夹。");
    } finally {
      setBusy(false);
    }
  };
  const present = new Set((manifest?.files || []).map((file) => file.rel));
  return { status, manifest, busy, failure, pick, refresh, present };
}
