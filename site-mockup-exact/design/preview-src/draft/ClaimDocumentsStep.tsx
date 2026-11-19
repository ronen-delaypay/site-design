"use client";
import { CameraUploadButton } from "@/components/client/CameraUploadButton";
import { equivalentClaimDocumentPresent } from "./document-rubric-state";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { passengerDocumentCoverage, type DocumentPassenger, type PassengerDocument } from "@/lib/claims/passenger-documents";
import { colors, fontSize, radius, spacing } from "@/lib/client/portal-theme";
import { Button } from "@/components/client/Button";
import { ProgressBar } from "@/components/client/ProgressBar";
import { Icon, type IconName } from "@/components/client/Icon";
import { DOCUMENT_UPLOAD_ACCEPT } from "@/lib/constants/document-upload";
import type { MessageKey } from "@/lib/i18n/dictionary";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * The three documents that move a claim forward, with the stored document kind each one is filed as.
 * (A booking confirmation is filed as an e-ticket, the closest kind the case page already knows.)
 */
export const CLAIM_DOCUMENT_TILES = [
  { kind: "e_ticket", labelKey: "claimFlow.docs.flightProof", infoKey: "claimFlow.docs.flightProofInfo", icon: "FileText" },
  { kind: "passport", labelKey: "claimFlow.docs.identityProof", infoKey: "claimFlow.docs.passportInfo", icon: "User" },
] as const satisfies ReadonlyArray<{ kind: string; labelKey: MessageKey; infoKey: MessageKey; icon: "FileText" | "User" | "Plane" }>;

export type ClaimDocumentKind = "pir" | "e_ticket" | "passport" | "boarding_pass" | "correspondence" | "delay_cancellation_proof" | "other" | "receipt";

/** What a tile needs to draw itself; `kind` is the stored document kind the upload is filed under. */
export interface DocumentTileSpec {
  kind: string;
  labelKey: MessageKey;
  infoKey: MessageKey;
  icon: IconName;
}

export interface ClaimDocumentsStepProps {
  /** Picking files for a tile uploads them straight away, filed under that tile's kind. */
  onPick: (kind: ClaimDocumentKind, files: File[], passengerIds?: string[], replacesReceiptId?: string) => void;
  passengers?: DocumentPassenger[];
  documents?: PassengerDocument[];
  coverage?: ReturnType<typeof passengerDocumentCoverage>;
  /** Document kinds the case already holds, so a tile reads "uploaded" without a click. */
  uploadedKinds: ReadonlySet<string>;
  /** The kind being uploaded right now, if any. */
  uploadingKind: string | null;
  onAcknowledgeWarning: () => void;
  uploading: boolean;
  progress?: { loaded: number; total: number };
  receipts: Array<{ id?: string; fileName: string; pendingReview?: boolean }>;
  warnings: Array<{ fileName: string; message: string }>;
  locale: string;
  t: Translate;
  /** Rendered after the default identity and flight tiles (per passenger when there are several). */
  extraTiles?: ReactNode;
  /** Replaces the default subtitle. */
  subtitle?: string;
}

