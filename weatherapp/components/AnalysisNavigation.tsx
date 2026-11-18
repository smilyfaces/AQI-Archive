"use client";

import { useEffect, useRef, useState } from "react";

export function AnalysisNavigation({ prefix, hasModels }: { prefix: string; hasModels: boolean }) {
  const [current, setCurrent] = useState("overview");
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    const workspace = nav.current?.closest<HTMLElement>(".insights-content");
    const toolbar = workspace?.querySelector<HTMLElement>(".insights-toolbar");
    if (!workspace || !toolbar) return;
    const sections = [...workspace.querySelectorAll<HTMLElement>("[data-analysis-section]")];
    let observer: IntersectionObserver | undefined;

    function updateOffset() {
      if (!workspace || !toolbar || !sections.length) return;
      workspace.style.setProperty("--analysis-toolbar-height", `${toolbar.offsetHeight}px`);
      const anchorOffset = parseFloat(getComputedStyle(sections[0]).scrollMarginTop);
      const top = Math.min(window.innerHeight - 2, Math.ceil(anchorOffset) + 8);
      const bottom = window.innerHeight - top - 1;

      observer?.disconnect();
      observer = new IntersectionObserver(entries => {
        const visible = entries.find(entry => entry.isIntersecting);
        if (visible) setCurrent((visible.target as HTMLElement).dataset.analysisSection ?? "overview");
      }, { rootMargin: `-${top}px 0px -${bottom}px` });
      sections.forEach(section => observer?.observe(section));
    }

    const resize = new ResizeObserver(updateOffset);
    updateOffset();
    resize.observe(toolbar);
    window.addEventListener("resize", updateOffset);
    return () => {
      resize.disconnect();
      observer?.disconnect();
      window.removeEventListener("resize", updateOffset);
    };
  }, [hasModels]);

  const sections = [
    ["overview", "Overview"], ["charts", "Charts"], ["relationships", "Relationships"],
    ["patterns", "Time patterns"], ["comparisons", "Comparisons"],
    ...(hasModels ? [["models", "Weather models"]] : []), ["quality", "Data quality"],
  ];

  return (
    <nav ref={nav} className="analysis-nav" aria-label="Analysis sections">
      {sections.map(([key, label]) => (
        <a key={key} href={`#${prefix}-${key}`} aria-current={key === current ? "location" : undefined} onClick={() => setCurrent(key)}>
          {label}
        </a>
      ))}
    </nav>
  );
}
