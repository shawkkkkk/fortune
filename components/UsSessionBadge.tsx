"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { sessionLine, usMarketStatus } from "@/lib/market-hours";

/**
 * Live US market session for tokenized stocks. The time only renders after
 * mount, so server HTML never disagrees with the visitor's clock.
 */
export default function UsSessionBadge() {
  const { language } = useLanguage();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const status = now === null ? null : usMarketStatus(now);
  return (
    <span
      className={"pickSession" + (status ? " pickSession-" + status.session : "")}
      translate="no"
      title="Tokenized stocks trade onchain 24/7. Outside US market hours their price can drift from the listed share and gap at the next open."
    >
      <i aria-hidden="true" />
      {status && now !== null ? sessionLine(status, language === "zh", now) : "US market hours"}
    </span>
  );
}
