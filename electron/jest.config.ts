```ts
import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  preset: 'ts-jest',
  testMatch: [
    '<rootDir>/main/__tests__/**/*.test.ts',
    '<rootDir>/preload/__tests__/**/*.test.ts',
    '<rootDir>/src/__tests__/**/*.test.ts',
  ],
  collectCoverageFrom: [
    'main/**/*.ts',
    'preload/**/*.ts',
    '!**/__tests__/**',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: { lines: 60 },
  },
};

export default config;
```