# Mockup flow fixes — 18 November 2026

The latest consolidated requirements are in PRD.md v2.1. Open `DelayPay-final-POA-mockup-2026-11-18.zip` for the current draft. It includes explicit document slots, passenger-owned scans, simulated customer records, named missing-field popups and individual passenger confirmations. Adults retain verified account activation; minors remain guardian-managed. No real users or Firebase records were created.

The recording corrections below remain applicable except where PRD v2.0 explicitly replaces the earlier single-passenger framing.

# Corrected mockup — 18 November 2026

Open corrected-flow-preview.html to start the complete draft journey. The public homepage remains dist/index.html.

## Addressed feedback

- Every first-document choice (boarding pass, passport/ID or booking confirmation) presents its own detected details with the same review pattern.
- The result becomes reviewable only after a successful save acknowledgment; slow/failed saves keep approval disabled and expose retry.
- Restored the standalone reimbursement branch, original expense causes, cause-specific proof uploads and visible receipts/proofs-of-payment upload. Claim type/cause survive form reset.
- Hidden inapplicable missing-days input for never-recovered baggage and cleared resolved errors.
- Added clear typed birth-date entry, ISO normalization and retained age/guardian validation.
- Aligned labels/input baselines, passenger fields, equal upload tiles and dialog surfaces/viewport spacing.
- Preserved the explicit OCR confirmation → successful save → motivational note → POA sequence.

## Verified locally

12 localized first-document flows, three mixed-document upload orders, three failed-save/retry paths, 15 responsive layouts with input baseline checks, receipt attachment persistence, typed DOB and reimbursement cause retention, and confirmation/POA gating passed. Existing ordinary claim flow and 40 review/POA layout/signing checks passed. Shared styling passed 44 views, 88 responsive checks and four actual open dialogs, with no browser errors in those checks. Evidence is under previews/.

## Production requirement for Claude

This is an isolated mockup. Its scan save and OCR services are sample fixtures; no Firebase write or production change was made. Implement/verify authenticated, authorized and versioned Firebase persistence before enabling approval. Do not ship preview adapters. PRD.md section 12 specifies save acknowledgments, failures, revisions, draft-to-claim association and staging acceptance. Reconcile the pinned older snapshot with the current production branch; preserve newer features and identity/payment rules.


## PRD v2 verification — 18 November 2026

Four localized two-passenger journeys passed with specific missing-field dialogs, stable scan ownership, idempotent user links, separate confirmations and forward progression only after saving. Ten responsive roster/review layouts passed. A three-passenger family produced a guardian-managed minor record; customer-save and final-review-save failures retained data and blocked POA until retry. Reimbursement receipts/individual review remained functional, and passport OCR DOB appeared in the first-stage field without manual typing. Screenshots and `multipassenger-verification.json` are under previews/. These checks use sample services and do not certify production Firebase/Auth/OCR.


## Final approved corrections — 18 November 2026

The latest mockup is `DelayPay-final-POA-mockup-2026-11-18.zip` under `Documents\site design`. The document upload page has the three ordered slots and the only New passenger control; it saves the current passenger and resets the slots. The next claim-details page has no add-passenger action. Receipt upload is Upload only, without camera capture. Shared flight and per-passenger confirmations use Yes/No radios with an incomplete-details note on No or unanswered; the missing-details dialog lists actual missing data only. A reminder appears before POA asking whether all passengers have been submitted. The primary POA page has only “Read and sign now”; copy, manual status-check and resend controls were removed.

Same-page signing is a deployment requirement. The current portal explicitly disables EasyDo iframe embedding pending EasyDo origin allowlisting and portal CSP configuration. Verify this on staging before release; do not claim that signing occurs inside the portal until the authorized embedded flow works. This package is a mockup and documentation handoff; no production code, customer records or deployment were changed.

## 19 November update

The current design is under `design/`. Reimbursement uses a receipts-only screen and original-currency totals on that screen and at checkout. Unreadable receipts offer a rescan. Booking confirmation can supply flight details and link named passengers to the booking document. The primary POA view uses “Read and sign now” as its sole signing action.

## Approved verification behavior

Flight and passenger radio groups retain their selections in either order. Editing a passenger’s identity data clears that passenger’s and the shared confirmation. The packaged browser journey exercises two passengers, both selection orders, edits, and successful progression to the PIR upload.
