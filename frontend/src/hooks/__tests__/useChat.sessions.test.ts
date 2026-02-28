/**
 * Test suite for useChat hook with session-based persistence
 *
 * Coverage:
 * - Lazy session creation on first message
 * - Session ID persistence across multiple turns
 * - Error handling with session context
 * - Clear history nulls out session reference
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '@/hooks/useChat';
import * as api from '@/lib/api';

jest.mock('@/lib/api');

const mockCreateChatSession = api.createChatSession as jest.MockedFunction<
  typeof api.createChatSession
>;
const mockSendSessionMessage = api.sendSessionMessage as jest.MockedFunction<
  typeof api.sendSessionMessage
>;
const mockGetChatStarters = api.getChatStarters as jest.MockedFunction<
  typeof api.getChatStarters
>;

describe('useChat with Session Persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ========================================================================
  // TEST: Lazy Session Creation
  // ========================================================================

  it('creates a session on the first message send', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);
    mockCreateChatSession.mockResolvedValueOnce({
      session_id: 'new-session-123',
      title: 'New conversation',
      created_at: '2026-02-27T10:00:00Z',
    });
    mockSendSessionMessage.mockResolvedValueOnce({
      success: true,
      message: 'Session successfully created.',
      role: 'assistant',
      tickers_referenced: [],
    });

    const { result } = renderHook(() => useChat());

    // Before sending a message, no session should be created
    expect(mockCreateChatSession).not.toHaveBeenCalled();

    // Send first message
    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    // Session should be created
    await waitFor(() => {
      expect(mockCreateChatSession).toHaveBeenCalledTimes(1);
    });

    // Message should be sent to the session
    expect(mockSendSessionMessage).toHaveBeenCalledWith(
      'new-session-123',
      'Hello'
    );
  });

  // ========================================================================
  // TEST: Session Persistence Across Turns
  // ========================================================================

  it('reuses the same session for multiple messages', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);
    mockCreateChatSession.mockResolvedValueOnce({
      session_id: 'persistent-session',
      title: 'Multi-turn chat',
      created_at: '2026-02-27T10:00:00Z',
    });
    mockSendSessionMessage
      .mockResolvedValueOnce({
        success: true,
        message: 'AAPL is strong.',
        role: 'assistant',
        tickers_referenced: ['AAPL'],
      })
      .mockResolvedValueOnce({
        success: true,
        message: 'MSFT is also doing well.',
        role: 'assistant',
        tickers_referenced: ['MSFT'],
      });

    const { result } = renderHook(() => useChat());

    // First message
    await act(async () => {
      await result.current.sendMessage('Tell me about AAPL');
    });

    await waitFor(() => {
      expect(result.current.messages.length).toBe(2);
    });

    // Second message
    await act(async () => {
      await result.current.sendMessage('What about MSFT?');
    });

    await waitFor(() => {
      expect(result.current.messages.length).toBe(4);
    });

    // Session should be created only once
    expect(mockCreateChatSession).toHaveBeenCalledTimes(1);

    // Both messages should use the same session ID
    expect(mockSendSessionMessage).toHaveBeenCalledWith(
      'persistent-session',
      'Tell me about AAPL'
    );
    expect(mockSendSessionMessage).toHaveBeenCalledWith(
      'persistent-session',
      'What about MSFT?'
    );
  });

  // ========================================================================
  // TEST: Error Handling with Sessions
  // ========================================================================

  it('handles session creation failure gracefully', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);
    mockCreateChatSession.mockRejectedValueOnce(new Error('Server error'));

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Server error');
    });

    // Messages should show error state
    expect(result.current.messages[1].content).toContain('Error');
  });

  it('handles session message send failure', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);
    mockCreateChatSession.mockResolvedValueOnce({
      session_id: 'test-session',
      title: 'Test',
      created_at: '2026-02-27T10:00:00Z',
    });
    mockSendSessionMessage.mockRejectedValueOnce(new Error('Session expired'));

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('Test message');
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Session expired');
    });

    expect(result.current.isLoading).toBe(false);
  });

  // ========================================================================
  // TEST: Clear History Resets Session
  // ========================================================================

  it('clears history and resets session reference', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);
    mockCreateChatSession
      .mockResolvedValueOnce({
        session_id: 'session-1',
        title: 'First session',
        created_at: '2026-02-27T10:00:00Z',
      })
      .mockResolvedValueOnce({
        session_id: 'session-2',
        title: 'Second session',
        created_at: '2026-02-27T10:05:00Z',
      });
    mockSendSessionMessage.mockResolvedValue({
      success: true,
      message: 'Response',
      role: 'assistant',
      tickers_referenced: [],
    });

    const { result } = renderHook(() => useChat());

    // Send message in first session
    await act(async () => {
      await result.current.sendMessage('First message');
    });

    await waitFor(() => {
      expect(result.current.messages.length).toBe(2);
    });

    expect(mockCreateChatSession).toHaveBeenCalledTimes(1);

    // Clear history
    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.messages).toEqual([]);

    // Send message — should create a NEW session
    await act(async () => {
      await result.current.sendMessage('Second message');
    });

    // Should create a new session (total 2 now)
    await waitFor(() => {
      expect(mockCreateChatSession).toHaveBeenCalledTimes(2);
    });

    // New session should be used
    expect(mockSendSessionMessage).toHaveBeenLastCalledWith(
      'session-2',
      'Second message'
    );
  });

  // ========================================================================
  // TEST: Ticker Extraction in Session
  // ========================================================================

  it('extracts and reports tickers referenced in assistant response', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);
    mockCreateChatSession.mockResolvedValueOnce({
      session_id: 'ticker-session',
      title: 'Ticker analysis',
      created_at: '2026-02-27T10:00:00Z',
    });
    mockSendSessionMessage.mockResolvedValueOnce({
      success: true,
      message: 'AAPL, MSFT, and GOOGL are all performing well.',
      role: 'assistant',
      tickers_referenced: ['AAPL', 'MSFT', 'GOOGL'],
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('Which stocks should I watch?');
    });

    await waitFor(() => {
      expect(result.current.messages.length).toBe(2);
    });

    const assistantMsg = result.current.messages[1];
    expect(assistantMsg.tickers_referenced).toEqual(['AAPL', 'MSFT', 'GOOGL']);
  });
});
