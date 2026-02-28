```ts
import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    // Enable jest-compatible globals (describe, it, expect, vi, beforeEach, etc.)
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: [
      'src/**/__tests__/**/*.{ts,tsx}',
      'src/**/*.{spec,test}.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.{spec,test}.{ts,tsx}',
        'src/setupTests.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```