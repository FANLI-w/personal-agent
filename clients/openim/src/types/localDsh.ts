export type LocalDshSnapshot = {
  phase: "stopped" | "starting" | "running" | "stopping" | "error";
  directory: string;
  home: string;
  version?: string;
  error?: string;
  pageReady: boolean;
};
export type DshBounds = { x: number; y: number; width: number; height: number };
export type LocalDshBridge = {
  status: () => Promise<LocalDshSnapshot>;
  choose: () => Promise<LocalDshSnapshot>;
  start: () => Promise<LocalDshSnapshot>;
  stop: () => Promise<LocalDshSnapshot>;
  show: (bounds: DshBounds | null) => Promise<void>;
};
