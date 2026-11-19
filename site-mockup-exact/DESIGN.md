# DelayPay new design — visual and implementation handoff

Version: 1.0 · Updated: 17 November 2026 · Companion: `PRD.md`

## 1. Direction

A calm customer-facing design with a light blue near-white paper surface, dark ink, one blue action color, softer borders and the approved airplane backdrop. Use the same visual system on public pages, portal screens, forms, dialogs and nested POA panels. Keep current content structure and use original components whenever they already provide the required behavior.

This is a local design preview. Its API fixtures, auth adapters and upload transport are not production code. The public source snapshot is older than the current live application; reconcile implementation with the latest real repository.

## 2. Shared tokens

| Token | Value | Use |
|---|---|---|
| Canvas | `#F5F6FB` | Base canvas under the airplane image |
| Paper | `#F8FAFF` | Shared panel/card/dialog surface |
| Field | `#FCFDFF` | Form controls and secondary action surfaces |
| Tint | `#F0F5FD` | Selected controls, subtle headers and confirmation areas |
| Ink | `#24283F` | Main text |
| Muted | `#606A80` | Supporting text |
| Border | `#DCE4F0` | Panel borders and separators |
| Strong border | `#C9D3E5` | Form/secondary action outlines |
| Action blue | `#2F6FEB` | Primary actions, focus and selected progress |
| Panel radius | `20px` | Shared outer cards/panels |
| Field/action radius | `12px` | Inputs and standard actions |
| Panel shadow | `0 8px 30px -22px rgba(59,80,126,.22)` | Restrained depth |
| Dialog shadow | `0 24px 70px -25px rgba(38,62,102,.28)` | Portalled dialogs/popovers |

Use white text on filled blue buttons for contrast. Do not use the paper token as a substitute for button foreground white. Preserve meaningful semantic status colors; routine pending signing uses a light neutral surface with a status indicator, while recovery/signed/error states retain their distinct meaning.

The darker `#EDF3FA` wizard proposal is superseded. Avoid new one-off panel colors or nested hard-white containers.

## 3. Typography and rhythm

- Shared family: Geist with the existing Hebrew/Arabic/system fallbacks. Use inherited families for fields, links, buttons and dialogs.
- Body: approximately 16px; helper/utility text 13–15px; labels 14px. Keep clear 500/550/600 emphasis rather than bold everywhere.
- Portal page heading: around 42px desktop, 34px on smaller screens. Section titles around 22–28px according to the established page hierarchy.
- Homepage copy stays centered as one compact group: headline `clamp(28px, 2.25vw, 34px)`, line-height 1.18, slightly tightened tracking; support text 16px/1.6, 15px on small screens. Roughly 10–12px between headline and support copy and 18px before actions.
- Keep original headline/body words. Avoid arbitrary line breaks or changing copy to make it fit.
- Panels use the shared existing 24–36px inset pattern, with smaller 16–24px mobile insets. Fields use equal heights and consistent row gaps.
- Use tabular numerals where the source does. Long copy should stay near 65 characters per line.

## 4. Backdrop, pages and dialogs

Retain the approved airplane image and overlay across the website, client portal, later wizard stages and modal backdrops. Panels sit on top of that canvas; do not introduce page-specific replacement imagery or unrelated dark sections.

Use the same paper token for the header, calculator/card surfaces, account/payment/help panels, signing wrappers, tutorial cards and open dialogs. Apply the field token to inputs and secondary controls. Retain selected-state tint and semantic status indicators. Provider media/artwork can contain its own colors; do not recolor video frames or legal/provider content merely to flatten the palette.

Actual application styling must be scoped to customer layouts so admin pages remain intact. Portalled dialogs require a customer/body scope as they may sit outside the page wrapper.

## 5. Forms and restored search controls

### Field map

| Field | Presentation/control | Stored selection |
|---|---|---|
| Full name | Editable input | Current claim/passenger name contract; retain verified identity rules |
| Airline | Existing `AirlineSearchSelect` | Airline string returned by the current component |
| Flight number | Existing `FlightNumberInput` | Selected/typed flight-number string |
| Flight date | Native date field | Existing canonical date contract |
| Departure airport | Existing `AirportSearchSelect` | IATA code on selection |
| Destination airport | Existing `AirportSearchSelect` | IATA code on selection |
| Booking reference | Editable optional input | Existing string |
| Ticket number | Editable optional input | Existing string |

