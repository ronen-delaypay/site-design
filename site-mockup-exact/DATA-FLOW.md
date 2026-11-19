# Funnel data flow — current system and required behavior

Date: 19 November 2026  
Related: `PRD.md` v2.4 and `PRD-SUPPLEMENT-DATA-PERSISTENCE.md`

## Identity chain

`caseId` is created once at intake start → `passengerId` is assigned for each passenger → every document and OCR attempt carries both IDs → customer claim-detail Save promotes the same intake to the case record → trusted signature confirmation updates signer status and the case-level POA aggregate.

```text
Firebase intake draft (caseId)
  ├── passenger roster (passengerId, authoritative passengerCount)
  │    ├── passport file + OCR attempts/results
  │    ├── boarding-pass file + OCR attempts/results
  │    └── booking-confirmation file + OCR attempts/results
  └── Save claim details
       └── cases/{caseDocId} (same immutable caseId, caseType + parameters)
            ├── confirm intake evidence, then collect missing PIR or receipts if applicable
            └── POA signatures per required adult
                 └── poaSigned = all required signatures verified
```

## Stage-by-stage mapping

| Funnel stage / customer action | Current production behavior verified | Required Firebase write / invariant | Customer success state |
| --- | --- | --- | --- |
| Start claim | Current quick-claim route creates the `cases` document when claim details are submitted; it also reserves dedup/index records and starts downstream post-creation work. | New scan-first flow allocates one stable `caseId` and writes a minimal `claimIntakeDrafts/{caseId}` record with owner/tenant, `lifecycleStage:intake_draft`, timestamps and revision. Do not run claim-submission side effects from this draft. | Draft ID exists; no text should say the claim was submitted. |
| Save passenger | Current quick-claim maps submitted passengers into `CasePassengerDetail[]`; `passengerCount` is derived from array length when the array is supplied. | Save each stable passenger ID under the same case ID. Derive `passengerCount` on the server; invariant `passengerCount === passengers.length`. Preserve DOB, age-at-flight type and guardian attestation. | Passenger appears in the confirmed Passenger’s list only after the write commits. |
| Upload each identity/flight document | Existing document API takes a case document ID, verifies ownership and passenger assignment, writes private bytes to Firebase Storage using a path containing that ID, and transactionally appends metadata to `customerDocuments[]`. | Bind each document and OCR attempt/result to immutable `caseId`, `passengerId` or explicit coverage list, document kind, stable document ID and idempotency key. Persist all three kinds identically, including raw extraction, confidence/status, corrected values and timestamps. | Show scan results only when their OCR state is known. Mark OCR as saved only after the corresponding Firebase record commit; timeout/failure stays pending/failed. |
| Customer reviews/edits OCR | Existing server calls `ensureCaseOcr` after upload; it may continue in the background when the wait budget expires. Existing API response includes upload outcome and an OCR outcome/status. | Keep OCR extraction distinct from user corrections. Use a revision so upload again/retry cannot overwrite an edited or confirmed value silently. | Editable dropdown displays persisted values, with a clear missing/pending state. |
| Save claim details | Current quick-claim persists `easydoEventType`, flight fields, `delayHours`, `cancellationNoticeDays`, `reroutingWithinLimits`, `passengerCount`, passengers, booking/ticket reference and notes. The UI claim detail answer map is in `src/lib/client/claim-details.ts`. | Save canonical `caseType` and all applicable source answers/normalized parameters against the same case ID; transactionally promote/link draft and saved documents. Preserve existing downstream canonical fields; no stale answers from other case types. | Continue only after Firebase confirms the claim-detail write and draft-to-case link. |
| POA signed | Current system uses trusted POA timestamps and separate passenger/signature state. POA URL/file presence alone is not verified signature proof. | Preserve `powerOfAttorneySignedAt`; add server-owned Boolean `poaSigned`. Keep signer-level Boolean and set case aggregate true only after every required adult has verified signature evidence. | The portal reflects pending/signed from server state. Client cannot self-assert completion. |
| Receipt/reimbursement / remaining stages | Existing reimbursement and document logic remains authoritative; receipt evidence is an Upload flow per approved design. | Keep records under the same case ID, retain existing cause/receipt/payment contracts, and avoid duplicated claim creation. | Existing messaging and validations remain unchanged. |

## Canonical claim parameters to record on Save

Persist canonical `caseType` plus the chosen question values and established normalized fields. The options currently represented by `CLAIM_QUESTIONS` are:

