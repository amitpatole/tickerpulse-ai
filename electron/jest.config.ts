import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  preset: 'ts-jest',
  testMatch: [
    '<rootDir>/__tests__/**/*.test.ts',
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
    global: {
      lines: 60,
      statements: 60,
      functions: 60,
      branches: 60,
    },
  },
};

export default config;