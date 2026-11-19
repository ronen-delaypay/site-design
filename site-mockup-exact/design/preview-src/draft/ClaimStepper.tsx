import React,{useContext} from 'react';
import {IntakeContext} from './ClaimIntake';
import {useOcrReview} from './OcrReviewContext';
import {REVIEW_COPY} from './OcrReview';
import {useLocale} from '@/hooks/useLocale';
import {ClaimStepper as OriginalStepper} from '@snapshot/components/client/ClaimStepper';
import {CLAIM_FLOW_STEPS,isSelectable} from '@/lib/client/claim-flow';
export function DraftClaimStepper(props:any){
 const intake=useContext(IntakeContext);const review=useOcrReview();const [locale]=useLocale();
 if(!intake&&!review)return <OriginalStepper {...props}/>;
 const scanning=intake?.stage==='scan';
 const items=[
  ...(intake?[{id:'scan',label:intake.scanLabel}]:[]),
  ...CLAIM_FLOW_STEPS.flatMap(id=>id==='documents'
    ? [{id:'ocr-review',label:review?.label??REVIEW_COPY[locale].label},...(review?.showEvidence?[{id,label:props.labels[id]}]:[])]
    : [{id,label:props.labels[id]}]),
 ];
 const active=scanning?'scan':review?.reviewing?'ocr-review':props.current;
 const currentIndex=items.findIndex(item=>item.id===active);
 return <nav className="draft-six-steps" data-testid="claim-stepper" aria-label={props.ariaLabel}><ol>{items.map((item,index)=>{
  const later=['poa','payout','done'].includes(item.id);
  const locked=!props.hasCase || (!review?.confirmed && (later || item.id==='documents')) || (review?.evidencePending && later);
  const state=item.id===active?'current':scanning?'locked':index<currentIndex?'done':locked?'locked':'upcoming';
  const click=state==='current'||state==='locked'?undefined:item.id==='scan'?intake?.openScan:item.id==='ocr-review'?review?.onOpen:isSelectable(item.id as any,props.hasCase)?()=>props.onSelect(item.id):undefined;
  const inside=<><span className="draft-step-number" aria-hidden="true">{state==='done'?'✓':index+1}</span><span className="dp-step-label">{item.label}</span></>;
  return <li key={item.id} data-step={item.id} data-state={state} aria-current={state==='current'?'step':undefined}>{click?<button type="button" onClick={click}>{inside}</button>:<div aria-disabled={state==='locked'?true:undefined}>{inside}</div>}{state==='current'&&<span className="draft-step-announcement">{props.stepOfLabel(currentIndex+1,items.length)}</span>}</li>;
 })}</ol></nav>;
}
export {DraftClaimStepper as ClaimStepper};
