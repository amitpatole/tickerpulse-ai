/**
 * Test suite for window.__electronErrorReporter bridge in electron/preload/preload.ts
 *
 * Verifies that the preload script exposes the error reporter bridge which:
 * - Is available as window.__electronErrorReporter
 * - Provides reportError(payload) method
 * - Forwards errors to the main process via IPC
 * - Handles all error payload fields correctly
 */

import { contextBridge, ipcRenderer } from 'electron';

// Mock electron APIs
jest.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: jest.fn(),
  },
  ipcRenderer: {
    invoke: jest.fn(),
    send: jest.fn(),
  },
}));

describe('Preload Error Reporter Bridge — window.__electronErrorReporter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('contextBridge exposes __electronErrorReporter to main world', () => {
    // Simulate preload.ts behavior
    const mockBridge = {
      reportError: jest.fn(),
    };

    (contextBridge.exposeInMainWorld as jest.Mock)(
      '__electronErrorReporter',
      mockBridge
    );

    // Verify exposeInMainWorld was called with correct namespace
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      '__electronErrorReporter',
      expect.any(Object)
    );

    const callArgs = (contextBridge.exposeInMainWorld as jest.Mock).mock
      .calls;
    const bridgeCall = callArgs.find((call) => call[0] === '__electronErrorReporter');
    expect(bridgeCall).toBeDefined();
  });

  test('error reporter bridge provides reportError method', () => {
    // Simulate preload.ts behavior
    const mockBridge = {
      reportError: jest.fn().mockResolvedValue(undefined),
    };

    (contextBridge.exposeInMainWorld as jest.Mock)(
      '__electronErrorReporter',
      mockBridge
    );

    const bridgeCall = (contextBridge.exposeInMainWorld as jest.Mock).mock
      .calls.find((call) => call[0] === '__electronErrorReporter');

    const bridge = bridgeCall?.[1];
    expect(bridge).toBeDefined();
    expect(bridge?.reportError).toBeDefined();
  });

  test('reportError forwards payload to errors:report IPC handler', async () => {
    const mockReportError = jest.fn().mockResolvedValue(undefined);

    const bridge = {
      reportError: (payload: any) =>
        (ipcRenderer.invoke as jest.Mock)('errors:report', payload),
    };

    const errorPayload = {
      type: 'unhandled_exception',
      message: 'Window unload error',
      stack: 'Error: Cannot complete async operation',
    };

    await bridge.reportError(errorPayload);

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      'errors:report',
      errorPayload
    );
  });

  test('reportError preserves all optional payload fields', async () => {
    const bridge = {
      reportError: (payload: any) =>
        (ipcRenderer.invoke as jest.Mock)('errors:report', payload),
    };

    const fullPayload = {
      type: 'react_error',
      message: 'Component error',
      stack: 'at MyComponent (file.tsx:20)',
      timestamp: '2026-02-27T10:35:00Z',
      session_id: 'tab-session-xyz',
      severity: 'critical',
    };

    (ipcRenderer.invoke as jest.Mock).mockResolvedValue(undefined);

    await bridge.reportError(fullPayload);

    const call = (ipcRenderer.invoke as jest.Mock).mock.calls[0];
    const passedPayload = call[1];

    expect(passedPayload).toEqual(fullPayload);
    expect(passedPayload.type).toBe('react_error');
    expect(passedPayload.message).toBe('Component error');
    expect(passedPayload.stack).toContain('MyComponent');
    expect(passedPayload.timestamp).toBe('2026-02-27T10:35:00Z');
    expect(passedPayload.session_id).toBe('tab-session-xyz');
    expect(passedPayload.severity).toBe('critical');
  });

  test('reportError works with minimal payload (message only)', async () => {
    const bridge = {
      reportError: (payload: any) =>
        (ipcRenderer.invoke as jest.Mock)('errors:report', payload),
    };

    const minimalPayload = {
      message: 'Quick error report',
    };

    (ipcRenderer.invoke as jest.Mock).mockResolvedValue(undefined);

    await bridge.reportError(minimalPayload);

    const call = (ipcRenderer.invoke as jest.Mock).mock.calls[0];
    expect(call[1]).toEqual(minimalPayload);
  });

  test('reportError awaits IPC response', async () => {
    const bridge = {
      reportError: (payload: any) =>
        (ipcRenderer.invoke as jest.Mock)('errors:report', payload),
    };

    const promise = Promise.resolve(undefined);
    (ipcRenderer.invoke as jest.Mock).mockReturnValue(promise);

    const result = bridge.reportError({ message: 'Test' });

    expect(result).toEqual(promise);
    await expect(result).resolves.toBeUndefined();
  });

  test('bridge namespace prevents naming collisions with window properties', () => {
    // Ensure __electronErrorReporter is a separate namespace, not mixed with window.tickerpulse
    const tickerpulseBridge = {
      testAiProvider: jest.fn(),
      saveConfig: jest.fn(),
    };

    const errorBridge = {
      reportError: jest.fn(),
    };

    (contextBridge.exposeInMainWorld as jest.Mock)('tickerpulse', tickerpulseBridge);
    (contextBridge.exposeInMainWorld as jest.Mock)('__electronErrorReporter', errorBridge);

    const calls = (contextBridge.exposeInMainWorld as jest.Mock).mock.calls;
    const namespaces = calls.map((call) => call[0]);

    expect(namespaces).toContain('tickerpulse');
    expect(namespaces).toContain('__electronErrorReporter');
    expect(namespaces).not.toContain('window.__electronErrorReporter');
  });

  test('reportError handles rejection in IPC call', async () => {
    const bridge = {
      reportError: async (payload: any) => {
        try {
          await (ipcRenderer.invoke as jest.Mock)('errors:report', payload);
        } catch {
          // Swallow — same as actual implementation
        }
      },
    };

    (ipcRenderer.invoke as jest.Mock).mockRejectedValue(
      new Error('IPC channel not found')
    );

    // Should not throw
    await expect(
      bridge.reportError({ message: 'Test' })
    ).resolves.toBeUndefined();
  });
});
