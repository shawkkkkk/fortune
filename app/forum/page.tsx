import Link from "next/link";

export default function ForumPage() {
  return (
    <main className="page narrowPage">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">FORTUNE FORUM</span>
          <h1>Not live yet.</h1>
          <p>
            The earlier forum feed was a product mockup. It has been removed from
            the public alpha so nobody mistakes generated posts, votes, or activity
            for real users.
          </p>
        </div>
        <Link href="/testnet" className="primaryCta">Test Fortune onchain →</Link>
      </section>

      <section className="panel">
        <div className="emptyPanel">
          <strong>Community features come after the onchain alpha.</strong>
          <span>
            The first public release is intentionally focused on real wallet,
            curve, graduation, Pancake V3, and LP-lock behavior.
          </span>
        </div>
      </section>
    </main>
  );
}
