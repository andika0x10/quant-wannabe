"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { CorrelationData } from "../../lib/correlations";

function useSource() {
  const [data, setData] = useState<CorrelationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch("/api/correlations", {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load");
      const result = (await response.json()) as CorrelationData;
      if (!signal?.aborted) setData(result);
    } catch {
      if (!signal?.aborted) setFailed(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  return { data, loading, failed, load, ready: !loading && !failed && !!data };
}

const MarketContext = createContext<ReturnType<typeof useSource> | null>(null);
export function MarketProvider({ children }: { children: ReactNode }) {
  const value = useSource();
  return (
    <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
  );
}
export function useMarketData() {
  const value = useContext(MarketContext);
  if (!value) throw new Error("MarketProvider is required");
  return value;
}
