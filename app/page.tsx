"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  lastActive: number;
  storageRootHash: string | null;
  storageTxHash: string | null;
  memoryCount: number;
  messageCount: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  memoriesExtracted?: number;
}

interface Memory {
  id: string;
  content: string;
  category: string;
  importance: number;
  accessCount: number;
  createdAt: number;
  tags: string[];
}

interface StorageStatus {
  configured: boolean;
  network: string;
  indexer: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  architecture: "#7B61FF",
  decision: "#00d97e",
  preference: "#ff9500",
  context: "#00b4d8",
  feature: "#f72585",
  bug: "#ff4d4d",
};

const CAT_ICON: Record<string, string> = {
  architecture: "🏗",
  decision: "🎯",
  preference: "💡",
  context: "📋",
  feature: "⚙️",
  bug: "🐛",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ─── Components ───────────────────────────────────────────────────────────────

function CopyHash({
  hash,
  label,
  color = "var(--accent2)",
  size = 10,
}: {
  hash: string | null;
  label?: string;
  color?: string;
  size?: number;
}) {
  const [copied, setCopied] = useState(false);
  if (!hash) return null;
  const onCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      navigator.clipboard.writeText(hash);
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div
      onClick={onCopy}
      role="button"
      tabIndex={0}
      title="Click to copy full hash"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onCopy(e as any); }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
        cursor: "pointer",
        borderRadius: 3,
        padding: "1px 4px",
        margin: "1px -4px",
        transition: "background 0.15s",
        wordBreak: "break-all",
        lineHeight: 1.4,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {label && (
        <span style={{ color: "var(--text3)", fontSize: size, flexShrink: 0, paddingTop: 1 }}>
          {label}
        </span>
      )}
      <span
        style={{
          color: copied ? "var(--green)" : color,
          fontFamily: "var(--font-mono)",
          fontSize: size,
          wordBreak: "break-all",
        }}
      >
        {copied ? "✓ copied" : hash}
      </span>
    </div>
  );
}



