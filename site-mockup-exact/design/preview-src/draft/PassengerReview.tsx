import {useEffect,useRef,useState} from "react";
import {Input} from "@/components/client/Input";
import {BirthDateInput} from "./BirthDateInput";
import {passengerText} from "./passenger-users";
import {isValidYmd} from "@/lib/claims/passenger-age";

const ACK={
 en:{yes:"Yes, these details are correct.",no:"No, I need to make changes.",incomplete:"Passenger details are not confirmed. Correct them or choose Yes before continuing."},
 he:{yes:"כן, הפרטים נכונים.",no:"לא, צריך לתקן את הפרטים.",incomplete:"פרטי הנוסע עדיין לא אושרו. תקנו אותם או בחרו כן כדי להמשיך."},
 ru:{yes:"Да, эти данные верны.",no:"Нет, мне нужно внести изменения.",incomplete:"Данные пассажира не подтверждены. Исправьте их или выберите «Да», чтобы продолжить."},
 ar:{yes:"نعم، هذه البيانات صحيحة.",no:"لا، أحتاج إلى تعديل البيانات.",incomplete:"لم يتم تأكيد بيانات المسافر. صحّحها أو اختر نعم للمتابعة."},
};
export type ReviewedPassenger={id:string;fullName:string;dateOfBirth:string;userId?:string;accountStatus?:string;checked:boolean|null;email?:string;phone?:string};
export const passengersReviewed=(list:ReviewedPassenger[]|null)=>Boolean(list?.length&&list.every(p=>p.fullName.trim()&&isValidYmd(p.dateOfBirth)&&p.checked===true));

export function PassengerReview({caseDocId,getIdToken,locale,items,onChange,onReady,saving,showIncomplete}:{caseDocId:string;getIdToken:()=>Promise<string>;locale:string;items:ReviewedPassenger[]|null;onChange:(items:ReviewedPassenger[], change:"load"|"details"|"confirmation")=>void;onReady:(value:boolean)=>void;saving:boolean;showIncomplete:boolean}){
 const text=passengerText(locale);
 const ack=ACK[locale as keyof typeof ACK]??ACK.en;
 const refs=useRef({getIdToken,onChange,onReady});
 refs.current={getIdToken,onChange,onReady};
 const initial=useRef(items);
 const [error,setError]=useState(false);
 const [retry,setRetry]=useState(0);
 const [loading,setLoading]=useState(!items);
 useEffect(()=>{
  if(initial.current&&retry===0){refs.current.onReady(true);return;}
  let active=true;
  setLoading(true);refs.current.onReady(false);
  void(async()=>{
   try{
    const res=await fetch(`/api/client/cases/${caseDocId}`,{headers:{Authorization:`Bearer ${await refs.current.getIdToken()}`}});
    const data=await res.json();
    if(!res.ok||!data.ok||!data.case||!Array.isArray(data.case.passengers)||!data.case.passengers.length)throw Error("passenger_load_failed");
    if(active){refs.current.onChange(data.case.passengers.map((p:any)=>({...p,fullName:p.fullName??"",dateOfBirth:p.dateOfBirth??"",checked:null})), "load");refs.current.onReady(true);setLoading(false);setError(false);}
   }catch{if(active){setLoading(false);setError(true);}}
  })();
  return()=>{active=false;};
 },[caseDocId,retry]);
 const update=(i:number,patch:Partial<ReviewedPassenger>)=>{
  const confirmation = "checked" in patch;
  const next = (items ?? []).map((p,index) => index === i
    ? { ...p, ...patch, checked: confirmation ? patch.checked ?? null : null }
    : p);
  onChange(next, confirmation ? "confirmation" : "details");
 };
 return <section className="dp-passenger-review" data-testid="passenger-review">
  <h3>{text.account}</h3>
  {loading&&<p role="status">…</p>}
  {error&&<div role="alert"><p>{text.retry}</p><button type="button" onClick={()=>setRetry(v=>v+1)}>{text.save}</button></div>}
  {(items??[]).map((p,i)=><fieldset key={p.id} disabled={saving} className="dp-passenger-review-card" data-testid={`review-passenger-${i}`}>
   <legend>{text.passenger} {i+1}: {p.fullName||"—"}</legend>
   <div className="dp-passenger-review-grid">
    <Input data-testid={`review-passenger-${i}-name`} label={text.name+" *"} value={p.fullName} onChange={e=>update(i,{fullName:e.target.value})}/>
    <BirthDateInput data-testid={`review-passenger-${i}-dob`} name={`reviewedPassengers[${i}].dateOfBirth`} label={text.dob} value={p.dateOfBirth} onValueChange={(value:string)=>update(i,{dateOfBirth:value})}/>
   </div>
   {p.userId&&<p className="dp-passenger-account-status" data-user-id={p.userId}>{p.accountStatus==="guardian_managed"?text.guardian:p.accountStatus==="active"?text.linked:text.pending}</p>}
   <fieldset className="dp-passenger-confirm" data-testid={`review-passenger-${i}-confirm-group`} disabled={!p.fullName.trim()||!isValidYmd(p.dateOfBirth)}>
    <legend>{text.confirmed}</legend>
    <label><input data-testid={`review-passenger-${i}-confirm-yes`} type="radio" name={`passenger-confirm-${p.id}`} value="yes" checked={p.checked===true} onChange={()=>update(i,{checked:true})}/><span>{ack.yes}</span></label>
    <label><input data-testid={`review-passenger-${i}-confirm-no`} type="radio" name={`passenger-confirm-${p.id}`} value="no" checked={p.checked===false} onChange={()=>update(i,{checked:false})}/><span>{ack.no}</span></label>
    {showIncomplete&&p.checked!==true&&<small role="note">{ack.incomplete}</small>}
   </fieldset>
  </fieldset>)}
 </section>;
}
