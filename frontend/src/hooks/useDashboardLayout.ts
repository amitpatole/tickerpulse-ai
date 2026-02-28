'use client';

/**
 * useDashboardLayout — manages which dashboard widgets are visible and in
 * what order they appear within each zone.
 *
 * Layout is persisted via usePersistedState (localStorage + server sync).
 * Null from the server means "no customization saved yet" — the DEFAULT_LAYOUT
 * is used transparently in that case.
 */

import { useCallback } from 'react';
import { usePersistedState } from '@/hooks/usePersistedState';
import type { DashboardLayout, WidgetId } from '@/lib/types';

// ---------------------------------------------------------------------------
// Widget metadata
// ---------------------------------------------------------------------------

export type WidgetZone = 'overview' | 'left' | 'right' | 'analysis' | 'tables';

export interface ZoneMeta {
  label: string;
  description: string;
  ids: WidgetId[];
  /** When false, widgets in this zone cannot be individually toggled. */
  configurable: boolean;
}

export const WIDGET_ZONES: Record<WidgetZone, ZoneMeta> = {
  overview: {
    label: 'Overview',
    description: 'Summary cards shown at the top of the dashboard.',
    ids: ['kpi-cards', 'rate-limit'],
    configurable: true,
  },
  left: {
    label: 'Left Column',
    description: 'Main watchlist and portfolio content.',
    ids: ['stock-watchlist', 'portfolio-chart'],
    configurable: true,
  },
  right: {
    label: 'Right Sidebar',
    description: 'Sector, sentiment, news and earnings widgets.',
    ids: ['sector-breakdown', 'market-mood', 'news-feed', 'earnings-calendar'],
    configurable: true,
  },
  analysis: {
    label: 'Analysis Row',
    description: 'Top movers and sentiment distribution.',
    ids: ['top-movers', 'sentiment-chart'],
    configurable: true,
  },
  tables: {
    label: 'Data Tables',
    description: 'AI ratings and price alerts.',
    ids: ['ai-ratings', 'alerts-table'],
    configurable: true,
  },
};

export const WIDGET_LABELS: Record<WidgetId, string> = {
  'kpi-cards': 'KPI Cards',
  'rate-limit': 'Rate Limit Indicator',
  'stock-watchlist': 'Stock Watchlist',
  'portfolio-chart': 'Portfolio Chart',
  'sector-breakdown': 'Sector Breakdown',
  'market-mood': 'Market Mood',
  'news-feed': 'News Feed',
  'earnings-calendar': 'Earnings Calendar',
  'top-movers': 'Top Movers',
  'sentiment-chart': 'Sentiment Summary',
  'ai-ratings': 'AI Ratings Panel',
  'alerts-table': 'Alerts Table',
};

// ---------------------------------------------------------------------------
// Default layout — all widgets enabled, ordered by their natural position.
// ---------------------------------------------------------------------------

export const DEFAULT_LAYOUT: DashboardLayout = {
  widgets: {
    'kpi-cards':          { enabled: true, order: 0 },
    'rate-limit':         { enabled: true, order: 1 },
    'stock-watchlist':    { enabled: true, order: 0 },
    'portfolio-chart':    { enabled: true, order: 1 },
    'sector-breakdown':   { enabled: true, order: 0 },
    'market-mood':        { enabled: true, order: 1 },
    'news-feed':          { enabled: true, order: 2 },
    'earnings-calendar':  { enabled: true, order: 3 },
    'top-movers':         { enabled: true, order: 0 },
    'sentiment-chart':    { enabled: true, order: 1 },
    'ai-ratings':         { enabled: true, order: 0 },
    'alerts-table':       { enabled: true, order: 1 },
  },
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDashboardLayout() {
  const [rawLayout, setLayout, status] = usePersistedState(
    'dashboard_layout',
    null,
    { serverSync: true }
  );

  // Merge saved layout with defaults so newly-added widgets always appear.
  const layout: DashboardLayout = rawLayout
    ? {
        widgets: {
          ...DEFAULT_LAYOUT.widgets,
          ...rawLayout.widgets,
        },
      }
    : DEFAULT_LAYOUT;

  /** Returns true if a widget should be rendered. */
  const isEnabled = useCallback(
    (id: WidgetId): boolean => layout.widgets[id]?.enabled ?? true,
    [layout]
  );

  /** Returns true if at least one widget in the given zone is enabled. */
  const isZoneVisible = useCallback(
    (zone: WidgetZone): boolean =>
      WIDGET_ZONES[zone].ids.some((id) => layout.widgets[id]?.enabled ?? true),
    [layout]
  );

  /** Toggle a single widget's enabled state. */
  const toggleWidget = useCallback(
    (id: WidgetId) => {
      const widgetConfig = layout.widgets[id] ?? { enabled: true, order: 0 };
      setLayout({
        ...layout,
        widgets: {
          ...layout.widgets,
          [id]: { ...widgetConfig, enabled: !widgetConfig.enabled },
        },
      });
    },
    [layout, setLayout]
  );

  /**
   * Move a widget up or down within its zone by swapping `order` values with
   * the adjacent widget in the sorted list.
   */
  const moveWidget = useCallback(
    (id: WidgetId, zoneIds: WidgetId[], direction: 'up' | 'down') => {
      const sorted = [...zoneIds].sort(
        (a, b) => (layout.widgets[a]?.order ?? 0) - (layout.widgets[b]?.order ?? 0)
      );
      const idx = sorted.indexOf(id);
      if (idx === -1) return;
      if (direction === 'up' && idx === 0) return;
      if (direction === 'down' && idx === sorted.length - 1) return;

      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      const swapId = sorted[swapIdx];

      const idConfig   = layout.widgets[id]     ?? { enabled: true, order: idx };
      const swapConfig = layout.widgets[swapId] ?? { enabled: true, order: swapIdx };

      setLayout({
        ...layout,
        widgets: {
          ...layout.widgets,
          [id]:     { ...idConfig,   order: swapConfig.order },
          [swapId]: { ...swapConfig, order: idConfig.order },
        },
      });
    },
    [layout, setLayout]
  );

  /** Return the widget IDs for a zone sorted by their `order` value. */
  const getSortedZone = useCallback(
    (ids: WidgetId[]): WidgetId[] =>
      [...ids].sort(
        (a, b) => (layout.widgets[a]?.order ?? 0) - (layout.widgets[b]?.order ?? 0)
      ),
    [layout]
  );

  /** Reset all widgets to the default layout. */
  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
  }, [setLayout]);

  return {
    layout,
    isEnabled,
    isZoneVisible,
    toggleWidget,
    moveWidget,
    getSortedZone,
    resetLayout,
    syncing: status.syncing,
    syncError: status.error,
  };
}
