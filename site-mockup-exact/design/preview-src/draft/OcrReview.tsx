import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/locale";
import { translatorFor } from "@/lib/i18n";
import "./ocr-review.css";
import { AirlineSearchSelect } from "@/components/client/AirlineSearchSelect";
import { AirportSearchSelect } from "@/components/client/AirportSearchSelect";
import { FlightNumberInput } from "@/components/client/FlightNumberInput";
export type ReviewValues = Record<"clientName" | "airline" | "flightNumber" | "departureDate" | "origin" | "destination" | "bookingReference" | "ticketNumber", string>;
export const REVIEW_COPY = {
 en: { label: "Confirm details", title: "Do these flight details look right?", body: "We filled in what we could read. Fix anything that’s off and add what’s missing.", confirm: "Are these details correct?", yes: "Yes, I’ve checked them and they’re correct.", no: "No, I need to make changes.", incomplete: "These details are not confirmed. Correct anything that’s wrong, then choose Yes to continue.", next: "Confirm and continue", loading: "Preparing your document details…", error: "We couldn’t load your details. Try again before continuing.", retry: "Try again", missing: "Complete this field", saving: "Saving your confirmed details…" },
 he: { label: "אישור הפרטים", title: "פרטי הטיסה נראים לכם נכונים?", body: "מילאנו את מה שהצלחנו לקרוא. תקנו את מה שצריך והשלימו את מה שחסר.", confirm: "האם הפרטים נכונים?", yes: "כן, בדקתי את הפרטים והם נכונים.", no: "לא, צריך לתקן את הפרטים.", incomplete: "הפרטים עדיין לא אושרו. תקנו את מה שצריך ובחרו כן כדי להמשיך.", next: "אישור והמשך", loading: "מכינים את פרטי המסמכים…", error: "לא הצלחנו לטעון את הפרטים. נסו שוב לפני ההמשך.", retry: "ניסיון נוסף", missing: "יש להשלים שדה זה", saving: "שומרים את הפרטים שאישרתם…" },
 ru: { label: "Проверка данных", title: "Данные рейса указаны верно?", body: "Мы заполнили то, что удалось прочитать. Исправьте неточности и добавьте недостающие данные.", confirm: "Эти данные верны?", yes: "Да, я проверил(а) данные, всё верно.", no: "Нет, мне нужно внести изменения.", incomplete: "Данные не подтверждены. Исправьте неточности и выберите «Да», чтобы продолжить.", next: "Подтвердить и продолжить", loading: "Подготавливаем данные документов…", error: "Не удалось загрузить данные. Повторите попытку перед продолжением.", retry: "Повторить", missing: "Заполните это поле", saving: "Сохраняем подтверждённые данные…" },
 ar: { label: "تأكيد البيانات", title: "هل تبدو تفاصيل الرحلة صحيحة؟", body: "ملأنا ما تمكّنا من قراءته. صحّح ما يحتاج إلى تعديل وأضف المعلومات الناقصة.", confirm: "هل هذه البيانات صحيحة؟", yes: "نعم، راجعت البيانات وهي صحيحة.", no: "لا، أحتاج إلى تعديل البيانات.", incomplete: "لم يتم تأكيد البيانات. صحّح ما يلزم ثم اختر نعم للمتابعة.", next: "تأكيد ومتابعة", loading: "نجهّز بيانات المستندات…", error: "تعذّر تحميل بياناتك. حاول مجددًا قبل المتابعة.", retry: "حاول مجددًا", missing: "أكمل هذا الحقل", saving: "نحفظ البيانات التي أكّدتها…" },
} satisfies Record<Locale, Record<string, string>>;
const FIELDS = [
 ["clientName", "claim.fullName"], ["airline", "claim.airline"], ["flightNumber", "claim.flightNumber"], ["departureDate", "claim.departureDate"],
 ["origin", "claim.origin"], ["destination", "claim.destination"], ["bookingReference", "claim.bookingReference"], ["ticketNumber", "claim.ticketNumber"],
] as const;
const REQUIRED = ["clientName", "airline", "flightNumber", "departureDate", "origin", "destination"] as const;
export function reviewIsComplete(values: ReviewValues | null) { return Boolean(values && REQUIRED.every(key => values[key]?.trim())); }
export function OcrReview({ caseDocId, getIdToken, locale, values, onChange, checked, onChecked, onReady, saving, saveError, showIncomplete }: {
 caseDocId: string; getIdToken: () => Promise<string>; locale: string; values: ReviewValues | null; onChange: (value: ReviewValues) => void;
 checked: boolean | null; onChecked: (value: boolean | null) => void; onReady: (ready: boolean) => void; saving: boolean; saveError: string | null; showIncomplete: boolean;
}) {
 const text = REVIEW_COPY[locale as Locale] ?? REVIEW_COPY.en;
 const t = translatorFor(locale as Locale);
 const token = useRef(getIdToken); token.current = getIdToken;
 const initialValues = useRef(values);
 const callbacks = useRef({ onChange, onReady }); callbacks.current = { onChange, onReady };
 const [loading, setLoading] = useState(!values); const [error, setError] = useState(false); const [retry, setRetry] = useState(0);
 useEffect(() => {
  if (initialValues.current && retry === 0) { callbacks.current.onReady(true); return; }
  let active = true; setLoading(true); setError(false); callbacks.current.onReady(false);
  void (async () => { try {
   const idToken = await token.current(); const response = await fetch(`/api/client/cases/${caseDocId}`, { headers: { Authorization: `Bearer ${idToken}` } });
   const body = await response.json(); if (!response.ok || !body.ok || !body.case) throw new Error("review_load_failed");
   const extracted = Object.fromEntries(Object.entries(body.case.ocrReviewFields ?? {}).filter(([, value]) => typeof value === "string" && value.trim()));
   const source = { ...body.case, ...extracted }; const next = {} as ReviewValues;
   for (const [key] of FIELDS) next[key] = typeof source[key] === "string" ? source[key] : "";
   next.departureDate = next.departureDate.slice(0, 10);
   if (active) { callbacks.current.onChange(next); callbacks.current.onReady(true); setLoading(false); }
  } catch { if (active) { setLoading(false); setError(true); } } })();
  return () => { active = false; };
 }, [caseDocId, retry]);
 return <section className="dp-ocr-review" data-testid="ocr-confirmation-step">
  <header><h3 tabIndex={-1}>{text.title}</h3><p>{text.body}</p></header>
  {loading ? <p role="status">{text.loading}</p> : error ? <div role="alert"><p>{text.error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>{text.retry}</button></div> : values && <>
   <fieldset className="dp-ocr-review-fields" disabled={saving} aria-label={t("claimFlow.step.details")}>
    {FIELDS.map(([key, label]) => {
     const required = REQUIRED.includes(key as typeof REQUIRED[number]);
     const fieldLabel = `${t(label)}${required ? " *" : ""}`;
     const update = (value: string) => { onChecked(null); onChange({ ...values, [key]: value }); };
     const common = { name: key, label: fieldLabel, defaultValue: values[key], "data-testid": `ocr-review-${key}`, onChange: (event: { target: { value: string } }) => update(event.target.value) };
     return <div className={`dp-ocr-field ${["airline","origin","destination","flightNumber"].includes(key) ? "dp-ocr-search-field" : ""}`} data-field={key} key={key}>
      {key === "airline" ? <AirlineSearchSelect {...common} getIdToken={() => token.current()} />
       : key === "origin" || key === "destination" ? <AirportSearchSelect {...common} />
       : key === "flightNumber" ? <FlightNumberInput {...common} />
       : <div className="dp-ocr-plain-field"><label htmlFor={`ocr-review-${key}`}>{fieldLabel}</label>
         <input id={`ocr-review-${key}`} data-testid={`ocr-review-${key}`} name={key} type={key === "departureDate" ? "date" : "text"}
           dir={key === "clientName" ? "auto" : "ltr"} aria-required={required} value={values[key]} autoComplete="off" onChange={event => update(event.target.value)} />
         </div>}
      {required && !values[key].trim() && <small className="dp-ocr-field-help">{text.missing}</small>}
     </div>;
    })}
   </fieldset>
   <fieldset className="dp-ocr-review-confirm" data-testid="ocr-review-confirm-group" disabled={saving || !reviewIsComplete(values)}>
    <legend>{text.confirm}</legend>
    <label><input type="radio" name="ocr-review-confirm" value="yes" data-testid="ocr-review-confirm-yes" checked={checked===true} onChange={()=>onChecked(true)} /><span>{text.yes}</span></label>
    <label><input type="radio" name="ocr-review-confirm" value="no" data-testid="ocr-review-confirm-no" checked={checked===false} onChange={()=>onChecked(false)} /><span>{text.no}</span></label>
    {showIncomplete&&checked!==true&&<small role="note">{text.incomplete}</small>}
   </fieldset>
  </>}
  {saving && <p role="status">{text.saving}</p>}{saveError && <p role="alert">{saveError}</p>}
 </section>;
}