Search fields need visible search affordances, current labels, the same 54px field height and aligned text/icon padding. Use the source combobox keyboard and listbox behavior. Menus overlay the form without reflow, use shared paper/border/shadow, and keep an identifiable selected option. Do not clip the menu inside a card.

In the mockup, airline suggestions call the fixture-backed `/api/ref/airlines`; flight suggestions call fixture-backed `/api/flights/suggest`; airports use the bundled source catalog. These sample suggestions are not live schedules or a full airline database.

Keep the same data-testid fields and parent form state. Update only the chosen review field and clear confirmation on any edit. Keep manual typing when no result/provider response is available. Do not replace these controls with decorative search icons on ordinary inputs.

### Alignment

Use two `minmax(0, 1fr)` columns above the small-screen breakpoint and one column below it. Each field shares label, 54px input and helper rows with its neighbor. Source search components retain their own native labels; plain fields use correctly associated labels. Subgrid can align the nested component rows; keep a usable fallback.

Dates must use border-box sizing and the same explicit height as text/search inputs. Codes, flight numbers, ticket numbers and booking references use LTR input direction within an RTL page. Labels follow the page language. Disable field interaction during save, including an open suggestion list.

## 6. Supporting documents

Use two equal upload columns rather than a three-column grid with an empty cell. Each tile is 208px high in the current preview, with matching icon, title and status rows. Wrap long localized labels within those rows. Keep information controls, camera uploads, success receipts, coverage and warning/retry behavior.

Stack tiles below approximately 640px. A camera utility is a normal 44px+ target and must not accidentally inherit the large tile height. Receipt tiles are the exception: they show Upload only and do not offer camera capture. Existing per-passenger grouping remains intact.

## 7. OCR review and progress feedback

The stepper places verification before any remaining evidence. Only missing baggage-loss PIR or reimbursement receipts have a later upload step. When no upload applies, proceed directly to POA. There must be one current step and a Back action at every stage. Returning from a later stage restores entered answers and takes the customer to the previous applicable stage. Save edits on the same case and repeat verification when claim details are resaved. Later stages stay unavailable until the review save succeeds.

Current English guidance:

- Review title: “Do these flight details look right?”
- Support: “We filled in what we could read. Fix anything that’s off and add what’s missing.”
- Confirmation: ask “Are these details correct?” with separate Yes/No radio groups for flight details and each passenger. Answering one group preserves the earlier selections. If No is selected or no answer is given, show an inline note that details are incomplete and block progression.
- Action: “Confirm and continue”
- After upload: “Great! We’re getting closer.” / “Your documents are saved. Let’s check the details next.”
- After confirmation: “Looking good. You’re making progress.” / “Your details are confirmed. Next up: read and sign your power of attorney.”

Use the corresponding HE/RU/AR copy in the preview modules. Guidance is short, direct and consistent with the existing conversational site. Preserve original dictionary strings unless a new/approved copy variant is explicitly mapped. Do not imply compensation approval, verified documents or completed signing.

Notes are inline, accessible status regions with the shared paper surface, a blue accent and a restrained check icon. No forced modal, dismissal click or confetti. Respect reduced motion and bring the new note/stage into view.

## 8. POA composition and states

The POA stage has one outer paper surface and one consistent provider frame. The stage heading supplies context; avoid repeating it through several nested cards.

- Keep “Read and sign now” as the only primary customer signing action. Remove Copy link, Check signing status and Resend link from the primary POA page. Keep status updates automatic.
- Complete the EasyDo signing experience inside the POA page. The live app currently disables iframe embedding until EasyDo allows the portal origin and portal CSP permits the frame; do not claim this is complete until verified on staging.
- Align passenger-specific open/copy actions. A concise create-links utility remains distinct from the primary signing action.
- Use clear status text such as “Your signature is needed” and “Signatures for other passengers.”
- Keep the original success-fee agreement explanation, provider behavior, other-adult-passenger requirements and link-ownership warning.
- Preserve loading, read-only, recovery, signed and error behavior and all original handlers.

The source provider/signing service may retain its own rendered content. Theme the surrounding app consistently without pretending to control third-party pages.

## 9. Tutorials and footer

