import { useEffect, useState } from "react";

export function useAnalysisResult<T>(url: string | null) {
  const [result, setResult] = useState<{ url: string; data?: T; previousData?: T; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal }).then(async response => {
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Could not load statistics.");
      }
      return response.json() as Promise<T>;
    }).then(data => {
      if (!controller.signal.aborted) setResult({ url, data });
    }).catch(error => {
      if (!controller.signal.aborted) setResult(current => ({ url, error: error.message, previousData: current?.data ?? current?.previousData }));
    });
    return () => controller.abort();
  }, [url, attempt]);

  return {
    previousData: result?.data ?? result?.previousData,
    data: result?.url === url ? result?.data : undefined,
    error: result?.url === url ? result?.error : undefined,
    retry: () => {
      setResult(current => ({ url: "", previousData: current?.data ?? current?.previousData }));
      setAttempt(current => current + 1);
    },
  };
}
