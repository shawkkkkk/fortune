import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page narrowPage">
      <section className="panel emptyPanel statePanel">
        <img className="mascotEmpty" src="/fortune-cat-cutout.webp" alt="Fortune lucky cat" width="124" height="124" loading="lazy" />
        <span className="eyebrow">404</span>
        <h1>That Fortune market was not found.</h1>
        <p>It may not be indexed yet, or the address/link may be incorrect.</p>
        <div className="heroActions">
          <Link href="/explore" className="primaryCta">
            Back to Explore
          </Link>
          <Link href="/" className="secondaryCta">
            Home
          </Link>
        </div>
      </section>
    </main>
  );
}
