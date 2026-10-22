import type { DatabaseSync } from 'node:sqlite'
import type { Actor } from './auth.js'

export const teamLabId=(actor:Pick<Actor,'labId'|'teamLabId'>)=>actor.teamLabId??actor.labId
export function hasLabMembership(db:DatabaseSync,memberId:string,labId:string){
 return !!db.prepare(`SELECT 1 FROM members m JOIN auth_accounts a ON a.member_id=m.id AND a.disabled=0 WHERE m.id=? AND
 (EXISTS(SELECT 1 FROM effective_lab_memberships g WHERE g.member_id=m.id AND g.lab_id=?) OR EXISTS(SELECT 1 FROM personal_spaces p WHERE p.owner_id=m.id AND p.lab_id=?))`).get(memberId,labId,labId)
}
export function selectedLab(db:DatabaseSync,memberId:string,home:string){
 const selected=db.prepare('SELECT lab_id FROM member_lab_contexts WHERE member_id=?').get(memberId)
 return selected&&hasLabMembership(db,memberId,String(selected.lab_id))?String(selected.lab_id):home
}
// Both requester and material owner must still be members. A departed owner
// cannot leave their private connection readable through an old sharing grant.
export const sharedCollectionAccess=`EXISTS(SELECT 1 FROM research_collection_labs share
 JOIN effective_lab_memberships viewer ON viewer.lab_id=share.lab_id AND viewer.member_id=?
 JOIN effective_lab_memberships owner ON owner.lab_id=share.lab_id AND owner.member_id=c.owner_id
 JOIN auth_accounts owner_account ON owner_account.member_id=c.owner_id AND owner_account.disabled=0
 WHERE share.collection_id=c.id)`
