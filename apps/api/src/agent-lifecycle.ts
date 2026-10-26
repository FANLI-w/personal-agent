import type { DatabaseSync } from 'node:sqlite'
import { fail } from './errors.js'

export function agentDeleted(db: DatabaseSync, id: string) {
  return !!db.prepare('SELECT 1 FROM deleted_personal_agents WHERE contact_id=?').get(id)
}
export function requireActiveAgent(db: DatabaseSync, id: string) {
  if (agentDeleted(db, id)) fail('INVALID_STATE')
}
