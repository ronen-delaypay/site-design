# DelayPay design mockup — 16 November 2026

Open `dist/index.html` for the homepage, `help-center.html` for the approved tutorial cards, `ocr-first-draft.html` for the full claim draft, or `upload-progress-design.html` to start with sample uploaded documents and review the new confirmation stage.

## Current claim flow

1. Scan documents.
2. Review/edit the initial flight details and submit the claim.
3. Upload the supporting documents.
4. Review the OCR details, correct fields, complete missing information, and explicitly confirm the information.
5. See the second motivational note, then continue with power of attorney.
6. Enter payout details.
7. Review and send, using the existing completion/draft behavior.

The first upload note leads into the OCR review. The second note appears after a successful confirmation save, above POA. POA and later steps stay locked until confirmation. Editing a review field clears its checkbox; load/save errors block advancement. Customer corrections survive backward navigation and are reflected in the mockup case and final summary. New relevant uploads require review again; bank-document uploads do not invalidate the completed flight review.

## Appearance

Upload cards use two equal columns and equal heights with consistent icon, label and status rows. They stack on small screens. The proposed wizard panel color is soft blue-gray (`#EDF3FA`), with paler input surfaces and the existing airplane backdrop. The homepage copy remains compact and centered above its actions. Approved reimbursement tutorial cards and Facebook/LinkedIn footer links are retained.

## Preview boundary

OCR, authentication, upload, review-save and other API results are simulated locally. No files, claims or confirmations are sent to production. The review-save PATCH is a mockup fixture contract, not a verified live backend feature. `preview-src/services/upload-transport.ts` routes XHR uploads through the same in-memory fixtures.

The original source snapshot remains immutable at verified production commit `72e9ff5754b26f0c04e8e7e47c3f3c55d741770a`. This update does not refresh that snapshot. Authorized functional/design variants live under `preview-src/draft/`; `dist/source-manifest.json` records source and draft hashes separately. Actual website source and deployment were not changed by this mockup update.

## Verification

Twenty upload-card layouts, sixteen OCR-review layouts, and four localized confirm/save/POA flows passed. Required-field gating, confirmation reset after edits, POA locking, backward-navigation retention, load-error retry and save-error retention passed. The ordinary scan → edit → submit → upload → review → confirm → motivation → POA path also passed. Existing tutorial and footer checks passed. Screenshots and reports are under `previews/`.

## Latest consistency refinement — 17 November 2026

The shared panel surface is now a lighter near-white blue (#F8FAFF), used across the public site, portal, OCR review, signing panels and dialogs. Fields share #FCFDFF and selected surfaces use #F0F5FD. This supersedes the earlier #EDF3FA proposal. Review inputs, including the date field, share aligned rows and matching heights. POA has one primary signing action, three aligned secondary controls and matched passenger actions. New guidance uses concise wording; signing rules, ownership warnings and the confirmation flow remain intact.
