"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Book, Member, Nomination, Quote, ReadingHistory } from "@/lib/types";

type Tab = "current" | "nominations" | "quotes" | "history" | "members";
type SortMode = "votes" | "pages" | "new";
type Toast = { message: string; tone?: "success" | "error" };

const emptyBookForm = {
  title: "",
  author: "",
  year: "",
  pages: "",
  genre: "",
  progress_percent: "0",
  suggested_by: "",
  meeting_date: "",
  meeting_location: "",
  library_copies: "",
  cocktail_name: "",
  cocktail_recipe: "",
  cocktail_paired_by: "",
  goodreads_url: "",
  libby_url: "",
  library_url: ""
};

const emptyNominationForm = {
  title: "",
  author: "",
  year: "",
  pages: "",
  genre: "",
  description: "",
  library_wait: "",
  has_audio: false,
  has_paperback: false,
  has_adaptation: false
};

const emptyHistoryForm = {
  title: "",
  author: "",
  suggested_by: "",
  read_date: "",
  rating: "",
  group_note: ""
};

const palette = [
  "#1e6b3c",
  "#7c3239",
  "#2e5c8a",
  "#b07840",
  "#5a3d6b",
  "#2e7d6b",
  "#6b4c2e",
  "#3d5a7c",
  "#6b3d2e",
  "#3d6b4c"
];

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

function safeUrl(value: string | null) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function dateLabel(value: string | null, options: Intl.DateTimeFormatOptions) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", options);
}

