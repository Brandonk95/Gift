import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Eye, Mail, MessageCircle, MessageSquareText, RefreshCw, Share } from "lucide-react";
import Modal from "./Modal.jsx";
import { errorMessage, pb, randomToken } from "../lib/pb.js";
import { useApp } from "../lib/app.jsx";

export function shareUrl(list) {
  return `${window.location.origin}/s/${list.share_token}`;
}

export default function SharePanel({ list, onClose, onListChange }) {
  const { config, notify, setPrefs } = useApp();
  // for the dashboard's getting-started guide
  const markShared = () => setPrefs({ shared: true });
  const [emails, setEmails] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const url = shareUrl(list);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      markShared();
      notify("Link copied!");
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  const nativeShare = () =>
    navigator
      .share({ title: list.title, text: `My gift list: ${list.title}`, url })
      .then(markShared)
      .catch(() => {});

  const sendEmails = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await pb.send(`/api/giftlist/lists/${list.id}/share`, {
        method: "POST",
        body: { emails: emails.split(/[\s,;]+/).filter(Boolean), message },
      });
      if (res.sent) markShared();
      notify(`Sent to ${res.sent} ${res.sent === 1 ? "person" : "people"}${res.failed.length ? ` (${res.failed.length} failed)` : ""} ✉️ Let them know to check spam or junk if it doesn't arrive.`);
      setEmails("");
      setMessage("");
    } catch (err) {
      setError(errorMessage(err, "send the invitations"));
    } finally {
      setBusy(false);
    }
  };

  const resetLink = async () => {
    if (!confirm("Create a new link? The old link will stop working for everyone you've shared it with.")) return;
    try {
      const updated = await pb.collection("lists").update(list.id, { share_token: randomToken() });
      onListChange(updated);
      notify("New link created");
    } catch (err) {
      notify(errorMessage(err, "reset the share link"), "error");
    }
  };

  return (
    <Modal title="Share your list" onClose={onClose}>
      <p className="muted small">
        Anyone with this link can view your list.{" "}
        {config.smtpEnabled ? "Friends reserve gifts with just their email, no account needed." : "Friends need an account to reserve gifts."} You'll never see what's reserved.
      </p>
      <div className="input-group">
        <input readOnly value={url} onFocus={(e) => e.target.select()} />
        <button className="btn btn-primary" onClick={copy}>
          <Copy size={15} /> Copy
        </button>
      </div>
      <div className="share-row">
        {typeof navigator.share === "function" && (
          <button className="btn btn-secondary btn-sm" onClick={nativeShare}>
            <Share size={14} /> Share…
          </button>
        )}
        <a className="btn btn-secondary btn-sm" href={`sms:?&body=${encodeURIComponent(`My gift list: ${url}`)}`}>
          <MessageSquareText size={14} /> Text
        </a>
        <a className="btn btn-secondary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`My gift list "${list.title}": ${url}`)}`} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={14} /> WhatsApp
        </a>
        <a className="btn btn-secondary btn-sm" href={`mailto:?subject=${encodeURIComponent(`My gift list: ${list.title}`)}&body=${encodeURIComponent(url)}`}>
          <Mail size={14} /> Your email app
        </a>
        <a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noopener noreferrer">
          <Eye size={14} /> Preview
        </a>
      </div>

      <QrCard url={url} title={list.title} onDownload={markShared} />

      <div className="divider" />
      <h3>Send invitations by email</h3>
      {config.smtpEnabled ? (
        <form className="form" onSubmit={sendEmails}>
          <label>
            Email addresses
            <textarea rows={2} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="mom@example.com, sam@example.com" required />
          </label>
          <label>
            Personal message <span className="muted">(optional)</span>
            <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          <div>
            <button className="btn btn-primary" disabled={busy}>
              <Mail size={15} /> {busy ? "Sending…" : "Send invitations"}
            </button>
          </div>
        </form>
      ) : (
        <p className="muted small">Email invitations become available once the site admin configures SMTP. Until then, use the buttons above.</p>
      )}

      <div className="divider" />
      <div className="danger-row">
        <div>
          <strong>Reset share link</strong>
          <p className="muted small">Stops the current link from working.</p>
        </div>
        <button className="btn btn-danger btn-sm" onClick={resetLink}>
          <RefreshCw size={14} /> Reset link
        </button>
      </div>
    </Modal>
  );
}

// A QR code of the share link, to put on invitations, cards or a fridge note
function QrCard({ url, title, onDownload }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#18181b", light: "#ffffff" } })
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setSrc(""));
    return () => {
      alive = false;
    };
  }, [url]);
  if (!src) return null;
  const file = `${(title || "gift-list").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "gift-list"}-qr.png`;
  return (
    <div className="qr-card">
      <img src={src} alt={`QR code for ${title}`} width={140} height={140} />
      <div>
        <strong>QR code</strong>
        <p className="muted small">Print it on invitations or cards. Pointing a phone camera at it opens your list.</p>
        <a className="btn btn-secondary btn-sm" href={src} download={file} onClick={onDownload}>
          <Download size={14} /> Download
        </a>
      </div>
    </div>
  );
}
