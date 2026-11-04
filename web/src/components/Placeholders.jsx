// Empty states (a small drawing, a sentence, one button) and loading placeholders.

const ART = {
  // an open gift box with a bow
  gift: (
    <>
      <rect x="34" y="58" width="92" height="62" rx="8" className="a-fill" />
      <rect x="28" y="44" width="104" height="20" rx="6" className="a-soft" />
      <rect x="74" y="44" width="12" height="76" className="a-accent" />
      <path d="M80 44c-10-18-30-20-30-8 0 9 16 9 30 8zM80 44c10-18 30-20 30-8 0 9-16 9-30 8z" className="a-accent-line" />
      <circle cx="40" cy="26" r="3" className="a-dot" />
      <circle cx="128" cy="22" r="4" className="a-dot" />
      <path d="M140 52l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" className="a-dot" />
    </>
  ),
  // a list card with a pen
  list: (
    <>
      <rect x="38" y="18" width="84" height="104" rx="10" className="a-fill" />
      <rect x="52" y="36" width="12" height="12" rx="3" className="a-accent" />
      <rect x="70" y="39" width="38" height="6" rx="3" className="a-soft" />
      <rect x="52" y="60" width="12" height="12" rx="3" className="a-soft" />
      <rect x="70" y="63" width="30" height="6" rx="3" className="a-soft" />
      <rect x="52" y="84" width="12" height="12" rx="3" className="a-soft" />
      <rect x="70" y="87" width="34" height="6" rx="3" className="a-soft" />
      <path d="M118 96l22-22 8 8-22 22-11 3z" className="a-accent-line" />
    </>
  ),
  // three people
  group: (
    <>
      <circle cx="80" cy="50" r="17" className="a-accent" />
      <path d="M50 116c0-20 13-34 30-34s30 14 30 34z" className="a-accent" />
      <circle cx="42" cy="62" r="13" className="a-soft" />
      <path d="M18 116c0-16 10-28 24-28 6 0 11 2 15 6-5 7-7 14-7 22z" className="a-soft" />
      <circle cx="118" cy="62" r="13" className="a-soft" />
      <path d="M142 116c0-16-10-28-24-28-6 0-11 2-15 6 5 7 7 14 7 22z" className="a-soft" />
    </>
  ),
  // a shopping bag
  bag: (
    <>
      <path d="M44 48h72l6 70H38z" className="a-fill" />
      <path d="M64 56V44a16 16 0 0132 0v12" className="a-accent-line" />
      <rect x="66" y="74" width="28" height="22" rx="4" className="a-accent" />
      <rect x="77" y="74" width="6" height="22" className="a-soft" />
      <circle cx="128" cy="30" r="4" className="a-dot" />
      <circle cx="30" cy="40" r="3" className="a-dot" />
    </>
  ),
  // a hat and a name slip
  santa: (
    <>
      <path d="M40 92c10-46 46-66 74-50-14 6-20 22-20 50z" className="a-accent" />
      <rect x="32" y="88" width="72" height="16" rx="8" className="a-fill" />
      <circle cx="120" cy="44" r="9" className="a-fill" />
      <rect x="96" y="96" width="44" height="26" rx="5" className="a-soft" />
      <rect x="104" y="106" width="28" height="5" rx="2.5" className="a-fill" />
    </>
  ),
};

export function EmptyArt({ art = "gift" }) {
  return (
    <svg className="empty-art" viewBox="0 0 160 136" aria-hidden="true">
      {ART[art]}
    </svg>
  );
}

export function EmptyState({ art = "gift", title, text, children, small }) {
  return (
    <div className={`empty ${small ? "empty-sm" : ""}`}>
      <EmptyArt art={art} />
      {title && <h3>{title}</h3>}
      {text && <p className="muted">{text}</p>}
      {children}
    </div>
  );
}

// Grey shapes where cards will appear, so the page doesn't jump when data arrives
export function CardsSkeleton({ header = false, count = 4, kind = "items" }) {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      {header && <div className="skeleton skeleton-header" />}
      <div className={kind === "lists" ? "list-grid" : "items items-grid"}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton skeleton-media" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RowsSkeleton({ count = 3 }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton skeleton-thumb" />
          <div className="skeleton-row-text">
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}
