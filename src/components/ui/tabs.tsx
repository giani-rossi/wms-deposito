"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type TabItem = {
  id: string;
  label: string;
  badge?: number;
  content: React.ReactNode;
};

/**
 * Tabs client-side simples (sin Radix). La barra de tabs scrollea en mobile.
 * Soporta navegación por hash (#id) para enlazar pestañas desde otras vistas.
 */
export function Tabs({
  tabs,
  defaultTab,
}: {
  tabs: TabItem[];
  defaultTab?: string;
}) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id);

  const tabIdsKey = tabs.map((t) => t.id).join("|");

  useEffect(() => {
    const ids = tabIdsKey.split("|");
    const applyHash = () => {
      const h = window.location.hash.replace("#", "");
      if (h && ids.includes(h)) setActive(h);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [tabIdsKey]);

  function select(id: string) {
    setActive(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
  }

  return (
    <div>
      <div className="mb-4 overflow-x-auto">
        <div className="inline-flex min-w-full gap-1 border-b">
          {tabs.map((tab) => {
            const isActive = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => select(tab.id)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                {typeof tab.badge === "number" && tab.badge > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div>{tabs.find((t) => t.id === active)?.content}</div>
    </div>
  );
}
