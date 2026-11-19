import { createContext, useContext } from "react";
export const OcrReviewContext = createContext<{ reviewing: boolean; confirmed: boolean; showEvidence: boolean; evidencePending: boolean; label: string; onOpen: () => void } | null>(null);
export const useOcrReview = () => useContext(OcrReviewContext);
