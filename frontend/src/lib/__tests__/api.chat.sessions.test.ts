/**
 * Test suite for Chat Session API endpoints
 *
 * Coverage:
 * - Session creation with/without custom title
 * - Sending messages within a session
 * - Listing sessions ordered by recency
 * - Deleting sessions
 * - Error cases (session not found, empty messages)
 */

import * as api from '@/lib/api';

// Mock fetch globally
global.fetch = jest.fn();

const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

const mockResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: () => Promise.resolve(JSON.stringify(data)),
} as Response);

describe('Chat Session API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ========================================================================
  // TEST: Create Chat Session
  // ========================================================================

  it('creates a new chat session with auto-generated title', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        session_id: 'abc-123',
        title: 'New conversation',
        created_at: '2026-02-27T10:00:00Z',
      })
    );

    const session = await api.createChatSession();

    expect(session.session_id).toBe('abc-123');
    expect(session.title).toBe('New conversation');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/chat/sessions',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
      })
    );
  });

  it('creates a session with a custom title', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        session_id: 'xyz-789',
        title: 'AAPL Analysis',
        created_at: '2026-02-27T10:05:00Z',
      })
    );

    const session = await api.createChatSession('AAPL Analysis');

    expect(session.title).toBe('AAPL Analysis');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ title: 'AAPL Analysis' }),
      })
    );
  });

  // ========================================================================
  // TEST: Send Message in Session
  // ========================================================================

  it('sends a message to an active session and receives AI response', async () => {
    const sessionId = 'abc-123';
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        success: true,
        message:
          'AAPL is showing strong technical indicators with RSI at 75.',
        role: 'assistant',
        tickers_referenced: ['AAPL'],
      })
    );

    const response = await api.sendSessionMessage(
      sessionId,
      'How is AAPL performing?'
    );

    expect(response.success).toBe(true);
    expect(response.message).toContain('AAPL');
    expect(response.tickers_referenced).toEqual(['AAPL']);
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/chat/sessions/${sessionId}/message`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ message: 'How is AAPL performing?' }),
      })
    );
  });

  it('rejects message send when session is not found', async () => {
    const sessionId = 'nonexistent-id';
    mockFetch.mockResolvedValueOnce(
      mockResponse({ success: false, error: 'Session not found' }, 404)
    );

    try {
      await api.sendSessionMessage(sessionId, 'Hello');
      fail('Should have thrown ApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(api.ApiError);
      expect((err as api.ApiError).status).toBe(404);
    }
  });

  // ========================================================================
  // TEST: List Chat Sessions
  // ========================================================================

  it('lists recent chat sessions ordered by last activity', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        sessions: [
          {
            session_id: 'session-1',
            title: 'MSFT Strategy',
            message_count: 8,
            created_at: '2026-02-27T08:00:00Z',
            updated_at: '2026-02-27T10:00:00Z',
          },
          {
            session_id: 'session-2',
            title: 'Portfolio Review',
            message_count: 3,
            created_at: '2026-02-27T09:00:00Z',
            updated_at: '2026-02-27T09:30:00Z',
          },
        ],
      })
    );

    const sessions = await api.listChatSessions();

    expect(sessions).toHaveLength(2);
    expect(sessions[0].session_id).toBe('session-1');
    expect(sessions[0].message_count).toBe(8);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/chat/sessions',
      expect.any(Object)
    );
  });

  it('returns empty list when no sessions exist', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ sessions: [] }));

    const sessions = await api.listChatSessions();

    expect(sessions).toEqual([]);
  });

  // ========================================================================
  // TEST: Delete Chat Session
  // ========================================================================

  it('deletes a chat session by ID', async () => {
    const sessionId = 'session-1';
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

    await expect(api.deleteChatSession(sessionId)).resolves.not.toThrow();
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/chat/sessions/${sessionId}`,
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('throws error when deleting non-existent session', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ success: false, error: 'Session not found' }, 404)
    );

    try {
      await api.deleteChatSession('nonexistent-id');
      fail('Should have thrown ApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(api.ApiError);
    }
  });
});
