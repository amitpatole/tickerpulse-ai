'use client';

import { useEffect, useRef } from 'react';
import { ExternalLink, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { useNewsFeedKeyboard } from '@/hooks/useNewsFeedKeyboard';
import { useKeyboardShortcutsContext } from '@/components/layout/KeyboardShortcutsProvider';
import type { NewsArticle } from '@/lib/types';
import { SENTIMENT_COLORS } from '@/lib/types';

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export interface NewsFeedProps {
  /** Articles from useDashboardData. null = still loading initial data. */
  articles: NewsArticle[] | null;
  loading?: boolean;
  error?: string | null;
}

export default function NewsFeed({ articles, loading = false, error = null }: NewsFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemCount = articles?.length ?? 0;
  const { focusedIndex, itemRefs, handleKeyDown, activatePanel } =
    useNewsFeedKeyboard(itemCount, containerRef);

  const { registerNewsFeed } = useKeyboardShortcutsContext();
  useEffect(() => {
    registerNewsFeed(() => {
      activatePanel();
      containerRef.current?.focus();
    });
    return () => registerNewsFeed(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerNewsFeed]);

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50">
      <div className="border-b border-slate-700/50 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Recent News</h2>
      </div>

      <div
        ref={containerRef}
        className="max-h-[600px] overflow-y-auto focus:outline-none"
        role="feed"
        aria-label="Recent news"
        aria-busy={loading || articles === null}
        tabIndex={0}
        onFocus={activatePanel}
        onKeyDown={handleKeyDown}
      >
        {/* Loading */}
        {(loading || articles === null) && !error && (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-3 w-3/4 rounded bg-slate-700" />
                <div className="h-2 w-1/2 rounded bg-slate-700" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && !articles && (
          <div className="p-4 text-center text-sm text-red-400">{error}</div>
        )}

        {/* Empty */}
        {articles && articles.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">No news articles yet.</div>
        )}

        {/* Articles */}
        {articles && articles.length > 0 && (
          <div className="divide-y divide-slate-700/30">
            {articles.map((article, i) => (
              <article
                key={article.id}
                ref={(el) => { itemRefs.current[i] = el; }}
                role="article"
                tabIndex={-1}
                aria-label={article.title}
                aria-selected={focusedIndex === i}
                className={clsx(
                  'px-4 py-3 transition-colors hover:bg-slate-700/20 focus:outline-none',
                  focusedIndex === i && 'ring-2 ring-inset ring-blue-500 bg-slate-700/20'
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-1"
                      tabIndex={-1}
                    >
                      <p className="text-sm text-slate-200 line-clamp-2 group-hover:text-blue-400 transition-colors">
                        {article.title}
                      </p>
                      <ExternalLink className="mt-0.5 h-3 w-3 flex-shrink-0 text-slate-600 group-hover:text-blue-400" />
                    </a>

                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                        {article.ticker}
                      </span>

                      {article.sentiment_label && (
                        <span
                          className={clsx(
                            'rounded px-1.5 py-0.5 text-[10px] font-medium',
                            SENTIMENT_COLORS[article.sentiment_label] || 'bg-slate-500/20 text-slate-400'
                          )}
                        >
                          {article.sentiment_label}
                        </span>
                      )}

                      {article.source && (
                        <span className="text-[10px] text-slate-500">{article.source}</span>
                      )}

                      <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                        <Clock className="h-2.5 w-2.5" />
                        {timeAgo(article.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