function MemoryCard({ memory, isNew }: { memory: Memory; isNew?: boolean }) {
  const color = CAT_COLORS[memory.category] || "#7B61FF";
  const icon = CAT_ICON[memory.category] || "📌";
  const pct = Math.round(memory.importance * 100);

  return (
    <div
      style={{
        background: "var(--surface)",
        borderTop: `1px solid ${isNew ? color : "var(--border)"}`,
        borderRight: `1px solid ${isNew ? color : "var(--border)"}`,
        borderBottom: `1px solid ${isNew ? color : "var(--border)"}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 6,
        padding: "10px 12px",
        marginBottom: 8,
        animation: isNew ? "slideIn 0.3s ease" : "none",
        boxShadow: isNew ? `0 0 12px ${color}30` : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 11 }}>{icon}</span>
        <span style={{ color, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {memory.category}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--text3)", fontSize: 10 }}>{pct}% importance</span>
      </div>
      <p style={{ color: "var(--text)", fontSize: 12, lineHeight: 1.5, marginBottom: 6 }}>
        {memory.content}
      </p>
      {memory.tags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {memory.tags.map((tag) => (
            <span
              key={tag}
              style={{
                background: "var(--bg3)",
                color: "var(--text3)",
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 3,
                fontFamily: "var(--font-mono)",
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StorageBadge({ status, project }: { status: StorageStatus | null; project: Project | null }) {
  const isOnChain = project?.storageRootHash && status?.configured && (project as any)?.onChain !== false;
  const isDemoMode = !status?.configured;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: isDemoMode ? "var(--orange)" : isOnChain ? "var(--green)" : "var(--text3)",
            boxShadow: isDemoMode
              ? "0 0 6px var(--orange)"
              : isOnChain
              ? "0 0 6px var(--green)"
              : "none",
            display: "inline-block",
          }}
        />
        <span style={{ color: "var(--text2)", fontSize: 11, fontWeight: 500 }}>
          0G STORAGE {isDemoMode ? "· DEMO MODE" : isOnChain ? "· SYNCED" : "· PENDING"}
        </span>
      </div>
      {project?.storageRootHash && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
          <CopyHash hash={project.storageRootHash} label="root:" color="var(--accent2)" size={9} />
          {project.storageTxHash && (
            <CopyHash hash={project.storageTxHash} label="tx:" color="var(--text2)" size={9} />
          )}
        </div>
      )}
      {isDemoMode && (
        <span style={{ color: "var(--orange)", fontSize: 10 }}>
          Add ZG_PRIVATE_KEY + ZG_RPC_URL to go live
        </span>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [newMemoryIds, setNewMemoryIds] = useState<Set<string>>(new Set());
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [lastStorageResult, setLastStorageResult] = useState<any>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Hydrate theme from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("meshy-theme");
      const initial: "dark" | "light" = saved === "light" ? "light" : "dark";
      if (document.body.getAttribute("data-theme") !== initial) {
        document.body.setAttribute("data-theme", initial);
      }
      setTheme(initial);
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    // Read from <body> (single source of truth). Force a reflow so the
    // browser flushes the cascade before the next paint.
    const current = document.body.getAttribute("data-theme") === "light" ? "light" : "dark";
    const next: "dark" | "light" = current === "dark" ? "light" : "dark";
    document.body.setAttribute("data-theme", next);
    void document.body.offsetHeight;
    try { localStorage.setItem("meshy-theme", next); } catch {}
    setTheme(next);
  }, []);

  // Load projects on mount
  useEffect(() => {
    fetch("/api/project")
      .then((r) => r.json())
      .then((d) => {
        setProjects(d.projects || []);
        setStorageStatus(d.storage || null);
        if (d.projects?.length > 0) {
          setActiveProjectId(d.projects[0].id);
        }
      });
  }, []);

  // Load project detail when active project changes
  useEffect(() => {
    if (!activeProjectId) return;
    fetch(`/api/project?id=${activeProjectId}`)
      .then((r) => r.json())
      .then((d) => {
        setActiveProject(d.project);
        setChat(d.chat || []);
        setStorageStatus(d.storage || null);
      });
    fetch(`/api/memories?projectId=${activeProjectId}`)
      .then((r) => r.json())
      .then((d) => setMemories(d.memories || []));
  }, [activeProjectId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !activeProjectId || loading) return;
    const msg = input.trim();
    setInput("");
    setLoading(true);

    // Optimistic UI
    setChat((prev) => [...prev, { role: "user", content: msg, timestamp: Date.now() }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: activeProjectId, message: msg }),
      });
      const data = await res.json();

      setChat((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.message || data.error || "Something went wrong.",
          timestamp: Date.now(),
          memoriesExtracted: data.memoriesAdded,
        },
      ]);

      if (data.storageResult) setLastStorageResult(data.storageResult);

      // Refresh memories
      const mRes = await fetch(`/api/memories?projectId=${activeProjectId}`);
      const mData = await mRes.json();
      const prevIds = new Set(memories.map((m) => m.id));
      const freshMemories: Memory[] = mData.memories || [];
      const freshIds = new Set(freshMemories.filter((m) => !prevIds.has(m.id)).map((m) => m.id));
      setNewMemoryIds(freshIds);
      setMemories(freshMemories);
      setTimeout(() => setNewMemoryIds(new Set()), 3000);

      // Refresh project
      const pRes = await fetch(`/api/project?id=${activeProjectId}`);
      const pData = await pRes.json();
      setActiveProject(pData.project);
      setProjects((prev) => prev.map((p) => (p.id === activeProjectId ? pData.project : p)));
    } catch (e) {
      console.error(e);
      setChat((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Connection error. Check your API setup.", timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, activeProjectId, loading, memories]);

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    const res = await fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newProjectName, description: newProjectDesc }),
    });
    const data = await res.json();
    setProjects((prev) => [data.project, ...prev]);
    setActiveProjectId(data.project.id);
    setShowNewProject(false);
    setNewProjectName("");
    setNewProjectDesc("");
  };

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .msg-appear { animation: slideIn 0.25s ease; }
        .thinking-dot { animation: blink 1s ease infinite; }
        textarea:focus, input:focus { outline: none; border-color: var(--accent) !important; }
        .project-item:hover { background: var(--surface2) !important; border-color: var(--border2) !important; }
        .project-item.active { background: var(--accent-dim) !important; border-color: var(--accent) !important; }
        button:hover { opacity: 0.85; }
        button:active { transform: scale(0.98); }
        @media (max-width: 900px) {
          .main-grid { grid-template-columns: 1fr !important; }
          .sidebar, .memory-panel { display: none !important; }
        }
      `}</style>

      <div
        className="main-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "220px 1fr 280px",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        {/* ─── Sidebar ─────────────────────────────────────────────────────── */}
        <div
          className="sidebar"
          style={{
            background: "var(--bg2)",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Logo */}
          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)" }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 18,
                fontWeight: 800,
                color: "var(--text)",
                letterSpacing: "-0.02em",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <img
                src="/logo.png"
                alt="Meshy"
                width={28}
                height={28}
                style={{ width: 28, height: 28, borderRadius: 6, objectFit: "contain", display: "block" }}
              />
              Meshy
              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                style={{
                  marginLeft: "auto",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "2px 6px",
                  color: "var(--text2)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                {theme === "dark" ? "☀" : "☾"}
              </button>
            </div>
            <p style={{ color: "var(--text3)", fontSize: 10, marginTop: 3 }}>
              persistent agent memory · 0G storage
            </p>
          </div>

          {/* Projects header */}
          <div style={{ padding: "10px 16px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text3)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Projects
            </span>
            <button
              onClick={() => setShowNewProject(true)}
              style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 16, lineHeight: 1, fontFamily: "var(--font-mono)" }}
            >
              +
            </button>
          </div>

          {/* Project list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
            {projects.map((p) => (
              <div
                key={p.id}
                className={`project-item${activeProjectId === p.id ? " active" : ""}`}
                onClick={() => setActiveProjectId(p.id)}
                style={{ padding: "8px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid transparent", marginBottom: 2, transition: "all 0.15s" }}
              >
                <div style={{ fontWeight: 500, color: "var(--text)", fontSize: 12, marginBottom: 2 }}>{p.name}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: "var(--text3)", fontSize: 10 }}>{p.memoryCount} memories</span>
                  <span style={{ color: "var(--border2)", fontSize: 10 }}>·</span>
                  <span style={{ color: "var(--text3)", fontSize: 10 }}>{timeAgo(p.lastActive)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* New project form */}
          {showNewProject && (
            <div style={{ padding: 12, borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
              <input
                autoFocus
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setShowNewProject(false)}
                style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: 4, padding: "6px 8px", color: "var(--text)", fontSize: 12, fontFamily: "var(--font-mono)", marginBottom: 6 }}
              />
              <input
                placeholder="Description (optional)"
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createProject();
                  if (e.key === "Escape") setShowNewProject(false);
                }}
                style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: 4, padding: "6px 8px", color: "var(--text)", fontSize: 12, fontFamily: "var(--font-mono)", marginBottom: 8 }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={createProject} style={{ flex: 1, background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4, padding: "5px 0", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                  Create
                </button>
                <button onClick={() => setShowNewProject(false)} style={{ flex: 1, background: "var(--bg3)", color: "var(--text2)", border: "1px solid var(--border)", borderRadius: 4, padding: "5px 0", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-mono)" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Storage status */}
          <div style={{ padding: 10, borderTop: "1px solid var(--border)" }}>
            <StorageBadge status={storageStatus} project={activeProject} />
          </div>
        </div>

        {/* ─── Chat ────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)" }}>
          {/* Header */}
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--bg2)" }}>
            {activeProject ? (
              <>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                    {activeProject.name}
                  </div>
                  {activeProject.description && (
                    <div style={{ color: "var(--text3)", fontSize: 11 }}>{activeProject.description}</div>
                  )}
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ display: "flex", gap: 16 }}>
                  {[
                    { label: "memories", value: activeProject.memoryCount },
                    { label: "messages", value: activeProject.messageCount },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ textAlign: "right" }}>
                      <div style={{ color: "var(--accent2)", fontWeight: 600, fontSize: 14 }}>{value}</div>
                      <div style={{ color: "var(--text3)", fontSize: 10 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text3)", fontSize: 12 }}>
                <img
                  src="/cover-no-bg.png"
                  alt=""
                  width={36}
                  height={36}
                  style={{ width: 36, height: 36, objectFit: "contain", opacity: 0.85 }}
                />
                <span>Pick a project in the sidebar, or create a new one to get started.</span>
              </div>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column" }}>
            {!activeProject && projects.length === 0 && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "32px 16px" }}>
                <img
                  src="/cover-no-bg.png"
                  alt="Meshy mascot"
                  width={220}
                  height={220}
                  style={{ width: 220, height: 220, objectFit: "contain", filter: "drop-shadow(0 12px 32px rgba(123, 97, 255, 0.25))" }}
                />
                <div style={{ textAlign: "center", maxWidth: 360 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
                    Welcome to Meshy
                  </div>
                  <div style={{ color: "var(--text2)", fontSize: 13, lineHeight: 1.5 }}>
                    Persistent AI agent memory, stored on 0G. Create your first project to start chatting.
                  </div>
                </div>
                <button
                  onClick={() => setShowNewProject(true)}
                  style={{
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 18px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    marginTop: 4,
                  }}
                >
                  + Create your first project
                </button>
              </div>
            )}
            {chat.length === 0 && activeProject && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, opacity: 0.5 }}>
              <img
              src="/cover-no-bg.png"
              alt="Meshy mascot"
              width={220}
              height={220}
              style={{ width: 220, height: 220, objectFit: "contain", filter: "drop-shadow(0 12px 32px rgba(123, 97, 255, 0.25))" }}
              />
                <div style={{ color: "var(--text2)", fontSize: 13, textAlign: "center" }}>
                  Start talking about your project.
                  <br />
                  I'll remember everything important across sessions.
                </div>
              </div>
            )}

            {chat.map((msg, i) => (
              <div
                key={i}
                className="msg-appear"
                style={{ marginBottom: 16, display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "var(--text3)" }}>
                    {msg.role === "user" ? "you" : "agent"} · {timeAgo(msg.timestamp)}
                  </span>
                  {msg.memoriesExtracted !== undefined && msg.memoriesExtracted > 0 && (
                    <span style={{ background: "var(--accent-dim)", color: "var(--accent2)", fontSize: 10, padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>
                      +{msg.memoriesExtracted} memories stored →0G
                    </span>
                  )}
                </div>
                <div
                  style={{
                    maxWidth: "80%",
                    background: msg.role === "user" ? "var(--accent)" : "var(--surface)",
                    color: msg.role === "user" ? "#fff" : "var(--text)",
                    border: msg.role === "user" ? "none" : "1px solid var(--border)",
                    borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    padding: "10px 14px",
                    fontSize: 13,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text3)", fontSize: 12 }}>
                <span>agent is thinking</span>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="thinking-dot" style={{ animationDelay: `${i * 0.2}s` }}>.</span>
                ))}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", background: "var(--bg2)", display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              placeholder={activeProject ? `Ask about ${activeProject.name}... (⌘+Enter to send)` : "Select a project to start"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!activeProject || loading}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={3}
              style={{
                flex: 1,
                background: "var(--surface)",
                border: "1px solid var(--border2)",
                borderRadius: 8,
                padding: "10px 12px",
                color: "var(--text)",
                fontSize: 13,
                fontFamily: "var(--font-mono)",
                resize: "none",
                lineHeight: 1.5,
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || !activeProject || loading}
              style={{
                background: input.trim() && activeProject && !loading ? "var(--accent)" : "var(--surface)",
                color: input.trim() && activeProject && !loading ? "#fff" : "var(--text3)",
                border: "none",
                borderRadius: 8,
                padding: "10px 16px",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: 600,
                transition: "all 0.15s",
                height: 42,
                whiteSpace: "nowrap",
              }}
            >
              Send ↑
            </button>
          </div>
        </div>

        {/* ─── Memory Panel ─────────────────────────────────────────────────── */}
        <div
          className="memory-panel"
          style={{ background: "var(--bg2)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" }}
        >
          {/* Header */}
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
            <span style={{ color: "var(--accent2)", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Memories ({memories.length})
            </span>
          </div>

          {/* Category counts */}
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(CAT_COLORS).map(([cat, color]) => {
              const count = memories.filter((m) => m.category === cat).length;
              if (count === 0) return null;
              return (
                <span key={cat} style={{ background: `${color}20`, color, fontSize: 10, padding: "2px 7px", borderRadius: 3, fontWeight: 600 }}>
                  {CAT_ICON[cat]} {count}
                </span>
              );
            })}
            {memories.length === 0 && <span style={{ color: "var(--text3)", fontSize: 11 }}>No memories yet</span>}
          </div>

          {/* Memories list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
            {memories.length === 0 && (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text3)", fontSize: 12, lineHeight: 1.7, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <img
                  src="/cover-no-bg.png"
                  alt=""
                  width={96}
                  height={96}
                  style={{ width: 96, height: 96, objectFit: "contain", opacity: 0.7 }}
                />
                <div>
                  Chat with the agent.
                  <br />
                  Important project facts will
                  <br />
                  appear here automatically.
                </div>
              </div>
            )}
            {memories.map((m) => (
              <MemoryCard key={m.id} memory={m} isNew={newMemoryIds.has(m.id)} />
            ))}
          </div>

          {/* 0G chain info */}
          {lastStorageResult && (
            <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", background: "var(--green-dim)" }}>
              <div style={{ color: "var(--green)", fontSize: 10, fontWeight: 600, marginBottom: 4 }}>✓ STORED ON 0G</div>
              <CopyHash hash={lastStorageResult.rootHash} label="root:" color="var(--accent2)" size={10} />
              {lastStorageResult.txHash && (
                <CopyHash hash={lastStorageResult.txHash} label="tx:" color="var(--text2)" size={10} />
              )}
              <div style={{ color: "var(--text3)", fontSize: 10, marginTop: 2 }}>
                {lastStorageResult.size} bytes · {timeAgo(lastStorageResult.timestamp)}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
