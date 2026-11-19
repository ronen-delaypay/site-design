# DelayPay website and client portal redesign — PRD

Version: 2.4  
Date: 19 November 2026  
Status: final approved requirements prepared for Claude deployment planning  
Preview entries: `design/receipt-flow-preview.html` and `design/three-document-preview.html`

## 1. Purpose

The Firebase data lifecycle supplement in PRD-SUPPLEMENT-DATA-PERSISTENCE.md is part of this PRD and must be implemented with the funnel changes. The stage-by-stage record contract is in DATA-FLOW.md.

Apply the approved business-oriented visual design to the existing website and client portal. Preserve existing routes, page patterns, product/legal wording and business rules except the explicitly approved changes below: OCR-first intake, saved-result review for every document type, specific missing-detail popups, a first-stage multi-passenger roster, individual passenger customer records and confirmation, and truthful progress messages.

The customer must be able to upload and review documents for every passenger, add the next passenger only from the document upload page after saving the current passenger, correct missing details, confirm every passenger’s results and progress to signing without duplicate records or mixed identities.

## 2. Delivery and production boundary

The delivered website is a runnable local mockup. OCR, saving, user/customer creation, signing and authentication are simulated services. No production Firebase records or authentication accounts have been created, no invitations were sent and the live website was not changed.

The immutable base snapshot is commit `72e9ff5754b26f0c04e8e7e47c3f3c55d741770a`; newer reimbursement components/rules have been added selectively. Claude must reconcile implementation with the latest actual repository and deployed behavior. Do not replace current production source with the older snapshot or ship preview adapters. Preserve newer reimbursement, expense-cause, receipt, IBAN, payment/checkout, baggage and canonical-passport-name behavior.

The API names and added payload fields in the mockup are proposed interface examples. They are not verified production contracts.

## 3. Preserved visual and content direction

- Keep the airplane background consistent across customer pages, wizard stages and dialogs.
- Shared surfaces: panel #F8FAFF; field #FCFDFF; selected/tinted area #F0F5FD; primary action #2F6FEB; ink #24283F; muted text #606A80; border #DCE4F0.
- Use aligned label/input/helper rows, 54px fields, deliberate responsive columns, equal-height upload cards, shared panel/dialog spacing and 20px panel radii. Keep semantic warnings and success colors meaningful.
- Retain the compact centered homepage introduction above its existing three actions, existing wording/routes, searchable Help Center, original playable tutorials and matching reimbursement tutorial placeholder without a “Coming soon” label or fake playback.
- Retain the Facebook and LinkedIn footer destinations: https://www.facebook.com/profile.php?id=61557639504725 and https://www.linkedin.com/company/102308281/.
- Support English, Hebrew, Russian and Arabic, including RTL layouts, LTR flight/airport/reference codes and accessible keyboard operation.

## 4. Customer journey

| Stage | Required behavior and exit condition |
| --- | --- |
| 1. Passenger document upload | Show three explicit slots in order: passport, boarding pass, booking confirmation. Uploads may occur in any order. Each successful scan/save opens an editable OCR-results dropdown with Save and Upload again. Keep New passenger on this upload page only: it saves the current passenger and their document data, then resets the same three slots for the next passenger. Show confirmed passengers under “Passenger’s list”. Do not show an add-passenger action on the following claim-details page. |
| 2. Flight and claim details | Prefill shared flight details and each passenger’s identity fields without overwriting customer corrections. Complete missing fields and claim-specific questions. Flight delay offers 3–5 hours, 5–8 hours and Over 8 hours. Persist the chosen range as recorded. Submit using the existing case-creation workflow, with the saved passenger/user/draft links attached. |
| 3. OCR results and confirmation | Show editable shared flight fields plus a separate name/DOB/customer-record section and confirmation for every passenger. Identify missing fields with a popup and save corrected results and required confirmations. Preserve prior document evidence and use booking confirmation as the boarding-pass fallback. |
| 4. Missing documents, when applicable | After confirmation, ask only for a missing baggage-loss PIR or missing reimbursement receipts. Skip this stage for other claims and when the applicable evidence is already available. Existing incomplete-case draft rules apply. |
| 5. Progress note and POA | After successful confirmation saving, show the second motivational note, then the existing signing flow. Each adult signs their own link; preserve guardian rules for minors. |
| 6. Payout | Preserve existing IBAN, document upload, validation and allowed-later behavior. |
| 7. Review and send | Retain the existing completion/draft rules. Summarize the saved shared details and passenger count; never mark a case ready while required signatures or documents remain missing. |