Keep the approved four tutorial/video entries and their original URLs. The reimbursement placeholder follows the same title/cover/action composition, receipt-and-screen illustration style and card spacing as adjacent tutorials. Its play/watch controls remain disabled, with no invented video URL or coming-soon label.

Keep accessible Facebook and LinkedIn logo links, with 44px targets:

- Facebook: https://www.facebook.com/profile.php?id=61557639504725
- LinkedIn: https://www.linkedin.com/company/102308281/

Use the supplied destinations, appropriate new-tab attributes and visible keyboard focus. Preserve Help Center search/filters and existing navigation/legal links.

## 10. Implementation map and guardrails

Paths below are relative to the local mockup root, `C:/Users/ronen/site-design/site-mockup-exact`.

| Area | Mockup source | Actual-app handoff |
|---|---|---|
| Shared palette | `preview-src/appearance/surface-tokens.ts`, `theme.ts`, `site-consistency.css` | Consolidate customer CSS/theme tokens in the actual app; preserve flag/admin scoping. |
| Public pages/footer | `preview-src/draft/PublicWebsite.tsx`, `WebsiteSocialLinks.tsx` | Existing public website components and original dictionary/routes. |
| OCR intake/details | `preview-src/draft/ClaimIntake.tsx`, `ClaimDetailsStep.tsx`, `Dashboard.tsx` | Reconcile with latest actual claim intake/form components; preserve edited state across scans. |
| Review/search | `preview-src/draft/OcrReview.tsx` and original shared lookup components | A production review component using real case/extraction data and the current validated save contract. |
| Wizard/gates | `preview-src/draft/ClaimFlow.tsx`, `ClaimStepper.tsx`, `OcrReviewContext.ts` | Existing wizard with explicit confirmation and preserved later-stage rules. |
| Progress | `preview-src/draft/ClaimProgressNote.tsx` | Truthful, localized milestone feedback. |
| POA appearance | `preview-src/draft/POAWidget.tsx`, `poa-display-copy.ts` | Presentation-only changes to the current signing component; preserve all handlers/legal rules. |
| Preview services | `preview-src/services/fixtures.ts`, `upload-transport.ts`, adapters | Keep out of production. |

The mock review PATCH/`previewOcrReview` flag is a fixture, not a live backend contract. Production must authenticate, authorize and validate through the existing real system. Review confirmation must not override verified passport identity rules or modify unrelated account data.

Implementation must re-establish parity with the latest repository, including later reimbursement, receipt, IBAN, guarded payment and baggage additions. Read the installed framework documentation before changing the actual Next.js app. Do not ship the older source snapshot over newer features.

## 11. Review and verification

Open `search-design-preview.html` for a populated review with restored search controls; `light-design-preview.html` starts at supporting documents; `dist/index.html` is the homepage. The search shortcut is a preview-only convenience and does not auto-confirm data.

Check five widths (320/390/768/1024/1440), all four locales, native date/input row alignment, source lookup keyboard/mouse/manual behavior, confirmation reset, failed-save retention, POA gating, signing utilities, tutorial playback and Help Center search. Compare the full content/control pattern with the latest application before production rollout.

Artifacts under `previews/` provide local screenshots and fixture-based reports. They demonstrate UI behavior, not live provider accuracy or production backend authorization. The release package is a runnable static preview plus these documents; source implementation belongs in the actual repository.


## 12. Corrected flow specification — 18 November 2026

Use `corrected-flow-preview.html` as the main preview entry. It starts the ordinary customer journey at document intake. Boarding pass, passport/ID and booking confirmation all use the same saved-result card: source-document label and filename, heading “Check the details we found”, saved status, a responsive field/value grid, missing-information guidance and “Review details”. Show only the fields extracted from that document. A review action is disabled until a server save acknowledgment is received, and while another scan/save is pending. Failure shows retry and no saved-result card for the affected attempt.

The passport example includes name, date of birth, passport number, nationality and expiry only when present. The booking example includes reference/ticket/flight information only when present. Result cards share 20px radii, the #F8FAFF surface, common padding and a #2F6FEB review action. Stack header/action layouts on narrow screens. Production must only expose fields permitted by the authenticated record and existing identity rules.

Require confirmation after intake. Include the later evidence stage only where a missing PIR or receipt applies. Reimbursement retains its claim-type tile and expense questions. Its document stage uses a compact Upload receipts control, an aligned receipt list and separate totals for each original currency. Earlier intake and claim steps handle supporting evidence. Show the recognized amount beside a check, a rescan action for an unreadable result, and a neutral state for pending OCR. Carry the same currency totals into final checkout.

