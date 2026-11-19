"use client";
import { POA_DISPLAY_COPY, PREVIEW_SIGNING_COPY, PREVIEW_SIGNING_LINK } from "./poa-display-copy";

import { useState, useEffect, useRef, useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { useRouter } from "next/navigation";
import { colors } from "@/lib/client/portal-theme";
import { Button, Alert } from "@/components/client";
import { Icon } from "@/components/client/Icon";
import type { MessageKey } from "@/lib/i18n/dictionary";
import { captureException } from "@/lib/observability/sentry";
import { clearClientSessionCookie } from "@/lib/client/session-cookie";
import { poaConflictKey } from "@/lib/client/poa-conflict";
import { POASignedDocumentActions } from "@/components/client/POASignedDocumentActions";
import { PoaSignerDetailsForm } from "@/components/client/PoaSignerDetailsForm";
import { POASigningModal } from "@/components/client/POASigningModal";
import { validateNativePoaDetails, type NativePoaPreparation, type NativePoaSubmission } from "@/lib/client/poa-native-input";
import { rememberPoaReturn, poaTokenSubject } from "@/lib/client/poa-return-context";
import { watchPoaStatus } from "@/lib/client/poa-status-refresh";
import { isE2EClientAuthEnabled, parseE2EClientToken } from "@/lib/e2e/auth";
import { trackPortalAction } from "@/lib/client/portal-events";
import { EASYDO_SIGNING_EMAIL_REQUIRED, validatedSigningEmail } from "@/lib/easydo-signing-validation";

/**
 * In-page signing frame. Off by default: EasyDo's own pages send
 * `X-Frame-Options: SAMEORIGIN` and a `frame-ancestors` allow-list, and the portal's CSP
 * only admits its own frames, so a frame would render blank until BOTH sides are opened.
 * Turn it on (NEXT_PUBLIC_EASYDO_EMBED=1, which also adds EasyDo to the portal's frame-src in
 * next.config.js) only after EasyDo has allowed this portal's origin as a frame ancestor.
 * Until then the same link opens in its own tab, which always works.
 */
const EASYDO_EMBED_ENABLED = process.env.NEXT_PUBLIC_EASYDO_EMBED === "1";
const EASYDO_FRAME_HOSTS = new Set(["app.easydo.co.il", "app.easydoc.co.il"]);

export function embeddableSigningUrl(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.protocol === "https:" && EASYDO_FRAME_HOSTS.has(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function POAExternalSigningLink({
  href,
  t,
  onOpen,
  embedded = false,
}: {
  href: string;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  onOpen: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  embedded?: boolean;
}) {
  return (
    <>
      <div
        data-testid="poa-sign-external-note"
        style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.6 }}
      >
        {t(embedded ? "poa.sign.embeddedNote" : "poa.sign.externalNote")}
      </div>
      <a
        data-testid="poa-open-signing"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onOpen}
        style={{
          display: "inline-block",
          textAlign: "center",
          backgroundColor: colors.primary,
          color: "white",
          borderRadius: 6,
          padding: "10px 16px",
          fontSize: 15,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        {t("poa.sign.cta")}
      </a>
    </>
  );
}

interface POAWidgetProps {
  readOnly?: boolean;
  caseId: string;
  getIdToken: () => Promise<string>;
  locale: string;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

interface POAStatus {
  status: "signed" | "pending" | "recovery_required" | "verifying";
  verificationPending?: boolean;
  isSigned: boolean;
  poaRequestSentAt?: number;
  poaUrl?: string;
  documentReady?: boolean;
  emailCopyAllowed?: boolean;
  nativeDetailsEnabled?: boolean;
  // A still-fresh EasyDo signing link that already exists for this case.
  // When present the widget links the customer straight to the signature
  // instead of forcing another (rate-limited) request.
  signingLink?: string;
  recoveryRequired?: boolean;
}

/**
 * What the customer sees when the POA status request itself failed.
 *
 * Exported (and kept free of hooks) so it can be render-tested directly: the
 * widget's own error state is only reachable through an effect, which
 * `renderToStaticMarkup` never runs.
 */
export function POAWidgetLoadError({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div
      id="poa-widget"
      data-poa-state="error"
      style={{
        border: `2px solid #ff9800`,
        borderRadius: 8,
        padding: 16,
        backgroundColor: "#fff3e0",
        marginBlockEnd: 16,
        scrollMarginBlockStart: 16,
      }}
    >
      <Alert type="error">{message}</Alert>
      <div style={{ marginBlockStart: 12 }}>
        <Button
          onClick={onRetry}
          style={{
            backgroundColor: "#ff9800",
            color: "white",
            border: "none",
            borderRadius: 4,
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {retryLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * One additional adult passenger's POA state, exactly as
 * `GET /api/client/cases/[id]/poa/passengers` projects it. `link_expired` is a
 * portal-side state, not a stored one: the ledger only ever holds
 * pending/signed, so a lapsed 24h link and an abandoned signature look
 * identical in the vendor data. Surfacing "this link no longer works" is the
 * honest version of both — the alternative was an <a> that silently 404s.
 */
export interface PassengerPoaView {
  passengerId: string;
  passengerName: string;
  status: "signed" | "pending" | "link_expired" | "not_requested";
  signingLink?: string;
  requestedAt?: number;
  signedAt?: number;
}

interface PassengerPoaResponse {
  ok: boolean;
  requiresPassengerPoa: boolean;
  passengers: PassengerPoaView[];
  pendingCount: number;
  signedCount: number;
  automationPaused?: boolean;
  hasPrimaryContact?: boolean;
  /** Paid/Rejected/Closed: the POST refuses to mint, so the button is disabled. */
  caseClosed?: boolean;
  /** POST only: how many EasyDo processes this call actually minted. */
  created?: number;
}

/**
 * The multi-passenger POA panel.
 *
 * Product rule (owner decision): EVERY passenger's signing link is delivered to
 * the primary account holder, who relays it. There is no per-passenger contact
 * collection. That makes the ownership note non-optional copy — a customer who
 * signs all three links themselves has produced three invalid POAs and a claim
 * we cannot file.
 *
 * Hook-free and exported on purpose, matching `POAWidgetLoadError`: the widget's
 * async states are only reachable through effects, which `renderToStaticMarkup`
 * never runs, so this is the seam the render tests drive.
 */
export function POAPassengerList({
  passengers,
  t,
  copiedPassengerId,
  onCopy,
  onOpenLink,
  onRequestLinks,
  requesting,
  requestDisabled,
  notice,
  error,
}: {
  passengers: PassengerPoaView[];
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  copiedPassengerId?: string | null;
  onCopy?: (passenger: PassengerPoaView) => void;
  onOpenLink?: (passenger: PassengerPoaView) => void;
  onRequestLinks?: () => void;
  requesting?: boolean;
  /** True when a request can only fail (paused case / no contact on file). */
  requestDisabled?: boolean;
  notice?: string | null;
  error?: string | null;
}) {
  const pending = passengers.filter((p) => p.status !== "signed");
  const hasExpired = passengers.some((p) => p.status === "link_expired");

  return (
    <div
      data-poa-passengers
      data-poa-passengers-pending={pending.length}
      style={{
        marginBlockStart: 16,
        paddingBlockStart: 16,
        borderBlockStart: `1px solid ${colors.borderLight}`,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: colors.text, marginBlockEnd: 4 }}>
        {t("poa.passengers.title")}
      </div>
      <div style={{ fontSize: 13, color: colors.textMuted, marginBlockEnd: 12 }}>
        {t("poa.passengers.description")}
      </div>

      {pending.length > 0 && (
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBlockEnd: 8 }}>
          {t("poa.passengers.blocker")}{" "}
          <span style={{ fontWeight: 400, color: colors.textMuted }}>
            {t("poa.passengers.remaining", { count: pending.length })}
          </span>
        </div>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {passengers.map((p) => {
          const signed = p.status === "signed";
          const statusLabel = signed
            ? t("poa.passengers.status.signed")
            : p.status === "pending"
              ? t("poa.passengers.status.pending")
              : p.status === "link_expired"
                ? t("poa.passengers.status.linkExpired")
                : t("poa.passengers.status.notRequested");

          return (
            <li
              key={p.passengerId}
              data-passenger-status={p.status}
              style={{
                border: `1px solid ${signed ? "#4caf50" : colors.borderLight}`,
                borderRadius: 6,
                padding: 10,
                backgroundColor: signed ? "#f1f8f2" : "#ffffff",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>
                  {p.passengerName}
                </span>
                <span style={{ fontSize: 12, color: signed ? "#2e7d32" : colors.textMuted }}>
                  {signed ? "✓ " : ""}
                  {statusLabel}
                </span>
              </div>

              {p.status === "pending" && p.signingLink && (
                <div style={{ marginBlockStart: 8 }}>
                  <div style={{ fontSize: 12, color: colors.textMuted, marginBlockEnd: 6 }}>
                    {t("poa.passengers.linkOwnerNote", { name: p.passengerName })}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <a
                      href={p.signingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onOpenLink?.(p)}
                      style={{
                        display: "inline-block",
                        backgroundColor: colors.primary,
                        color: "white",
                        borderRadius: 6,
                        padding: "8px 14px",
                        fontSize: 14,
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      {t("poa.button.openLink")}
                    </a>
                    <button
                      type="button"
                      onClick={() => onCopy?.(p)}
                      style={{
                        background: "none",
                        border: `1px solid ${colors.borderLight}`,
                        borderRadius: 6,
                        color: colors.text,
                        fontSize: 13,
                        padding: "8px 12px",
                        cursor: "pointer",
                      }}
                    >
                      {copiedPassengerId === p.passengerId
                        ? t("poa.passengers.button.copied")
                        : t("poa.passengers.button.copy")}
                    </button>
                  </div>
                </div>
              )}

              {p.status === "link_expired" && (
                <div style={{ fontSize: 12, color: colors.textMuted, marginBlockStart: 6 }}>
                  {t("poa.passengers.linkExpired.hint")}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <div style={{ marginBlockStart: 12 }}>
          <Alert type="error">{error}</Alert>
        </div>
      )}
      {notice && (
        <div style={{ marginBlockStart: 12 }}>
          <Alert type="success">{notice}</Alert>
        </div>
      )}

      {pending.length === 0 ? (
        <div style={{ fontSize: 13, color: "#2e7d32", marginBlockStart: 12, fontWeight: 600 }}>
          {t("poa.passengers.allSigned")}
        </div>
      ) : (
        // Hidden (not merely disabled) when the request can only fail: a paused
        // case 409s and a contactless case 422s, and a button whose single
        // outcome is an error is what sends the customer to support.
        !requestDisabled && (
          <div style={{ marginBlockStart: 12 }}>
            <Button
              className="dp-poa-create-links"
              onClick={() => onRequestLinks?.()}
              disabled={requesting}
              style={{
                backgroundColor: "#ff9800",
                color: "white",
                border: "none",
                borderRadius: 4,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 600,
                cursor: requesting ? "not-allowed" : "pointer",
                opacity: requesting ? 0.7 : 1,
              }}
            >
              {requesting
                ? t("poa.passengers.button.creating")
                : hasExpired
                  ? t("poa.passengers.button.createNew")
                  : t("poa.passengers.button.create")}
            </Button>
          </div>
        )
      )}
    </div>
  );
}

export function POAWidget({ caseId, getIdToken, locale, t: originalT, readOnly = false }: POAWidgetProps) {
  const displayCopy = new URLSearchParams(location.search).get("appearance") === "original" ? undefined : POA_DISPLAY_COPY[locale];
  const t: POAWidgetProps["t"] = (key, vars) => displayCopy?.[key] ?? originalT(key, vars);
  const router = useRouter();
  const [status, setStatus] = useState<POAStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [awaitingSignature, setAwaitingSignature] = useState(false);
  const returnOwnerUid = useRef<string | null>(null);
  const [nativePreparation, setNativePreparation] = useState<NativePoaPreparation | null>(null);
  const [preparingDetails, setPreparingDetails] = useState(false);
  const nativePrepareSeq = useRef(0);
  const signingRequestSeq = useRef(0);
  const noteSigningOpened = () => {
    setAwaitingSignature(true);
    try { if (returnOwnerUid.current) rememberPoaReturn(window.localStorage, caseId, returnOwnerUid.current); }
    catch { /* Signing still works when browser storage is denied. */ }
  };
  const requestInFlightRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  useEffect(() => {
    if (!retryAt) return;
    const timeout = window.setTimeout(() => setRetryAt(0), Math.max(0, retryAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [retryAt]);
  const [emailCorrectionTarget, setEmailCorrectionTarget] = useState<"primary" | "passengers" | null>(null);
  const [signingEmail, setSigningEmail] = useState("");
  useEffect(() => { setEmailCorrectionTarget(null); setSigningEmail(""); }, [caseId]);
  // The signing link the customer can open directly. Seeded from GET (an
  // already-created, still-fresh link) and refreshed by a successful POST.
  const [signingLink, setSigningLink] = useState<string | null>(null);
  const [signingModal, setSigningModal] = useState<{ caseId: string; url: string } | null>(null);
  const [previewSigningCase, setPreviewSigningCase] = useState<string | null>(null);
  const [previewSigningBusy, setPreviewSigningBusy] = useState(false);
  useEffect(() => {
    setSigningModal(current => current && (current.caseId !== caseId || current.url !== embeddableSigningUrl(signingLink)) ? null : current);
  }, [caseId, signingLink]);

  // Tracks which case the newest in-flight request belongs to. If the widget
  // is pointed at a different case while a request is still running, the older
  // response must not be applied — otherwise one case's POA status (and its
  // signed/pending state) renders under a different case's heading, which in
  // the customer portal means showing the customer the wrong case's data.
  const requestSeq = useRef(0);

  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [documentFallbackUrl, setDocumentFallbackUrl] = useState<string | null>(null);
  const documentSeq = useRef(0);
  const documentInFlight = useRef(false);
  const [emailCopyBusy, setEmailCopyBusy] = useState(false);
  const [emailCopyState, setEmailCopyState] = useState<"sent" | "pending" | "error" | null>(null);
  const emailCopySeq = useRef(0);
  const emailCopyInFlight = useRef(false);

  useEffect(() => {
    documentSeq.current++;
    emailCopySeq.current++;
    returnOwnerUid.current = null;
    nativePrepareSeq.current++;
    signingRequestSeq.current++;
    setNativePreparation(null); setPreparingDetails(false); setRequesting(false);
    setSigningModal(null);
    requestInFlightRef.current = false;
    setRetryAt(0);
    setAwaitingSignature(false);
    emailCopyInFlight.current = false;
    setEmailCopyBusy(false);
    setEmailCopyState(null);
    documentInFlight.current = false;
    setDocumentBusy(false);
    setDocumentError(null);
    setDocumentFallbackUrl(null);
    // Invalidate a request counter, not a DOM-node ref, on case change/unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { documentSeq.current++; emailCopySeq.current++; nativePrepareSeq.current++; signingRequestSeq.current++; };
  }, [caseId]);

  async function requestSignedEmailCopy() {
    if (emailCopyInFlight.current) return;
    emailCopyInFlight.current = true;
    const seq = ++emailCopySeq.current;
    const stale = () => seq !== emailCopySeq.current;
    setEmailCopyBusy(true); setEmailCopyState(null);
    try {
      const token = await getIdToken();
      if (stale()) return;
      const response = await fetch(`/api/client/cases/${encodeURIComponent(caseId)}/poa/email-copy?locale=${encodeURIComponent(locale)}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (stale()) return;
      if (response.status === 401) { clearClientSessionCookie(); router.replace("/client/login"); return; }
      const result = await response.json().catch(() => null) as { status?: string } | null;
      if (stale()) return;
      setEmailCopyState(response.ok && result?.status === "sent" ? "sent" : response.status === 202 ? "pending" : "error");
    } catch { if (!stale()) setEmailCopyState("error"); }
    finally { if (!stale()) { setEmailCopyBusy(false); emailCopyInFlight.current = false; } }
  }

  async function openSignedDocument(download: boolean) {
    if (documentInFlight.current) return;
    documentInFlight.current = true;
    const seq = ++documentSeq.current;
    const stale = () => seq !== documentSeq.current;
    // Open synchronously inside the gesture. Slow authenticated reads must not
    // turn an otherwise valid PDF into a popup-blocker failure.
    const popup = download ? null : window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    setDocumentBusy(true); setDocumentError(null); setDocumentFallbackUrl(null);
    try {
      const token = await getIdToken();
      if (stale()) { popup?.close(); return; }
      const res = await fetch(`/api/client/cases/${encodeURIComponent(caseId)}/poa/document${download ? "?download=1" : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (stale()) { popup?.close(); return; }
      if (res.status === 401) {
        popup?.close(); clearClientSessionCookie(); router.replace("/client/login"); return;
      }
      if (res.status === 202) {
        popup?.close(); setStatus(current => current ? { ...current, documentReady: false } : current); return;
      }
      if (!res.ok) throw new Error("POA document unavailable");
      const data = await res.json() as { ok?: boolean; url?: string };
      if (stale()) { popup?.close(); return; }
      let url: URL;
      try { url = new URL(data.url ?? ""); } catch { throw new Error("Invalid document URL"); }
      if (!data.ok || url.protocol !== "https:" || !(url.hostname === "storage.googleapis.com" || url.hostname.endsWith(".storage.googleapis.com"))) {
        throw new Error("Invalid document URL");
      }
      if (download) {
        const link = document.createElement("a");
        link.href = url.toString(); link.download = "signed-poa.pdf"; link.referrerPolicy = "no-referrer";
        document.body.append(link); link.click(); link.remove();
      } else if (popup && !popup.closed) {
        popup.location.replace(url.toString());
      } else {
        setDocumentFallbackUrl(url.toString());
      }
    } catch {
      popup?.close();
      if (!stale()) setDocumentError(t("poa.document.error"));
    } finally {
      if (!stale()) { setDocumentBusy(false); documentInFlight.current = false; }
    }
  }


  // Multi-passenger POA (the `poa_missing_for_passengers` readiness blocker).
  // Read through its OWN GET, never the POST: the POST mints one PAID EasyDo
  // process per uncovered adult, so polling it on case open would spend money
  // just to render a list.
  const [passengerState, setPassengerState] = useState<PassengerPoaResponse | null>(null);
  const [passengerError, setPassengerError] = useState<string | null>(null);
  const [passengerNotice, setPassengerNotice] = useState<string | null>(null);
  const [passengerRequesting, setPassengerRequesting] = useState(false);
  const [copiedPassengerId, setCopiedPassengerId] = useState<string | null>(null);
  const passengerInFlightRef = useRef(false);
  const passengerSeq = useRef(0);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    };
  }, []);

  const fetchPOAStatus = useCallback(async (options: { silent?: boolean } = {}) => {
    const seq = ++requestSeq.current;
    const isStale = () => seq !== requestSeq.current;
    try {
      if (!options.silent) setLoading(true);
      const token = await getIdToken();
      if (isStale()) return;
      returnOwnerUid.current = poaTokenSubject(token) ?? (isE2EClientAuthEnabled() ? parseE2EClientToken(token)?.uid ?? null : null);
      const res = await fetch(`/api/client/cases/${caseId}/poa`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (isStale()) return;
        if (res.status === 401) {
          clearClientSessionCookie();
          router.replace("/client/login");
          return;
        }
        if (res.status === 404) {
          setError(t("poa.error.caseNotFound"));
        } else {
          setError(t("poa.error.loadFailed"));
        }
        return;
      }

      const data = (await res.json()) as { ok: boolean; error?: string } & POAStatus;
      if (isStale()) return;
      if (data.ok) {
        setStatus(data);
        const link = data.signingLink && /^https?:\/\//i.test(data.signingLink) ? data.signingLink : null;
        setSigningLink(link);
        setError(null);
      } else {
        setError(t("poa.error.loadFailed"));
      }
    } catch (err) {
      if (isStale()) return;
      captureException(err, { tags: { component: "POAWidget", action: "fetchPOAStatus" } });
      console.error("[POAWidget] fetchPOAStatus failed:", err);
      setError(t("poa.error.generic"));
    } finally {
      if (!isStale()) setLoading(false);
    }
    // locale (not t) — t recreates every render, but locale only changes
    // on an actual language switch, so this avoids infinite re-fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, getIdToken, locale]);

  const fetchPassengerPoas = useCallback(async () => {
    const seq = ++passengerSeq.current;
    const isStale = () => seq !== passengerSeq.current;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/client/cases/${caseId}/poa/passengers`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (isStale()) return;
        if (res.status === 401) {
          clearClientSessionCookie();
          router.replace("/client/login");
          return;
        }
        // Deliberately visible rather than silently hidden: on a multi-adult
        // claim this panel is the ONLY self-service way to clear
        // `poa_missing_for_passengers`, so a swallowed failure looks to the
        // customer like a claim that simply never moves.
        setPassengerError(t("poa.passengers.error.loadFailed"));
        return;
      }

      const data = (await res.json()) as PassengerPoaResponse;
      if (isStale()) return;
      if (data.ok) {
        setPassengerState(data);
        setPassengerError(null);
      } else {
        setPassengerError(t("poa.passengers.error.loadFailed"));
      }
    } catch (err) {
      if (isStale()) return;
      captureException(err, { tags: { component: "POAWidget", action: "fetchPassengerPoas" } });
      console.error("[POAWidget] fetchPassengerPoas failed:", err);
      setPassengerError(t("poa.passengers.error.loadFailed"));
    }
    // locale (not t) — see fetchPOAStatus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, getIdToken, locale]);

  useEffect(() => {
    fetchPOAStatus();
  }, [fetchPOAStatus]);

  useEffect(() => {
    void fetchPassengerPoas();
  }, [fetchPassengerPoas]);

  useEffect(() => watchPoaStatus({
    events: window, document,
    refresh: () => fetchPOAStatus({ silent: true }),
    onError: error => captureException(error, { tags: { component: "POAWidget", action: "returnRefresh" } }),
    poll: awaitingSignature && !(status?.isSigned && status?.documentReady),
  }), [fetchPOAStatus, awaitingSignature, status?.isSigned, status?.documentReady]);

  async function requestPassengerPoas() {
    if (passengerInFlightRef.current) return;
    passengerInFlightRef.current = true;
    try {
      setPassengerRequesting(true);
      setPassengerError(null);
      setPassengerNotice(null);

      const token = await getIdToken();
      const res = await fetch(`/api/client/cases/${caseId}/poa/passengers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: emailCorrectionTarget === "passengers" ? JSON.stringify({ signingEmail: signingEmail.trim() }) : undefined,
      });

      if (res.status === 401) {
        clearClientSessionCookie();
        router.replace("/client/login");
        return;
      }
      if (res.status === 409) {
        // The route's 409s: the per-case pause gate (same copy the primary flow
        // uses — an operator has taken this case over by hand), a finished
        // claim (`caseClosed`, the refetch disables the button), or another
        // request already minting (`concurrent`, the refetch shows its links).
        const conflict = (await res.json().catch(() => ({}))) as { error?: string };
        if (conflict.error === "automation_paused") setPassengerError(t("poa.error.onHold"));
        await fetchPassengerPoas();
        return;
      }
      if (res.status === 422) {
        const failure = await res.json().catch(() => ({}));
        if (failure.code === EASYDO_SIGNING_EMAIL_REQUIRED) {
          setEmailCorrectionTarget("passengers");
          setPassengerError(t("poa.error.validEmailRequired"));
          await fetchPassengerPoas();
        } else setPassengerError(t("poa.passengers.error.noContact"));
        return;
      }
      if (res.status === 429) {
        setPassengerError(t("poa.error.rateLimited"));
        return;
      }

      const data = (await res.json().catch(() => ({}))) as Partial<PassengerPoaResponse>;
      if (!res.ok || !data.ok) {
        setPassengerError(t("poa.passengers.error.createFailed"));
        return;
      }
      trackPortalAction("portal_poa_passengers_saved");
      setEmailCorrectionTarget(null);

      // The POST answers with the FULL projection (not just the delta), so it
      // can be applied directly — no follow-up read, and a partial mint still
      // renders every passenger honestly.
      setPassengerState(data as PassengerPoaResponse);
      // Only on an actual mint: the relay instruction matters most at the
      // moment fresh links appear, which is exactly when the account holder is
      // most likely to just start signing them.
      if ((data.created ?? 0) > 0) {
        setPassengerNotice(t("poa.passengers.success.created"));
      }
    } catch (err) {
      captureException(err, { tags: { component: "POAWidget", action: "requestPassengerPoas" } });
      console.error("[POAWidget] requestPassengerPoas failed:", err);
      setPassengerError(t("poa.passengers.error.createFailed"));
    } finally {
      setPassengerRequesting(false);
      passengerInFlightRef.current = false;
    }
  }

  async function copyPassengerLink(passenger: PassengerPoaView) {
    if (!passenger.signingLink) return;
    // Which of the two relay mechanisms the account holder used matters here:
    // "open" on a passenger's own link is the misuse path that produces an
    // invalid POA (see the ownership note above POAPassengerList) — "copy" is
    // the correct relay flow. Tracking both sides is how that gets caught.
    trackPortalAction("portal_poa_relay_link_copied");
    try {
      await navigator.clipboard.writeText(passenger.signingLink);
      setCopiedPassengerId(passenger.passengerId);
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
      copyResetTimer.current = setTimeout(() => setCopiedPassengerId(null), 2000);
    } catch (err) {
      // A clipboard denial is a browser permission decision, not a fault worth
      // paging on — and the real <a> next to this button still reaches the
      // signature, so the customer is never stuck. Logged, not captured.
      console.warn("[POAWidget] clipboard write blocked:", err);
    }
  }

  async function loadNativePreparation() {
    const sequence = ++nativePrepareSeq.current;
    const stale = () => sequence !== nativePrepareSeq.current;
    setPreparingDetails(true); setError(null);
    try {
      const token = await getIdToken(); if (stale()) return;
      const response = await fetch(`/api/client/cases/${encodeURIComponent(caseId)}/poa/prepare`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (stale()) return;
      if (response.status === 401) { clearClientSessionCookie(); router.replace("/client/login"); return; }
      const data = await response.json().catch(() => null) as ({ ok?: boolean } & NativePoaPreparation) | null;
      if (stale()) return;
      if (!response.ok || data?.ok !== true || !/^[a-f0-9]{64}$/.test(data.revision) || !data.flight) throw new Error("POA preparation unavailable");
      setNativePreparation({ revision: data.revision, initialDetails: data.initialDetails ?? {}, flight: data.flight });
    } catch (error) {
      if (!stale()) { setError(t("poaJourney.detailsUnavailable")); captureException(error, { tags: { component: "POAWidget", action: "prepareDetails" } }); }
    } finally { if (!stale()) setPreparingDetails(false); }
  }
  function startSigning() {
    if (retryAt > Date.now()) return;
    if (status?.nativeDetailsEnabled && !signingLink) { if (!preparingDetails) void loadNativePreparation(); }
    else void requestPOA();
  }
  async function requestPOA(submission?: NativePoaSubmission): Promise<boolean> {
    if (retryAt > Date.now()) return false;
    if (requestInFlightRef.current) return false;
    requestInFlightRef.current = true;
    const sequence = ++signingRequestSeq.current;
    const stale = () => sequence !== signingRequestSeq.current;
    // Reserve the window during the user's gesture, before token/network awaits.
    let popup: Window | null = null;
    // Some embedded browsers throw instead of returning null when blocked.
    // The persisted-link fallback must still work in that case.
    try {
      if (!EASYDO_EMBED_ENABLED && typeof window !== "undefined") popup = window.open("about:blank", "_blank");
      if (popup) popup.opener = null;
    } catch { popup = null; }
    let navigated = false;
    // `signingLink` here is the pre-click state (captured before the fetch
    // below can change it), so this correctly tells a first-time request
    // (mints a new paid EasyDo process) apart from a resend of an existing one.
    const wasResend = Boolean(signingLink);
    try {
      setRequesting(true);
      setError(null);
      setSuccess(null);

      const token = await getIdToken();
      if (stale()) return false;
      const res = await fetch(`/api/client/cases/${caseId}/poa`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        ...((submission || emailCorrectionTarget === "primary") ? {
          body: JSON.stringify({ ...submission,
            ...(emailCorrectionTarget === "primary" ? { signingEmail: signingEmail.trim() } : {}) }),
        } : {}),
      });
      if (stale()) return false;

      if (res.status === 401) {
        clearClientSessionCookie();
        router.replace("/client/login");
        return false;
      }

      if (res.status === 409) {
        // 409 covers several case-state blocks. Branch on the flag the route
        // sent: "already signed" is misleading for a case an operator took over
        // by hand, a closed claim, or a stuck earlier request.
        const conflict = await res.json().catch(() => null);
        if (stale()) return false;
        if (conflict?.verificationPending === true) { await fetchPOAStatus(); return false; }
        if (conflict?.code === "POA_DETAILS_CHANGED") {
          setNativePreparation(null); await loadNativePreparation();
          if (!stale()) setError(t("poaJourney.detailsChanged"));
          return false;
        }
        setError(t(poaConflictKey(conflict)));
        await fetchPOAStatus();
        return false;
      }

      // 3 requests / hour, fail-closed (each POST mints a paid EasyDo process
      // + WhatsApp send). If the customer already has a link, tell them to use
      // it rather than surfacing a bare "too many requests" ("Slow down").
      if (res.status === 429) {
        const seconds = Number(res.headers.get("Retry-After"));
        setRetryAt(Date.now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) : 3600) * 1000);
        setError(t("poa.error.rateLimited"));
        return false;
      }

      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string; signingLink?: string };

      if (res.status === 422 && data.code === EASYDO_SIGNING_EMAIL_REQUIRED) {
        if (stale()) return false;
        if (!submission) setEmailCorrectionTarget("primary");
        setError(t("poa.error.validEmailRequired"));
        return false;
      }

      if (stale()) return false;
      if (!res.ok || data.ok !== true) {
        // Refresh recovery state after a rejected provider create; no POST retry.
        if (res.headers.get("x-easydo-recovery-required") === "1") {
          await fetchPOAStatus({ silent: true });
        }
        if (!stale()) setError(t("poa.error.requestFailed"));
        return false;
      }

      if (submission && (!data.signingLink || !/^https?:\/\//i.test(data.signingLink))) {
        setError(t("poa.error.requestFailed"));
        await fetchPOAStatus({ silent: true });
        return false;
      }
      if (data.signingLink && /^https?:\/\//i.test(data.signingLink)) {
        setEmailCorrectionTarget(null);
        setSigningLink(data.signingLink);
        noteSigningOpened();
        const embeddedUrl = EASYDO_EMBED_ENABLED ? embeddableSigningUrl(data.signingLink) : null;
        if (embeddedUrl) setSigningModal({ caseId, url: embeddedUrl });
        if (popup && !popup.closed) { popup.location.replace(data.signingLink); navigated = true; }
        // When a popup is blocked, the same persisted link is rendered below.
        // No second process is requested to open it.
      }

      setSuccess(
        data.signingLink
          ? t("poa.success.linkReady")
          : t("poa.success.requested"),
      );
      trackPortalAction("portal_poa_requested", { link_ready: Boolean(data.signingLink), resent: wasResend });
      await fetchPOAStatus({ silent: true });
      return !stale();
    } catch (err) {
      if (stale()) return false;
      captureException(err, { tags: { component: "POAWidget", action: "requestPOA" } });
      console.error("[POAWidget] requestPOA failed:", err);
      setError(t("poa.error.generic"));
      return false;
    } finally {
      if (!navigated) popup?.close();
      if (!stale()) { setRequesting(false); requestInFlightRef.current = false; }
    }
  }

  if (loading) {
    return (
      <div id="poa-widget" style={{ padding: 16, borderRadius: 8, backgroundColor: colors.bg, scrollMarginBlockStart: 16 }}>
        <div style={{ fontSize: 14, color: colors.textMuted }}>
          {t("poa.loading")}
        </div>
      </div>
    );
  }

  // A failed GET leaves `status === null` with `error` set. Returning null
  // here removed the widget entirely — and with it the ONLY in-portal way to
  // reach the POA signing link, which is the universal hard blocker for all 83
  // airlines. The customer saw nothing at all: no error, no retry, no claim.
  // (The `{error && <Alert>}` further down is unreachable in this state — it
  // lives inside the branch that only renders once `status` exists.)
  if (!status) {
    if (error) {
      return (
        <POAWidgetLoadError
          message={error}
          retryLabel={t("poa.button.retry")}
          onRetry={() => {
            setError(null);
            setPassengerError(null);
            void fetchPOAStatus();
            // The passenger panel lives inside the branch this error replaces,
            // so its state has to be refreshed by the same retry.
            void fetchPassengerPoas();
          }}
        />
      );
    }
    return null;
  }

  if (status.verificationPending || status.status === "verifying") {
    return <div id="poa-widget" className="dp-case-action-card" data-poa-state="verifying" style={{ border: `1px solid ${colors.borderLight}`, borderRadius: 16, padding: 24, background: colors.white, marginBottom: 20, scrollMarginTop: 16 }}>
      <h3 className="dp-case-action-title">{t("poa.sectionTitle")}</h3>
      <div className="dp-case-status-panel" style={{ background: colors.bgInfo, border: `1px solid ${colors.borderInfo}` }}>
        <div className="dp-case-status-content"><div className="dp-case-status-heading"><Icon className="dp-case-status-icon" name="Clock" size={18} /><h4 className="dp-case-status-title" style={{ margin: 0 }}>{t("poa.verifying.title")}</h4></div>
        <p role="status" className="dp-case-status-description">{t("poa.verifying.body")}</p>
        </div>
      </div>
    </div>;
  }
  const isSigned = status.isSigned;
  const previewSigning = signingLink === PREVIEW_SIGNING_LINK;
  const previewCopy = PREVIEW_SIGNING_COPY[locale] ?? PREVIEW_SIGNING_COPY.en;
  const recoveryRequired = status.status === "recovery_required" || status.recoveryRequired === true;
  // A multi-adult claim where only the account holder has signed is still
  // hard-blocked from submission, so the card must not go green on the
  // primary's signature alone — that reads as "done" to the one person who can
  // still unblock it. Single-passenger cases have no passengers to pend, so
  // `passengersOutstanding` is false and the styling is byte-identical to before.
  const showPassengerSection = passengerState?.requiresPassengerPoa === true;
  const passengersOutstanding = showPassengerSection && passengerState.pendingCount > 0;
  const passengerLoadFailed = !passengerState && Boolean(passengerError);
  const fullySigned = isSigned && status.documentReady === true && !passengersOutstanding;
  const backgroundColor = readOnly && !fullySigned ? colors.bg : fullySigned ? "#e8f5e9" : recoveryRequired ? "#fff4e5" : "#fff3e0";
  const borderColor = readOnly && !fullySigned ? colors.border : fullySigned ? "#4caf50" : recoveryRequired ? "#d97706" : "#ff9800";

  return (
    <div
      id="poa-widget"
      className="dp-case-action-card"
      data-poa-state={fullySigned ? "signed" : recoveryRequired ? "recovery" : "pending"}
      style={{
        border: `1px solid ${colors.borderLight}`,
        borderRadius: 16,
        padding: 24,
        backgroundColor: colors.white,
        marginBottom: 20,
        scrollMarginTop: 16,
      }}
    >
      <h3 className="dp-case-action-title">{t("poa.sectionTitle")}</h3>
      <div className="dp-case-status-panel" style={{ background: backgroundColor, border: `1px solid ${borderColor}` }}>
        <div className="dp-case-status-content">
          <div className="dp-case-status-heading">
          <Icon className="dp-case-status-icon" name={fullySigned ? "CheckCircle2" : "AlertTriangle"} size={18} color={fullySigned ? "#4caf50" : "#d97706"} />
          <div
            dir="auto"
            className="dp-case-status-title"
            style={{
              color: colors.text,
            }}
          >
            {readOnly && !isSigned ? t("case.readOnly.title") : isSigned
              ? t(status.documentReady ? "poa.status.signed" : "poa.verifying.title")
              : recoveryRequired
                ? t("poa.status.recoveryRequired")
                : t("poa.status.pending")}
          </div>
          </div>

          {readOnly && !isSigned && <p style={{ color: colors.textMuted }}>{t("case.readOnly.title")}</p>}
          {!readOnly && !isSigned && !recoveryRequired && (
            <div data-testid="poa-status-description" className="dp-case-status-description" style={{ color: colors.textMuted }}>
              {t("poa.description")}
            </div>
          )}

          {!isSigned && (
            <div data-testid="poa-sign-intro" style={{ fontSize: 13, color: colors.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
              {t("poa.sign.intro")}
            </div>
          )}

          {isSigned && (
            <POASignedDocumentActions
              ready={status.documentReady === true}
              busy={documentBusy || loading}
              error={documentError}
              fallbackUrl={documentFallbackUrl}
              onOpen={() => void openSignedDocument(false)}
              onDownload={() => void openSignedDocument(true)}
              onRefresh={() => void fetchPOAStatus()}
              canEmailCopy={status.emailCopyAllowed === true}
              emailCopyBusy={emailCopyBusy}
              emailCopyState={emailCopyState}
              onEmailCopy={() => void requestSignedEmailCopy()}
              t={t}
            />
          )}

          {!readOnly && recoveryRequired && (
            <div style={{ fontSize: 14, color: colors.textMuted, marginBottom: 12 }}>
              {t("poa.status.recoveryRequired.description")}
            </div>
          )}

          {error && <Alert type="error">{error}</Alert>}
          {!readOnly && emailCorrectionTarget && (
            <form onSubmit={(event) => {
              event.preventDefault();
              if (!validatedSigningEmail(signingEmail)) return;
              if (emailCorrectionTarget === "primary") void requestPOA();
              else void requestPassengerPoas();
            }} style={{ display: "grid", gap: 8, marginBlock: 12 }}>
              <label htmlFor="poa-signing-email">{t("poa.email.label")}</label>
              <input id="poa-signing-email" type="email" required maxLength={254} dir="ltr"
                autoComplete="email" value={signingEmail}
                onChange={(event) => setSigningEmail(event.target.value)} />
              <span>{t("poa.email.scope")}</span>
              <Button type="submit" disabled={!validatedSigningEmail(signingEmail) || requesting || passengerRequesting}>
                {t("poa.email.submit")}
              </Button>
            </form>
          )}
          {success && <Alert type="success">{success}</Alert>}

          {!readOnly && !isSigned && !signingLink && nativePreparation && (
            <PoaSignerDetailsForm key={nativePreparation.revision} initialDetails={nativePreparation.initialDetails}
              requireEnglishName flight={nativePreparation.flight} t={t}
              onCancel={() => setNativePreparation(null)}
              onConfirm={async details => {
                const validated = validateNativePoaDetails(details);
                if (!validated) throw new Error("Invalid POA details");
                const ok = await requestPOA({ details: validated, revision: nativePreparation.revision, detailsConfirmed: true });
                if (!ok) throw new Error("POA submission not completed");
                setNativePreparation(null);
              }} />
          )}

          {!readOnly && !isSigned && signingLink && (
            <div className="dp-poa-primary-actions" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <POAExternalSigningLink
                href={signingLink}
                t={t}
                embedded={previewSigning || (EASYDO_EMBED_ENABLED && Boolean(embeddableSigningUrl(signingLink)))}
                onOpen={event => {
                  if (previewSigning) {
                    event.preventDefault();
                    setPreviewSigningCase(caseId);
                    return;
                  }
                  const embeddedUrl = EASYDO_EMBED_ENABLED ? embeddableSigningUrl(signingLink) : null;
                  if (embeddedUrl) { event.preventDefault(); setSigningModal({ caseId, url: embeddedUrl }); }
                  noteSigningOpened(); trackPortalAction("portal_poa_sign_link_opened");
                }}
              />
              {previewSigning && previewSigningCase === caseId && (
                <section data-testid="poa-preview-signing" style={{ display: "grid", gap: 12, padding: 16 }}>
                  <strong>{previewCopy.title}</strong>
                  <Button type="button" loading={previewSigningBusy} disabled={previewSigningBusy} onClick={async () => {
                    setPreviewSigningBusy(true);
                    setError(null);
                    try {
                      const token = await getIdToken();
                      const response = await fetch(`/api/client/cases/${caseId}/poa`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ previewSign: true }),
                      });
                      if (!response.ok) throw Error("preview_signing_failed");
                      await fetchPOAStatus({ silent: true });
                      setPreviewSigningCase(null);
                    } catch {
                      setError(t("poaJourney.detailsUnavailable"));
                    } finally {
                      setPreviewSigningBusy(false);
                    }
                  }}>{previewCopy.sign}</Button>
                </section>
              )}
              {signingModal?.caseId === caseId && signingModal.url === embeddableSigningUrl(signingLink) && (
                <POASigningModal key={caseId} url={signingModal.url} title={t("poa.sign.frameTitle")}
                  closeLabel={t("action.close")} externalLabel={t("poa.sign.external")}
                  direction={locale === "he" || locale === "ar" ? "rtl" : "ltr"}
                  onClose={() => { setSigningModal(null); void fetchPOAStatus({ silent: true }); }} />
              )}
            </div>
          )}

          {!readOnly && !isSigned && !signingLink && !nativePreparation && (
            <Button
              onClick={startSigning}
              disabled={requesting || preparingDetails || retryAt > 0}
              style={{
                backgroundColor: "#ff9800",
                color: "white",
                border: "none",
                borderRadius: 4,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 600,
                cursor: requesting ? "not-allowed" : "pointer",
                opacity: requesting ? 0.7 : 1,
              }}
            >
              {requesting || preparingDetails
                ? t("poa.sign.preparing")
                : recoveryRequired ? t("poa.sign.retry") : t("poa.sign.cta")}
            </Button>
          )}

          {/* Multi-passenger POA. Rendered outside every `!isSigned` branch on
              purpose: the blocked case IS "primary signed, family not", and
              hiding the panel there is precisely what left these claims —
              the highest-value ones, since EU261 compensation scales per
              passenger — with no self-service exit. */}
          {!readOnly && showPassengerSection && (
            <POAPassengerList
              passengers={passengerState.passengers}
              t={t}
              copiedPassengerId={copiedPassengerId}
              onCopy={(p) => void copyPassengerLink(p)}
              onOpenLink={() => trackPortalAction("portal_poa_relay_link_opened")}
              onRequestLinks={() => void requestPassengerPoas()}
              requesting={passengerRequesting}
              requestDisabled={
                passengerState.caseClosed === true
              }
              notice={passengerNotice}
              error={
                passengerError ??
                (passengerState.hasPrimaryContact === false
                  ? t("poa.error.validEmailRequired")
                  : null)
              }
            />
          )}

          {passengerLoadFailed && (
            <div data-poa-passengers-state="error" style={{ marginBlockStart: 16 }}>
              <Alert type="error">{passengerError}</Alert>
              <button
                type="button"
                onClick={() => {
                  setPassengerError(null);
                  void fetchPassengerPoas();
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: colors.textMuted,
                  fontSize: 13,
                  textDecoration: "underline",
                  cursor: "pointer",
                  padding: 0,
                  marginBlockStart: 8,
                }}
              >
                {t("poa.button.retry")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