Provide a Back action at every stage. Intake goes back to the dashboard. Later stages go back to the preceding applicable stage and keep entered answers, documents and payout inputs available for editing. Save edits on the existing case. When claim details are saved again, return to verification. Refresh signing if the signed details change.

Scanning/saving an intake draft must not manufacture a claim. Retain the existing initial claim-submit trigger, attribution, deduplication and lead-conversion behavior. A group flight claim can link several customer records; creating one record per passenger does not mean creating duplicate cases. Reimbursement remains its own case under existing business rules.

## 5. First-stage passenger roster

1. Keep New passenger on the three-document upload page only. Enable it after the current passenger has the required identity details and saved OCR results. On activation, save the current passenger/customer record, then show the same empty document slots for the next passenger. Retain the existing maximum of 20 people. The following claim-details page must not offer another add-passenger action.
2. Assign a stable passenger ID when a person is added. Retain it through sorting, editing, rescans, removal of other passengers and case creation. Never use the visible row index or OCR spelling as the identity key.
3. Capture each person’s full name and date of birth. Accept directly typed DD/MM/YYYY, show the format example and normalize valid dates to YYYY-MM-DD for the existing backend. Keep original age-at-flight and guardian validation.
4. Email/mobile can be entered per person. They are optional for a pending internal customer record; verified contact is required before activating that person’s independent login. Do not invent an email, password or phone number.
5. The primary passenger is retained. Additional passengers can be removed before case submission under existing rules; their unsent draft links must not be reassigned to a different person. Removing a row must not delete an established user account.
6. Bind every scan request, saved result and upload to the current stable passenger ID. A passenger transition happens only through the New passenger action after current passenger data is saved; do not reassign an in-flight scan/save to the next passenger.
7. Show only the current passenger’s scan results. New passenger resets the upload slots while retaining the prior passenger’s saved record and confirmed summary. Repeat the same passport, boarding-pass and booking-confirmation flow for every passenger.
8. Automatically link named booking passengers to stable case roster IDs when the match is clear. Add unmatched named travelers as pending for customer review. Leave ambiguous identities for review and preserve customer edits. A passenger count alone establishes neither identity nor document coverage.
9. Saved/manual identity corrections take precedence over an unconfirmed rescan in the client. Server-side verified passport/canonical-name rules remain authoritative; surface any conflict clearly instead of silently changing identity.

## 6. Missing-detail popup

Trigger the popup when the customer attempts a stage save, Continue or Confirm action with an unmet requirement. Do not repeatedly interrupt typing.

The title is “A few details are missing”. State exactly what must be completed, for example:

- Passenger 2 — Full name
- Passenger 2 — Date of birth
- Phone
- Destination airport
- Passenger 3 — Date of birth

Each item links to an actual missing field. Do not list a Yes/No confirmation decision as a missing field; show a nearby incomplete-details note instead. “Complete missing details” closes the popup, scrolls to and focuses the first problem. The customer may close it or press Escape; this does not bypass validation. Preserve all entered data, uploads and other passengers’ approvals.

Recompute the list from the current stage’s requirements on each attempt. Include the passenger label/name where relevant. Clear resolved inline errors; do not keep a generic flight-question error after its answers are complete. Do not list optional or inapplicable inputs as missing. Invalid data receives a specific explanation, such as the required DOB format, and cannot be treated as valid saved data.

Examples: Selecting “Lost” in a baggage claim hides duration and leads to the PIR upload after verification when the report is missing. In reimbursement, “Never recovered” does not require missing-days input; switching to recovered restores that requirement. Additional guardian confirmation is required only by the existing age/guardian rules. Missing flight information after a passport-only scan is completed manually in the flight-details stage; a passport is not expected to contain a flight number.

Use a native accessible modal dialog with a labelled heading, focus containment, Escape support, a usable return focus, responsive width and internal scrolling for long lists. Maintain the approved dialog surface, padding and control alignment.

## 7. Individual users/customer records

