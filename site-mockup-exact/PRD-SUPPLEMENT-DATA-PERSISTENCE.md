# PRD supplement: Firebase data persistence across the claim funnel

Version: 1.2 (PRD v2.4)  
Date: 19 November 2026  
Status: requirement supplement for implementation planning; no production code changed

## Purpose

Define the durable data flow required by the approved scan-first customer funnel. Every stage must retain a stable `caseId`, keep all OCR and passenger data associated with that case, record the chosen claim type and its answers when the customer saves claim details, and reflect verified POA completion in Firebase.

This supplement preserves existing customer text, business rules, eligibility calculations, authentication policy and downstream integrations. It does not authorize production deployment or real customer-data migration.

## Current implementation verified in the repository

- The client quick-claim endpoint creates a Firestore document in `cases` and assigns a `caseId`; it already writes `passengers`, derives `passengerCount` from the passenger array when supplied, and stores flight fields, `easydoEventType`, `delayHours`, `cancellationNoticeDays`, `reroutingWithinLimits`, booking/ticket references and notes.
- The authenticated case document-upload endpoint requires an existing case ID. It writes file bytes to private Firebase Storage under a path containing the case document ID, then appends document metadata to `cases/{caseDocId}.customerDocuments` transactionally. It records document kind, passenger IDs, content hash, storage path, uploader and upload time. It runs `ensureCaseOcr` after saving and returns an OCR outcome; OCR may continue in the background if its request budget expires.
- POA completion is currently represented by authoritative signature evidence including `powerOfAttorneySignedAt` and signer-specific passenger POA state. Signature stamps are written by trusted provider/Zoho confirmation paths; an unsigned link or client click is not sufficient.
- The approved scan-first design now presents documents before claim details. Therefore the current “create case first, then upload” API ordering cannot be copied literally. The intake draft contract below bridges the order without treating a draft as a submitted claim.

Repository reference points for implementation review: `src/app/api/client/quick-claim/route.ts`, `src/app/api/client/cases/[id]/documents/route.ts`, `src/lib/claims/customer-document-upload.ts`, `src/app/api/client/cases/[id]/poa/route.ts`, and `src/lib/client/claim-details.ts`.

## Required lifecycle and identifiers

1. **Start intake:** the authenticated server allocates one opaque, stable `caseId` before the first document is uploaded and creates `claimIntakeDrafts/{caseId}` (or the team’s equivalent Firebase draft location). Store owner UID, tenant, locale, lifecycle status `intake_draft`, schema version and server timestamps. This is intake state, not a submitted case. It must not trigger claim submission, airline communication, payments, conversion reporting or other effects gated on an accepted claim.
2. **Add passenger:** assign a stable `passengerId` before the passenger’s first upload. Save that passenger record under the same draft and maintain `passengerCount == passengers.length`. The primary passenger is part of the same roster. Additional passengers never create separate claim IDs.
3. **Upload and scan:** each Passport, Boarding pass and Booking confirmation upload must include the authenticated `caseId`, `passengerId` (or a validated shared-document coverage list), document kind and idempotency key. Save bytes to private Storage and metadata/OCR records to Firebase with the same IDs. Saving a scan result means the server confirms both document metadata and the OCR result/status are durably written. OCR timeout/failure remains visible as pending/failed and must not appear as confirmed saved OCR.
4. **Review and edit OCR:** persist original extraction separately from customer corrections. Store per-field provenance (`ocr`, `customer`, or trusted system), confidence where supplied, and timestamps/revision. Customer edits are retained across retries and rescans; a rescan does not silently overwrite a manual correction or confirmed identity.
5. **Save claim details:** on the customer’s Save action, validate the current draft and transactionally create/promote `cases/{caseDocId}` using the stable case ID and attach all saved passengers, document records, OCR results/corrections and claim details. If the existing opaque Firestore document key differs from the public `caseId`, retain an explicit immutable mapping and keep the public `caseId` on every linked record. Promotion is idempotent. Set lifecycle to the existing case state only after the normal validation gates pass; draft save alone is not airline submission.
6. **Sign POA:** only a trusted signature-provider callback or an existing server-side verified reconciliation path can mark a signer signed. Persist signer-specific state and update the case aggregate transactionally. Preserve existing signature timestamp, provider reference, webhook idempotency and audit trail.

## Firebase record contract

