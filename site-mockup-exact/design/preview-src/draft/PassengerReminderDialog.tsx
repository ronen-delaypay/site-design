import {useEffect,useId,useRef} from "react";
import {UsersRound} from "lucide-react";

const COPY={
  en:{title:"Before you continue",body:"Are you sure all passengers have been properly submitted? Please check that everyone travelling on this booking is included before moving on to the power of attorney.",back:"Review passenger details",confirm:"Yes, continue to power of attorney",saving:"Saving…"},
  he:{title:"לפני שממשיכים",body:"האם כל הנוסעים הוזנו כראוי? בדקו שכל מי שטס בהזמנה הזו מופיע לפני המעבר לייפוי הכוח.",back:"בדיקת פרטי הנוסעים",confirm:"כן, להמשיך לייפוי כוח",saving:"שומרים…"},
  ru:{title:"Перед продолжением",body:"Вы уверены, что добавили всех пассажиров? Проверьте, что в заявлении указаны все участники бронирования, прежде чем перейти к доверенности.",back:"Проверить пассажиров",confirm:"Да, перейти к доверенности",saving:"Сохранение…"},
  ar:{title:"قبل المتابعة",body:"هل أضفتم جميع المسافرين؟ يُرجى التأكد من إدراج كل المسافرين في هذا الحجز قبل الانتقال إلى التوكيل.",back:"مراجعة بيانات المسافرين",confirm:"نعم، المتابعة إلى التوكيل",saving:"جارٍ الحفظ…"},
};

const EVIDENCE_COPY = {
  en: { body: "Check that everyone travelling on this booking is included before continuing.", confirm: "Yes, continue" },
  he: { body: "בדקו שכל מי שטס בהזמנה הזו מופיע לפני שממשיכים.", confirm: "כן, להמשיך" },
  ru: { body: "Проверьте, что в заявлении указаны все участники бронирования.", confirm: "Да, продолжить" },
  ar: { body: "يُرجى التأكد من إدراج كل المسافرين في هذا الحجز قبل المتابعة.", confirm: "نعم، المتابعة" },
};

export function PassengerReminderDialog({open,locale,busy,evidenceNext,confirmLabel,onCancel,onConfirm}:{open:boolean;locale:string;busy:boolean;evidenceNext:boolean;confirmLabel?:string;onCancel:()=>void;onConfirm:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  const titleId=useId();
  const bodyId=useId();
  const language = locale as keyof typeof COPY;
  const copy = { ...(COPY[language] ?? COPY.en), ...(evidenceNext ? EVIDENCE_COPY[language] ?? EVIDENCE_COPY.en : {}) };
  const rtl=locale==="he"||locale==="ar";
  useEffect(()=>{
    const dialog=ref.current;
    if(open&&!dialog?.open)dialog?.showModal();
    else if(!open&&dialog?.open)dialog.close();
  },[open]);
  return <>
    <style>{`.dp-passenger-reminder::backdrop{background:rgba(25,37,59,.42);backdrop-filter:blur(3px)}`}</style>
    <dialog ref={ref} className="dp-passenger-reminder" data-testid="passenger-submission-reminder" dir={rtl?"rtl":"ltr"} aria-labelledby={titleId} aria-describedby={bodyId} onCancel={event=>{event.preventDefault();if(!busy)onCancel();}} style={{width:"min(520px,calc(100vw - 36px))",boxSizing:"border-box",border:"1px solid #dce4f0",borderRadius:20,padding:"30px",color:"#24283f",background:"#f8faff",boxShadow:"0 24px 80px rgba(28,48,84,.24)",fontFamily:"inherit"}}>
      <div aria-hidden="true" style={{display:"flex",width:46,height:46,alignItems:"center",justifyContent:"center",borderRadius:14,background:"#eaf1ff",color:"#2f6feb",marginBottom:18}}><UsersRound size={22}/></div>
      <h2 id={titleId} style={{fontSize:23,lineHeight:1.25,margin:"0 0 10px",fontWeight:700}}>{copy.title}</h2>
      <p id={bodyId} style={{fontSize:15,lineHeight:1.65,color:"#596780",margin:0}}>{copy.body}</p>
      <footer style={{display:"flex",justifyContent:"flex-end",flexWrap:"wrap",gap:10,marginTop:26}}>
        <button type="button" disabled={busy} onClick={onCancel} style={{minHeight:44,border:"1px solid #d6e1f1",borderRadius:11,padding:"10px 15px",background:"#fff",color:"#34435e",font:"600 14px inherit",cursor:busy?"wait":"pointer"}}>{copy.back}</button>
        <button type="button" disabled={busy} data-testid="passenger-reminder-confirm" onClick={onConfirm} style={{minHeight:44,border:"1px solid #2f6feb",borderRadius:11,padding:"10px 15px",background:"#2f6feb",color:"#fff",font:"600 14px inherit",cursor:busy?"wait":"pointer"}}>{busy?copy.saving:(confirmLabel??copy.confirm)}</button>
      </footer>
    </dialog>
  </>;
}