Every passenger must have a distinct saved customer/user record linked to the intake draft, passenger ID and eventual case. This includes minors, who receive guardian-linked records rather than unrestricted independent access.

The signed-in primary customer reuses their existing user ID. Additional passengers receive an existing authorized user link or a new pending customer record. Do not merge people based solely on name, DOB or an unverified email. Existing-account linking must be verified by the server using the current identity policy and must not expose whether another person’s private account exists.

Saving the roster is idempotent. Repeating Save, retrying a failed request, rescanning or submitting the claim must not create duplicate users. Use an intake draft/roster revision and stable per-person identifiers. If creation partly succeeds, retain acknowledged mappings and retry incomplete work safely; do not claim the batch is complete or advance while required mappings are missing.

Distinguish customer-record creation from Firebase Authentication activation. The customer may see “Customer record created — account verification pending”. Independent adult login/access follows verified email/phone and the existing account activation process. Do not send invitations or activate access merely because another person typed someone’s contact. Minors retain guardian relationships and existing signing permissions.

Production should only show saved/created status after committed Firebase writes and an authenticated server response with the saved record IDs. The browser must not generate authoritative user IDs, assign roles, approve ownership or claim a successful write from local state. Restrict each user’s access to their own authorized records; the group submitter’s access follows existing delegation/guardian rules.

## 8. OCR persistence and approval for every person/document

All three document types follow uploading → extraction → saving → saved/reviewable. A boarding pass is not a prerequisite: passport-first and booking-first work equally.

Persist the uploaded document reference, passenger owner/coverage, extraction fields, source/provenance and version to an authorized Firebase-backed intake draft or existing case. Wait for the server’s committed-save acknowledgment before showing “Details saved” or enabling approval for that result. A successful OCR response alone is insufficient.

Show only fields actually read from the document. Passport data may include name, DOB, passport number, nationality and expiry; booking data may include reference, ticket and flight fields. Do not fabricate missing information. Keep sensitive identity data limited to authorized users, storage and views.

A slow or failed save must not reveal a false saved result, permit its approval or show motivational success. Provide retry and preserve other passengers’ saved results and customer edits. An empty extraction remains distinct from an OCR/provider/save failure.

Bind approval to the saved document and roster revision. A replacement upload invalidates the affected document/person’s confirmation. Editing one passenger invalidates that passenger’s review plus the shared final confirmation, while retaining other unaffected passengers’ approvals. Changes to shared flight fields invalidate the relevant shared confirmation. Reject stale or out-of-order confirmations on the server.

When the claim is created, associate existing draft/document/user IDs with that claim without losing ownership or creating another claim. Persist final customer corrections before recording approval; do not overwrite canonical verified identity fields without the current review policy.

## 9. Review and signing parity for all passengers

The review of intake documents includes shared airline, flight number, date, departure/destination and optional booking/ticket fields. Retain original airline/airport/flight lookup components, keyboard selection, debounce, manual fallback and typed values on lookup failure.

For every passenger, show their name, DOB and saved customer-record reference, with editable allowed fields and a Yes/No radio choice asking whether the details are correct. Provide the same Yes/No choice for shared flight details. Choosing No or leaving a choice unanswered shows an explicit incomplete-details note and blocks progression. Only Yes for every passenger and the shared flight details can unlock POA. Continue remains an actionable way to show the missing-field popup for actual missing data; data-loading and active-saving states can temporarily disable it.

Final confirmation saving must persist all reviewed passenger IDs, versions and approvals. No bypass via future tabs, backward navigation, a failed save, a removed/replaced document or another passenger’s confirmation choice. Preserve edits and valid unaffected approvals when navigating back. The shared-flight and per-passenger Yes/No choices are independent, regardless of selection order. An actual edit clears the relevant confirmation. Changing passenger identity data also clears shared confirmation while preserving other passengers’ choices.

After successful saving, show “Looking good. You’re making progress.” and the next-step guidance. The primary customer’s POA page has one signing action, “Read and sign now”; remove the primary signer’s Copy link, Check signing status and Resend link actions. Complete the EasyDo signing experience inside the POA page. The current integration disables iframe embedding until EasyDo allows the portal origin and the portal CSP permits the frame; this is a release blocker, not a reason to claim in-page signing or restore the removed secondary actions. Keep automatic signing-status refresh. Preserve ownership warnings and the rule that every adult signs their own POA; minor handling remains guardian-based.