Hide duration after “Never recovered”, clear resolved question errors and restore duration if the answer changes to recovered. The customer should never be directed to fill disabled controls. Keep the original question and answer wording. Birth dates use directly typed DD/MM/YYYY with an example; valid values normalize to ISO for the existing age/guardian checks.

Main form fields use shared label/input/helper rows and 54px inputs, including native date, airport/airline lookup and the phone group. The passenger editor gives name and DOB deliberate responsive columns. Dialogs share box sizing, viewport constraints, radius, surface and padding; media dialogs retain their intended width within the viewport.

Additional preview source references: `draft/SmartClaimCapture.tsx`, `scan-save.ts`, `ScanResults.tsx`, `BirthDateInput.tsx`, `PassengerListEditor.tsx`, `claim-details.ts`, `reimbursement-copy.ts`, `ClaimDocumentsStep.tsx`, `ReimbursementDocumentTiles.tsx`, `document-rubric-state.ts`. Newer reimbursement questions/wording and document components were reused from the rollout worktree; this is a targeted addition, not certification of full parity with current production.

The save fixture is deliberately isolated. The production sequence must be server extraction, committed Firebase draft/document write, receipt of record ID/version, then customer review/approval. Persist reviewed corrections before final confirmation. Never show production save success based on the client fixture. See PRD section 12 and FLOW-FIXES.md for the handoff and evidence.


## 13. PRD v2.0 — first-stage passengers and missing-detail dialogs

This section supersedes the earlier single-passenger intake framing. The main entry is now `multi-passenger-preview.html`; PRD.md v2.0 is the consolidated source of requirements.

Keep New passenger on the three-document upload page only. It saves the current passenger and starts the same three-slot flow for the next person. Confirmed passengers remain listed below under “Passenger’s list”. The following claim-details page has no add-passenger action. Retain stable IDs and isolated scan ownership; show account status only after save acknowledgment.

Use the shared native missing-details modal when a customer attempts to continue or save with required details missing. Heading: “A few details are missing”. Intro: “Please complete these details before continuing:”. List exact passenger/field pairs as focus links. Primary action: “Complete missing details”; secondary: “Close”. Escape/Close returns to the current stage, retains all data and does not bypass validation. Constrain viewport height and scroll long lists internally. Use the #F8FAFF surface, 20px radius, 28px desktop/20px mobile padding and matching action dimensions.

The OCR confirmation stage contains the shared flight fields plus one separate passenger card per person. Each card contains name, DOB, customer-record reference and its own confirmation. Changing a person's details clears that person's and the shared confirmation; retain other unaffected approvals. Only a successful persisted all-passenger/shared review may unlock POA. Keep original adult/guardian signing rules.

New reference modules: `MissingDetailsDialog.tsx`, `passenger-users.ts`, `PassengerReview.tsx`; updated `ClaimIntake.tsx`, `PassengerListEditor.tsx`, `SmartClaimCapture.tsx`, `scan-save.ts`, `merge-scan.ts`, `ClaimDetailsStep.tsx`, `ClaimFlow.tsx` and fixture services. All customer creation/save behavior remains simulated here. Production needs actual server/Firebase provisioning, authorization, idempotency and verified account activation as specified in PRD.md.


## Final approved corrections — 18 November 2026

This section supersedes earlier conflicting control guidance. The document-upload screen is the only page with New passenger. Receipt upload says Upload and has no camera action. Shared-flight and passenger confirmations use Yes/No radio choices; No or unanswered shows an incomplete-details note and blocks progress. The missing-details modal lists data fields only. The POA page removes the primary signer’s Copy link, Check signing status and Resend link controls; the primary signer has one signing action. Complete signature inside the page using EasyDo embed after vendor framing permission and CSP are confirmed. Adult passenger signing links remain governed by their separate ownership rules.

## Receipt and checkout preview

Open `design/receipt-flow-preview.html` for the receipts-only reimbursement step with sample scan results. Open `design/three-document-preview.html` to start at passenger intake and try booking-confirmation fallback and the primary POA flow. Receipt rows use the existing light portal surfaces and stack their rescan control at narrow widths.
