import {MissingDetailsDialog,type MissingDetail} from "./MissingDetailsDialog";
import {passengerMissing} from "./passenger-users";
import {validateQuickClaimForm} from "@/lib/client/form-validation";
"use client";

import { useState, type CSSProperties, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { colors, fontSize, radius } from "@/lib/client/portal-theme";
import { useLocale } from "@/hooks/useLocale";
import { dir, translatorFor } from "@/lib/i18n";
import {
  CLAIM_QUESTIONS,
  activeQuestions,
  CLAIM_TYPE_IDS,
  DIAL_CODES,
  allQuestionsAnswered,
  buildClaimDetailsFields,
  composePhone,
  type ClaimAnswers,
  type ClaimTypeId,
} from "./claim-details";
import type { FlightSuggestion } from "@/lib/flights/flight-catalog";
import type { MessageKey } from "@/lib/i18n/dictionary";
import { AirportSearchSelect } from "@/components/client/AirportSearchSelect";
import { Button } from "@/components/client/Button";
import { FlightNumberInput } from "@/components/client/FlightNumberInput";
import { AirlineSearchSelect } from "@/components/client/AirlineSearchSelect";
import { Icon } from "@/components/client/Icon";
import { Input } from "@/components/client/Input";
import type { QuickClaimFormData } from "@/components/client/QuickClaimForm";
import {PassengerListEditor} from "./PassengerListEditor";
import {flowTranslator} from "./reimbursement-copy";

const CLAIM_TYPE_ICONS: Record<ClaimTypeId, "Clock" | "Ban" | "Plane" | "Ticket"> = {
  delayed: "Clock",
  cancelled: "Ban",
  denied_boarding: "Plane",
  baggage: "Ticket",
  reimbursement: "Ticket",
};

interface ClaimDetailsStepProps {
  getIdToken?: () => Promise<string>;
  initialType?: ClaimTypeId;
  form: QuickClaimFormData & { claimAnswers?: ClaimAnswers };
  loading: boolean;
  onChange: Dispatch<SetStateAction<QuickClaimFormData>>;
  /** The page's existing submit handler: it reads the named fields below and creates the case. */
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFieldFocus?: (fieldName: string) => void;
}

const fieldStyle: CSSProperties = {
  borderRadius: radius.lg,
  padding: "12px 16px",
  fontSize: fontSize.md,
};

/**
 * Step 1 of the new claim flow: what happened, then the flight. It is the same form the portal always
 * had (same field names, same submit handler, same case-creation endpoint), shown in the new design:
 * a picture-and-title tile for the kind of claim, and plain-language questions in place of raw numbers.
 */
export function ClaimDetailsStep({ form, loading, onChange, onSubmit, onFieldFocus, initialType, getIdToken }: ClaimDetailsStepProps) {
  const [locale] = useLocale();
  const t = flowTranslator(locale);
  const he = flowTranslator("he");
  const rtl = dir(locale) === "rtl";

  const [claimType, setClaimType] = useState<ClaimTypeId>(form.claimAnswers ? form.disruptionType : initialType ?? form.disruptionType);
  const [answers, setAnswers] = useState<ClaimAnswers>(form.claimAnswers ?? {});
  const savedDialCode = DIAL_CODES.find(code => form.phone.startsWith(code.value))?.value;
  const [dialCode, setDialCode] = useState(savedDialCode ?? "+972");
  const [localPhone, setLocalPhone] = useState(savedDialCode ? form.phone.slice(savedDialCode.length) : form.phone);
  const [missing,setMissing]=useState<MissingDetail[]>([]);
  const [showAnswerAll, setShowAnswerAll] = useState(false);

  const fields = buildClaimDetailsFields(claimType, answers, he);
  const phone = composePhone(dialCode, localPhone);

  // Keep the page's form snapshot in step with what is on screen: submit reads the live fields first
  // and only falls back to this snapshot.
  function syncAnswers(type: ClaimTypeId, next: ClaimAnswers) {
    const derived = buildClaimDetailsFields(type, next, he);
    onChange((prev) => ({
      ...prev,
      disruptionType: derived.disruptionType,
      delayHours: "",
      cancellationNoticeDays: derived.cancellationNoticeDays,
      notes: derived.notes,
      claimAnswers: next,
      expenseCause: type === "reimbursement" ? next.expenseCause : undefined,
    }));
  }

  function chooseType(type: ClaimTypeId) {
    setClaimType(type);
    setAnswers({});
    setShowAnswerAll(false);
    syncAnswers(type, {});
  }

  function answer(key: string, value: string) {
    const next = key === "expenseCause" ? { [key]: value } : { ...answers, [key]: value };
    if ((key === "bagRecovered" || key === "baggageStatus") && answers[key] !== value) {
      delete next.baggageDays;
    }
    setAnswers(next);
    syncAnswers(claimType, next);
  }

  function updatePhone(nextDial: string, nextLocal: string) {
    setDialCode(nextDial);
    setLocalPhone(nextLocal);
    onChange((prev) => ({ ...prev, phone: composePhone(nextDial, nextLocal) }));
  }

  const handleChange = (field: keyof QuickClaimFormData) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    onChange((prev) => ({ ...prev, [field]: value }));
  };

  // A suggested flight fills airline and airports, but only where the customer has typed nothing yet.
  const handlePickFlight = (suggestion: FlightSuggestion, formEl: HTMLFormElement | null) => {
    const fill = (field: "airline" | "origin" | "destination", value: string | null): string | undefined => {
      if (!value) return undefined;
      const el = formEl?.elements.namedItem(field);
      if (el instanceof HTMLInputElement && el.value.trim() === "") {
        el.value = value;
        return value;
      }
      return undefined;
    };
    const airline = fill("airline", suggestion.airline);
    const origin = fill("origin", suggestion.originAirport);
    const destination = fill("destination", suggestion.destinationAirport);
    onChange((prev) => ({
      ...prev,
      flightNumber: suggestion.flightNumber,
      ...(airline ? { airline } : {}),
      ...(origin ? { origin } : {}),
      ...(destination ? { destination } : {}),
    }));
  };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const gaps:MissingDetail[]=[];
    const fieldLabels:any={clientName:t('claim.fullName'),phone:t('claim.phone'),airline:t('claim.airline'),flightNumber:t('claim.flightNumber'),departureDate:t('claim.departureDate'),bookingReference:t('claim.bookingReference')};
    const passengers=form.passengers.map((p,i)=>({...p,fullName:p.fullName.trim()||(i===0?form.clientName:'')}));
    const validation=validateQuickClaimForm({...form,phone,notes:fields.notes,passengers},t);
    for(const error of validation.errors){if(error.field==='passengers')continue;gaps.push({label:`${fieldLabels[error.field]??error.field} — ${error.message}`,selector:error.field==='phone'?'[data-testid="quick-claim-phone"]':`[name="${error.field}"]:not([type="hidden"])`});}
    for(const key of ['origin','destination']as const)if(!form[key]?.trim())gaps.push({label:t(key==='origin'?'claim.origin':'claim.destination'),selector:`[data-testid="quick-claim-${key}"]`});
    gaps.push(...passengerMissing(passengers,locale,form.clientName));
    if(!allQuestionsAnswered(claimType,answers)){
      setShowAnswerAll(true);
      for(const q of activeQuestions(claimType,answers).filter(q=>!q.disabledWhen?.(answers)&&!answers[q.key]))gaps.push({label:t(q.labelKey),selector:`[data-testid="claim-answer-${q.key}-${q.options[0].value}"]`});
    }
    const guardianError=validation.errors.find(e=>e.field==='passengers'&&e.message===t('form.error.guardianRequired'));
    if(guardianError)gaps.push({label:guardianError.message,selector:'[data-testid$="-guardian-checkbox"]'});
    if(gaps.length){event.preventDefault();setMissing(gaps);return;}
    onSubmit(event);
  }

  return (
    <form
      onSubmit={handleSubmit}
      onFocusCapture={(event) => {
        const name = (event.target as { name?: unknown } | null)?.name;
        if (onFieldFocus && typeof name === "string" && name) onFieldFocus(name);
      }}
      data-testid="quick-claim-form"
      noValidate
    >
      <style>{`.dp-claim-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.dp-claim-fields{display:grid;gap:20px}@media (min-width:640px){.dp-claim-grid{grid-template-columns:repeat(5,minmax(0,1fr))}.dp-claim-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}`}</style>

      <MissingDetailsDialog items={missing} locale={locale} onClose={()=>setMissing([])}/>
      <h3 style={{ margin: 0, textAlign: "center", fontSize: fontSize.xxl, fontWeight: 700, color: colors.text }}>{t("claimDetails.title")}</h3>

      <div className="dp-claim-grid" role="group" aria-label={t("claimDetails.title")} style={{ marginTop: 20 }}>
        {CLAIM_TYPE_IDS.map((id) => {
          const active = id === claimType;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => chooseType(id)}
              data-testid={`claim-type-${id}`}
              style={{
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                padding: 0,
                borderRadius: radius.lg,
                border: `${active ? 2 : 1}px solid ${active ? colors.primary : colors.border}`,
                background: active ? colors.primaryBg : colors.bg,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 0", color: active ? colors.primary : colors.textMuted }}>
                <Icon name={CLAIM_TYPE_ICONS[id]} size={32} />
              </span>
              <span
                style={{
                  width: "100%",
                  padding: "12px 8px",
                  fontSize: fontSize.lg,
                  fontWeight: 700,
                  background: active ? colors.primary : colors.bgTertiary,
                  color: active ? colors.white : colors.text,
                }}
              >
                {t(`claimType.${id}` as MessageKey)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="dp-claim-fields" style={{ marginTop: 24 }}>
        <Input
          data-testid="quick-claim-client-name"
          name="clientName"
          label={t("claim.fullName")}
          placeholder={t("claimDetails.fullNamePlaceholder")}
          description={t("claimDetails.fullNameHint")}
          defaultValue={form.clientName}
          onChange={handleChange("clientName")}
          dir="ltr"
          autoComplete="name"
          style={fieldStyle}
        />

        <div>
          <label htmlFor="claim-phone-local" style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
            {t("claim.phone")}
          </label>
          <div dir="ltr" style={{ display: "grid", gridTemplateColumns: "136px minmax(0, 1fr)", gap: 8 }}>
            <select
              aria-label={t("claimDetails.dialCode")}
              value={dialCode}
              onChange={(event) => updatePhone(event.target.value, localPhone)}
              data-testid="quick-claim-dial-code"
              style={{ ...fieldStyle, width: "100%", minWidth: 0, border: `1px solid ${colors.border}`, background: colors.white, color: colors.text, fontFamily: "inherit" }}
            >
              {DIAL_CODES.map((code) => (
                <option key={code.value} value={code.value}>
                  {code.value} {code.label}
                </option>
              ))}
            </select>
            <input
              id="claim-phone-local"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={localPhone}
              onChange={(event) => updatePhone(dialCode, event.target.value)}
              placeholder="50-1234567"
              data-testid="quick-claim-phone"
              style={{ ...fieldStyle, width: "100%", border: `1px solid ${colors.border}`, background: colors.white, color: colors.text, fontFamily: "inherit", outline: "none" }}
            />
          </div>
          <input type="hidden" name="phone" value={phone} />
        </div>

        <AirlineSearchSelect
          getIdToken={getIdToken}
          data-testid="quick-claim-airline"
          name="airline"
          label={t("claim.airline")}
          placeholder={t("claim.airline")}
          defaultValue={form.airline}
          onChange={handleChange("airline")}
          style={fieldStyle}
        />
        <div>
          <FlightNumberInput
            data-testid="quick-claim-flight-number"
            name="flightNumber"
            label={t("claim.flightNumber")}
            placeholder="LY001"
            defaultValue={form.flightNumber}
            onChange={handleChange("flightNumber")}
            onPick={handlePickFlight}
          />
          <p style={{ margin: "4px 0 0", fontSize: fontSize.xs, color: colors.textMuted }}>{t("claimDetails.flightHint")}</p>
        </div>
        <AirportSearchSelect
          data-testid="quick-claim-origin"
          name="origin"
          label={t("claim.origin")}
          placeholder={t("claim.originPlaceholder")}
          defaultValue={form.origin}
          onChange={handleChange("origin")}
        />
        <AirportSearchSelect
          data-testid="quick-claim-destination"
          name="destination"
          label={t("claim.destination")}
          placeholder={t("claim.destinationPlaceholder")}
          defaultValue={form.destination}
          onChange={handleChange("destination")}
        />
        <Input
          data-testid="quick-claim-departure-date"
          name="departureDate"
          type="date"
          label={t("claim.departureDate")}
          defaultValue={form.departureDate}
          onChange={handleChange("departureDate")}
          style={fieldStyle}
        />
        <Input data-testid="quick-claim-booking-reference" name="bookingReference" label={t("claim.bookingReference")} defaultValue={form.bookingReference} onChange={event=>onChange(prev=>({...prev,bookingReference:event.target.value}))} autoComplete="off" style={fieldStyle} />
        <Input data-testid="quick-claim-ticket-number" name="ticketNumber" label={t("claim.ticketNumber")} defaultValue={form.ticketNumber} onChange={event=>onChange(prev=>({...prev,ticketNumber:event.target.value}))} autoComplete="off" style={fieldStyle} />
      </div>

      <input type="hidden" name="disruptionType" value={fields.disruptionType} />
      <input type="hidden" name="delayBucket" value={fields.delayBucket} />
      <input type="hidden" name="baggageStatus" value={fields.baggageStatus} />
      <input type="hidden" name="cancellationNoticeDays" value={fields.cancellationNoticeDays} />
      <input type="hidden" name="notes" value={fields.notes} />

      <div style={{ marginTop: 24, display: "grid", gap: 20, borderRadius: radius.lg, background: colors.bg, padding: 20 }} data-testid="claim-questions">
        {claimType === "reimbursement" && <p data-testid="reimbursement-separate-note" style={{margin:0,color:colors.textMuted}}>{t("claimDetails.reimbursementNote")}</p>}
        {activeQuestions(claimType,answers).filter(q=>!q.disabledWhen?.(answers)).map((question) => (
          <div key={question.key} role="group" aria-label={t(question.labelKey)} data-question-missing={showAnswerAll&&!answers[question.key]?"true":undefined} aria-invalid={showAnswerAll&&!answers[question.key]?true:undefined}>
            <p style={{ margin: "0 0 10px", fontSize: fontSize.md, fontWeight: 600, color: colors.text }}>{t(question.labelKey)}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {question.options.map((option) => {
                const active = answers[question.key] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => answer(question.key, option.value)}
                    data-testid={`claim-answer-${question.key}-${option.value}`}
                    style={{
                      borderRadius: radius.md,
                      border: `${active ? 2 : 1}px solid ${active ? colors.primary : colors.border}`,
                      background: active ? colors.accentBg : colors.white,
                      color: active ? colors.text : colors.textMuted,
                      padding: active ? "7px 15px" : "8px 16px",
                      fontSize: fontSize.md,
                      fontWeight: active ? 600 : 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {t(option.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {claimType === "baggage" && answers.baggageStatus === "lost" && (
          <p data-testid="lost-baggage-pir-note" style={{ margin: 0, fontSize: fontSize.md, color: colors.textMuted }}>
            {t("claimDetails.baggageLostPirNote")}
          </p>
        )}
        {showAnswerAll && !allQuestionsAnswered(claimType,answers) && (
          <p role="alert" style={{ margin: 0, fontSize: fontSize.md, fontWeight: 600, color: colors.textError }}>
            {t("claimDetails.answerAll")}
          </p>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <PassengerListEditor
          passengers={form.passengers}
          departureDate={form.departureDate}
          primaryClientName={form.clientName}
          onChange={(next) =>
            onChange((prev) => ({
              ...prev,
              passengers: next,
              passengerCount: String(next.length),
            }))
          }
          tr={t}
          rtl={rtl}
          allowAdd={false}
        />
        <p style={{ margin: "8px 0 0", fontSize: fontSize.xs, color: colors.textMuted }}>{t("claimDetails.passengersNote")}</p>
      </div>

      <div style={{ marginTop: 32, display: "flex", justifyContent: "flex-end" }}>
        <Button type="submit" variant="primary" loading={loading} disabled={loading} data-testid="quick-claim-submit">
          {t("claimFlow.next")}
        </Button>
      </div>
    </form>
  );
}
