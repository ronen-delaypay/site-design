"use client";

import { useRef } from "react";
import { colors, fontSize, radius, spacing } from "@/lib/client/portal-theme";
import type { MessageKey } from "@/lib/i18n/dictionary";
import { Icon } from "@/components/client/Icon";
import type { ClaimDocumentKind } from "./ClaimDocumentsStep";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;
type ReceiptRecord = {
  id: string;
  fileName?: string;
  documentKind: string;
  storageMissing?: boolean;
  pendingReview?: boolean;
  receiptOcrOk?: boolean;
  receiptAmount?: number | null;
  receiptCurrency?: string | null;
  receiptMerchantName?: string | null;
};

const COPY: Record<string, { title: string; hint: string; upload: string; total: string; reading: string; rescan: string; unreadable: string; notReady: string }> = {
  en: { title: "Upload receipts", hint: "Upload receipts for expenses caused by your flight disruption. You can add more than one.", upload: "Upload receipts", total: "Total in original currency", reading: "Reading receipt…", rescan: "Upload again to rescan", unreadable: "We couldn’t read the amount. Upload this receipt again to rescan it.", notReady: "Receipt scan isn’t complete yet." },
  he: { title: "העלאת קבלות", hint: "העלו קבלות על הוצאות שנגרמו בעקבות השיבוש בטיסה. אפשר להוסיף כמה קבלות.", upload: "העלאת קבלות", total: "סכום לפי מטבע המקור", reading: "קוראים את הקבלה…", rescan: "העלאה מחדש לסריקה", unreadable: "לא הצלחנו לקרוא את הסכום. העלו את הקבלה שוב לסריקה.", notReady: "סריקת הקבלה עדיין לא הושלמה." },
  ru: { title: "Загрузите чеки", hint: "Загрузите чеки за расходы из-за сбоя рейса. Можно добавить несколько чеков.", upload: "Загрузить чеки", total: "Итого в исходной валюте", reading: "Считываем чек…", rescan: "Загрузить ещё раз", unreadable: "Не удалось распознать сумму. Загрузите чек ещё раз для сканирования.", notReady: "Сканирование чека ещё не завершено." },
  ar: { title: "ارفعوا الإيصالات", hint: "ارفعوا إيصالات المصاريف التي تسبب بها اضطراب الرحلة. يمكنكم إضافة أكثر من إيصال.", upload: "رفع الإيصالات", total: "الإجمالي بالعملة الأصلية", reading: "جارٍ قراءة الإيصال…", rescan: "إعادة الرفع للمسح", unreadable: "تعذّر قراءة المبلغ. ارفعوا الإيصال مجددًا لمسحه.", notReady: "لم يكتمل مسح الإيصال بعد." },
};

const supportedCurrencies = new Set(Intl.supportedValuesOf("currency"));

function recognizedAmount(receipt: ReceiptRecord) {
  const currency = receipt.receiptCurrency?.trim().toUpperCase();
  const amount = receipt.receiptAmount;
  if (receipt.pendingReview || receipt.receiptOcrOk !== true || !currency ||
      !supportedCurrencies.has(currency) || typeof amount !== "number" ||
      !Number.isFinite(amount) || amount <= 0) return null;
  return { currency, amount };
}

export function receiptTotals(receipts: readonly ReceiptRecord[]) {
  const totals = new Map<string, number>();
  for (const receipt of receipts) {
    if (receipt.documentKind !== "receipt" || receipt.storageMissing) continue;
    const result = recognizedAmount(receipt);
    if (!result) continue;
    const precision = new Intl.NumberFormat("en", { style: "currency", currency: result.currency }).resolvedOptions().maximumFractionDigits ?? 2;
    const scale = 10 ** precision;
    const current = totals.get(result.currency) ?? 0;
    totals.set(result.currency, (Math.round(current * scale) + Math.round(result.amount * scale)) / scale);
  }
  return Array.from(totals, ([currency, amount]) => ({ currency, amount }));
}

export function receiptMoney(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "code" }).format(amount);
}

function ReceiptPicker({ label, disabled, onFiles, testId, multiple = true }: { label: string; disabled: boolean; onFiles: (files: File[]) => void; testId: string; multiple?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <input ref={input} hidden type="file" multiple={multiple} accept="image/*,application/pdf" data-testid={`${testId}-input`} disabled={disabled} onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; if (files.length) onFiles(files); }} />
    <button type="button" data-testid={testId} disabled={disabled} onClick={() => input.current?.click()} style={{ display: "inline-flex", justifySelf: "start", alignItems: "center", justifyContent: "center", gap: spacing.sm, minHeight: 52, padding: "12px 22px", border: `1px solid ${colors.border}`, borderRadius: radius.md, background: colors.bg, color: colors.primary, fontFamily: "inherit", fontSize: fontSize.md, fontWeight: 650, cursor: disabled ? "not-allowed" : "pointer" }}>
      <Icon name="Upload" size={18} />{label}
    </button>
  </>;
}

