"use client";

import { useEffect, useState } from "react";
import { READING_FRESHNESS_MS } from "@/lib/reading-freshness";

export function ReadingStatus({ recordedAt, stale }: { recordedAt: string; stale?: boolean }) {
  const [expiredReading, setExpiredReading] = useState<string>();
  const expired = stale || expiredReading === recordedAt;
  const message = expired ? "Latest reading is stale" : "Latest reading is up to date";

  useEffect(() => {
    if (stale) return;
    const delay = Math.max(0, Date.parse(recordedAt) + READING_FRESHNESS_MS - Date.now());
    const timer = window.setTimeout(() => setExpiredReading(recordedAt), delay);
    return () => window.clearTimeout(timer);
  }, [recordedAt, stale]);

  return <span className="reading-status" data-freshness={expired ? "stale" : "current"} title={message}>
    <span className="sr-only">{message}</span>
  </span>;
}
