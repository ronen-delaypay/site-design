"use client";

import {ReimbursementDocumentTiles, receiptMoney, receiptTotals} from "./ReimbursementDocumentTiles";
import {flowTranslator} from "./reimbursement-copy";
import {PassengerReview,passengersReviewed,type ReviewedPassenger} from "./PassengerReview";
import {MissingDetailsDialog,type MissingDetail} from "./MissingDetailsDialog";
import {PassengerReminderDialog} from "./PassengerReminderDialog";
import {passengerText,savePassengerUsers} from "./passenger-users";
import {isValidYmd} from "@/lib/claims/passenger-age";
import { ClaimProgressNote } from "./ClaimProgressNote";
import { OcrReview, REVIEW_COPY, reviewIsComplete, type ReviewValues } from "./OcrReview";
import { OcrReviewContext } from "./OcrReviewContext";
import { IntakeContext } from "./ClaimIntake";
import type { Locale } from "@/lib/i18n/locale";
import { useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { colors, fontSize, radius, spacing } from "@/lib/client/portal-theme";
import { Button } from "@/components/client/Button";
import type { ClaimDocumentsStepProps } from "./ClaimDocumentsStep";
import { ClaimPayoutStep, type PayoutMode } from "@/components/client/ClaimPayoutStep";
import { ClaimStepper } from "@/components/client/ClaimStepper";
import { Icon } from "@/components/client/Icon";
import { POAWidget } from "@/components/client/POAWidget";
import { initialStep, nextStep, previousStep, type ClaimFlowStep } from "@/lib/client/claim-flow";
import { savePayoutDetails } from "@/lib/client/save-payout";
import type { MessageKey } from "@/lib/i18n/dictionary";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** What the customer entered in step 1, shown back to them on the last step. */
export interface ClaimSummary {
  claimType: string;
  clientName: string;
  flight: string;
  route: string;
  date: string;
}

export interface ClaimFlowProps {
  claimType?: string;
  baggageStatus?: string;
  previewEvidence?: boolean;
  detailsRevision?: number;
  onReviewEdits?: (values: ReviewValues | null, passengers: ReviewedPassenger[] | null) => void;
  /** NEXT_PUBLIC_PORTAL_V2. When false this renders `children` and nothing else, exactly as before. */
  enabled: boolean;
  /** Existing-case shortcut directly below the new-claim progress bar. */
  existingCaseAccess?: ReactNode;
  /** Step 1: the claim details form. It creates the case through the existing endpoint. */
  children: ReactNode;
  /** Set once the claim form has created a case; steps 2-5 attach things to it. */
  caseDocId: string | null;
  caseId: string | null;
  getIdToken: () => Promise<string>;
  locale: string;
  t: Translate;
  documents: Omit<ClaimDocumentsStepProps, "locale" | "t">;
  /** Files a bank document (for reading the IBAN) onto the case. */
  onBankDocument: (files: File[]) => void;
  bankDocumentUploaded: boolean;
  summary: ClaimSummary | null;
  /** How many documents the case holds, for the summary. */
  documentCount: number;
  /** Leave the finished flow and start a fresh claim. */
  onFinish: () => void;
}

const titleStyle: CSSProperties = {
  margin: 0,
  textAlign: "center",
  fontSize: fontSize.xxl,
  fontWeight: 700,
  color: colors.text,
};

/** Keep a single wizard instance while the customer moves between stages of the same case. */
export function ClaimFlow(props: ClaimFlowProps) {
  if (!props.enabled) return <>{props.children}</>;
  // A new case (or leaving the flow) remounts the shell, so its step state restarts without any effect.
  return <ClaimFlowShell key={props.caseDocId ?? "new"} {...props} />;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderRadius: radius.lg, background: colors.bg, padding: "14px 20px" }}>
      <span style={{ fontSize: fontSize.md, fontWeight: 500, color: colors.textMuted }}>{label}</span>
      <span style={{ fontSize: fontSize.md, fontWeight: 600, color: colors.text, textAlign: "end", overflowWrap: "anywhere" }}>{value}</span>
    </div>
  );
}

