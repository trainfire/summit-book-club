"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Book, Member, Nomination, Quote, ReadingHistory } from "@/lib/types";

type Tab = "current" | "nominations" | "quotes" | "history" | "members";
type Toast = { message: string; tone?: "success" | "error" };

const palette = ["#1e6b3c", "#7c3239", "#2e5c8a", "#b07840", "#5a3d6b", "#2e7d6b"];

function accent(value: string) {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function toNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

function dateLabel(value: string | null) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("current");
  const [members, setMembers] = useState<Member[]>([]);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [history, setHistory] = useState<ReadingHistory[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [memberName, setMemberName] = useState("");
  const [currentRead, setCurrentRead] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [nomTitle, setNomTitle] = useState("");
  const [nomAuthor, setNomAuthor] = useState("");
  const [quoteText, setQuoteText] = useState("");
  const [quoteBook, setQuoteBook] = useState("");
  const [historyTitle, setHistoryTitle] = useState("");
  const [historyAuthor, setHistoryAuthor] = useState("");
  const [historyRating, setHistoryRating] = useState("");

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId]
  );

  const showToast = useCallback((message: string, tone?: Toast["tone"]) => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const loadData = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [memberResult, bookResult, nominationResult, quoteResult, historyResult] = await Promise.all([
      supabase.from("members").select("*").order("name"),
      supabase.from("books").select("*").eq("is_current", true).limit(1).maybeSingle(),
      supabase.from("nominations").select("*, votes(*)").order("created_at", { ascending: false }),
      supabase.from("quotes").select("*").order("created_at", { ascending: false }),
      supabase.from("reading_history").select("*").order("created_at", { ascending: false })
    ]);

    const firstError = memberResult.error || bookResult.error || nominationResult.error || quoteResult.error || historyResult.error;
    if (firstError) {
      showToast(firstError.message, "error");
    } else {
      setMembers((memberResult.data ?? []) as Member[]);
      setCurrentBook((bookResult.data ?? null) as Book | null);
      setNominations((nominationResult.data ?? []) as Nomination[]);
      setQuotes((quoteResult.data ?? []) as Quote[]);
      setHistory((historyResult.data ?? []) as ReadingHistory[]);
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    setSelectedMemberId(localStorage.getItem("sbc_member_id") ?? "");
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedMemberId) localStorage.setItem("sbc_member_id", selectedMemberId);
  }, [selectedMemberId]);

  function requireMember() {
    if (selectedMember) return true;
    showToast("Pick your name first.", "error");
    return false;
  }

  async function saveCurrentBook(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !bookTitle.trim() || !bookAuthor.trim()) return;
    setSaving(true);
    const payload = { title: bookTitle.trim(), author: bookAuthor.trim(), is_current: true, progress_percent: 0 };
    const result = currentBook
      ? await supabase.from("books").update(payload).eq("id", currentBook.id)
      : await supabase.from("books").insert(payload);
    setSaving(false);
    if (result.error) return showToast(result.error.message, "error");
    showToast("Current book saved.", "success");
    setBookTitle("");
    setBookAuthor("");
    await loadData();
  }

  async function saveMember(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !memberName.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("members")
      .insert({ name: memberName.trim(), current_reading: currentRead.trim() || null })
      .select("id")
      .single();
    setSaving(false);
    if (error) return showToast(error.message, "error");
    if (data?.id) setSelectedMemberId(String(data.id));
    setMemberName("");
    setCurrentRead("");
    showToast("Member added.", "success");
    await loadData();
  }

  async function saveNomination(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !requireMember() || !nomTitle.trim() || !nomAuthor.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("nominations").insert({
      title: nomTitle.trim(),
      author: nomAuthor.trim(),
      suggested_by_member_id: selectedMember!.id,
      suggested_by_name: selectedMember!.name
    });
    setSaving(false);
    if (error) return showToast(error.message, "error");
    setNomTitle("");
    setNomAuthor("");
    showToast("Book nominated.", "success");
    await loadData();
  }

  async function toggleVote(nomination: Nomination) {
    if (!supabase || !requireMember()) return;
    const existingVote = nomination.votes?.find((vote) => vote.member_id === selectedMember!.id);
    setSaving(true);
    const result = existingVote
      ? await supabase.from("votes").delete().eq("id", existingVote.id)
      : await supabase.from("votes").insert({ nomination_id: nomination.id, member_id: selectedMember!.id });
    setSaving(false);
    if (result.error) return showToast(result.error.message, "error");
    showToast(existingVote ? "Vote removed." : "Vote added.", "success");
    await loadData();
  }

  async function saveQuote(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !requireMember() || !quoteText.trim() || !quoteBook.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("quotes").insert({
      quote_text: quoteText.trim(),
      book_title: quoteBook.trim(),
      submitted_by_member_id: selectedMember!.id,
      submitted_by_name: selectedMember!.name
    });
    setSaving(false);
    if (error) return showToast(error.message, "error");
    setQuoteText("");
    setQuoteBook("");
    showToast("Quote added.", "success");
    await loadData();
  }

  async function saveHistory(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !historyTitle.trim() || !historyAuthor.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("reading_history").insert({
      title: historyTitle.trim(),
      author: historyAuthor.trim(),
      rating: toNumber(historyRating)
    });
    setSaving(false);
    if (error) return showToast(error.message, "error");
    setHistoryTitle("");
    setHistoryAuthor("");
    setHistoryRating("");
    showToast("History entry added.", "success");
    await loadData();
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="setup-screen">
        <section>
          <div className="brand-mark">Summit Book Club</div>
          <h1>Supabase is not configured yet.</h1>
          <p>Copy <code>.env.example</code> to <code>.env.local</code>, add your Supabase URL and anon key, then run the SQL migration.</p>
        </section>
      </main>
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="book-icon">S</div>
          <div>
            <div className="brand-name">Summit Book Club</div>
            <div className="brand-sub">Est. 2026</div>
          </div>
        </div>
        <div className="stats">
          <div className="stat"><div>{members.length}</div><span>Members</span></div>
          <div className="stat"><div>{nominations.length}</div><span>Nominated</span></div>
          <div className="stat highlight"><div>{quotes.length}</div><span>Quotes</span></div>
        </div>
        <label className="member-select">
          <span>Signed in as</span>
          <select value={selectedMemberId} onChange={(event) => setSelectedMemberId(event.target.value)}>
            <option value="">pick your name</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
      </header>

      <nav className="nav">
        {[
          ["current", "I", "Current Book"],
          ["nominations", "II", "Nominations & Vote"],
          ["quotes", "III", "Quote Wall"],
          ["history", "IV", "Reading History"],
          ["members", "V", "Members"]
        ].map(([id, number, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id as Tab)}>
            <span>{number}</span>{label}
          </button>
        ))}
      </nav>

      <main className="page">
        {loading ? <div className="loading">Loading book club data...</div> : null}

        {!loading && tab === "current" ? (
          <section className="current-layout">
            <aside>
              <div className="cover large" style={{ background: accent(currentBook?.title ?? "Summit") }}>
                <span>{currentBook?.author ?? "Summit Book Club"}</span>
                <strong>{currentBook?.title ?? "Set the First Book"}</strong>
              </div>
            </aside>
            <div>
              <div className="eyebrow">Now Reading</div>
              <h1>{currentBook?.title ?? "Set the First Book"}</h1>
              <p className="subtitle">by {currentBook?.author ?? "Summit Book Club"}</p>
              <form onSubmit={saveCurrentBook} className="progress-card">
                <div className="form-grid two">
                  <label>Title<input value={bookTitle} onChange={(event) => setBookTitle(event.target.value)} placeholder={currentBook?.title ?? "Book title"} /></label>
                  <label>Author<input value={bookAuthor} onChange={(event) => setBookAuthor(event.target.value)} placeholder={currentBook?.author ?? "Author"} /></label>
                </div>
                <button className="primary-button" disabled={saving}>Save current book</button>
              </form>
            </div>
          </section>
        ) : null}

        {!loading && tab === "nominations" ? (
          <section>
            <div className="section-head"><div><h1>Up for vote</h1><p>Vote for as many books as you would read.</p></div></div>
            <form onSubmit={saveNomination} className="progress-card">
              <div className="form-grid two">
                <label>Title<input value={nomTitle} onChange={(event) => setNomTitle(event.target.value)} /></label>
                <label>Author<input value={nomAuthor} onChange={(event) => setNomAuthor(event.target.value)} /></label>
              </div>
              <button className="primary-button" disabled={saving}>Nominate a Book</button>
            </form>
            <div className="nomination-grid">
              {nominations.map((nomination) => {
                const voted = nomination.votes?.some((vote) => vote.member_id === selectedMemberId);
                return (
                  <article className="nomination-card" key={nomination.id}>
                    <button className={voted ? "vote voted" : "vote"} onClick={() => toggleVote(nomination)}>
                      <strong>{nomination.votes?.length ?? 0}</strong><span>votes</span>
                    </button>
                    <div className="cover small" style={{ background: accent(nomination.title) }}><strong>{nomination.title}</strong></div>
                    <div><h2>{nomination.title}</h2><p className="muted">{nomination.author}</p><small>Suggested by {nomination.suggested_by_name ?? "the club"}</small></div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {!loading && tab === "quotes" ? (
          <section>
            <div className="section-head"><div><h1>The quote wall</h1><p>Lines that stopped you.</p></div></div>
            <form onSubmit={saveQuote} className="progress-card">
              <label>Quote<textarea value={quoteText} onChange={(event) => setQuoteText(event.target.value)} /></label>
              <label>Book<input value={quoteBook} onChange={(event) => setQuoteBook(event.target.value)} /></label>
              <button className="primary-button" disabled={saving}>Add a Quote</button>
            </form>
            <div className="quote-wall">
              {quotes.map((quote) => <article key={quote.id}><div className="quote-mark">&quot;</div><p>{quote.quote_text}</p><hr /><strong>{quote.book_title}</strong><small>{quote.submitted_by_name ? `Submitted by ${quote.submitted_by_name}` : ""}</small></article>)}
            </div>
          </section>
        ) : null}

        {!loading && tab === "history" ? (
          <section>
            <div className="section-head"><div><h1>What we have read</h1><p>Every pick since the club started.</p></div></div>
            <form onSubmit={saveHistory} className="progress-card">
              <div className="form-grid three">
                <label>Title<input value={historyTitle} onChange={(event) => setHistoryTitle(event.target.value)} /></label>
                <label>Author<input value={historyAuthor} onChange={(event) => setHistoryAuthor(event.target.value)} /></label>
                <label>Rating<input type="number" min="0" max="5" step="0.1" value={historyRating} onChange={(event) => setHistoryRating(event.target.value)} /></label>
              </div>
              <button className="primary-button" disabled={saving}>Add Entry</button>
            </form>
            <div className="timeline">
              {history.map((entry) => <article key={entry.id}><time>{dateLabel(entry.read_date)}</time><div><h2>{entry.title}</h2><p className="muted">{entry.author}</p></div>{entry.rating ? <strong className="rating">{entry.rating} / 5</strong> : null}</article>)}
            </div>
          </section>
        ) : null}

        {!loading && tab === "members" ? (
          <section>
            <div className="section-head"><div><h1>The members</h1><p>Add everyone who should be able to vote.</p></div></div>
            <form onSubmit={saveMember} className="progress-card">
              <div className="form-grid two">
                <label>Name<input value={memberName} onChange={(event) => setMemberName(event.target.value)} /></label>
                <label>Currently reading<input value={currentRead} onChange={(event) => setCurrentRead(event.target.value)} /></label>
              </div>
              <button className="primary-button" disabled={saving}>Add Member</button>
            </form>
            <div className="member-grid">
              {members.map((member) => <article key={member.id} className="member-card"><span style={{ background: accent(member.name) }}>{initials(member.name)}</span><strong>{member.name}{member.id === selectedMemberId ? " (you)" : ""}</strong><small>{member.current_reading || "between books"}</small></article>)}
            </div>
          </section>
        ) : null}
      </main>

      {saving ? <div className="saving"><div>Saving to Supabase...</div></div> : null}
      {toast ? <div className={`toast ${toast.tone ?? ""}`}>{toast.message}</div> : null}
    </>
  );
}
