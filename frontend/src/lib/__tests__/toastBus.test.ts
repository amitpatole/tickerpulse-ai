// ============================================================
// TickerPulse AI — toastBus.ts unit tests
// Tests the global toast event bus (plain TypeScript module)
// ============================================================

import {
  toast,
  _setToastListener,
  _resetToastBusForTesting,
  type Toast,
  type ToastType,
} from '@/lib/toastBus';

describe('toastBus', () => {
  // Reset bus state before each test to avoid cross-test pollution
  beforeEach(() => {
    _resetToastBusForTesting();
  });

  describe('toast() — Happy path', () => {
    it('dispatches toast with message and explicit type', () => {
      const received: Toast[] = [];
      _setToastListener((t) => received.push(t));

      toast('Network error', 'error');

      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        message: 'Network error',
        type: 'error',
      });
    });

    it('uses default type="error" when type not specified', () => {
      const received: Toast[] = [];
      _setToastListener((t) => received.push(t));

      toast('Something went wrong');

      expect(received[0].type).toBe('error');
    });

    it('accepts all valid toast types', () => {
      const received: Toast[] = [];
      _setToastListener((t) => received.push(t));

      const types: ToastType[] = ['error', 'warning', 'info', 'success'];
      types.forEach((type) => {
        toast(`Message for ${type}`, type);
      });

      expect(received).toHaveLength(4);
      received.forEach((t, i) => {
        expect(t.type).toBe(types[i]);
      });
    });

    it('assigns unique, incrementing IDs to toasts', () => {
      const received: Toast[] = [];
      _setToastListener((t) => received.push(t));

      toast('First');
      toast('Second');
      toast('Third');

      expect(received[0].id).toBe('1');
      expect(received[1].id).toBe('2');
      expect(received[2].id).toBe('3');
    });
  });

  describe('toast() — Edge cases', () => {
    it('gracefully handles no listener registered (SSR, tests)', () => {
      // No listener set, should not crash
      expect(() => {
        toast('Message when no listener');
      }).not.toThrow();
    });

    it('silently drops toast when listener is null', () => {
      const received: Toast[] = [];
      _setToastListener((t) => received.push(t));

      toast('First message');
      _setToastListener(null); // Unregister listener
      toast('Second message (dropped)');

      expect(received).toHaveLength(1);
      expect(received[0].message).toBe('First message');
    });

    it('handles empty message string', () => {
      const received: Toast[] = [];
      _setToastListener((t) => received.push(t));

      toast('');

      expect(received[0].message).toBe('');
    });

    it('preserves toast message with special characters and quotes', () => {
      const received: Toast[] = [];
      _setToastListener((t) => received.push(t));

      const specialMsg = 'Error: "Failed to fetch data" from API';
      toast(specialMsg, 'error');

      expect(received[0].message).toBe(specialMsg);
    });
  });

  describe('_setToastListener()', () => {
    it('allows registering a new listener', () => {
      const listener = jest.fn();
      _setToastListener(listener);

      toast('Test', 'info');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test',
          type: 'info',
        })
      );
    });

    it('replaces previous listener when called again', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      _setToastListener(listener1);
      toast('Toast 1');

      _setToastListener(listener2);
      toast('Toast 2');

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener1).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Toast 1' })
      );
      expect(listener2).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Toast 2' })
      );
    });

    it('allows unregistering listener by passing null', () => {
      const listener = jest.fn();
      _setToastListener(listener);
      toast('Before unregister');

      _setToastListener(null);
      toast('After unregister');

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('_resetToastBusForTesting()', () => {
    it('clears listener and resets counter', () => {
      const listener = jest.fn();
      _setToastListener(listener);

      toast('Message 1');
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1' })
      );

      _resetToastBusForTesting();
      _setToastListener(listener);
      toast('Message 2');

      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: '1' })
      );
    });

    it('allows fresh listener registration after reset', () => {
      const listener1 = jest.fn();
      _setToastListener(listener1);
      toast('Toast from listener 1');

      _resetToastBusForTesting();

      const listener2 = jest.fn();
      _setToastListener(listener2);
      toast('Toast from listener 2');

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });
});
