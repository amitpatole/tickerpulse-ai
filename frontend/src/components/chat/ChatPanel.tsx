'use client';

import { useEffect, useRef } from 'react';
import { Trash2, Bot } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';

export default function ChatPanel() {
  const { messages, isLoading, starters, error, sendMessage, clearHistory } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to latest message whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      {!isEmpty && (
        <div className="flex items-center justify-end border-b border-slate-700/50 px-4 py-2">
          <button
            onClick={clearHistory}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear chat
          </button>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {isEmpty ? (
          /* Empty state with starters */
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/20">
              <Bot className="h-8 w-8 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">TickerPulse AI Chat</h2>
              <p className="mt-1 text-sm text-slate-400">
                Ask about stocks, ratings, earnings, your portfolio, or anything market-related.
              </p>
            </div>

            {starters.length > 0 && (
              <div className="w-full max-w-lg">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Suggestions
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {starters.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="rounded-xl border border-slate-700/60 bg-slate-800/50 px-4 py-3 text-left text-sm text-slate-300 hover:border-blue-500/50 hover:bg-slate-800 hover:text-white transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 rounded-lg bg-red-500/10 px-4 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-slate-700/50 px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <ChatInput onSend={sendMessage} disabled={isLoading} />
          <p className="mt-2 text-center text-[10px] text-slate-600">
            TickerPulse AI can make mistakes. Verify important financial information independently.
          </p>
        </div>
      </div>
    </div>
  );
}
