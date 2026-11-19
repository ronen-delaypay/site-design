import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IntakeContext, COPY } from "./ClaimIntake";
import { useLocale } from "@/hooks/useLocale";
import { translatorFor } from "@/lib/i18n";
import type { ClaimDocumentKind } from "./ClaimDocumentsStep";
import type { PassengerDocument } from "@/lib/claims/passenger-documents";
import { ClaimFlow } from "./ClaimFlow";
export default function UploadProgressPreview() {
 const [locale] = useLocale();
 const search = useSearchParams();
 const previewRoot = useRef<HTMLElement | null>(null);
 const [receipts, setReceipts] = useState(() => search.get("uploads") === "empty" ? [] : [{ id: "sample-passport", fileName: "passport.pdf", kind: "passport" }, { id: "sample-boarding", fileName: "boarding-pass.pdf", kind: "boarding_pass" }]);
 const reimbursement = search.get("claim") === "reimbursement";
 const baggageLoss = search.get("claim") === "baggage-loss";
 const [receiptDocuments, setReceiptDocuments] = useState<PassengerDocument[]>(() => reimbursement ? [
  { id: "sample-hotel", fileName: "hotel-EUR-74.50.pdf", documentKind: "receipt", receiptOcrOk: true, receiptCurrency: "EUR", receiptAmount: 74.5 },
  { id: "sample-taxi", fileName: "taxi-ILS-112.00.pdf", documentKind: "receipt", receiptOcrOk: true, receiptCurrency: "ILS", receiptAmount: 112 },
  { id: "sample-unreadable", fileName: "unreadable-receipt.pdf", documentKind: "receipt", receiptOcrOk: false },
 ] as PassengerDocument[] : []);
 const [uploadingKind, setUploadingKind] = useState<ClaimDocumentKind | null>(null);
 const [uploadError, setUploadError] = useState(false);
 async function uploadEvidence(kind: ClaimDocumentKind, files: File[], replacesReceiptId?: string) {
  setUploadingKind(kind);
  setUploadError(false);
  try {
   const form = new FormData();
   form.set("documentKind", kind);
   if (replacesReceiptId) form.set("replacesReceiptId", replacesReceiptId);
   for (const file of files) form.append("files", file);
   const response = await fetch("/api/client/cases/sample-case/documents", { method: "POST", body: form });
   const result = await response.json();
   if (!response.ok || !result.ok) throw Error("preview_evidence_upload_failed");
   setReceiptDocuments(current => Array.from(new Map([...current, ...result.uploaded].map(doc => [doc.id, doc])).values()));
  } catch {
   setUploadError(true);
  } finally {
   setUploadingKind(null);
  }
 }
 useEffect(() => {
  if (reimbursement) void fetch("/api/client/cases/sample-case/preview-receipt-samples", { method: "POST",
   headers: { "Content-Type": "application/json" }, body: JSON.stringify(receiptDocuments) });
 }, [reimbursement]);
 return <IntakeContext.Provider value={{ stage: "details", scanLabel: COPY[locale].scan }}><main ref={previewRoot} style={{ maxWidth: 1160, margin: "0 auto", padding: "24px" }}>
  <ClaimFlow enabled caseDocId="sample-case" caseId="DP-24081" locale={locale} t={translatorFor(locale)}
    previewEvidence={reimbursement || baggageLoss} claimType={reimbursement ? "reimbursement" : baggageLoss ? "baggage" : undefined} baggageStatus={baggageLoss ? "lost" : undefined} getIdToken={async () => "preview-token"} summary={null} documentCount={reimbursement || baggageLoss ? receiptDocuments.length : receipts.length} bankDocumentUploaded={false}
    onBankDocument={() => {}} onFinish={() => {}}
    documents={{ onPick: (kind, files, _passengerIds, replacesReceiptId) => reimbursement || baggageLoss ? void uploadEvidence(kind, files, replacesReceiptId) : setReceipts(current => [...current, ...files.map(file => ({ id: file.name, fileName: file.name, kind }))]), uploadedKinds: new Set(receipts.map(receipt => receipt.kind)), uploadingKind, uploading: uploadingKind !== null, receipts, documents: receiptDocuments, warnings: [], onAcknowledgeWarning: () => {} }}>
    <span />
  </ClaimFlow>
  {uploadError && <p role="alert">{translatorFor(locale)("portal.uploadError")}</p>}
 </main></IntakeContext.Provider>;
}
