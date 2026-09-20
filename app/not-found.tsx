import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page narrowPage">
      <section className="panel">
        <span className="eyebrow">404</span>
        <h2>That Fortune market was not found.</h2>
        <p>It may not be indexed yet, or the address/link may be incorrect.</p>
        <Link href="/" className="primaryCta">
          Back to Explore
        </Link>
      </section>
    </main>
  );
}
