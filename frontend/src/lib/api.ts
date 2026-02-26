_(import `RefreshIntervalConfig`; update `getRefreshInterval` return type)_

```ts
// Added RefreshIntervalConfig to the import list
import type { ..., RefreshIntervalConfig } from './types';

export async function getRefreshInterval(): Promise<RefreshIntervalConfig> { ... }
```