import { Link } from "react-router-dom";

// Shown when a page fails to load for a reason other than "doesn't exist".
export function LoadError({ message, onRetry }) {
  return (
    <div className="empty">
      <div className="empty-icon">⚠️</div>
      <h1>Something went wrong</h1>
      <p className="muted error-text">{message}</p>
      <button className="btn btn-primary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export default function NotFound({ title = "Page not found", message = "We couldn't find what you were looking for." }) {
  return (
    <div className="empty">
      <div className="empty-icon">🧦</div>
      <h1>{title}</h1>
      <p className="muted">{message}</p>
      <Link to="/" className="btn btn-primary">
        Go home
      </Link>
    </div>
  );
}
