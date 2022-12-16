import {Entry} from './api';
export function needsAttention(entry:Entry){return entry.stateUnavailable||['failed','compensation_failed','expired'].includes(entry.snapshot?.status||'')||entry.snapshot?.status==='pending'&&entry.snapshot.reminded;}
