import Header from '@/components/layout/Header';
import EarningsPageView from '@/components/earnings/EarningsPageView';

export default function EarningsPage() {
  return (
    <div className="flex flex-col">
      <Header title="Earnings Calendar" subtitle="Upcoming and past earnings with estimates" />
      <div className="flex-1 p-6">
        <EarningsPageView />
      </div>
    </div>
  );
}