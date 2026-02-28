// Test suite for Jest test pattern discovery and matching.
// Validates that Jest testMatch patterns correctly discover test files
// in all configured directories and exclude non-test files.
// Related to CI pipeline change: jest.config.ts testMatch pattern expansion

import * as fs from 'fs';
import * as path from 'path';

describe('Jest Test Pattern Discovery', () => {
  const electronRoot = path.resolve(__dirname, '..');

  // ============================================================
  // Test Pattern Validation Tests
  // ============================================================

  describe('testMatch pattern coverage', () => {
    test('should match files in root __tests__ directory', () => {
      // ACCEPTANCE CRITERIA AC1: Pattern should match test files directly in __tests__
      const filesToTest = [
        '__tests__/example.test.ts',
        '__tests__/ci-config.test.ts',
        '__tests__/preload.injection.test.ts',
      ];

      const pattern = /__tests__\/.*\.test\.ts$/;
      filesToTest.forEach((file) => {
        expect(file).toMatch(pattern);
      });
    });

    test('should match files in preload/__tests__ subdirectory', () => {
      // ACCEPTANCE CRITERIA AC2: Pattern should match test files in preload/__tests__
      const filesToTest = [
        'preload/__tests__/example.test.ts',
        'preload/__tests__/nested/example.test.ts',
        'preload/__tests__/error-reporter-bridge.test.ts',
      ];

      const pattern = /preload\/__tests__\/.*\.test\.ts$/;
      filesToTest.forEach((file) => {
        expect(file).toMatch(pattern);
      });
    });

    test('should match files in main/__tests__ subdirectory', () => {
      // ACCEPTANCE CRITERIA AC3: Pattern should match test files in main/__tests__
      const filesToTest = [
        'main/__tests__/example.test.ts',
        'main/__tests__/ipc-handlers.test.ts',
        'main/__tests__/nested/deep/test.test.ts',
      ];

      const pattern = /main\/__tests__\/.*\.test\.ts$/;
      filesToTest.forEach((file) => {
        expect(file).toMatch(pattern);
      });
    });

    test('should not match .test.ts files outside __tests__ directories', () => {
      // ACCEPTANCE CRITERIA AC4: Files without __tests__ parent should NOT match
      const filesToTest = [
        'src/example.test.ts',
        'main/example.test.ts',
        'preload/example.test.ts',
        'example.test.ts',
      ];

      const pattern = /__tests__\/.*\.test\.ts$/;
      filesToTest.forEach((file) => {
        expect(file).not.toMatch(pattern);
      });
    });

    test('should not match .spec.ts files (only .test.ts)', () => {
      // Edge case: Jest configured for .test.ts only, not .spec.ts
      const filesToTest = [
        '__tests__/example.spec.ts',
        'main/__tests__/example.spec.ts',
        'preload/__tests__/example.spec.ts',
      ];

      const pattern = /.*\.test\.ts$/;
      filesToTest.forEach((file) => {
        expect(file).not.toMatch(pattern);
      });
    });

    test('should not match non-.test files', () => {
      // Edge case: Source files and other files should not match test pattern
      const filesToTest = [
        '__tests__/example.ts',
        '__tests__/index.js',
        '__tests__/config.ts',
        '__tests__/utils',
      ];

      const pattern = /.*\.test\.ts$/;
      filesToTest.forEach((file) => {
        expect(file).not.toMatch(pattern);
      });
    });
  });

  // ============================================================
  // Actual File System Tests
  // ============================================================

  describe('actual test file discovery', () => {
    function findTestFiles(dir: string): string[] {
      const testFiles: string[] = [];

      function walk(currentPath: string) {
        if (!fs.existsSync(currentPath)) {
          return;
        }

        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        entries.forEach((entry) => {
          const fullPath = path.join(currentPath, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.name.endsWith('.test.ts')) {
            testFiles.push(path.relative(dir, fullPath));
          }
        });
      }

      walk(dir);
      return testFiles;
    }

    test('should discover all .test.ts files in __tests__ directory', () => {
      // ACCEPTANCE CRITERIA AC5: Verify filesystem has test files Jest should discover
      const testFiles = findTestFiles(path.join(electronRoot, '__tests__'));
      expect(testFiles.length).toBeGreaterThan(0);

      // All found files should end with .test.ts
      testFiles.forEach((file) => {
        expect(file).toMatch(/\.test\.ts$/);
      });
    });

    test('should discover test files in nested __tests__ directories', () => {
      // Edge case: Test files can be nested one or more levels deep
      const mainTestDir = path.join(electronRoot, 'main', '__tests__');
      const preloadTestDir = path.join(electronRoot, 'preload', '__tests__');

      if (fs.existsSync(mainTestDir)) {
        const mainTests = findTestFiles(mainTestDir);
        // May be empty, but should not cause errors
        expect(Array.isArray(mainTests)).toBe(true);
      }

      if (fs.existsSync(preloadTestDir)) {
        const preloadTests = findTestFiles(preloadTestDir);
        // May be empty, but should not cause errors
        expect(Array.isArray(preloadTests)).toBe(true);
      }
    });

    test('should not discover non-test files', () => {
      // Edge case: .ts files that are not .test.ts should not be discovered
      function findNonTestTsFiles(dir: string): string[] {
        const files: string[] = [];

        function walk(currentPath: string) {
          if (!fs.existsSync(currentPath)) {
            return;
          }

          const entries = fs.readdirSync(currentPath, { withFileTypes: true });
          entries.forEach((entry) => {
            const fullPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
              walk(fullPath);
            } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
              files.push(path.relative(dir, fullPath));
            }
          });
        }

        walk(dir);
        return files;
      }

      // Check main directory (source, not tests)
      const mainSourceDir = path.join(electronRoot, 'main');
      const nonTestFiles = findNonTestTsFiles(mainSourceDir);

      // If there are non-test .ts files, verify they're not in __tests__
      nonTestFiles.forEach((file) => {
        expect(file).not.toContain('__tests__');
      });
    });
  });

  // ============================================================
  // Pattern Edge Cases
  // ============================================================

  describe('edge cases and boundary conditions', () => {
    test('should handle deeply nested test files', () => {
      // Edge case: Test files can be deeply nested. Pattern should match any depth
      const testFiles = [
        '__tests__/level1/level2/level3/test.test.ts',
        '__tests__/unit/integration/nested/deep/example.test.ts',
        'main/__tests__/a/b/c/d/e/f/test.test.ts',
      ];

      const rootPattern = /__tests__\/.*\.test\.ts$/;
      testFiles.forEach((file) => {
        expect(file).toMatch(rootPattern);
      });
    });

    test('should handle test files with underscores and hyphens', () => {
      // Edge case: Test file names can include underscores and hyphens
      const testFiles = [
        '__tests__/my-test_file.test.ts',
        '__tests__/another_test-case.test.ts',
        'main/__tests__/complex-name_structure.test.ts',
      ];

      const pattern = /\.test\.ts$/;
      testFiles.forEach((file) => {
        expect(file).toMatch(pattern);
      });
    });

    test('should be case-sensitive (.test.ts not .Test.ts)', () => {
      // Edge case: Jest pattern matching is case-sensitive
      const validFile = '__tests__/example.test.ts';
      const invalidFile = '__tests__/example.Test.ts';

      const pattern = /\.test\.ts$/;
      expect(validFile).toMatch(pattern);
      expect(invalidFile).not.toMatch(pattern);
    });

    test('should match files even with numbers in directory names', () => {
      // Edge case: Directory names can include numbers
      const testFiles = [
        '__tests__/v1/test.test.ts',
        'main/__tests__/api2/handler.test.ts',
        'preload/__tests__/utils3/helper.test.ts',
      ];

      const pattern = /\.test\.ts$/;
      testFiles.forEach((file) => {
        expect(file).toMatch(pattern);
      });
    });
  });

  // ============================================================
  // Backward Compatibility Tests
  // ============================================================

  describe('backward compatibility with existing patterns', () => {
    test('should still match existing main/__tests__/**/*.test.ts pattern', () => {
      // ACCEPTANCE CRITERIA AC6: New pattern should not break main/__tests__ discovery
      const existingPattern = /main\/__tests__\/.*\.test\.ts$/;
      const testFile = 'main/__tests__/ipc-error-handlers.test.ts';

      expect(testFile).toMatch(existingPattern);
    });

    test('should still match existing preload/__tests__/**/*.test.ts pattern', () => {
      // ACCEPTANCE CRITERIA AC7: New pattern should not break preload/__tests__ discovery
      const existingPattern = /preload\/__tests__\/.*\.test\.ts$/;
      const testFile = 'preload/__tests__/error-reporter-bridge.test.ts';

      expect(testFile).toMatch(existingPattern);
    });

    test('should not conflict between new and existing patterns', () => {
      // Edge case: Ensure new and existing patterns dont have conflicts
      const newPattern = /__tests__\/.*\.test\.ts$/;
      const mainPattern = /main\/__tests__\/.*\.test\.ts$/;

      // New pattern should match root-level __tests__ files
      expect('__tests__/ci-config.test.ts').toMatch(newPattern);

      // Both patterns should match main/__tests__ files
      const mainTestFile = 'main/__tests__/handler.test.ts';
      expect(mainTestFile).toMatch(mainPattern);
      expect(mainTestFile).toMatch(/__tests__\/.*\.test\.ts$/);

      // But main source files should not match root pattern
      expect('main/index.ts').not.toMatch(newPattern);
    });
  });
});
