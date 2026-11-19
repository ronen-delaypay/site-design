# Claude deployment preparation handoff — DelayPay

Date: 19 November 2026  
Target repository: `C:\Users\ronen\dev\delaypay-admin-GGC`  
Mockup reference: `C:\Users\ronen\Documents\site design\DelayPay-data-flow-handoff-2026-11-19.zip`

## Read first

1. `PRD.md` — current approved requirements (v2.4).
2. `PRD-SUPPLEMENT-DATA-PERSISTENCE.md` — required Firebase lifecycle and field contracts.
3. `DATA-FLOW.md` — current-vs-required stage mapping.
4. `DESIGN.md` — visual system and component guidance.
5. `FLOW-FIXES.md` — prior flow corrections and final approved deltas.

Treat the final approved corrections at the end of each relevant document as authoritative over any older conflicting description.

## Work to prepare

- Inspect the current repository, active branch, working tree and recent feature changes before editing. Do not assume the mockup’s pinned source snapshot is current production code.
- Reconcile every change with the current application and preserve its routes, texts, legal terms, search controls, reimbursement questions/receipts, identity rules, IBAN/payment guards, baggage logic and POA passenger ownership rules.
- Apply the approved appearance consistently to public pages, customer portal, all wizard stages and dialogs. Keep the airplane background and shared light surfaces consistent.
- Keep the explicit three document slots in order: passport, boarding pass, booking confirmation. On each successful server OCR plus committed Firebase save, reveal editable results with Save/Upload again. Never show saved/approved state on OCR success alone.
- Keep New passenger on the upload page only. Save the current passenger before opening fresh slots for the next passenger. Do not show an add-passenger action on the following claim-details page. Preserve stable ownership and per-passenger user records.
- Keep reimbursement’s document stage dedicated to receipts with a compact Upload receipts control. Show trusted OCR success with the purchase-currency amount, offer rescans for unreadable results, and carry validated per-currency totals through checkout. Collect earlier evidence in the preceding steps.
- Use independent Yes/No radio groups for shared flight details and each passenger. Preserve their selections in either order and validate all current confirmations before advancing. No/unanswered must show an incomplete-details note and block progression. The missing-details dialog names actual missing fields only.
- Before POA, ask: “Are you sure all passengers have been properly submitted?”
- On the primary customer’s POA page, remove Copy link, Check signing status and Resend link controls. Keep “Read and sign now” as the only primary signing action and update status automatically. Preserve separate adult passenger signing/ownership actions required by current business rules.

## Same-page signing release gate

The requested behavior is for the customer to complete the signature on the POA page. The current application has an EasyDo iframe/modal path but disables it by default: source comments say EasyDo’s `X-Frame-Options`/`frame-ancestors` and the portal `frame-src` policy must both permit embedding. Verify the live EasyDo host and obtain its authorization for the production portal origin; then update the portal CSP and enable the existing allow-listed embed path. Exercise a real staging signing session, return/status updates and failure states. If EasyDo does not authorize framing, record this as a blocker and do not claim same-page signing is implemented or silently restore the removed copy/status/resend actions.

The current POA action label “Read and sign now” can remain; when embedded, use the in-page signing modal/frame and remove copy that says signing opens in a separate tab. Do not replace EasyDo legal consent with a local mock form.

## Production data and service boundary

The mockup uses local fixtures for OCR, authentication, Firebase writes, account creation and review saves. Treat all fixture API paths and payloads as examples, not production contracts. Map the PRD to existing authenticated server endpoints and Firestore/Auth policy. Require committed writes, stable passenger/document IDs, idempotent retries, ownership authorization, revision checks and durable error recovery before showing success or enabling POA. No user/account migration, invitation or provisioning should be performed from sample data.

## Delivery expectation

Prepare implementation on a reviewable branch and open a PR with code, tests, screenshots/flow evidence and a staging verification checklist. Read the installed Next.js guide in `node_modules/next/dist/docs/` before editing Next.js code, as required by the repository instructions. Do not deploy to production; follow the team’s normal approval/release process after review.

## Firebase data-flow supplement (19 November 2026)

Treat `PRD-SUPPLEMENT-DATA-PERSISTENCE.md` and `DATA-FLOW.md` as normative. The new scan-first UI needs a stable Firebase intake draft `caseId` before Passport upload; draft creation is not claim submission and must not trigger submission-only work. Persist OCR/document results and the passenger roster under that same ID; on claim-details Save, idempotently promote/link the draft and persist canonical `caseType` and applicable parameters. Add server-owned case Boolean `poaSigned`, preserving `powerOfAttorneySignedAt` and signer-level status; only trusted verified signature events can update it, and multi-adult cases are true only when every required adult is verified signed.

Existing production behavior was inspected in the client quick-claim, document-upload, and POA endpoints. The draft API/promotion is a new requirement because the current production upload route requires a case that has already been created. Keep the existing deduplication, ownership, consent, tenant, eligibility and downstream integrations intact when implementing that lifecycle.

## Booking and receipt implementation

Persist the booking-confirmation fallback and its OCR-named passenger links under the stable case ID. Apply existing evidence rules, keep ambiguous identities pending and preserve customer corrections. Use the updated PRD and persistence supplement for receipt states, replacement history and currency totals. In primary POA, display “Read and sign now” and rely on server-driven status. Confirm EasyDo’s approved embed origins and CSP before production embedding.

## Commit scope

This handoff is the approved mockup and production data request. The preview uses isolated fixtures. Implementation must map the confirmed data contract onto the authenticated application APIs and Firebase. The sample quick-claim edit and review requests describe the intended behavior for edits to one case.