function ClaimFlowShell({ claimType, baggageStatus, previewEvidence = false, detailsRevision = 0, onReviewEdits, children, caseDocId, caseId, getIdToken, locale, t, documents, onBankDocument, bankDocumentUploaded, summary, documentCount, onFinish, existingCaseAccess }: ClaimFlowProps) {
  const evidenceKind = claimType === "reimbursement" ? "receipt"
    : claimType === "baggage" && baggageStatus === "lost" ? "pir" : null;
  const pir = documents.documents?.find(doc => doc.documentKind === "pir" && !doc.pendingReview && !doc.storageMissing);
  const reimbursementReceiptTotals = evidenceKind === "receipt" ? receiptTotals(documents.documents ?? []) : [];
  const evidenceMissing = evidenceKind === "pir" ? !pir : evidenceKind === "receipt" && reimbursementReceiptTotals.length === 0;
  const documentsIncomplete = evidenceMissing || (documents.coverage ? !documents.coverage.complete : false);
  const hasCase = Boolean(caseDocId);
  const intake = useContext(IntakeContext);
  const [step, setStep] = useState<ClaimFlowStep>(() => initialStep(hasCase));
  const [finished, setFinished] = useState(false);
  const [uploadMilestone, setUploadMilestone] = useState(false);
  const flowRef = useRef<HTMLElement | null>(null);
  const pirInput = useRef<HTMLInputElement>(null);
  const advancing = useRef(false);

  const [reviewPassengers,setReviewPassengers]=useState<ReviewedPassenger[]|null>(null);
  const [passengersReady,setPassengersReady]=useState(false);
  const [missing,setMissing]=useState<MissingDetail[]>([]);
  const [reviewing, setReviewing] = useState(hasCase && !previewEvidence);
  const [reviewConfirmed, setReviewConfirmed] = useState(previewEvidence);
  const [visitedEvidence, setVisitedEvidence] = useState(previewEvidence ? evidenceKind : null);
  const visitEvidence = Boolean(evidenceKind && (evidenceMissing || visitedEvidence === evidenceKind));
  const [reviewValues, setReviewValues] = useState<ReviewValues | null>(null);
  const [reviewChecked, setReviewChecked] = useState<boolean | null>(null);
  const [showConfirmationIncomplete,setShowConfirmationIncomplete]=useState(false);
  const [reviewReady, setReviewReady] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [showPassengerReminder, setShowPassengerReminder] = useState(false);
  const [confirmedMilestone, setConfirmedMilestone] = useState(false);
  const reviewText = REVIEW_COPY[locale as Locale] ?? REVIEW_COPY.en;
  const savedRevision = useRef(detailsRevision);
  useEffect(() => {
    if (savedRevision.current === detailsRevision) return;
    savedRevision.current = detailsRevision;
    advancing.current = true;
    setReviewPassengers(null);
    setReviewConfirmed(false);
    setReviewing(true);
    setStep("documents");
    setReviewChecked(null);
    setReviewValues(null);
    setReviewReady(false);
    setPassengersReady(false);
    setConfirmedMilestone(false);
    setShowPassengerReminder(false);
    setShowConfirmationIncomplete(false);
  }, [detailsRevision]);
  useEffect(() => {
    if (!advancing.current) return;
    advancing.current = false;
    const frame = requestAnimationFrame(() => {
      flowRef.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      flowRef.current?.querySelector<HTMLElement>('.dp-claim-progress-note, .dp-ocr-review h3')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [reviewing, step]);
  const effectiveSummary = reviewValues ? { claimType: summary?.claimType ?? "", clientName: reviewValues.clientName, flight: reviewValues.flightNumber, route: `${reviewValues.origin} → ${reviewValues.destination}`, date: reviewValues.departureDate } : summary;

  const [payoutMode, setPayoutMode] = useState<PayoutMode>("type");
  const [iban, setIban] = useState("");
  const [ibanSaved, setIbanSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  const labels: Record<ClaimFlowStep, string> = {
    details: t("claimFlow.step.details"),
    documents: t("claimFlow.step.documents"),
    poa: t("claimFlow.step.poa"),
    payout: t("claimFlow.step.payout"),
    done: t("claimFlow.step.done"),
  };

  function openReview() {
    if (documents.uploading) return;
    advancing.current = true; setReviewing(true); setStep("documents"); setConfirmedMilestone(false); setReviewError(null);setShowConfirmationIncomplete(false);
    setUploadMilestone(documents.receipts.length > 0 || documents.uploadedKinds.size > 0);
  }
  async function confirmReview() {
    if(saving||!reviewReady||!passengersReady||!caseDocId)return;
    const gaps:MissingDetail[]=[];const people=passengerText(locale);
    for(const [key,label]of [['clientName','claim.fullName'],['airline','claim.airline'],['flightNumber','claim.flightNumber'],['departureDate','claim.departureDate'],['origin','claim.origin'],['destination','claim.destination']]as const)if(!reviewValues?.[key]?.trim())gaps.push({label:t(label),selector:`[data-testid="ocr-review-${key}"]`});
    for(const [i,p]of (reviewPassengers??[]).entries()){if(!p.fullName.trim())gaps.push({label:`${people.passenger} ${i+1} — ${people.name}`,selector:`[data-testid="review-passenger-${i}-name"]`});if(!isValidYmd(p.dateOfBirth))gaps.push({label:`${people.passenger} ${i+1} — ${people.dob}`,selector:`[data-testid="review-passenger-${i}-dob"]`});}
    if(gaps.length){setMissing(gaps);return;}
    if(!reviewIsComplete(reviewValues))return;
    if(reviewChecked!==true||!passengersReviewed(reviewPassengers)){setShowConfirmationIncomplete(true);return;}
    setShowPassengerReminder(true);
  }
  async function saveAndContinueFromReminder() {
    if(saving||!reviewReady||!passengersReady||!caseDocId)return;
    setSaving(true); setReviewError(null);
    try {
      const savedPeople=await savePassengerUsers(getIdToken,reviewPassengers!,reviewValues!.clientName,reviewValues!.departureDate);
      const confirmedPeople=savedPeople.map((p:any)=>({...p,checked:true}));setReviewPassengers(confirmedPeople);
      const token = await getIdToken();
      // Mockup-only PATCH: the isolated fixture boundary stores these reviewed values.
      const response = await fetch(`/api/client/cases/${caseDocId}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...reviewValues, reviewedPassengers:confirmedPeople, previewOcrReview: true }) });
      const body = await response.json(); if (!response.ok || !body.ok) throw new Error("review_save_failed");
      advancing.current = true; setReviewConfirmed(true); setReviewing(false); setUploadMilestone(false); setConfirmedMilestone(true); setShowPassengerReminder(false);
      onReviewEdits?.(reviewValues, confirmedPeople);
      setVisitedEvidence(visitEvidence ? evidenceKind : null);
      setStep(visitEvidence ? "documents" : "poa");
    } catch { setReviewError(({en:"We couldn’t save your confirmed details. Try again.",he:"לא הצלחנו לשמור את הפרטים שאישרתם. נסו שוב.",ru:"Не удалось сохранить подтверждённые данные. Повторите попытку.",ar:"تعذّر حفظ البيانات المؤكدة. حاولوا مجددًا."} as Record<string,string>)[locale]??"We couldn’t save your confirmed details. Try again."); } finally { setSaving(false); }
  }

  async function continueFromPayout() {
    if (saving) return;
    setPayoutError(null);
    // Only typing an IBAN needs saving; the other two options move on (the document is filed as it is
    // picked, and "later" is allowed).
    if (payoutMode === "type" && iban.trim()) {
      setSaving(true);
      const result = await savePayoutDetails(getIdToken, { iban, holderName: "" });
      setSaving(false);
      if (!result.ok) {
        setPayoutError(result.message ?? t("claimFlow.payout.error"));
        return;
      }
      setIbanSaved(true);
    }
    setStep("done");
  }

  if (finished && caseDocId) {
    return (
      <section style={{ marginTop: 32 }} data-testid="claim-flow-done">
        <div style={{ borderRadius: radius.xl, background: colors.white, padding: "56px 24px", textAlign: "center" }}>
          <span
            aria-hidden="true"
            style={{ display: "inline-flex", width: 64, height: 64, alignItems: "center", justifyContent: "center", borderRadius: radius.full, background: colors.accent, color: colors.text }}
          >
            <Icon name="CheckCircle2" size={32} />
          </span>
          <h2 style={{ margin: "24px 0 0", fontSize: fontSize.h1, fontWeight: 700, color: colors.text }}>{t("claimFlow.success.title")}</h2>
          <p style={{ margin: "12px auto 0", maxWidth: 520, fontSize: fontSize.lg, lineHeight: 1.6, color: colors.textMuted }}>
            {documentsIncomplete ? flowTranslator(locale)("claimFlow.evidence.draft") : t("claimFlow.success.body", { caseId: caseId ?? "" })}
          </p>
          <div style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            <Button type="button" onClick={() => setFinished(false)} data-testid="claim-finished-back">{t("claimFlow.back")}</Button>
            <Button type="button" variant="primary" onClick={onFinish} data-testid="claim-flow-another">
              {t("claimFlow.success.back")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const showNav = hasCase && step !== "details";
  const evidenceStepActive = step === "documents" && visitEvidence;
  const canGoBack = reviewing ? Boolean(onReviewEdits) : step !== "details";
  const onBack = () => {
    setUploadMilestone(false);
    setConfirmedMilestone(false);
    if (reviewing) {
      onReviewEdits?.(reviewValues, reviewPassengers);
      advancing.current = true;
      setReviewing(false);
      setStep("details");
    } else if (step === "documents" || (step === "poa" && !visitEvidence)) {
      openReview();
    } else {
      setStep(previousStep(step));
    }
  };
  const skipping = !reviewing && step === "documents" && evidenceMissing;
  const onPrimary = () => {
    if (reviewing) { void confirmReview(); return; }
    if (step === "documents" && !reviewConfirmed) { openReview(); return; }
    if (step === "payout") void continueFromPayout();
    else if (step === "done") setFinished(true);
    else { setUploadMilestone(false); setConfirmedMilestone(false); setStep(nextStep(step)); }
  };
  const primaryLabel = reviewing
    ? evidenceKind === "pir" && evidenceMissing
      ? flowTranslator(locale)("claimFlow.continueToPir")
      : reviewText.next : step === "done" ? t(documentsIncomplete ? "claimFlow.docs.saveDraft" : "claimFlow.finish") : skipping ? t("claimFlow.skip") : t("claimFlow.next");

  return (
    <OcrReviewContext.Provider value={{ reviewing, confirmed: reviewConfirmed, showEvidence: visitEvidence, evidencePending: evidenceStepActive && evidenceMissing, label: reviewText.label, onOpen: openReview }}>
    <section ref={flowRef} style={{ marginTop: 32, scrollMarginTop: 24 }} data-testid="claim-flow">
      <div style={{ borderRadius: radius.xl, background: colors.accent, padding: "20px 24px", textAlign: "center" }}>
        <h2 style={{ margin: 0, fontSize: fontSize.h1, fontWeight: 700, color: colors.text }}>{t("claimFlow.title")}</h2>
      </div>

      <div style={{ marginTop: 20 }}>
        <ClaimStepper
          labels={labels}
          current={step}
          hasCase={hasCase}
          onSelect={(next) => { if (["poa", "payout", "done"].includes(next) && !reviewConfirmed) { openReview(); return; } setReviewing(false); setUploadMilestone(false); setConfirmedMilestone(false); setStep(next); }}
          stepOfLabel={(n, total) => t("claimFlow.stepOf", { n, total })}
          ariaLabel={t("claimFlow.stepsLabel")}
        />
      </div>

      {step === "details" && existingCaseAccess}
      {uploadMilestone && reviewing && <ClaimProgressNote locale={locale} milestone="upload" />}
      {confirmedMilestone && !reviewing && (step === "documents" || step === "poa") && <ClaimProgressNote locale={locale} milestone="confirmed" evidenceNext={step === "documents" && evidenceMissing} />}

      <MissingDetailsDialog items={missing} locale={locale} onClose={()=>setMissing([])}/>
      <PassengerReminderDialog open={showPassengerReminder} locale={locale} busy={saving} evidenceNext={visitEvidence} confirmLabel={evidenceKind === "pir" && evidenceMissing ? flowTranslator(locale)("claimFlow.continueToPir") : undefined} onCancel={()=>setShowPassengerReminder(false)} onConfirm={()=>void saveAndContinueFromReminder()} />
      <div className="dp-flow-stage-panel" style={{ marginTop: 32, borderRadius: radius.xl, background: colors.white, padding: 28 }}>
        {step === "details" && intake?.stage !== "scan" && (
          <>
            {intake?.openScan && <Button type="button" data-testid="claim-details-back" style={{ marginBottom: 18 }} onClick={intake.openScan}>{t("claimFlow.back")}</Button>}
            {children}
          </>
        )}

        {hasCase && step === "documents" && !reviewing && reviewConfirmed && (
          evidenceKind === "receipt" ? (
            <ReimbursementDocumentTiles locale={locale} {...documents} t={flowTranslator(locale)} />
          ) : evidenceKind === "pir" ? (
            <section data-testid="pir-documents" style={{ display: "grid", justifyItems: "center", gap: spacing.md, textAlign: "center", maxWidth: 560, margin: "0 auto" }}>
              <h3 style={titleStyle}>{flowTranslator(locale)("reimb.docs.pir")}</h3>
              <p style={{ margin: 0, color: colors.textMuted }}>{flowTranslator(locale)("reimb.docs.pirInfo")}</p>
              {pir ? (
                <p role="status" style={{ margin: 0, color: colors.textSuccess }}><span aria-hidden="true">✓ </span>{pir.fileName}</p>
              ) : null}
                <>
                  <input ref={pirInput} type="file" hidden accept="image/*,application/pdf" data-testid="pir-upload-input"
                    disabled={documents.uploading} onChange={event => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (file) documents.onPick("pir", [file]);
                    }} />
                  <Button type="button" variant="secondary" data-testid="pir-upload" disabled={documents.uploading}
                    onClick={() => pirInput.current?.click()}>
                    <Icon name="Upload" size={18} /> {documents.uploading ? t("cases.uploading") : flowTranslator(locale)(pir ? "reimb.docs.replacePir" : "reimb.docs.uploadPir")}
                  </Button>
                </>
            </section>
          ) : null
        )}

        {reviewing && caseDocId && <OcrReview caseDocId={caseDocId} getIdToken={getIdToken} locale={locale} values={reviewValues}
          onChange={(values) => { setReviewValues(values); setReviewChecked(null); setReviewConfirmed(false);setShowConfirmationIncomplete(false); }} checked={reviewChecked} onChecked={value=>{setReviewChecked(value);setReviewConfirmed(false);setShowConfirmationIncomplete(value!==true);}}
          onReady={setReviewReady} saving={saving} saveError={reviewError} showIncomplete={showConfirmationIncomplete} />}
        {reviewing&&caseDocId&&<PassengerReview caseDocId={caseDocId} getIdToken={getIdToken} locale={locale} items={reviewPassengers} onChange={(list, change) => {
            setReviewPassengers(list);
            if (change === "details") setReviewChecked(null);
            setReviewConfirmed(false);
            setShowConfirmationIncomplete(false);
          }} onReady={setPassengersReady} saving={saving} showIncomplete={showConfirmationIncomplete}/>}

        {hasCase && step === "poa" && caseDocId && (
          <div>
            <h3 style={titleStyle}>{t("claimFlow.poa.title")}</h3>
            <p style={{ margin: `${spacing.sm}px 0 0`, textAlign: "center", color: colors.textMuted, fontSize: fontSize.lg, fontWeight: 500 }}>
              {t("claimFlow.poa.subtitle", { caseId: caseId ?? "" })}
            </p>
            {/* The signing itself is EasyDo's; this frame is the portal's wrapper around it. */}
            <div className="dp-poa-frame" style={{ marginTop: spacing.xl, overflow: "hidden", borderRadius: radius.lg, border: `1px solid ${colors.border}` }}>
              <div className="dp-poa-frame-header" style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${colors.border}`, background: colors.bg, padding: "10px 16px" }}>
                <Icon name="Lock" size={14} />
                <span style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textMuted }}>{t("claimFlow.poa.frame")}</span>
              </div>
              <div className="dp-poa-frame-body" style={{ background: colors.white, padding: 20 }}>
                <POAWidget caseId={caseDocId} getIdToken={getIdToken} locale={locale} t={t} />
              </div>
            </div>
          </div>
        )}

        {hasCase && step === "payout" && (
          <div>
            <h3 style={titleStyle}>{t("claimFlow.step.payout")}</h3>
            <div style={{ marginTop: spacing.sm }}>
              <ClaimPayoutStep
                mode={payoutMode}
                onModeChange={(mode) => {
                  setPayoutMode(mode);
                  setPayoutError(null);
                }}
                iban={iban}
                onIbanChange={setIban}
                onBankDocument={onBankDocument}
                bankDocumentUploaded={bankDocumentUploaded}
                uploading={documents.uploading}
                error={payoutError}
                saving={saving}
                t={t}
              />
            </div>
          </div>
        )}

        {hasCase && step === "done" && (
          <div data-testid="claim-flow-summary">
            {documentsIncomplete && <p role="status">{flowTranslator(locale)("claimFlow.evidence.draft")}</p>}
            <h3 style={titleStyle}>{t("claimFlow.summary.title")}</h3>
            <div style={{ marginTop: spacing.xl, display: "grid", gap: spacing.md }}>
              <SummaryRow label={t("claimFlow.summary.case")} value={caseId ?? "—"} />
              {effectiveSummary && (
                <>
                  <SummaryRow label={t("claimFlow.summary.type")} value={effectiveSummary.claimType || "—"} />
                  <SummaryRow label={t("claimFlow.summary.name")} value={effectiveSummary.clientName || "—"} />
                  <SummaryRow label={t("claimFlow.summary.flight")} value={effectiveSummary.flight || "—"} />
                  <SummaryRow label={t("claimFlow.summary.route")} value={effectiveSummary.route || "—"} />
                  <SummaryRow label={t("claimFlow.summary.date")} value={effectiveSummary.date || "—"} />
                </>
              )}
              <SummaryRow label={t("claimFlow.summary.documents")} value={String(documentCount)} />
              {claimType === "reimbursement" && reimbursementReceiptTotals.map(item => <SummaryRow key={item.currency} label={`${flowTranslator(locale)("reimb.docs.receiptSummary")} · ${item.currency}`} value={receiptMoney(item.amount, item.currency, locale)} />)}
              <SummaryRow
                label={t("claimFlow.summary.iban")}
                value={ibanSaved || bankDocumentUploaded ? "✓" : t("claimFlow.summary.ibanLater")}
              />
            </div>
          </div>
        )}

        {showNav && (
          <div className="dp-flow-actions" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: spacing.md, marginTop: 32 }}>
            {canGoBack ? (
              <button
                type="button"
                onClick={onBack}
                disabled={saving || documents.uploading}
                data-testid="claim-flow-back"
                style={{ border: 0, background: "transparent", padding: "12px 20px", borderRadius: radius.md, color: colors.textMuted, fontSize: fontSize.md, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              >
                {t("claimFlow.back")}
              </button>
            ) : (
              <span />
            )}
            <Button type="button" variant={skipping ? "secondary" : "primary"} onClick={onPrimary} loading={saving} disabled={saving || documents.uploading || (reviewing && (!reviewReady || !passengersReady))} data-testid="claim-flow-next">
              {primaryLabel}
            </Button>
          </div>
        )}
      </div>
    </section>
    </OcrReviewContext.Provider>
  );
}


