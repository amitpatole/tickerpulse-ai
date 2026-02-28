```typescript
'use client';

import type { Timeframe } from '@/lib/types';
import TimeframeToggle from './TimeframeToggle';

interface MiniTimeframeToggleProps {
  selected: Timeframe;
  onChange: (tf: Timeframe) => void;
}

export default function MiniTimeframeToggle({ selected, onChange }: MiniTimeframeToggleProps) {
  return <TimeframeToggle selected={selected} onChange={onChange} compact />;
}
```