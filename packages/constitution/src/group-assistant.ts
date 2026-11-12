import type {Grant} from './policy.js'
import {can} from './policy.js'
import type {Asset} from './asset.js'
import type {Action} from './axis.js'

/** An assistant in a shared group never inherits a personal assistant's grants.
 * Record ACLs still restrict every lookup to this group and its selected lab.
 * Conversation service receipts are not shared business assets.
 */
export const groupAssistantGrants:readonly Grant[]=[
  {layer:'system',kind:'rule',read:['assistant'],write:[],request:[],approve:[]},
  ...(['rule','link','skill','memory','object','source'] as const).map(kind=>({
    layer:'lab' as const,kind,read:['assistant'] as const,write:[],
    request:kind==='rule'||kind==='skill'?[]:['assistant'] as const,approve:[],
  })),
]
export function canGroupAssistant(asset:Asset,action:Action){return can(asset,'assistant',action,groupAssistantGrants)}
