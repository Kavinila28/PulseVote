import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import {
  Activity, ArrowDownUp, ArrowRight, BarChart3, Bell, Check,
  CheckCircle2, ChevronDown, CircleHelp, Clock3, Copy, Filter,
  LayoutDashboard, LogOut, Menu, Moon, Plus, Search, Settings2,
  Share2, ShieldCheck, Sparkles, Sun, Trash2, Users, Vote,
  X, XCircle, Zap, RefreshCw, CalendarDays, LockKeyhole
} from "lucide-react";
import "./App.css";

const API = `${(import.meta.env.VITE_API_URL || "").replace(/\/$/, "")}/api`;
const tokenKey = "pulsevote_token";

const formatDate = (value) => {
  if (!value) return "No expiry";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No expiry"
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

const isExpired = (poll) =>
  Boolean(poll.expiresAt && new Date(poll.expiresAt).getTime() <= Date.now());

const localDateTimeValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
};

function App() {
  const [token, setToken] = useState(localStorage.getItem(tokenKey) || "");
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [authMode, setAuthMode] = useState("login");
  const [polls, setPolls] = useState([]);
  const [selectedPoll, setSelectedPoll] = useState(null);
  const [results, setResults] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [voted, setVoted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pollsLoading, setPollsLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [theme, setTheme] = useState(localStorage.getItem("pulsevote_theme") || "light");
  const [mobileNav, setMobileNav] = useState(false);
  const [dashboardView, setDashboardView] = useState("all");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sharePoll, setSharePoll] = useState(null);
  const [editingPoll, setEditingPoll] = useState(null);
  const [pollForm, setPollForm] = useState({ question: "", options: ["", ""], expiresAt: "" });
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });

  const showNotice = useCallback((type, text) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 3600);
  }, []);

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${token}`,
  }), [token]);

  const loadPolls = useCallback(async (quiet = false) => {
    if (!quiet) setPollsLoading(true);
    try {
      const response = await axios.get(`${API}/polls`);
      setPolls(response.data.polls || []);
    } catch {
      if (!quiet) showNotice("error", "Unable to load polls. Check that the backend is running.");
    } finally {
      if (!quiet) setPollsLoading(false);
    }
  }, [showNotice]);

  const loadResults = useCallback(async (poll) => {
    if (!poll?.id) return [];
    try {
      const response = await axios.get(`${API}/polls/${poll.id}/results`);
      const nextResults = response.data.results || [];
      setResults(nextResults);
      return nextResults;
    } catch {
      showNotice("error", "Unable to load poll results.");
      return [];
    }
  }, [showNotice]);

  const loadProfile = useCallback(async (activeToken) => {
    try {
      const response = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      setUser(response.data.user);
    } catch {
      localStorage.removeItem(tokenKey);
      setToken("");
      setUser(null);
    }
  }, []);

  const refreshDashboard = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([loadPolls(), loadProfile(token)]);
      showNotice("success", "Dashboard refreshed successfully.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("pulsevote_theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!token) return;
    loadProfile(token);
    loadPolls();
  }, [token, loadProfile, loadPolls]);

  useEffect(() => {
    if (!token || page !== "dashboard") return;
    const timer = window.setInterval(() => loadPolls(true), 12000);
    return () => window.clearInterval(timer);
  }, [token, page, loadPolls]);

  useEffect(() => {
  if (page !== "poll" || !selectedPoll?.id || !token) return;

  let stopped = false;
  let socket;
  let reconnectTimer;

  loadResults(selectedPoll);

  const connect = () => {
    if (stopped) return;

    const wsBase = API.startsWith("http")
  ? API
  : `${window.location.protocol}//${window.location.host}${API}`;

const wsUrl = wsBase.replace(/^http/, "ws");

