import { CheckCircle2 } from "lucide-react";
import type { Locale } from "@/lib/i18n/locale";
import "./claim-progress-note.css";
const COPY = {
 en: { title: "Great! We’re getting closer.", body: "Your documents are saved. Let’s check the details next." },
 he: { title: "מעולה! אנחנו מתקדמים.", body: "המסמכים נשמרו. עכשיו נבדוק את הפרטים." },
 ru: { title: "Отлично! Мы продвигаемся.", body: "Документы сохранены. Теперь проверим данные." },
 ar: { title: "رائع! نحن نقترب.", body: "تم حفظ مستنداتك. لنراجع البيانات الآن." },
} satisfies Record<Locale, { title: string; body: string }>;
const CONFIRMED = {
 en: { title: "Looking good. You’re making progress.", body: "Your details are confirmed. Next up: read and sign your power of attorney." },
 he: { title: "נראה טוב. אנחנו מתקדמים.", body: "הפרטים אושרו. עכשיו קוראים את ייפוי הכוח וחותמים." },
 ru: { title: "Всё хорошо. Мы продвигаемся.", body: "Данные подтверждены. Теперь прочитайте и подпишите доверенность." },
 ar: { title: "الأمور تبدو جيدة. نحن نتقدّم.", body: "تم تأكيد بياناتك. الخطوة التالية: قراءة التوكيل وتوقيعه." },
};
const EVIDENCE_BODY = {
 en: "Your details are confirmed. Upload the missing document to continue.",
 he: "הפרטים אושרו. כדי להמשיך, העלו את המסמך החסר.",
 ru: "Данные подтверждены. Загрузите недостающий документ, чтобы продолжить.",
 ar: "تم تأكيد بياناتك. ارفع المستند الناقص للمتابعة.",
};
export function ClaimProgressNote({ locale, milestone = "upload", evidenceNext = false }: { locale: string; milestone?: "upload" | "confirmed"; evidenceNext?: boolean }) {
 const copy = milestone === "confirmed" ? CONFIRMED : COPY;
 const text = copy[locale as Locale] ?? copy.en;
 const body = evidenceNext ? EVIDENCE_BODY[locale as Locale] ?? EVIDENCE_BODY.en : text.body;
 return <aside tabIndex={-1} className="dp-claim-progress-note" role="status" aria-live="polite" aria-atomic="true" data-testid={milestone === "confirmed" ? "claim-confirmed-progress-message" : "claim-upload-progress-message"}>
   <span className="dp-claim-progress-icon" aria-hidden="true"><CheckCircle2 size={24} strokeWidth={1.7}/></span>
   <div><h3>{text.title}</h3><p>{body}</p></div>
 </aside>;
}
