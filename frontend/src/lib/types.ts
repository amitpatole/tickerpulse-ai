_(add `RefreshIntervalConfig` interface before `RATING_COLORS`)_

```ts
export interface RefreshIntervalConfig {
  interval: number;
  source: 'db' | 'default';
  updated_at?: string;
}
```