const url = `${wsUrl}/polls/${selectedPoll.id}/live?token=${encodeURIComponent(token)}`;
    socket = new WebSocket(url);

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (
          message.type === "results_updated" &&
          message.pollId === selectedPoll.id
        ) {
          loadResults(selectedPoll);
        }
      } catch (error) {
        console.error("Invalid live update message:", error);
      }
    };

    socket.onclose = () => {
      if (!stopped) {
        reconnectTimer = window.setTimeout(connect, 2000);
      }
    };

    socket.onerror = () => {
      socket.close();
    };
  };

  connect();

  return () => {
    stopped = true;
    window.clearTimeout(reconnectTimer);

    if (socket) {
      socket.onclose = null;
      socket.close();
    }
  };
}, [page, selectedPoll, token, loadResults]);

  const handleAuth = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const endpoint = authMode === "login" ? "login" : "register";
      const payload = authMode === "login"
        ? { email: authForm.email, password: authForm.password }
        : authForm;
      const response = await axios.post(`${API}/auth/${endpoint}`, payload);
      localStorage.setItem(tokenKey, response.data.token);
      setToken(response.data.token);
      setUser(response.data.user);
      setPage("dashboard");
      showNotice("success", authMode === "login" ? "Welcome back!" : "Your account is ready!");
    } catch (error) {
      showNotice("error", error.response?.data?.message || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(tokenKey);
    setToken("");
    setUser(null);
    setPolls([]);
    setSelectedPoll(null);
    setResults([]);
    setPage("dashboard");
    showNotice("success", "You have been signed out.");
  };

  const resetPollForm = () => {
    setEditingPoll(null);
    setPollForm({ question: "", options: ["", ""], expiresAt: "" });
  };

  const openCreate = () => {
    resetPollForm();
    setPage("create");
    setMobileNav(false);
  };

  const openPoll = async (poll) => {
    setSelectedPoll(poll);
    setSelectedOption(null);
    setVoted(false);
    setResults([]);
    setPage("poll");
    setMobileNav(false);
    await loadResults(poll);
  };

  const submitPoll = async (event) => {
    event.preventDefault();
    const options = pollForm.options.map((item) => item.trim()).filter(Boolean);
    if (options.length < 2) {
      showNotice("error", "Please add at least two answer options.");
      return;
    }
    if (new Set(options.map((item) => item.toLowerCase())).size !== options.length) {
      showNotice("error", "Answer options must be unique.");
      return;
    }

    setLoading(true);
    const payload = {
      question: pollForm.question.trim(),
      options,
      expiresAt: pollForm.expiresAt ? new Date(pollForm.expiresAt).toISOString() : null,
    };
    try {
      if (editingPoll) {
        await axios.put(`${API}/polls/${editingPoll.id}`, payload, { headers: authHeaders() });
        showNotice("success", "Poll updated successfully.");
      } else {
        await axios.post(`${API}/polls`, payload, { headers: authHeaders() });
        showNotice("success", "Your poll is now published!");
      }
      resetPollForm();
      setPage("dashboard");
      await loadPolls();
    } catch (error) {
      showNotice("error", error.response?.data?.message || "Could not save this poll.");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = async (poll) => {
    const currentResults = await loadResults(poll);
    const voteCount = currentResults.reduce((sum, item) => sum + Number(item.votes || 0), 0);
    setEditingPoll({ ...poll, hasVotes: voteCount > 0 });
    setPollForm({
      question: poll.question,
      options: [...poll.options],
      expiresAt: localDateTimeValue(poll.expiresAt),
    });
    setPage("create");
  };

  const castVote = async () => {
    if (!token || !selectedPoll || selectedOption === null) {
      showNotice("error", "Select an option before submitting your vote.");
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/polls/${selectedPoll.id}/vote`, { optionIndex: selectedOption }, { headers: authHeaders() });
      setVoted(true);
      showNotice("success", "Your vote has been recorded!");
      await loadResults(selectedPoll);
      await loadPolls(true);
    } catch (error) {
      showNotice("error", error.response?.data?.message || "Unable to submit your vote.");
    } finally {
      setLoading(false);
    }
  };

  const closePoll = async (poll) => {
    if (!window.confirm("Close this poll? People will no longer be able to vote.")) return;
    try {
      await axios.post(`${API}/polls/${poll.id}/close`, {}, { headers: authHeaders() });
      showNotice("success", "Poll closed successfully.");
      await loadPolls();
      if (selectedPoll?.id === poll.id) setSelectedPoll({ ...poll, isActive: false });
    } catch (error) {
      showNotice("error", error.response?.data?.message || "Unable to close poll.");
    }
  };

  const deletePoll = async (poll) => {
    if (!window.confirm("Delete this poll permanently?")) return;
    try {
      await axios.delete(`${API}/polls/${poll.id}`, { headers: authHeaders() });
      showNotice("success", "Poll deleted.");
      if (selectedPoll?.id === poll.id) {
        setSelectedPoll(null);
        setPage("dashboard");
      }
      await loadPolls();
    } catch (error) {
      showNotice("error", error.response?.data?.message || "Unable to delete this poll. Polls with votes may be protected.");
    }
  };

  const addOption = () => {
    if (pollForm.options.length < 10) setPollForm((current) => ({ ...current, options: [...current.options, ""] }));
  };

  const updateOption = (index, value) => {
    setPollForm((current) => ({
      ...current,
      options: current.options.map((option, i) => i === index ? value : option),
    }));
  };

  const totalVotes = results.reduce((sum, item) => sum + Number(item.votes || 0), 0);
  const activePolls = polls.filter((poll) => poll.isActive && !isExpired(poll));
  const myPolls = polls.filter((poll) => poll.creatorId === user?.id);
  const filteredPolls = useMemo(() => {
    let items = polls.filter((poll) => {
      const matchesSearch = poll.question.toLowerCase().includes(query.toLowerCase())
        || poll.options.some((option) => option.toLowerCase().includes(query.toLowerCase()));
      const expired = isExpired(poll);
      const status = !poll.isActive ? "closed" : expired ? "expired" : "active";
      const matchesView = dashboardView === "all"
        || (dashboardView === "active" && status === "active")
        || (dashboardView === "mine" && poll.creatorId === user?.id);
      return matchesSearch && matchesView && (statusFilter === "all" || status === statusFilter);
    });
    if (sortBy === "oldest") items = [...items].reverse();
    if (sortBy === "question") items = [...items].sort((a, b) => a.question.localeCompare(b.question));
    return items;
  }, [polls, query, statusFilter, sortBy, dashboardView, user?.id]);

  const shareUrl = sharePoll
    ? `${window.location.origin}${window.location.pathname}?poll=${sharePoll.id}`
    : "";

  if (!token || !user) {
    return (
      <div className="auth-layout">
        <motion.aside className="auth-showcase" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }}>
          <div className="auth-brand"><span className="brand-mark"><Activity size={23} /></span><span>Pulse<span>Vote</span></span></div>
          <div className="showcase-copy">
            <span className="eyebrow"><Sparkles size={14} /> DECISIONS, TOGETHER</span>
            <h1>Every voice<br /><em>moves us forward.</em></h1>
            <p>Create meaningful polls, collect real opinions and understand your community with beautiful live insights.</p>
            <div className="showcase-proof"><span><Zap size={16} /> Live insights</span><span><ShieldCheck size={16} /> Secure voting</span></div>
          </div>
          <div className="showcase-orbit orbit-a" /><div className="showcase-orbit orbit-b" />
          <div className="showcase-bottom">A clearer way to make group decisions.</div>
        </motion.aside>
        <main className="auth-main">
          <motion.form className="auth-card" onSubmit={handleAuth} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
            <div className="auth-mobile-brand"><span className="brand-mark"><Activity size={21} /></span><b>Pulse<span>Vote</span></b></div>
            <span className="eyebrow">WELCOME TO PULSEVOTE</span>
            <h2>{authMode === "login" ? "Welcome back" : "Create your account"}</h2>
            <p className="auth-subtitle">{authMode === "login" ? "Sign in to continue to your workspace." : "Create an account and make your voice heard."}</p>
            {authMode === "register" && <label className="form-field"><span>Full name</span><input required minLength="2" maxLength="60" autoComplete="name" placeholder="Your name" value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} /></label>}
            <label className="form-field"><span>Email address</span><input required type="email" autoComplete="email" placeholder="you@example.com" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} /></label>
            <label className="form-field"><span>Password</span><input required type="password" minLength="8" autoComplete={authMode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} /></label>
            <button className="button button-primary button-wide" disabled={loading}>{loading ? <span className="spinner" /> : authMode === "login" ? "Sign in" : "Create account"} <ArrowRight size={17} /></button>
            <p className="auth-switch">{authMode === "login" ? "New to PulseVote?" : "Already have an account?"}<button type="button" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "Create an account" : "Sign in"}</button></p>
          </motion.form>
        </main>
        {notice && <div className={`toast toast-${notice.type}`}><span>{notice.type === "success" ? <CheckCircle2 size={17} /> : <XCircle size={17} />}</span>{notice.text}</div>}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AnimatePresence>
        {mobileNav && <motion.button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />}
      </AnimatePresence>
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand"><span className="brand-mark"><Activity size={22} /></span><span>Pulse<span>Vote</span></span></div>
        <div className="workspace-selector">
          <button className="workspace-chip" onClick={() => setWorkspaceOpen((open) => !open)} aria-expanded={workspaceOpen}>
            <span className="workspace-dot" /> PERSONAL WORKSPACE <ChevronDown size={13} />
          </button>
          {workspaceOpen && <div className="workspace-dropdown">
            <div className="workspace-dropdown-title">Your workspace</div>
            <div className="workspace-option"><span className="workspace-dot" /><span><b>Personal Workspace</b><small>Current workspace</small></span><Check size={16} /></div>
            <div className="workspace-dropdown-footer">Your personal polling space</div>
          </div>}
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <button className={`side-link ${page === "dashboard" && dashboardView === "all" ? "side-link-active" : ""}`} onClick={() => { setDashboardView("all"); setStatusFilter("all"); setPage("dashboard"); setMobileNav(false); }}><LayoutDashboard size={18} /> Overview</button>
        <button className={`side-link ${page === "create" ? "side-link-active" : ""}`} onClick={openCreate}><Plus size={18} /> Create a poll</button>
        <button className={`side-link ${page === "dashboard" && dashboardView === "active" ? "side-link-active" : ""}`} onClick={() => { setDashboardView("active"); setStatusFilter("all"); setPage("dashboard"); setMobileNav(false); }}><RadioIcon /> Active polls <span className="side-count">{activePolls.length}</span></button>
        <button className={`side-link ${page === "dashboard" && dashboardView === "mine" ? "side-link-active" : ""}`} onClick={() => { setDashboardView("mine"); setStatusFilter("all"); setPage("dashboard"); setMobileNav(false); }}><Users size={18} /> Created by me <span className="side-count">{myPolls.length}</span></button>
        <div className="sidebar-spacer" />
        <div className="sidebar-tip"><div className="tip-icon"><Sparkles size={17} /></div><b>Make better decisions</b><p>Share a poll and bring everyone's perspective together.</p><button onClick={openCreate}>Create a poll <ArrowRight size={14} /></button></div>
        <div className="sidebar-account">
          <div className="user-avatar">{(user.name || "U").slice(0, 1).toUpperCase()}</div>
          <div className="account-copy"><b>{user.name}</b><span>{user.email}</span></div>
          <button className="icon-quiet" title="Sign out" onClick={logout}><LogOut size={17} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-quiet" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div className="breadcrumb"><span>Workspace</span><span>/</span><b>{page === "create" ? (editingPoll ? "Edit poll" : "Create poll") : page === "poll" ? "Poll details" : "Overview"}</b></div>
          <div className="topbar-actions">
            <button className="icon-button" title="Toggle light/dark theme" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>
            <button className={`icon-button ${refreshing ? "is-refreshing" : ""}`} title="Refresh dashboard" onClick={refreshDashboard} disabled={refreshing}><RefreshCw size={18} /></button>
            <div className="profile-menu-wrapper">
              <button className="top-avatar profile-avatar-button" title="Account menu" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>{(user.name || "U").slice(0, 1).toUpperCase()}</button>
              {profileOpen && <div className="profile-dropdown">
                <div className="profile-dropdown-header"><div className="user-avatar">{(user.name || "U").slice(0, 1).toUpperCase()}</div><div><b>{user.name}</b><span>{user.email}</span></div></div>
                <div className="profile-dropdown-divider" />
                <div className="profile-account-label"><ShieldCheck size={15} /> Signed in account</div>
                <button className="profile-dropdown-item profile-logout" onClick={() => { setProfileOpen(false); logout(); }}><LogOut size={16} /> Sign out</button>
              </div>}
            </div>
          </div>
        </header>

        <div className="page-content">
          <AnimatePresence mode="wait">
            {page === "dashboard" && (
              <motion.div key="dashboard" className="page-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .22 }}>
                <section className="hero-panel">
                  <div className="hero-glow" />
                  <div className="hero-content"><span className="eyebrow hero-eyebrow"><Sparkles size={14} /> YOUR COMMUNITY, IN SYNC</span><h1>Good things happen<br />when voices <em>connect.</em></h1><p>Bring people together, ask better questions and turn opinions into insight.</p><button className="button button-white" onClick={openCreate}><Plus size={17} /> Create your first poll</button></div>
                  <div className="hero-art" aria-hidden="true"><div className="hero-ring ring-one" /><div className="hero-ring ring-two" /><div className="hero-center"><Activity size={34} /></div><div className="float-chip chip-one"><Vote size={15} /> Your voice</div><div className="float-chip chip-two"><CheckCircle2 size={15} /> Counted</div><div className="float-chip chip-three"><BarChart3 size={15} /> Live insights</div></div>
                </section>

                <section className="metric-grid">
                  <MetricCard icon={<Vote size={19} />} label="All polls" value={polls.length} tone="violet" detail="Across your workspace" />
                  <MetricCard icon={<RadioIcon />} label="Active polls" value={activePolls.length} tone="mint" detail="Open for participation" />
                  <MetricCard icon={<Users size={19} />} label="Created by you" value={myPolls.length} tone="blue" detail="Your conversations" />
                  <MetricCard icon={<BarChart3 size={19} />} label="Votes received" value={null} tone="amber" detail="Open a poll to view live totals" />
                </section>

                <section className="section-toolbar">
                  <div><span className="eyebrow">{dashboardView === "mine" ? "YOUR ACTIVITY" : dashboardView === "active" ? "OPEN FOR VOTING" : "DISCOVER"}</span><h2>{dashboardView === "mine" ? "Polls created by me" : dashboardView === "active" ? "Active polls" : "Explore polls"}</h2><p>{dashboardView === "mine" ? "Manage and follow the polls you created." : dashboardView === "active" ? "Join conversations that are still accepting votes." : "Find a conversation worth joining."}</p></div>
                  <button className="button button-primary" onClick={openCreate}><Plus size={17} /> New poll</button>
                </section>

                <section className="filter-panel">
                  <div className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions or answer options..." /><kbd>⌘ K</kbd></div>
                  <div className="filter-controls"><label className="select-wrap"><Filter size={15} /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="closed">Closed</option><option value="expired">Expired</option></select><ChevronDown size={14} /></label><label className="select-wrap"><ArrowDownUp size={15} /><select value={sortBy} onChange={(e) => setSortBy(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="question">Question A–Z</option></select><ChevronDown size={14} /></label></div>
                </section>

                <div className="results-heading"><span><b>{filteredPolls.length}</b> {filteredPolls.length === 1 ? "poll" : "polls"} found</span><span className="subtle-label">Updated automatically</span></div>
                {pollsLoading && polls.length === 0 ? <div className="poll-grid">{[1, 2, 3].map((n) => <div className="skeleton-card" key={n}><div /><div /><div /></div>)}</div> : filteredPolls.length === 0 ? (
                  <div className="empty-panel"><div className="empty-illustration"><Search size={26} /></div><h3>{polls.length ? "No matching polls" : "Your first poll starts here"}</h3><p>{polls.length ? "Try another search or clear your filters." : "Create a question, invite people and watch opinions come together."}</p><button className="button button-primary" onClick={polls.length ? () => { setQuery(""); setStatusFilter("all"); setDashboardView("all"); } : openCreate}>{polls.length ? "Clear filters" : <><Plus size={17} /> Create a poll</>}</button></div>
                ) : (
                  <div className="poll-grid">
                    {filteredPolls.map((poll, index) => <PollCard key={poll.id} poll={poll} isOwner={poll.creatorId === user.id} index={index} onOpen={openPoll} onEdit={startEdit} onClose={closePoll} onDelete={deletePoll} onShare={setSharePoll} />)}
                  </div>
                )}
              </motion.div>
            )}

            {page === "create" && (
              <motion.div key="create" className="form-page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <div className="form-intro"><span className="eyebrow">{editingPoll ? "REFINE YOUR QUESTION" : "START A CONVERSATION"}</span><h1>{editingPoll ? "Edit your poll" : "Create something worth asking."}</h1><p>A thoughtful question is the beginning of a great conversation.</p></div>
                <form className="builder-card" onSubmit={submitPoll}>
                  <div className="builder-section-title"><span className="builder-icon"><CircleHelp size={19} /></span><div><b>Your question</b><small>Keep it clear, focused and easy to answer.</small></div></div>
                  <label className="form-field"><span>Poll question</span><textarea required minLength="5" maxLength="200" rows="3" placeholder="e.g. Which feature should we build next?" value={pollForm.question} onChange={(e) => setPollForm({ ...pollForm, question: e.target.value })} /><small className="field-hint">{pollForm.question.length}/200 characters</small></label>
                  <div className="builder-divider" />
                  <div className="builder-section-title"><span className="builder-icon"><ListIcon /></span><div><b>Answer options</b><small>{editingPoll?.hasVotes ? "Options are locked because this poll already has votes." : "Add between 2 and 10 unique choices."}</small></div><span className="option-count">{pollForm.options.length}/10</span></div>
                  {editingPoll?.hasVotes && <div className="locked-notice"><LockKeyhole size={16} /> Existing votes are preserved. Answer options cannot be changed after voting begins.</div>}
                  {pollForm.options.map((option, index) => <div className="option-editor" key={index}><span className="option-index">{String(index + 1).padStart(2, "0")}</span><input required maxLength="100" disabled={Boolean(editingPoll?.hasVotes)} placeholder={`Choice ${index + 1}`} value={option} onChange={(e) => updateOption(index, e.target.value)} />{!editingPoll?.hasVotes && pollForm.options.length > 2 && <button type="button" className="icon-quiet danger-hover" onClick={() => setPollForm({ ...pollForm, options: pollForm.options.filter((_, i) => i !== index) })}><X size={17} /></button>}</div>)}
                  {!editingPoll?.hasVotes && <button type="button" className="add-choice" onClick={addOption} disabled={pollForm.options.length >= 10}><Plus size={16} /> Add another choice</button>}
                  <div className="builder-divider" />
                  <div className="builder-section-title"><span className="builder-icon"><CalendarDays size={19} /></span><div><b>Poll duration</b><small>Choose when voting should automatically close.</small></div></div>
                  <label className="form-field"><span>Expiry date and time <em>Optional</em></span><input type="datetime-local" min={localDateTimeValue(new Date(Date.now() + 60000))} value={pollForm.expiresAt} onChange={(e) => setPollForm({ ...pollForm, expiresAt: e.target.value })} /><small className="field-hint">Leave empty if the poll should remain open until manually closed.</small></label>
                  <div className="builder-actions"><button type="button" className="button button-soft" onClick={() => { resetPollForm(); setPage("dashboard"); }}>Cancel</button><button className="button button-primary" disabled={loading}>{loading ? "Saving..." : editingPoll ? "Save changes" : "Publish poll"} <ArrowRight size={17} /></button></div>
                </form>
              </motion.div>
            )}

            {page === "poll" && selectedPoll && (
              <motion.div key="poll" className="poll-detail-page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <button className="back-link" onClick={() => setPage("dashboard")}>← Back to all polls</button>
                <div className="detail-hero"><div><span className={`status-tag ${selectedPoll.isActive && !isExpired(selectedPoll) ? "tag-active" : "tag-closed"}`}><span />{selectedPoll.isActive && !isExpired(selectedPoll) ? "Voting is open" : isExpired(selectedPoll) ? "Poll expired" : "Poll closed"}</span><h1>{selectedPoll.question}</h1><p>Choose your answer and see how the community is voting.</p><div className="detail-meta"><span><CalendarDays size={15} /> Created {formatDate(selectedPoll.createdAt)}</span><span><Clock3 size={15} /> {selectedPoll.expiresAt ? `Ends ${formatDate(selectedPoll.expiresAt)}` : "No end date"}</span></div></div><button className="button button-soft" onClick={() => setSharePoll(selectedPoll)}><Share2 size={16} /> Share poll</button></div>
                <div className="detail-columns">
                  <section className="surface-card vote-card"><div className="card-heading"><div><span className="eyebrow">YOUR CHOICE</span><h2>Cast your vote</h2></div><span className="choice-count">{selectedPoll.options.length} choices</span></div>
                    {selectedPoll.options.map((option, index) => <motion.button whileHover={{ y: -2 }} whileTap={{ scale: .99 }} key={index} className={`vote-choice ${selectedOption === index ? "choice-selected" : ""}`} disabled={voted || !selectedPoll.isActive || isExpired(selectedPoll)} onClick={() => setSelectedOption(index)}><span className="choice-radio">{selectedOption === index && <span />}</span><span>{option}</span>{selectedOption === index && <CheckCircle2 size={18} />}</motion.button>)}
                    {!voted && selectedPoll.isActive && !isExpired(selectedPoll) ? <button className="button button-primary button-wide vote-action" disabled={selectedOption === null || loading} onClick={castVote}>{loading ? "Submitting..." : "Submit my vote"} <ArrowRight size={17} /></button> : <div className="locked-notice"><CheckCircle2 size={17} /> {voted ? "Thanks! Your vote has been recorded." : "Voting is not available for this poll."}</div>}
                    <p className="privacy-note"><ShieldCheck size={14} /> One vote per signed-in account. Your vote is protected.</p>
                  </section>
                  <section className="surface-card live-card"><div className="card-heading"><div><span className="eyebrow">COMMUNITY PULSE</span><h2>Live results</h2></div><span className="live-indicator"><i /> LIVE</span></div><div className="vote-total"><strong>{totalVotes.toLocaleString()}</strong><span>Total votes</span></div>
                    <div className="live-results">{selectedPoll.options.map((option, index) => { const result = results.find((item) => item.option === option); const votes = Number(result?.votes || 0); const percent = totalVotes ? Math.round(votes / totalVotes * 100) : 0; return <div className="live-result-row" key={option}><div className="live-result-label"><span>{option}</span><b>{percent}% <small>({votes})</small></b></div><div className="progress-rail"><motion.div className="progress-value" initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: .65, ease: "easeOut" }} /></div></div>; })}</div><p className="refresh-caption"><RefreshCw size={13} /> Results update live as votes arrive</p></section>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <footer className="app-footer"><span>© {new Date().getFullYear()} PulseVote</span><span>Thoughtful questions. Clearer decisions.</span><span><ShieldCheck size={13} /> Secure workspace</span></footer>
      </main>

      <AnimatePresence>
        {sharePoll && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) setSharePoll(null); }}><motion.div className="share-modal" initial={{ opacity: 0, y: 18, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .98 }}><button className="modal-close icon-quiet" onClick={() => setSharePoll(null)}><X size={19} /></button><span className="eyebrow">SPREAD THE WORD</span><h2>Share this poll</h2><p>Invite people to take part in this conversation.</p><div className="qr-wrap"><QRCodeSVG value={shareUrl} size={176} level="M" includeMargin /></div><div className="share-url">{shareUrl}<button className="icon-quiet" title="Copy link" onClick={() => { navigator.clipboard.writeText(shareUrl); showNotice("success", "Poll link copied."); }}><Copy size={16} /></button></div><button className="button button-primary button-wide" onClick={() => { navigator.clipboard.writeText(shareUrl); showNotice("success", "Poll link copied."); }}><Copy size={16} /> Copy poll link</button><small className="share-note">QR code and link identify this poll. The recipient must sign in to vote.</small></motion.div></motion.div>}
      </AnimatePresence>

      {notice && <div className={`toast toast-${notice.type}`}><span>{notice.type === "success" ? <CheckCircle2 size={17} /> : <XCircle size={17} />}</span>{notice.text}</div>}
    </div>
  );
}

function RadioIcon() {
  return <span className="radio-icon"><span /></span>;
}

function ListIcon() {
  return <span className="list-icon"><i /><i /><i /></span>;
}

function MetricCard({ icon, label, value, tone, detail }) {
  return <motion.article className="metric-card" whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 280, damping: 22 }}><span className={`metric-icon metric-${tone}`}>{icon}</span><div className="metric-copy"><span>{label}</span><strong>{value === null ? "—" : <CountUp value={value} />}</strong><small>{detail}</small></div><span className="metric-spark"><Activity size={27} /></span></motion.article>;
}

function CountUp({ value }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let frame;
    const start = performance.now();
    const duration = 650;
    const animate = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return display.toLocaleString();
}

function PollCard({ poll, isOwner, index, onOpen, onEdit, onClose, onDelete, onShare }) {
  const expired = isExpired(poll);
  const active = poll.isActive && !expired;
  return <motion.article className="poll-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * .045, .25), duration: .3 }} whileHover={{ y: -5 }} layout>
    <div className="poll-card-top"><span className={`status-tag ${active ? "tag-active" : "tag-closed"}`}><span />{active ? "Active" : expired ? "Expired" : "Closed"}</span><span className="poll-date">{new Date(poll.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span></div>
    <h3>{poll.question}</h3><p className="poll-choice-count">{poll.options.length} answer choices</p>
    <div className="poll-card-bottom"><span><BarChart3 size={15} /> Results available</span><button className="card-open" onClick={() => onOpen(poll)}>Open poll <ArrowRight size={15} /></button></div>
    {isOwner && <div className="poll-owner-actions"><button onClick={() => onEdit(poll)}><Settings2 size={14} /> Edit</button>{active && <button onClick={() => onClose(poll)}><XCircle size={14} /> Close</button>}<button onClick={() => onShare(poll)}><Share2 size={14} /> Share</button><button className="owner-delete" onClick={() => onDelete(poll)}><Trash2 size={14} /> Delete</button></div>}
  </motion.article>;
}

export default App;
