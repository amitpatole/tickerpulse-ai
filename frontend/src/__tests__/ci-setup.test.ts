/**
 * Tests validating CI/CD frontend setup and Jest configuration.
 * Ensures test infrastructure is ready before tests run in CI.
 */
import fs from 'fs';
import path from 'path';

describe('Frontend CI/CD Setup', () => {
  const projectRoot = path.resolve(__dirname, '../../../');

  describe('Test Scripts Configuration', () => {
    it('should have test and test:ci scripts in package.json', () => {
      const packageJsonPath = path.join(projectRoot, 'frontend/package.json');
      const content = fs.readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      expect(packageJson.scripts).toBeDefined();
      expect(packageJson.scripts.test).toBeDefined();
      expect(packageJson.scripts['test:ci']).toBeDefined();
      expect(packageJson.scripts.test).toContain('jest');
      expect(packageJson.scripts['test:ci']).toContain('jest');
    });

    it('should have jest with proper CI flags in test:ci script', () => {
      const packageJsonPath = path.join(projectRoot, 'frontend/package.json');
      const content = fs.readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      const testCiScript = packageJson.scripts['test:ci'];
      expect(testCiScript).toContain('--ci');
      expect(testCiScript).toContain('--coverage');
    });
  });

  describe('Jest and Testing Library Dependencies', () => {
    it('should have jest and jest-environment-jsdom as devDependencies', () => {
      const packageJsonPath = path.join(projectRoot, 'frontend/package.json');
      const content = fs.readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      expect(packageJson.devDependencies).toBeDefined();
      expect(packageJson.devDependencies.jest).toBeDefined();
      expect(packageJson.devDependencies['jest-environment-jsdom']).toBeDefined();
    });

    it('should have @testing-library packages for React component testing', () => {
      const packageJsonPath = path.join(projectRoot, 'frontend/package.json');
      const content = fs.readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      const devDeps = packageJson.devDependencies;
      expect(devDeps['@testing-library/react']).toBeDefined();
      expect(devDeps['@testing-library/jest-dom']).toBeDefined();
      expect(devDeps['@testing-library/user-event']).toBeDefined();
    });

    it('should have @types/jest for TypeScript test support', () => {
      const packageJsonPath = path.join(projectRoot, 'frontend/package.json');
      const content = fs.readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      expect(packageJson.devDependencies['@types/jest']).toBeDefined();
    });
  });

  describe('GitHub Workflows Configuration', () => {
    it('should have ci.yml workflow with required jobs', () => {
      const ciWorkflowPath = path.join(projectRoot, '.github/workflows/ci.yml');
      expect(fs.existsSync(ciWorkflowPath)).toBe(true);

      const content = fs.readFileSync(ciWorkflowPath, 'utf-8');
      // Match the actual job IDs defined in ci.yml
      expect(content).toContain('backend-test');
      expect(content).toContain('frontend-test');
    });

    it('should have deploy.yml workflow with build-and-push job', () => {
      const deployWorkflowPath = path.join(projectRoot, '.github/workflows/deploy.yml');
      expect(fs.existsSync(deployWorkflowPath)).toBe(true);

      const content = fs.readFileSync(deployWorkflowPath, 'utf-8');
      expect(content).toContain('build-and-push');
    });
  });

  describe('Pull Request Template', () => {
    it('should have pull_request_template.md in .github', () => {
      const prTemplatePath = path.join(projectRoot, '.github/pull_request_template.md');
      expect(fs.existsSync(prTemplatePath)).toBe(true);

      const content = fs.readFileSync(prTemplatePath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    });
  });
});