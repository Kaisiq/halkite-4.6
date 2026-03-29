"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import NavBar from "@/components/NavBar";
import { useAchillesStore } from "@/lib/store";
import type { ChatMessage } from "@/lib/types";

// ---------------------------------------------------------------------------
// Suggested questions
// ---------------------------------------------------------------------------

const SUGGESTED_QUESTIONS = [
  "What is our overall organizational health right now?",
  "What are the top 3 critical vulnerabilities we should address immediately?",
  "Which department is most at risk and why?",
  "What happens if our most critical node fails?",
  "What is the worst-case scenario and how likely is it?",
  "Give me the top priority recommendations with expected impact.",
  "Which single points of failure should worry me most?",
  "How resilient are we to a multi-layer attack?",
];

// ---------------------------------------------------------------------------
// Markdown-lite renderer
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(
        <h4 key={i} className="mt-3 mb-1.5 text-sm font-semibold">
          {formatInline(line.slice(4))}
        </h4>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="mt-4 mb-2 text-base font-semibold">
          {formatInline(line.slice(3))}
        </h3>,
      );
      continue;
    }

    if (line.match(/^[-*] /)) {
      elements.push(
        <div key={i} className="flex gap-2 py-0.5 pl-1">
          <span className="mt-2 h-1 w-1 shrink-0 bg-[var(--text-light)]" />
          <span className="text-sm leading-relaxed text-[var(--text-secondary)]">
            {formatInline(line.slice(2))}
          </span>
        </div>,
      );
      continue;
    }

    const numMatch = line.match(/^(\d+)\.\s/);
    if (numMatch) {
      elements.push(
        <div key={i} className="flex gap-2 py-0.5 pl-1">
          <span className="mt-0.5 min-w-[1.25rem] text-right text-xs font-medium text-[var(--text-muted)]">
            {numMatch[1]}.
          </span>
          <span className="text-sm leading-relaxed text-[var(--text-secondary)]">
            {formatInline(line.slice(numMatch[0].length))}
          </span>
        </div>,
      );
      continue;
    }

    if (!line.trim()) {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    elements.push(
      <p key={i} className="text-sm leading-relaxed text-[var(--text-secondary)]">
        {formatInline(line)}
      </p>,
    );
  }

  return elements;
}

function formatInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-[var(--text)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} fade-rise`}
    >
      <div
        className={`max-w-[85%] px-5 py-3.5 ${
          isUser
            ? "bg-[var(--bg-dark)] text-white"
            : "border border-[var(--border)] bg-white"
        }`}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed">{message.content}</p>
        ) : (
          <div className="space-y-0.5">{renderMarkdown(message.content)}</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="flex justify-start fade-rise">
      <div className="flex items-center gap-1.5 border border-[var(--border)] bg-white px-5 py-4">
        <span className="h-1.5 w-1.5 animate-bounce bg-[var(--text-light)] [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce bg-[var(--text-light)] [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce bg-[var(--text-light)] [animation-delay:300ms]" />
        <span className="ml-2 text-xs text-[var(--text-muted)]">
          Analyzing...
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analysis status
// ---------------------------------------------------------------------------

function AnalysisStatus({
  hasGraph,
  hasAnalysis,
  hasExplore,
}: {
  hasGraph: boolean;
  hasAnalysis: boolean;
  hasExplore: boolean;
}) {
  const items = [
    { label: "Network graph", done: hasGraph },
    { label: "Vulnerability analysis", done: hasAnalysis },
    { label: "Scenario exploration", done: hasExplore },
  ];

  return (
    <div className="mx-auto max-w-2xl border border-[var(--border)] px-5 py-3">
      <p className="mono-label text-[9px] mb-2">Available Data</p>
      <div className="flex flex-wrap gap-4">
        {items.map(({ label, done }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 ${done ? "bg-[var(--text)]" : "bg-[var(--border-strong)]"}`}
            />
            <span
              className={`text-xs ${done ? "text-[var(--text)]" : "text-[var(--text-light)]"}`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
      {!hasAnalysis && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Run the analysis pipeline for richer, data-driven answers.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main chat page
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const {
    graph,
    vulnerabilityReport,
    scenarios,
    sessionId: storeSessionId,
    setSessionId,
    chatMessages,
    chatSending,
    chatError,
    sendChatMessage,
    loadChatHistory,
    clearChat,
  } = useAchillesStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (sessionId && storeSessionId !== sessionId) {
      setSessionId(sessionId);
    }
  }, [sessionId, storeSessionId, setSessionId]);

  useEffect(() => {
    if (sessionId && storeSessionId === sessionId) {
      loadChatHistory();
    }
  }, [sessionId, storeSessionId, loadChatHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatSending]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      const el = e.target;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    },
    [],
  );

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || chatSending) return;
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    await sendChatMessage(trimmed);
  }, [input, chatSending, sendChatMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleSuggestion = useCallback(
    (question: string) => {
      if (chatSending) return;
      setInput("");
      sendChatMessage(question);
    },
    [chatSending, sendChatMessage],
  );

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <NavBar sessionId={sessionId} />

      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="border-b border-[var(--border)] px-6 py-5">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <div>
              <p className="mono-label text-[9px] mb-1">Executive Intelligence</p>
              <h1 className="display-face text-2xl font-normal tracking-tight">
                Briefing Chat
              </h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Ask questions about your organization&apos;s resilience data.
              </p>
            </div>
            {chatMessages.length > 0 && (
              <button
                onClick={clearChat}
                className="border border-[var(--border)] px-3 py-2 text-xs transition-colors hover:bg-[var(--bg-alt)]"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Analysis status */}
        <div className="px-6 py-3">
          <AnalysisStatus
            hasGraph={!!graph}
            hasAnalysis={!!vulnerabilityReport}
            hasExplore={scenarios.length > 0}
          />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 custom-scrollbar">
          <div className="mx-auto max-w-4xl space-y-4 py-4">
            {chatMessages.length === 0 && !chatSending && (
              <div className="py-16">
                <div className="text-center">
                  <svg
                    className="mx-auto mb-6 h-10 w-10 text-[var(--text-light)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                    />
                  </svg>
                  <h2 className="mb-2 text-lg font-medium">
                    Ask anything about your organization
                  </h2>
                  <p className="mb-10 text-sm text-[var(--text-muted)]">
                    Get instant answers backed by your stress-test data
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSuggestion(q)}
                      className="border border-[var(--border)] px-4 py-3 text-left text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--text)] hover:text-[var(--text)]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatMessages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}

            {chatSending && <TypingIndicator />}

            {chatError && (
              <div className="mx-auto max-w-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">
                {chatError}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-[var(--border)] px-6 py-4">
          <div className="mx-auto flex max-w-4xl items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your organization's resilience..."
              rows={1}
              className="flex-1 resize-none border border-[var(--border)] bg-transparent px-4 py-3 text-sm outline-none transition-colors placeholder:text-[var(--text-light)] focus:border-[var(--text)]"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || chatSending}
              className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center transition-colors ${
                input.trim() && !chatSending
                  ? "border border-[var(--text)] bg-[var(--text)] text-white hover:bg-[var(--text-secondary)]"
                  : "cursor-not-allowed border border-[var(--border)] text-[var(--text-light)]"
              }`}
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                />
              </svg>
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-4xl text-center text-[10px] text-[var(--text-light)]">
            AI explains the math -- it never changes the numbers.
          </p>
        </div>
      </div>
    </div>
  );
}
