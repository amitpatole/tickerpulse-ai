import ModelComparisonPanel from '@/components/compare/ModelComparisonPanel';

export const metadata = {
  title: 'Model Comparison — TickerPulse AI',
  description: 'Side-by-side analysis of a ticker across multiple LLM providers.',
};

export default function ComparePage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Model Comparison</h1>
          <p className="mt-1 text-sm text-slate-400">
            Run the same structured analysis against multiple AI providers and compare their
            ratings, scores, and reasoning side by side.
          </p>
        </div>
        <ModelComparisonPanel />
      </div>
    </div>
  );
}
