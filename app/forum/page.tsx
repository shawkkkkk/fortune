import Link from "next/link";
import { launches } from "@/data/mock";

const posts = [
  { user: "0x77A…19F", time: "4m", title: "CHIP is almost at graduation", body: "Four-market basket is at 98%. The NVDAx leg has been the most interesting part of this launch.", token: launches[1], votes: 48, comments: 17 },
  { user: "0x103…AB2", time: "18m", title: "Which reward asset would you choose?", body: "BNB vs CAKE for holder rewards on a new BSC-native launch?", token: launches[0], votes: 29, comments: 34 },
  { user: "0xC92…D10", time: "41m", title: "Gold Rush graduated cleanly", body: "The BNB / USDT / XAUT basket is live. Watching the price convergence between the three pools.", token: launches[2], votes: 71, comments: 22 },
];

export default function ForumPage() {
  return (
    <main className="page narrowPage">
      <div className="forumHeading">
        <div>
          <span className="eyebrow">FORTUNE FORUM</span>
          <h1>Markets have communities.</h1>
          <p>Discuss launches, attach live Fortune markets, and follow creators.</p>
        </div>
        <button className="primaryCta">New post</button>
      </div>
      <div className="forumTabs"><button className="tabActive">Hot</button><button>New</button><button>Following</button><button>Tokens I hold</button></div>
      <div className="forumLayout">
        <div className="postFeed">
          {posts.map((post) => (
            <article className="post" key={post.title}>
              <div className="voteRail"><button>⌃</button><strong>{post.votes}</strong><button>⌄</button></div>
              <div className="postBody">
                <div className="mutedSmall">{post.user} · {post.time}</div>
                <h3>{post.title}</h3>
                <p>{post.body}</p>
                <Link href={`/token/${post.token.id}`} className="attachedToken">
                  <span className="tokenAvatar">{post.token.symbol.slice(0,2)}</span>
                  <span><strong>{post.token.symbol}</strong><small>{post.token.quoteAssets.join(" · ")}</small></span>
                  <span className="attachedProgress">{post.token.graduationProgress}%</span>
                </Link>
                <div className="postFooter">◌ {post.comments} comments <button>Buy</button></div>
              </div>
            </article>
          ))}
        </div>
        <aside className="sidebarCard">
          <span className="eyebrow">BIGGEST LAUNCHES</span>
          {launches.slice().sort((a,b)=>b.marketCap-a.marketCap).map((l,i)=>(
            <Link href={`/token/${l.id}`} className="rankRow" key={l.id}>
              <span>{i+1}</span><strong>{l.symbol}</strong><span>{(l.marketCap/1e6).toFixed(2)}M</span>
            </Link>
          ))}
        </aside>
      </div>
    </main>
  );
}
