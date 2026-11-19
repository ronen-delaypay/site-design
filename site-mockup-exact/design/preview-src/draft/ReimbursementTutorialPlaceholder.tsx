import { Play } from "lucide-react";
import type { Locale } from "@/lib/i18n/locale";
import { websiteText } from "@/lib/website/copy";
import "./reimbursement-tutorial-placeholder.css";

const COPY = {
  en: { title: "Filing an expense reimbursement claim", description: "A guide to claiming expenses and uploading your receipts.", watch: "Watch video" },
  he: { title: "הגשת תביעה להחזר הוצאות", description: "מדריך להגשת תביעה להחזר הוצאות ולהעלאת הקבלות שלכם.", watch: "צפייה בסרטון" },
  ru: { title: "Подача заявления на возмещение расходов", description: "Руководство по подаче заявления на возмещение расходов и загрузке чеков.", watch: "Смотреть видео" },
  ar: { title: "تقديم مطالبة باسترداد النفقات", description: "دليل لتقديم مطالبة باسترداد النفقات ورفع إيصالاتك.", watch: "مشاهدة الفيديو" },
} satisfies Record<Locale, { title: string; description: string; watch: string }>;

/** A reserved video slot, using the existing tutorial card patterns. */
export function ReimbursementTutorialPlaceholder({ locale, variant = "portal" }: { locale: Locale; variant?: "portal" | "public" }) {
  const text = COPY[locale];
  const cover = `./images/help/video5-reimbursement-${locale}.svg`;
  if (variant === "public") return (
    <article className="dp-tutorial-placeholder dp-tutorial-placeholder-public" data-testid="reimbursement-tutorial-placeholder">
      <button type="button" disabled className="dp-site-video-cover" aria-label={text.title} style={{ backgroundImage: `url("${cover}")`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <span>DelayPay</span><b>05</b><span aria-hidden="true">▶</span>
      </button>
      <div><h2>{text.title}</h2><button type="button" disabled className="dp-site-action">{websiteText(locale, "watch")}</button></div>
    </article>
  );
  return (
    <article className="dp-approved-tutorial dp-tutorial-placeholder" data-testid="reimbursement-tutorial-placeholder">
      <div className="dp-approved-tutorial-topic"><h3>{text.title}</h3></div>
      <button type="button" disabled className="dp-approved-tutorial-cover" aria-label={`${text.watch}: ${text.title}`} style={{ backgroundImage: `url("${cover}")`, backgroundSize: "cover", backgroundPosition: "center" }} />
      <p className="dp-approved-tutorial-description">{text.description}</p>
      <div className="dp-approved-tutorial-action">
        <button type="button" disabled className="dp-approved-action dp-approved-tutorial-watch"><Play size={18} fill="currentColor" aria-hidden="true"/><span>{text.watch}</span></button>
      </div>
    </article>
  );
}

