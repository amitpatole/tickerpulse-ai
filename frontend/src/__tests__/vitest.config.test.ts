/**
 * Test frontend/vitest.config.ts configuration is valid and correctly set.
 *
 * This test suite verifies the vitest configuration that controls test discovery,
 * globals, environment setup, and coverage reporting in CI/CD.
 */

import { describe, it, expect } from 'vitest'

// Import the actual vitest config to validate it at test time
import config from '../../vitest.config'

/**
 * AC1-AC5: Load and validate vitest config structure and settings.
 *
 * By importing the config directly, we catch syntax errors and validate
 * the configuration structure against expected values.
 */
describe('vitest.config.ts Configuration', () => {
  it('AC1: vitest config exports default object from defineConfig', () => {
    expect(config).toBeDefined()
    expect(typeof config).toBe('object')
  })

  it('AC1: test environment is jsdom for React component testing', () => {
    expect(config.test).toBeDefined()
    expect(config.test.environment).toBe('jsdom')
  })

  it('AC2: globals enabled for jest-compatible describe/it/expect syntax', () => {
    expect(config.test.globals).toBe(true)
  })

  it('AC2: setupFiles configured to initialize test environment', () => {
    expect(config.test.setupFiles).toBeDefined()
    expect(Array.isArray(config.test.setupFiles)).toBe(true)
    expect(config.test.setupFiles.length).toBeGreaterThan(0)
    expect((config.test.setupFiles[0] as string).includes('setupTests')).toBe(true)
  })

  it('AC3: test file include patterns match __tests__ and .test.ts convention', () => {
    expect(config.test.include).toBeDefined()
    expect(Array.isArray(config.test.include)).toBe(true)

    const patterns = config.test.include as string[]
    expect(patterns.some((p) => p.includes('__tests__'))).toBe(true)
    expect(patterns.some((p) => p.includes('.test.'))).toBe(true)
  })

  it('AC4: coverage provider set to v8 for accurate metrics', () => {
    expect(config.test.coverage).toBeDefined()
    expect(config.test.coverage?.provider).toBe('v8')
  })

  it('AC4: coverage reporters configured for text, json, and lcov formats', () => {
    const reporters = config.test.coverage?.reporter as string[]
    expect(Array.isArray(reporters)).toBe(true)
    expect(reporters).toContain('text')
    expect(reporters).toContain('json')
    expect(reporters).toContain('lcov')
  })

  it('AC5: coverage exclude patterns prevent test file duplication in metrics', () => {
    const exclude = config.test.coverage?.exclude as string[]
    expect(Array.isArray(exclude)).toBe(true)
    expect(exclude.some((p) => p.includes('__tests__'))).toBe(true)
    expect(exclude.some((p) => p.includes('.test.'))).toBe(true)
  })

  it('AC5: resolve.alias configures @ shorthand for src/ imports', () => {
    expect(config.resolve).toBeDefined()
    expect(config.resolve?.alias).toBeDefined()
    expect((config.resolve?.alias as Record<string, string>)['@']).toBeDefined()
    expect((config.resolve?.alias as Record<string, string>)['@']).toContain('src')
  })

  it('AC1: react plugin registered for JSX transformation', () => {
    expect(config.plugins).toBeDefined()
    expect(Array.isArray(config.plugins)).toBe(true)
    expect(config.plugins!.length).toBeGreaterThan(0)
  })
})

/**
 * Edge cases and error scenarios
 */
describe('vitest.config.ts Edge Cases', () => {
  it('should have non-empty test include patterns to discover tests', () => {
    expect(config.test.include).toBeDefined()
    expect(Array.isArray(config.test.include)).toBe(true)
    expect((config.test.include as string[]).length).toBeGreaterThan(0)
  })

  it('should not have duplicate coverage reporters', () => {
    const reporters = config.test.coverage?.reporter as string[]
    const uniqueReporters = new Set(reporters)
    expect(uniqueReporters.size).toBe(reporters.length)
  })

  it('should configure both __tests__ and .spec/.test pattern matching', () => {
    const patterns = config.test.include as string[]
    const hasTestsDir = patterns.some((p) => p.includes('__tests__'))
    const hasSpecPattern = patterns.some((p) => p.includes('spec') || p.includes('test'))

    expect(hasTestsDir).toBe(true)
    expect(hasSpecPattern).toBe(true)
  })
})
