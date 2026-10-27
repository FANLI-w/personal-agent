import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'

// node:sqlite reports BUSY through ERR_SQLITE_ERROR plus the SQLite result code.
// Do not treat arbitrary errors (or LOCKED/schema/corruption errors) as retryable.
export function isDatabaseBusy(error: unknown): boolean {
  const value = error as { code?: unknown; errcode?: unknown } | null
  return value?.code === 'ERR_SQLITE_ERROR' && typeof value.errcode === 'number' &&
    (value.errcode & 0xff) === 5
}

// The caller must supply a transaction or a read, never a model/network call.
// Each failed transaction has rolled back before this yields to lease timers.
export async function waitForWorkerDatabase<T>(operation: () => T, maxWaitMs = 10000): Promise<T> {
  const deadline = performance.now() + maxWaitMs
  for (;;) {
    try { return operation() } catch (error) {
      if (!isDatabaseBusy(error) || performance.now() >= deadline) throw error
      await delay(50)
    }
  }
}

export async function workerStep(stage: string, operation: () => Promise<boolean>): Promise<boolean> {
  try { return await operation() } catch (cause) {
    if (isDatabaseBusy(cause)) {
      console.error(`WORKER_DATABASE_BUSY_${stage}`)
      return false
    }
    throw new Error(`WORKER_STAGE_${stage}`, { cause })
  }
}
