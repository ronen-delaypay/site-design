import type { MessageKey } from "@/lib/i18n/dictionary";
/** Only short guidance/action labels; agreement, eligibility and signing rules use the original dictionary. */
export const POA_DISPLAY_COPY: Record<string, Partial<Record<MessageKey, string>>> = {
 en: { "poa.status.pending": "Your signature is needed", "poaJourney.retry": "Check signing status", "poa.button.resend": "Resend link on WhatsApp", "poa.passengers.title": "Signatures for other passengers", "poa.passengers.button.create": "Create signing links" },
 he: { "poa.status.pending": "צריך את החתימה שלכם", "poaJourney.retry": "בדיקת מצב החתימה", "poa.button.resend": "שליחת הקישור שוב ב-WhatsApp", "poa.passengers.title": "חתימות של נוסעים נוספים", "poa.passengers.button.create": "יצירת קישורי חתימה" },
 ru: { "poa.status.pending": "Нужна ваша подпись", "poaJourney.retry": "Проверить статус подписи", "poa.button.resend": "Отправить ссылку в WhatsApp", "poa.passengers.title": "Подписи других пассажиров", "poa.passengers.button.create": "Создать ссылки для подписи" },
 ar: { "poa.status.pending": "نحتاج إلى توقيعك", "poaJourney.retry": "التحقق من حالة التوقيع", "poa.button.resend": "إعادة إرسال الرابط عبر WhatsApp", "poa.passengers.title": "توقيعات المسافرين الآخرين", "poa.passengers.button.create": "إنشاء روابط التوقيع" },
};


export const PREVIEW_SIGNING_LINK = 'https://app.easydo.co.il/forms/preview-only';
export const PREVIEW_SIGNING_COPY: Record<string, { title: string; sign: string }> = {
 en: { title: "Power of attorney · sample signing", sign: "Sign sample document" },
 he: { title: "ייפוי כוח · חתימה להדגמה", sign: "חתימה על מסמך לדוגמה" },
 ru: { title: "Доверенность · пример подписания", sign: "Подписать пример документа" },
 ar: { title: "التوكيل · توقيع تجريبي", sign: "توقيع المستند التجريبي" },
};