const TOOLTIP_CSS = `
.dp-info .dp-tip{display:none;pointer-events:none}
.dp-info:hover .dp-tip,.dp-info:focus .dp-tip{display:block}
.dp-doc-grid{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}
@media (min-width:640px){.dp-doc-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;

export function DocumentTile({
  tile,
  uploaded,
  busy,
  disabled,
  onFiles,
  testId,
  label,
  pickLabel,
  showCamera = true,
  t,
}: {
  tile: DocumentTileSpec;
  uploaded: boolean;
  busy: boolean;
  disabled: boolean;
  onFiles: (files: File[]) => void;
  testId?: string;
  label?: string;
  pickLabel?: string;
  showCamera?: boolean;
  t: Translate;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const tileStyle: CSSProperties = {
    display: "flex",
    width: "100%",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "24px 16px",
    borderRadius: radius.lg,
    border: `${uploaded ? 2 : 1}px solid ${uploaded ? colors.primary : colors.border}`,
    background: uploaded ? colors.accentBg : colors.bg,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    textAlign: "center",
  };
  const status = busy ? t("claimFlow.docs.uploading") : uploaded ? t("claimFlow.docs.uploaded") : pickLabel ?? t("claimFlow.docs.pick");

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={DOCUMENT_UPLOAD_ACCEPT}
        hidden
        data-testid={`claim-doc-input-${testId ?? tile.kind}`}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-pressed={uploaded}
        data-testid={`claim-doc-${testId ?? tile.kind}`}
        style={tileStyle}
      >
        <span style={{ color: colors.primary, display: "inline-flex" }}>
          <Icon name={tile.icon} size={24} />
        </span>
        <span style={{ fontSize: fontSize.lg, fontWeight: 600, color: colors.text }}>{label ?? t(tile.labelKey)}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: fontSize.md, fontWeight: 600, color: uploaded ? colors.primary : colors.textMuted }}>
          {uploaded && !busy && <Icon name="Check" size={14} />}
          {status}
        </span>
      </button>
      {!uploaded && showCamera && <CameraUploadButton onFiles={onFiles} disabled={disabled || busy} testId={`claim-doc-camera-${tile.kind}`} />}
      {/* A separate target from the upload tile: the explanation opens from the "i" alone. */}
      <button
        type="button"
        className="dp-info"
        aria-label={t(tile.infoKey)}
        style={{ position: "absolute", insetInlineEnd: 8, top: 8, display: "inline-flex", width: 24, height: 24, alignItems: "center", justifyContent: "center", border: 0, background: "transparent", color: colors.textMuted, cursor: "help", padding: 0 }}
      >
        <Icon name="Info" size={16} />
        <span
          role="tooltip"
          className="dp-tip"
          style={{ position: "absolute", insetInlineEnd: 0, bottom: "100%", marginBottom: 8, zIndex: 20, width: 224, padding: "10px 12px", borderRadius: radius.md, background: colors.bgInverse, color: colors.white, fontSize: fontSize.xs, fontWeight: 500, lineHeight: 1.5, textAlign: "start" }}
        >
          {t(tile.infoKey)}
        </span>
      </button>
    </div>
  );
}

/**
 * Step 2: attach documents to the case that was just created. Each tile uploads straight away through
 * the same handler the cases list uses (the page passes it), so the endpoint, progress and the
 * "this looks like a different document" warning behave identically.
 */
export function ClaimDocumentsStep(props: ClaimDocumentsStepProps) {
  const { onPick, uploadedKinds, uploadingKind, onAcknowledgeWarning, uploading, progress, receipts, warnings, t } = props;
  const percent = progress && progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0;
  const [bookingSelection, setBookingSelection] = useState<string[] | null>(null);
  const passengers = props.passengers ?? [];
  const selected = (bookingSelection ?? passengers.map((p) => p.id)).filter((id) => passengers.some((p) => p.id === id));
  const coverage = props.coverage ?? passengerDocumentCoverage({ passengers, passengerCount: passengers.length, customerDocuments: props.documents });

  return (
    <div data-testid="claim-documents-step">
      <style>{TOOLTIP_CSS}</style>
      <p style={{ margin: `0 0 ${spacing.xl}px`, textAlign: "center", color: colors.textMuted, fontSize: fontSize.lg, fontWeight: 500 }}>{props.subtitle ?? t("claimFlow.documents.subtitle")}</p>

      {passengers.length > 0 ? (
        <div style={{ display: "grid", gap: spacing.lg }}>
          <p role="status" data-testid="passenger-document-coverage">
            {t("claimFlow.docs.coverage", { complete: coverage.passengers.filter((p) => p.identity && p.flight).length, total: passengers.length })}
          </p>
          <fieldset style={{ border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: spacing.md }}>
            <legend>{t("claimFlow.docs.sharedBooking")}</legend>
            <p>{t("claimFlow.docs.sharedHint")}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.md }}>
              {passengers.map((passenger) => (
                <label key={passenger.id} style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
                  <input type="checkbox" checked={selected.includes(passenger.id)} disabled={uploading}
                    onChange={(event) => setBookingSelection(event.target.checked ? [...selected, passenger.id] : selected.filter((id) => id !== passenger.id))} />
                  {passenger.fullName}
                </label>
              ))}
            </div>
            <DocumentTile tile={CLAIM_DOCUMENT_TILES[0]} disabled={uploading || selected.length === 0}
              busy={uploading && uploadingKind === "e_ticket"}
              uploaded={selected.length > 0 && selected.every((id) => props.documents?.some((doc) => doc.documentKind === "e_ticket" && !doc.pendingReview && !doc.storageMissing && doc.passengerIds?.includes(id)))}
              onFiles={(files) => onPick("e_ticket", files, selected)} t={t} />
          </fieldset>
          <h4 style={{ margin: 0 }}>{t("claimFlow.docs.passengers")}</h4>
          {passengers.map((passenger, index) => {
            const row = coverage.passengers.find((p) => p.id === passenger.id);
            return (
              <fieldset key={passenger.id} data-testid={`passenger-documents-${index}`} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: spacing.md }}>
                <legend>{passenger.fullName}</legend>
                <p>{t("claimFlow.docs.identity")}: {t(row?.identity ? "claimFlow.docs.received" : "claimFlow.docs.missing")} · {t("claimFlow.docs.flight")}: {t(row?.flight ? "claimFlow.docs.received" : "claimFlow.docs.missing")}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: spacing.md }}>
                  <DocumentTile tile={CLAIM_DOCUMENT_TILES[1]} testId={`passport-${index}`} uploaded={Boolean(row?.identity)} busy={uploading && uploadingKind === "passport"} disabled={uploading}
                    label={t("claimFlow.docs.passport")} onFiles={(files) => onPick("passport", files, [passenger.id])} t={t} />
                  <DocumentTile tile={CLAIM_DOCUMENT_TILES[0]} testId={`boarding_pass-${index}`} uploaded={Boolean(row?.flight)} busy={uploading && uploadingKind === "boarding_pass"} disabled={uploading}
                    label={t("claimFlow.docs.flight")} onFiles={(files) => onPick("boarding_pass", files, [passenger.id])} t={t} />
                </div>
              </fieldset>
            );
          })}
        </div>
      ) : <div className="dp-doc-grid">
        {CLAIM_DOCUMENT_TILES.map((tile) => (
          <DocumentTile
            key={tile.kind}
            tile={tile}
            uploaded={equivalentClaimDocumentPresent(tile.kind, uploadedKinds)}
            busy={uploading && uploadingKind === tile.kind}
            disabled={uploading}
            onFiles={(files) => onPick(tile.kind, files)}
            t={t}
          />
        ))}
      </div>}

      {props.extraTiles}

      {uploading && (
        <div style={{ marginTop: spacing.lg }}>
          <ProgressBar value={progress?.loaded ?? 0} max={progress?.total ?? 100} label={t("cases.uploadProgress", { percent })} />
        </div>
      )}

      {warnings.length > 0 && (
        <div
          role="alert"
          data-testid="claim-flow-upload-warning"
          style={{ marginTop: spacing.lg, border: `1px solid ${colors.warning}`, background: colors.warningBg, borderRadius: radius.md, padding: spacing.md, display: "grid", gap: spacing.sm }}
        >
          <div style={{ fontSize: fontSize.sm, color: colors.textWarning }}>{warnings.map((warning) => warning.message).join(" ")}</div>
          <Button type="button" variant="secondary" onClick={onAcknowledgeWarning} disabled={uploading} loading={uploading}>
            {t("cases.uploadAnyway")}
          </Button>
        </div>
      )}

      {receipts.length > 0 && (
        <div role="status" data-testid="claim-flow-upload-success" style={{ marginTop: spacing.lg, display: "grid", gap: spacing.xs, fontSize: fontSize.sm, color: colors.textSuccess }}>
          {receipts.map((receipt, index) => (
            <div key={receipt.id ?? `${receipt.fileName}-${index}`} style={{ display: "flex", gap: spacing.xs, alignItems: "center" }}>
              <Icon name={receipt.pendingReview ? "Clock" : "Check"} size={14} />
              <span>
                {receipt.fileName} · {receipt.pendingReview ? t("cases.ocrProcessing") : t("cases.savedSuccessfully")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
