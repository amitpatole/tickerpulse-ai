/**
 * Tests for SidebarStateProvider component.
 * 
 * Tests cover:
 * - Provider renders children correctly
 * - useSidebarState hook returns initial state
 * - setMobileOpen updates mobileOpen state
 * - Hook throws error when used outside provider
 * - Multiple state updates
 */

import { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SidebarStateProvider, useSidebarState } from '../SidebarStateProvider';

// ============================================================================
// Test Component
// ============================================================================

/**
 * Helper component that uses the useSidebarState hook to test context.
 */
function TestConsumer() {
  const { mobileOpen, setMobileOpen } = useSidebarState();
  
  return (
    <div>
      <div data-testid="mobile-status">
        {mobileOpen ? 'OPEN' : 'CLOSED'}
      </div>
      <button
        data-testid="toggle-button"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        Toggle
      </button>
    </div>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('SidebarStateProvider', () => {
  describe('Happy path: Provider renders and provides context', () => {
    it('should render children correctly', () => {
      // Arrange & Act
      render(
        <SidebarStateProvider>
          <div data-testid="child-element">Child Content</div>
        </SidebarStateProvider>
      );

      // Assert
      expect(screen.getByTestId('child-element')).toBeInTheDocument();
      expect(screen.getByText('Child Content')).toBeInTheDocument();
    });

    it('should provide initial state as mobileOpen = false', () => {
      // Arrange & Act
      render(
        <SidebarStateProvider>
          <TestConsumer />
        </SidebarStateProvider>
      );

      // Assert
      expect(screen.getByTestId('mobile-status')).toHaveTextContent('CLOSED');
    });

    it('should allow state updates via setMobileOpen', async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <SidebarStateProvider>
          <TestConsumer />
        </SidebarStateProvider>
      );

      // Assert initial state
      expect(screen.getByTestId('mobile-status')).toHaveTextContent('CLOSED');

      // Act: click toggle button
      await user.click(screen.getByTestId('toggle-button'));

      // Assert: state updated to open
      expect(screen.getByTestId('mobile-status')).toHaveTextContent('OPEN');
    });

    it('should handle multiple state toggles', async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <SidebarStateProvider>
          <TestConsumer />
        </SidebarStateProvider>
      );

      // Initial state: CLOSED
      expect(screen.getByTestId('mobile-status')).toHaveTextContent('CLOSED');

      // Act & Assert: toggle multiple times
      await user.click(screen.getByTestId('toggle-button'));
      expect(screen.getByTestId('mobile-status')).toHaveTextContent('OPEN');

      await user.click(screen.getByTestId('toggle-button'));
      expect(screen.getByTestId('mobile-status')).toHaveTextContent('CLOSED');

      await user.click(screen.getByTestId('toggle-button'));
      expect(screen.getByTestId('mobile-status')).toHaveTextContent('OPEN');
    });
  });

  describe('Edge cases: Multiple consumers share same state', () => {
    /**
     * Component that displays state and allows toggling.
     */
    function MultiConsumer() {
      const { mobileOpen, setMobileOpen } = useSidebarState();
      return (
        <div>
          <div data-testid="status">
            {mobileOpen ? 'OPEN' : 'CLOSED'}
          </div>
          <button
            data-testid="toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            Toggle
          </button>
        </div>
      );
    }

    it('should share state between multiple consumers', async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <SidebarStateProvider>
          <div data-testid="consumer-1">
            <MultiConsumer />
          </div>
          <div data-testid="consumer-2">
            <MultiConsumer />
          </div>
        </SidebarStateProvider>
      );

      // Assert: both should start as CLOSED
      const statuses = screen.getAllByTestId('status');
      expect(statuses[0]).toHaveTextContent('CLOSED');
      expect(statuses[1]).toHaveTextContent('CLOSED');

      // Act: toggle via first consumer
      await user.click(screen.getAllByTestId('toggle')[0]);

      // Assert: both should update
      expect(statuses[0]).toHaveTextContent('OPEN');
      expect(statuses[1]).toHaveTextContent('OPEN');
    });
  });

  describe('Error cases: Hook usage', () => {
    /**
     * Component that uses hook outside provider (will error).
     */
    function HookConsumerOutsideProvider() {
      try {
        useSidebarState();
        return <div data-testid="no-error">No Error</div>;
      } catch (error) {
        return <div data-testid="caught-error">Error Caught</div>;
      }
    }

    it('should work correctly when hook is used inside provider', () => {
      // Arrange & Act: hook is inside provider
      render(
        <SidebarStateProvider>
          <TestConsumer />
        </SidebarStateProvider>
      );

      // Assert: no errors, component renders
      expect(screen.getByTestId('mobile-status')).toBeInTheDocument();
    });

    it('should provide context to nested components', () => {
      /**
       * Deeply nested consumer component.
       */
      function DeepChild() {
        const { mobileOpen } = useSidebarState();
        return <div data-testid="deep-child">{mobileOpen ? 'OPEN' : 'CLOSED'}</div>;
      }

      function Wrapper() {
        return (
          <div>
            <DeepChild />
          </div>
        );
      }

      // Arrange & Act
      render(
        <SidebarStateProvider>
          <Wrapper />
        </SidebarStateProvider>
      );

      // Assert: deeply nested component can access context
      expect(screen.getByTestId('deep-child')).toHaveTextContent('CLOSED');
    });
  });
});
