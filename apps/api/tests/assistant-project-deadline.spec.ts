import { describe,expect,it } from 'vitest'
import { normalizeProjectDeadline,relativeProjectDeadline } from '../src/assistant-project-deadline.js'

describe('single direct relative project weekday at the owner-message boundary',()=>{
 it.each([
  ['2026-11-16T01:00:00Z','Asia/Shanghai','下周五组会还要汇报合成项目','2026-11-27'],
  ['2026-11-22T10:00:00Z','Asia/Shanghai','下周五组会稿交给你持续跟进','2026-11-27'],
  ['2026-11-29T10:00:00Z','Asia/Shanghai','下星期五组会稿交给你持续跟进','2026-12-04'],
  ['2026-12-28T10:00:00Z','Asia/Shanghai','下周五组会稿交给你持续跟进','2027-01-08'],
  ['2026-11-22T17:00:00Z','Asia/Shanghai','下周五组会稿交给你持续跟进','2026-12-04'],
  ['2026-11-22T17:00:00Z','America/Los_Angeles','下周五组会稿交给你持续跟进','2026-11-27'],
  ['2026-11-16T01:00:00Z','Asia/Shanghai','本周五组会稿交给你持续跟进','2026-11-20'],
 ])('anchors %s in %s to the intended local calendar', (createdAt,timeZone,text,dueDate)=>{
  expect(relativeProjectDeadline(text,timeZone,createdAt)).toEqual({dueAt:null,dueDate})
 })
 it('retains an explicit local clock while date-only requests invent no meeting instant',()=>{
  expect(relativeProjectDeadline('下周五下午三点半组会，稿件交给你持续跟进','Asia/Shanghai','2026-11-16T01:00:00Z')).toEqual({dueAt:'2026-11-27T07:30:00.000Z',dueDate:null})
  expect(relativeProjectDeadline('下周五15:00开会，稿件交给你持续跟进','Asia/Shanghai','2026-11-16T01:00:00Z')).toEqual({dueAt:'2026-11-27T07:00:00.000Z',dueDate:null})
 })
 it.each([
  '假如下周五开组会，你会如何理解这句话？',
  '请解释“下周五组会还要汇报合成项目”的语法',
  "请分析'下周五开会'这句话",
  '请整理资料。\n> 下周五开组会',
  '请整理资料。\n<实验记录>下周五开组会</实验记录>',
  '请整理资料。\n【实验记录】下周五开组会',
  '请整理资料。\n```\n下周五开组会\n```',
  '周三交初稿，下周五开会，稿件交给你持续跟进',
  '下周五组会，2026-11-25交初稿',
  '下周五三点开会，稿件交给你持续跟进',
  '下周五组会，下午三点开始',
  '下周五我休息，把材料核对一下，没有截止日期',
  '下周五是学校放假，月底再交',
  '下周五我休息，把材料核对一下',
  '不是下周五组会，不要按旧时间准备',
  '下周五组会取消了，先看看材料',
  '下周五不是下午三点开会，时间还没定',
 ])('leaves interpretation of quoted, hypothetical, multiple or unsupported dates unchanged: %s',text=>{
  expect(relativeProjectDeadline(text,'Asia/Shanghai','2026-11-16T01:00:00Z')).toBeNull()
 })
 it('does not invent a deadline when the model proposal has none',()=>{
  const input={timeZone:'Asia/Shanghai',dueAt:null,dueDate:null,commitments:[{dueAt:null,dueDate:null}]}
  normalizeProjectDeadline(input,[{text:'下周五组会稿交给你持续跟进，先讨论材料。',createdAt:'2026-11-16T01:00:00Z'}])
  expect(input).toMatchObject({dueAt:null,dueDate:null,commitments:[{dueAt:null,dueDate:null}]})
 })
 it('moves only deadlines inherited from the original project date, including a continuous batch across midnight',()=>{
  const input={timeZone:'Asia/Shanghai',dueAt:null,dueDate:'2026-11-20',commitments:[{dueAt:null,dueDate:'2026-11-20'},{dueAt:null,dueDate:'2026-11-25'},{dueAt:'2026-11-20T02:00:00Z',dueDate:null},{dueAt:null,dueDate:null}]}
  normalizeProjectDeadline(input,[{text:'下周五组会稿交给你持续跟进',createdAt:'2026-11-22T15:59:00Z'},{text:'写好后给我验收',createdAt:'2026-11-22T16:01:00Z'}])
  expect(input.dueDate).toBe('2026-11-27');expect(input.dueAt).toBeNull()
  expect(input.commitments).toEqual([{dueAt:null,dueDate:'2026-11-27'},{dueAt:null,dueDate:'2026-11-25'},{dueAt:'2026-11-20T02:00:00Z',dueDate:null},{dueAt:null,dueDate:null}])
 })
 it('removes a fabricated meeting clock only from exact matching inherited instants',()=>{
  const input={timeZone:'Asia/Shanghai',dueAt:'2026-11-20T07:00:00Z',dueDate:null,commitments:[{dueAt:'2026-11-20T07:00:00Z',dueDate:null},{dueAt:'2026-11-20T06:00:00Z',dueDate:null}]}
  normalizeProjectDeadline(input,[{text:'下周五组会稿交给你持续跟进',createdAt:'2026-11-16T01:00:00Z'}])
  expect(input).toMatchObject({dueAt:null,dueDate:'2026-11-27',commitments:[{dueAt:null,dueDate:'2026-11-27'},{dueAt:'2026-11-20T06:00:00Z',dueDate:null}]})
 })
})
