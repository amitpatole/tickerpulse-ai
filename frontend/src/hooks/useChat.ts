'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createChatSession, getChatStarters, sendSessionMessage } from '@/lib/api';
import type { ChatMessage } from '@/lib/types';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [starters, setStarters] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Persists the active session ID across renders without triggering re-renders.
  // Null means no session has been created yet (lazy init on first message).
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    getChatStarters()
      .then(setStarters)
      .catch(() => {/* starters are optional */});
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setError(null);

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    // Optimistic placeholder for the assistant reply
    const loadingMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);

    try {
      // Lazy session creation: only create when the first message is sent
      if (!sessionIdRef.current) {
        const session = await createChatSession();
        sessionIdRef.current = session.session_id;
      }

      const res = await sendSessionMessage(sessionIdRef.current, trimmed);

      if (!res.success) {
        throw new Error(res.error ?? 'Unknown error');
      }

      const assistantMsg: ChatMessage = {
        id: loadingMsg.id,
        role: 'assistant',
        content: res.message,
        timestamp: new Date().toISOString(),
        tickers_referenced: res.tickers_referenced,
      };

      setMessages((prev) =>
        prev.map((m) => (m.id === loadingMsg.id ? assistantMsg : m))
      );
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'Failed to get a response';
      setError(errText);
      // Replace loading placeholder with error state
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? { ...m, content: `Error: ${errText}`, isLoading: false }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
    // Null out the session ref so the next message starts a fresh session
    sessionIdRef.current = null;
  }, []);

  return {
    messages,
    isLoading,
    starters,
    error,
    sendMessage,
    clearHistory,
  };
}
