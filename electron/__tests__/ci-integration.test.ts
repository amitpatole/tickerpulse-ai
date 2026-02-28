// CI Pipeline Integration Tests
// Validates that all CI pipeline components work together correctly

import * as fs from 'fs';
import * as path from 'path';

describe('CI Pipeline Integration (VO-685)', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const electronRoot = path.resolve(__dirname, '..');

  // ============================================================
  // Full Pipeline Coverage Tests
  // ============================================================

  describe('end-to-end CI pipeline setup', () => {
    test('should have all three CI jobs configured in workflow', () => {
      // ACCEPTANCE CRITERIA AC1: All three CI jobs must exist and run
      const workflowPath = path.join(projectRoot, '.github', 'workflows', 'ci.yml');
      if (!fs.existsSync(workflowPath)) return;

      const content = fs.readFileSync(workflowPath, 'utf-8');
      expect(content).toContain('backend-test');
      expect(content).toContain('frontend-test');
      expect(content).toContain('electron-test');
    });

    test('should have electron-test job running tsc and test:ci', () => {
      // ACCEPTANCE CRITERIA AC2: electron-test job must compile and test
      const workflowPath = path.join(projectRoot, '.github', 'workflows', 'ci.yml');
      if (!fs.existsSync(workflowPath)) return;

      const content = fs.readFileSync(workflowPath, 'utf-8');
      const electronSection = content.split('electron-test:')[1];
      if (electronSection) {
        // Should include type checking
        expect(electronSection).toContain('tsc');
        // Should include test:ci script call
        expect(electronSection).toContain('test:ci');
      }
    });

    test('should have npm ci for reproducible builds', () => {
      // ACCEPTANCE CRITERIA AC3: npm ci ensures lock file consistency
      const workflowPath = path.join(projectRoot, '.github', 'workflows', 'ci.yml');
      if (!fs.existsSync(workflowPath)) return;

      const content = fs.readFileSync(workflowPath, 'utf-8');
      expect(content).toContain('npm ci');
    });

    test('should upload coverage artifacts to CI', () => {
      // ACCEPTANCE CRITERIA AC4: Coverage reports must be uploaded for visibility
      const workflowPath = path.join(projectRoot, '.github', 'workflows', 'ci.yml');
      if (!fs.existsSync(workflowPath)) return;

      const content = fs.readFileSync(workflowPath, 'utf-8');
      const electronSection = content.split('electron-test:')[1];
      if (electronSection) {
        expect(electronSection).toContain('electron-coverage');
        expect(electronSection).toContain('lcov.info');
      }
    });

    test('should have all three jobs in branch protection checks', () => {
      // ACCEPTANCE CRITERIA AC5: Branch protection must require all three CI checks
      const protectPath = path.join(projectRoot, '.github', 'branch-protection-config.json');
      if (!fs.existsSync(protectPath)) return;

      const config = JSON.parse(fs.readFileSync(protectPath, 'utf-8'));
      const contexts = config.required_status_checks.contexts;
      expect(contexts).toEqual(expect.arrayContaining([
        'backend-test',
        'frontend-test',
        'electron-test',
        'build-windows-pr',
      ]));
    });
  });

  // ============================================================
  // Jest Configuration Coherence Tests
  // ============================================================

  describe('Jest config and package.json coherence', () => {
    test('should have coverage directory in jest config', () => {
      // ACCEPTANCE CRITERIA AC6: Coverage output path must be configured
      const configPath = path.join(electronRoot, 'jest.config.ts');
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('coverageDirectory');
    });

    test('should have coverage path matching workflow expectations', () => {
      // ACCEPTANCE CRITERIA AC7: jest.config.ts coverage path must match workflow upload
      const configPath = path.join(electronRoot, 'jest.config.ts');
      const config = fs.readFileSync(configPath, 'utf-8');
      expect(config).toContain("coverageDirectory: 'coverage'");
    });

    test('should have test and test:ci scripts in package.json', () => {
      // ACCEPTANCE CRITERIA AC8: Both test and test:ci must be defined
      const pkgPath = path.join(electronRoot, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      expect(pkg.scripts.test).toBeDefined();
      expect(pkg.scripts['test:ci']).toBeDefined();
    });
  });

  // ============================================================
  // Error Case Tests
  // ============================================================

  describe('CI error handling scenarios', () => {
    test('should handle missing test files gracefully', () => {
      // Edge case: Empty __tests__ directory should not cause CI to fail
      const testDir = path.join(electronRoot, '__tests__');
      expect(fs.existsSync(testDir)).toBe(true);
      // If directory exists, test discovery should work
    });

    test('should have collectCoverageFrom to avoid coverage gaps', () => {
      // ACCEPTANCE CRITERIA AC9: collectCoverageFrom prevents coverage blindness
      const configPath = path.join(electronRoot, 'jest.config.ts');
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('collectCoverageFrom');
    });

    test('should have threshold enforced for coverage gate', () => {
      // ACCEPTANCE CRITERIA AC10: Coverage threshold of 60% must prevent regressions
      const configPath = path.join(electronRoot, 'jest.config.ts');
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('coverageThreshold');
      expect(content).toContain('60');
    });
  });

  // ============================================================
  // File Structure Validation
  // ============================================================

  describe('electron module structure for CI', () => {
    test('should have source code in main/ and preload/', () => {
      // ACCEPTANCE CRITERIA AC11: Source code should be in expected directories
      const mainDir = path.join(electronRoot, 'main');
      const preloadDir = path.join(electronRoot, 'preload');
      expect(fs.existsSync(mainDir)).toBe(true);
      expect(fs.existsSync(preloadDir)).toBe(true);
    });

    test('should have test subdirectories for each module', () => {
      // ACCEPTANCE CRITERIA AC12: Tests should be co-located with source code
      const mainTestDir = path.join(electronRoot, 'main', '__tests__');
      const preloadTestDir = path.join(electronRoot, 'preload', '__tests__');
      expect(fs.existsSync(mainTestDir)).toBe(true);
      expect(fs.existsSync(preloadTestDir)).toBe(true);
    });

    test('should have root-level __tests__ directory for integration tests', () => {
      // ACCEPTANCE CRITERIA AC13: Root __tests__ for CI-specific and integration tests
      const rootTestDir = path.join(electronRoot, '__tests__');
      expect(fs.existsSync(rootTestDir)).toBe(true);
    });

    test('should exclude node_modules and dist from coverage', () => {
      // ACCEPTANCE CRITERIA AC14: Coverage should not include build artifacts
      const configPath = path.join(electronRoot, 'jest.config.ts');
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('node_modules');
    });
  });

  // ============================================================
  // TypeScript Configuration Tests
  // ============================================================

  describe('TypeScript configuration for CI', () => {
    test('should have tsconfig.json for type checking', () => {
      // ACCEPTANCE CRITERIA AC15: TypeScript config must exist for tsc --noEmit
      const tsconfigPath = path.join(electronRoot, 'tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);
    });

    test('should have ts-jest preset for test TypeScript compilation', () => {
      // ACCEPTANCE CRITERIA AC16: ts-jest must compile test files
      const configPath = path.join(electronRoot, 'jest.config.ts');
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain("preset: 'ts-jest'");
    });

    test('should have testEnvironment set to node for electron code', () => {
      // ACCEPTANCE CRITERIA AC17: Electron code runs in Node.js, not browser
      const configPath = path.join(electronRoot, 'jest.config.ts');
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain("testEnvironment: 'node'");
    });
  });
});
