import { existsSync } from "node:fs";
import path from "node:path";

// The NSIS identity stays the same across display-name changes. Recognize all
// shipped names so existing installations keep their update entry.
export function isInstalledWindowsApp(
  platform: string,
  packaged: boolean,
  executable: string,
): boolean {
  return (
    platform === "win32" &&
    packaged &&
    ["Uninstall DeepChat.exe", "Uninstall AcceptCat.exe", "Uninstall ResearchWeChat.exe"].some((name) =>
      existsSync(path.join(path.dirname(executable), name)),
    )
  );
}
