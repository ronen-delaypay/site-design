"use client";

import { trackPortalAction } from "@/lib/client/portal-events";
import type { CSSProperties } from "react";
import { useRef, useState, useEffect } from "react";
import { colors } from "@/lib/client/portal-theme";
import { Button } from "@/components/client/Button";
import { CameraUploadButton } from "@/components/client/CameraUploadButton";
import { Icon } from "@/components/client/Icon";
import type { ExtractedClaimFields } from "@/lib/client/ocr-extract-fields";
import { useLocale } from "@/hooks/useLocale";
import { translatorFor } from "@/lib/i18n";
import { captureException } from "@/lib/observability/sentry";
import { useRouter } from "next/navigation";
import { clearClientSessionCookie } from "@/lib/client/session-cookie";
import type { MessageKey } from "@/lib/i18n/dictionary";
import { MAX_OCR_UPLOAD_BYTES } from "@/lib/constants/document-upload";
import { MAX_UPLOAD_REQUEST_BYTES, compressImageForUpload } from "@/lib/client/upload-prep";

import {saveScanResult,type SavedScan} from "./scan-save";
import {scanCopy} from "./ScanResults";
interface SmartClaimCaptureProps {
  passengerId?:string;
  onSaved?: (document:SavedScan)=>void;
  onStart?: (kind:string)=>void;
  onBusyChange?: (busy:boolean)=>void;
  getIdToken: () => Promise<string>;
  /** Called with only the fields OCR found — merge, never overwrite, in the parent. */
  onExtract: (fields: ExtractedClaimFields) => void;
  disabled?: boolean;
}

type TileStatus = "idle" | "analyzing" | "saving" | "done" | "error";

interface Tile {
  key: string;
  label: string;
  hint: string;
  icon: "Plane" | "User" | "FileText";
}

// Three quick snaps — boarding pass carries the flight, passport the traveler,
// booking confirmation the reference. Any one of them prefills something; all
// three and the form is essentially done.
function getTiles(tr: (key: MessageKey, vars?: Record<string, string | number>) => string): Tile[] {
  return [
    { key: "boarding_pass", label: tr("ocr.boardingPass"), hint: tr("ocr.boardingHint"), icon: "Plane" },
    { key: "passport", label: tr("ocr.passport"), hint: tr("ocr.passportHint"), icon: "User" },
    { key: "booking", label: tr("ocr.booking"), hint: tr("ocr.bookingHint"), icon: "FileText" },
  ];
}

function getFieldLabels(tr: (key: MessageKey, vars?: Record<string, string | number>) => string): Record<keyof ExtractedClaimFields, string> {
  return {
    clientName: tr("ocr.fieldName"),
    airline: tr("ocr.fieldAirline"),
    flightNumber: tr("ocr.fieldFlightNumber"),
    departureDate: tr("ocr.fieldDate"),
    origin: tr("ocr.fieldOrigin"),
    destination: tr("ocr.fieldDestination"),
    bookingReference: tr("ocr.fieldBookingRef"),
    ticketNumber: tr("ocr.fieldTicketNumber"),
    passengerCount: tr("ocr.fieldPassengers"),
  };
}

