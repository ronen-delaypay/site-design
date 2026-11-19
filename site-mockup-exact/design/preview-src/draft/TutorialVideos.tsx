import { ReimbursementTutorialPlaceholder } from "./ReimbursementTutorialPlaceholder";
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Play, X } from "lucide-react";
import { useLocale } from "@/hooks/useLocale";
import { WEBSITE_TUTORIALS } from "@/lib/website/content";
import { PORTAL_TUTORIAL_DETAILS } from "@/lib/client/tutorial-video-content";
import "@snapshot/components/client/v2/tutorial-videos.css";

const LABELS = {
  en: { title: "Tutorial videos", watch: "Watch video", close: "Close video", original: "Open original video" },
  he: { title: "סרטוני הדרכה", watch: "צפייה בסרטון", close: "סגירת הסרטון", original: "פתיחת הסרטון המקורי" },
  ru: { title: "Обучающие видео", watch: "Смотреть видео", close: "Закрыть видео", original: "Открыть исходное видео" },
  ar: { title: "فيديوهات توضيحية", watch: "مشاهدة الفيديو", close: "إغلاق الفيديو", original: "فتح الفيديو الأصلي" },
};

export function TutorialVideos() {
  const [locale] = useLocale();
  const [selected, setSelected] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const labels = LABELS[locale];
  const videos = WEBSITE_TUTORIALS.filter(item => item.lang === locale).map(video => ({
    ...video,
    ...PORTAL_TUTORIAL_DETAILS[video.url],
  }));
  const activeVideo = selected === null ? null : videos[selected];

  useEffect(() => {
    if (selected !== null && !dialog.current?.open) dialog.current?.showModal();
    else if (selected === null && dialog.current?.open) dialog.current.close();
  }, [selected]);

  return (
    <section className="dp-approved-tutorials-section" aria-labelledby="tutorials-title">
      <h2 id="tutorials-title" className="dp-approved-tutorials-heading">{labels.title}</h2>
      <div className="dp-approved-tutorials">
        {videos.map((video, index) => (
          <article className="dp-approved-tutorial" key={video.url}>
            <div className="dp-approved-tutorial-topic"><h3>{video.title}</h3></div>
            <button className="dp-approved-tutorial-cover" type="button" aria-label={`${labels.watch}: ${video.title}`} onClick={() => setSelected(index)}>
              <Image src={video.poster} width={720} height={405} alt="" sizes="(max-width: 760px) 100vw, 544px" />
            </button>
            <p className="dp-approved-tutorial-description">{video.description}</p>
            <div className="dp-approved-tutorial-action">
              <button type="button" className="dp-approved-action dp-approved-tutorial-watch" aria-label={`${labels.watch}: ${video.title}`} onClick={() => setSelected(index)}>
                <Play size={18} fill="currentColor" aria-hidden="true" />
                <span>{labels.watch}</span>
              </button>
            </div>
          </article>
        ))}
        <ReimbursementTutorialPlaceholder locale={locale} />
      </div>
      <dialog ref={dialog} className="dp-approved-tutorial-player" aria-labelledby="tutorial-player-title" onClose={() => setSelected(null)} onClick={event => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}>
        {activeVideo && <>
          <div className="dp-approved-tutorial-player-heading">
            <h2 id="tutorial-player-title">{activeVideo.title}</h2>
            <button type="button" className="dp-approved-tutorial-close" aria-label={labels.close} onClick={() => dialog.current?.close()}><X size={24} aria-hidden="true" /></button>
          </div>
          <video key={activeVideo.url} src={activeVideo.url} controls autoPlay playsInline preload="none" aria-label={activeVideo.title} />
          <a className="dp-approved-tutorial-original" href={activeVideo.url} target="_blank" rel="noopener noreferrer">{labels.original}</a>
        </>}
      </dialog>
    </section>
  );
}
