'use client';

import { useState, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import {
  getPortfolio,
  addPortfolioPosition,
  updatePortfolioPosition,
  deletePortfolioPosition,
} from '@/lib/api';
import type { PortfolioPosition, PortfolioSummary } from '@/lib/types';

interface UsePortfolioResult {
  positions: PortfolioPosition[];
  summary: PortfolioSummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  addPosition: (data: {
    ticker: string;
    quantity: number;
    avg_cost: number;
    currency?: string;
    notes?: string;
  }) => Promise<void>;
  updatePosition: (
    id: number,
    data: { quantity?: number; avg_cost?: number; currency?: string; notes?: string }
  ) => Promise<void>;
  removePosition: (id: number) => Promise<void>;
  mutating: boolean;
}

export function usePortfolio(): UsePortfolioResult {
  const [mutating, setMutating] = useState(false);

  const fetcher = useCallback(() => getPortfolio(), []);
  const {
    data,
    loading,
    error,
    refetch,
  } = useApi(fetcher, [], { refreshInterval: 60_000 });

  const addPosition = useCallback(
    async (posData: {
      ticker: string;
      quantity: number;
      avg_cost: number;
      currency?: string;
      notes?: string;
    }) => {
      setMutating(true);
      try {
        await addPortfolioPosition(posData);
        refetch();
      } finally {
        setMutating(false);
      }
    },
    [refetch]
  );

  const updatePosition = useCallback(
    async (
      id: number,
      posData: { quantity?: number; avg_cost?: number; currency?: string; notes?: string }
    ) => {
      setMutating(true);
      try {
        await updatePortfolioPosition(id, posData);
        refetch();
      } finally {
        setMutating(false);
      }
    },
    [refetch]
  );

  const removePosition = useCallback(
    async (id: number) => {
      setMutating(true);
      try {
        await deletePortfolioPosition(id);
        refetch();
      } finally {
        setMutating(false);
      }
    },
    [refetch]
  );

  return {
    positions: data?.positions ?? [],
    summary: data?.summary ?? null,
    loading,
    error,
    refetch,
    addPosition,
    updatePosition,
    removePosition,
    mutating,
  };
}
