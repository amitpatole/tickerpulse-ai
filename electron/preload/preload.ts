import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('tickerpulse', {
  /**
   * Test an AI provider API key from the wizard.
   */
  testAiProvider: (args: { provider: string; api_key: string }) =>
    ipcRenderer.invoke('wizard:test-ai-provider', args),

  /**
   * Save all wizard configuration and mark setup as complete.
   */
  saveConfig: (config: any) => ipcRenderer.invoke('wizard:save-config', config),

  /**
   * Get the app data directory path (for display).
   */
  getAppDataPath: () => ipcRenderer.invoke('wizard:get-appdata-path'),

  /**
   * Signal that wizard is done and the app should start.
   */
  completeWizard: () => ipcRenderer.send('wizard:complete'),

  /**
   * Window controls for frameless window.
   */
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  /**
   * Show a native OS desktop notification for a triggered price alert.
   * Invoked by useSSEAlerts when an `alert` SSE event arrives.
   */
  showNotification: (ticker: string, message: string) =>
    ipcRenderer.invoke('alerts:notify', {
      title: `Alert: ${ticker}`,
      body: message,
    }),
});

/**
 * Separate bridge for error reporting so the renderer can forward errors
 * with source='electron' for operator-level filtering in the error log.
 *
 * Usage:
 *   window.__electronErrorReporter?.reportError({ message: '...', stack: '...' })
 */
contextBridge.exposeInMainWorld('__electronErrorReporter', {
  /**
   * Forward an error from the renderer process to Flask /api/errors.
   * The main process tags it with source='electron' before persisting.
   */
  reportError: (payload: {
    type?: string;
    message: string;
    stack?: string;
    timestamp?: string;
    session_id?: string;
    severity?: string;
  }) => ipcRenderer.invoke('errors:report', payload),
});