- `delayed`: `delayBucket` (`threeToFive`, `fiveToEight`, `overEight`). Keep exact `delayHours` from existing records or an authoritative source, and handle eligibility decisions that need a precise duration explicitly.
- `cancelled`: `noticeBucket` (`late`, `medium`, `early`) plus `alternativeOffered`; preserve normalized `cancellationNoticeDays` and `reroutingWithinLimits`.
- `denied_boarding`: `deniedReason` (`overbooking`, `voluntary`).
- `baggage`: `baggageStatus` (`lost`, `delayed`, `damaged`) and, when duration applies, `baggageDays` (`short`, `medium`, `long`). Selecting `lost` clears any stale duration and leads to a missing PIR request after verification.

- `reimbursement`: persist the chosen expense cause and its applicable parameters. Baggage-loss duration applies only after the customer confirms the bag was returned. Keep the source answer and any actual measured delay separate.

Also preserve the established flight/contact and evidence fields appropriate to the selected flow: `flightNumber`, `airline`, `departureDate`/`flightDate`, `origin`, `destination`, `bookingReference`, `ticketNumber`, `notes`/customer incident summary, passengers/count and existing contact/consent fields. `easydoEventType` remains in place for compatibility; do not silently redefine it as the new product `caseType`.

## Current gap and integration sequence

The redesigned flow uploads identity documents before claim details, while production’s existing upload endpoint requires an existing case. Implement a small authenticated draft intake API or equivalent server-side adapter that allocates a stable ID at flow start. It must preserve current anti-duplicate, phone verification, consent, tenant and case-number rules when promotion occurs. On Save, reuse the same ID in the existing claim creation/dedup transaction; do not mint a new case ID and re-upload files.

Before coding, confirm the existing public `caseId` vs Firestore document key mapping. Current APIs often name the Firestore key `caseDocId` and expose the public `caseId`. Persist both where distinct and never confuse them. Store document metadata in Firestore and bytes in private Firebase Storage. Do not run OCR network calls or Storage writes inside Firestore transaction callbacks.

## Observability / verification checklist

- Trace one test intake ID through Firebase draft, passenger roster, three document kinds, all OCR attempts, claim detail Save/promotion, and POA signature callback.
- Verify every record resolves to the same case ID and the correct passenger ID; verify multi-passenger coverage explicitly.
- Verify `passengerCount` is recomputed server-side and always matches the roster.
- Verify `caseType` and conditional parameter payloads for all five case types; verify type switching clears irrelevant answers.
- Verify OCR timeout, partial extraction, provider failure, retry, repeated Save, page refresh and overlapping uploads.
- Verify draft-only actions do not start claim submission or outbound communications.
- Verify one adult signature, all adult signatures, a minor with guardian flow, provider callback replay and a failed/unverified signature.
- Check role authorization, tenant scope, retention, document size, PII logging and status cache invalidation.

The runnable preview uses local fixtures. Its browser checks cover navigation and the simulated data contract. The Firebase checks above are production implementation acceptance criteria.

## Booking confirmation and reimbursement checkout

1. Save booking OCR under the intake case ID. When a boarding pass is unavailable, use booking flight fields and evaluate the booking as flight evidence under existing rules. Persist clear OCR name matches as shared passenger coverage. Keep ambiguous matches for review and carry document/passenger associations into the promoted case.
2. After intake verification, offer a missing PIR for baggage loss or missing receipts for reimbursement. Other claims and cases with the applicable evidence skip this upload stage. Store each receipt scan outcome under its receipt document ID. Show a check and original-currency amount for a trusted positive result with valid data. Prompt for rescan on a negative outcome and keep pending results unverified.
3. Sum accepted receipts by original currency from all active receipt records on the case. Show the same currency rows at final reimbursement checkout. Preserve replaced scans in document history.
4. Present “Read and sign now” as the primary POA action. Refresh signature status from the server and retain additional passenger signing.

## Confirmation and revisions

Verification persists the shared flight confirmation and each passenger’s independent confirmation keyed by stable passenger ID and reviewed revision. Only all-Yes confirmations on the current revision advance the flow. Preserve other selections as the customer answers each radio group, and clear the affected acknowledgments when underlying data changes. Save revisions on the existing case, including any revised evidence linkage. Bind verified POA to the signed details and retain prior signature evidence when a change requires reconciling current status.
