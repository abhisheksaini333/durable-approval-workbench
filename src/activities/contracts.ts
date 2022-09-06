import type {Metadata,RequestInput} from '../domain';
export type EffectInput=RequestInput&Metadata;
export interface ProvisioningActivities {
 reserve(input:EffectInput):Promise<void>;
 activate(input:EffectInput):Promise<void>;
 deactivate(input:EffectInput):Promise<void>;
 release(input:EffectInput):Promise<void>;
}
