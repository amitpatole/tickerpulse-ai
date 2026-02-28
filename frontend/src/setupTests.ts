```ts
import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Runtime compatibility shim: maps the global `jest` object to Vitest's `vi`.
// Existing test files use jest.fn(), jest.mock(), jest.clearAllMocks(),
// jest.useFakeTimers() etc. — this shim makes all those calls delegate to
// the equivalent Vitest API without requiring test-file modifications.
// Type declarations are provided by @types/jest (auto-included as a dep of jest).
;(globalThis as any).jest = vi
```