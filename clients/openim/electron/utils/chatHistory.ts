import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { MessageItem } from "@openim/wasm-client-sdk";
import type { ChatHistoryPage } from "../../src/types/chatHistory";

type Statement = {
  run(...values: unknown[]): unknown;
  get(...values: unknown[]): any;
  all(...values: unknown[]): any[];
};
type Database = {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
};
type Sqlite = { DatabaseSync: new (file: string) => Database };

/**
 * Electron 43 ships Node 24, so SQLite is a built-in and no second native
 * addon has to follow the ABI. The bundled @types/node predates `node:sqlite`,
 * so the module is reached through a narrow local shape instead of a typed
 * import; a runtime without it fails loudly rather than silently degrading.
 */
function loadSqlite(): Sqlite {
  const load = (
    process as unknown as { getBuiltinModule?: (id: string) => unknown }
  ).getBuiltinModule;
  const sqlite = load?.("node:sqlite") as Sqlite | undefined;
  if (!sqlite?.DatabaseSync) throw new Error("本机消息索引不可用。");
  return sqlite;
}

const MAX_RECORD = 4 * 1024 * 1024;

function key(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 1024 ||
    value.includes("\0")
  )
    throw new Error(`无效的${label}。`);
  return value;
}

function encode(value: unknown) {
  const text = JSON.stringify(value);
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_RECORD)
    throw new Error("消息记录无法保存。");
  return text;
}

/** Oldest first, and stable for messages that share a timestamp. */
const order = (a: MessageItem, b: MessageItem) =>
  a.sendTime - b.sendTime ||
  (a.seq || 0) - (b.seq || 0) ||
  (a.clientMsgID < b.clientMsgID ? -1 : a.clientMsgID === b.clientMsgID ? 0 : 1);

type Row = { id: string; payload: string };
type Fact = { kind: "revoked" | "deleted"; payload: string };

/**
 * A downloaded transcript, never the authority. Business permissions, task
 * state and "can I still read this" stay on the server.
 *
 * Three invariants are what make the cache safe; each one is a bug the previous
 * attempt shipped:
 *
 * 1. `messages.payload` is only ever the SDK's copy of a message. Facts this
 *    machine learned on its own never live there.
 * 2. `overlay` holds exactly those local facts (a withdrawal it observed, a
 *    message it removed). It is written only by local events and is never
 *    touched by a page save, so a history page that started before the event
 *    and lands after it cannot undo it.
 * 3. `edges` and `meta` (continuity, and "we reached the real beginning") are
 *    written only from a verified SDK history page. A live push never
 *    fabricates an edge, so a gap is reported instead of papered over.
 */
export class ChatHistoryDatabase {
  private db: Database;

