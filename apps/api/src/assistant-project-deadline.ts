import { parts, reminderRequest } from './personal-time.js'

type Deadline={dueAt:string|null;dueDate:string|null}
const weekdayPattern=/(下下|下|本|这)(?:周|星期|礼拜)([一二三四五六日天1-7])/g
const dateText=(at:number,timeZone:string)=>{const p=parts(at,timeZone);return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`}

/** Only one direct relative weekday is normalized. Other date language stays
 * with the existing model interpretation, including clear multi-date plans. */
export function relativeProjectDeadline(text:string,timeZone:string,createdAt:string):Deadline|null{
 const matches=[...text.matchAll(weekdayPattern)]
 if(matches.length!==1)return null
 const match=matches[0]!,index=match.index!
 const direct=text.replace(/```[\s\S]*?```|<([\p{L}\p{N}_:-]+)[^>]*>[\s\S]*?<\/\1\s*>|“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"|'[^'\n]*'|‘[^’]*’|^\s*>[^\n]*|(?:^|\n)(?:【[^】]*(?:材料|记录|原稿|引用|证据)[^】]*】|(?:实验记录|旧稿|原文|引用|资料|证据)[：:])[\s\S]*/gmu,value=>' '.repeat(value.length))
 if(direct.slice(index,index+match[0].length)!==match[0]||/(?:假设|假如|如果|例如|比如|引用|转述|原文|语法|怎么理解|什么意思)/.test(direct.slice(0,index)))return null
 if(/(?:没有|无|不设|不定|不需要|不用|暂不设|暂不定).{0,3}(?:截止|期限|日期|时间)|(?:日期|时间|截止).{0,4}(?:未定|待定|取消)/.test(direct)||/(?:不是|不在|不要|取消|不用|别定在|不再).{0,4}$/.test(direct.slice(0,index)))return null
 const rest=direct.slice(0,index)+direct.slice(index+match[0].length)
 if(/今天|明天|后天|月底|月末|下月|明年|周末|(?:周|星期|礼拜)[一二三四五六日天1-7]|\d{4}[-年]\d{1,2}[-月]\d{1,2}|\d{1,2}月\d{1,2}[日号]/.test(rest))return null
 const local=parts(Date.parse(createdAt),timeZone),calendar=new Date(Date.UTC(local.year,local.month-1,local.day)),weekday=calendar.getUTCDay()||7
 const target=/^\d$/.test(match[2]!)?Number(match[2]):'一二三四五六日天'.indexOf(match[2]!)+1
 calendar.setUTCDate(calendar.getUTCDate()-weekday+Math.min(target,7)+(match[1]==='下下'?14:match[1]==='下'?7:0))
 const date=calendar.toISOString().slice(0,10),tail=direct.slice(index+match[0].length)
 const clock=/^\s*((?:(?:凌晨|早上|上午|中午|下午|晚上)\s*)?(?:\d{1,2}|[零一二两三四五六七八九十]{1,3})(?::\d{2}|点(?:半|(?:\d{1,2}|[零一二三四五六七八九十]{1,3})分)?))/.exec(tail)
 const scheduledTail=tail.slice(clock?.[0].length??0).trimStart(),clause=scheduledTail.split(/[，,。；;\n]/)[0]!
 if(/取消|不开|不再|不用/.test(clause))return null
 // Background availability is not a deadline. Limit the correction to an
 // explicitly scheduled project event/delivery or an explicit deadline lead-in.
 if(!/^(?:前|之前|截止|完成|提交|交付|验收|交稿|组会|开会|会议|汇报|答辩|报告|稿件|初稿|终稿)/.test(scheduledTail)&&!/(?:截止(?:到|在|时间)?|最晚|交付(?:在|到)?|安排在|定在|赶在|在)\s*$/.test(direct.slice(0,index)))return null
 if(clock){
  // An unqualified Chinese twelve-hour clock needs interpretation; do not
  // silently turn "三点" into3am. Explicit HH:mm or a period is supported.
  if(!/:|凌晨|早上|上午|中午|下午|晚上/.test(clock[1]!))return null
  const parsed=reminderRequest(`${date} ${clock[1]} __project_deadline__`,timeZone,Date.parse(createdAt))
  return parsed?{dueAt:new Date(parsed.due).toISOString(),dueDate:null}:null
 }
 if(/(?:凌晨|早上|上午|中午|下午|晚上)|\d{1,2}:\d{2}|[\d一二两三四五六七八九十]+点/.test(rest))return null
 return {dueAt:null,dueDate:date}
}

export function normalizeProjectDeadline<T extends Deadline&{timeZone:string;commitments:Deadline[]}>(input:T,sources:{text:string|null;createdAt:string}[]){
 if(!input.dueDate&&!input.dueAt)return
 // A continuous batch may cross midnight: anchor to the actual message that
 // contains the phrase, never worker time or a later submission in the batch.
 const combined=sources.map(source=>source.text??'').join('\n')
 const owner=sources.find(source=>[...(source.text??'').matchAll(weekdayPattern)].length===1)
 if(!owner)return
 const deadline=relativeProjectDeadline(combined,input.timeZone,owner.createdAt)
 if(!deadline)return
 const timeZone=input.timeZone,oldDate=input.dueDate,oldAt=input.dueAt
 for(const commitment of input.commitments){
  if(oldDate&&commitment.dueDate===oldDate&&!commitment.dueAt){commitment.dueDate=deadline.dueDate??dateText(Date.parse(deadline.dueAt!),timeZone)}
  else if(oldAt&&commitment.dueAt&&Date.parse(commitment.dueAt)===Date.parse(oldAt)){commitment.dueAt=deadline.dueAt;commitment.dueDate=deadline.dueDate}
 }
 input.dueAt=deadline.dueAt;input.dueDate=deadline.dueDate
}
