/**
 * Integration test: useChat hook + API client + session persistence
 *
 * Tests the full flow from user input → session creation → message send → AI response
 * Covers acceptance criteria:
 * - AC1: Sessions persist across multiple messages in the same conversation
 * - AC2: Lazy session creation happens only on first message
 * - AC3: Clearing history creates a fresh session on next message
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

describe('Chat Integration: Session Persistence & Lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ========================================================================
  // AC1: Sessions persist across multiple messages
  // ========================================================================

  it('AC1: maintains session ID across a multi-turn conversation', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);

    const sessionId = 'persistent-session-abc';
    mockCreateChatSession.mockResolvedValueOnce({
      session_id: sessionId,
      title: 'Multi-turn conversation',
      created_at: '2026-02-27T10:00:00Z',
    });

    mockSendSessionMessage
      .mockResolvedValueOnce({
        success: true,
        message: 'AAPL has strong momentum.',
        role: 'assistant',
        tickers_referenced: ['AAPL'],
      })
      .mockResolvedValueOnce({
        success: true,
        message: 'MSFT leadership continues to show confidence.',
        role: 'assistant',
        tickers_referenced: ['MSFT'],
      })
      .mockResolvedValueOnce({
        success: true,
        message: 'The tech sector overall appears bullish.',
        role: 'assistant',
        tickers_referenced: [],
      });

    const { result } = renderHook(() => useChat());

    // Turn 1: Ask about AAPL
    await act(async () => {
      await result.current.sendMessage('Is AAPL doing well?');
    });

    await waitFor(() => expect(result.current.messages.length).toBe(2));

    // Turn 2: Ask about MSFT
    await act(async () => {
      await result.current.sendMessage('What about MSFT?');
    });

    await waitFor(() => expect(result.current.messages.length).toBe(4));

    // Turn 3: Ask about the sector
    await act(async () => {
      await result.current.sendMessage('How does the tech sector look?');
    });

    await waitFor(() => expect(result.current.messages.length).toBe(6));

    // Verify session was created once and reused for all 3 messages
    expect(mockCreateChatSession).toHaveBeenCalledTimes(1);
    expect(mockSendSessionMessage).toHaveBeenCalledTimes(3);

    // Verify all 3 messages used the same session ID
    expect(mockSendSessionMessage).toHaveBeenNthCalledWith(
      1,
      sessionId,
      'Is AAPL doing well?'
    );
    expect(mockSendSessionMessage).toHaveBeenNthCalledWith(
      2,
      sessionId,
      'What about MSFT?'
    );
    expect(mockSendSessionMessage).toHaveBeenNthCalledWith(
      3,
      sessionId,
      'How does the tech sector look?'
    );

    // Verify message history is correct
    expect(result.current.messages[0].content).toContain('AAPL');
    expect(result.current.messages[2].content).toContain('MSFT');
    expect(result.current.messages[4].content).toContain('tech sector');
  });

  // ========================================================================
  // AC2: Lazy session creation on first message only
  // ========================================================================

  it('AC2: creates session only on the first sendMessage call', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);
    mockCreateChatSession.mockResolvedValueOnce({
      session_id: 'lazy-session',
      title: 'Lazy creation test',
      created_at: '2026-02-27T10:00:00Z',
    });
    mockSendSessionMessage.mockResolvedValue({
      success: true,
      message: 'AI response',
      role: 'assistant',
      tickers_referenced: [],
    });

    const { result } = renderHook(() => useChat());

    // Before any message, session should not be created
    expect(mockCreateChatSession).not.toHaveBeenCalled();

    // Send first message
    await act(async () => {
      result.current.sendMessage('First');
    });

    // Session created on first message
    await waitFor(() => {
      expect(mockCreateChatSession).toHaveBeenCalledTimes(1);
    });

    // Send second message
    await act(async () => {
      result.current.sendMessage('Second');
    });

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(2);
    });

    // Session should still be created only once (not again)
    expect(mockCreateChatSession).toHaveBeenCalledTimes(1);

    // Send third message
    await act(async () => {
      result.current.sendMessage('Third');
    });

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(4);
    });

    // Still only one session created
    expect(mockCreateChatSession).toHaveBeenCalledTimes(1);
  });

  // ========================================================================
  // AC3: Clear history resets session, next message creates new session
  // ========================================================================

  it('AC3: clearHistory nulls session reference, next message starts fresh', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);

    // Two different sessions
    mockCreateChatSession
      .mockResolvedValueOnce({
        session_id: 'first-session',
        title: 'Initial conversation',
        created_at: '2026-02-27T10:00:00Z',
      })
      .mockResolvedValueOnce({
        session_id: 'second-session',
        title: 'Fresh conversation',
        created_at: '2026-02-27T10:05:00Z',
      });

    mockSendSessionMessage.mockResolvedValue({
      success: true,
      message: 'Response',
      role: 'assistant',
      tickers_referenced: [],
    });

    const { result } = renderHook(() => useChat());

    // Start first conversation
    await act(async () => {
      await result.current.sendMessage('Initial message');
    });

    await waitFor(() => expect(result.current.messages.length).toBe(2));

    expect(mockCreateChatSession).toHaveBeenCalledTimes(1);
    expect(mockSendSessionMessage).toHaveBeenCalledWith(
      'first-session',
      'Initial message'
    );

    // Clear history
    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.messages).toEqual([]);

    // Send message in new conversation
    await act(async () => {
      await result.current.sendMessage('Fresh message');
    });

    await waitFor(() => expect(result.current.messages.length).toBe(2));

    // Second session should have been created
    expect(mockCreateChatSession).toHaveBeenCalledTimes(2);
    expect(mockSendSessionMessage).toHaveBeenCalledWith(
      'second-session',
      'Fresh message'
    );
  });

  // ========================================================================
  // Edge case: Recovery from provider errors
  // ========================================================================

  it('handles provider errors and allows retry with new session', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);

    mockCreateChatSession
      .mockResolvedValueOnce({
        session_id: 'failed-session',
        title: 'Failed attempt',
        created_at: '2026-02-27T10:00:00Z',
      })
      .mockResolvedValueOnce({
        session_id: 'retry-session',
        title: 'Retry',
        created_at: '2026-02-27T10:05:00Z',
      });

    mockSendSessionMessage
      .mockRejectedValueOnce(new Error('Provider temporarily unavailable'))
      .mockResolvedValueOnce({
        success: true,
        message: 'Success on retry',
        role: 'assistant',
        tickers_referenced: [],
      });

    const { result } = renderHook(() => useChat());

    // First attempt fails
    await act(async () => {
      await result.current.sendMessage('Please respond');
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.messages[1].content).toContain('Error');

    // User clears and retries
    act(() => {
      result.current.clearHistory();
    });

    await act(async () => {
      await result.current.sendMessage('Try again');
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });

    expect(result.current.messages.length).toBe(2);
    expect(result.current.messages[1].content).toBe('Success on retry');

    // Verify new session was created for retry
    expect(mockCreateChatSession).toHaveBeenCalledTimes(2);
  });
});
