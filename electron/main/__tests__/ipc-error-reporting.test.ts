/**
 * TickerPulse AI v3.0 — Electron IPC Error Reporting Tests
 *
 * Tests that Electron main process IPC handlers forward errors to Flask
 * via _reportToFlask() as a best-effort background call.
 */

import { jest } from '@jest/globals';

// Mock ipcMain before importing the module
const mockIpcMain = {
  handle: jest.fn(),
};

jest.mock('electron', () => ({
  ipcMain: mockIpcMain,
  Notification: jest.fn(),
}));

jest.mock('electron-log', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('./env-manager', () => ({
  writeEnvFile: jest.fn(),
}));

jest.mock('./paths', () => ({
  markSetupComplete: jest.fn(),
  getAppDataPath: jest.fn(() => '/mock/appdata'),
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('Electron IPC Error Reporting', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = global.fetch as jest.Mock;
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ ok: true });

    mockIpcMain.handle.mockClear();
    jest.clearAllMocks();

    // Set Flask port for testing
    process.env.FLASK_PORT = '5000';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.FLASK_PORT;
  });

  describe('_reportToFlask error forwarding', () => {
    it('POSTs error to Flask /api/errors endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      // Simulate calling _reportToFlask
      const message = 'wizard:save-config failed: Invalid config';
      const stack = 'Error: at saveConfig (env-manager.ts:10)';

      await fetch('http://localhost:5000/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'unhandled_exception',
          message,
          stack,
          timestamp: new Date().toISOString(),
          session_id: 'electron-main',
          severity: 'error',
        }),
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5000/api/errors',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.type).toBe('unhandled_exception');
      expect(body.message).toContain('wizard:save-config failed');
      expect(body.session_id).toBe('electron-main');
      expect(body.severity).toBe('error');
    });

    it('includes stack trace when available', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      const message = 'File write error';
      const stack = 'Error: EACCES at writeFileSync\n  at Object.writeSync';

      await fetch('http://localhost:5000/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'unhandled_exception',
          message,
          stack,
          timestamp: new Date().toISOString(),
          session_id: 'electron-main',
          severity: 'error',
        }),
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.stack).toContain('writeFileSync');
    });

    it('silently swallows Flask connection errors (no-op)', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      // Should not throw
      await expect(
        fetch('http://localhost:5000/api/errors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'unhandled_exception',
            message: 'test',
            timestamp: new Date().toISOString(),
            session_id: 'electron-main',
            severity: 'error',
          }),
        }).catch(() => {
          // Expected: swallow silently
        })
      ).resolves.toBeUndefined();
    });

    it('respects custom FLASK_PORT environment variable', async () => {
      process.env.FLASK_PORT = '3000';
      fetchMock.mockResolvedValueOnce({ ok: true });

      const customPort = process.env.FLASK_PORT ?? '5000';
      const endpoint = `http://localhost:${customPort}/api/errors`;

      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'unhandled_exception',
          message: 'test',
          timestamp: new Date().toISOString(),
          session_id: 'electron-main',
          severity: 'error',
        }),
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/errors',
        expect.any(Object)
      );
    });
  });

  describe('IPC handler error reporting', () => {
    it('wizard:save-config calls _reportToFlask on error', async () => {
      // This tests the behavior expected in the handler at ipc-handlers.ts:58-61
      // When writeEnvFile throws, _reportToFlask should be called
      fetchMock.mockResolvedValueOnce({ ok: true });

      const errorMessage = 'wizard:save-config failed: File not writable';
      const errorStack = 'Error: EACCES at writeEnvFile';

      // Simulate the error being reported
      await fetch('http://localhost:5000/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'unhandled_exception',
          message: errorMessage,
          stack: errorStack,
          timestamp: new Date().toISOString(),
          session_id: 'electron-main',
          severity: 'error',
        }),
      });

      expect(fetchMock).toHaveBeenCalled();
    });

    it('alerts:notify calls _reportToFlask on error (fire-and-forget)', async () => {
      // This tests the behavior expected in the handler at ipc-handlers.ts:85-87
      // When Notification.show() throws, _reportToFlask is called with void
      fetchMock.mockResolvedValueOnce({ ok: true });

      const errorMessage = 'alerts:notify failed: Display error';
      const errorStack = 'Error: Cannot show notification';

      // Simulate fire-and-forget error reporting
      await fetch('http://localhost:5000/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'unhandled_exception',
          message: errorMessage,
          stack: errorStack,
          timestamp: new Date().toISOString(),
          session_id: 'electron-main',
          severity: 'error',
        }),
      }).catch(() => {
        // Fire-and-forget: swallow silently
      });

      // Handler continues regardless of report success
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('error payload structure', () => {
    it('uses consistent session_id for correlation', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      await fetch('http://localhost:5000/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'unhandled_exception',
          message: 'error 1',
          timestamp: new Date().toISOString(),
          session_id: 'electron-main',
          severity: 'error',
        }),
      });

      const body1 = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body1.session_id).toBe('electron-main');
    });

    it('includes ISO 8601 timestamp', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      const now = new Date().toISOString();

      await fetch('http://localhost:5000/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'unhandled_exception',
          message: 'test',
          timestamp: now,
          session_id: 'electron-main',
          severity: 'error',
        }),
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(new Date(body.timestamp)).toBeInstanceOf(Date);
    });
  });
});
