'use client';

import { clsx } from 'clsx';
import { Bot, User } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '@/lib/types';

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={clsx(
        'flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={clsx(
          'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-blue-600' : 'bg-slate-700'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <Bot className="h-4 w-4 text-slate-300" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={clsx(
          'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'rounded-tr-sm bg-blue-600 text-white'
            : 'rounded-tl-sm bg-slate-800 text-slate-100'
        )}
      >
        {message.isLoading ? (
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
            <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
            <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
          </span>
        ) : (
          <>
            <p className="whitespace-pre-wrap">{message.content}</p>

            {/* Ticker chips */}
            {!isUser && message.tickers_referenced && message.tickers_referenced.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {message.tickers_referenced.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-blue-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
