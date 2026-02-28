'use client';

import Header from '@/components/layout/Header';
import { CompareLayout } from '@/components/compare/CompareLayout';

export default function ComparePage() {
  return (
    <div className="flex flex-col">
      <Header
        title="Model Comparison"
        subtitle="Side-by-side analysis from multiple AI providers"
      />
      <div className="flex-1 p-6">
        <CompareLayout />
      </div>
    </div>
  );
}