Names below describe the logical contract. Reuse existing fields and collections where possible; avoid a parallel OCR schema. If the existing `cases.customerDocuments[]` and `cases.ocr.documents[]` arrays are retained, ensure every row includes the explicit IDs shown here and enforce embedded-document size limits. Use a child collection if the established per-case document size budget requires it.

### Intake draft / case record

- `caseId`: stable external/public ID generated once on intake start.
- `lifecycleStage`: `intake_draft`, `claim_details_saved`, then existing later case states. Do not replace existing submission/status enums without mapping.
- `caseType`: canonical value `delayed | cancelled | denied_boarding | baggage | reimbursement` when claim details are saved. This is the product case type; preserve `easydoEventType`/verification fields for their existing downstream meaning.
- `claimParameters`: validated typed representation of all answers for the selected case type, including the selected delay range, cancellation notice and alternative rerouting, denied-boarding reason, baggage status and applicable duration, and reimbursement cause and applicable answers. Keep exact delay hours separately when they are known. Store null/omitted values intentionally and do not carry irrelevant stale answers after type change.
- Existing normalized case fields: flight number, airline, departure/flight date, origin/destination, booking reference, ticket number, notes/customer incident summary, contact and consent fields as required by existing contracts.
- `passengers`: stable passenger IDs and per-person fields; `passengerCount`: server-derived from the roster on every write. Invariant: `passengerCount === passengers.length`. Preserve adult/child/infant classification and guardian attestations.
- `createdAt`, `updatedAt`, `lastActivityAt`, `schemaVersion`, owner/tenant fields, and a server-side revision/version for conflict detection.

### Document and OCR records

For every uploaded document and each OCR attempt/result, retain:

- `caseId`, `passengerId` or validated `coveredPassengerIds`, stable `documentId`, and `documentKind`.
- Private Firebase Storage path/reference, safe file name/type/size/hash, uploader identity and server upload time. Never expose a permanent public URL for identity documents.
- `ocr.status`: queued/processing/succeeded/partial/failed; `ocrAttemptId`, provider/run timestamp, retry count and failure code safe for the client.
- `ocr.extractedFields`: extracted field values with confidence/provenance where provided. Preserve the raw OCR extraction under access control for audit; keep customer-corrected values separate.
- `reviewedFields` or equivalent field map: corrected/confirmed value, editor, timestamp, and revision. A field can be missing; do not fabricate a value.
- `saveState`: committed only after Firebase metadata and the relevant OCR result/status commit; use an idempotency key so retry does not duplicate document or OCR rows.

Passport, boarding pass and booking-confirmation uploads must all follow the same scan-result reveal/save rule, regardless of upload order. For booking confirmations, the server validates and saves automatic OCR name matches against the case roster. Where identity is ambiguous, retain the scan for customer review and validate any manual assignment against that roster.

### POA signature state

- Keep the existing trusted `powerOfAttorneySignedAt` timestamp and provider/source metadata.
- Add case-level Boolean `poaSigned`, initialized `false` and updated by the server only. For multi-passenger cases it is true only if every passenger required to sign has verified signature evidence. Minors follow existing guardian rules.
- Keep individual `passengerPoas`/signer entries with stable `passengerId`, Boolean `isSigned`, verified timestamp and provider reference. The case flag is the aggregate; it must not mask an unsigned adult.
- Replacing/revoking a signed POA or removing a required signer must recalculate the aggregate. Do not infer signature from POA URL/file presence alone.

## Write and failure rules

- Use authenticated server routes for all Firebase writes; never trust client-supplied owner IDs, `caseId` ownership, passenger counts, signature flags, provider timestamps or final readiness.
- Keep document bytes in private Storage and metadata in Firestore. Use a transaction/batch for roster count, draft promotion and case aggregate changes where supported; do not put Storage/network/OCR side effects inside a Firestore transaction callback that can retry.
- Use stable IDs and idempotency keys for intake creation, passenger creation, document upload, OCR attempt, claim-details save and provider webhook. Replays must return the existing committed result.
- Keep original OCR results immutable; append attempts or version them. A failed attempt must not erase a successful prior result. Explicit Upload again/replacement follows existing document replacement and audit policy.
- Do not show the customer a success/confirmed state until Firebase persistence is acknowledged. On partial failure, show the specific missing/pending item and allow safe retry without duplicating the passenger, case or document.
- Enforce document retention/deletion, PII access controls, signed-link expiry and existing audit logging. Do not mirror OCR PII into analytics or logs.

