/**
 * Test suite for errors:report IPC handler in electron/main/ipc-handlers.ts
 *
 * Verifies that the main process correctly:
 * - Registers the errors:report IPC handler
 * - Forwards renderer errors to Flask /api/errors endpoint
 * - Tags errors with source='electron'
 * - Handles network failures gracefully (silent fail when Flask is down)
 */

import { ipcMain } from 'electron';
import { registerIpcHandlers } from '../ipc-handlers';

// Mock fetch globally
global.fetch = jest.fn();

// Mock electron-log
jest.mock('electron-log', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

// Mock env-manager and paths
jest.mock('../env-manager', () => ({
  writeEnvFile: jest.fn(),
  testProviderDirect: jest.fn(),
}));

jest.mock('../paths', () => ({
  markSetupComplete: jest.fn(),
  getAppDataPath: jest.fn(),
}));

describe('IPC Error Handlers — errors:report', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  test('registerIpcHandlers registers errors:report handler', () => {
    registerIpcHandlers();

    // Verify ipcMain.handle was called with 'errors:report'
    const handlers = (ipcMain.handle as jest.Mock).mock.calls
      .map((call) => call[0]);

    expect(handlers).toContain('errors:report');
  });

  test('errors:report handler forwards error to Flask with source=electron', async () => {
    registerIpcHandlers();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 201,
    });

    // Get the errors:report handler
    const handlerCall = (ipcMain.handle as jest.Mock).mock.calls.find(
      (call) => call[0] === 'errors:report'
    );
    const handler = handlerCall?.[1];

    expect(handler).toBeDefined();

    const errorPayload = {
      type: 'unhandled_exception',
      message: 'Renderer process crashed',
      stack: 'Error: Cannot read properties of undefined\n  at func (file.ts:42)',
      severity: 'error',
    };

    const mockEvent = {}; // ipcMain event object (not used)

    // Invoke the handler
    await handler(mockEvent, errorPayload);

    // Verify fetch was called
    expect(global.fetch).toHaveBeenCalled();

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const [url, options] = fetchCall;

    // Verify endpoint
    expect(url).toContain('/api/errors');

    // Verify POST method and JSON content-type
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');

    // Verify body contains source='electron'
    const body = JSON.parse(options.body);
    expect(body.source).toBe('electron');
    expect(body.message).toBe('Renderer process crashed');
    expect(body.type).toBe('unhandled_exception');
  });

  test('errors:report includes all payload fields in Flask request', async () => {
    registerIpcHandlers();

    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    const handlerCall = (ipcMain.handle as jest.Mock).mock.calls.find(
      (call) => call[0] === 'errors:report'
    );
    const handler = handlerCall?.[1];

    const errorPayload = {
      type: 'react_error',
      message: 'Component render failed',
      stack: 'at AIPanel (components/AIPanel.tsx:50)',
      timestamp: '2026-02-27T10:30:00Z',
      session_id: 'sess-abc-123',
      severity: 'critical',
    };

    await handler({}, errorPayload);

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);

    // Verify all fields are preserved
    expect(body.type).toBe('react_error');
    expect(body.message).toBe('Component render failed');
    expect(body.stack).toBe('at AIPanel (components/AIPanel.tsx:50)');
    expect(body.timestamp).toBe('2026-02-27T10:30:00Z');
    expect(body.session_id).toBe('sess-abc-123');
    expect(body.severity).toBe('critical');
    expect(body.source).toBe('electron');
  });

  test('errors:report defaults session_id to electron-renderer if not provided', async () => {
    registerIpcHandlers();

    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    const handlerCall = (ipcMain.handle as jest.Mock).mock.calls.find(
      (call) => call[0] === 'errors:report'
    );
    const handler = handlerCall?.[1];

    const errorPayload = {
      message: 'Minimal error',
      // session_id not provided
    };

    await handler({}, errorPayload);

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);

    expect(body.session_id).toBe('electron-renderer');
  });

  test('errors:report silently fails if Flask is not running', async () => {
    registerIpcHandlers();

    (global.fetch as jest.Mock).mockRejectedValue(
      new Error('Connection refused — Flask not running')
    );

    const handlerCall = (ipcMain.handle as jest.Mock).mock.calls.find(
      (call) => call[0] === 'errors:report'
    );
    const handler = handlerCall?.[1];

    const errorPayload = {
      message: 'Test error',
    };

    // Should not throw even though fetch fails
    await expect(
      handler({}, errorPayload)
    ).resolves.toBeUndefined();

    // Verify fetch was attempted
    expect(global.fetch).toHaveBeenCalled();
  });

  test('errors:report handles network timeout gracefully', async () => {
    registerIpcHandlers();

    (global.fetch as jest.Mock).mockRejectedValue(
      new Error('Network timeout')
    );

    const handlerCall = (ipcMain.handle as jest.Mock).mock.calls.find(
      (call) => call[0] === 'errors:report'
    );
    const handler = handlerCall?.[1];

    // Should complete without throwing
    const promise = handler({}, { message: 'Test error' });
    await expect(promise).resolves.not.toThrow();
  });
});
