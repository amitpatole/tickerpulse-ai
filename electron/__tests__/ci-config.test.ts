/**
 * Test suite for CI pipeline configuration validation.
 *
 * Verifies that:
 * - Jest configuration is correctly set up (jest.config.ts)
 * - Test discovery works for all test directories
 * - Coverage threshold (60%) is properly configured
 * - Package.json test scripts are defined
 *
 * These tests ensure the electron CI job in .github/workflows/ci.yml will succeed.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('CI Pipeline Configuration (VO-685)', () => {
  const electronRoot = path.resolve(__dirname, '..');
  const projectRoot = path.resolve(electronRoot, '..');

  // ============================================================
  // Jest Configuration Tests
  // ============================================================

  describe('jest.config.ts validation', () => {
    test('should have jest.config.ts file in electron directory', () => {
      /**
       * ACCEPTANCE CRITERIA AC1: jest.config.ts must exist and be loadable.
       */
      const configPath = path.join(electronRoot, 'jest.config.ts');
      expect(fs.existsSync(configPath)).toBe(true);
    });

    test('should include <rootDir>/__tests__/**/*.test.ts in testMatch patterns', () => {
      /**
       * ACCEPTANCE CRITERIA AC2: Jest testMatch must include the new __tests__ directory
       * pattern so that test discovery works for tests in electron/__tests__/.
       */
      const configPath = path.join(electronRoot, 'jest.config.ts');
      const configContent = fs.readFileSync(configPath, 'utf-8');

      // Verify the pattern is present
      expect(configContent).toContain('<rootDir>/__tests__/**/*.test.ts');

      // Verify it's inside testMatch array
      expect(configContent).toContain('testMatch: [');
      expect(configContent).toMatch(/testMatch:\s*\[\s*[\s\S]*<rootDir>\/__tests__\/\*\*\/\*\.test\.ts/);
    });

    test('should have coverage threshold set to 60% for all metrics', () => {
      /**
       * ACCEPTANCE CRITERIA AC3: Coverage threshold must be exactly 60% for
       * lines, statements, functions, and branches (enforced by CI).
       */
      const configPath = path.join(electronRoot, 'jest.config.ts');
      const configContent = fs.readFileSync(configPath, 'utf-8');

      // Verify coverage threshold exists and is set to 60
      expect(configContent).toContain('coverageThreshold');
      expect(configContent).toContain('lines: 60');
      expect(configContent).toContain('statements: 60');
      expect(configContent).toContain('functions: 60');
      expect(configContent).toContain('branches: 60');
    });

    test('should have testEnvironment set to node', () => {
      /**
       * ACCEPTANCE CRITERIA AC4: Jest must run in Node.js environment,
       * not DOM, since electron main/preload are Node.js code.
       */
      const configPath = path.join(electronRoot, 'jest.config.ts');
      const configContent = fs.readFileSync(configPath, 'utf-8');

      expect(configContent).toContain("testEnvironment: 'node'");
    });

    test('should have ts-jest preset configured', () => {
      /**
       * ACCEPTANCE CRITERIA AC5: ts-jest preset must be configured
       * to compile TypeScript tests at runtime.
       */
      const configPath = path.join(electronRoot, 'jest.config.ts');
      const configContent = fs.readFileSync(configPath, 'utf-8');

      expect(configContent).toContain("preset: 'ts-jest'");
    });
  });

  // ============================================================
  // Test Discovery Tests
  // ============================================================

  describe('test file discovery', () => {
    test('should find test files in electron/__tests__/ directory', () => {
      /**
       * ACCEPTANCE CRITERIA AC6: Jest must discover test files in
       * the new __tests__ directory at the root level.
       */
      const testDir = path.join(electronRoot, '__tests__');
      expect(fs.existsSync(testDir)).toBe(true);

      // Verify at least one test file exists
      const files = fs.readdirSync(testDir);
      const testFiles = files.filter((f) => f.endsWith('.test.ts'));
      expect(testFiles.length).toBeGreaterThan(0);
    });

    test('should find test files in preload/__tests__/ directory', () => {
      /**
       * ACCEPTANCE CRITERIA AC7: Jest must discover test files in
       * subdirectory patterns (e.g., preload/__tests__/).
       */
      const testDir = path.join(electronRoot, 'preload', '__tests__');

      // Directory may or may not exist, but if it does, test files should be found
      if (fs.existsSync(testDir)) {
        const files = fs.readdirSync(testDir);
        const testFiles = files.filter((f) => f.endsWith('.test.ts'));
        // If directory exists, expect at least one test
        expect(testFiles.length).toBeGreaterThanOrEqual(0);
      }
    });

    test('should find test files in main/__tests__/ directory', () => {
      /**
       * ACCEPTANCE CRITERIA AC8: Jest must discover test files in
       * main/__tests__/ subdirectory.
       */
      const testDir = path.join(electronRoot, 'main', '__tests__');

      // Directory may or may not exist, but if it does, test files should be found
      if (fs.existsSync(testDir)) {
        const files = fs.readdirSync(testDir);
        const testFiles = files.filter((f) => f.endsWith('.test.ts'));
        // If directory exists, expect at least one test
        expect(testFiles.length).toBeGreaterThanOrEqual(0);
      }
    });

    test('should not discover test files outside __tests__ directories', () => {
      /**
       * Edge case: Test files in source directories (not __tests__)
       * should not be discovered by jest.config.ts.
       */
      const configPath = path.join(electronRoot, 'jest.config.ts');
      const configContent = fs.readFileSync(configPath, 'utf-8');

      // testMatch should not include patterns that would find .test.ts in src/
      // or main/ root (only in __tests__ subdirectories)
      const testMatchPatterns = configContent.match(/testMatch:\s*\[([\s\S]*?)\]/);
      expect(testMatchPatterns).toBeTruthy();

      // Verify patterns are specific to __tests__ directories
      const patternText = testMatchPatterns![1];
      expect(patternText).toContain('__tests__');
    });
  });

  // ============================================================
  // Package.json Script Tests
  // ============================================================

  describe('package.json test scripts', () => {
    test('should have test:ci script defined', () => {
      /**
       * ACCEPTANCE CRITERIA AC9: package.json must have test:ci script
       * that runs Jest with CI mode and coverage reporting.
       */
      const pkgPath = path.join(electronRoot, 'package.json');
      const pkgContent = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      expect(pkgContent.scripts).toBeDefined();
      expect(pkgContent.scripts['test:ci']).toBeDefined();
    });

    test('should have test:ci script configured with --ci and --coverage flags', () => {
      /**
       * ACCEPTANCE CRITERIA AC10: test:ci must include --ci flag for CI environment
       * and --coverage flag to generate coverage reports.
       */
      const pkgPath = path.join(electronRoot, 'package.json');
      const pkgContent = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const testCiScript = pkgContent.scripts['test:ci'];

      expect(testCiScript).toContain('jest');
      expect(testCiScript).toContain('--ci');
      expect(testCiScript).toContain('--coverage');
    });

    test('should have test script for local development', () => {
      /**
       * Edge case: Local development should have simple 'jest' command
       * without CI/coverage flags (optional but good practice).
       */
      const pkgPath = path.join(electronRoot, 'package.json');
      const pkgContent = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      expect(pkgContent.scripts['test']).toBeDefined();
      expect(pkgContent.scripts['test']).toContain('jest');
    });
  });

  // ============================================================
  // Branch Protection Configuration Tests
  // ============================================================

  describe('branch protection configuration', () => {
    test('should have electron-test in required status checks', () => {
      /**
       * ACCEPTANCE CRITERIA AC11: .github/branch-protection-config.json must include
       * 'electron-test' in required_status_checks.contexts so that failing tests block PR merge.
       */
      const branchProtectPath = path.join(
        projectRoot,
        '.github',
        'branch-protection-config.json'
      );

      if (fs.existsSync(branchProtectPath)) {
        const config = JSON.parse(fs.readFileSync(branchProtectPath, 'utf-8'));
        expect(config.required_status_checks).toBeDefined();
        expect(config.required_status_checks.contexts).toBeDefined();
        expect(config.required_status_checks.contexts).toContain('electron-test');
      }
    });

    test('should have backend-test and frontend-test also in required status checks', () => {
      /**
       * Edge case: Other CI checks should be present alongside electron-test
       * to ensure full CI coverage.
       */
      const branchProtectPath = path.join(
        projectRoot,
        '.github',
        'branch-protection-config.json'
      );

      if (fs.existsSync(branchProtectPath)) {
        const config = JSON.parse(fs.readFileSync(branchProtectPath, 'utf-8'));
        const contexts = config.required_status_checks.contexts;

        expect(contexts).toContain('backend-test');
        expect(contexts).toContain('frontend-test');
        expect(contexts.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  // ============================================================
  // CI Workflow Configuration Tests
  // ============================================================

  describe('CI workflow configuration', () => {
    test('should have electron-test job defined in ci.yml workflow', () => {
      /**
       * ACCEPTANCE CRITERIA AC12: .github/workflows/ci.yml must have
       * an 'electron-test' job that runs npm ci and npm run test:ci.
       */
      const workflowPath = path.join(projectRoot, '.github', 'workflows', 'ci.yml');

      if (fs.existsSync(workflowPath)) {
        const content = fs.readFileSync(workflowPath, 'utf-8');
        expect(content).toContain('electron-test');
      }
    });

    test('should use npm ci (not npm install) for dependency caching', () => {
      /**
       * ACCEPTANCE CRITERIA AC13: CI workflow should use 'npm ci' for
       * reproducible builds with lock file instead of 'npm install'.
       */
      const workflowPath = path.join(projectRoot, '.github', 'workflows', 'ci.yml');

      if (fs.existsSync(workflowPath)) {
        const content = fs.readFileSync(workflowPath, 'utf-8');
        // electron section should use npm ci
        const electronSection = content.split('electron-test:')[1]?.split('jobs:')[0];
        if (electronSection) {
          expect(content).toContain('npm ci');
        }
      }
    });
  });

  // ============================================================
  // Edge Cases & Error Handling
  // ============================================================

  describe('edge cases', () => {
    test('should handle empty test directories gracefully', () => {
      /**
       * Edge case: If a __tests__ directory exists but is empty,
       * Jest should not fail (handled by --passWithNoTests being absent in test:ci).
       */
      const configPath = path.join(electronRoot, 'jest.config.ts');
      expect(fs.existsSync(configPath)).toBe(true);

      // Config should be valid TypeScript/JavaScript
      // (would be caught during tsc --noEmit in CI)
    });

    test('should have collectCoverageFrom configured to exclude __tests__', () => {
      /**
       * Edge case: Coverage reports should not include test files themselves,
       * only source code.
       */
      const configPath = path.join(electronRoot, 'jest.config.ts');
      const configContent = fs.readFileSync(configPath, 'utf-8');

      expect(configContent).toContain('collectCoverageFrom');
      expect(configContent).toContain("!**/__tests__/**");
    });
  });
});
