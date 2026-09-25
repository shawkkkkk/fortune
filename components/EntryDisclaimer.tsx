"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import {
  CONSENT_RISKS,
  ENTRY_CONSENT_KEY,
  ENTRY_CONSENT_VERSION,
  RISK_POINTS,
  TESTNET_POINT,
} from "@/lib/disclaimer";

function storedConsent() {
  try {
    const raw = window.localStorage.getItem(ENTRY_CONSENT_KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as { version?: string }).version === ENTRY_CONSENT_VERSION;
  } catch {
    return false;
  }
}

/**
 * First-visit risk confirmation. It renders nothing on the server, so page HTML
 * stays clean, and it never blocks /docs, where the full disclaimer lives.
 */
export default function EntryDisclaimer() {
  const pathname = usePathname();
  const { language, setLanguage } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [needed, setNeeded] = useState(false);
  const [acceptedNow, setAcceptedNow] = useState(false);
  const [risks, setRisks] = useState(false);
  const titleId = useId();
  const leadId = useId();

  useEffect(() => {
    const exempt = pathname === "/docs" || pathname.startsWith("/docs/");
    setNeeded(!exempt && !acceptedNow && !storedConsent());
  }, [pathname, acceptedNow]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!needed || !dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
    document.documentElement.classList.add("entryGateOpen");
    return () => document.documentElement.classList.remove("entryGateOpen");
  }, [needed]);

  function accept() {
    try {
      window.localStorage.setItem(
        ENTRY_CONSENT_KEY,
        JSON.stringify({ version: ENTRY_CONSENT_VERSION, acceptedAt: new Date().toISOString() })
      );
    } catch {
      // Without storage the confirmation lasts for this visit only.
    }
    dialogRef.current?.close();
    setAcceptedNow(true);
  }

  if (!needed) return null;

  const points = FORTUNE_NETWORK.isMainnet ? RISK_POINTS : [...RISK_POINTS, TESTNET_POINT];

  return (
    <dialog
      ref={dialogRef}
      className="entryGate"
      aria-labelledby={titleId}
      aria-describedby={leadId}
      onCancel={(event) => event.preventDefault()}
    >
      <div className="entryGateInner">
        <div className="entryGateTop">
          <span className="entryGateSeal" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 2.8 4.5 5.6v5.6c0 4.6 3.1 8.6 7.5 9.9 4.4-1.3 7.5-5.3 7.5-9.9V5.6L12 2.8Z" />
              <path d="M12 7.6v5.2M12 15.9v.4" />
            </svg>
          </span>
          <button
            type="button"
            className="entryGateLang"
            onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
            aria-label="Language"
            translate="no"
          >
            {language === "zh" ? "EN" : "中文"}
          </button>
        </div>

        <div>
          <h2 id={titleId}>Before you enter Fortune</h2>
          <p id={leadId} className="entryGateLead">Please read and confirm before continuing.</p>
        </div>

        <dl className="entryGateRisks">
          {points.map((point) => (
            <div key={point.title} className={point === TESTNET_POINT ? "entryGateTestnet" : undefined}>
              <dt>{point.title}</dt>
              <dd>{point.body}</dd>
            </div>
          ))}
        </dl>

        <div className="entryGateChecks">
          <label className="entryGateCheck">
            <input type="checkbox" checked={risks} onChange={(event) => setRisks(event.target.checked)} />
            <span>{CONSENT_RISKS}</span>
          </label>
        </div>

        <button type="button" className="primaryCta entryGateContinue" disabled={!risks} onClick={accept}>
          Continue to Fortune →
        </button>

        <p className="entryGateFoot">
          <Link href="/docs#disclaimer" target="_blank" rel="noopener">Read the full disclaimer ↗</Link>
        </p>
      </div>
    </dialog>
  );
}
