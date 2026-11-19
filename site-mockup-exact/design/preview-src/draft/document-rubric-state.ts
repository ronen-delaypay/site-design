import { normalizeDocumentKind } from "@/lib/claims/utils";

type DocumentReceipt = { documentKind?: string; heldForManualRouting?: boolean; routedToCaseDocId?: string; pendingReview?: boolean; storageMissing?: boolean };
export function documentRubricState(documents: readonly DocumentReceipt[], kinds: readonly string[]): "missing" | "received" | "review" {
  const expected = new Set(kinds.map(normalizeDocumentKind));
  const usable = documents.filter(doc => !doc.storageMissing && !doc.heldForManualRouting && !doc.routedToCaseDocId && !!doc.documentKind && expected.has(normalizeDocumentKind(doc.documentKind)));
  if (usable.some(doc => !doc.pendingReview)) return "received";
  return usable.length ? "review" : "missing";
}
export function equivalentClaimDocumentPresent(kind: string, uploadedKinds: ReadonlySet<string>): boolean {
  const normalized = normalizeDocumentKind(kind);
  const group = ["passport", "id_card"].includes(normalized) ? ["passport", "id_card"]
    : ["boarding_pass", "e_ticket"].includes(normalized) ? ["boarding_pass", "e_ticket"] : [normalized];
  return [...uploadedKinds].some(value => group.includes(normalizeDocumentKind(value)));
}