## Acceptance criteria

1. Before the first passport upload, an authenticated stable case ID exists. After a successful upload/scan save, Firebase can query the case ID and retrieve that document’s storage metadata, OCR attempt/result and passenger ownership.
2. Passport, boarding pass and booking confirmation produce the same persisted result behavior in all six possible upload orders. If OCR fails or times out, the record remains correctly pending/failed and the UI does not claim it was saved as successful OCR.
3. A second passenger gets a distinct stable passenger ID under the same case ID; after add/save, roster length and `passengerCount` agree. No second claim case is created.
4. A claim-details Save writes canonical `caseType` and every applicable answer/normalized parameter to the same case ID. A type change cannot retain hidden answers from the previous type.
5. Refresh/retry during upload, OCR save, claim save and draft promotion produces no duplicate case, passenger or document and never loses earlier successful records.
6. A client cannot set `poaSigned=true`. Verified signatures update signer records and the case aggregate; one unsigned required adult keeps the case Boolean false. Replayed provider callbacks are idempotent.
7. Draft creation and OCR save do not trigger claim-submission effects. The existing submit/eligibility/consent gates remain authoritative after details are saved.
8. English, Hebrew, Russian and Arabic states remain available; storage records remain locale-independent and IDs/canonical enums remain stable.

## Implementation questions to settle during code review

- Reuse existing public `caseId` and Firestore `cases` document ID where feasible; otherwise document and test the immutable mapping. The draft must not mint a new public case number on every refresh.
- Confirm the existing EasyDo/Zoho POA callback paths that are authoritative for every signer, then update the Boolean in the same trusted reconciliation transaction as signature state.
- Confirm whether the complete OCR extraction currently persists into `cases.ocr.documents[]` before the upload API returns, or may finish asynchronously. The UI must distinguish committed upload metadata from committed OCR results in either case.
- Review Firestore document-size constraints before keeping full OCR records embedded; move to a case-scoped subcollection if needed without weakening authorization/queryability.

## Booking fallback and receipt OCR

When a boarding pass is missing, use the booking confirmation’s extracted flight details and apply the existing evidence rules. Associate the booking with all unambiguous OCR-named passengers by stable ID under the same case. Keep unmatched names pending, preserve customer corrections and route unresolved duplicate identities for review. Treat a count as metadata only.

Store each receipt’s document and case IDs, trusted OCR outcome, detected amount and ISO currency, provenance and existing revision metadata. A positive result with a valid positive amount and currency qualifies for the checkmark and totals. A negative result prompts a rescan, while pending or missing OCR stays unverified. Replace the active receipt revision after a successful upload and preserve its history. Group accepted totals by original currency and use the same derived values on the receipt screen and final reimbursement checkout.

Keep primary POA status tied to server verification. The primary signer has one signing action, “Read and sign now.” Additional adult passenger signing retains its own controls.

## Confirmation, edits and follow-up evidence

- Keep the shared flight confirmation and each passenger’s confirmation as independent values. A selection for one record must preserve selections for the others. An incomplete draft can represent Yes, No, and unanswered. A committed review must include Yes for the shared flight details and every current passenger and be tied to the revisions they reviewed.
- A shared flight edit clears its confirmation. Editing a passenger’s identity details clears that passenger’s confirmation and the shared confirmation while retaining confirmations for untouched passengers. Reopening a prior stage preserves entered details and documents. Saving claim details again updates the same case and returns to verification. Reject stale review writes if the underlying data changed before confirmation committed.
- After verification, request a PIR only for a baggage claim marked Lost with no accepted PIR. Lost clears any duration answer. A PIR replacement keeps the same case linkage and an auditable revision history. Reimbursement requests receipts only. For reimbursement due to baggage loss, ask duration only if the bag was returned. Record the current evidence state and retain draft status when required evidence is missing.
- Tie signature verification to the signer and to the version of the details used to generate the document. If those details change, reconcile the current signature state and request a new signature where needed. Retain historical signed documents and their verification records.
- Test both Yes/No selection orders with two or more passengers, edits that invalidate only the affected acknowledgments, verification-save retries, and a backward edit that preserves the original case ID and uploaded evidence.
