```typescript
/**
 * Tests for frontend/src/hooks/useChartTimeframe.ts — React hook for chart timeframe persistence.
 *
 * AC1: Hook reads/writes chart timeframe selection to localStorage
 * AC2: Falls back to defaultTimeframe if stored value is invalid or absent
 * AC3: Handles SSR gracefully (window undefined)
 */

import { renderHook, act } from '@testing-library/react';
import { useChartTimeframe, useChartTimeframes } from '../useChartTimeframe';
import type { Timeframe } from '@/lib/types';

// Helper to setup mock localStorage
const setupLocalStorage = () => {
  const store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    key: jest.fn((index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }),
    length: 0,
  };

  Object.defineProperty(mockLocalStorage, 'length', {
    get: () => Object.keys(store).length,
  });

  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });
  }

  return { store, mockLocalStorage };
};

describe('useChartTimeframe', () => {
  const defaultTimeframe: Timeframe = '1D';
  const validTimeframes: Timeframe[] = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'All'];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Happy path - normal operation', () => {
    it('reads stored timeframe from localStorage if valid', () => {
      const { mockLocalStorage } = setupLocalStorage();
      mockLocalStorage.getItem.mockReturnValue('1W');

      const { result } = renderHook(() =>
        useChartTimeframe('chart_timeframe', defaultTimeframe, validTimeframes)
      );

      const [timeframe] = result.current;
      expect(timeframe).toBe('1W');
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('chart_timeframe');
    });

    it('updates localStorage and state when setTimeframe is called', () => {
      const { mockLocalStorage, store } = setupLocalStorage();

      const { result } = renderHook(() =>
        useChartTimeframe('chart_timeframe', defaultTimeframe, validTimeframes)
      );

      act(() => {
        const [, setTimeframe] = result.current;
        setTimeframe('6M');
      });

      const [timeframe] = result.current;
      expect(timeframe).toBe('6M');
      expect(store['chart_timeframe']).toBe('6M');
    });

    it('persists timeframe across hook re-renders', () => {
      setupLocalStorage();

      const { result, rerender } = renderHook(
        () => useChartTimeframe('chart_timeframe', defaultTimeframe, validTimeframes)
      );

      act(() => {
        const [, setTimeframe] = result.current;
        setTimeframe('1Y');
      });

      let [timeframe] = result.current;
      expect(timeframe).toBe('1Y');

      // Re-render and verify persistence
      rerender();
      [timeframe] = result.current;
      expect(timeframe).toBe('1Y');
    });
  });

  describe('Edge cases and boundaries', () => {
    it('uses defaultTimeframe when localStorage is empty', () => {
      setupLocalStorage(); // No stored value

      const { result } = renderHook(() =>
        useChartTimeframe('chart_timeframe', defaultTimeframe, validTimeframes)
      );

      const [timeframe] = result.current;
      expect(timeframe).toBe('1D');
    });

    it('falls back to defaultTimeframe when stored value is not in validTimeframes', () => {
      const { mockLocalStorage } = setupLocalStorage();
      mockLocalStorage.getItem.mockReturnValue('2D'); // Invalid timeframe

      const { result } = renderHook(() =>
        useChartTimeframe('chart_timeframe', defaultTimeframe, validTimeframes)
      );

      const [timeframe] = result.current;
      expect(timeframe).toBe('1D');
    });

    it('accepts any default timeframe from validTimeframes list', () => {
      setupLocalStorage();
      const customDefault: Timeframe = '6M';

      const { result } = renderHook(() =>
        useChartTimeframe('chart_timeframe', customDefault, validTimeframes)
      );

      const [timeframe] = result.current;
      expect(timeframe).toBe('6M');
    });

    it('handles custom storage key correctly', () => {
      const { store } = setupLocalStorage();
      const customKey = 'portfolio_chart_timeframe';

      const { result } = renderHook(() =>
        useChartTimeframe(customKey, defaultTimeframe, validTimeframes)
      );

      act(() => {
        const [, setTimeframe] = result.current;
        setTimeframe('3M');
      });

      expect(store[customKey]).toBe('3M');
    });

    it('validates against custom timeframe list', () => {
      const { mockLocalStorage } = setupLocalStorage();
      const customTimeframes: Timeframe[] = ['1D', '1W', '1M']; // Shorter list
      mockLocalStorage.getItem.mockReturnValue('6M'); // Not in custom list

      const { result } = renderHook(() =>
        useChartTimeframe('chart_timeframe', '1D', customTimeframes)
      );

      const [timeframe] = result.current;
      expect(timeframe).toBe('1D'); // Falls back to default
    });
  });

  describe('Acceptance criteria coverage', () => {
    it('AC1: Reads and writes chart timeframe selection to localStorage', () => {
      const { mockLocalStorage, store } = setupLocalStorage();

      const { result } = renderHook(() =>
        useChartTimeframe('chart_timeframe', defaultTimeframe, validTimeframes)
      );

      // Read: getItem called on init
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('chart_timeframe');

      // Write: setItem updates store on update
      act(() => {
        const [, setTimeframe] = result.current;
        setTimeframe('5Y');
      });

      expect(store['chart_timeframe']).toBe('5Y');
    });

    it('AC2: Falls back to defaultTimeframe on invalid or absent stored value', () => {
      const { mockLocalStorage } = setupLocalStorage();

      // Test absent case
      mockLocalStorage.getItem.mockReturnValue(null);
      let { result } = renderHook(() =>
        useChartTimeframe('chart_timeframe', '1W', validTimeframes)
      );
      expect(result.current[0]).toBe('1W');

      // Test invalid case
      mockLocalStorage.getItem.mockReturnValue('BadTimeframe');
      ({ result } = renderHook(() =>
        useChartTimeframe('chart_timeframe', '1W', validTimeframes)
      ));
      expect(result.current[0]).toBe('1W');
    });

    it('AC3: Returns defaultTimeframe when localStorage.getItem throws (e.g., SSR)', () => {
      const { mockLocalStorage } = setupLocalStorage();
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      const { result } = renderHook(() =>
        useChartTimeframe('chart_timeframe', '1M', validTimeframes)
      );

      // Should not throw and should return default
      expect(result.current[0]).toBe('1M');
    });
  });
});

describe('useChartTimeframes (array variant)', () => {
  const defaultTimeframes: Timeframe[] = ['1W', '1M', '3M', '1Y'];
  const validTimeframes: Timeframe[] = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'All'];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Happy path - normal operation', () => {
    it('returns defaultTimeframes when localStorage is empty', () => {
      setupLocalStorage();

      const { result } = renderHook(() =>
        useChartTimeframes('multi_tfs', defaultTimeframes, validTimeframes)
      );

      expect(result.current[0]).toEqual(defaultTimeframes);
    });

    it('reads a valid array from localStorage', () => {
      const { mockLocalStorage } = setupLocalStorage();
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(['1D', '1W', '1M']));

      const { result } = renderHook(() =>
        useChartTimeframes('multi_tfs', defaultTimeframes, validTimeframes)
      );

      expect(result.current[0]).toEqual(['1D', '1W', '1M']);
    });

    it('persists the selection as JSON on change', () => {
      const { store } = setupLocalStorage();

      const { result } = renderHook(() =>
        useChartTimeframes('multi_tfs', defaultTimeframes, validTimeframes)
      );

      act(() => {
        result.current[1](['1D', '6M', '1Y']);
      });

      expect(result.current[0]).toEqual(['1D', '6M', '1Y']);
      expect(store['multi_tfs']).toBe(JSON.stringify(['1D', '6M', '1Y']));
    });
  });

  describe('Validation and edge cases', () => {
    it('drops unknown timeframes and preserves valid ones', () => {
      const { mockLocalStorage } = setupLocalStorage();
      // Mix of valid and invalid values
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(['1D', 'INVALID', '1M', 'UNKNOWN']));

      const { result } = renderHook(() =>
        useChartTimeframes('multi_tfs', defaultTimeframes, validTimeframes)
      );

      expect(result.current[0]).toEqual(['1D', '1M']);
    });

    it('falls back to defaults when all stored values are unknown', () => {
      const { mockLocalStorage } = setupLocalStorage();
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(['BAD', 'WORSE']));

      const { result } = renderHook(() =>
        useChartTimeframes('multi_tfs', defaultTimeframes, validTimeframes)
      );

      expect(result.current[0]).toEqual(defaultTimeframes);
    });

    it('falls back to defaults when stored value is not an array', () => {
      const { mockLocalStorage } = setupLocalStorage();
      mockLocalStorage.getItem.mockReturnValue('"1M"'); // JSON string, not array

      const { result } = renderHook(() =>
        useChartTimeframes('multi_tfs', defaultTimeframes, validTimeframes)
      );

      expect(result.current[0]).toEqual(defaultTimeframes);
    });

    it('falls back to defaults when stored value is malformed JSON', () => {
      const { mockLocalStorage } = setupLocalStorage();
      mockLocalStorage.getItem.mockReturnValue('not-json[{');

      const { result } = renderHook(() =>
        useChartTimeframes('multi_tfs', defaultTimeframes, validTimeframes)
      );

      expect(result.current[0]).toEqual(defaultTimeframes);
    });

    it('preserves order of valid timeframes from storage', () => {
      const { mockLocalStorage } = setupLocalStorage();
      // Non-default order
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(['1Y', '1D', '1W']));

      const { result } = renderHook(() =>
        useChartTimeframes('multi_tfs', defaultTimeframes, validTimeframes)
      );

      expect(result.current[0]).toEqual(['1Y', '1D', '1W']);
    });
  });
});
```