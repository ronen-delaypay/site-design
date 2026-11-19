"use client";

import type { ClaimAnswers } from "./claim-details";
import { DELAY_WINDOWS } from "./claim-details";
import {flowTranslator} from "./reimbursement-copy";

import { documentPassengers, passengerDocumentCoverage, type DocumentPassenger } from "@/lib/claims/passenger-documents";
import { trackPortalAction } from "@/lib/client/portal-events";
import { notesWithEstimatedExpense, type EstimatedExpense } from "@/lib/website/estimated-expenses";
import { websiteText } from "@/lib/website/copy";
import { useCallback, useEffect, useMemo, useState, useRef, Suspense, type FormEvent } from "react";
import Link from "next/link";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import {
  buildE2EClientToken,
  getDefaultE2EClientIdentity,
  isE2EClientAuthEnabled,
} from "@/lib/e2e/auth";
import { getMissingClientFirebaseKeys, prepareClientAuth } from "@/lib/firebase";
import { clearClientSessionCookie } from "@/lib/client/session-cookie";
import {
  getRequestTooLargeMessage,
  prepareFilesForUpload,
  splitIntoRequestBatches,
} from "@/lib/client/upload-prep";
import {
  MAX_DOCUMENT_UPLOAD_BYTES,
  ALLOWED_DOCUMENT_MIME_TYPES,
  getFileSizeErrorMessage,
  getInvalidMimeTypeErrorMessage,
} from "@/lib/constants/document-upload";
import type { CaseStatus } from "@/types/case";
import { captureException } from "@/lib/observability/sentry";
import { colors } from "@/lib/client/portal-theme";
import { PORTAL_V2 } from "@/lib/client/portal-flags";
import { ClientHeader, StatsSummary, EngagementSection, OnboardingChecklist, QuickClaimForm, CasesList, Alert, DashboardSkeleton } from "@/components/client";
import { Icon } from "@/components/client/Icon";
import FlightStatusWidget from "@/components/client/FlightStatusWidget";
import CompensationCalculator from "@/components/client/CompensationCalculator";
import type { QuickClaimFormData } from "@/components/client/QuickClaimForm";
import { makeEmptyPassenger } from "@/components/client/QuickClaimForm";
import { validateQuickClaimForm } from "@/lib/client/form-validation";
import { SmartClaimCapture } from "@/components/client/SmartClaimCapture";
import { ClaimSubmittedNext } from "@/components/client/ClaimSubmittedNext";
import { ClaimFlow, type ClaimSummary } from "@/components/client/ClaimFlow";
import { PortalHeaderV2 } from "@/components/client/v2/PortalHeaderV2";
import { ClaimIntentSync } from "@/components/client/v2/ClaimIntentSync";
import { CaseProgressList } from "@/components/client/v2/CaseProgressList";
import { ClaimDetailsStep } from "./ClaimDetailsStep";
import { DraftClaimIntake } from "./ClaimIntake";
import type { ClaimDocumentKind } from "@/components/client/ClaimDocumentsStep";
import type { MessageKey } from "@/lib/i18n/dictionary";
import { validateSelectedDocuments } from "@/lib/client/validate-selected-documents";
import type { ExtractedClaimFields } from "@/lib/client/ocr-extract-fields";
import { QuickClaimRejectedError, quickClaimErrorFromResponse } from "@/lib/client/quick-claim-error";
import { getStoredAttribution } from "@/lib/marketing/attribution";
import { useLocale } from "@/hooks/useLocale";
import { translatorFor, dir } from "@/lib/i18n";
import { getAnalytics } from "@/lib/client/analytics";
import { trackMetaPixelEvent, trackMetaPixelCustomEvent } from "@/lib/client/meta-pixel";
import { ClaimFunnel, portalLeadMetaEventId, portalLeadTransactionId } from "@/lib/client/funnel-events";

type MissingItem = {
  key: string;
  label: string;
};

type ClientCase = {
  passengers?: DocumentPassenger[];
  passengerDocuments?: ReturnType<typeof passengerDocumentCoverage>;
  id: string;
  caseId: string;
  caseNumber?: string | null;
  createdAt: number;
  status: CaseStatus;
  portalStage?: { stage: number; label: string };
  airline?: string;
  flightNumber?: string;
  departureDate?: string;
  bookingReference?: string;
  ticketNumber?: string;
  compensationAmount?: number;
  compensationCurrency?: string | null;
  // CX-5: the confirmed-or-estimated figure the dashboard tile renders.
  // Computed server-side (computeClientCompensationDisplay) — undefined on
  // the brief optimistic placeholder case (no server data yet), null when
  // the case is EU261-ineligible or there isn't enough data for even an
  // estimate. Either way CasesList omits the tile rather than guessing.
  compensationDisplay?: { amount: number; currency: string; confirmed: boolean } | null;
  readinessStatus?: "not_ready" | "conditionally_ready" | "ready" | null;
  readinessScore?: number | null;
  // Optional client-side: the optimistic placeholder case (shown for the few
  // seconds between Quick Claim submit and the next overview refresh) has no
  // server-computed financial stage yet. CasesList falls back to the bare
  // status label when this is absent.
  airlineStatus?: { stage: string; label: string };
  airlineCaseRef?: string | null;
  customerDocuments: Array<{
    id: string;
    fileName: string;
    documentKind: string;
    passengerIds?: string[];
    coverageExcluded?: boolean;
    uploadedAt: number;
    url?: string;
    storageMissing?: boolean;
    pendingReview?: boolean;
  }>;
  missingItems: MissingItem[];
  completion: number;
};

type ClientEngagementItem = {
  caseDocId: string;
  caseId: string;
  status: CaseStatus;
  completion: number;
  missingItems: MissingItem[];
  nudgeScore: number;
  urgency: "low" | "medium" | "high";
  title: string;
  message: string;
  actionLabel: string;
  recommendedChannel: "portal" | "email";
};

type ClientOverviewPayload = {
  ok: boolean;
  error?: string;
  overview?: {
    cases?: ClientCase[];
    items?: ClientEngagementItem[];
    summary?: { dataSource?: "live" | "snapshot"; casesPartial?: boolean };
  };
};

type UploadedDocumentReceipt = {
  passengerIds?: string[];
  id: string;
  fileName: string;
  documentKind: string;
  uploadedAt: number;
  url?: string | null;
  pendingReview?: boolean;
  detectedKind?: string | null;
};

type UploadMismatchWarning = {
  fileName: string;
  message: string;
  suggestedKind?: UploadDocumentKind | null;
  detectedKind?: string | null;
};

type LoadOverviewOptions = {
  preserveStateOnError?: boolean;
  silent?: boolean;
};

function buildOptimisticClientCase(caseDocId: string, caseId: string, form: QuickClaimFormData, missingLabel: string): ClientCase {
  return {
    passengers: documentPassengers({ passengers: form.passengers }),
    id: caseDocId,
    caseId,
    createdAt: Date.now(),
    status: "AwaitingDocuments",
    airline: form.airline || undefined,
    flightNumber: form.flightNumber || undefined,
    departureDate: form.departureDate || undefined,
    bookingReference: form.bookingReference || undefined,
    ticketNumber: form.ticketNumber || undefined,
    compensationAmount: 0,
    readinessStatus: "not_ready",
    readinessScore: 0,
    customerDocuments: [],
    missingItems: [{ key: "missing_flight_proof", label: missingLabel }],
    completion: 0,
  };
}

// P1 FIX: Expanded to include all canonical document kinds from CaseCustomerDocumentKind
// This allows customers to upload the exact document type the system needs for readiness
type UploadDocumentKind =
  | "boarding_pass"
  | "passport"
  | "e_ticket"
  | "eticket"
  | "receipt"
  | "power_of_attorney"
  | "bank_document"
  | "bank_statement"
  | "iban_letter"
  | "id_card"
  | "correspondence"
  | "pir"
  | "delay_cancellation_proof"
  | "other";

type ClientSessionUser = {
  email: string | null;
  displayName: string | null;
  getIdToken: () => Promise<string>;
  isE2E?: boolean;
};

/** Form keys whose value is a plain `string` (excludes literal unions and the passenger list). */
type PlainStringFormKey = {
  [K in keyof QuickClaimFormData]: string extends QuickClaimFormData[K]
    ? QuickClaimFormData[K] extends string
      ? K
      : never
    : never;
}[keyof QuickClaimFormData];

/** Moves the cursor to the quick-claim input the server named, so the customer fixes it in place. */
function focusQuickClaimField(field: string | null) {
  if (!field) return;
  document.querySelector<HTMLElement>(`[data-testid="quick-claim-form"] [name="${field}"]`)?.focus();
}

