import { legacyChatMessage, type ChatService, type TurnInput } from './chat.js'
import { ApiError } from './errors.js'
import { personalModelRuntime } from './personal-models.js'
import { assistantProjectSystem } from './personal-assistant.js'
import { researchConversationPolicy } from './conversation-policy.js'

export const intakeRecoverySystem=assistantProjectSystem+'\nFor ordinary chat, a casual question or a one-off discussion, return {kind:"reply",answer:string,recordWork:false} with a natural useful answer. A failed call never authorizes creating a project. Only the current owner instruction can do so. '+researchConversationPolicy

/** Called only while committing a newly returned, known-empty failed call.
 * There is deliberately no historical-failure scan or new budget allocation. */
export function queueIntakeOutputRecovery(s:ChatService,id:string){
 try{
  const {row,turn,input,group}=s.checkTurnInput(id),diagnostic=input.modelOutputDiagnostic
  if(!input.assistantProjectEntry||input.intakeOutputLimitRecovery||input.projectExecution||input.skill||input.purpose||input.externalAgent||input.fileSource||input.scheduledFollowupId||input.continuous?.text.trim()||turn.status!=='failed'||turn.failure!=='BUDGET_EXCEEDED'||turn.outputMessageId||turn.assistantReceipt||turn.createdAgent||diagnostic?.stage!=='output_limit'||diagnostic.failure!=='OUTPUT_LIMIT'||diagnostic.finishReason!=='max-tokens'||diagnostic.returnedTextLength!==0||diagnostic.reasoningEffort!=='default'||personalModelRuntime(s.db,s.c.actor,s.config).provider!=='deepseek')return false
  if(s.db.prepare("SELECT 1 FROM assistant_projects WHERE source_turn_id=? UNION ALL SELECT 1 FROM chat_actions WHERE turn_id=?").get(id,id)||s.db.prepare("SELECT 1 FROM chat_turns WHERE json_extract(request_json,'$.intakeOutputLimitRecovery.previousTurnId')=?").get(id))return false
  const attempts=s.db.prepare('SELECT usage_json FROM chat_attempts WHERE root_id=?').all(row.root_id!)
  if(attempts.length!==1||!attempts[0]!.usage_json)return false
  const usage=JSON.parse(String(attempts[0]!.usage_json)) as {inputTokens:number|null;outputTokens:number|null;elapsedMs:number}
  if(usage.inputTokens===null||usage.outputTokens===null)return false
  const root=JSON.parse(String(s.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(row.root_id!)!.request_json)) as TurnInput
  const budget={maxTokens:root.budget.maxTokens-usage.inputTokens-usage.outputTokens,maxSeconds:Math.floor(root.budget.maxSeconds-usage.elapsedMs/1000)}
  if(budget.maxTokens<2048||budget.maxSeconds<5||s.joinedAgent(group,turn.agentContactId).availability.status!=='available')return false
  const next:TurnInput={...input,budget,intakeOutputLimitRecovery:{previousTurnId:id},conversationVersion:group.version}
  delete next.modelInputDiagnostic;delete next.modelOutputDiagnostic;delete next.librarySnapshot;delete next.libraryRead
  if(next.continuous)next.continuous={...next.continuous,text:''}
  const message=s.projectedMessage(turn.inputMessageId),retry=s.newTurn(group,message,turn.agentContactId,next,String(row.root_id))
  // The compact retry does not claim to have reread implicit library passages.
  const saved=JSON.parse(String(s.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(retry.id)!.request_json)) as TurnInput
  delete saved.librarySnapshot;delete saved.libraryRead
  s.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=?').run(JSON.stringify(saved),retry.id)
  message.turnId=retry.id;s.db.prepare('UPDATE chat_messages SET document=? WHERE id=?').run(JSON.stringify(legacyChatMessage(message)),message.id)
  return true
 }catch(error){if(error instanceof ApiError)return false;throw error}
}

export function checkIntakeOutputRecovery(s:ChatService,turnId:string,input:TurnInput){
 const recovery=input.intakeOutputLimitRecovery;if(!recovery)return
 const parent=s.db.prepare('SELECT * FROM chat_turns WHERE id=? AND owner_id=?').get(recovery.previousTurnId,s.c.actor.id),child=s.db.prepare('SELECT * FROM chat_turns WHERE id=? AND owner_id=?').get(turnId,s.c.actor.id)
 if(!parent||!child||parent.root_id!==child.root_id||parent.conversation_id!==child.conversation_id)throw new ApiError('FORBIDDEN')
 const prior=JSON.parse(String(parent.request_json)) as TurnInput,old=s.materializedTurn(parent),next=s.materializedTurn(child)
 if(!input.assistantProjectEntry||prior.intakeOutputLimitRecovery||!prior.assistantProjectEntry||old.status!=='failed'||old.failure!=='BUDGET_EXCEEDED'||old.outputMessageId||old.inputMessageId!==next.inputMessageId||old.agentContactId!==next.agentContactId||prior.modelOutputDiagnostic?.stage!=='output_limit'||prior.modelOutputDiagnostic.returnedTextLength!==0)throw new ApiError('FORBIDDEN')
}
