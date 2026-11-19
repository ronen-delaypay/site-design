import { WebsiteSocialLinks } from "./WebsiteSocialLinks";
import { ReimbursementTutorialPlaceholder } from "./ReimbursementTutorialPlaceholder";
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Ban, Plane, Luggage } from "lucide-react";
import type { Locale } from "@/lib/i18n/locale";
import { websiteText } from "@/lib/website/copy";
import { WEBSITE_AIRLINES, WEBSITE_TUTORIALS } from "@/lib/website/content";
import { websitePortalHref, WEBSITE_LEGAL_PAGES } from "@/lib/website/paths";
import { WEBSITE_LEGAL_CONTENT } from "@/lib/website/legal-content";
import { WebsiteCompensationCalculator } from "@/components/website/CompensationCalculator";
import AnalyticsProvider from "@/components/marketing/AnalyticsProvider";
import CookieConsentBanner from "@/components/marketing/CookieConsentBanner";
import { WhatsAppFloat } from "@/components/common/WhatsAppFloat";
import { openCookieSettings } from "@/lib/client/cookie-consent";
import type { WebsiteClaimType } from "@/lib/website/calculator";

export type WebsiteSection = "home" | "help" | "about" | typeof WEBSITE_LEGAL_PAGES[number];
const languages: Record<Locale, string> = { en: "English", he: "עברית", ru: "Русский", ar: "العربية" };
const navLabel = { en: "Menu", he: "תפריט", ru: "Меню", ar: "القائمة" };
const languageLabel = { en: "Language", he: "שפה", ru: "Язык", ar: "اللغة" };
const claimCards = [
  { type: "delay", title: "claimDelayTitle", body: "claimDelayBody", Icon: Clock },
  { type: "cancellation", title: "claimCancellationTitle", body: "claimCancellationBody", Icon: Ban },
  { type: "denied", title: "claimDeniedTitle", body: "claimDeniedBody", Icon: Plane },
  { type: "baggage", title: "claimBaggageTitle", body: "claimBaggageBody", Icon: Luggage },
] as const;
export function PublicWebsite({ locale, section = "home" }: { locale: Locale; section?: WebsiteSection }) {
  const [menu, setMenu] = useState(false), [paused, setPaused] = useState(false), [video, setVideo] = useState<number | null>(null);
  const [search, setSearch] = useState(""), [localPreview, setLocalPreview] = useState(false), [publicHost, setPublicHost] = useState(false);
  const [calculatorRequest, setCalculatorRequest] = useState<{ type: WebsiteClaimType; revision: number } | null>(null);
  const t = (key: Parameters<typeof websiteText>[1]) => websiteText(locale, key);
  const link = (next: WebsiteSection, language = locale) => `${publicHost ? "" : "/site"}/${language}${next === "home" ? "" : WEBSITE_LEGAL_PAGES.some(value => value === next) ? `/legal/${next}` : `/${next}`}`;
  useEffect(() => {
    setPublicHost(["delaypay.co.il", "www.delaypay.co.il"].includes(window.location.hostname));
    setSearch(window.location.search); setLocalPreview(["localhost", "127.0.0.1"].includes(window.location.hostname));
    const previous = { lang: document.documentElement.lang, dir: document.documentElement.dir };
    document.documentElement.lang = locale; document.documentElement.dir = ["he", "ar"].includes(locale) ? "rtl" : "ltr";
    return () => { document.documentElement.lang = previous.lang; document.documentElement.dir = previous.dir; };
  }, [locale]);
  const claimHref = websitePortalHref(locale, true, search, localPreview), trackHref = websitePortalHref(locale, false, search, localPreview);
  const tutorials = WEBSITE_TUTORIALS.filter(item => item.lang === locale);
  const about = <section className="dp-site-about"><div><span className="dp-site-eyebrow">{t(section === "about" ? "about" : "how")}</span><h2>{t(section === "about" ? "aboutTitle" : "howQuestion")}</h2><p>{t(section === "about" ? "aboutBody" : "howIntro")}</p>{section !== "about" && <Link className="dp-site-action" href={link("help")}>{t("showHow")}</Link>}</div><div className="dp-site-about-values"><article><h3>{t("aboutClarity")}</h3><p>{t("aboutClarityBody")}</p></article><article><h3>{t("aboutFees")}</h3><p>{t("feesNote")}</p></article></div>{section === "about" && <p className="dp-site-operator">{t("operator")}</p>}</section>;
  const airlines = <section className="dp-site-airlines"><div className="dp-site-section-title"><h2>{t("airlinesTitle")}</h2><button type="button" onClick={() => setPaused(value => !value)} aria-pressed={paused}>{t(paused ? "resume" : "pause")}</button></div><div className="dp-site-airline-window" data-paused={paused}><div className="dp-site-airline-track">{[false, true].map(duplicate => <div className="dp-site-airline-set" key={String(duplicate)} aria-hidden={duplicate || undefined}>{WEBSITE_AIRLINES.map(airline => <div className="dp-site-airline-logo" key={airline.name}>{/* Existing local brand assets; duplicate visual loop is hidden to screen readers. */}<img src={airline.src} alt={duplicate ? "" : airline.name} width="160" height="46" /></div>)}</div>)}</div></div><p className="dp-site-small">{t("airlinesBody")}</p></section>;
  const title = section === "home" ? t("hero") : section === "help" ? t("help") : section === "about" ? t("about") : section === "privacy" ? t("privacy") : section === "terms" ? t("terms") : "DelayPay";
  return <div className="dp-site" lang={locale} dir={["he", "ar"].includes(locale) ? "rtl" : "ltr"}>
    <a href="#website-main" className="dp-site-skip">{({ en: "Skip to content", he: "דילוג לתוכן", ru: "Перейти к содержимому", ar: "انتقل إلى المحتوى" })[locale]}</a>
    <AnalyticsProvider /><CookieConsentBanner locale={locale} />
    <header className="dp-site-header"><div className="dp-site-header-inner"><Link href={link("home")} aria-label="DelayPay"><img src="/images/delaypay-logo.png" alt="DelayPay" width="132" height="36" /></Link><nav className="dp-site-nav" data-open={menu} aria-label={navLabel[locale]} id="website-navigation"><Link href={`${link("home")}#how`}>{t("how")}</Link><a href={trackHref}>{t("trackClaim")}</a><Link href={link("help")} aria-current={section === "help" ? "page" : undefined}>{t("help")}</Link><Link href={link("about")} aria-current={section === "about" ? "page" : undefined}>{t("about")}</Link></nav><div className="dp-site-header-controls"><select aria-label={languageLabel[locale]} value={locale} onChange={event => { window.location.assign(link(section, event.target.value as Locale) + window.location.search); }}>{Object.entries(languages).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><a className="dp-site-action dp-site-signin" href={trackHref}>{t("signIn")}</a><button className="dp-site-menu" type="button" aria-expanded={menu} aria-controls="website-navigation" aria-label={navLabel[locale]} onClick={() => setMenu(value => !value)}>☰</button></div></div></header>
    <main className="dp-site-container" id="website-main">
      {section === "home" && <>
        <section className="dp-site-hero"><div className="dp-site-intro"><h1>{title}</h1><p>{t("heroBody")}</p><div className="dp-site-hero-actions"><a className="dp-site-action" href={claimHref}>{t("startClaim")}</a><a className="dp-site-action" href={trackHref}>{t("trackClaim")}</a><Link className="dp-site-action" href={link("help")}>{t("help")}</Link></div><p className="dp-site-small">{t("feesNote")}</p></div><WebsiteCompensationCalculator locale={locale} claimHref={claimHref} requestedType={calculatorRequest} /></section>
        <section className="dp-site-claim-types" aria-label={t("calculatorHeading")}>
          {claimCards.map(({type,title,body,Icon}) => <article key={type}><header><span className="dp-site-claim-icon"><Icon size={22} aria-hidden="true" /></span><h2>{t(title)}</h2></header><div><p>{t(body)}</p><button className="dp-site-action" type="button" onClick={() => setCalculatorRequest(previous => ({type,revision:(previous?.revision ?? 0)+1}))}>{t("claimCheck")} <span aria-hidden="true">{["he","ar"].includes(locale) ? "←" : "→"}</span></button></div></article>)}
        </section>
        {airlines}<section className="dp-site-process" id="how"><h2>{t("processTitle")}</h2><div>{(["One", "Two", "Three"] as const).map(index => <article key={index}><h3>{t(`step${index}`)}</h3><p>{t(`step${index}Body`)}</p></article>)}</div></section>{about}
      </>}
      {section === "about" && <><h1>{title}</h1>{about}{airlines}</>}
      {section === "help" && <><div className="dp-site-page-title"><h1>{title}</h1><p>{t("helpBody")}</p></div>{video !== null && <section className="dp-site-video"><h2>{tutorials[video].title}</h2><video controls playsInline preload="none" key={tutorials[video].url} src={tutorials[video].url} aria-label={tutorials[video].title} /><button className="dp-site-action" type="button" onClick={() => setVideo(null)}>{t("close")}</button></section>}<div className="dp-site-tutorials">{tutorials.map((item, index) => <article key={item.url}><button type="button" className="dp-site-video-cover" aria-label={item.title} onClick={() => setVideo(index)}><span>DelayPay</span><b>0{index + 1}</b><span aria-hidden="true">▶</span></button><div><h2>{item.title}</h2><button className="dp-site-action" type="button" onClick={() => setVideo(index)}>{t("watch")}</button></div></article>)}<ReimbursementTutorialPlaceholder locale={locale} variant="public" /></div></>}
      {WEBSITE_LEGAL_PAGES.some(name => name === section) && <article className="dp-site-legal" dangerouslySetInnerHTML={{ __html: WEBSITE_LEGAL_CONTENT[locale][section as typeof WEBSITE_LEGAL_PAGES[number]].replace(/href="\/(he|en|ru|ar)(?=\/|")/g, `href="${publicHost ? "" : "/site"}/$1`) }} />}
    </main>
    <footer className="dp-site-footer"><span>{t("copyright")}</span><nav aria-label={navLabel[locale]}><Link href={link("help")}>{t("help")}</Link><Link href={link("about")}>{t("about")}</Link><Link href={link("privacy")}>{t("privacy")}</Link><Link href={link("terms")}>{t("terms")}</Link><button type="button" onClick={openCookieSettings}>{t("cookieSettings")}</button></nav><WebsiteSocialLinks /></footer><WhatsAppFloat language={locale} />
  </div>;
}
