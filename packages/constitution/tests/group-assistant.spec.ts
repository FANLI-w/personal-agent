import {expect,it} from 'vitest'
import {actions,kinds} from '../src/axis.js'
import {canGroupAssistant} from '../src/group-assistant.js'

it('a group assistant never receives personal-layer permissions or approval authority',()=>{
  for(const kind of kinds){
    for(const action of actions)expect(canGroupAssistant({layer:'personal',kind},action)).toBe('deny')
    for(const layer of ['system','lab','personal'] as const)expect(canGroupAssistant({layer,kind},'approve')).toBe('deny')
  }
})
it('shared business writes require requests; platform/lab rules remain read-only',()=>{
  expect(canGroupAssistant({layer:'system',kind:'rule'},'inject')).toBe('allow')
  expect(canGroupAssistant({layer:'lab',kind:'rule'},'write')).toBe('deny')
  for(const kind of ['object','source','link','memory'] as const){
    expect(canGroupAssistant({layer:'lab',kind},'write')).toBe('request')
    expect(canGroupAssistant({layer:'lab',kind},'request')).toBe('allow')
  }
})