  constructor(root: string, service: string, memberId: string) {
    // One file per service+account, so switching accounts can never read or
    // overwrite someone else's transcript.
    const account = createHash("sha256")
      .update(
        JSON.stringify([new URL(service).origin, key(memberId, "账号")]),
      )
      .digest("hex")
      .slice(0, 32);
    mkdirSync(root, { recursive: true });
    const { DatabaseSync } = loadSqlite();
    this.db = new DatabaseSync(path.join(root, `${account}.sqlite`));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS messages(conversation TEXT NOT NULL,id TEXT NOT NULL,time REAL NOT NULL,seq INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(conversation,id));
      CREATE INDEX IF NOT EXISTS messages_order ON messages(conversation,time,seq,id);
      CREATE TABLE IF NOT EXISTS edges(conversation TEXT NOT NULL,newer TEXT NOT NULL,older TEXT NOT NULL,PRIMARY KEY(conversation,newer));
      CREATE TABLE IF NOT EXISTS meta(conversation TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(conversation,key));
      CREATE TABLE IF NOT EXISTS overlay(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,checked INTEGER NOT NULL);`);
  }

  close() {
    this.db.close();
  }

  /**
   * Called only with a page the SDK history API returned. `before` is the
   * exclusive anchor the page was requested with; `reachedStart` is the SDK's
   * own "no older messages exist".
   */
  savePage(
    conversation: string,
    messages: MessageItem[],
    options: { before?: string; reachedStart?: boolean } = {},
  ) {
    key(conversation, "会话");
    if (!Array.isArray(messages) || messages.length > 2000)
      throw new Error("无效的本机消息批次。");
    const before = options.before ? key(options.before, "消息") : undefined;
    const rows = messages.map((message) => {
      key(message.clientMsgID, "消息");
      if (!Number.isFinite(message.sendTime) || !Number.isFinite(message.seq || 0))
        throw new Error("消息时间无效。");
      return {
        id: message.clientMsgID,
        time: message.sendTime,
        seq: message.seq || 0,
        text: encode(message),
      };
    });
    this.db.exec("BEGIN");
    try {
      const upsert = this.db.prepare(
        "INSERT INTO messages VALUES(?,?,?,?,?) ON CONFLICT(conversation,id) DO UPDATE SET time=excluded.time,seq=excluded.seq,payload=excluded.payload",
      );
      for (const row of rows)
        upsert.run(conversation, row.id, row.time, row.seq, row.text);
      // Continuity comes from the page's own order plus the anchor it was read
      // from. Nothing else is allowed to claim two messages are neighbours.
      const ordered = [...messages].sort(order);
      const edge = this.db.prepare(
        "INSERT INTO edges VALUES(?,?,?) ON CONFLICT(conversation,newer) DO UPDATE SET older=excluded.older",
      );
      for (let index = 1; index < ordered.length; index++)
        edge.run(
          conversation,
          ordered[index]!.clientMsgID,
          ordered[index - 1]!.clientMsgID,
        );
      // The message adjacent to the anchor is the newest one in this page, so
      // the page hangs off `before` from its top end.
      if (before && ordered.length)
        edge.run(conversation, before, ordered.at(-1)!.clientMsgID);
      if (ordered.length) {
        if (!before)
          this.setMeta(conversation, "newest", ordered.at(-1)!.clientMsgID);
        if (options.reachedStart)
          this.setMeta(conversation, "oldest", ordered[0]!.clientMsgID);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * Newest-first walk back along verified edges. `incomplete` is the honest
   * answer when the chain stops before a known beginning: the caller must
   * verify against the server instead of presenting the cache as complete.
   */
  page(conversation: string, before?: string, count = 20): ChatHistoryPage {
    key(conversation, "会话");
    if (!Number.isInteger(count) || count < 1 || count > 200)
      throw new Error("无效的消息分页。");
    const anchor = before ? key(before, "消息") : this.getMeta(conversation, "newest");
    if (!anchor)
      return { messages: [], hasMore: false, reachedStart: false, incomplete: false };
    const rows: Row[] = [];
    const visited = new Set<string>();
    let row = before
      ? this.olderThan(conversation, anchor)
      : this.message(conversation, anchor);
    while (row && rows.length < count && !visited.has(row.id)) {
      visited.add(row.id);
      rows.push(row);
      row = this.olderThan(conversation, row.id);
    }
    const facts = this.facts(rows.map((item) => item.id));
    const tail = rows.at(-1)?.id;
    const oldest = this.getMeta(conversation, "oldest");
    const reachedStart = Boolean(oldest && tail === oldest);
    const chained = Boolean(row);
    const messages = rows
      .reverse()
      .map((item) => {
        const fact = facts.get(item.id);
        if (fact?.kind === "deleted") return undefined;
        const message = JSON.parse(item.payload) as MessageItem;
        // The local fact wins over whatever the stored payload says.
        return fact?.kind === "revoked"
          ? ({ ...message, ...JSON.parse(fact.payload) } as MessageItem)
          : message;
      })
      .filter((message): message is MessageItem => Boolean(message));
    return {
      messages,
      hasMore: chained || (Boolean(tail) && !reachedStart),
      reachedStart,
      incomplete: Boolean(tail) && !chained && !reachedStart,
    };
  }

  /** A withdrawal this machine saw. Survives any later history page. */
  revoke(messageId: string, patch: Record<string, unknown>) {
    key(messageId, "消息");
    if (!patch || typeof patch !== "object" || Array.isArray(patch))
      throw new Error("无效的撤回记录。");
    this.writeFact(messageId, "revoked", patch);
  }

  /** Removes the message from this machine only; the server copy is untouched. */
  remove(messageIds: string[]) {
    if (!Array.isArray(messageIds) || !messageIds.length || messageIds.length > 500)
      throw new Error("无效的消息选择。");
    const ids = messageIds.map((id) => key(id, "消息"));
    this.db.exec("BEGIN");
    try {
      for (const id of ids) this.writeFact(id, "deleted", {});
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  forget(conversation: string) {
    key(conversation, "会话");
    // Local facts for this conversation's messages go too; they are only
    // meaningful next to the rows they describe.
    this.db
      .prepare("DELETE FROM overlay WHERE id IN (SELECT id FROM messages WHERE conversation=?)")
      .run(conversation);
    for (const table of ["messages", "edges", "meta"])
      this.db.prepare(`DELETE FROM ${table} WHERE conversation=?`).run(conversation);
  }

  private writeFact(id: string, kind: Fact["kind"], patch: unknown) {
    this.db
      .prepare(
        "INSERT INTO overlay VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,payload=excluded.payload,checked=excluded.checked",
      )
      .run(id, kind, encode(patch), Date.now());
  }

  private facts(ids: string[]) {
    const facts = new Map<string, Fact>();
    if (!ids.length) return facts;
    const rows = this.db
      .prepare(
        `SELECT id,kind,payload FROM overlay WHERE id IN (${ids.map(() => "?").join(",")})`,
      )
      .all(...ids);
    for (const row of rows)
      facts.set(String(row.id), { kind: row.kind, payload: String(row.payload) });
    return facts;
  }

  private message(conversation: string, id: string) {
    return this.db
      .prepare("SELECT id,payload FROM messages WHERE conversation=? AND id=?")
      .get(conversation, id) as Row | undefined;
  }

  private olderThan(conversation: string, id: string) {
    return this.db
      .prepare(
        "SELECT m.id,m.payload FROM messages m JOIN edges e ON m.conversation=e.conversation AND m.id=e.older WHERE e.conversation=? AND e.newer=?",
      )
      .get(conversation, id) as Row | undefined;
  }

  private getMeta(conversation: string, name: string) {
    return this.db
      .prepare("SELECT value FROM meta WHERE conversation=? AND key=?")
      .get(conversation, name)?.value as string | undefined;
  }

  private setMeta(conversation: string, name: string, value: string) {
    this.db
      .prepare(
        "INSERT INTO meta VALUES(?,?,?) ON CONFLICT(conversation,key) DO UPDATE SET value=excluded.value",
      )
      .run(conversation, name, value);
  }
}