The existing earlier progress note remains truthful: “Great! We’re getting closer.” appears only after successful uploaded-document saving and forward progression, not empty skips or failed writes.

## 10. Reimbursement requirements

Keep the reimbursement claim type, its six expense causes and their saved parameters. Review identity and flight evidence before the receipts-only stage. Reimbursement asks only for missing receipts after confirmation, including reimbursement for baggage loss. Show one compact Upload receipts control and an aligned list of uploaded receipts. A trusted positive OCR result with a valid positive amount and ISO currency shows a checkmark and the original-currency amount. An unreadable result prompts a rescan. Pending or missing OCR remains unverified. Add valid amounts only within each currency and show those same totals on the final reimbursement checkout summary. Preserve document revision history when replacing an unreadable receipt.

Hide duration for baggage loss marked “Never recovered”; require it again if the answer changes to returned. Clear dependent answers when the expense cause changes. Preserve the original written-complaint guidance and other business/legal wording.

## 11. Proposed implementation boundaries

| Operation | Required server behavior |
| --- | --- |
| Save passenger roster | Authenticate owner; validate each person; resolve or idempotently create customer records; return passenger-to-user IDs, status and revision only after saves succeed. |
| Save extraction/document | Save the document/extraction with stable passenger ownership and version to Firebase; return committed identifiers and save acknowledgment. |
| Create case | Use the current validated case endpoint; attach authorized draft/passenger/user/document links; preserve attribution and duplicate handling. |
| Save confirmed review | Validate current revisions, identity rules, mandatory fields and each passenger’s approval; persist corrected results and confirmations; return success before POA unlocks. |
| Signing/access | Preserve existing authorization, adult-signature and guardian policies. Independent accounts activate only through verified contact/consent. |

The mockup’s `/api/client/intake-passengers`, `/api/client/scan-drafts` and `reviewedPassengers`/`previewOcrReview` fields are fixtures/proposals, not a guarantee that those endpoints exist in production. Map these requirements onto the latest real API, Firestore schema and Firebase Auth policy. Do not copy fixtures into the live app.

## 12. Acceptance criteria

1. The three-document upload page supports New passenger after saving the current passenger. The next claim-details page has no add-passenger action. Passenger IDs remain stable and the existing 20-person limit is preserved.
2. Any passenger can start with any of the three document types. Saved results retain the correct owner through switching, rescans and different completion orders.
3. Every required missing field is named in a popup, including its passenger. Clicking an item focuses the correct field. Closing/Escape does not advance or erase data.
4. Optional/inapplicable inputs do not block progress; recovered/never-recovered baggage and the three delay ranges validate correctly.
5. Valid DD/MM/YYYY dates become ISO payloads; invalid dates and missing required guardian confirmation remain blocked.
6. Every passenger gets a saved, linked customer record. The primary account is reused. Repeated saves, retries and case submission create no duplicate users or claims.
7. A failed/partial record save shows no complete-batch success and does not bypass required creation. Retry retains valid existing mappings and user edits.
8. OCR extraction and real committed Firebase persistence both succeed before result approval becomes available. Test slow saves, failures, stale revisions and retries separately.
9. Each passenger and the shared flight details have Yes/No confirmation radios. No or unanswered displays an incomplete-details note and blocks POA. Editing passenger 2 clears passenger 2/shared approval while retaining passenger 1’s unchanged approval.
10. No future-tab or navigation bypass reaches POA before all required current passenger/shared confirmations are persisted.
11. All adults retain separate signing links; minors use the existing guardian path. User-record creation does not automatically grant login access or send invitations.
12. Reimbursement retains its cause and earlier evidence. The receipt screen shows a compact upload control without camera or other evidence controls. Verify positive, unreadable and pending OCR states, a successful rescan and per-currency totals carried through final checkout. Upload two receipts in separate requests and verify that both amounts contribute.
13. Preserve all other texts, routes, lookups, page patterns, legal rules, payment guards, tutorial behavior and social destinations.
14. Verify EN/HE/RU/AR at 320/390/768/1024/1440px, aligned inputs/dialogs, focus management, keyboard operation and no overflow.
15. Verify actual Firebase writes, authorization, account activation, live OCR and in-page EasyDo signing on staging. Confirm EasyDo framing permission and portal CSP configuration before release. Local fixture behavior alone does not satisfy production acceptance.

