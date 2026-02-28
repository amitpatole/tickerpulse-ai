```typescript
'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';

interface PriceCellProps {
  price: number | null | undefined;
  /** Change percentage used to determine base text colour when no flash is active. */
  changePct?: number | null;
  currency?: string;
  className?: string;
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

/**
 * PriceCell — memoized price display with a CSS transition flash on value change.
 *
 * When `price` changes from its previous value the text flashes emerald (price
 * up) or red (price down) for 600 ms, then reverts to the base colour derived
 * from `changePct`.  Refs prevent unnecessary re-renders between ticks and the
 * flash timer is safely cleared on unmount.
 */
const PriceCell = memo(function PriceCell({
  price,
  changePct,
  currency = 'USD',
  className,
}: PriceCellProps) {
  const prevPriceRef = useRef<number | null | undefined>(price);
  const [flashDir, setFlashDir] = useState<'up' | 'down' | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevPriceRef.current;
    if (
      prev !== undefined &&
      prev !== null &&
      price !== undefined &&
      price !== null &&
      price !== prev
    ) {
      const dir: 'up' | 'down' = price > prev ? 'up' : 'down';
      setFlashDir(dir);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFlashDir(null), 600);
    }
    prevPriceRef.current = price;
  }, [price]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (price === null || price === undefined) {
    return <span className={clsx('font-mono text-slate-500', className)}>—</span>;
  }

  const baseIsPositive = (changePct ?? 0) >= 0;

  return (
    <span
      className={clsx(
        'tabular-nums font-mono font-semibold transition-colors duration-300',
        flashDir === 'up' && 'text-emerald-400',
        flashDir === 'down' && 'text-red-400',
        flashDir === null && baseIsPositive && 'text-emerald-400',
        flashDir === null && !baseIsPositive && 'text-red-400',
        className,
      )}
    >
      {formatPrice(price, currency)}
    </span>
  );
});

export default PriceCell;
```