
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  Activity,
  Plus,
  LogOut,
  Vote,
  BarChart3,
  Users,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Pencil,
  Clock,
  Trash2,
  Radio,
  LockKeyhole,
} from "lucide-react";
import "./App.css";

const API = "/api";

function App() {
  const [token, setToken] = useState(
    localStorage.getItem("pulsevote_token") || ""
  );
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [authMode, setAuthMode] = useState("login");

  const [polls, setPolls] = useState([]);
  const [selectedPoll, setSelectedPoll] = useState(null);
  const [results, setResults] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [voted, setVoted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState({ type: "", text: "" });
  const [editingPollId, setEditingPollId] = useState(null);

  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [pollForm, setPollForm] = useState({
    question: "",
    options: ["", ""],
    expiresAt: "",
  });

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
  });

  const showNotice = (type, text) => {
    setNotice({ type, text });
    window.setTimeout(() => {
      setNotice({ type: "", text: "" });
    }, 3500);
  };

  const resetPollForm = () => {
    setPollForm({
      question: "",
      options: ["", ""],
      expiresAt: "",
    });
    setEditingPollId(null);
  };

  const loadPolls = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/polls`);
      setPolls(response.data.polls || []);
    } catch (error) {
      showNotice(
        "error",
        error.response?.data?.message ||
          "Unable to load polls. Check the backend."
      );
    }
  }, []);

  const loadResults = useCallback(async (poll) => {
    if (!poll?.id) return;

    try {
      const response = await axios.get(
        `${API}/polls/${poll.id}/results`
      );
      setResults(response.data.results || []);
    } catch {
      showNotice("error", "Unable to load poll results.");
    }
  }, []);

  const loadProfile = useCallback(async (activeToken) => {
    try {
      const response = await axios.get(`${API}/auth/me`, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });

      setUser(response.data.user);
    } catch {
      localStorage.removeItem("pulsevote_token");
      setToken("");
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    loadProfile(token);
    loadPolls();
  }, [token, loadProfile, loadPolls]);

  useEffect(() => {
    if (page === "dashboard" && token) {
      loadPolls();
    }
  }, [page, token, loadPolls]);

  useEffect(() => {
    if (page !== "poll" || !selectedPoll) return;

    loadResults(selectedPoll);

    const timer = window.setInterval(() => {
      loadResults(selectedPoll);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [page, selectedPoll, loadResults]);

  const handleAuth = async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      const endpoint =
        authMode === "login" ? "login" : "register";

      const payload =
        authMode === "login"
          ? {
              email: authForm.email.trim(),
              password: authForm.password,
            }
          : {
              name: authForm.name.trim(),
              email: authForm.email.trim(),
              password: authForm.password,
            };

      const response = await axios.post(
        `${API}/auth/${endpoint}`,
        payload
      );

      const newToken = response.data.token;

      localStorage.setItem("pulsevote_token", newToken);
      setToken(newToken);
      setUser(response.data.user);
      setPage("dashboard");

      setAuthForm({
        name: "",
        email: "",
        password: "",
      });

      showNotice(
        "success",
        authMode === "login"
          ? "Welcome back!"
          : "Account created successfully!"
      );
    } catch (error) {
      showNotice(
        "error",
        error.response?.data?.message ||
          "Authentication failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("pulsevote_token");
    setToken("");
    setUser(null);
    setSelectedPoll(null);
    setResults([]);
    setPage("dashboard");
    resetPollForm();

    showNotice("success", "You have been logged out.");
  };

  const openPoll = async (poll) => {
    setSelectedPoll(poll);
    setSelectedOption(null);
    setVoted(false);
    setResults([]);
    setPage("poll");

    await loadResults(poll);
  };

  const createPoll = async (event) => {
    event.preventDefault();

    if (!token) {
      showNotice("error", "Please log in before creating a poll.");
      return;
    }

    const question = pollForm.question.trim();
    const options = pollForm.options
      .map((item) => item.trim())
      .filter(Boolean);

    if (question.length < 5) {
      showNotice("error", "Question must contain at least 5 characters.");
      return;
    }

    if (options.length < 2) {
      showNotice("error", "Please enter at least two options.");
      return;
    }

    if (options.length > 10) {
      showNotice("error", "You can add a maximum of 10 options.");
      return;
    }

    const normalizedOptions = options.map((option) =>
      option.toLowerCase()
    );

    if (new Set(normalizedOptions).size !== options.length) {
      showNotice("error", "Duplicate options are not allowed.");
      return;
    }

    let expiresAt = null;

    if (pollForm.expiresAt) {
      const expiryDate = new Date(pollForm.expiresAt);

      if (
        Number.isNaN(expiryDate.getTime()) ||
        expiryDate.getTime() <= Date.now()
      ) {
        showNotice("error", "Expiry date must be in the future.");
        return;
      }

      expiresAt = expiryDate.toISOString();
    }

    const payload = {
      question,
      options,
      expiresAt,
    };

    setLoading(true);

    try {
      if (editingPollId) {
        await axios.put(
          `${API}/polls/${editingPollId}`,
          payload,
          { headers: authHeaders() }
        );

        showNotice("success", "Poll updated successfully!");
      } else {
        await axios.post(
          `${API}/polls`,
          payload,
          { headers: authHeaders() }
        );

        showNotice("success", "Your poll has been published!");
      }

      resetPollForm();
      setPage("dashboard");
      await loadPolls();
    } catch (error) {
      showNotice(
        "error",
        error.response?.data?.message ||
          (editingPollId
            ? "Could not update poll."
            : "Could not create poll.")
      );
    } finally {
      setLoading(false);
    }
  };

  const editPoll = (poll) => {
    if (!poll.isActive) {
      showNotice("error", "Closed polls cannot be edited.");
      return;
    }

    const localExpiry = poll.expiresAt
      ? (() => {
          const date = new Date(poll.expiresAt);
          const localDate = new Date(
            date.getTime() - date.getTimezoneOffset() * 60000
          );
          return localDate.toISOString().slice(0, 16);
        })()
      : "";

    setEditingPollId(poll.id);

    setPollForm({
      question: poll.question,
      options: [...poll.options],
      expiresAt: localExpiry,
    });

    setPage("create");
  };

  const closePoll = async (poll) => {
    const confirmed = window.confirm(
      "Are you sure you want to close this poll? Voting will no longer be allowed."
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      await axios.post(
        `${API}/polls/${poll.id}/close`,
        {},
        { headers: authHeaders() }
      );

      showNotice("success", "Poll closed successfully!");

      if (selectedPoll?.id === poll.id) {
        setSelectedPoll({ ...poll, isActive: false });
      }

      await loadPolls();
    } catch (error) {
      showNotice(
        "error",
        error.response?.data?.message || "Unable to close poll."
      );
    } finally {
      setLoading(false);
    }
  };

  const deletePoll = async (poll) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this poll? This action cannot be undone."
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      await axios.delete(`${API}/polls/${poll.id}`, {
        headers: authHeaders(),
      });

      showNotice("success", "Poll deleted successfully!");

      if (selectedPoll?.id === poll.id) {
        setSelectedPoll(null);
        setResults([]);
        setPage("dashboard");
      }

      await loadPolls();
    } catch (error) {
      showNotice(
        "error",
        error.response?.data?.message || "Unable to delete poll."
      );
    } finally {
      setLoading(false);
    }
  };

  const castVote = async () => {
    if (selectedOption === null || !selectedPoll) return;

    if (!token) {
      showNotice("error", "Please log in to vote.");
      return;
    }

    setLoading(true);

    try {
      await axios.post(
        `${API}/polls/${selectedPoll.id}/vote`,
        {
          optionIndex: selectedOption,
        },
        {
          headers: authHeaders(),
        }
      );

      setVoted(true);
      showNotice("success", "Your vote has been recorded!");

      await loadResults(selectedPoll);
      await loadPolls();
    } catch (error) {
      showNotice(
        "error",
        error.response?.data?.message ||
          "Unable to submit your vote."
      );
    } finally {
      setLoading(false);
    }
  };

  const addOption = () => {
    if (pollForm.options.length >= 10) return;

    setPollForm({
      ...pollForm,
      options: [...pollForm.options, ""],
    });
  };

  const updateOption = (index, value) => {
    const updated = [...pollForm.options];
    updated[index] = value;

    setPollForm({
      ...pollForm,
      options: updated,
    });
  };

  const removeOption = (index) => {
    if (pollForm.options.length <= 2) return;

    setPollForm({
      ...pollForm,
      options: pollForm.options.filter(
        (_, optionIndex) => optionIndex !== index
      ),
    });
  };

  const totalVotes = results.reduce(
    (sum, item) => sum + Number(item.votes || 0),
    0
  );

  const isPollExpired = (poll) =>
    poll.expiresAt &&
    new Date(poll.expiresAt).getTime() <= Date.now();

  const getPollStatus = (poll) => {
    if (isPollExpired(poll)) return "Expired";
    return poll.isActive ? "Active" : "Closed";
  };

  const formatExpiry = (date) =>
    new Date(date).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });

  // AUTHENTICATION SCREEN
  if (!token || !user) {
    return (
      <div className="auth-layout">
        <div className="auth-decoration">
          <div className="auth-orb orb-one" />
          <div className="auth-orb orb-two" />

          <div className="auth-content">
            <div className="brand brand-light">
              <div className="brand-icon">
                <Activity size={25} />
              </div>
              <span>
                Pulse<span className="brand-accent">Vote</span>
              </span>
            </div>

            <div className="auth-hero">
              <span className="eyebrow">THE POWER OF EVERY VOICE</span>
              <h1>
                Decisions are
                <br />
                better together.
              </h1>
              <p>
                Create polls, collect opinions, and watch your
                community make decisions in real time.
              </p>
            </div>

            <div className="auth-features">
              <div>
                <Vote size={19} />
                <span>Simple and secure voting</span>
              </div>
              <div>
                <Radio size={19} />
                <span>Live results and updates</span>
              </div>
              <div>
                <ShieldCheck size={19} />
                <span>One vote per account</span>
              </div>
            </div>

            <div className="auth-decoration-footer">
              <Sparkles size={15} />
              Your voice matters.
            </div>
          </div>
        </div>

        <div className="auth-form-side">
          <div className="auth-form-container">
            <div className="mobile-brand brand">
              <div className="brand-icon">
                <Activity size={22} />
              </div>
              <span>
                Pulse<span className="brand-accent">Vote</span>
              </span>
            </div>

            <span className="eyebrow">
              {authMode === "login"
                ? "WELCOME BACK"
                : "GET STARTED"}
            </span>

            <h2>
              {authMode === "login"
                ? "Sign in to your account"
                : "Create your account"}
            </h2>

            <p className="auth-subtitle">
              {authMode === "login"
                ? "Enter your details to continue to PulseVote."
                : "Join PulseVote and make your voice heard."}
            </p>

            {notice.text && (
              <div className={`toast ${notice.type}`}>
                {notice.text}
              </div>
            )}

            <form onSubmit={handleAuth} className="auth-form">
              {authMode === "register" && (
                <label className="field">
                  <span>Full name</span>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={60}
                    placeholder="Enter your name"
                    value={authForm.name}
                    onChange={(event) =>
                      setAuthForm({
                        ...authForm,
                        name: event.target.value,
                      })
                    }
                  />
                </label>
              )}

              <label className="field">
                <span>Email address</span>
                <input
                  type="email"
                  required
                  maxLength={254}
                  placeholder="you@example.com"
                  value={authForm.email}
                  onChange={(event) =>
                    setAuthForm({
                      ...authForm,
                      email: event.target.value,
                    })
                  }
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  required
                  minLength={authMode === "register" ? 8 : undefined}
                  placeholder="Enter your password"
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm({
                      ...authForm,
                      password: event.target.value,
                    })
                  }
                />
              </label>

              <button
                className="primary-button full-button"
                disabled={loading}
              >
                {loading
                  ? "Please wait..."
                  : authMode === "login"
                    ? "Sign in"
                    : "Create account"}
                <ArrowRight size={17} />
              </button>
            </form>

            <div className="auth-switch">
              {authMode === "login"
                ? "Don't have an account?"
                : "Already have an account?"}

              <button
                type="button"
                onClick={() => {
                  setAuthMode(
                    authMode === "login" ? "register" : "login"
                  );
                  setNotice({ type: "", text: "" });
                }}
              >
                {authMode === "login" ? "Create account" : "Sign in"}
              </button>
            </div>

            <div className="auth-security">
              <LockKeyhole size={14} />
              Your account is protected with secure authentication.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MAIN APPLICATION
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Activity size={23} />
          </div>
          <span>
            Pulse<span className="brand-accent">Vote</span>
          </span>
        </div>

        <div className="sidebar-label">WORKSPACE</div>

        <button
          className={`nav-link ${
            page === "dashboard" ? "active" : ""
          }`}
          onClick={() => setPage("dashboard")}
        >
          <BarChart3 size={18} />
          Dashboard
        </button>

        <button
          className={`nav-link ${
            page === "create" ? "active" : ""
          }`}
          onClick={() => {
            resetPollForm();
            setPage("create");
          }}
        >
          <Plus size={18} />
          Create a poll
        </button>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="avatar">
              {(user.name || "U").charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
          </div>

          <button
            className="nav-link logout-link"
            onClick={logout}
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">PULSEVOTE WORKSPACE</span>
            <h2>
              {page === "create"
                ? editingPollId
                  ? "Edit poll"
                  : "Create a poll"
                : page === "poll"
                  ? "Poll details"
                  : "Dashboard"}
            </h2>
          </div>

          <div className="topbar-right">
            <span className="online-indicator">
              <span />
              System online
            </span>

            <button
              className="icon-button"
              title="Refresh polls"
              onClick={loadPolls}
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {notice.text && (
          <div className={`toast inline-toast ${notice.type}`}>
            {notice.text}
          </div>
        )}

        {/* DASHBOARD */}
        {page === "dashboard" && (
          <>
            <section className="welcome-banner">
              <div>
                <span className="eyebrow">
                  YOUR COMMUNITY, YOUR VOICE
                </span>
                <h1>
                  Good to see you, {user.name.split(" ")[0]} 👋
                </h1>
                <p>
                  Explore active polls or create one and hear what
                  everyone thinks.
                </p>
              </div>

              <button
                className="primary-button"
                onClick={() => {
                  resetPollForm();
                  setPage("create");
                }}
              >
                <Plus size={18} />
                Create poll
              </button>
            </section>

            <section className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon purple">
                  <Vote size={20} />
                </div>
                <div>
                  <span>Total polls</span>
                  <strong>{polls.length}</strong>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon green">
                  <Users size={20} />
                </div>
                <div>
                  <span>Your polls</span>
                  <strong>
                    {
                      polls.filter(
                        (poll) => poll.creatorId === user.id
                      ).length
                    }
                  </strong>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon orange">
                  <Activity size={20} />
                </div>
                <div>
                  <span>Voting platform</span>
                  <strong className="status-text">Active</strong>
                </div>
              </div>
            </section>

            <div className="section-heading">
              <div>
                <h3>Explore polls</h3>
                <p>Choose a poll and make your voice heard.</p>
              </div>
              <span className="count-pill">
                {polls.length} polls
              </span>
            </div>

            {polls.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Vote size={28} />
                </div>
                <h3>No polls yet</h3>
                <p>
                  Be the first to start a conversation with your
                  community.
                </p>
                <button
                  className="primary-button"
                  onClick={() => setPage("create")}
                >
                  <Plus size={17} />
                  Create your first poll
                </button>
              </div>
            ) : (
              <div className="poll-grid">
                {polls.map((poll) => {
                  const status = getPollStatus(poll);
                  const isOwner = poll.creatorId === user.id;

                  return (
                    <article className="poll-card" key={poll.id}>
                      <div className="poll-card-top">
                        <span
                          className={
                            status === "Active"
                              ? "active-pill"
                              : "count-pill"
                          }
                        >
                          {status === "Active" && <span />}
                          {status}
                        </span>

                        <span className="poll-date">
                          {new Date(
                            poll.createdAt
                          ).toLocaleDateString()}
                        </span>
                      </div>

                      <h3>{poll.question}</h3>

                      <p className="option-preview">
                        {poll.options.length} choices available
                      </p>

                      {poll.expiresAt && (
                        <p className="option-preview">
                          <Clock size={14} /> Expires:{" "}
                          {formatExpiry(poll.expiresAt)}
                        </p>
                      )}

                      <div className="poll-card-footer">
                        <span>
                          <BarChart3 size={15} />
                          View results
                        </span>

                        <button
                          className="text-button"
                          onClick={() => openPoll(poll)}
                        >
                          Open poll <ArrowRight size={15} />
                        </button>
                      </div>

                      {isOwner && (
                        <div className="poll-management-actions">
                          {poll.isActive && (
                            <>
                              <button
                                className="secondary-button"
                                onClick={() => editPoll(poll)}
                              >
                                <Pencil size={15} />
                                Edit
                              </button>

                              <button
                                className="secondary-button"
                                onClick={() => closePoll(poll)}
                                disabled={loading}
                              >
                                <XCircle size={15} />
                                Close poll
                              </button>
                            </>
                          )}

                          <button
                            className="text-button"
                            onClick={() => deletePoll(poll)}
                            disabled={loading}
                          >
                            <Trash2 size={15} />
                            Delete
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* CREATE AND EDIT POLL */}
        {page === "create" && (
          <section className="form-panel">
            <div className="form-panel-heading">
              <div className="large-icon">
                {editingPollId ? (
                  <Pencil size={23} />
                ) : (
                  <Plus size={23} />
                )}
              </div>

              <div>
                <h3>
                  {editingPollId
                    ? "Edit your poll"
                    : "Start a new poll"}
                </h3>
                <p>
                  {editingPollId
                    ? "Update your question, options and expiry date."
                    : "Ask a question and add options for people to vote on."}
                </p>
              </div>
            </div>

            <form onSubmit={createPoll}>
              <label className="field">
                <span>Your question</span>
                <textarea
                  required
                  minLength={5}
                  maxLength={200}
                  rows={3}
                  placeholder="What would you like to ask?"
                  value={pollForm.question}
                  onChange={(event) =>
                    setPollForm({
                      ...pollForm,
                      question: event.target.value,
                    })
                  }
                />
              </label>

              <div className="options-heading">
                <span>Answer options</span>
                <span>{pollForm.options.length}/10</span>
              </div>

              {pollForm.options.map((option, index) => (
                <div className="option-input" key={index}>
                  <span>
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <input
                    required
                    maxLength={100}
                    placeholder={`Option ${index + 1}`}
                    value={option}
                    onChange={(event) =>
                      updateOption(index, event.target.value)
                    }
                  />

                  {pollForm.options.length > 2 && (
                    <button
                      type="button"
                      className="remove-option"
                      onClick={() => removeOption(index)}
                    >
                      <XCircle size={18} />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                className="add-option"
                onClick={addOption}
                disabled={pollForm.options.length >= 10}
              >
                <Plus size={16} />
                Add another option
              </button>

              <label className="field expiry-field">
                <span>
                  <Clock size={15} /> Poll expiry date and time
                  (optional)
                </span>

                <input
                  type="datetime-local"
                  value={pollForm.expiresAt}
                  onChange={(event) =>
                    setPollForm({
                      ...pollForm,
                      expiresAt: event.target.value,
                    })
                  }
                />

                <small>
                  Leave empty if you do not want an expiry date.
                </small>
              </label>

              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    resetPollForm();
                    setPage("dashboard");
                  }}
                >
                  Cancel
                </button>

                <button
                  className="primary-button"
                  disabled={loading}
                >
                  {loading
                    ? "Saving..."
                    : editingPollId
                      ? "Save changes"
                      : "Publish poll"}
                  <ArrowRight size={17} />
                </button>
              </div>
            </form>
          </section>
        )}

        {/* POLL DETAILS AND VOTING */}
        {page === "poll" && selectedPoll && (
          <section className="poll-detail">
            <button
              className="back-button"
              onClick={() => setPage("dashboard")}
            >
              ← Back to dashboard
            </button>

            <div className="detail-heading">
              <span
                className={
                  selectedPoll.isActive && !isPollExpired(selectedPoll)
                    ? "active-pill"
                    : "count-pill"
                }
              >
                {selectedPoll.isActive &&
                !isPollExpired(selectedPoll)
                  ? "Live poll"
                  : getPollStatus(selectedPoll)}
              </span>

              <h1>{selectedPoll.question}</h1>

              <p>
                Select one option below to cast your vote. Results
                refresh every few seconds.
              </p>

              {selectedPoll.expiresAt && (
                <p className="option-preview">
                  <Clock size={14} />
                  Expires: {formatExpiry(selectedPoll.expiresAt)}
                </p>
              )}
            </div>

            <div className="voting-panel">
              <div className="panel-title">
                <h3>
                  <Vote size={19} /> Cast your vote
                </h3>
                <span>
                  {selectedPoll.options.length} options
                </span>
              </div>

              {selectedPoll.options.map((option, index) => (
                <button
                  key={index}
                  className={`vote-option ${
                    selectedOption === index ? "selected" : ""
                  }`}
                  onClick={() =>
                    !voted && setSelectedOption(index)
                  }
                  disabled={
                    voted ||
                    !selectedPoll.isActive ||
                    isPollExpired(selectedPoll)
                  }
                >
                  <span className="radio-mark">
                    {selectedOption === index && <span />}
                  </span>

                  <span>{option}</span>

                  {selectedOption === index && (
                    <CheckCircle2 size={18} />
                  )}
                </button>
              ))}

              {!selectedPoll.isActive ||
              isPollExpired(selectedPoll) ? (
                <div className="voted-message">
                  <XCircle size={18} />
                  This poll is no longer accepting votes.
                </div>
              ) : voted ? (
                <div className="voted-message">
                  <CheckCircle2 size={18} />
                  Your vote has been recorded.
                </div>
              ) : (
                <button
                  className="primary-button full-button vote-submit"
                  disabled={selectedOption === null || loading}
                  onClick={castVote}
                >
                  {loading ? "Submitting..." : "Submit vote"}
                  <ArrowRight size={17} />
                </button>
              )}
            </div>

            <div className="results-panel">
              <div className="panel-title">
                <h3>
                  <BarChart3 size={19} /> Live results
                </h3>
                <span className="live-label">
                  <span /> LIVE
                </span>
              </div>

              <div className="total-votes">
                <strong>{totalVotes}</strong>
                <span>Total votes</span>
              </div>

              {results.map((item, index) => {
                const percentage = totalVotes
                  ? Math.round(
                      (Number(item.votes) / totalVotes) * 100
                    )
                  : 0;

                return (
                  <div className="result-row" key={index}>
                    <div className="result-label">
                      <span>{item.option}</span>
                      <strong>
                        {percentage}%{" "}
                        <small>({item.votes})</small>
                      </strong>
                    </div>

                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              <p className="refresh-note">
                <RefreshCw size={13} />
                Results refresh automatically every 3 seconds
              </p>
            </div>
          </section>
        )}
      </main>

      <footer className="app-footer">
        <ShieldCheck size={14} />
        PulseVote · Your voice matters · Secure voting experience
      </footer>
    </div>
  );
}

export default App;
