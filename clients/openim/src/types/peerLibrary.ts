import type { PeerFile, PeerRequest } from "@research-agent-platform/contracts";

export type PeerScope = { memberId: string; labId: string };
export type PeerFolder = { configured: boolean; label: string; automatic: boolean };
export type PeerReceived = {
  id: string;
  requestId: string;
  name: string;
  size: number;
  sha256: string;
  receivedAt: string;
  providerName: string;
};
export type PeerLibraryBridge = {
  folder(scope: PeerScope): Promise<PeerFolder>;
  configure(scope: PeerScope, automatic: boolean): Promise<PeerFolder | null>;
  revoke(scope: PeerScope): Promise<void>;
  search(
    scope: PeerScope,
    request: PeerRequest,
  ): Promise<{ files: PeerFile[]; truncated: boolean } | null>;
  read(scope: PeerScope, requestId: string, fileId: string): Promise<Uint8Array>;
  save(
    scope: PeerScope,
    request: PeerRequest,
    file: PeerFile,
    bytes: Uint8Array,
  ): Promise<PeerReceived>;
  received(scope: PeerScope): Promise<PeerReceived[]>;
  open(scope: PeerScope, id: string): Promise<void>;
};
