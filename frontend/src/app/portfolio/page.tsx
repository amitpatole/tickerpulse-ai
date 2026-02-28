'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import Header from '@/components/layout/Header';
import ErrorBoundary from '@/components/layout/ErrorBoundary';
import SummaryCards from '@/components/portfolio/SummaryCards';
import PositionsTable from '@/components/portfolio/PositionsTable';
import AllocationChart from '@/components/portfolio/AllocationChart';
import AddPositionModal from '@/components/portfolio/AddPositionModal';
import type { PositionFormData } from '@/components/portfolio/AddPositionModal';
import { usePortfolio } from '@/hooks/usePortfolio';
import type { PortfolioPosition } from '@/lib/types';

export default function PortfolioPage() {
  const {
    positions,
    summary,
    loading,
    addPosition,
    updatePosition,
    removePosition,
    mutating,
  } = usePortfolio();

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PortfolioPosition | undefined>();

  function openAdd() {
    setEditTarget(undefined);
    setModalOpen(true);
  }

  function openEdit(position: PortfolioPosition) {
    setEditTarget(position);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditTarget(undefined);
  }

  async function handleSubmit(data: PositionFormData) {
    if (editTarget) {
      await updatePosition(editTarget.id, {
        quantity: data.quantity,
        avg_cost: data.avg_cost,
        currency: data.currency,
        notes: data.notes || undefined,
      });
    } else {
      await addPosition({
        ticker: data.ticker,
        quantity: data.quantity,
        avg_cost: data.avg_cost,
        currency: data.currency,
        notes: data.notes || undefined,
      });
    }
  }

  return (
    <div className="flex flex-col">
      <Header title="Portfolio" subtitle="Positions, unrealised P&L, and allocation" />

      <div className="flex-1 space-y-6 p-6">
        {/* Summary KPIs */}
        <ErrorBoundary>
          <SummaryCards summary={summary} loading={loading} />
        </ErrorBoundary>

        {/* Positions table */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50">
          <div className="flex items-center justify-between border-b border-slate-700/50 px-5 py-4">
            <h2 className="text-sm font-semibold text-white">Positions</h2>
            <button
              onClick={openAdd}
              disabled={mutating}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Position
            </button>
          </div>
          <ErrorBoundary>
            <PositionsTable
              positions={positions}
              loading={loading}
              onEdit={openEdit}
              onDelete={removePosition}
            />
          </ErrorBoundary>
        </div>

        {/* Allocation chart — only shown when there's something to display */}
        {positions.length > 0 && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
            <h2 className="mb-4 text-sm font-semibold text-white">Allocation</h2>
            <ErrorBoundary>
              <AllocationChart positions={positions} />
            </ErrorBoundary>
          </div>
        )}
      </div>

      <AddPositionModal
        open={modalOpen}
        onClose={closeModal}
        onSubmit={handleSubmit}
        editPosition={editTarget}
      />
    </div>
  );
}
