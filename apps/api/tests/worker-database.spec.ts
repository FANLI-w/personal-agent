import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { transaction } from '../src/database.js'
import { isDatabaseBusy, waitForWorkerDatabase, workerStep } from '../src/worker-database.js'

describe('worker database contention', () => {
  it('waits for another connection without blocking timers, duplicates or partial writes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rap-worker-lock-'))
    const db = new DatabaseSync(join(dir, 'db')), other = new DatabaseSync(join(dir, 'db'))
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1; CREATE TABLE receipts(id TEXT PRIMARY KEY)')
      other.exec('BEGIN IMMEDIATE')
      timer = setTimeout(() => other.exec('ROLLBACK'), 150)
      let writes = 0
      await waitForWorkerDatabase(() => transaction(db, () => { writes++; db.prepare('INSERT INTO receipts VALUES (?)').run('one') }))
      expect(writes).toBe(1)
      expect(db.prepare('SELECT count(*) n FROM receipts').get()?.n).toBe(1)
    } finally { clearTimeout(timer); other.close(); db.close(); rmSync(dir, { recursive: true, force: true }) }
  })
  it('bounds retries and never masks unrelated failures or retries a model operation', async () => {
    const busy = Object.assign(new Error('private SQL'), { code: 'ERR_SQLITE_ERROR', errcode: 5 })
    await expect(waitForWorkerDatabase(() => { throw busy }, 0)).rejects.toBe(busy)
    for (const error of [new Error('database is locked'), Object.assign(new Error('constraint'), { code: 'ERR_SQLITE_ERROR', errcode: 19 })]) {
      expect(isDatabaseBusy(error)).toBe(false)
      const operation = vi.fn(() => { throw error })
      await expect(waitForWorkerDatabase(operation)).rejects.toBe(error)
      expect(operation).toHaveBeenCalledTimes(1)
    }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await workerStep('IM', async () => { throw busy })).toBe(false)
      expect(log).toHaveBeenCalledWith('WORKER_DATABASE_BUSY_IM')
      await expect(workerStep('CHAT', async () => { throw new TypeError('private data') })).rejects.toMatchObject({ message: 'WORKER_STAGE_CHAT' })
    } finally { log.mockRestore() }
  })
})