## 13. Handoff and release

Claude should use this PRD with DESIGN.md, FLOW-FIXES.md and CLAUDE-DEPLOYMENT-HANDOFF.md. Implement against the latest production branch in the normal review process, verify acceptance criteria on staging, and prepare a reviewable PR for the team’s existing deployment process. Do not deploy or provision users from the mockup handoff. Preserve a rollback path and do not run a bulk user/account migration based on the sample fixture data.

Local evidence belongs in `previews/`. It demonstrates UI and simulated service behavior, not live Firebase/Auth/provider success. Production readiness remains contingent on real integration and source parity checks.


## 14. Final approved mockup corrections — 18 November 2026

These decisions supersede conflicting earlier descriptions in this document:

- The upload page shows three named slots in this order: passport, boarding pass, booking confirmation. Every slot offers upload; successful saved OCR opens an editable dropdown with Save and Upload again.
- New passenger appears only on the document upload page. It saves the current passenger before resetting the slots. The next claim-details page has no add-passenger action.
- A receipt action is Upload only; no take-photo/camera control appears on receipt tiles.
- Shared flight data and each passenger’s data are acknowledged using explicit Yes/No radios. No or unanswered results in an inline “details are incomplete” note and blocks progress. The missing-details dialog lists actual missing fields only.
- Before POA, show the reminder: “Are you sure all passengers have been properly submitted?” Continue only after the customer confirms.
- The primary customer’s POA page offers only “Read and sign now.” Remove its Copy link, Check signing status and Resend link actions. The EasyDo signature must complete within the POA page. The present app code explicitly disables embedded signing until EasyDo allows the portal origin and CSP is updated. Verify that prerequisite on staging; treat lack of permission as a release blocker. Preserve required per-adult passenger signing paths and automatic status refresh.

## 15. Firebase funnel data requirements

These requirements extend the customer funnel while preserving the existing business submission rules. The detailed schema, lifecycle, acceptance criteria and current-code references are in `PRD-SUPPLEMENT-DATA-PERSISTENCE.md` and `DATA-FLOW.md`; both are normative parts of this PRD.

- Allocate one stable `caseId` before the first passport upload. Because the redesigned flow scans documents before claim details are saved, persist an intake-only draft record in Firebase keyed by that ID. A draft is not a submitted claim and must not trigger claim submission, airline contact, payment, or other submission-only automation.
- Save every document upload and its OCR attempt/result against that same `caseId` and stable passenger ID. Show OCR results as saved only after the server confirms durable Firebase persistence. Preserve per-document raw/normalized extraction, confidence, status, timestamps, source/storage reference, and customer corrections under the established privacy and retention rules.
- Store all passengers under the same `caseId`. Persist stable passenger IDs, identity/guardian data and the authoritative `passengerCount`, kept equal to the roster length. Do not create duplicate claim cases for additional passengers.
- When the customer presses Save for claim details, write the canonical `caseType` and all applicable claim parameters/answers to the same case record. Keep the existing canonical disruption and normalized fields used by downstream eligibility; no entered answer may be dropped when translating from the UI.
- On verified POA signature, persist the existing signature timestamp and a Boolean `poaSigned` state. For multi-passenger cases, store signature status per required adult; the case-level flag is true only when every required adult POA is verified signed. A browser click or unsigned link is not proof of signing.
- Link/promote the intake draft into the existing case record idempotently on Save, then retain that ID through later stages. Retry, refresh, duplicate-save and partial-failure behavior must not lose OCR, duplicate passengers, or create a parallel case.

## 16. Booking fallback acceptance criteria

- With no boarding pass, save a booking confirmation that contains usable flight details and two named travelers. Verify that the flight fields populate, the document is associated with both stable passenger IDs after claim Save, and both passengers still require review.
- Where both sources exist, prefer boarding-pass flight details and preserve manual corrections. Verify that an ambiguous duplicate name or passenger-count-only scan cannot silently assign coverage.
- On primary POA, verify that “Read and sign now” is the only signing action. Server-driven status and the additional adult passenger workflow retain their existing behavior.