export function SmartClaimCapture({ getIdToken, onExtract, onSaved, onStart, onBusyChange, passengerId, disabled = false }: SmartClaimCaptureProps) {
  const router = useRouter();
  const [locale] = useLocale();
  const tr = translatorFor(locale);
  const tiles = getTiles(tr);
  const text=scanCopy(locale);
  const fieldLabels = getFieldLabels(tr);

  const [statuses, setStatuses] = useState<Record<string, TileStatus>>({});
  useEffect(()=>onBusyChange?.(Object.values(statuses).some(s=>s==="analyzing"||s==="saving")),[statuses,onBusyChange]);
  const [collected, setCollected] = useState<ExtractedClaimFields>({});
  const [error, setError] = useState<string | null>(null);
  // Set only when the failure was OURS and re-sending the same file can work.
  // Always written together with `error` via `showError` — a retry button left
  // behind by an error that is no longer on screen would offer to re-upload
  // for a failure the customer can no longer see.
  const [retryKey, setRetryKey] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const setStatus = (key: string, status: TileStatus) =>
    setStatuses((prev) => ({ ...prev, [key]: status }));

  /** Single writer of `error` + `retryKey`, so the two can never drift apart. */
  const showError = (message: string | null, retryFor: string | null = null) => {
    setError(message);
    setRetryKey(retryFor);
  };

  async function handleFile(key: string, file: File | undefined) {
    if (!file) return;
    onStart?.(key);
    // Vercel rejects request bodies over 4.5 MB before the route runs, so a
    // full-size phone photo would fail. OCR only needs a readable image: shrink
    // it first (skipped for absurdly large files, which fail the check below).
    const uploadFile =
      file.size > MAX_OCR_UPLOAD_BYTES ? file : await compressImageForUpload(file);
    if (uploadFile.size > MAX_UPLOAD_REQUEST_BYTES) {
      setStatus(key, "error");
      // Genuinely about their file — re-sending the same one cannot help.
      showError(tr("ocr.fileTooLarge"));
      return;
    }
    showError(null);
    setStatus(key, "analyzing");
    try {
      const token = await getIdToken();
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("documentKind", key);
      const res = await fetch("/api/client/ocr-extract", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.status === 401) {
        clearClientSessionCookie();
        router.replace("/client/login");
        return;
      }

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        found?: boolean;
        fields?: ExtractedClaimFields;
        disabled?: boolean;
        error?: string;
      };

      // A request that FAILED is not a blank document. Two distinct shapes get
      // here, and BOTH are our failure, not a fact about the customer's file:
      //   - a non-2xx: 5xx from the storage/OCR pipeline, 429 from the paid
      //     rate limit, 400 from the content-type gate;
      //   - a 200 the server itself marks `ok:false` — that is the soft-fail
      //     branch of extractClaimFieldsFromUpload, i.e. exactly what an OCR
      //     PROVIDER OUTAGE returns (HTTP 200, `ok:false`, an `error` string),
      //     plus the DELAYPAY_SMART_CAPTURE_ENABLED kill-switch.
      // Reporting either as `ocr.noFieldsDetected` ("no details detected, try
      // again") tells a customer their perfectly good boarding pass is
      // unreadable and invites them to re-upload the same file until they give
      // up. `ocr.analysisError` is the honest copy and already exists.
      if (!res.ok || data.ok !== true) {
        // The kill-switch is a deliberate ops decision, not an incident.
        const killSwitched = data.disabled === true;
        if (!killSwitched) {
          captureException(
            new Error(
              `ocr-extract failed: HTTP ${res.status}${data.error ? ` — ${data.error}` : ""}`,
            ),
            { tags: { component: "SmartClaimCapture", action: "handleFile" } },
          );
        }
        setStatus(key, "error");
        // Retry only where retrying can work: a transient 5xx/429/outage clears,
        // but the kill-switch will refuse the identical request every time.
        showError(tr("ocr.analysisError"), killSwitched ? null : key);
        return;
      }

      // Past this point the run SUCCEEDED (`res.ok` and `ok:true`), so an empty
      // field set is a real answer about the document. Keep the existing copy,
      // and no retry — the same file will read the same.
      trackPortalAction("portal_document_scanned", { found: Boolean(data.found && data.fields) });
      if (!data.found || !data.fields) {
        setStatus(key, "error");
        showError(tr("ocr.noFieldsDetected"));
        return;
      }

      // Merge into the running readout and hand the fresh fields to the parent
      // form. The parent must merge (never overwrite a user-typed value).
      setStatus(key, "saving");
      let saved:SavedScan;
      try { saved=await saveScanResult(token,key,file.name,data.fields,passengerId); }
      catch { setStatus(key,"error");showError(text.saveError,key);return; }
      setCollected((prev) => ({ ...prev, ...saved.fields }));
      onExtract(saved.fields);
      onSaved?.(saved);
      setStatus(key, "done");
    } catch (err) {
      captureException(err, { tags: { component: "SmartClaimCapture", action: "handleFile" } });
      setStatus(key, "error");
      // Sibling of the !res.ok branch above: a thrown fetch (offline, DNS,
      // aborted upload) is the same "our side failed" case, so it gets the
      // same retry affordance.
      showError(tr("ocr.analysisError"), key);
    }
  }

  const cardStyle = (status: TileStatus): CSSProperties => ({
    position: "relative",
    border: `1.5px ${status === "done" ? "solid" : "dashed"} ${
      status === "done" ? colors.success : status === "error" ? colors.danger : colors.borderLight
    }`,
    borderRadius: 12,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    textAlign: "center",
    cursor: disabled ? "not-allowed" : "pointer",
    background: status === "done" ? colors.successBg ?? "#e8f5e9" : colors.white,
    opacity: disabled ? 0.6 : 1,
    minHeight: 108,
    justifyContent: "center",
  });

  const collectedEntries = Object.entries(collected) as [keyof ExtractedClaimFields, unknown][];

  return (
    <section
      style={{
        border: `1px solid ${colors.borderLight}`,
        borderRadius: 12,
        background: colors.white,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: 18, fontWeight: 600, color: colors.text }}>
        <Icon name="Sparkles" size={18} /> {tr("ocr.title")}
      </h2>
      <p style={{ margin: "0 0 14px 0", fontSize: 13, color: colors.textMuted }}>
        {tr("ocr.subtitle")}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))",
          gap: 10,
        }}
      >
        {tiles.map((tile) => {
          const status = statuses[tile.key] ?? "idle";
          return (
            <div key={tile.key}><label style={cardStyle(status)}>
              <input
                ref={(el) => {
                  inputRefs.current[tile.key] = el;
                }}
                type="file"
                accept="image/*,application/pdf"
                // NO `capture` attribute: on Android a `capture="environment"`
                // input opens the rear camera directly and drops the
                // "choose an existing file" option entirely, so mobile
                // customers could only photograph a document, never upload a
                // saved PDF/screenshot from Files or the gallery (reported
                // 2026-08-23: "זה לא נותן להעלות קובץ רק לצלם"). Without it the
                // native picker still offers Camera *and* Photos/Files on both
                // iOS and Android, honoring the "צלמו או העלו קובץ" promise.
                disabled={disabled || (status === "analyzing" || status === "saving")}
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: "hidden",
                  clip: "rect(0, 0, 0, 0)",
                  whiteSpace: "nowrap",
                  border: 0,
                }}
                data-testid={`smart-capture-${tile.key}`}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  // Reset so re-selecting the same file still fires onChange.
                  e.target.value = "";
                  void handleFile(tile.key, f);
                }}
              />
              <Icon
                name={status === "done" ? "CheckCircle2" : (status === "analyzing" || status === "saving") ? "Clock" : tile.icon}
                size={26}
                color={status === "done" ? colors.success : colors.primary ?? "#177bc7"}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{tile.label}</span>
              <span style={{ fontSize: 11, color: colors.textMuted }}>
                {(status === "analyzing" || status === "saving")
                  ? (status==="saving"?text.saving:tr("ocr.analyzing"))
                  : status === "done"
                    ? tr("ocr.detected")
                    : status === "error"
                      ? tr("ocr.tryAgain")
                      : tile.hint}
              </span>
            </label><CameraUploadButton disabled={disabled || (status === "analyzing" || status === "saving")} onFiles={files => void handleFile(tile.key, files[0])} testId={`smart-camera-${tile.key}`} /></div>
          );
        })}
      </div>

      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: colors.danger }} role="alert">
          {error}
          {retryKey && (
            // Only rendered for a failure of ours. Re-opens the picker for the
            // tile that failed — the customer's next move is to send the file
            // again, and the tile's own "try again" hint sits far from this
            // message and reads identically on the no-fields-found path.
            <div style={{ marginTop: 8 }}>
              <Button
                variant="secondary"
                disabled={disabled}
                onClick={() => inputRefs.current[retryKey]?.click()}
              >
                {tr("common.retry")}
              </Button>
            </div>
          )}
        </div>
      )}

      {!onSaved && collectedEntries.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            background: colors.bgSecondary ?? "#f9fafb",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.text, marginBottom: 8 }}>
            <Icon name="Sparkles" size={14} /> {tr("ocr.detectedFields")}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {collectedEntries.map(([key, value]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: colors.textMuted }}>{fieldLabels[key]}</span>
                <span style={{ fontWeight: 600, color: colors.text }}>{String(value)}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: colors.textMuted }}>
            {tr("ocr.editNote")}
          </div>
        </div>
      )}
    </section>
  );
}
