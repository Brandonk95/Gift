import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { errorMessage, pb } from "../lib/pb.js";
import { useApp } from "../lib/app.jsx";

// Two anonymous conversations: with the person you're buying for, and with your own Santa
export default function SantaMessages({ exchangeId }) {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("recipient");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    pb.send(`/api/giftlist/exchanges/${exchangeId}/messages`)
      .then(setData)
      .catch(() => setData(null));
  }, [exchangeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [data, tab]);

  if (!data || (!data.recipient && !data.santa)) return null;
  const current = data[tab] || data.recipient || data.santa;
  const active = data[tab] ? tab : data.recipient ? "recipient" : "santa";
  const santaLabel = data.santa?.name ? `Your Santa (${data.santa.name})` : "Your Secret Santa";

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await pb.send(`/api/giftlist/exchanges/${exchangeId}/messages`, { method: "POST", body: { to: active, text: text.trim() } });
      setData((d) => ({ ...d, recipient: d.recipient && { ...d.recipient, ...r.recipient }, santa: d.santa && { ...d.santa, ...r.santa } }));
      setText("");
    } catch (err) {
      notify(errorMessage(err, "send your message"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel santa-messages" id="messages">
      <div className="panel-head">
        <h2>
          <MessageCircle size={18} /> Messages
        </h2>
        <p className="muted small">
          {active === "recipient"
            ? `Ask ${data.recipient.name} about sizes or ideas. They won't know it's you.`
            : "Your Santa can't see your name here, but you can thank them or drop a hint."}
        </p>
      </div>
      <div className="segmented santa-tabs" role="tablist">
        {data.recipient && (
          <button role="tab" aria-selected={active === "recipient"} className={active === "recipient" ? "active" : ""} onClick={() => setTab("recipient")}>
            {data.recipient.name}
          </button>
        )}
        {data.santa && (
          <button role="tab" aria-selected={active === "santa"} className={active === "santa" ? "active" : ""} onClick={() => setTab("santa")}>
            {santaLabel}
          </button>
        )}
      </div>
      <div className="chat">
        {current.messages.length === 0 && <p className="muted small chat-empty">No messages yet.</p>}
        {current.messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.mine ? "mine" : ""}`}>
            <span className="chat-who small muted">{m.mine ? "You" : active === "recipient" ? data.recipient.name : santaLabel}</span>
            <span className="chat-bubble">{m.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="chat-form" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" maxLength={1000} required aria-label="Message" />
        <button className="btn btn-primary" disabled={busy || !text.trim()} aria-label="Send">
          <Send size={15} />
        </button>
      </form>
    </section>
  );
}