function ratingLabel(value: number | string | null) {
  if (value === null || value === "") return "";
  const rating = Number(value);
  return Number.isFinite(rating) ? rating.toFixed(1) : "";
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="modal-shell" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={wide ? "modal wide" : "modal"} aria-modal="true" role="dialog">
        <div className="modal-title">{title}</div>
        <div className="modal-subtitle">{subtitle}</div>
        {children}
      </section>
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("current");
  const [sortMode, setSortMode] = useState<SortMode>("votes");
  const [members, setMembers] = useState<Member[]>([]);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [history, setHistory] = useState<ReadingHistory[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [modal, setModal] = useState<"" | "book" | "nomination" | "quote" | "history" | "member">("");
  const [memberEditing, setMemberEditing] = useState<Member | null>(null);
  const [nominationEditing, setNominationEditing] = useState<Nomination | null>(null);
  const [quoteEditing, setQuoteEditing] = useState<Quote | null>(null);
  const [historyEditing, setHistoryEditing] = useState<ReadingHistory | null>(null);
  const [bookForm, setBookForm] = useState(emptyBookForm);
  const [nominationForm, setNominationForm] = useState(emptyNominationForm);
  const [quoteForm, setQuoteForm] = useState({ quote_text: "", book_title: "", book_author: "" });
  const [historyForm, setHistoryForm] = useState(emptyHistoryForm);
  const [memberForm, setMemberForm] = useState({ name: "", current_reading: "" });

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId]
  );

  const selectedVoteCount = useMemo(() => {
    if (!selectedMemberId) return 0;
    return nominations.filter((nomination) =>
      nomination.votes?.some((vote) => vote.member_id === selectedMemberId)
    ).length;
  }, [nominations, selectedMemberId]);

  const sortedNominations = useMemo(() => {
    const copy = [...nominations];
    if (sortMode === "votes") {
      return copy.sort((a, b) => (b.votes?.length ?? 0) - (a.votes?.length ?? 0));
    }
    if (sortMode === "pages") {
      return copy.sort((a, b) => (a.pages ?? 99999) - (b.pages ?? 99999));
    }
    return copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [nominations, sortMode]);

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
      supabase
        .from("reading_history")
        .select("*")
        .order("read_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
    ]);

    const firstError =
      memberResult.error ||
      bookResult.error ||
      nominationResult.error ||
      quoteResult.error ||
      historyResult.error;

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
    if (!selectedMemberId) return;
    localStorage.setItem("sbc_member_id", selectedMemberId);
  }, [selectedMemberId]);

  function requireMember() {
    if (selectedMember) return true;
    showToast("Pick your name first.", "error");
    return false;
  }

  function openBookModal() {
    const book = currentBook;
    setBookForm(
      book
        ? {
            title: book.title,
            author: book.author,
            year: book.year?.toString() ?? "",
            pages: book.pages?.toString() ?? "",
            genre: book.genre ?? "",
            progress_percent: book.progress_percent?.toString() ?? "0",
            suggested_by: book.suggested_by ?? "",
            meeting_date: book.meeting_date ?? "",
            meeting_location: book.meeting_location ?? "",
            library_copies: book.library_copies ?? "",
            cocktail_name: book.cocktail_name ?? "",
            cocktail_recipe: book.cocktail_recipe ?? "",
            cocktail_paired_by: book.cocktail_paired_by ?? "",
            goodreads_url: book.goodreads_url ?? "",
            libby_url: book.libby_url ?? "",
            library_url: book.library_url ?? ""
          }
        : emptyBookForm
    );
    setModal("book");
  }

  function openNominationModal(nomination?: Nomination) {
    setNominationEditing(nomination ?? null);
    setNominationForm(
      nomination
        ? {
            title: nomination.title,
            author: nomination.author,
            year: nomination.year?.toString() ?? "",
            pages: nomination.pages?.toString() ?? "",
            genre: nomination.genre ?? "",
            description: nomination.description ?? "",
            library_wait: nomination.library_wait ?? "",
            has_audio: nomination.has_audio,
            has_paperback: nomination.has_paperback,
            has_adaptation: nomination.has_adaptation
          }
        : emptyNominationForm
    );
    setModal("nomination");
  }

  function openQuoteModal(quote?: Quote) {
    setQuoteEditing(quote ?? null);
    setQuoteForm(
      quote
        ? {
            quote_text: quote.quote_text,
            book_title: quote.book_title,
            book_author: quote.book_author ?? ""
          }
        : { quote_text: "", book_title: "", book_author: "" }
    );
    setModal("quote");
  }

  function openHistoryModal(entry?: ReadingHistory) {
    setHistoryEditing(entry ?? null);
    setHistoryForm(
      entry
        ? {
            title: entry.title,
            author: entry.author,
            suggested_by: entry.suggested_by ?? "",
            read_date: entry.read_date ?? "",
            rating: ratingLabel(entry.rating),
            group_note: entry.group_note ?? ""
          }
        : emptyHistoryForm
    );
    setModal("history");
  }

  async function saveBook(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (!bookForm.title.trim() || !bookForm.author.trim()) {
      showToast("Title and author are required.", "error");
      return;
    }

    setSaving(true);
    const payload = {
      title: bookForm.title.trim(),
      author: bookForm.author.trim(),
      year: toNumber(bookForm.year),
      pages: toNumber(bookForm.pages),
      genre: bookForm.genre.trim() || null,
      progress_percent: Math.max(0, Math.min(100, Number(bookForm.progress_percent || 0))),
      suggested_by: bookForm.suggested_by.trim() || null,
      meeting_date: bookForm.meeting_date || null,
      meeting_location: bookForm.meeting_location.trim() || null,
      library_copies: bookForm.library_copies.trim() || null,
      cocktail_name: bookForm.cocktail_name.trim() || null,
      cocktail_recipe: bookForm.cocktail_recipe.trim() || null,
      cocktail_paired_by: bookForm.cocktail_paired_by.trim() || null,
      goodreads_url: safeUrl(bookForm.goodreads_url) || null,
      libby_url: safeUrl(bookForm.libby_url) || null,
      library_url: safeUrl(bookForm.library_url) || null,
      is_current: true
    };

    const result = currentBook
      ? await supabase.from("books").update(payload).eq("id", currentBook.id)
      : await supabase.from("books").insert(payload);

    setSaving(false);
    if (result.error) {
      showToast(result.error.message, "error");
      return;
    }
    showToast("Current book saved.", "success");
    setModal("");
    await loadData();
  }

  async function saveNomination(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (!nominationEditing && !requireMember()) return;
    if (!nominationForm.title.trim() || !nominationForm.author.trim()) {
      showToast("Title and author are required.", "error");
      return;
    }

    setSaving(true);
    const payload = {
      title: nominationForm.title.trim(),
      author: nominationForm.author.trim(),
      year: toNumber(nominationForm.year),
      pages: toNumber(nominationForm.pages),
      genre: nominationForm.genre.trim() || null,
      description: nominationForm.description.trim() || null,
      library_wait: nominationForm.library_wait.trim() || null,
      has_audio: nominationForm.has_audio,
      has_paperback: nominationForm.has_paperback,
      has_adaptation: nominationForm.has_adaptation
    };
    const result = nominationEditing
      ? await supabase.from("nominations").update(payload).eq("id", nominationEditing.id)
      : await supabase.from("nominations").insert({
          ...payload,
          suggested_by_member_id: selectedMember!.id,
          suggested_by_name: selectedMember!.name
        });

    setSaving(false);
    if (result.error) {
      showToast(result.error.message, "error");
      return;
    }
    showToast(nominationEditing ? "Nomination updated." : "Book nominated.", "success");
    setNominationForm(emptyNominationForm);
    setNominationEditing(null);
    setModal("");
    await loadData();
  }

  async function deleteNomination(nomination: Nomination) {
    if (!supabase) return;
    if (!window.confirm(`Delete "${nomination.title}" from nominations? Its votes will be removed too.`)) return;
    setSaving(true);
    const { error } = await supabase.from("nominations").delete().eq("id", nomination.id);
    setSaving(false);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    if (nominationEditing?.id === nomination.id) {
      setNominationEditing(null);
      setModal("");
    }
    showToast("Nomination deleted.", "success");
    await loadData();
  }

  async function toggleVote(nomination: Nomination) {
    if (!supabase || !requireMember()) return;
    const existingVote = nomination.votes?.find((vote) => vote.member_id === selectedMember!.id);
    setSaving(true);
    const result = existingVote
      ? await supabase.from("votes").delete().eq("id", existingVote.id)
      : await supabase.from("votes").insert({
          nomination_id: nomination.id,
          member_id: selectedMember!.id
        });
    setSaving(false);

    if (result.error) {
      showToast(result.error.message, "error");
      return;
    }
    showToast(existingVote ? "Vote removed." : `Voted for "${nomination.title}".`, "success");
    await loadData();
  }

  async function saveQuote(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (!quoteEditing && !requireMember()) return;
    if (!quoteForm.quote_text.trim() || !quoteForm.book_title.trim()) {
      showToast("Quote and book title are required.", "error");
      return;
    }

    setSaving(true);
    const payload = {
      quote_text: quoteForm.quote_text.trim(),
      book_title: quoteForm.book_title.trim(),
      book_author: quoteForm.book_author.trim() || null
    };
    const result = quoteEditing
      ? await supabase.from("quotes").update(payload).eq("id", quoteEditing.id)
      : await supabase.from("quotes").insert({
          ...payload,
          submitted_by_member_id: selectedMember!.id,
          submitted_by_name: selectedMember!.name
        });
    setSaving(false);

    if (result.error) {
      showToast(result.error.message, "error");
      return;
    }
    showToast(quoteEditing ? "Quote updated." : "Quote added.", "success");
    setQuoteForm({ quote_text: "", book_title: "", book_author: "" });
    setQuoteEditing(null);
    setModal("");
    await loadData();
  }

  async function deleteQuote(quote: Quote) {
    if (!supabase) return;
    if (!window.confirm(`Delete this quote from "${quote.book_title}"?`)) return;
    setSaving(true);
    const { error } = await supabase.from("quotes").delete().eq("id", quote.id);
    setSaving(false);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    if (quoteEditing?.id === quote.id) {
      setQuoteEditing(null);
      setModal("");
    }
    showToast("Quote deleted.", "success");
    await loadData();
  }

  async function saveHistory(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (!historyForm.title.trim() || !historyForm.author.trim()) {
      showToast("Title and author are required.", "error");
      return;
    }

    setSaving(true);
    const payload = {
      title: historyForm.title.trim(),
      author: historyForm.author.trim(),
      suggested_by: historyForm.suggested_by.trim() || null,
      read_date: historyForm.read_date || null,
      rating: toNumber(historyForm.rating),
      group_note: historyForm.group_note.trim() || null
    };
    const result = historyEditing
      ? await supabase.from("reading_history").update(payload).eq("id", historyEditing.id)
      : await supabase.from("reading_history").insert(payload);
    setSaving(false);

    if (result.error) {
      showToast(result.error.message, "error");
      return;
    }
    showToast(historyEditing ? "History entry updated." : "History entry added.", "success");
    setHistoryForm(emptyHistoryForm);
    setHistoryEditing(null);
    setModal("");
    await loadData();
  }

  async function deleteHistoryEntry(entry: ReadingHistory) {
    if (!supabase) return;
    if (!window.confirm(`Delete "${entry.title}" from reading history?`)) return;
    setSaving(true);
    const { error } = await supabase.from("reading_history").delete().eq("id", entry.id);
    setSaving(false);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    if (historyEditing?.id === entry.id) {
      setHistoryEditing(null);
      setModal("");
    }
    showToast("History entry deleted.", "success");
    await loadData();
  }

  function openMemberModal(member?: Member) {
    setMemberEditing(member ?? null);
    setMemberForm({
      name: member?.name ?? "",
      current_reading: member?.current_reading ?? ""
    });
    setModal("member");
  }

  async function saveMember(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (!memberForm.name.trim()) {
      showToast("Name is required.", "error");
      return;
    }

    setSaving(true);
    const payload = {
      name: memberForm.name.trim(),
      current_reading: memberForm.current_reading.trim() || null
    };
    const result = memberEditing
      ? await supabase.from("members").update(payload).eq("id", memberEditing.id)
      : await supabase.from("members").insert(payload).select("id").single();
    setSaving(false);

    if (result.error) {
      showToast(result.error.message, "error");
      return;
    }
    if (!memberEditing && result.data && "id" in result.data) setSelectedMemberId(String(result.data.id));
    showToast(memberEditing ? "Member updated." : "Member added.", "success");
    setModal("");
    await loadData();
  }

  async function deleteMember() {
    if (!supabase || !memberEditing) return;
    if (!window.confirm(`Delete ${memberEditing.name}? Their votes will be removed too.`)) return;
    setSaving(true);
    const { error } = await supabase.from("members").delete().eq("id", memberEditing.id);
    setSaving(false);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    if (selectedMemberId === memberEditing.id) {
      setSelectedMemberId("");
      localStorage.removeItem("sbc_member_id");
    }
    showToast("Member deleted.", "success");
    setModal("");
    await loadData();
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="setup-screen">
        <section>
          <div className="brand-mark">Summit Book Club</div>
          <h1>Supabase is not configured yet.</h1>
          <p>
            Copy <code>.env.example</code> to <code>.env.local</code>, add your Supabase URL and anon key,
            then run the SQL migration in <code>supabase/migrations/001_initial_schema.sql</code>.
          </p>
        </section>
      </main>
    );
  }

  const pages = currentBook?.pages ?? 0;
  const progress = currentBook?.progress_percent ?? 0;
  const currentPage = pages ? Math.round((progress / 100) * pages) : 0;
  const remainingPages = pages ? Math.max(0, pages - currentPage) : 0;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="book-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" role="img">
              <path d="M3 13V6l5-4 5 4v7H3z" />
            </svg>
          </div>
          <div>
            <div className="brand-name">Summit Book Club</div>
            <div className="brand-sub">Est. 2026</div>
          </div>
        </div>
        <div className="stats">
          <div className="stat">
            <div>{members.length || "-"}</div>
            <span>Members</span>
          </div>
          <div className="stat">
            <div>{nominations.length || 0}</div>
            <span>Nominated</span>
          </div>
          <div className="stat highlight">
            <div>{selectedVoteCount}</div>
            <span>Your Votes</span>
          </div>
        </div>
        <label className="member-select">
          <span>Signed in as</span>
          <select value={selectedMemberId} onChange={(event) => setSelectedMemberId(event.target.value)}>
            <option value="">-- pick your name --</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
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
            <span>{number}</span>
            {label}
          </button>
        ))}
      </nav>

      <main className="page">
        {loading ? (
          <div className="loading">Loading book club data...</div>
        ) : (
          <>
            {tab === "current" && (
              <section>
                <button className="ghost-button" onClick={openBookModal}>
                  Edit current book
                </button>
                {currentBook ? (
                  <div className="current-layout">
                    <aside>
                      <div className="cover large" style={{ background: accent(currentBook.title) }}>
                        <span>{currentBook.author.split(" ").at(-1)}</span>
                        <strong>{currentBook.title}</strong>
                      </div>
                      <div className="link-stack">
                        {safeUrl(currentBook.goodreads_url) && (
                          <a href={safeUrl(currentBook.goodreads_url)} target="_blank" rel="noreferrer">
                            Goodreads page
                          </a>
                        )}
                        {safeUrl(currentBook.libby_url) && (
                          <a href={safeUrl(currentBook.libby_url)} target="_blank" rel="noreferrer">
                            Audiobook (Libby)
                          </a>
                        )}
                        {safeUrl(currentBook.library_url) && (
                          <a href={safeUrl(currentBook.library_url)} target="_blank" rel="noreferrer">
                            Public library hold
                          </a>
                        )}
                      </div>
                    </aside>
                    <div>
                      <div className="eyebrow">Now Reading &middot; Summit Book Club</div>
                      <h1>{currentBook.title}</h1>
                      <p className="subtitle">
                        by {currentBook.author}
                        {currentBook.year ? ` \u00b7 ${currentBook.year}` : ""}
                      </p>
                      <div className="tags">
                        {(currentBook.genre ?? "")
                          .split(",")
                          .map((genre) => genre.trim())
                          .filter(Boolean)
                          .map((genre) => (
                            <span key={genre}>{genre}</span>
                          ))}
                        {currentBook.pages ? <span>{currentBook.pages} pages</span> : null}
                        {currentBook.suggested_by ? <span>Suggested by {currentBook.suggested_by}</span> : null}
                      </div>
                      {currentBook.pages ? (
                        <div className="progress-card">
                          <div>
                            <span>Club Progress</span>
                            <strong>{progress}%</strong>
                          </div>
                          <div className="progress-track">
                            <div style={{ width: `${progress}%` }} />
                          </div>
                          <p>
                            p.{currentPage} &middot; avg of club <span>{remainingPages} to go</span>
                          </p>
                        </div>
                      ) : null}
                      <div className="info-grid">
                        {(currentBook.meeting_date || currentBook.meeting_location) && (
                          <article>
                            <span>Next Meeting</span>
                            <strong>
                              {dateLabel(currentBook.meeting_date, {
                                month: "long",
                                day: "numeric",
                                year: "numeric"
                              }) || currentBook.meeting_location}
                            </strong>
                            {currentBook.meeting_date && currentBook.meeting_location ? (
                              <p>{currentBook.meeting_location}</p>
                            ) : null}
                          </article>
                        )}
                        {currentBook.cocktail_name && (
                          <article className="warm">
                            <span>Drink/Recipe of the Month</span>
                            <strong>{currentBook.cocktail_name}</strong>
                            {currentBook.cocktail_recipe ? <p>{currentBook.cocktail_recipe}</p> : null}
                            {currentBook.cocktail_paired_by ? <small>Paired by {currentBook.cocktail_paired_by}</small> : null}
                          </article>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="empty">
                    <strong>No current book set yet.</strong>
                    <p>Edit the current book to give the club a starting point.</p>
                  </div>
                )}
              </section>
            )}

            {tab === "nominations" && (
              <section>
                <div className="section-head">
                  <div>
                    <h1>Up for vote</h1>
                    <p>One vote per person per book. Vote for as many as you&apos;d read.</p>
                  </div>
                  <div className="actions">
                    <div className="segmented">
                      {[
                        ["votes", "Most Votes"],
                        ["pages", "Shortest"],
                        ["new", "Newest"]
                      ].map(([id, label]) => (
                        <button key={id} className={sortMode === id ? "active" : ""} onClick={() => setSortMode(id as SortMode)}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <button className="primary-button" onClick={() => openNominationModal()}>
                      + Nominate a Book
                    </button>
                  </div>
                </div>
                {sortedNominations.length ? (
                  <div className="nomination-grid">
                    {sortedNominations.map((nomination, index) => {
                      const voted = nomination.votes?.some((vote) => vote.member_id === selectedMemberId);
                      return (
                        <article className="nomination-card" key={nomination.id}>
                          {sortMode === "votes" && index < 3 ? <div className="rank">#{index + 1}</div> : null}
                          <div className="vote-wrap">
                            <button
                              className={voted ? "vote voted" : "vote"}
                              onClick={() => toggleVote(nomination)}
                              aria-label={`${voted ? "Remove vote for" : "Vote for"} ${nomination.title}`}
                            >
                              &uarr;
                            </button>
                            <strong>{nomination.votes?.length ?? 0}</strong>
                            <span>votes</span>
                          </div>
                          <div className="cover small" style={{ background: accent(nomination.title) }}>
                            <strong>{nomination.title}</strong>
                            <span>{nomination.author.split(" ").at(-1)}</span>
                          </div>
                          <div>
                            <h2>{nomination.title}</h2>
                            <p className="muted">
                              {nomination.author}
                              {nomination.year ? ` \u00b7 ${nomination.year}` : ""}
                            </p>
                            {nomination.description ? <p>{nomination.description}</p> : null}
                            <div className="badges">
                              {nomination.pages ? <span>{nomination.pages}p</span> : null}
                              {nomination.has_audio ? <span className="availability audio">Audio</span> : null}
                              {nomination.has_paperback ? <span className="availability paperback">Paperback</span> : null}
                              {nomination.has_adaptation ? <span className="availability adaptation">Adaptation</span> : null}
                              {nomination.library_wait ? <span className="availability wait">{nomination.library_wait}</span> : null}
                            </div>
                            {nomination.suggested_by_name ? <small>Suggested by {nomination.suggested_by_name}</small> : null}
                            <div className="subtle-actions nomination-actions">
                              <button className="subtle-action" onClick={() => openNominationModal(nomination)}>
                                Edit
                              </button>
                              <button className="subtle-action danger" onClick={() => deleteNomination(nomination)}>
                                Delete
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty">
                    <strong>No nominations yet.</strong>
                    <p>Nominate the first book and start the vote.</p>
                  </div>
                )}
              </section>
            )}

            {tab === "quotes" && (
              <section>
                <div className="section-head">
                  <div>
                    <h1>The quote wall</h1>
                    <p>Lines that stopped you. From anything you&apos;re reading.</p>
                  </div>
                  <button className="primary-button" onClick={() => openQuoteModal()}>
                    + Add a Quote
                  </button>
                </div>
                {quotes.length ? (
                  <div className="quote-wall">
                    {quotes.map((quote) => (
                      <article key={quote.id}>
                        <div className="quote-mark">&quot;</div>
                        <p>{quote.quote_text}</p>
                        <hr />
                        <strong>{quote.book_title}</strong>
                        <small>
                          {quote.book_author ? `${quote.book_author} \u00b7 ` : ""}
                          {quote.submitted_by_name ? `Submitted by ${quote.submitted_by_name} \u00b7 ` : ""}
                          {dateLabel(quote.created_at.slice(0, 10), { month: "short", day: "numeric", year: "numeric" })}
                        </small>
                        <div className="subtle-actions quote-actions">
                          <button type="button" className="subtle-action" onClick={() => openQuoteModal(quote)}>
                            Edit
                          </button>
                          <button type="button" className="subtle-action danger" onClick={() => deleteQuote(quote)}>
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <strong>No quotes yet.</strong>
                    <p>Add the first line worth remembering.</p>
                  </div>
                )}
              </section>
            )}

            {tab === "history" && (
              <section>
                <div className="section-head">
                  <div>
                    <h1>What we&apos;ve read</h1>
                    <p>Every pick since we started. Ratings are the club average from post-meeting check-ins.</p>
                  </div>
                  <button className="primary-button" onClick={() => openHistoryModal()}>
                    + Add Entry
                  </button>
                </div>
                {history.length ? (
                  <div className="timeline">
                    {history.map((entry) => (
                      <article key={entry.id}>
                        <time>{dateLabel(entry.read_date, { month: "short", year: "numeric" }).toUpperCase()}</time>
                        <div>
                          <h2>{entry.title}</h2>
                          <p className="muted">
                            {entry.author}
                            {entry.suggested_by ? ` \u00b7 suggested by ${entry.suggested_by}` : ""}
                          </p>
                          {entry.group_note ? <p>{entry.group_note}</p> : null}
                          <div className="history-actions">
                            <button type="button" className="subtle-action" onClick={() => openHistoryModal(entry)}>
                              Edit
                            </button>
                            <button type="button" className="subtle-action danger" onClick={() => deleteHistoryEntry(entry)}>
                              Delete
                            </button>
                          </div>
                        </div>
                        {ratingLabel(entry.rating) ? <strong className="rating">{ratingLabel(entry.rating)} / 5</strong> : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <strong>No history yet.</strong>
                    <p>Add the club&apos;s completed books as you finish them.</p>
                  </div>
                )}
              </section>
            )}

            {tab === "members" && (
              <section>
                <div className="section-head">
                  <div>
                    <h1>The members</h1>
                    <p>Click your card to update what you&apos;re currently reading.</p>
                  </div>
                </div>
                <div className="member-grid">
                  {members.map((member) => (
                    <button key={member.id} className="member-card" onClick={() => openMemberModal(member)}>
                      <span style={{ background: accent(member.name) }}>{initials(member.name)}</span>
                      <strong>
                        {member.name}
                        {member.id === selectedMemberId ? " (you)" : ""}
                      </strong>
                      <small>{member.current_reading || "between books"}</small>
                    </button>
                  ))}
                  <button className="add-member-tile" onClick={() => openMemberModal()}>
                    + Add Member
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="footer">
        <div>Data syncs with Supabase</div>
        <p>&quot;A book is a dream that you hold in your hands.&quot; - one of us, probably</p>
      </footer>

      {modal === "book" && (
        <Modal title="Edit current book" subtitle="This is what everyone sees on the homepage." onClose={() => setModal("")} wide>
          <form onSubmit={saveBook}>
            <div className="form-grid two">
              <label>
                Title *
                <input value={bookForm.title} onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })} />
              </label>
              <label>
                Author *
                <input value={bookForm.author} onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })} />
              </label>
            </div>
            <div className="form-grid three">
              <label>
                Year
                <input type="number" value={bookForm.year} onChange={(e) => setBookForm({ ...bookForm, year: e.target.value })} />
              </label>
              <label>
                Pages
                <input type="number" value={bookForm.pages} onChange={(e) => setBookForm({ ...bookForm, pages: e.target.value })} />
              </label>
              <label>
                Progress %
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={bookForm.progress_percent}
                  onChange={(e) => setBookForm({ ...bookForm, progress_percent: e.target.value })}
                />
              </label>
            </div>
            <div className="form-grid two">
              <label>
                Genre
                <input value={bookForm.genre} onChange={(e) => setBookForm({ ...bookForm, genre: e.target.value })} />
              </label>
              <label>
                Suggested by
                <input value={bookForm.suggested_by} onChange={(e) => setBookForm({ ...bookForm, suggested_by: e.target.value })} />
              </label>
            </div>
            <div className="divider">Meeting Details</div>
            <div className="form-grid two">
              <label>
                Meeting date
                <input type="date" value={bookForm.meeting_date} onChange={(e) => setBookForm({ ...bookForm, meeting_date: e.target.value })} />
              </label>
              <label>
                Meeting location
                <input value={bookForm.meeting_location} onChange={(e) => setBookForm({ ...bookForm, meeting_location: e.target.value })} />
              </label>
            </div>
            <div className="divider">Drink/Recipe of the Month</div>
            <div className="form-grid two">
              <label>
                Drink/recipe name
                <input value={bookForm.cocktail_name} onChange={(e) => setBookForm({ ...bookForm, cocktail_name: e.target.value })} />
              </label>
              <label>
                Paired by
                <input value={bookForm.cocktail_paired_by} onChange={(e) => setBookForm({ ...bookForm, cocktail_paired_by: e.target.value })} />
              </label>
            </div>
            <label>
              Pairing Description
              <textarea value={bookForm.cocktail_recipe} onChange={(e) => setBookForm({ ...bookForm, cocktail_recipe: e.target.value })} />
            </label>
            <div className="divider">Links</div>
            <div className="form-grid three">
              <label>
                Goodreads URL
                <input value={bookForm.goodreads_url} onChange={(e) => setBookForm({ ...bookForm, goodreads_url: e.target.value })} />
              </label>
              <label>
                Libby URL
                <input value={bookForm.libby_url} onChange={(e) => setBookForm({ ...bookForm, libby_url: e.target.value })} />
              </label>
              <label>
                Library URL
                <input value={bookForm.library_url} onChange={(e) => setBookForm({ ...bookForm, library_url: e.target.value })} />
              </label>
            </div>
            <FormActions saving={saving} onCancel={() => setModal("")} />
          </form>
        </Modal>
      )}

      {modal === "nomination" && (
        <Modal
          title={nominationEditing ? "Edit nomination" : "Nominate a book"}
          subtitle="Fill in as much as you know. Availability helps the group decide."
          onClose={() => {
            setNominationEditing(null);
            setModal("");
          }}
        >
          <form onSubmit={saveNomination}>
            <label>
              Title *
              <input value={nominationForm.title} onChange={(e) => setNominationForm({ ...nominationForm, title: e.target.value })} />
            </label>
            <div className="form-grid two">
              <label>
                Author *
                <input value={nominationForm.author} onChange={(e) => setNominationForm({ ...nominationForm, author: e.target.value })} />
              </label>
              <label>
                Year
                <input type="number" value={nominationForm.year} onChange={(e) => setNominationForm({ ...nominationForm, year: e.target.value })} />
              </label>
            </div>
            <div className="form-grid two">
              <label>
                Pages
                <input type="number" value={nominationForm.pages} onChange={(e) => setNominationForm({ ...nominationForm, pages: e.target.value })} />
              </label>
              <label>
                Genre
                <input value={nominationForm.genre} onChange={(e) => setNominationForm({ ...nominationForm, genre: e.target.value })} />
              </label>
            </div>
            <label>
              One-line pitch
              <textarea value={nominationForm.description} onChange={(e) => setNominationForm({ ...nominationForm, description: e.target.value })} />
            </label>
            <label>
              Library wait time
              <input value={nominationForm.library_wait} onChange={(e) => setNominationForm({ ...nominationForm, library_wait: e.target.value })} />
            </label>
            <div className="checks">
              {[
                ["has_audio", "Audio"],
                ["has_paperback", "Paperback"],
                ["has_adaptation", "Film/TV adaptation"]
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={nominationForm[key as keyof typeof nominationForm] as boolean}
                    onChange={(e) => setNominationForm({ ...nominationForm, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <FormActions
              saving={saving}
              onCancel={() => {
                setNominationEditing(null);
                setModal("");
              }}
            />
          </form>
        </Modal>
      )}

      {modal === "quote" && (
        <Modal
          title={quoteEditing ? "Edit quote" : "Add a quote"}
          subtitle="From anything you're reading, not just the club pick."
          onClose={() => {
            setQuoteEditing(null);
            setModal("");
          }}
        >
          <form onSubmit={saveQuote}>
            <label>
              The quote *
              <textarea value={quoteForm.quote_text} onChange={(e) => setQuoteForm({ ...quoteForm, quote_text: e.target.value })} />
            </label>
            <label>
              Book title *
              <input value={quoteForm.book_title} onChange={(e) => setQuoteForm({ ...quoteForm, book_title: e.target.value })} />
            </label>
            <label>
              Author
              <input value={quoteForm.book_author} onChange={(e) => setQuoteForm({ ...quoteForm, book_author: e.target.value })} />
            </label>
            <FormActions
              saving={saving}
              onCancel={() => {
                setQuoteEditing(null);
                setModal("");
              }}
            />
          </form>
        </Modal>
      )}

      {modal === "history" && (
        <Modal
          title={historyEditing ? "Edit reading history" : "Add to reading history"}
          subtitle="Record a completed book for the club's log."
          onClose={() => {
            setHistoryEditing(null);
            setModal("");
          }}
        >
          <form onSubmit={saveHistory}>
            <label>
              Title *
              <input value={historyForm.title} onChange={(e) => setHistoryForm({ ...historyForm, title: e.target.value })} />
            </label>
            <div className="form-grid two">
              <label>
                Author *
                <input value={historyForm.author} onChange={(e) => setHistoryForm({ ...historyForm, author: e.target.value })} />
              </label>
              <label>
                Suggested by
                <input value={historyForm.suggested_by} onChange={(e) => setHistoryForm({ ...historyForm, suggested_by: e.target.value })} />
              </label>
            </div>
            <div className="form-grid two">
              <label>
                Date read
                <input type="date" value={historyForm.read_date} onChange={(e) => setHistoryForm({ ...historyForm, read_date: e.target.value })} />
              </label>
              <label>
                Rating
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={historyForm.rating}
                  onChange={(e) => setHistoryForm({ ...historyForm, rating: e.target.value })}
                />
              </label>
            </div>
            <label>
              Group note
              <textarea value={historyForm.group_note} onChange={(e) => setHistoryForm({ ...historyForm, group_note: e.target.value })} />
            </label>
            <FormActions
              saving={saving}
              onCancel={() => {
                setHistoryEditing(null);
                setModal("");
              }}
            />
          </form>
        </Modal>
      )}

      {modal === "member" && (
        <Modal
          title={memberEditing ? "Edit member" : "Add a member"}
          subtitle={memberEditing ? "Let the club know what you're working through." : "New to the club? Welcome."}
          onClose={() => setModal("")}
        >
          <form onSubmit={saveMember}>
            <label>
              Full name *
              <input value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} />
            </label>
            <label>
              Currently reading
              <input
                value={memberForm.current_reading}
                onChange={(e) => setMemberForm({ ...memberForm, current_reading: e.target.value })}
              />
            </label>
            <div className="form-actions spread">
              {memberEditing ? (
                <button type="button" className="danger-button" onClick={deleteMember}>
                  Delete
                </button>
              ) : (
                <span />
              )}
              <div>
                <button type="button" className="secondary-button" onClick={() => setModal("")}>
                  Cancel
                </button>
                <button className="primary-button" disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {saving && (
        <div className="saving">
          <div>Saving to Supabase...</div>
        </div>
      )}
      {toast && <div className={`toast ${toast.tone ?? ""}`}>{toast.message}</div>}
    </>
  );
}

function FormActions({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  return (
    <div className="form-actions">
      <button type="button" className="secondary-button" onClick={onCancel}>
        Cancel
      </button>
      <button className="primary-button" disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
