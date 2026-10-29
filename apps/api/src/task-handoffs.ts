import type { DatabaseSync } from 'node:sqlite'
export function pendingHandoff(db:DatabaseSync,taskId:string) {
  return db.prepare("SELECT h.* FROM task_handoffs h JOIN assignments a ON a.id=h.offer_id WHERE h.task_id=? AND h.status='pending' AND a.status='pending'").get(taskId)
}
