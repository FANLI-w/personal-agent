import {z} from 'zod'
import {Id,Instant,Version,ErrorResponse,errorStatus,data} from './models.js'
import {AccountUsername,RegistrationCode} from './authentication.js'
const empty=z.strictObject({}),id=z.strictObject({id:Id}),member=z.strictObject({id:Id,memberId:Id})
const name=z.string().trim().min(1).max(100)
const displayName=z.string().min(1).max(200)
export const LabGroup=z.strictObject({id:Id,name:displayName,role:z.enum(['manager','member']),memberCount:z.number().int().nonnegative()})
export const LabMember=z.strictObject({id:Id,username:AccountUsername,displayName:z.string(),role:z.enum(['manager','member']),version:Version})
export const LabInvitation=z.strictObject({id:Id,labId:Id,labName:displayName,inviterName:z.string(),memberId:Id,memberName:z.string(),status:z.enum(['pending','accepted','declined','revoked']),version:Version,expiresAt:Instant})
function route<P extends z.ZodType,B extends z.ZodType,R extends z.ZodType>(method:'GET'|'POST',path:string,params:P,body:B,response:R,status=200){
 return {method,path:'/api/v1'+path,stage:'B5b' as const,status,access:'session',implemented:true,idempotent:method!=='GET',rule:'Authenticated research-group membership; live membership and manager checks precede retry replay. Origin and CSRF on mutations. Private account home, models and OAuth identities never move.',request:z.strictObject({params,query:empty,headers:method==='GET'?empty:z.strictObject({'Idempotency-Key':z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)}),body}),response,errors:ErrorResponse,errorStatuses:errorStatus}
}
export const labMembershipRoutes={
 myLabs:route('GET','/me/labs',empty,z.null(),data(z.strictObject({groups:z.array(LabGroup).max(50),currentLabId:Id,personalLabId:Id.nullable(),invitations:z.array(LabInvitation).max(50)}))),
 createLab:route('POST','/labs',empty,z.strictObject({name}),data(LabGroup),201),
 selectLab:route('POST','/me/lab-context',empty,z.strictObject({labId:Id}),data(z.strictObject({labId:Id}))),
 labMembership:route('GET','/labs/{id}/membership',id,z.null(),data(z.strictObject({group:LabGroup,members:z.array(LabMember).max(500),invitations:z.array(LabInvitation).max(50)}))),
 inviteLabMember:route('POST','/labs/{id}/member-invitations',id,z.strictObject({username:AccountUsername}),data(LabInvitation),201),
 decideLabInvitation:route('POST','/lab-member-invitations/{id}/decision',id,z.strictObject({expectedVersion:Version,decision:z.enum(['accepted','declined'])}),data(LabInvitation)),
 revokeLabInvitation:route('POST','/lab-member-invitations/{id}/revoke',id,z.strictObject({expectedVersion:Version}),data(LabInvitation)),
 previewLabCode:route('POST','/lab-join-preview',empty,z.strictObject({inviteCode:RegistrationCode}),data(z.strictObject({labId:Id,name:displayName,expiresAt:Instant}))),
 joinLab:route('POST','/lab-joins',empty,z.strictObject({inviteCode:RegistrationCode}),data(LabGroup)),
 removeLabMember:route('POST','/labs/{id}/members/{memberId}/remove',member,z.strictObject({expectedVersion:Version}),data(z.strictObject({removed:z.literal(true)}))),
 leaveLab:route('POST','/labs/{id}/leave',id,empty,data(z.strictObject({left:z.literal(true)}))),
 renameLab:route('POST','/labs/{id}/rename',id,z.strictObject({name}),data(LabGroup)),
} as const
