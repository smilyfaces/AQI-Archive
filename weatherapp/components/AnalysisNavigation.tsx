"use client";

import { useEffect, useState } from "react";

export function AnalysisNavigation({ prefix, hasModels }: { prefix: string; hasModels: boolean }) {
  const [current, setCurrent] = useState("overview");
  useEffect(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>("[data-analysis-section]")].filter(node => node.id.startsWith(prefix));
    const observer = new IntersectionObserver(entries => {
      const visible = entries.find(entry => entry.isIntersecting);
      if (visible) setCurrent((visible.target as HTMLElement).dataset.analysisSection ?? "overview");
    }, { rootMargin: "-25% 0px -55%" });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [prefix, hasModels]);
  const sections = [["overview", "Overview"], ["charts", "Charts"], ["relationships", "Relationships"], ["patterns", "Time patterns"], ["comparisons", "Comparisons"], ...(hasModels ? [["models", "Weather models"]] : []), ["quality", "Data quality"]];
  return <nav className="analysis-nav" aria-label="Analysis sections">
    {sections.map(([key, label]) => <a key={key} href={`#${prefix}-${key}`} aria-current={key === current ? "location" : undefined} onClick={() => setCurrent(key)}>{label}</a>)}
  </nav>;
}
