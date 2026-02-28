import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useNewsFeedKeyboard } from '@/hooks/useNewsFeedKeyboard';

describe('useNewsFeedKeyboard Hook', () => {
  // Helper to create mock DOM element with focus
  const createMockElement = () => {
    return {
      focus: jest.fn(),
      querySelector: jest.fn(() => ({ click: jest.fn() })),
    } as any;
  };

  // Helper to create hook with proper ref context
  const createHook = (itemCount: number) => {
    return renderHook(() => {
      const containerRef = useRef<HTMLDivElement>(null);
      const hook = useNewsFeedKeyboard(itemCount, containerRef);
      return { ...hook, containerRef };
    });
  };

  // AC1: Navigate articles forward with arrow keys
  it('moves focus to next article on ArrowDown until boundary is reached', () => {
    const { result } = createHook(3);

    // Setup mock DOM elements with focus capability
    act(() => {
      for (let i = 0; i < 3; i++) {
        result.current.itemRefs.current[i] = createMockElement();
      }
    });

    // Activate panel - should focus first item
    act(() => {
      result.current.activatePanel();
    });
    expect(result.current.focusedIndex).toBe(0);

    // Move down to second item
    act(() => {
      const event = { key: 'ArrowDown', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });
    expect(result.current.focusedIndex).toBe(1);

    // Move down to third item
    act(() => {
      const event = { key: 'ArrowDown', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });
    expect(result.current.focusedIndex).toBe(2);

    // Move down at boundary - should clamp to last item (index 2)
    act(() => {
      const event = { key: 'ArrowDown', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });
    expect(result.current.focusedIndex).toBe(2);
  });

  // AC1: Navigate articles backward with arrow keys
  it('moves focus to previous article on ArrowUp and clamps at first item', () => {
    const { result } = createHook(3);

    // Setup mock DOM elements
    act(() => {
      for (let i = 0; i < 3; i++) {
        result.current.itemRefs.current[i] = createMockElement();
      }
    });

    // Activate panel
    act(() => {
      result.current.activatePanel();
    });
    expect(result.current.focusedIndex).toBe(0);

    // Navigate down one step (separate act to let state commit)
    act(() => {
      const event = { key: 'ArrowDown', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });
    expect(result.current.focusedIndex).toBe(1);

    // Move up to first item
    act(() => {
      const event = { key: 'ArrowUp', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });
    expect(result.current.focusedIndex).toBe(0);

    // Move up at boundary - should clamp to first item (index 0)
    act(() => {
      const event = { key: 'ArrowUp', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });
    expect(result.current.focusedIndex).toBe(0);
  });

  // AC2: Enter key opens article by triggering anchor click
  it('triggers anchor click on focused article when Enter is pressed', () => {
    const { result } = createHook(2);

    const mockAnchor = { click: jest.fn() };
    const mockItem = {
      focus: jest.fn(),
      querySelector: jest.fn(() => mockAnchor),
    } as any;

    act(() => {
      result.current.itemRefs.current[0] = mockItem;
      result.current.activatePanel();
    });

    expect(result.current.focusedIndex).toBe(0);

    act(() => {
      const event = { key: 'Enter', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });

    expect(mockItem.querySelector).toHaveBeenCalledWith('a');
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  // AC2: Escape key releases panel focus
  it('releases panel focus and calls blur on container when Escape is pressed', () => {
    const { result } = renderHook(() => {
      const containerRef = useRef<HTMLDivElement>(null);
      // Set the ref to a mock object that tracks blur calls
      containerRef.current = { blur: jest.fn() } as any;
      const hook = useNewsFeedKeyboard(3, containerRef);
      return { ...hook, containerRef };
    });

    // Setup mock items
    act(() => {
      for (let i = 0; i < 3; i++) {
        result.current.itemRefs.current[i] = createMockElement();
      }
    });

    // Activate panel
    act(() => {
      result.current.activatePanel();
    });
    expect(result.current.focusedIndex).toBe(0);

    const mockBlur = result.current.containerRef.current?.blur as jest.Mock;

    // Press Escape
    act(() => {
      const event = { key: 'Escape', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });

    // Should release focus and blur container
    expect(result.current.focusedIndex).toBeNull();
    expect(mockBlur).toHaveBeenCalled();
  });

  // Edge case: Empty articles list should handle gracefully
  it('handles empty articles list without errors and prevents navigation', () => {
    const { result } = createHook(0);

    expect(result.current.focusedIndex).toBeNull();

    // Try to activate - should not change state
    act(() => {
      result.current.activatePanel();
    });
    expect(result.current.focusedIndex).toBeNull();

    // Try to navigate - should not crash or change state
    act(() => {
      const event = { key: 'ArrowDown', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });
    expect(result.current.focusedIndex).toBeNull();
  });

  // Edge case: Focus clamping when article count decreases
  it('clamps focused index when article count decreases during refresh', () => {
    const { result, rerender } = renderHook(
      ({ itemCount }: { itemCount: number }) => {
        const containerRef = useRef<HTMLDivElement>(null);
        const hook = useNewsFeedKeyboard(itemCount, containerRef);
        return { ...hook, containerRef };
      },
      { initialProps: { itemCount: 5 } }
    );

    // Setup mock items
    act(() => {
      for (let i = 0; i < 5; i++) {
        result.current.itemRefs.current[i] = createMockElement();
      }
    });

    // Activate panel
    act(() => {
      result.current.activatePanel();
    });
    expect(result.current.focusedIndex).toBe(0);

    // Navigate to last item (index 4) - separate acts to let state commit between steps
    for (let i = 1; i <= 4; i++) {
      act(() => {
        const event = { key: 'ArrowDown', preventDefault: jest.fn() };
        result.current.handleKeyDown(event as any);
      });
      expect(result.current.focusedIndex).toBe(i);
    }

    // Decrease article count to 2 - should auto-clamp focusedIndex from 4 to 1
    act(() => {
      rerender({ itemCount: 2 });
    });
    expect(result.current.focusedIndex).toBe(1);
  });

  // Home key: Jump to first article immediately
  it('jumps to first article when Home key is pressed', () => {
    const { result } = createHook(10);

    // Setup mock items
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.itemRefs.current[i] = createMockElement();
      }
    });

    // Activate panel and navigate to middle
    act(() => {
      result.current.activatePanel();
    });
    for (let i = 0; i < 5; i++) {
      act(() => {
        const event = { key: 'ArrowDown', preventDefault: jest.fn() };
        result.current.handleKeyDown(event as any);
      });
    }
    expect(result.current.focusedIndex).toBe(5);

    // Press Home - should jump to first item
    act(() => {
      const event = { key: 'Home', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });
    expect(result.current.focusedIndex).toBe(0);
  });

  // End key: Jump to last article immediately
  it('jumps to last article when End key is pressed', () => {
    const { result } = createHook(10);

    // Setup mock items
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.itemRefs.current[i] = createMockElement();
      }
    });

    // Activate panel (starts at first item)
    act(() => {
      result.current.activatePanel();
    });
    expect(result.current.focusedIndex).toBe(0);

    // Press End - should jump to last item
    act(() => {
      const event = { key: 'End', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });
    expect(result.current.focusedIndex).toBe(9);
  });

  // PageDown: Move forward by PAGE_SIZE (5 items)
  it('moves forward by PAGE_SIZE (5) items when PageDown is pressed', () => {
    const { result } = createHook(15);

    // Setup mock items
    act(() => {
      for (let i = 0; i < 15; i++) {
        result.current.itemRefs.current[i] = createMockElement();
      }
    });

    // Activate panel at first item
    act(() => {
      result.current.activatePanel();
    });
    expect(result.current.focusedIndex).toBe(0);

    // Press PageDown - should move to index 5
    act(() => {
      const event = { key: 'PageDown', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });
    expect(result.current.focusedIndex).toBe(5);

    // Press PageDown again - should move to index 10
    act(() => {
      const event = { key: 'PageDown', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });
    expect(result.current.focusedIndex).toBe(10);

    // Press PageDown at boundary - should clamp to last item
    act(() => {
      const event = { key: 'PageDown', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });
    expect(result.current.focusedIndex).toBe(14);
  });

  // PageUp: Move backward by PAGE_SIZE (5 items)
  it('moves backward by PAGE_SIZE (5) items when PageUp is pressed', () => {
    const { result } = createHook(15);

    // Setup mock items
    act(() => {
      for (let i = 0; i < 15; i++) {
        result.current.itemRefs.current[i] = createMockElement();
      }
    });

    // Navigate to near the end
    act(() => {
      result.current.activatePanel();
    });
    for (let i = 0; i < 12; i++) {
      act(() => {
        const event = { key: 'ArrowDown', preventDefault: jest.fn() };
        result.current.handleKeyDown(event as any);
      });
    }
    expect(result.current.focusedIndex).toBe(12);

    // Press PageUp - should move back by 5 to index 7
    act(() => {
      const event = { key: 'PageUp', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });
    expect(result.current.focusedIndex).toBe(7);

    // Press PageUp again - should move back by 5 to index 2
    act(() => {
      const event = { key: 'PageUp', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });
    expect(result.current.focusedIndex).toBe(2);

    // Press PageUp at boundary - should clamp to first item
    act(() => {
      const event = { key: 'PageUp', preventDefault: jest.fn() };
      result.current.handleKeyDown(event as any);
    });
    expect(result.current.focusedIndex).toBe(0);
  });
});
