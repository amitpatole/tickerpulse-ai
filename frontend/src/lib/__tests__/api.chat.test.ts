/**
 * Test suite for Chat API client functions.
 *
 * Coverage:
 * - createChatSession() — POST /api/chat/sessions
 * - listChatSessions() — GET /api/chat/sessions
 * - deleteChatSession(sessionId) — DELETE /api/chat/sessions/:id
 * - sendSessionMessage(sessionId, message) — POST /api/chat/sessions/:id/message
 *
 * All follow the request<T> pattern with retry logic.
 */

import { ApiError, createChatSession, listChatSessions, deleteChatSession, sendSessionMessage } from '@/lib/api';
import { captureException } from '@/lib/errorReporter';

jest.mock('@/lib/errorReporter');
const mockCaptureException = captureException as jest.MockedFunction<typeof captureException>;

// Mock global fetch
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

describe('Chat API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  // ========================================================================
  // TEST: createChatSession()
  // ========================================================================

  it('creates a chat session without title', async () => {
    const mockResponse = {
      ok: true,
      text: async () =>
        JSON.stringify({
          session_id: 'sess-abc123',
          title: 'Chat Session',
          created_at: '2026-02-27T10:00:00Z',
        }),
    };

    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    const result = await createChatSession();

    expect(result.session_id).toBe('sess-abc123');
    expect(result.title).toBe('Chat Session');
    expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/api/chat/sessions`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('creates a chat session with custom title', async () => {
    const mockResponse = {
      ok: true,
      text: async () =>
        JSON.stringify({
          session_id: 'sess-def456',
          title: 'Market Analysis',
          created_at: '2026-02-27T10:00:00Z',
        }),
    };

    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    const result = await createChatSession('Market Analysis');

    expect(result.title).toBe('Market Analysis');
    expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/api/chat/sessions`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Market Analysis' }),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('handles HTTP errors in createChatSession', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: 'Server error' }),
    };

    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    await expect(createChatSession()).rejects.toThrow(ApiError);
    expect(mockCaptureException).toHaveBeenCalled();
  });

  // ========================================================================
  // TEST: listChatSessions()
  // ========================================================================

  it('lists all chat sessions', async () => {
    const mockResponse = {
      ok: true,
      text: async () =>
        JSON.stringify({
          sessions: [
            {
              session_id: 'sess-001',
              title: 'First Chat',
              message_count: 5,
              created_at: '2026-02-27T10:00:00Z',
              updated_at: '2026-02-27T10:30:00Z',
            },
            {
              session_id: 'sess-002',
              title: 'Second Chat',
              message_count: 3,
              created_at: '2026-02-27T11:00:00Z',
              updated_at: '2026-02-27T11:15:00Z',
            },
          ],
        }),
    };

    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    const sessions = await listChatSessions();

    expect(sessions).toHaveLength(2);
    expect(sessions[0].session_id).toBe('sess-001');
    expect(sessions[0].message_count).toBe(5);
    expect(sessions[1].title).toBe('Second Chat');
    expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/api/chat/sessions`, {
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('handles empty session list', async () => {
    const mockResponse = {
      ok: true,
      text: async () => JSON.stringify({ sessions: [] }),
    };

    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    const sessions = await listChatSessions();

    expect(sessions).toEqual([]);
  });

  it('handles missing sessions field gracefully', async () => {
    const mockResponse = {
      ok: true,
      text: async () => JSON.stringify({}),
    };

    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    const sessions = await listChatSessions();

    expect(sessions).toEqual([]);
  });

  it('handles HTTP error in listChatSessions', async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'Unauthorized' }),
    };

    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    await expect(listChatSessions()).rejects.toThrow(ApiError);
  });

  // ========================================================================
  // TEST: deleteChatSession()
  // ========================================================================

  it('deletes a chat session by ID', async () => {
    const mockResponse = {
      ok: true,
      text: async () => JSON.stringify({ success: true }),
    };

    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    await deleteChatSession('sess-xyz789');

    expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/api/chat/sessions/sess-xyz789`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('encodes session ID in URL', async () => {
    const mockResponse = {
      ok: true,
      text: async () => JSON.stringify({ success: true }),
    };

    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    const sessionIdWithSpecialChars = 'sess-with/special?chars=test';
    await deleteChatSession(sessionIdWithSpecialChars);

    const expectedEncoded = encodeURIComponent(sessionIdWithSpecialChars);
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/api/chat/sessions/${expectedEncoded}`,
      expect.any(Object)
    );
  });

  it('handles HTTP error in deleteChatSession', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: 'Session not found' }),
    };

    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    await expect(deleteChatSession('sess-nonexistent')).rejects.toThrow(ApiError);
  });

  // ========================================================================
  // TEST: sendSessionMessage()
  // ========================================================================

  it('sends a message to a session and receives response', async () => {
    const mockResponse = {
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          message: 'AAPL is performing well.',
          role: 'assistant',
          tickers_referenced: ['AAPL'],
        }),
    };

    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    const response = await sendSessionMessage('sess-test', 'What about AAPL?');

    expect(response.success).toBe(true);
    expect(response.message).toContain('AAPL');
    expect(response.tickers_referenced).toContain('AAPL');
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/api/chat/sessions/sess-test/message`,
      {
        method: 'POST',
        body: JSON.stringify({ message: 'What about AAPL?' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );
  });

  it('handles message without tickers_referenced', async () => {
    const mockResponse = {
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          message: 'The market is strong today.',
          role: 'assistant',
        }),
    };

    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    const response = await sendSessionMessage('sess-test', 'How is the market?');

    expect(response.success).toBe(true);
    expect(response.tickers_referenced).toBeUndefined();
  });

  it('handles API error response from sendSessionMessage', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: 'Invalid message format',
          code: 'INVALID_MESSAGE',
        }),
    };

    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    await expect(sendSessionMessage('sess-test', 'message')).rejects.toThrow(ApiError);
  });

  it('encodes session ID in sendSessionMessage URL', async () => {
    const mockResponse = {
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          message: 'Response',
          role: 'assistant',
        }),
    };

    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    const sessionId = 'sess-with/slash';
    await sendSessionMessage(sessionId, 'test');

    const expectedEncoded = encodeURIComponent(sessionId);
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/api/chat/sessions/${expectedEncoded}/message`,
      expect.any(Object)
    );
  });

  // ========================================================================
  // TEST: Retry Logic (Inherited from request<T>)
  // ========================================================================

  it('retries on network failure before giving up', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          session_id: 'sess-retry',
          title: 'Retry Test',
          created_at: '2026-02-27T10:00:00Z',
        }),
    } as Response);

    const result = await createChatSession();

    expect(result.session_id).toBe('sess-retry');
    expect(mockFetch).toHaveBeenCalledTimes(3); // 2 failed + 1 success
  });

  it('throws after exhausting retries', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(createChatSession()).rejects.toThrow();
    expect(mockCaptureException).toHaveBeenCalled();
    // 1 initial + 2 retries = 3 attempts
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 4xx client errors', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'Bad request' }),
    };

    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    await expect(createChatSession()).rejects.toThrow(ApiError);
    // Should fail immediately without retrying
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
