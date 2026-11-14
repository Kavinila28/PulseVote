
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  Activity, Plus, LogOut, Vote, BarChart3, Users,
  CheckCircle2, XCircle, RefreshCw, Radio, ArrowRight,
  ShieldCheck, Sparkles
} from "lucide-react";
import "./App.css";

const API = "/api";

function App() {
  const [token, setToken] = useState(localStorage.getItem("pulsevote_token") || "");
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

  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: ""
  });

  const [pollForm, setPollForm] = useState({
    question: "",
    options: ["", ""]
  });

  const showNotice = (type, text) => {
    setNotice({ type, text });
    window.setTimeout(() => {
      setNotice({ type: "", text: "" });
    }, 3500);
  };

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`
  });

  const loadPolls = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/polls`);
      setPolls(response.data.polls || []);
    } catch {
      showNotice("error", "Unable to load polls. Check that the backend is running.");
    }
  }, []);

  const loadResults = async (poll) => {
    if (!poll?.id) return;

    try {
      const response = await axios.get(`${API}/polls/${poll.id}/results`);
      setResults(response.data.results || []);
    } catch {
      showNotice("error", "Unable to load poll results.");
    }
  };

  const loadProfile = useCallback(async (activeToken) => {
    try {
      const response = await axios.get(`${API}/auth/me`, {
        headers: {
          Authorization: `Bearer ${activeToken}`
        }
      });

      setUser(response.data.user);
    } catch {
      localStorage.removeItem("pulsevote_token");
      setToken("");
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadProfile(token);
      loadPolls();
    }
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
  }, [page, selectedPoll]);

  const handleAuth = async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      const endpoint = authMode === "login" ? "login" : "register";

      const payload = authMode === "login"
        ? {
            email: authForm.email,
            password: authForm.password
          }
        : authForm;

      const response = await axios.post(`${API}/auth/${endpoint}`, payload);

      const newToken = response.data.token;

      localStorage.setItem("pulsevote_token", newToken);
      setToken(newToken);
      setUser(response.data.user);
      setPage("dashboard");

      showNotice(
        "success",
        authMode === "login"
          ? "Welcome back!"
          : "Account created successfully!"
      );
    } catch (error) {
      showNotice(
        "error",
        error.response?.data?.message || "Authentication failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("pulsevote_token");
    setToken("");
    setUser(null);
    setPage("dashboard");
    setSelectedPoll(null);
    setResults([]);
    setSelectedOption(null);
    setVoted(false);

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

    const options = pollForm.options
      .map((item) => item.trim())
      .filter(Boolean);

    if (options.length < 2) {
      showNotice("error", "Please enter at least two options.");
      return;
    }

    setLoading(true);

    try {
      await axios.post(
        `${API}/polls`,
        {
          question: pollForm.question.trim(),
          options
        },
        {
          headers: authHeaders()
        }
      );

      setPollForm({
        question: "",
        options: ["", ""]
      });

      showNotice("success", "Your poll has been published!");
      setPage("dashboard");
      await loadPolls();
    } catch (error) {
      showNotice(
        "error",
        error.response?.data?.message || "Could not create poll."
      );
    } finally {
      setLoading(false);
    }
  };

  // Authenticated voting: backend identifies the voter using the JWT.
  const castVote = async () => {
    if (!token || !selectedPoll || selectedOption === null) {
      showNotice("error", "Please log in and select an option.");
      return;
    }

    setLoading(true);

    try {
      await axios.post(
        `${API}/polls/${selectedPoll.id}/vote`,
        {
          optionIndex: selectedOption
        },
        {
          headers: authHeaders()
        }
      );

      setVoted(true);
      showNotice("success", "Your vote has been submitted!");

      await loadResults(selectedPoll);
    } catch (error) {
      showNotice(
        "error",
        error.response?.data?.message || "Unable to submit your vote."
      );
    } finally {
      setLoading(false);
    }
  };

  const addOption = () => {
    if (pollForm.options.length < 10) {
      setPollForm({
        ...pollForm,
        options: [...pollForm.options, ""]
      });
    }
  };

  const updateOption = (index, value) => {
    const updated = [...pollForm.options];
    updated[index] = value;

    setPollForm({
      ...pollForm,
      options: updated
    });
  };

  const totalVotes = results.reduce(
    (sum, item) => sum + Number(item.votes || 0),
    0
  );

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

            <div className="auth-headline">
              <span className="eyebrow">
                <Sparkles size={14} /> YOUR VOICE MATTERS
              </span>

              <h1>
                Make every<br />
                vote <span>count.</span>
              </h1>

              <p>
                Create polls, share your opinion, and see what people think
                — all in one place.
              </p>
            </div>

            <div className="auth-feature">
              <div>
                <Radio size={18} />
              </div>
              <span>Live poll results powered by Redis</span>
            </div>
          </div>
        </div>

        <div className="auth-panel">
          <form className="auth-card" onSubmit={handleAuth}>
            <div className="mobile-brand brand">
              <div className="brand-icon">
                <Activity size={23} />
              </div>
              <span>
                Pulse<span className="brand-accent">Vote</span>
              </span>
            </div>

            <span className="eyebrow">WELCOME TO PULSEVOTE</span>

            <h2>
              {authMode === "login"
                ? "Welcome back"
                : "Create your account"}
            </h2>

            <p className="muted">
              {authMode === "login"
                ? "Sign in to continue to your dashboard."
                : "Join the community and make your voice heard."}
            </p>

            {authMode === "register" && (
              <label className="field">
                <span>Full name</span>
                <input
                  required
                  minLength="2"
                  maxLength="60"
                  placeholder="Your name"
                  value={authForm.name}
                  onChange={(e) =>
                    setAuthForm({
                      ...authForm,
                      name: e.target.value
                    })
                  }
                />
              </label>
            )}

            <label className="field">
              <span>Email address</span>
              <input
                required
                type="email"
                placeholder="you@example.com"
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm({
                    ...authForm,
                    email: e.target.value
                  })
                }
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                required
                type="password"
                minLength="8"
                placeholder="At least 8 characters"
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm({
                    ...authForm,
                    password: e.target.value
                  })
                }
              />
            </label>

            <button className="primary-button full-button" disabled={loading}>
              {loading
                ? "Please wait..."
                : authMode === "login"
                  ? "Sign in"
                  : "Create account"}
              <ArrowRight size={17} />
            </button>

            <p className="auth-switch">
              {authMode === "login"
                ? "Don't have an account?"
                : "Already have an account?"}

              <button
                type="button"
                onClick={() =>
                  setAuthMode(authMode === "login" ? "register" : "login")
                }
              >
                {authMode === "login" ? "Create account" : "Sign in"}
              </button>
            </p>
          </form>
        </div>

        {notice.text && (
          <div className={`toast ${notice.type}`}>
            {notice.text}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
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
          className={`nav-link ${page === "dashboard" ? "active" : ""}`}
          onClick={() => setPage("dashboard")}
        >
          <BarChart3 size={18} /> Dashboard
        </button>

        <button
          className={`nav-link ${page === "create" ? "active" : ""}`}
          onClick={() => setPage("create")}
        >
          <Plus size={18} /> Create a poll
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

          <button className="nav-link logout-link" onClick={logout}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">PULSEVOTE WORKSPACE</span>
            <h2>
              {page === "create"
                ? "Create a poll"
                : page === "poll"
                  ? "Poll details"
                  : "Dashboard"}
            </h2>
          </div>

          <div className="topbar-right">
            <span className="online-indicator">
              <span /> System online
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
                  Explore active polls or create one and hear what everyone thinks.
                </p>
              </div>

              <button
                className="primary-button"
                onClick={() => setPage("create")}
              >
                <Plus size={18} /> Create poll
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
                    {polls.filter((p) => p.creatorId === user.id).length}
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

              <span className="count-pill">{polls.length} polls</span>
            </div>

            {polls.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Vote size={28} />
                </div>

                <h3>No polls yet</h3>
                <p>
                  Be the first to start a conversation with your community.
                </p>

                <button
                  className="primary-button"
                  onClick={() => setPage("create")}
                >
                  <Plus size={17} /> Create your first poll
                </button>
              </div>
            ) : (
              <div className="poll-grid">
                {polls.map((poll) => (
                  <article className="poll-card" key={poll.id}>
                    <div className="poll-card-top">
                      <span className="active-pill">
                        <span /> Active
                      </span>

                      <span className="poll-date">
                        {new Date(poll.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <h3>{poll.question}</h3>

                    <p className="option-preview">
                      {poll.options.length} choices available
                    </p>

                    <div className="poll-card-footer">
                      <span>
                        <BarChart3 size={15} /> View results
                      </span>

                      <button
                        className="text-button"
                        onClick={() => openPoll(poll)}
                      >
                        Open poll <ArrowRight size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {page === "create" && (
          <section className="form-panel">
            <div className="form-panel-heading">
              <div className="large-icon">
                <Plus size={23} />
              </div>

              <div>
                <h3>Start a new poll</h3>
                <p>
                  Ask a question and add options for people to vote on.
                </p>
              </div>
            </div>

            <form onSubmit={createPoll}>
              <label className="field">
                <span>Your question</span>

                <textarea
                  required
                  minLength="5"
                  maxLength="200"
                  rows="3"
                  placeholder="What would you like to ask?"
                  value={pollForm.question}
                  onChange={(e) =>
                    setPollForm({
                      ...pollForm,
                      question: e.target.value
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
                    maxLength="100"
                    placeholder={`Option ${index + 1}`}
                    value={option}
                    onChange={(e) => updateOption(index, e.target.value)}
                  />

                  {pollForm.options.length > 2 && (
                    <button
                      type="button"
                      className="remove-option"
                      onClick={() =>
                        setPollForm({
                          ...pollForm,
                          options: pollForm.options.filter(
                            (_, i) => i !== index
                          )
                        })
                      }
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
                <Plus size={16} /> Add another option
              </button>

              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPage("dashboard")}
                >
                  Cancel
                </button>

                <button className="primary-button" disabled={loading}>
                  {loading ? "Publishing..." : "Publish poll"}
                  <ArrowRight size={17} />
                </button>
              </div>
            </form>
          </section>
        )}

        {page === "poll" && selectedPoll && (
          <section className="poll-detail">
            <button
              className="back-button"
              onClick={() => setPage("dashboard")}
            >
              ← Back to dashboard
            </button>

            <div className="detail-heading">
              <span className="active-pill">
                <span /> Live poll
              </span>

              <h1>{selectedPoll.question}</h1>

              <p>
                Select one option below to cast your vote. Results refresh every few seconds.
              </p>
            </div>

            <div className="voting-panel">
              <div className="panel-title">
                <h3>
                  <Vote size={19} /> Cast your vote
                </h3>
                <span>{selectedPoll.options.length} options</span>
              </div>

              {selectedPoll.options.map((option, index) => (
                <button
                  key={index}
                  className={`vote-option ${
                    selectedOption === index ? "selected" : ""
                  }`}
                  onClick={() => !voted && setSelectedOption(index)}
                  disabled={voted}
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

              {!voted ? (
                <button
                  className="primary-button full-button vote-submit"
                  disabled={selectedOption === null || loading}
                  onClick={castVote}
                >
                  {loading ? "Submitting..." : "Submit vote"}
                  <ArrowRight size={17} />
                </button>
              ) : (
                <div className="voted-message">
                  <CheckCircle2 size={18} /> Your vote has been recorded.
                </div>
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
                        {percentage}% <small>({item.votes})</small>
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
                <RefreshCw size={13} /> Results refresh automatically every 3 seconds
              </p>
            </div>
          </section>
        )}
      </main>

      <footer className="app-footer">
        <ShieldCheck size={14} /> PulseVote · Your voice matters · Secure voting experience
      </footer>
    </div>
  );
}

export default App;