export interface ReimbursementDocumentTilesProps {
  locale: string;
  onPick: (kind: ClaimDocumentKind, files: File[], passengerIds?: string[], replacesReceiptId?: string) => void;
  uploadingKind: string | null;
  uploading: boolean;
  documents?: ReceiptRecord[];
  t: Translate;
}

/** Dedicated reimbursement receipt step. Identity, boarding-pass and booking documents are collected earlier. */
export function ReimbursementDocumentTiles({ locale, onPick, uploadingKind, uploading, documents, t }: ReimbursementDocumentTilesProps) {
  const text = COPY[locale] ?? COPY.en;
  const receipts = (documents ?? []).filter(doc => doc.documentKind === "receipt" && !doc.storageMissing);
  const totals = receiptTotals(receipts);
  return (
    <section data-testid="reimbursement-documents" style={{ display: "grid", gap: spacing.lg, maxWidth: 820, margin: "0 auto" }}>
      <header style={{ textAlign: "center", display: "grid", gap: spacing.sm }}>
        <h4 style={{ margin: 0, fontSize: fontSize.xl, fontWeight: 700, color: colors.text }}>{text.title}</h4>
        <p style={{ margin: "0 auto", maxWidth: 560, fontSize: fontSize.md, lineHeight: 1.6, color: colors.textMuted }}>{text.hint}</p>
      </header>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <ReceiptPicker label={uploading && uploadingKind === "receipt" ? t("cases.uploading") : text.upload} disabled={uploading} onFiles={files => onPick("receipt", files)} testId="receipt-upload" />
      </div>

      {receipts.length > 0 && (
        <ul data-testid="reimbursement-receipts-list" style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: spacing.sm }}>
          {receipts.map(receipt => {
            const recognized = recognizedAmount(receipt);
            const unreadable = !receipt.pendingReview && (receipt.receiptOcrOk === false || (receipt.receiptOcrOk === true && !recognized));
            return <li key={receipt.id} data-testid={`receipt-row-${receipt.id}`} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", alignItems: "center", gap: spacing.md, border: `1px solid ${colors.border}`, borderRadius: radius.md, background: colors.bg, padding: "14px 16px" }}>
              <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
                <strong style={{ color: colors.text, fontSize: fontSize.md, overflowWrap: "anywhere" }}>{receipt.fileName ?? receipt.id}</strong>
                {recognized ? <span data-testid={`receipt-ocr-total-${receipt.id}`} style={{ color: colors.textSuccess, fontSize: fontSize.sm, display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="CheckCircle2" size={16} />{receiptMoney(recognized.amount, recognized.currency, locale)}{receipt.receiptMerchantName ? ` · ${receipt.receiptMerchantName}` : ""}</span>
                  : unreadable ? <span role="alert" style={{ color: colors.textWarning, fontSize: fontSize.sm }}>{text.unreadable}</span>
                  : <span role="status" style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{receipt.pendingReview ? text.reading : text.notReady}</span>}
              </div>
              {unreadable && <ReceiptPicker label={text.rescan} disabled={uploading} multiple={false} onFiles={files => onPick("receipt", files, undefined, receipt.id)} testId={`receipt-rescan-${receipt.id}`} />}
            </li>;
          })}
        </ul>
      )}

      {totals.length > 0 && (
        <section data-testid="receipt-ocr-totals" aria-label={text.total} style={{ display: "grid", gap: spacing.sm, border: `1px solid ${colors.border}`, borderRadius: radius.lg, background: colors.accentBg, padding: spacing.md }}>
          <strong style={{ fontSize: fontSize.md, color: colors.text }}>{text.total}</strong>
          {totals.map(item => <div key={item.currency} data-testid={`receipt-total-${item.currency}`} style={{ display: "flex", justifyContent: "space-between", gap: spacing.md, color: colors.text, fontVariantNumeric: "tabular-nums" }}><span>{item.currency}</span><strong>{receiptMoney(item.amount, item.currency, locale)}</strong></div>)}
        </section>
      )}


    </section>
  );
}
