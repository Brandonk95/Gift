import { Link } from "react-router-dom";
import { EyeOff, Link2, Palette, ShoppingBag, Sparkles, Star } from "lucide-react";
import { useApp } from "../lib/app.jsx";
import Dashboard from "./Dashboard.jsx";

export default function Home() {
  const { user } = useApp();
  return user ? <Dashboard /> : <Landing />;
}

const FEATURES = [
  { icon: Sparkles, title: "Paste a link, done", text: "We grab the product's picture, name and price for you." },
  { icon: Link2, title: "Share privately", text: "Send a link by text, chat or email. Only people with it can see your list." },
  { icon: EyeOff, title: "Surprises stay surprises", text: "Friends reserve gifts so nobody doubles up — and you never see what's taken." },
  { icon: ShoppingBag, title: "A shopping list for givers", text: "Everything you've promised to buy, in one place, with progress tracking." },
  { icon: Star, title: "Organize your way", text: "Categories, priorities, sizes, drag-to-reorder, and archived lists for next year." },
  { icon: Palette, title: "Make it yours", text: "Light or dark, your accent color, your font, card or list layouts." },
];

function Landing() {
  const { config } = useApp();
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow-pill">Wish lists for every occasion</span>
          <h1>
            The gift list that <span className="accent-text">keeps the surprise</span>.
          </h1>
          <p className="hero-sub">
            Make lists for Christmas, birthdays, weddings or anything else. Share them with family and friends — they reserve gifts so nobody buys the same
            thing, and you never find out who's getting what.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn btn-primary btn-lg">
              Create your list
            </Link>
            <Link to="/login" className="btn btn-secondary btn-lg">
              Log in
            </Link>
          </div>
        </div>

        <div className="hero-demo" aria-hidden="true">
          <div className="demo-card">
            <div className="demo-head">
              <span className="list-icon list-icon-md" style={{ "--list-color": "#16a34a" }}>
                🎄
              </span>
              <div>
                <div className="demo-title">Christmas 2026</div>
                <div className="muted small">Sam's list · 52 days to go</div>
              </div>
            </div>
            {[
              ["🎧", "Noise-cancelling headphones", "$129", "Reserved by Mom", true],
              ["📚", "The Hobbit (illustrated)", "$32", null, false],
              ["👟", "Running shoes · Size 10", "$95", null, false],
            ].map(([e, n, p, r, star]) => (
              <div key={n} className="demo-row">
                <span className="demo-thumb">{e}</span>
                <span className="demo-name">
                  {n} {star && <Star size={13} fill="currentColor" className="star-on" />}
                </span>
                <span className="demo-price">{p}</span>
                {r ? <span className="status-pill status-taken static">{r}</span> : <span className="btn btn-primary btn-xs">I'll get this</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature">
            <span className="feature-icon">
              <f.icon size={20} />
            </span>
            <h3>{f.title}</h3>
            <p className="muted">{f.text}</p>
          </div>
        ))}
      </section>

      <section className="cta">
        <h2>Ready for the holidays?</h2>
        <p className="muted">It takes about a minute to set up your first list on {config.appName || "Gift List"}.</p>
        <Link to="/register" className="btn btn-primary btn-lg">
          Get started — it's free
        </Link>
      </section>
    </div>
  );
}
