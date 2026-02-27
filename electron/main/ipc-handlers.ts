import { ipcMain, Notification } from 'electron';
import log from 'electron-log';
import { writeEnvFile, WizardConfig } from './env-manager';
import { markSetupComplete, getAppDataPath } from './paths';

// ---------------------------------------------------------------------------
// Error forwarding — best-effort POST to Flask error ingestion endpoint.
// Silently no-ops when Flask is not yet running (e.g. during the wizard).
// ---------------------------------------------------------------------------

const _FLASK_PORT = process.env.FLASK_PORT ?? '5000';
const _ERROR_ENDPOINT = `http://localhost:${_FLASK_PORT}/api/errors`;

interface RendererErrorPayload {
  type?: string;
  message: string;
  stack?: string;
  timestamp?: string;
  session_id?: string;
  severity?: string;
}

async function _reportToFlask(message: string, stack?: string): Promise<void> {
  try {
    await fetch(_ERROR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'unhandled_exception',
        message,
        stack,
        source: 'electron',
        timestamp: new Date().toISOString(),
        session_id: 'electron-main',
        severity: 'error',
      }),
    });
  } catch {
    // Flask may not be running yet; swallow silently
  }
}

export function registerIpcHandlers(): void {
  /**
   * Test an AI provider API key directly (backend not running during wizard).
   */
  ipcMain.handle(
    'wizard:test-ai-provider',
    async (
      _event,
      args: { provider: string; api_key: string }
    ): Promise<{ success: boolean; error?: string }> => {
      return testProviderDirect(args.provider, args.api_key);
    }
  );

  /**
   * Save wizard configuration to .env and mark setup complete.
   */
  ipcMain.handle(
    'wizard:save-config',
    async (_event, config: WizardConfig): Promise<{ success: boolean; error?: string }> => {
      try {
        writeEnvFile(config);
        markSetupComplete();
        log.info('Wizard configuration saved');
        return { success: true };
      } catch (err) {
        log.error('Failed to save wizard config:', err);
        const errObj = err instanceof Error ? err : undefined;
        await _reportToFlask(`wizard:save-config failed: ${String(err)}`, errObj?.stack);
        return { success: false, error: String(err) };
      }
    }
  );

  /**
   * Return the app data path for display in wizard.
   */
  ipcMain.handle('wizard:get-appdata-path', async () => {
    return getAppDataPath();
  });

  /**
   * Show a native OS desktop notification for a price alert.
   * Called from the renderer via window.tickerpulse.showNotification().
   */
  ipcMain.handle(
    'alerts:notify',
    (_event, { title, body }: { title: string; body: string }): void => {
      try {
        new Notification({ title, body, silent: false }).show();
        log.info(`Alert notification shown: ${title}`);
      } catch (err) {
        log.warn('Failed to show alert notification:', err);
        const errObj = err instanceof Error ? err : undefined;
        void _reportToFlask(`alerts:notify failed: ${String(err)}`, errObj?.stack);
      }
    }
  );

  /**
   * Forward an error from the Electron renderer process to the Flask error
   * ingestion endpoint.  The renderer calls this via
   * window.__electronErrorReporter.reportError(payload).
   *
   * Errors are tagged with source='electron' so operators can filter them
   * separately from frontend (browser) and backend (Python) errors.
   */
  ipcMain.handle(
    'errors:report',
    async (_event, payload: RendererErrorPayload): Promise<void> => {
      try {
        await fetch(_ERROR_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: payload.type ?? 'unhandled_exception',
            message: payload.message,
            stack: payload.stack,
            source: 'electron',
            timestamp: payload.timestamp ?? new Date().toISOString(),
            session_id: payload.session_id ?? 'electron-renderer',
            severity: payload.severity ?? 'error',
          }),
        });
      } catch {
        // Flask may not be running yet; swallow silently
      }
    }
  );
}

/**
 * Test an AI provider's API key with a lightweight request.
 */
async function testProviderDirect(
  provider: string,
  apiKey: string
): Promise<{ success: boolean; error?: string }> {
  if (!apiKey || apiKey.trim().length === 0) {
    return { success: false, error: 'API key is empty' };
  }

  const tests: Record<string, () => Promise<Response>> = {
    anthropic: () =>
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }],
        }),
      }),
    openai: () =>
      fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    google: () =>
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      ),
    xai: () =>
      fetch('https://api.x.ai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
  };

  const testFn = tests[provider];
  if (!testFn) {
    return { success: false, error: `Unknown provider: ${provider}` };
  }

  try {
    const result = await testFn();
    if (result.ok) {
      return { success: true };
    }
    if (result.status === 401 || result.status === 403) {
      return { success: false, error: 'Invalid API key' };
    }
    return { success: false, error: `HTTP ${result.status}` };
  } catch (err) {
    return { success: false, error: `Connection failed: ${String(err)}` };
  }
}