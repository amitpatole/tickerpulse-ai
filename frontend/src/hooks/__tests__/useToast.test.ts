// ============================================================
// TickerPulse AI — useToast.ts unit tests
// Tests the toast queue hook consumed by ToastContainer
// ============================================================

import { renderHook, act } from '@testing-library/react';
import { useToast, toast } from '@/hooks/useToast';
import { _resetToastBusForTesting } from '@/lib/toastBus';

describe('useToast hook', () => {
  // Reset bus state before each test to avoid cross-test pollution
  beforeEach(() => {
    _resetToastBusForTesting();
  });

  describe('Happy path — Hook lifecycle', () => {
    it('initializes with empty toast queue', () => {
      const { result } = renderHook(() => useToast());

      expect(result.current.toasts).toEqual([]);
    });

    it('registers listener on mount and unregisters on unmount', () => {
      const { unmount } = renderHook(() => useToast());

      // After mount, listener should be registered
      act(() => {
        toast('Test message', 'info');
      });

      // After unmount, listener should be unregistered
      unmount();

      // Subsequent toast call should silently drop (no listener)
      expect(() => {
        act(() => {
          toast('After unmount', 'warning');
        });
      }).not.toThrow();
    });
  });

  describe('Happy path — Toast enqueueing', () => {
    it('enqueues toast from toast() call', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast('New notification', 'success');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0]).toMatchObject({
        message: 'New notification',
        type: 'success',
      });
    });

    it('enqueues multiple toasts in order', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast('First', 'error');
        toast('Second', 'warning');
        toast('Third', 'info');
      });

      expect(result.current.toasts).toHaveLength(3);
      expect(result.current.toasts[0].message).toBe('First');
      expect(result.current.toasts[1].message).toBe('Second');
      expect(result.current.toasts[2].message).toBe('Third');
    });

    it('preserves toast queue order across multiple dispatch cycles', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast('First');
      });

      act(() => {
        toast('Second');
      });

      act(() => {
        toast('Third');
      });

      const messages = result.current.toasts.map((t) => t.message);
      expect(messages).toEqual(['First', 'Second', 'Third']);
    });
  });

  describe('Happy path — Dismiss', () => {
    it('removes toast by id via dismiss()', () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;
      act(() => {
        toast('Target toast', 'warning');
      });

      toastId = result.current.toasts[0].id;

      act(() => {
        result.current.dismiss(toastId);
      });

      expect(result.current.toasts).toHaveLength(0);
    });

    it('removes correct toast when multiple toasts exist', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast('Toast 1');
        toast('Toast 2');
        toast('Toast 3');
      });

      const middleId = result.current.toasts[1].id;

      act(() => {
        result.current.dismiss(middleId);
      });

      expect(result.current.toasts).toHaveLength(2);
      expect(result.current.toasts.map((t) => t.message)).toEqual([
        'Toast 1',
        'Toast 3',
      ]);
    });

    it('gracefully handles dismissing non-existent toast id', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast('Only toast');
      });

      expect(() => {
        act(() => {
          result.current.dismiss('non-existent-id');
        });
      }).not.toThrow();

      // Original toast still in queue
      expect(result.current.toasts).toHaveLength(1);
    });
  });

  describe('Edge cases — Queue state', () => {
    it('handles rapid dismiss of all toasts', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast('Toast 1');
        toast('Toast 2');
        toast('Toast 3');
      });

      act(() => {
        result.current.toasts.forEach((t) => {
          result.current.dismiss(t.id);
        });
      });

      expect(result.current.toasts).toHaveLength(0);
    });

    it('maintains queue integrity after mixed enqueue and dismiss', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast('Toast A');
        toast('Toast B');
      });

      const idB = result.current.toasts[1].id;

      act(() => {
        result.current.dismiss(idB);
        toast('Toast C');
      });

      expect(result.current.toasts).toHaveLength(2);
      expect(result.current.toasts.map((t) => t.message)).toEqual([
        'Toast A',
        'Toast C',
      ]);
    });

    it('assigns unique ids even after clearing queue', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast('Toast 1');
      });

      const firstId = result.current.toasts[0].id;

      act(() => {
        result.current.dismiss(firstId);
        toast('Toast 2');
      });

      const secondId = result.current.toasts[0].id;

      // IDs should be different and incrementing
      expect(firstId).not.toBe(secondId);
      expect(parseInt(secondId) > parseInt(firstId)).toBe(true);
    });
  });

  describe('Edge cases — Message content', () => {
    it('enqueues toasts with empty message', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast('');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].message).toBe('');
    });

    it('enqueues toasts with special characters', () => {
      const { result } = renderHook(() => useToast());

      const specialMsg = 'Error: "Connection failed" (errno: 500) → Retry?';

      act(() => {
        toast(specialMsg, 'error');
      });

      expect(result.current.toasts[0].message).toBe(specialMsg);
    });

    it('enqueues toasts with long messages', () => {
      const { result } = renderHook(() => useToast());

      const longMsg =
        'This is a very long error message that might be displayed in a toast notification ' +
        'and should be handled gracefully without truncation or other issues in the queue';

      act(() => {
        toast(longMsg, 'warning');
      });

      expect(result.current.toasts[0].message).toBe(longMsg);
    });
  });

  describe('Acceptance criteria — Multiple toasts coexist', () => {
    it('supports multiple concurrent toasts from different sources', () => {
      const { result } = renderHook(() => useToast());

      // Simulate toasts from different parts of the app (api.ts, hooks, components)
      act(() => {
        toast('API error', 'error');
      });

      act(() => {
        toast('User action warning', 'warning');
      });

      act(() => {
        toast('Info notification', 'info');
      });

      expect(result.current.toasts).toHaveLength(3);
      expect(result.current.toasts.every((t) => t.id && t.message && t.type)).toBe(
        true
      );
    });

    it('allows ToastContainer pattern: display and auto-dismiss', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast('Notification 1', 'success');
        toast('Notification 2', 'info');
      });

      expect(result.current.toasts).toHaveLength(2);

      // Simulate auto-dismiss after timeout (e.g., ToastContainer's own logic)
      const firstId = result.current.toasts[0].id;
      act(() => {
        result.current.dismiss(firstId);
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].message).toBe('Notification 2');
    });
  });
});
