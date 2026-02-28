```ts
/**
 * IPC + Preload API smoke test
 *
 * Validates the channel registry shape and preload bridge API surface.
 * Detailed per-channel behaviour tests live in main/__tests__/ and
 * preload/__tests__/.  This smoke test focuses on the cross-cutting
 * contract: all expected IPC channels are registered, and both preload
 * bridges expose the right methods.
 */

import { ipcMain, contextBridge } from 'electron';
import { registerIpcHandlers } from '../../main/ipc-handlers';

jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn() },
  Notification: jest.fn(),
  contextBridge: { exposeInMainWorld: jest.fn() },
  ipcRenderer: { invoke: jest.fn(), send: jest.fn() },
}));

jest.mock('electron-log', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../main/env-manager', () => ({
  writeEnvFile: jest.fn(),
}));

jest.mock('../../main/paths', () => ({
  markSetupComplete: jest.fn(),
  getAppDataPath: jest.fn(() => '/mock/appdata'),
}));

global.fetch = jest.fn();

// ---------------------------------------------------------------------------
// Channel registry
// ---------------------------------------------------------------------------

const EXPECTED_IPC_CHANNELS = [
  'wizard:test-ai-provider',
  'wizard:save-config',
  'wizard:get-appdata-path',
  'alerts:notify',
  'errors:report',
] as const;

describe('IPC handler channel registry', () => {
  beforeAll(() => {
    registerIpcHandlers();
  });

  test.each(EXPECTED_IPC_CHANNELS)('channel "%s" is registered', (channel) => {
    const registered = (ipcMain.handle as jest.Mock).mock.calls.map((c) => c[0]);
    expect(registered).toContain(channel);
  });

  test('no unexpected channels are registered', () => {
    const registered = (ipcMain.handle as jest.Mock).mock.calls.map((c) => c[0]);
    expect(new Set(registered)).toEqual(new Set(EXPECTED_IPC_CHANNELS));
  });
});

// ---------------------------------------------------------------------------
// Preload bridge API shape
// ---------------------------------------------------------------------------

describe('preload bridge API shape', () => {
  beforeAll(() => {
    jest.clearAllMocks();
    // Execute preload.ts so contextBridge.exposeInMainWorld is called.
    // Using require() here ensures the module-level side effects run after
    // jest.mock() has installed its intercepts.
    require('../../preload/preload');
  });

  test('window.tickerpulse namespace is exposed', () => {
    const namespaces = (contextBridge.exposeInMainWorld as jest.Mock).mock.calls.map(
      (c) => c[0],
    );
    expect(namespaces).toContain('tickerpulse');
  });

  test('window.__electronErrorReporter namespace is exposed', () => {
    const namespaces = (contextBridge.exposeInMainWorld as jest.Mock).mock.calls.map(
      (c) => c[0],
    );
    expect(namespaces).toContain('__electronErrorReporter');
  });

  test('window.tickerpulse exposes showNotification method', () => {
    const calls = (contextBridge.exposeInMainWorld as jest.Mock).mock.calls;
    const tp = calls.find((c) => c[0] === 'tickerpulse');
    expect(tp).toBeDefined();
    expect(typeof tp?.[1]?.showNotification).toBe('function');
  });

  test('window.__electronErrorReporter exposes reportError method', () => {
    const calls = (contextBridge.exposeInMainWorld as jest.Mock).mock.calls;
    const reporter = calls.find((c) => c[0] === '__electronErrorReporter');
    expect(reporter).toBeDefined();
    expect(typeof reporter?.[1]?.reportError).toBe('function');
  });

  test('exactly two contextBridge namespaces are registered', () => {
    const namespaces = (contextBridge.exposeInMainWorld as jest.Mock).mock.calls.map(
      (c) => c[0],
    );
    expect(namespaces).toHaveLength(2);
  });
});
```