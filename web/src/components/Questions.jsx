import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircleQuestion, Trash2 } from "lucide-react";
import { errorMessage, pb } from "../lib/pb.js";
import { useApp } from "../lib/app.jsx";
import { ownerNames } from "../lib/owners.js";

const NO_OPTS = {};

// Anonymous questions about a list. Friends ask (mode "friend"); the owner answers (mode "owner").
export default function Questions({ list, items, mode, shareOpts = NO_OPTS, loginPath }) {
  const { user, config, notify } = useApp();
  const [questions, setQuestions] = useState(null);
  const owner = mode === "owner";
  const ownerName = ownerNames(list, "the list owner");
  const itemName = (id) => items.find((i) => i.id === id)?.name;

  const load = useCallback(() => {
    pb.collection("questions")
      .getFullList({ ...shareOpts, filter: pb.filter("list = {:l}", { l: list.id }), sort: "-created" })
      .then(setQuestions)
      .catch(() => setQuestions([]));
  }, [list.id, shareOpts]);

  useEffect(load, [load]);

  useEffect(() => {
    if (owner && questions && window.location.hash === "#questions") document.getElementById("questions")?.scrollIntoView({ behavior: "smooth" });
  }, [owner, questions]);

  if (!questions) return null;
  const visible = owner ? [...questions].sort((a, b) => !!a.answer - !!b.answer) : questions;
  if (owner && !visible.length) return null;

  return (
    <section className="panel questions" id="questions">
      <div className="panel-head">
        <h2>
          <MessageCircleQuestion size={18} /> {owner ? "Questions from friends" : `Questions for ${ownerName}`}
        </h2>
        <p className="muted small">
          {owner
            ? "Asked anonymously, so you won't know who's shopping for what. Your answers show on the list for everyone."
            : `Not sure about a size or color? Ask ${ownerName}. Questions are anonymous, and answers show here for everyone.`}
        </p>
      </div>

      {visible.length > 0 && (
        <ul className="q-list">
          {visible.map((q) => (
            <li key={q.id}>
              <div className="q-question">
                {q.item && itemName(q.item) && <span className="chip-static subtle">{itemName(q.item)}</span>} {q.question}
              </div>
              {owner ? (
                <AnswerForm q={q} onSaved={load} notify={notify} />
              ) : q.answer ? (
                <div className="q-answer">
                  <strong>{ownerNames(list, "Answer")}:</strong> {q.answer}
                </div>
              ) : (
                <div className="muted small">Waiting for an answer</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!owner &&
        (user ? (
          <AskForm list={list} items={items} shareOpts={shareOpts} onAsked={load} smtp={config.smtpEnabled} />
        ) : (
          <p className="small">
            <Link to={loginPath}>Log in</Link> to ask a question. It stays anonymous.
          </p>
        ))}
    </section>
  );
}

function AskForm({ list, items, shareOpts, onAsked, smtp }) {
  const { user, notify } = useApp();
  const [text, setText] = useState("");
  const [item, setItem] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await pb.collection("questions").create({ list: list.id, item, question: text.trim() }, shareOpts);
      setText("");
      setItem("");
      notify(smtp ? "Asked! We'll email you when it's answered (check spam if you don't see it)." : "Asked! The answer will show up here.");
      onAsked();
    } catch (err) {
      notify(errorMessage(err, "send your question"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form q-ask" onSubmit={ask}>
      <div className="row-2">
        <label>
          About <span className="muted">(optional)</span>
          <select value={item} onChange={(e) => setItem(e.target.value)}>
            <option value="">The whole list</option>
            {items
              .filter((i) => !i.received)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
        </label>
        <div />
      </div>
      <label>
        Your question
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} required maxLength={500} placeholder="e.g. What size do you wear?" />
      </label>
      <div>
        <button className="btn btn-primary btn-sm" disabled={busy || !user}>
          {busy ? "Sending…" : "Ask anonymously"}
        </button>
      </div>
    </form>
  );
}

function AnswerForm({ q, onSaved, notify }) {
  const [text, setText] = useState(q.answer || "");
  const [editing, setEditing] = useState(!q.answer);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await pb.collection("questions").update(q.id, { answer: text.trim() });
      notify(q.answer ? "Answer updated" : "Answered. It's on your list now, and we let them know.");
      setEditing(false);
      onSaved();
    } catch (err) {
      notify(errorMessage(err, "save your answer"), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this question? It'll disappear from your list for everyone.")) return;
    try {
      await pb.collection("questions").delete(q.id);
      onSaved();
    } catch (err) {
      notify(errorMessage(err, "delete the question"), "error");
    }
  };

  if (!editing) {
    return (
      <div className="q-answer">
        <strong>You:</strong> {q.answer}{" "}
        <button className="link-btn small" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
    );
  }
  return (
    <form className="q-answer-form" onSubmit={save}>
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} required maxLength={1000} placeholder="Your answer" />
      <div className="q-actions">
        <button className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? "Saving…" : "Answer"}
        </button>
        <button type="button" className="icon-btn icon-btn-sm" onClick={remove} title="Delete question" aria-label="Delete question">
          <Trash2 size={14} />
        </button>
      </div>
    </form>
  );
}
