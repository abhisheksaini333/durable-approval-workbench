import type {ProvisioningActivities} from '../activities/contracts';
import {condition,defineSignal,defineQuery,setHandler,proxyActivities} from '@temporalio/workflow';
import {Actor,Decision,Metadata,Policy,RequestInput,State,applyDecision,appendAudit,createState,publicSnapshot,requestCancellation,DomainError,expire} from '../domain';
export interface OnboardingInput {request:RequestInput;metadata:Metadata;policy:Policy;}
export const decide=defineSignal<[Decision]>('decision');
export const cancel=defineSignal<[Actor]>('cancel');
export const snapshot=defineQuery<ReturnType<typeof publicSnapshot>>('snapshot');
export async function onboarding(input:OnboardingInput){
 const effects=proxyActivities<ProvisioningActivities>({startToCloseTimeout:'10 seconds',scheduleToCloseTimeout:'45 seconds',retry:{initialInterval:'1 second',maximumInterval:'5 seconds',maximumAttempts:4,nonRetryableErrorTypes:['ProviderRejected']}});
 let state=createState(input.request,input.metadata,input.policy,Date.now());
 function guard(fn:()=>State){try{state=fn()}catch(error){if(!(error instanceof DomainError))throw error;appendAudit(state,'command_rejected',Date.now(),undefined,undefined,error.code)}}
 setHandler(snapshot,()=>publicSnapshot(state));
 setHandler(decide,command=>guard(()=>applyDecision(state,command,Date.now())));
 setHandler(cancel,actor=>guard(()=>requestCancellation(state,actor,Date.now())));
 await condition(()=>state.status!=='pending',Math.max(1,state.createdAt+state.policy.reminderAfterMs-Date.now()));
 if(state.status==='pending'){state.reminded=true;appendAudit(state,'review_reminder',Date.now(),undefined,state.policy.stages[state.stageIndex]);}
 await condition(()=>state.status!=='pending',Math.max(1,state.deadline-Date.now()));
 state=expire(state,Date.now());
 if(state.status==='provisioning'){
  await effects.reserve(state.request);state.reserved=true;appendAudit(state,'capacity_reserved',Date.now());
  await effects.activate(state.request);state.activated=true;state.status='approved';state.revision++;appendAudit(state,'service_activated',Date.now());
 }
 return publicSnapshot(state);
}