const initialForm: QuickClaimFormData = {
  clientName: "",
  phone: "",
  airline: "",
  flightNumber: "",
  departureDate: "",
  origin: "",
  destination: "",
  disruptionType: "delayed",
  delayHours: "",
  cancellationNoticeDays: "",
  // Start with one empty passenger row (the primary). The editor keeps
  // `passengers.length` and the legacy `passengerCount` string in sync.
  passengers: [makeEmptyPassenger()],
  passengerCount: "1",
  bookingReference: "",
  ticketNumber: "",
  notes: "",
};

export default function ClientPortalPage() {
  const router = useRouter();
  const [creatingClaim, setCreatingClaim] = useState(false);
  const [marketingType, setMarketingType] = useState<string | null>(null);
  const [estimatedExpenses, setEstimatedExpenses] = useState<EstimatedExpense | null>(null);
  const [locale] = useLocale();
  // Auth initialization depends on t; keep its identity stable between locale
  // changes so overview state updates do not resubscribe and fetch again.
  const t = useMemo(() => translatorFor(locale), [locale]);
  const direction = dir(locale);
  // Compute before useState so we can use it as the initial loading value.
  // In E2E mode both SSR and the client evaluate this as true, so loading
  // starts false on both sides — no hydration mismatch, no race with useEffect.
  const e2eAuthEnabled = isE2EClientAuthEnabled();
  // In E2E mode initialize user synchronously so submitClaim's `if (!user) return`
  // guard never trips between the first render (loading=false, portal visible) and
  // the useEffect (which runs asynchronously and would normally set user later).
  // The useEffect overwrites this with the localStorage token when it fires, so
  // getIdToken() always returns the token the test stored before navigating.
  const [user, setUser] = useState<ClientSessionUser | null>(() => {
    if (!e2eAuthEnabled) return null;
    const identity = getDefaultE2EClientIdentity();
    return {
      email: identity.email || "e2e-client@delaypay.test",
      displayName: identity.name || "E2E Client",
      getIdToken: async () => buildE2EClientToken(identity),
      isE2E: true,
    };
  });
  // In E2E mode skip the loading skeleton entirely: both user and loading are
  // ready from the very first render — no useEffect race, no hydration mismatch.
  const [loading, setLoading] = useState(!e2eAuthEnabled);
  const [cases, setCases] = useState<ClientCase[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  // True once an overview fetch has SUCCEEDED, so "no claims yet" is known, not just "not loaded yet".
  const [casesLoaded, setCasesLoaded] = useState(false);
  // True once any overview fetch has finished (ok or not), so the "no claims yet" fallback never flashes mid-load.
  const [overviewSettled, setOverviewSettled] = useState(false);
  const [engagement, setEngagement] = useState<ClientEngagementItem[]>([]);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [copiedNudgeCaseId, setCopiedNudgeCaseId] = useState<string | null>(null);
  // In E2E mode the portal is rendered immediately. Seed the identity name in
  // the initial state instead of setting it from the auth effect after the form
  // is already visible; that late controlled-form update can overwrite a field
  // the customer is typing (notably the phone number).
  const [form, setForm] = useState<QuickClaimFormData & { claimAnswers?: ClaimAnswers }>(() =>
    e2eAuthEnabled
      ? { ...initialForm, clientName: getDefaultE2EClientIdentity().name || "" }
      : initialForm,
  );
  const [formEpoch, setFormEpoch] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);

  // Prefill the claim form from a real-time OCR extraction, filling ONLY fields
  // the customer hasn't already typed — an OCR read never overwrites a value the
  // user entered by hand (their correction always wins).
  const applyExtractedFields = useCallback((fields: ExtractedClaimFields) => {
    setForm((prev) => {
      const next = { ...prev };
      const fill = (key: PlainStringFormKey, value: string | undefined) => {
        if (value && !prev[key].trim()) {
          next[key] = value;
        }
      };
      fill("clientName", fields.clientName);
      fill("airline", fields.airline);
      fill("flightNumber", fields.flightNumber);
      fill("departureDate", fields.departureDate);
      fill("origin", fields.origin);
      fill("destination", fields.destination);
      fill("bookingReference", fields.bookingReference);
      fill("ticketNumber", fields.ticketNumber);
      // passengerCount defaults to "1" in the form, which the generic empty-only
      // guard would treat as already-filled — so an OCR read of "3 passengers"
      // would be silently dropped and the claim scaled to a single traveler.
      // Overwrite when the field is still empty OR at that untouched default.
      // Pad/truncate the structured passenger list in lockstep so the editor
      // renders the right number of blocks; existing per-passenger entries the
      // customer may have already typed are preserved up to the new length,
      // and the primary (index 0) is always kept.
      if (typeof fields.passengerCount === "number") {
        const current = String(prev.passengerCount ?? "").trim();
        if (!current || current === "1") {
          const nextCount = Math.max(1, Math.floor(fields.passengerCount));
          next.passengerCount = String(nextCount);
          const existing = prev.passengers.length > 0 ? prev.passengers : [makeEmptyPassenger()];
          if (existing.length < nextCount) {
            next.passengers = [
              ...existing,
              ...Array.from({ length: nextCount - existing.length }, () => makeEmptyPassenger()),
            ];
          } else if (existing.length > nextCount) {
            next.passengers = existing.slice(0, nextCount);
          } else {
            next.passengers = existing;
          }
        }
      }
      return next;
    });
    // QuickClaimForm uses native inputs to avoid fast controlled-input races.
    // Remount after OCR prefill so new defaults reach the DOM while preserving
    // fields already tracked in React state.
    setFormEpoch((value) => value + 1);
  }, []);
  // React state updates are async — a fast double-click/double-tap can fire
  // two submitClaim calls before the re-render disables the submit button.
  // A ref-backed flag is checked synchronously, closing that gap.
  const submitInFlightRef = useRef(false);
  // Claim funnel events (claim_start / claim_step / claim_submit): one per
  // step per claim attempt — a ref, so re-renders and StrictMode's doubled
  // effects never resend. Replaced after a created claim (new attempt).
  const claimFunnelRef = useRef<ClaimFunnel | null>(null);
  if (!claimFunnelRef.current) claimFunnelRef.current = new ClaimFunnel("portal_quick_claim");
  // Same double-click gap as submitInFlightRef, per-case since uploads to
  // different cases run independently. uploadingByCase alone (React state)
  // isn't enough: a rapid double-click fires two concurrent uploads of the
  // same files before the re-render disables the button — the server
  // transaction is safe from corruption, but each request independently
  // runs OCR/classification and stores a separate document, producing
  // visible duplicates plus doubled OCR/LLM spend (Queen audit finding).
  const uploadPassengerIdsRef = useRef<Record<string, string[] | undefined>>({});
  const uploadInFlightRef = useRef<Record<string, boolean>>({});
  const [uploadingByCase, setUploadingByCase] = useState<Record<string, boolean>>({});
  const [uploadKindByCase, setUploadKindByCase] = useState<Record<string, UploadDocumentKind>>({});
  const [filesByCase, setFilesByCase] = useState<Record<string, File[]>>({});
  const [uploadProgressByCase, setUploadProgressByCase] = useState<Record<string, { loaded: number; total: number }>>({});
  const [recentUploadsByCase, setRecentUploadsByCase] = useState<Record<string, UploadedDocumentReceipt[]>>({});
  const [uploadWarningsByCase, setUploadWarningsByCase] = useState<Record<string, UploadMismatchWarning[]>>({});
  const [messageDraftByCase, setMessageDraftByCase] = useState<Record<string, string>>({});
  const sendMessageInFlightRef = useRef<Record<string, boolean>>({});
  const [sendingMessageByCase, setSendingMessageByCase] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // The claim the customer just filed (new claims only, not duplicates) —
  // drives the "what happens next" card under the form. Session-only: it is
  // cleared on dismiss or on the next submit, never persisted.
  const [submittedClaim, setSubmittedClaim] = useState<{ caseId: string; caseDocId: string; claimType?: string; baggageStatus?: string; revision?: number } | null>(null);
  const onClaimIntentChange = useCallback((creating: boolean) => {
    setCreatingClaim(creating);
    // Returning to My cases closes the local wizard; the saved case stays on the backend.
    if (!creating) setSubmittedClaim(null);
  }, []);
  const [submittedSummary, setSubmittedSummary] = useState<ClaimSummary | null>(null);
  const [retryLoading, setRetryLoading] = useState(false);

  const overviewRequestRef = useRef<Promise<ClientOverviewPayload> | null>(null);
  // Monotonically-increasing counter that identifies the "current" loadOverview
  // generation. When refreshOverviewInBackground starts a fresh fetch it bumps
  // this counter, so any still-in-flight older fetch (e.g. the useEffect's
  // initial load) will see a stale generation and skip its setCases call —
  // preventing the pre-submit empty-result from wiping the optimistic case card.
  const overviewGenerationRef = useRef(0);
  const optimisticCaseIdsRef = useRef<Set<string>>(new Set());

  // Rejected is terminal, not "open" (matches buildClientOverview's totalOpenCases).
  const openCases = useMemo(
    () => cases.filter((item) => item.status !== "Paid" && item.status !== "Closed" && item.status !== "Rejected"),
    [cases],
  );

  const handleClientUnauthorized = useCallback(async function handleClientUnauthorized() {
    clearClientSessionCookie();
    if (e2eAuthEnabled) {
      router.replace("/client/login");
      return;
    }

    const auth = await prepareClientAuth();
    await signOut(auth).catch(() => undefined);
    router.replace("/client/login");
  }, [e2eAuthEnabled, router]);

  const loadOverview = useCallback(async function loadOverview(
    currentUser: ClientSessionUser,
    options?: LoadOverviewOptions,
  ) {
    if (overviewRequestRef.current) {
      await overviewRequestRef.current;
      return;
    }

    if (!options?.silent) {
      setCasesLoading(true);
      setEngagementLoading(true);
      setError(null);
    }

    // Capture the generation at the moment THIS fetch starts. Every caller
    // (including the initial useEffect load) gets a snapshot of the counter.
    // When refreshOverviewInBackground bumps overviewGenerationRef.current,
    // any still-in-flight older fetch will find a mismatch below and skip its
    // setCases call, preventing it from wiping the optimistic case card.
    const myGeneration = overviewGenerationRef.current;

    // Declared before assignment (rather than `const request = (async () =>
    // ...)()`) so the `finally` block below can reference `request` for the
    // own-request-identity check — TypeScript's control-flow analysis can't
    // see that the async body always suspends at its first `await` (well
    // before reaching `finally`), so it flags a same-statement `const` as
    // "used before assigned" even though the assignment always completes
    // first at runtime.
    let request: Promise<ClientOverviewPayload> | null = null;
    request = (async () => {
      try {
        const token = await currentUser.getIdToken();
        const res = await fetch(`/api/client/overview?limit=8&locale=${locale}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.status === 401) {
          await handleClientUnauthorized();
          return {} as ClientOverviewPayload;
        }

        const payload = !res.ok
          ? ({ ok: false } as ClientOverviewPayload)
          : (await res.json()) as ClientOverviewPayload;

        if (!payload.ok) {
          throw new Error(t("portal.loadError"));
        }

        // Discard stale results: a newer fetch started by refreshOverviewInBackground
        // has bumped the generation counter — our setCases would overwrite the
        // optimistic case card that was just added after the form submit.
        if (myGeneration !== overviewGenerationRef.current) {
          return payload;
        }
        setError(null);
        setCases((prev) => {
          const fetchedCases = payload.overview?.cases ?? [];
          if (optimisticCaseIdsRef.current.size === 0) return fetchedCases;

          const fetchedIds = new Set(fetchedCases.map((item) => item.id));
          const pendingIds = new Set<string>();
          const optimisticCases = Array.from(optimisticCaseIdsRef.current)
            .map((caseId) => {
              if (fetchedIds.has(caseId)) return null;
              const optimisticCase = prev.find((item) => item.id === caseId);
              if (!optimisticCase) return null;
              pendingIds.add(caseId);
              return optimisticCase;
            })
            .filter((item): item is ClientCase => item !== null);

          optimisticCaseIdsRef.current = pendingIds;
          return optimisticCases.length > 0 ? [...optimisticCases, ...fetchedCases] : fetchedCases;
        });
        setEngagement(payload.overview?.items ?? []);
        // A snapshot / partial read can omit a real case, so only a live, complete read may say "no claims".
        const summary = payload.overview?.summary;
        if (summary?.dataSource === "live" && summary.casesPartial === false) setCasesLoaded(true);
        return payload;
      } catch (err: unknown) {
        // Never surface the raw (English) API/internal error to the Hebrew
        // customer UI — show a localized message and keep the detail in logs.
        if (err instanceof Error) console.error("[client overview]", err.message);
        captureException(err, { tags: { page: "client_dashboard", fn: "loadOverview" } });
        const message = t("dashboard.error.loadFailed");
        // Same stale-generation guard the success path applies above: a
        // newer fetch has already rendered its result, so this older fetch's
        // failure must not blank the dashboard the customer is looking at.
        // Without it a late-failing initial load wiped the claims a newer
        // successful refresh had just populated — the customer watched their
        // own claims disappear.
        if (myGeneration !== overviewGenerationRef.current) {
          return { ok: false, error: message } as ClientOverviewPayload;
        }
        if (!options?.preserveStateOnError) {
          setCases([]);
          setEngagement([]);
        }
        if (!options?.silent) {
          setError(message);
        }
        return { ok: false, error: message } as ClientOverviewPayload;
      } finally {
        setCasesLoading(false);
        setOverviewSettled(true);
        setEngagementLoading(false);
        // Only clear the ref if it's STILL pointing at THIS request. Without
        // this check, refreshOverviewInBackground nulling the ref to force a
        // fresh fetch while an older one is still in flight would let the
        // older request's finally clobber the newer request's reference out
        // from under it once the older one finishes — any third caller
        // arriving in that window would see the ref as empty and start a
        // fourth concurrent fetch instead of piggybacking, defeating the
        // dedup guard this ref exists for.
        if (overviewRequestRef.current === request) {
          overviewRequestRef.current = null;
        }
      }
    })();

    overviewRequestRef.current = request;
    await request;
  }, [handleClientUnauthorized, overviewRequestRef, locale, t]);

  const handleRetry = useCallback(async function handleRetry() {
    if (!user) return;
    setRetryLoading(true);
    try {
      setError(null);
      overviewRequestRef.current = null; // Clear cached request to force fresh load
      await loadOverview(user);
    } finally {
      setRetryLoading(false);
    }
  }, [user, loadOverview]);

  const refreshOverviewInBackground = useCallback((currentUser: ClientSessionUser) => {
    overviewRequestRef.current = null;
    // Bump the generation counter so any still-in-flight older fetch (e.g. the
    // initial useEffect load) will see a mismatch when it completes and skip
    // its setCases call, preventing it from wiping the optimistic case card.
    ++overviewGenerationRef.current;
    void loadOverview(currentUser, { preserveStateOnError: true, silent: true }).catch((err) => {
      captureException(err, { tags: { page: "client_dashboard", fn: "refreshOverviewInBackground" } });
      console.error("[portal] background overview refresh failed:", err instanceof Error ? err.message : err);
    });
  }, [loadOverview]);

  useEffect(() => {
    if (e2eAuthEnabled) {
      const storedToken = window.localStorage.getItem("delaypay.e2eClientToken");
      const identity = getDefaultE2EClientIdentity();
      const token = storedToken || buildE2EClientToken(identity);
      const fakeUser: ClientSessionUser = {
        email: identity.email,
        displayName: identity.name ?? null,
        getIdToken: async () => token,
        isE2E: true,
      };

      window.localStorage.setItem("delaypay.e2eClientToken", token);
      setUser(fakeUser);
      setLoading(false);
      void loadOverview(fakeUser);
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | null = null;

    const cleanup = () => {
      active = false;
      unsubscribe?.();
    };

    (async () => {
      try {
        const auth = await prepareClientAuth();
        if (!active) return cleanup();

        unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (!active) return;
          setUser(firebaseUser);
          setLoading(false);
          if (!firebaseUser) {
            clearClientSessionCookie();
            const target = window.location.pathname + window.location.search;
            router.replace(`/client/login?lang=${locale}&redirect=${encodeURIComponent(target)}`);
            return;
          }

          setForm((prev) => ({ ...prev, clientName: prev.clientName || firebaseUser.displayName || "" }));
          await loadOverview(firebaseUser);
        });
      } catch (err: unknown) {
        if (!active) return;
        captureException(err, { tags: { page: "client_dashboard", fn: "authInit" } });
        const missing = getMissingClientFirebaseKeys();
        setError(
          missing.length
            ? t("portal.authNotConfigured", { missing: missing.join(", ") })
            : t("portal.authInitError"),
        );
        setLoading(false);
      }
    })();

    return cleanup;
  }, [e2eAuthEnabled, loadOverview, router, t]);

  // Setup polling for real-time updates to cases and engagement items
  useEffect(() => {
    if (!user) return;

    // Poll every 60 seconds (was 12 s — each call fires 4 Firestore queries)
    const pollInterval = setInterval(() => {
      // Skip polling while the tab is backgrounded — don't burn Firestore reads
      // for a portal tab nobody is looking at.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void loadOverview(user, { preserveStateOnError: true, silent: true });
    }, 60_000);

    return () => clearInterval(pollInterval);
  }, [user, loadOverview]);

  // Warn user if they have unsaved form changes before navigating away
  useEffect(() => {
    const isFormModified =
      form.clientName !== initialForm.clientName ||
      form.phone !== initialForm.phone ||
      form.airline !== initialForm.airline ||
      form.flightNumber !== initialForm.flightNumber ||
      form.departureDate !== initialForm.departureDate ||
      form.origin !== initialForm.origin ||
      form.destination !== initialForm.destination ||
      form.disruptionType !== initialForm.disruptionType ||
      form.delayHours !== initialForm.delayHours ||
      form.passengerCount !== initialForm.passengerCount ||
      form.bookingReference !== initialForm.bookingReference ||
      form.ticketNumber !== initialForm.ticketNumber ||
      form.notes !== initialForm.notes;

    if (!isFormModified || submitLoading) {
      return;
    }

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t("portal.unsavedChanges");
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [form, submitLoading, t]);

  async function copyNudgeMessage(item: ClientEngagementItem) {
    try {
      await navigator.clipboard.writeText(`${item.title}\n${item.message}`);
      setCopiedNudgeCaseId(item.caseId);
      window.setTimeout(() => setCopiedNudgeCaseId(null), 1800);
    } catch (err) {
      captureException(err, { tags: { page: "client_dashboard", fn: "copyNudgeMessage" } });
      setCopiedNudgeCaseId(null);
    }
  }

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    if (submitInFlightRef.current) return;

    // Read live DOM values via FormData rather than React's `form` state.
    // Playwright's CDP fill() sets input DOM values faster than React's async
    // render cycle commits the matching state updates. Reading from FormData
    // ensures we always capture what the user (or test) actually typed,
    // regardless of whether React has re-rendered since the last keystroke.
    const fd = new FormData(event.currentTarget);
    // Native FormData is authoritative for what is visible in the form, but
    // a fast React re-render can temporarily detach an uncontrolled field.
    // Fall back to the latest state snapshot so a filled IATA field cannot be
    // lost between the final keystroke and submit.
    const gs = (key: keyof QuickClaimFormData) => {
      const domValue = fd.get(key);
      if (typeof domValue === "string" && domValue.trim()) return domValue;
      const stateValue = form[key];
      return typeof stateValue === "string" ? stateValue : String(stateValue ?? "");
    };
    // Passengers is an array held entirely in React state (the editor writes
    // through onChange; the <input> fields are typed by the user but their
    // values are collected per-passenger into state, not into native FormData
    // under a single string key). Read it from the latest `form` snapshot;
    // the legacy `passengerCount` is derived from `passengers.length` so the
    // two cannot disagree.
    const passengerList = form.passengers.length > 0 ? form.passengers : [makeEmptyPassenger()];
    // Passenger 1 only shows the client's name as a placeholder; default a
    // blank primary name to it so the common single-passenger claim does not
    // fail the server's fullName min(1).
    const clientNameValue = gs("clientName").trim();
    const passengersFromState = passengerList.map((p, index) =>
      index === 0 && !p.fullName.trim() && clientNameValue ? { ...p, fullName: clientNameValue } : p,
    );
    const submittedForm: QuickClaimFormData & { delayBucket: string; baggageStatus: string } = {
      clientName: gs("clientName"),
      phone: gs("phone"),
      airline: gs("airline"),
      flightNumber: gs("flightNumber"),
      departureDate: gs("departureDate"),
      origin: gs("origin"),
      destination: gs("destination"),
      disruptionType: (gs("disruptionType") || "delayed") as QuickClaimFormData["disruptionType"],
      expenseCause: (form as any).expenseCause,
      delayHours: gs("delayHours"),
      delayBucket: gs("delayBucket"),
      baggageStatus: gs("baggageStatus"),
      cancellationNoticeDays: gs("cancellationNoticeDays"),
      passengers: passengersFromState,
      passengerCount: String(passengersFromState.length),
      bookingReference: gs("bookingReference"),
      ticketNumber: gs("ticketNumber"),
      notes: notesWithEstimatedExpense(gs("notes"), estimatedExpenses),
    };

    if (
      !submittedForm.clientName ||
      !submittedForm.phone ||
      !submittedForm.airline ||
      !submittedForm.flightNumber ||
      !submittedForm.departureDate
    ) {
      setError(t("dashboard.error.requiredFields"));
      return;
    }

    const formValidation = validateQuickClaimForm(submittedForm, t);
    if (!formValidation.valid) {
      setError(formValidation.errors[0].message);
      const first=formValidation.errors[0];
      const formElement=event.currentTarget;
      requestAnimationFrame(()=>{const target=first.field==="passengers"?formElement.querySelector<HTMLInputElement>('[data-testid$="-dob"]:not([value]), [data-testid$="-dob"]'):formElement.elements.namedItem(first.field);if(target instanceof HTMLElement){target.focus();target.scrollIntoView({block:"center",behavior:"smooth"});}});
      return;
    }

    // Server-side Zod coerces a blank delayHours to 0 and rejects with an
    // English-only 400 that was shown raw in the Hebrew UI — validate here
    // with an in-locale message instead (Queen P2 finding).
    if (
      submittedForm.disruptionType === "delayed" &&
      !DELAY_WINDOWS.some(window => window.value === submittedForm.delayBucket) &&
      Number(submittedForm.delayHours || 0) < 3
    ) {
      setError(t("dashboard.error.delayHoursMin"));
      return;
    }

    submitInFlightRef.current = true;
    setSubmitLoading(true);
    setError(null);
    setSuccess(null);
    const editingCase = PORTAL_V2 ? submittedClaim : null;
    try {
      const token = await user.getIdToken();
      if (editingCase) {
        const response = await fetch("/api/client/quick-claim", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...submittedForm, caseDocId: editingCase.caseDocId }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok || !result.case) throw new Error(t("portal.claimFailed"));
        setCases(previous => previous.map(item => item.id === editingCase.caseDocId ? result.case : item));
        setForm(previous => ({ ...previous, ...submittedForm }));
        setSubmittedSummary({
          claimType: flowTranslator(locale)(`claimType.${submittedForm.disruptionType}`),
          clientName: submittedForm.clientName,
          flight: submittedForm.flightNumber,
          route: [submittedForm.origin, submittedForm.destination].join(" → "),
          date: submittedForm.departureDate,
        });
        setSubmittedClaim({
          ...editingCase, claimType: submittedForm.disruptionType, baggageStatus: submittedForm.baggageStatus,
          revision: (editingCase.revision ?? 0) + 1,
        });
        return;
      }
      // Attach the captured Google Ads / UTM attribution so the gclid travels
      // with the lead and can be uploaded to Google Ads as an offline conversion.
      const attribution = getStoredAttribution();
      // GA4 cannot dedup generate_lead: when this document's gtag will report
      // the lead itself, tell the server so it skips its Measurement Protocol
      // copy (same contract as the /02 landing → /api/intake).
      let ga4LeadReportedByBrowser = false;
      try {
        ga4LeadReportedByBrowser = getAnalytics().willReportLeadInBrowser();
      } catch {
        ga4LeadReportedByBrowser = false;
      }
      const res = await fetch("/api/client/quick-claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...submittedForm,
          ...(attribution ? { attribution } : {}),
          ...(ga4LeadReportedByBrowser ? { ga4LeadReportedByBrowser: true } : {}),
        }),
      });

      if (res.status === 401) {
        await handleClientUnauthorized();
        return;
      }

      // Read the body on failure too: the route names the input at fault.
      const payload = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string; field?: string; caseId?: string; caseDocId?: string; duplicate?: boolean; existingCaseId?: string; existingCaseDocId?: string };

      if (!payload.ok) {
        const failure = quickClaimErrorFromResponse(res.status, payload);
        throw new QuickClaimRejectedError(failure.message ?? t("portal.claimFailed"), failure.field);
      }

      if (payload.duplicate) {
        try {
          claimFunnelRef.current?.submitted("duplicate", payload.existingCaseDocId);
        } catch {
          // analytics is best-effort
        }
        setSuccess("✅ " + t("portal.duplicateExists", { caseId: payload.existingCaseId ?? "existing" }));
        if (payload.existingCaseDocId) {
          setCases((prev) => {
            const existingIndex = prev.findIndex((item) => item.id === payload.existingCaseDocId);
            if (existingIndex < 0) return prev;
            const next = [...prev];
            const [existingCase] = next.splice(existingIndex, 1);
            next.unshift(existingCase);
            return next;
          });
        }
      } else {
        setSuccess("✅ " + t("portal.claimCreated", { caseId: payload.caseId ?? "new" }));
        if (payload.caseDocId && payload.caseId) {
          const optimisticCase = buildOptimisticClientCase(payload.caseDocId, payload.caseId, submittedForm, t("portal.flightProof"));
          optimisticCaseIdsRef.current.add(optimisticCase.id);
          setCases((prev) => [optimisticCase, ...prev.filter((item) => item.id !== optimisticCase.id)]);
          setSubmittedClaim({ caseId: payload.caseId, caseDocId: payload.caseDocId, claimType: submittedForm.disruptionType, baggageStatus: submittedForm.baggageStatus });
          setSubmittedSummary({
            claimType: flowTranslator(locale)(`claimType.${submittedForm.disruptionType}`),
            clientName: submittedForm.clientName,
            flight: [submittedForm.airline, submittedForm.flightNumber].filter(Boolean).join(" · "),
            route: [submittedForm.origin, submittedForm.destination].filter(Boolean).join(" ← "),
            date: submittedForm.departureDate,
          });
        }
        // Fire conversion tracking only for a genuinely new case — a
        // duplicate submission is not a new lead and would double-count.
        // eventID = caseDocId dedupes the browser Pixel fire against the
        // server-side Meta CAPI Lead upload the quick-claim route fires
        // under the same key, so Meta counts one real conversion, not two.
        //
        // Since 2026-10-09 the tags load on /client, so these now really fire
        // (with consent). Dedup keys, each matching the server-side copy:
        //   Meta  Lead          eventID        = caseDocId  (meta-conversions.ts metaEventIdFor "lead")
        //   Ads   conversion    transaction_id = `${caseDocId}:lead` (conversions.ts default orderId)
        //   GA4   generate_lead — no dedup in GA4; the server skips its MP copy
        //                         when the body said ga4LeadReportedByBrowser.
        try {
          const caseDocId = payload.caseDocId ?? null;
          claimFunnelRef.current?.submitted("created", caseDocId);
          if (caseDocId) {
            getAnalytics().trackCaseSubmission(caseDocId, 0);
            // Skipped without a server id: a shared fallback id would make
            // Google Ads / Meta collapse every such lead into one.
            getAnalytics().reportLeadConversion(portalLeadTransactionId(caseDocId), "portal_quick_claim");
            trackMetaPixelEvent("Lead", { content_name: "quick_claim" }, { eventID: portalLeadMetaEventId(caseDocId) });
          }
        } catch {
          // analytics is best-effort — never block the claim flow
        }
        claimFunnelRef.current = new ClaimFunnel("portal_quick_claim");
      }

      if (PORTAL_V2 && !payload.duplicate) setForm(previous => ({ ...previous, ...submittedForm }));
      else {
        setForm({ ...initialForm, clientName: submittedForm.clientName });
        setFormEpoch(value => value + 1);
      }
      refreshOverviewInBackground(user);
    } catch (err: unknown) {
      if (err instanceof Error) console.error("[client create-claim]", err.message);
      captureException(err, { tags: { page: "client_dashboard", fn: "createClaim" } });
      if (err instanceof QuickClaimRejectedError) {
        setError(err.message);
        focusQuickClaimField(err.field);
      } else {
        setError(t("portal.claimFailed"));
      }
    } finally {
      submitInFlightRef.current = false;
      setSubmitLoading(false);
    }
  }

  async function uploadDocuments(
    caseDocId: string,
    options?: { acknowledgeMismatch?: boolean; replacesReceiptId?: string; files?: File[]; kind?: UploadDocumentKind; passengerIds?: string[] },
  ) {
    if (!user) return;
    if (uploadInFlightRef.current[caseDocId]) return;
    if (options?.files) uploadPassengerIdsRef.current[caseDocId] = options.passengerIds;
    const passengerIds = options?.passengerIds ?? uploadPassengerIdsRef.current[caseDocId];
    const files = options?.files ?? filesByCase[caseDocId] ?? [];
    const documentKind = options?.kind ?? uploadKindByCase[caseDocId] ?? "boarding_pass";
    if (!files.length) {
      setError(t("dashboard.error.selectFile"));
      return;
    }

    // Validate total file size before starting upload (avoid 100MB+ transfers)
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_DOCUMENT_UPLOAD_BYTES) {
      // If only one file, show its name; if multiple, show total size
      const errorMsg = files.length === 1
        ? getFileSizeErrorMessage(files[0].name, locale)
        : t("portal.filesTooLarge", { max: "10", actual: (totalBytes / 1_048_576).toFixed(1) });
      setError(errorMsg);
      return;
    }

    // Validate mime types before starting upload
    for (const file of files) {
      if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.type)) {
        setError(getInvalidMimeTypeErrorMessage(file.name, locale));
        return;
      }
    }

    uploadInFlightRef.current[caseDocId] = true;
    setUploadingByCase((prev) => ({ ...prev, [caseDocId]: true }));
    setUploadProgressByCase((prev) => ({ ...prev, [caseDocId]: { loaded: 0, total: files.reduce((sum, f) => sum + f.size, 0) } }));
    setError(null);
    setSuccess(null);

    try {
      const token = await user.getIdToken();

      // Vercel rejects request bodies over 4.5 MB with a 413 before our route
      // runs: shrink large photos first, then send in request-sized batches.
      const prepared = await prepareFilesForUpload(files);
      if (prepared.oversize) {
        setError(getRequestTooLargeMessage(prepared.oversize.name, locale));
        return;
      }
      const batches = splitIntoRequestBatches(prepared.files);
      const grandTotalBytes = prepared.files.reduce((sum, f) => sum + f.size, 0);
      setUploadProgressByCase((prev) => ({ ...prev, [caseDocId]: { loaded: 0, total: grandTotalBytes } }));

      type UploadPayload = {
        ok: boolean;
        error?: string;
        uploaded?: UploadedDocumentReceipt[];
        mismatches?: UploadMismatchWarning[];
      };

      // EDGE CASE FIX #2: Add 30s timeout + orphaned file cleanup
      // Without timeout, network drops after Storage writes but before Firestore
      // tx completes leave files orphaned (accessible in /client/documents but
      // not linked to the case). Adding AbortController timeout (30s = typical
      // upload time for 10MB file on 3G) + catching errors lets us retry and
      // eventually cleanup after max retries exhausted. The backend cleanup
      // cron ("document-orphan-gc") runs daily to catch any that slip through.
      const uploadTimeoutMs = 30_000;
      const uploadAbortController = new AbortController();
      let uploadTimeoutHandle: ReturnType<typeof setTimeout>;

      // Use XMLHttpRequest to track upload progress
      const sendBatch = (formData: FormData, loadedBefore: number) => new Promise<UploadPayload>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        uploadTimeoutHandle = setTimeout(() => { uploadAbortController.abort(); xhr.abort(); }, uploadTimeoutMs);

        // P2 FIX: Define cleanup to remove event listeners after promise settles
        const cleanup = () => {
          xhr.upload.removeEventListener("progress", onProgress);
          xhr.removeEventListener("load", onLoad);
          xhr.removeEventListener("error", onError);
          xhr.removeEventListener("abort", onAbort);
        };

        const onProgress = (e: ProgressEvent) => {
          if (e.lengthComputable) {
            setUploadProgressByCase((prev) => ({ ...prev, [caseDocId]: { loaded: loadedBefore + e.loaded, total: Math.max(grandTotalBytes, loadedBefore + e.total) } }));
          }
        };

        const onLoad = () => {
          clearTimeout(uploadTimeoutHandle);
          cleanup();
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText) as UploadPayload;
              resolve(data);
            } catch (err) {
              reject(new Error(t("portal.uploadError")));
            }
          } else if (xhr.status === 401) {
            reject(new Error("unauthorized"));
          } else if (xhr.status === 413) {
            reject(new Error("request_too_large"));
          } else {
            reject(new Error(t("portal.uploadError")));
          }
        };

        const onError = () => {
          clearTimeout(uploadTimeoutHandle);
          cleanup();
          reject(new Error(t("portal.connectionError")));
        };

        const onAbort = () => {
          clearTimeout(uploadTimeoutHandle);
          cleanup();
          // Differentiate timeout from user cancel — timeout should hint at retry
          const reason = uploadAbortController.signal.aborted ? "timeout" : "abort";
          reject(new Error(reason === "timeout" ? t("portal.uploadTimeout") : t("portal.uploadCancelled")));
        };

        xhr.upload.addEventListener("progress", onProgress);
        xhr.addEventListener("load", onLoad);
        xhr.addEventListener("error", onError);
        xhr.addEventListener("abort", onAbort);

        xhr.open("POST", `/api/client/cases/${caseDocId}/documents`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.send(formData);
      });

      // Note: 401 is handled in the XMLHttpRequest error handler above.

      const allUploaded: UploadedDocumentReceipt[] = [];
      let loadedBefore = 0;
      for (let index = 0; index < batches.length; index++) {
        const batch = batches[index];
        const formData = new FormData();
        formData.set("documentKind", documentKind);
        if (options?.replacesReceiptId) formData.set("replacesReceiptId", options.replacesReceiptId);
        for (const id of passengerIds ?? []) formData.append("passengerIds", id);
        if (options?.acknowledgeMismatch) {
          formData.set("acknowledgeMismatch", "true");
        }
        for (const file of batch) {
          formData.append("files", file);
        }

        let batchPayload: UploadPayload;
        try {
          batchPayload = await sendBatch(formData, loadedBefore);
        } catch (batchErr) {
          if (allUploaded.length) {
            // Earlier batches are already saved: keep the unsent files selected for retry.
            setFilesByCase((prev) => ({ ...prev, [caseDocId]: batches.slice(index).flat() }));
            setRecentUploadsByCase((prev) => ({ ...prev, [caseDocId]: allUploaded }));
            refreshOverviewInBackground(user);
          }
          if (batchErr instanceof Error && batchErr.message === "request_too_large") {
            setError(getRequestTooLargeMessage(batch[0]?.name ?? "", locale));
            return;
          }
          throw batchErr;
        }
        loadedBefore += batch.reduce((sum, f) => sum + f.size, 0);

        if (batchPayload.ok === false && batchPayload.error === "looks_wrong" && batchPayload.mismatches?.length) {
          // Keep only the files not yet stored, so acknowledging the warning
          // doesn't re-upload the batches that already went through.
          setFilesByCase((prev) => ({ ...prev, [caseDocId]: batches.slice(index).flat() }));
          setUploadWarningsByCase((prev) => ({ ...prev, [caseDocId]: batchPayload.mismatches ?? [] }));
          if (allUploaded.length) {
            setRecentUploadsByCase((prev) => ({ ...prev, [caseDocId]: allUploaded }));
            refreshOverviewInBackground(user);
          }
          return;
        }

        if (!batchPayload.ok) {
          if (allUploaded.length) {
            setFilesByCase((prev) => ({ ...prev, [caseDocId]: batches.slice(index).flat() }));
            setRecentUploadsByCase((prev) => ({ ...prev, [caseDocId]: allUploaded }));
            refreshOverviewInBackground(user);
          }
          throw new Error(batchPayload.error || t("portal.uploadError"));
        }
        allUploaded.push(...(batchPayload.uploaded ?? []));
      }

      const payload: UploadPayload = { ok: true, uploaded: allUploaded };

      setUploadWarningsByCase((prev) => ({ ...prev, [caseDocId]: [] }));
      setRecentUploadsByCase((prev) => ({ ...prev, [caseDocId]: payload.uploaded ?? [] }));

      setSuccess(t("portal.filesUploaded", { count: String(payload.uploaded?.length ?? files.length) }));
      try {
        getAnalytics().trackDocumentUpload(caseDocId, documentKind);
        trackMetaPixelCustomEvent("UploadDocument", { document_kind: documentKind });
      } catch {
        // analytics is best-effort — never block the upload flow
      }
      if (payload.uploaded?.length) {
        setCases((prev) =>
          prev.map((item) => {
            if (item.id !== caseDocId) return item;
            const nextDocuments = [...item.customerDocuments];
            for (const uploadedDocument of payload.uploaded ?? []) {
              const existingIndex = nextDocuments.findIndex((document) => document.id === uploadedDocument.id);
              const nextDocument = {
                ...uploadedDocument,
                id: uploadedDocument.id,
                fileName: uploadedDocument.fileName,
                documentKind: uploadedDocument.documentKind,
                passengerIds: uploadedDocument.passengerIds,
                pendingReview: uploadedDocument.pendingReview,
                uploadedAt: uploadedDocument.uploadedAt,
                url: uploadedDocument.url ?? undefined,
              };
              if (existingIndex >= 0) {
                nextDocuments[existingIndex] = nextDocument;
              } else {
                nextDocuments.push(nextDocument);
              }
            }
            return {
              ...item,
              customerDocuments: nextDocuments,
            };
          }),
        );
      }
      setFilesByCase((prev) => ({ ...prev, [caseDocId]: [] }));
      setUploadKindByCase((prev) => ({ ...prev, [caseDocId]: "boarding_pass" }));
      refreshOverviewInBackground(user);
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message === "unauthorized") {
          await handleClientUnauthorized();
          return;
        }
        captureException(err, { tags: { page: "client_dashboard", fn: "uploadDocuments" } });
        console.error("[client upload] error", {
          caseId: caseDocId,
          fileCount: files.length,
          totalBytes: files.reduce((sum, f) => sum + f.size, 0),
          message: err.message,
          timestamp: new Date().toISOString(),
        });
      }
      setError(t("portal.uploadError"));
    } finally {
      uploadInFlightRef.current[caseDocId] = false;
      setUploadingByCase((prev) => ({ ...prev, [caseDocId]: false }));
      setUploadProgressByCase((prev) => ({ ...prev, [caseDocId]: { loaded: 0, total: 0 } }));
    }
  }

  async function sendCaseMessage(caseDocId: string) {
    if (!user) return;
    if (sendMessageInFlightRef.current[caseDocId]) return;
    const message = (messageDraftByCase[caseDocId] ?? "").trim();
    if (!message) {
      setError(t("dashboard.error.emptyMessage"));
      return;
    }
    if (message.length > 5000) {
      setError(t("dashboard.error.messageTooLong"));
      return;
    }

    sendMessageInFlightRef.current[caseDocId] = true;
    setSendingMessageByCase((prev) => ({ ...prev, [caseDocId]: true }));
    setError(null);
    setSuccess(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/client/cases/${caseDocId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject: t("portal.portalMessage"),
          message,
        }),
      });

      if (res.status === 401) {
        await handleClientUnauthorized();
        return;
      }

      const payload = !res.ok
        ? ({ ok: false } as { ok: boolean })
        : (await res.json()) as { ok: boolean };

      if (!payload.ok) {
        throw new Error(t("portal.messageFailed"));
      }
      trackPortalAction("portal_message_sent", { surface: "dashboard" });

      setMessageDraftByCase((prev) => ({ ...prev, [caseDocId]: "" }));
      setSuccess(t("dashboard.success.messageSent"));
      refreshOverviewInBackground(user);
    } catch (err: unknown) {
      if (err instanceof Error) console.error("[client send-message]", err.message);
      captureException(err, { tags: { page: "client_dashboard", fn: "sendMessage" } });
      setError(t("portal.messageFailed"));
    } finally {
      sendMessageInFlightRef.current[caseDocId] = false;
      setSendingMessageByCase((prev) => ({ ...prev, [caseDocId]: false }));
    }
  }

  async function logout() {
    clearClientSessionCookie();
    if (user?.isE2E) {
      window.localStorage.removeItem("delaypay.e2eClientToken");
      router.replace("/client/login");
      return;
    }

    const auth = await prepareClientAuth();
    // Server-side refresh-token revocation BEFORE local signOut. If the
    // server call fails we still proceed — better local-only logout than
    // a stuck UI.
    try {
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (err) {
      captureException(err, { tags: { page: "client_dashboard", fn: "logout_revoke" } });
    }
    await signOut(auth);
    router.replace("/client/login");
  }

  // The form mounts only after the overview settles when a new customer is auto-routed to it, so wait for that.
  const hashScrolledRef = useRef(false);
  useEffect(() => {
    if (loading || hashScrolledRef.current || window.location.hash !== "#new-claim-form") return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById("new-claim-form");
      if (!target) return;
      hashScrolledRef.current = true;
      target.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, casesLoaded, overviewSettled]);

  if (loading) {
    return (
      <main style={{ padding: 20, maxWidth: 1040, margin: "0 auto", direction }} data-testid="client-portal-page">
        <DashboardSkeleton />
      </main>
    );
  }

  // A customer with no claims goes straight to the claim form; one with claims sees the dashboard. An explicit
  // `newClaim=1` (in-portal "new claim" buttons) always opens the form.
  const showClaimForm = creatingClaim || (PORTAL_V2 && casesLoaded && cases.length === 0);

  return (
    <>
    <Suspense fallback={null}><ClaimIntentSync onChange={onClaimIntentChange} onType={setMarketingType} onExpenses={setEstimatedExpenses} /></Suspense>
    {PORTAL_V2 && <PortalHeaderV2 userEmail={user?.email ?? null} onLogout={logout} />}
    <main
      style={PORTAL_V2 ? { padding: "40px 24px", maxWidth: 896, margin: "0 auto", direction } : { padding: 20, maxWidth: 1040, margin: "0 auto", direction }}
      data-testid="client-portal-page"
    >
      {!PORTAL_V2 && <ClientHeader userEmail={user?.email ?? null} userName={user?.displayName ?? null} onLogout={logout} />}

      {PORTAL_V2 && !showClaimForm && !submittedClaim && <div className="dp-approved-page-heading"><h1>{t("approved.dashboardTitle")}</h1><p>{t("approved.dashboardBody")}</p></div>}
      {error && (
        <Alert
          type="error"
          testId="client-portal-error"
          onClose={() => setError(null)}
          action={{
            label: t("action.retry"),
            onClick: handleRetry,
            loading: retryLoading,
          }}
        >
          {error}
        </Alert>
      )}
      {success && (
        <Alert type="success" testId="client-portal-success" onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {(!PORTAL_V2 || (!showClaimForm && !submittedClaim)) && <StatsSummary totalCases={cases.length} openCases={openCases.length} tiles={PORTAL_V2} />}

      {cases.length > 0 && (!PORTAL_V2 || (!showClaimForm && !submittedClaim)) && (
        <CaseProgressList
          cases={cases.map((item) => ({
            id: item.id,
            caseId: item.caseId,
            caseNumber: item.caseNumber,
            status: item.status,
            documentCount: item.customerDocuments.filter(d => !d.storageMissing && !d.pendingReview && d.documentKind && d.documentKind !== "other").length,
            airline: item.airline,
            flightNumber: item.flightNumber,
            airlineCaseRef: item.airlineCaseRef,
            paidOutcome: item.portalStage ? item.portalStage.stage === 3 : item.status === "Paid",
          }))}
        />
      )}

      {!PORTAL_V2 && (
        <>
      <OnboardingChecklist
        cases={cases}
        onUploadClick={() => {
          document
            .getElementById("client-cases-list")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      {/* Quick Access Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: 12, marginBottom: 24 }}>
        <button
          type="button"
          data-testid="jump-to-quick-claim"
          onClick={() => {
            document
              .querySelector('[data-testid="quick-claim-form"]')
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          style={{
            padding: 18,
            border: `1px solid ${colors.primary}`,
            borderRadius: 14,
            background: colors.primary,
            boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
            textAlign: "start",
            color: colors.white,
            cursor: "pointer",
            transition: "box-shadow 0.2s, transform 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 12px 24px rgba(16,24,40,0.18)";
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 1px 2px rgba(16,24,40,0.06)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <div style={{ marginBottom: 10 }}><Icon name="Plus" size={24} /></div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t("cases.newClaim")}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{t("card.newClaim.subtitle")}</div>
        </button>

        <Link
          href="/client/notifications"
          style={{
            padding: 18,
            border: `1px solid ${colors.border}`,
            borderRadius: 14,
            background: colors.white,
            boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
            textDecoration: "none",
            color: colors.text,
            transition: "box-shadow 0.2s, border-color 0.2s, transform 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 12px 24px rgba(16,24,40,0.10)";
            e.currentTarget.style.borderColor = colors.primary;
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 1px 2px rgba(16,24,40,0.06)";
            e.currentTarget.style.borderColor = colors.border;
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <div style={{ marginBottom: 10, color: colors.primary }}><Icon name="Bell" size={24} /></div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t("nav.notifications")}</div>
          <div style={{ fontSize: 12, color: colors.textMuted }}>{t("card.notifications.subtitle")}</div>
        </Link>

        <Link
          href="/client/payments"
          style={{
            padding: 18,
            border: `1px solid ${colors.border}`,
            borderRadius: 14,
            background: colors.white,
            boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
            textDecoration: "none",
            color: colors.text,
            transition: "box-shadow 0.2s, border-color 0.2s, transform 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 12px 24px rgba(16,24,40,0.10)";
            e.currentTarget.style.borderColor = colors.primary;
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 1px 2px rgba(16,24,40,0.06)";
            e.currentTarget.style.borderColor = colors.border;
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <div style={{ marginBottom: 10, color: colors.primary }}><Icon name="CreditCard" size={24} /></div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t("nav.payments")}</div>
          <div style={{ fontSize: 12, color: colors.textMuted }}>{t("card.payments.subtitle")}</div>
        </Link>

        <Link
          href="/client/help"
          style={{
            padding: 18,
            border: `1px solid ${colors.border}`,
            borderRadius: 14,
            background: colors.white,
            boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
            textDecoration: "none",
            color: colors.text,
            transition: "box-shadow 0.2s, border-color 0.2s, transform 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 12px 24px rgba(16,24,40,0.10)";
            e.currentTarget.style.borderColor = colors.primary;
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 1px 2px rgba(16,24,40,0.06)";
            e.currentTarget.style.borderColor = colors.border;
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <div style={{ marginBottom: 10, color: colors.primary }}><Icon name="HelpCircle" size={24} /></div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t("nav.help")}</div>
          <div style={{ fontSize: 12, color: colors.textMuted }}>{t("card.help.subtitle")}</div>
        </Link>

        <Link
          href="/client/account"
          style={{
            padding: 18,
            border: `1px solid ${colors.border}`,
            borderRadius: 14,
            background: colors.white,
            boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
            textDecoration: "none",
            color: colors.text,
            transition: "box-shadow 0.2s, border-color 0.2s, transform 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 12px 24px rgba(16,24,40,0.10)";
            e.currentTarget.style.borderColor = colors.primary;
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 1px 2px rgba(16,24,40,0.06)";
            e.currentTarget.style.borderColor = colors.border;
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <div style={{ marginBottom: 10, color: colors.primary }}><Icon name="Settings" size={24} /></div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t("nav.settings")}</div>
          <div style={{ fontSize: 12, color: colors.textMuted }}>{t("card.account.subtitle")}</div>
        </Link>

        <Link
          href="/client/help#power-of-attorney"
          style={{
            padding: 18,
            border: `1px solid ${colors.border}`,
            borderRadius: 14,
            background: colors.white,
            boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
            textDecoration: "none",
            color: colors.text,
            transition: "box-shadow 0.2s, border-color 0.2s, transform 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 12px 24px rgba(16,24,40,0.10)";
            e.currentTarget.style.borderColor = colors.primary;
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 1px 2px rgba(16,24,40,0.06)";
            e.currentTarget.style.borderColor = colors.border;
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <div style={{ marginBottom: 10, color: colors.primary }}><Icon name="ClipboardList" size={24} /></div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t("card.poa.title")}</div>
          <div style={{ fontSize: 12, color: colors.textMuted }}>{t("card.poa.subtitle")}</div>
        </Link>
      </div>

      <EngagementSection
        items={engagement}
        loading={engagementLoading}
        onCopy={copyNudgeMessage}
        copiedCaseId={copiedNudgeCaseId}
      />
        </>
      )}

      {/* New design: the same smart-capture + claim form, as step 1 of a five-step flow whose later steps
          (documents, power of attorney, payout details) attach to the case this form creates. With the
          flag off ClaimFlow renders its children and nothing else. */}
      {PORTAL_V2 && overviewSettled && !showClaimForm && !submittedClaim && cases.length === 0 && <section className="dp-approved-welcome">
        <h2>{t("v2.cases.title")}</h2>
        <p>{t("approved.emptyCases")}</p>
        <Link className="dp-approved-action" href={`/client/new-claim?lang=${locale}&force=1`}>{t("cases.newClaim")}</Link>
      </section>}
      {(!PORTAL_V2 || showClaimForm || submittedClaim) && <>
      {PORTAL_V2 && cases.length > 0 && <Link className="dp-approved-back" href={`/client?lang=${locale}`} onClick={() => setSubmittedClaim(null)}>{direction === "rtl" ? "→" : "←"} {t("v2.cases.title")}</Link>}
      {PORTAL_V2 && estimatedExpenses && <aside className="dp-approved-expense-context"><strong>{websiteText(locale,"expenseSeparate")}: <bdi>{new Intl.NumberFormat(locale,{style:"currency",currency:estimatedExpenses.currency,currencyDisplay:"code",maximumFractionDigits:3}).format(estimatedExpenses.amount)}</bdi></strong><p>{websiteText(locale,"expenseClaimNote")}</p></aside>}
      <div id="new-claim-form" style={{ scrollMarginTop: 24 }} />
      <DraftClaimIntake enabled={PORTAL_V2} form={form} onChange={setForm} getIdToken={() => user ? user.getIdToken() : Promise.reject(new Error("not signed in"))} locale={locale}
        onExit={() => { setSubmittedClaim(null); router.push(`/client?lang=${locale}`); }}>
      <ClaimFlow
        claimType={submittedClaim?.claimType ?? form.disruptionType}
        baggageStatus={submittedClaim?.baggageStatus}
        enabled={PORTAL_V2}
        caseDocId={submittedClaim?.caseDocId ?? null}
        caseId={submittedClaim?.caseId ?? null}
        detailsRevision={submittedClaim?.revision ?? 0}
        onReviewEdits={(values, people) => setForm(previous => ({
          ...previous, ...values, passengers: previous.passengers.map(person => {
            const revised = people?.find(item => item.id === person.id);
            return revised ? { ...person, fullName: revised.fullName, dateOfBirth: revised.dateOfBirth } : person;
          }),
        }))}
        getIdToken={() => (user ? user.getIdToken() : Promise.reject(new Error("not signed in")))}
        locale={locale}
        t={t}
        onFinish={() => {
          setSubmittedClaim(null);
          setForm({ ...initialForm, clientName: form.clientName });
          if (PORTAL_V2) router.push(`/client?lang=${locale}`);
        }}
        summary={submittedSummary}
        documentCount={new Set([
          ...(cases.find((item) => item.id === submittedClaim?.caseDocId)?.customerDocuments ?? []),
          ...(recentUploadsByCase[submittedClaim?.caseDocId ?? ""] ?? []),
        ].map(document => document.id)).size}
        bankDocumentUploaded={(() => {
          const flowCaseId = submittedClaim?.caseDocId ?? "";
          const kinds = [
            ...(cases.find((item) => item.id === flowCaseId)?.customerDocuments ?? []).map((doc) => doc.documentKind),
            ...(recentUploadsByCase[flowCaseId] ?? []).map((doc) => doc.documentKind),
          ];
          return kinds.includes("iban_letter");
        })()}
        onBankDocument={(files) => {
          const flowCaseId = submittedClaim?.caseDocId ?? "";
          if (!flowCaseId) return;
          const problem = validateSelectedDocuments(files, locale, t);
          if (problem) {
            setError(problem);
            return;
          }
          setUploadKindByCase((prev) => ({ ...prev, [flowCaseId]: "iban_letter" }));
          setFilesByCase((prev) => ({ ...prev, [flowCaseId]: files }));
          void uploadDocuments(flowCaseId, { files, kind: "iban_letter" });
        }}
        documents={(() => {
          const flowCaseId = submittedClaim?.caseDocId ?? "";
          const heldKinds = [
            ...(cases.find((item) => item.id === flowCaseId)?.customerDocuments ?? []).map((doc) => doc.documentKind),
            ...(recentUploadsByCase[flowCaseId] ?? []).map((doc) => doc.documentKind),
          ];
          const flowCase = cases.find((item) => item.id === flowCaseId);
          const passengers = flowCase?.passengers ?? [];
          const documents = [...new Map([...(flowCase?.customerDocuments ?? []), ...(recentUploadsByCase[flowCaseId] ?? [])].map((doc) => [doc.id, doc])).values()];
          const localCoverage = passengerDocumentCoverage({ passengers, passengerCount: passengers.length, customerDocuments: documents });
          // Preserve server-confirmed legacy OCR coverage until an upload changes the documents.
          const coverage = recentUploadsByCase[flowCaseId]?.length ? localCoverage : flowCase?.passengerDocuments ?? localCoverage;
          return {
            passengers,
            documents,
            coverage,
            onPick: (kind: ClaimDocumentKind, files: File[], passengerIds?: string[], replacesReceiptId?: string) => {
              if (!flowCaseId) return;
              const problem = validateSelectedDocuments(files, locale, t);
              if (problem) {
                setError(problem);
                return;
              }
              setError(null);
              setUploadWarningsByCase((prev) => ({ ...prev, [flowCaseId]: [] }));
              setUploadKindByCase((prev) => ({ ...prev, [flowCaseId]: kind }));
              setFilesByCase((prev) => ({ ...prev, [flowCaseId]: files }));
              void uploadDocuments(flowCaseId, { files, kind, passengerIds, replacesReceiptId });
            },
            uploadedKinds: new Set(heldKinds),
            uploadingKind: uploadKindByCase[flowCaseId] ?? null,
            onAcknowledgeWarning: () => {
              if (flowCaseId) void uploadDocuments(flowCaseId, { acknowledgeMismatch: true });
            },
            uploading: Boolean(uploadingByCase[flowCaseId]),
            progress: uploadProgressByCase[flowCaseId],
            receipts: recentUploadsByCase[flowCaseId] ?? [],
            warnings: uploadWarningsByCase[flowCaseId] ?? [],
          };
        })()}
      >
      {PORTAL_V2 ? (
        <ClaimDetailsStep
          getIdToken={user ? () => user.getIdToken() : undefined}
          key={`${formEpoch}-${marketingType ?? ""}`}
          initialType={marketingType === "delay" ? "delayed" : marketingType === "cancellation" ? "cancelled" : marketingType === "denied" ? "denied_boarding" : marketingType === "baggage" ? "baggage" : undefined}
          form={form}
          loading={submitLoading}
          onChange={setForm}
          onSubmit={submitClaim}
          onFieldFocus={(fieldName) => claimFunnelRef.current?.fieldFocused(fieldName)}
        />
      ) : (
        <>
          {user && (
            <SmartClaimCapture
              getIdToken={() => user.getIdToken()}
              disabled={submitLoading}
              onExtract={(fields) => applyExtractedFields(fields)}
            />
          )}

          <QuickClaimForm
            getIdToken={user ? () => user.getIdToken() : undefined}
            form={form}
            resetKey={formEpoch}
            loading={submitLoading}
            onChange={setForm}
            onSubmit={submitClaim}
            onFieldFocus={(fieldName) => claimFunnelRef.current?.fieldFocused(fieldName)}
          />
        </>
      )}
      </ClaimFlow>
      </DraftClaimIntake>
      </>}

      {/* "What happens next" confirmation, rendered right where the customer's
          eyes are after clicking submit (the success toast lives at the top of
          the page, off-screen at this scroll position, and the form itself has
          just been reset). The toast stays; this is additive and dismissible. */}
      {!PORTAL_V2 && submittedClaim && (
        <ClaimSubmittedNext
          caseId={submittedClaim.caseId}
          caseDocId={submittedClaim.caseDocId}
          getIdToken={user ? () => user.getIdToken() : undefined}
          onDismiss={() => setSubmittedClaim(null)}
        />
      )}

      {!PORTAL_V2 && (
        <>
      <FlightStatusWidget />

      {/* Seed the estimate from what the customer already typed above — most of
          all the passenger count, since EU261 Art.7 pays PER passenger and the
          calculator previously defaulted to 1, under-quoting a family by 4x. The
          CTA carries the calculated values back into the claim form (remount via
          formEpoch so the uncontrolled inputs pick up the new defaults, same as
          the OCR prefill path) and scrolls to it, instead of the old no-op push
          to the page we are already on. */}
      <CompensationCalculator
        defaults={{
          origin: form.origin,
          destination: form.destination,
          passengerCount: form.passengerCount,
          airline: form.airline,
          disruptionType: form.disruptionType,
          delayHours: form.delayHours,
          cancellationNoticeDays: form.cancellationNoticeDays,
        }}
        onStartClaim={(draft) => {
          setForm((prev) => ({ ...prev, ...draft }));
          setFormEpoch((value) => value + 1);
          document
            .querySelector('[data-testid="quick-claim-form"]')
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
        </>
      )}

      <div id="client-cases-list">
      {!PORTAL_V2 && <CasesList
        cases={cases}
        loading={casesLoading}
        uploadingByCase={uploadingByCase}
        uploadKindByCase={uploadKindByCase}
        filesByCase={filesByCase}
        uploadProgressByCase={uploadProgressByCase}
        recentUploadsByCase={recentUploadsByCase}
        uploadWarningsByCase={uploadWarningsByCase}
        messageDraftByCase={messageDraftByCase}
        sendingMessageByCase={sendingMessageByCase}
        onUploadKindChange={(caseId, kind) => {
          setUploadWarningsByCase((prev) => ({ ...prev, [caseId]: [] }));
          setUploadKindByCase((prev) => ({ ...prev, [caseId]: kind }));
        }}
        onFileSelect={(caseId, files) => {
          // OPTIMIZATION: Validate total file size before accepting files
          // (avoid 100MB+ transfers and immediate errors in uploadDocuments).
          // Check both individual files and cumulative total.
          const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

          // Check individual file sizes
          const invalidFile = files.find((file) => !ALLOWED_DOCUMENT_MIME_TYPES.has(file.type || ""));
          if (invalidFile) {
            setError(getInvalidMimeTypeErrorMessage(invalidFile.name, locale));
            setFilesByCase((prev) => ({ ...prev, [caseId]: [] }));
            return;
          }

          // Check total size (before uploadDocuments is called)
          if (totalBytes > MAX_DOCUMENT_UPLOAD_BYTES) {
            const errorMsg = files.length === 1
              ? getFileSizeErrorMessage(files[0].name, locale)
              : t("portal.filesTooLarge", { max: "10", actual: (totalBytes / 1_048_576).toFixed(1) });
            setError(errorMsg);
            setFilesByCase((prev) => ({ ...prev, [caseId]: [] }));
            return;
          }

          setError(null);
          setUploadWarningsByCase((prev) => ({ ...prev, [caseId]: [] }));
          uploadPassengerIdsRef.current[caseId] = undefined;
          setFilesByCase((prev) => ({ ...prev, [caseId]: files }));
        }}
        onUpload={uploadDocuments}
        onAcknowledgeUploadWarning={(caseId) => void uploadDocuments(caseId, { acknowledgeMismatch: true })}
        onMessageChange={(caseId, message) => setMessageDraftByCase((prev) => ({ ...prev, [caseId]: message }))}
        onSendMessage={sendCaseMessage}
      />}
      </div>

    </main>
    </>
  );
}
