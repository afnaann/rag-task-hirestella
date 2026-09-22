"use client";

import React, { useState, useRef, useEffect } from "react";
import type { ChatResponse, SourceMetadata } from "@/lib/types";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceMetadata[];
  refused?: boolean;
  provider?: "groq" | "gemini" | null;
  error?: boolean;
}

const INITIAL_PROMPT = "Ask me about Afnan's experience, projects, skills, or background.";

const SUGGESTIONS = [
  "What has Afnan built with LangGraph?",
  "Did Afnan work at Google?",
  "What experience does Afnan have with RAG?",
];

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const handleOpenChat = () => setIsOpen(true);
    window.addEventListener("open-chat", handleOpenChat);
    return () => window.removeEventListener("open-chat", handleOpenChat);
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      // Focus input when opened
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, messages, isLoading]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const messageText = (textToSend ?? input).trim();
    if (!messageText || isLoading) return;

    // Reset error state
    setErrorMsg(null);
    setLastFailedMessage(null);

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) {
      setInput("");
    }
    setIsLoading(true);

    try {
      // Contract: Client sends ONLY { message: string }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText }),
      });

      if (!res.ok) {
        let errDesc = "Failed to fetch response. Please try again.";
        try {
          const errData = await res.json();
          if (errData && typeof errData.error === "string") {
            errDesc = errData.error;
          }
        } catch {
          // ignore parsing error, use default message
        }
        throw new Error(errDesc);
      }

      const data: ChatResponse = await res.json();

      if (!data || typeof data.answer !== "string") {
        throw new Error("Received an unexpected response format from the server.");
      }

      const assistantMessage: Message = {
        id: `asst-${Date.now()}`,
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
        refused: data.refused,
        provider: data.provider,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const displayError =
        err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
      setErrorMsg(displayError);
      setLastFailedMessage(messageText);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleRetry = () => {
    if (lastFailedMessage) {
      handleSendMessage(lastFailedMessage);
    }
  };

  return (
    <>
      {/* Floating Action Trigger Button */}
      {!isOpen && (
        <button
          className="chat-trigger-btn"
          onClick={() => setIsOpen(true)}
          aria-label="Open AI Assistant chat"
          type="button"
          id="talk-to-afnan-trigger"
        >
          <span className="chat-trigger-pulse" aria-hidden="true" />
          <span className="chat-trigger-icon" aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span>Talk to Afnan</span>
        </button>
      )}

      {/* Floating Chat Panel */}
      {isOpen && (
        <div
          className="chat-panel"
          role="dialog"
          aria-labelledby="chat-widget-title"
          aria-modal="true"
        >
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-info">
              <div className="chat-header-title" id="chat-widget-title">
                <span>Afnan&apos;s Assistant</span>
                <span className="chat-header-badge">
                  <span className="nav-status-dot" aria-hidden="true" />
                  RAG
                </span>
              </div>
              <span className="chat-header-sub">Document-grounded AI assistant</span>
            </div>
            <div className="chat-header-actions">
              <button
                className="chat-header-btn"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
                type="button"
                title="Close chat (Esc)"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div className="chat-messages" role="log" aria-live="polite">
            {messages.length === 0 ? (
              <div className="chat-empty-state">
                <div className="chat-empty-icon" aria-hidden="true">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                </div>
                <div className="chat-empty-title">Document-Grounded Knowledge</div>
                <p className="chat-empty-desc">{INITIAL_PROMPT}</p>

                <div className="chat-suggestions">
                  {SUGGESTIONS.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="chat-suggestion-btn"
                      onClick={() => handleSendMessage(suggestion)}
                    >
                      &ldquo;{suggestion}&rdquo;
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`chat-message-row ${msg.role}`}>
                  <div className="chat-bubble">
                    {msg.content.split("\n\n").map((para, pIdx) => (
                      <p key={pIdx} className="chat-bubble-paragraph">
                        {para}
                      </p>
                    ))}
                  </div>

                  {/* Sources display for assistant responses */}
                  {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                    <div className="chat-sources-wrapper">
                      <details className="chat-sources-details">
                        <summary className="chat-sources-summary">
                          Retrieved sources ({msg.sources.length})
                        </summary>
                        <div className="chat-sources-list">
                          {msg.sources.map((src, sIdx) => (
                            <div key={sIdx} className="chat-source-item">
                              <span className="chat-source-name" title={src.documentName}>
                                {src.documentName}
                                {src.heading ? ` › ${src.heading}` : ""}
                              </span>
                              <span
                                className="chat-source-score"
                                title={`Cosine similarity score: ${src.score.toFixed(4)}`}
                              >
                                {Math.round(src.score * 100)}% match
                              </span>
                            </div>
                          ))}
                          <div className="chat-source-disclaimer">
                            Retrieved passages provide grounding context.
                          </div>
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* In-flight Thinking Indicator */}
            {isLoading && (
              <div className="chat-message-row assistant">
                <div className="chat-thinking" aria-live="polite">
                  <span>Searching documents &amp; generating</span>
                  <span className="thinking-dots" aria-hidden="true">
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                  </span>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {errorMsg && (
              <div className="chat-error-banner" role="alert">
                <span>{errorMsg}</span>
                {lastFailedMessage && (
                  <button
                    type="button"
                    className="chat-retry-btn"
                    onClick={handleRetry}
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <div className="chat-footer">
            <form
              className="chat-input-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
            >
              <input
                ref={inputRef}
                type="text"
                className="chat-input"
                placeholder="Ask a question about experience, skills..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                maxLength={1000}
                aria-label="Message to assistant"
                id="chat-user-input"
              />
              <button
                type="submit"
                className="chat-send-btn"
                disabled={isLoading || !input.trim()}
                aria-label="Send message"
              >
                <svg
                  className="chat-send-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
            <div className="chat-disclaimer">
              Responses are strictly grounded in the ingested portfolio documents.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
