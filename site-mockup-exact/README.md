# DelayPay design and data-flow handoff

Date: 19 November 2026. This package combines the approved runnable design with the v2.4 PRD and the Firebase data-flow supplement.

## Files

1. `PRD.md` — consolidated design and funnel requirements, v2.4.
2. `PRD-SUPPLEMENT-DATA-PERSISTENCE.md` — Firebase lifecycle, claim parameters, independent confirmations, evidence revisions and POA requirements.
3. `DATA-FLOW.md` — stage-by-stage current behavior, required writes and invariants.
4. `DESIGN.md`, `FLOW-FIXES.md` — approved visual system and final flow decisions.
5. `CLAUDE-DEPLOYMENT-HANDOFF.md` — implementation boundaries and deployment preparation.
6. `design/` — runnable mockup, editable preview source and the launch pages `receipt-flow-preview.html`, `pir-upload-preview.html`, and `three-document-preview.html`.

Open `design/receipt-flow-preview.html` directly in a browser for the prefilled receipts-only screen. Open `design/pir-upload-preview.html` to go directly to the upload screen. For the full customer flow, open `design/three-document-preview.html` and proceed through intake, flight details, verification, any required PIR or receipt upload, signing and checkout. Use Back to revisit the preceding stage and update the same case. To try different fixture outcomes, upload a PDF named `meal-GBP-8.25.pdf`, `unreadable.pdf` or `pending.pdf`. OCR, uploads and in-page sample signing use simulated services. The data-flow files specify the production Firebase implementation.

## Current code findings

Production currently creates a case on claim-details submission and then accepts case-scoped uploads. The scan-first design requires a stable Firebase intake draft ID before the first document, promoted idempotently on claim-details Save. Existing upload/OCR/POA paths must be reconciled with the new lifecycle; this handoff does not make production code changes.

## Production boundary

No production source, Firebase records, authentication accounts, customer messages or deployment were changed in preparing this package. See the PRD supplement for acceptance criteria and unresolved implementation checks.


## Rebuilding the mockup

The packaged HTML launchers open directly in a browser. To rebuild, use Node.js and the installed DelayPay application dependencies. Set `DELAYPAY_SOURCE_DIR` to a checkout of DelayPay application commit `72e9ff5754b26f0c04e8e7e47c3f3c55d741770a` and `DELAYPAY_DEPENDENCY_DIR` to the checkout containing the installed dependencies, including Vite and its React plugin. Run `node design/preview-src/build.mjs` from this package directory. The build writes to `design/dist/`.
