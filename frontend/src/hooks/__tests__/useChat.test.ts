/**
 * Test suite for useChat hook — Session-based chat state management.
 *
 * Coverage:
 * - Lazy session creation (only on first message)
 * - Session ID persistence across renders (useRef)
 * - Message submission with session reuse
 * - clearHistory resets session ID
 * - Error handling and recovery
 * - Starters loading
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
const mockGetChatStarters = api.getChatStarters as jest.MockedFunction<typeof api.getChatStarters>;

describe('useChat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ========================================================================
  // ACCEPTANCE CRITERION 1: Lazy Session Creation
  // Only creates session when first message is sent, not on mount
  // ========================================================================

  it('creates session only on first message, not on mount', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);

    renderHook(() => useChat());

    // Session should NOT be created on mount
    await waitFor(() => {
      expect(mockCreateChatSession).not.toHaveBeenCalled();
    });
  });

  it('creates a new session when first message is sent', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);
    mockCreateChatSession.mockResolvedValueOnce({
      session_id: 'sess-001',
      title: 'Chat Session',
      created_at: '2026-02-27T10:00:00Z',
    });
    mockSendSessionMessage.mockResolvedValueOnce({
      success: true,
      message: 'Response from AI',
      role: 'assistant',
      tickers_referenced: [],
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    await waitFor(() => {
      expect(mockCreateChatSession).toHaveBeenCalledTimes(1);
      expect(mockCreateChatSession).toHaveBeenCalledWith();
    });
  });

  // ========================================================================
  // ACCEPTANCE CRITERION 2: Session ID Persistence
  // Same session ID reused across multiple messages without recreating
  // ========================================================================

  it('reuses same session ID across multiple messages', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);
    mockCreateChatSession.mockResolvedValueOnce({
      session_id: 'sess-002',
      title: 'Chat Session',
      created_at: '2026-02-27T10:00:00Z',
    });
    mockSendSessionMessage.mockResolvedValue({
      success: true,
      message: 'Response',
      role: 'assistant',
      tickers_referenced: [],
    });

    const { result } = renderHook(() => useChat());

    // Send first message
    await act(async () => {
      await result.current.sendMessage('First');
    });

    // Send second message
    await act(async () => {
      await result.current.sendMessage('Second');
    });

    // Session should be created only once
    expect(mockCreateChatSession).toHaveBeenCalledTimes(1);

    // Both messages sent to same session
    expect(mockSendSessionMessage).toHaveBeenCalledTimes(2);
    expect(mockSendSessionMessage).toHaveBeenNthCalledWith(1, 'sess-002', 'First');
    expect(mockSendSessionMessage).toHaveBeenNthCalledWith(2, 'sess-002', 'Second');
  });

  // ========================================================================
  // ACCEPTANCE CRITERION 3: clearHistory Resets Session
  // After clearHistory, next message creates a new session (not reuse old one)
  // ========================================================================

  it('resets session ID when clearHistory is called', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);
    mockCreateChatSession
      .mockResolvedValueOnce({
        session_id: 'sess-001',
        title: 'Session 1',
        created_at: '2026-02-27T10:00:00Z',
      })
      .mockResolvedValueOnce({
        session_id: 'sess-002',
        title: 'Session 2',
        created_at: '2026-02-27T10:05:00Z',
      });
    mockSendSessionMessage.mockResolvedValue({
      success: true,
      message: 'Response',
      role: 'assistant',
      tickers_referenced: [],
    });

    const { result } = renderHook(() => useChat());

    // Send first message (creates sess-001)
    await act(async () => {
      await result.current.sendMessage('Message 1');
    });

    expect(result.current.messages).toHaveLength(2);

    // Clear history
    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.error).toBeNull();

    // Send another message (should create new session sess-002, not reuse sess-001)
    await act(async () => {
      await result.current.sendMessage('Message 2');
    });

    // Two sessions created (one before clear, one after)
    expect(mockCreateChatSession).toHaveBeenCalledTimes(2);
    // First call for "Message 1", second call for "Message 2"
    expect(mockSendSessionMessage).toHaveBeenNthCalledWith(1, 'sess-001', 'Message 1');
    expect(mockSendSessionMessage).toHaveBeenNthCalledWith(2, 'sess-002', 'Message 2');
  });

  // ========================================================================
  // TEST: Happy Path Message Sending
  // ========================================================================

  it('sends message and updates history with success response', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);
    mockCreateChatSession.mockResolvedValueOnce({
      session_id: 'sess-101',
      title: 'New Chat',
      created_at: '2026-02-27T10:00:00Z',
    });
    mockSendSessionMessage.mockResolvedValueOnce({
      success: true,
      message: 'AAPL is trading at $150 with strong momentum.',
      role: 'assistant',
      tickers_referenced: ['AAPL'],
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('What about AAPL?');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    expect(result.current.messages[0].role).toBe('user');
    expect(result.current.messages[0].content).toBe('What about AAPL?');
    expect(result.current.messages[1].role).toBe('assistant');
    expect(result.current.messages[1].content).toContain('AAPL');
    expect(result.current.messages[1].tickers_referenced).toEqual(['AAPL']);
  });

  // ========================================================================
  // TEST: Input Validation & Edge Cases
  // ========================================================================

  it('ignores empty or whitespace-only messages', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('   ');
    });

    expect(result.current.messages).toHaveLength(0);
    expect(mockCreateChatSession).not.toHaveBeenCalled();
  });

  it('prevents sending messages while loading', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);
    mockCreateChatSession.mockResolvedValueOnce({
      session_id: 'sess-200',
      title: 'Chat',
      created_at: '2026-02-27T10:00:00Z',
    });

    let resolveFirstMessage: (() => void) | null = null;
    mockSendSessionMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstMessage = () =>
            resolve({
              success: true,
              message: 'First response',
              role: 'assistant',
              tickers_referenced: [],
            });
        })
    );

    const { result } = renderHook(() => useChat());

    // Start first message (will hang until resolved)
    act(() => {
      result.current.sendMessage('First');
    });

    // Try to send second while loading
    await act(async () => {
      await result.current.sendMessage('Second');
    });

    // Only first message should reach the API
    expect(mockSendSessionMessage).toHaveBeenCalledTimes(1);

    // Resolve first message
    resolveFirstMessage?.();
  });

  // ========================================================================
  // TEST: Error Handling
  // ========================================================================

  it('handles API error response and displays error state', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);
    mockCreateChatSession.mockResolvedValueOnce({
      session_id: 'sess-300',
      title: 'Chat',
      created_at: '2026-02-27T10:00:00Z',
    });
    mockSendSessionMessage.mockResolvedValueOnce({
      success: false,
      error: 'AI provider is currently unavailable',
      message: '',
      role: 'assistant',
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('Query');
    });

    await waitFor(() => {
      expect(result.current.error).toBe('AI provider is currently unavailable');
    });

    // Loading placeholder replaced with error
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toContain('Error:');
    expect(result.current.isLoading).toBe(false);
  });

  it('handles network/fetch errors gracefully', async () => {
    mockGetChatStarters.mockResolvedValueOnce([]);
    mockCreateChatSession.mockResolvedValueOnce({
      session_id: 'sess-400',
      title: 'Chat',
      created_at: '2026-02-27T10:00:00Z',
    });
    mockSendSessionMessage.mockRejectedValueOnce(new Error('Network timeout'));

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('Test');
    });

    await waitFor(() => {
      expect(result.current.error).toContain('Network timeout');
      expect(result.current.isLoading).toBe(false);
    });
  });

  // ========================================================================
  // TEST: Starters Loading
  // ========================================================================

  it('loads and displays chat starters on mount', async () => {
    mockGetChatStarters.mockResolvedValueOnce([
      'What are top-rated stocks?',
      'Show me earnings calendar',
    ]);

    const { result } = renderHook(() => useChat());

    expect(result.current.starters).toEqual([]);

    await waitFor(() => {
      expect(result.current.starters).toEqual([
        'What are top-rated stocks?',
        'Show me earnings calendar',
      ]);
    });
  });

  it('continues operation even if starters loading fails', async () => {
    mockGetChatStarters.mockRejectedValueOnce(new Error('Starters unavailable'));
    mockCreateChatSession.mockResolvedValueOnce({
      session_id: 'sess-500',
      title: 'Chat',
      created_at: '2026-02-27T10:00:00Z',
    });
    mockSendSessionMessage.mockResolvedValueOnce({
      success: true,
      message: 'Response',
      role: 'assistant',
      tickers_referenced: [],
    });

    const { result } = renderHook(() => useChat());

    // Despite starters failure, chat should still work
    await act(async () => {
      await result.current.sendMessage('Hi');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.starters).toEqual([]);
    });
  });
});
