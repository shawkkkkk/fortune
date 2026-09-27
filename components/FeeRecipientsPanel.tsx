"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { useLanguage } from "@/components/LanguageProvider";
import { formatAmount, shortAddress } from "@/lib/market-format";
import { describeAccount, formatShareBps, socialPlatform, type SocialIdentity } from "@/lib/social-fees";

type Recipient = SocialIdentity & { shareBps: number };

export function waitLabel(seconds: number, zh: boolean) {
  if (seconds <= 0) return zh ? "即将生效" : "any moment";
  if (seconds < 2 * 3_600) return zh ? `${Math.ceil(seconds / 60)} 分钟后` : `in ${Math.ceil(seconds / 60)} min`;
  if (seconds < 2 * 86_400) return zh ? `约 ${Math.round(seconds / 3_600)} 小时后` : `in about ${Math.round(seconds / 3_600)} h`;
  return zh ? `约 ${Math.round(seconds / 86_400)} 天后` : `in about ${Math.round(seconds / 86_400)} days`;
}

export function RecipientState({ recipient, now }: { recipient: SocialIdentity; now: number }) {
  const { language } = useLanguage();
  const zh = language === "zh";
  if (recipient.platform === 0) return <span className="recipientBadge recipientWallet">Wallet</span>;
  if (recipient.wallet) {
    return (
      <span className="recipientBadge recipientVerified" translate="no">
        {zh ? "已验证" : "Verified"} · {shortAddress(recipient.wallet)}
      </span>
    );
  }
  if (recipient.pendingWallet && recipient.pendingAt) {
    return (
      <span className="recipientBadge recipientPending" translate="no">
        {zh ? "验证生效中" : "Verifying"} · {waitLabel(recipient.pendingAt - now, zh)}
      </span>
    );
  }
  return <span className="recipientBadge">Not verified yet</span>;
}

export function RecipientName({ recipient }: { recipient: SocialIdentity }) {
  if (recipient.platform === 0 && recipient.wallet) {
    return (
      <Link translate="no" href={`/profile/${recipient.wallet}`}>
        {shortAddress(recipient.wallet)}
      </Link>
    );
  }
  const platform = socialPlatform(recipient.platform);
  if (!platform) return <span translate="no">{recipient.account}</span>;
  return (
    <span className="recipientName">
      <span className="recipientPlatform">{platform.label}</span>
      <a translate="no" href={platform.profileUrl(recipient.account)} target="_blank" rel="noreferrer nofollow">
        {describeAccount(recipient.platform, recipient.account)}
      </a>
    </span>
  );
}

export default function FeeRecipientsPanel({
  recipients,
  collected,
  uncollected,
  pairSymbol,
  pairDecimals,
  now,
  busy,
  onCollect,
}: {
  recipients: Recipient[];
  collected: string;
  uncollected: string;
  pairSymbol: string;
  pairDecimals: number;
  now: number;
  busy: boolean;
  onCollect: () => void;
}) {
  const amount = (raw: string) => formatAmount(Number(formatUnits(BigInt(raw), pairDecimals)));

  return (
    <section className="panel feeRecipients" aria-labelledby="fee-recipients-title">
      <span className="eyebrow">CREATOR FEE SPLIT</span>
      <h2 id="fee-recipients-title">Where the creator fee goes</h2>
      <ul className="recipientList">
        {recipients.map((recipient) => (
          <li key={recipient.identityId}>
            <div className="recipientMain">
              <RecipientName recipient={recipient} />
              <strong className="recipientShare" translate="no">{formatShareBps(recipient.shareBps)}</strong>
            </div>
            <div className="recipientMeta">
              <RecipientState recipient={recipient} now={now} />
              {recipient.platform !== 0 && !recipient.wallet ? (
                <Link
                  className="recipientClaim"
                  href={`/claims?platform=${socialPlatform(recipient.platform)?.key ?? recipient.platform}&account=${encodeURIComponent(recipient.account)}`}
                >
                  Is this you? Claim →
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <div className="statRows">
        <div><span>Waiting in the curve</span><strong translate="no">{amount(uncollected)} {pairSymbol}</strong></div>
        <div><span>Collected for recipients</span><strong translate="no">{amount(collected)} {pairSymbol}</strong></div>
      </div>
      {BigInt(uncollected) > 0n ? (
        <button type="button" className="secondaryCta" disabled={busy} onClick={onCollect}>
          Collect fees for recipients
        </button>
      ) : null}
      <p className="fieldHint">
        Anyone can collect: it moves this launch&apos;s creator fees into the fee vault, split by share. Social accounts claim theirs on the Claims page after verifying. Naming an account does not mean its owner endorses this token.
      </p>
    </section>
  );
}
