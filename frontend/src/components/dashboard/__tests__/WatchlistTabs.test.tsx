/**
 * Tests for WatchlistTabs Component
 *
 * WatchlistTabs manages watchlist group lifecycle (create, rename, delete) and
 * triggers parent refetch via onGroupsChanged callback. This validates the
 * "watchlist-scoped refetch" pattern from the design spec.
 *
 * Coverage:
 * 1. Happy path: Create, rename, delete watchlist groups
 * 2. Error cases: API failures, validation
 * 3. Edge cases: Last watchlist deletion, empty names
 * 4. Integration: onGroupsChanged callback triggers data refresh
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Watchlist } from '@/lib/types';
import * as api from '@/lib/api';

// Mock the API module
jest.mock('@/lib/api', () => ({
  listWatchlists: jest.fn(),
  createWatchlist: jest.fn(),
  renameWatchlistGroup: jest.fn(),
  deleteWatchlistGroup: jest.fn(),
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Plus: () => <div data-testid="plus-icon" />,
  Pencil: () => <div data-testid="pencil-icon" />,
  Trash2: () => <div data-testid="trash-icon" />,
  Check: () => <div data-testid="check-icon" />,
  X: () => <div data-testid="x-icon" />,
  Loader2: () => <div data-testid="loader-icon" />,
}));

jest.mock('clsx', () => ({
  __esModule: true,
  default: (...args: any[]) => args.flat().filter(Boolean).join(' '),
}));

import WatchlistTabs from '../WatchlistTabs';

const mockWatchlists: Watchlist[] = [
  { id: 1, name: 'Tech Stocks', stock_count: 5 },
  { id: 2, name: 'Dividend Stocks', stock_count: 3 },
];

describe('WatchlistTabs — Lifecycle & Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.listWatchlists as jest.Mock).mockResolvedValue(mockWatchlists);
  });

  // ===== HAPPY PATH =====

  describe('Happy Path: Load and Display', () => {
    test('loads and displays watchlist groups on mount', async () => {
      // GIVEN: API returns watchlists
      // WHEN: Component mounts
      render(<WatchlistTabs activeId={1} onSelect={jest.fn()} />);

      // THEN: Groups should be displayed
      await waitFor(() => {
        expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
        expect(screen.getByText('Dividend Stocks')).toBeInTheDocument();
      });

      // THEN: Stock counts should show
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();

      // THEN: listWatchlists should be called once
      expect(api.listWatchlists).toHaveBeenCalledTimes(1);
    });

    test('highlights active watchlist and calls onSelect when clicked', async () => {
      // GIVEN: Component with activeId=1
      const onSelect = jest.fn();
      render(<WatchlistTabs activeId={1} onSelect={onSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
      });

      // WHEN: User clicks on inactive watchlist
      const dividentTab = screen.getByRole('tab', { name: /Dividend Stocks/ });
      fireEvent.click(dividentTab);

      // THEN: onSelect should be called with correct ID
      expect(onSelect).toHaveBeenCalledWith(2);
    });

    test('fires onGroupsChanged callback after load', async () => {
      // GIVEN: Component with onGroupsChanged callback
      const onGroupsChanged = jest.fn();
      render(
        <WatchlistTabs
          activeId={1}
          onSelect={jest.fn()}
          onGroupsChanged={onGroupsChanged}
        />
      );

      // WHEN: Component loads
      // THEN: onGroupsChanged should be called with loaded groups
      await waitFor(() => {
        expect(onGroupsChanged).toHaveBeenCalledWith(mockWatchlists);
      });
    });
  });

  // ===== CREATE WATCHLIST =====

  describe('Happy Path: Create Watchlist', () => {
    test('creates new watchlist and fires onGroupsChanged', async () => {
      // GIVEN: Component with mocked create
      const onGroupsChanged = jest.fn();
      const onSelect = jest.fn();
      const newWatchlist: Watchlist = { id: 3, name: 'New Watchlist', stock_count: 0 };

      (api.createWatchlist as jest.Mock).mockResolvedValue(newWatchlist);

      render(
        <WatchlistTabs
          activeId={1}
          onSelect={onSelect}
          onGroupsChanged={onGroupsChanged}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
      });

      // WHEN: User clicks "New" button
      const newBtn = screen.getByLabelText('Create new watchlist group');
      fireEvent.click(newBtn);

      // THEN: Input field should appear
      const input = screen.getByPlaceholderText('Group name…') as HTMLInputElement;
      expect(input).toBeInTheDocument();

      // WHEN: User types name and presses Enter
      await userEvent.type(input, 'New Watchlist');
      fireEvent.keyDown(input, { key: 'Enter' });

      // THEN: createWatchlist should be called
      await waitFor(() => {
        expect(api.createWatchlist).toHaveBeenCalledWith('New Watchlist');
      });

      // THEN: onSelect should be called with new ID
      expect(onSelect).toHaveBeenCalledWith(3);

      // THEN: onGroupsChanged should reflect new list
      await waitFor(() => {
        expect(onGroupsChanged).toHaveBeenLastCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ id: 3, name: 'New Watchlist' }),
          ])
        );
      });
    });

    test('clears input and hides form after successful create', async () => {
      // GIVEN: New watchlist creation
      const newWatchlist: Watchlist = { id: 3, name: 'New', stock_count: 0 };
      (api.createWatchlist as jest.Mock).mockResolvedValue(newWatchlist);

      render(<WatchlistTabs activeId={1} onSelect={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
      });

      // WHEN: User creates watchlist
      fireEvent.click(screen.getByLabelText('Create new watchlist group'));
      const input = screen.getByPlaceholderText('Group name…') as HTMLInputElement;
      await userEvent.type(input, 'New');
      fireEvent.keyDown(input, { key: 'Enter' });

      // THEN: Input should be gone and "New" button restored
      await waitFor(() => {
        expect(screen.getByLabelText('Create new watchlist group')).toBeInTheDocument();
      });
    });

    test('cancels create with Escape key', async () => {
      // GIVEN: Create form open
      render(<WatchlistTabs activeId={1} onSelect={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Create new watchlist group'));
      const input = screen.getByPlaceholderText('Group name…') as HTMLInputElement;

      // WHEN: User presses Escape
      fireEvent.keyDown(input, { key: 'Escape' });

      // THEN: Form should close
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Group name…')).not.toBeInTheDocument();
      });

      // THEN: API should not be called
      expect(api.createWatchlist).not.toHaveBeenCalled();
    });
  });

  // ===== RENAME WATCHLIST =====

  describe('Happy Path: Rename Watchlist', () => {
    test('renames watchlist and fires onGroupsChanged', async () => {
      // GIVEN: Component with mocked rename
      const onGroupsChanged = jest.fn();
      const renamed: Watchlist = { id: 1, name: 'Tech Giants', stock_count: 5 };

      (api.renameWatchlistGroup as jest.Mock).mockResolvedValue(renamed);

      render(
        <WatchlistTabs
          activeId={1}
          onSelect={jest.fn()}
          onGroupsChanged={onGroupsChanged}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
      });

      // WHEN: User hovers and clicks pencil icon
      const techStocksTab = screen.getAllByText('Tech Stocks')[0].closest('div');
      fireEvent.mouseEnter(techStocksTab!);

      const pencilBtn = screen.getByLabelText('Rename Tech Stocks');
      fireEvent.click(pencilBtn);

      // THEN: Rename input should appear
      const input = screen.getByDisplayValue('Tech Stocks') as HTMLInputElement;
      expect(input).toBeInTheDocument();

      // WHEN: User updates name and presses Enter
      await userEvent.clear(input);
      await userEvent.type(input, 'Tech Giants');
      fireEvent.keyDown(input, { key: 'Enter' });

      // THEN: renameWatchlistGroup should be called
      await waitFor(() => {
        expect(api.renameWatchlistGroup).toHaveBeenCalledWith(1, 'Tech Giants');
      });

      // THEN: onGroupsChanged should reflect rename
      await waitFor(() => {
        expect(onGroupsChanged).toHaveBeenLastCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ id: 1, name: 'Tech Giants' }),
          ])
        );
      });
    });

    test('cancels rename with Escape key', async () => {
      // GIVEN: Rename form open
      render(<WatchlistTabs activeId={1} onSelect={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
      });

      const techStocksTab = screen.getAllByText('Tech Stocks')[0].closest('div');
      fireEvent.mouseEnter(techStocksTab!);
      fireEvent.click(screen.getByLabelText('Rename Tech Stocks'));

      const input = screen.getByDisplayValue('Tech Stocks') as HTMLInputElement;

      // WHEN: User presses Escape
      fireEvent.keyDown(input, { key: 'Escape' });

      // THEN: Form should close
      await waitFor(() => {
        expect(screen.queryByDisplayValue('Tech Stocks')).not.toBeInTheDocument();
      });

      // THEN: API should not be called
      expect(api.renameWatchlistGroup).not.toHaveBeenCalled();
    });
  });

  // ===== DELETE WATCHLIST =====

  describe('Happy Path: Delete Watchlist', () => {
    test('deletes watchlist and switches to first remaining', async () => {
      // GIVEN: Multiple watchlists with delete mocked
      const onGroupsChanged = jest.fn();
      const onSelect = jest.fn();

      (api.deleteWatchlistGroup as jest.Mock).mockResolvedValue(undefined);

      render(
        <WatchlistTabs
          activeId={2}
          onSelect={onSelect}
          onGroupsChanged={onGroupsChanged}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Dividend Stocks')).toBeInTheDocument();
      });

      // WHEN: User hovers and clicks trash icon
      const dividendTab = screen.getAllByText('Dividend Stocks')[0].closest('div');
      fireEvent.mouseEnter(dividendTab!);

      const trashBtn = screen.getByLabelText('Delete Dividend Stocks');
      fireEvent.click(trashBtn);

      // THEN: deleteWatchlistGroup should be called
      await waitFor(() => {
        expect(api.deleteWatchlistGroup).toHaveBeenCalledWith(2);
      });

      // THEN: onSelect should switch to remaining group
      expect(onSelect).toHaveBeenCalledWith(1);

      // THEN: onGroupsChanged should reflect deletion
      await waitFor(() => {
        expect(onGroupsChanged).toHaveBeenLastCalledWith(
          expect.not.arrayContaining([
            expect.objectContaining({ id: 2 }),
          ])
        );
      });
    });
  });

  // ===== ERROR CASES =====

  describe('Error Cases: API Failures', () => {
    test('displays error message when load fails', async () => {
      // GIVEN: listWatchlists throws error
      (api.listWatchlists as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      render(<WatchlistTabs activeId={1} onSelect={jest.fn()} />);

      // THEN: Error message should display
      await waitFor(() => {
        expect(screen.getByText('Failed to load watchlist groups')).toBeInTheDocument();
      });
    });

    test('displays error message when create fails', async () => {
      // GIVEN: createWatchlist throws error
      (api.createWatchlist as jest.Mock).mockRejectedValue(
        new Error('Quota exceeded')
      );

      render(<WatchlistTabs activeId={1} onSelect={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
      });

      // WHEN: User tries to create
      fireEvent.click(screen.getByLabelText('Create new watchlist group'));
      const input = screen.getByPlaceholderText('Group name…');
      await userEvent.type(input, 'New');
      fireEvent.keyDown(input, { key: 'Enter' });

      // THEN: Error should display
      await waitFor(() => {
        expect(screen.getByText('Quota exceeded')).toBeInTheDocument();
      });
    });

    test('displays error message when rename fails', async () => {
      // GIVEN: renameWatchlistGroup throws error
      (api.renameWatchlistGroup as jest.Mock).mockRejectedValue(
        new Error('Name already exists')
      );

      render(<WatchlistTabs activeId={1} onSelect={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
      });

      // WHEN: User tries to rename
      const techTab = screen.getAllByText('Tech Stocks')[0].closest('div');
      fireEvent.mouseEnter(techTab!);
      fireEvent.click(screen.getByLabelText('Rename Tech Stocks'));

      const input = screen.getByDisplayValue('Tech Stocks');
      await userEvent.clear(input);
      await userEvent.type(input, 'Duplicate');
      fireEvent.keyDown(input, { key: 'Enter' });

      // THEN: Error should display
      await waitFor(() => {
        expect(screen.getByText('Name already exists')).toBeInTheDocument();
      });
    });

    test('displays error message when delete fails', async () => {
      // GIVEN: deleteWatchlistGroup throws error
      (api.deleteWatchlistGroup as jest.Mock).mockRejectedValue(
        new Error('Cannot delete default watchlist')
      );

      render(<WatchlistTabs activeId={1} onSelect={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
      });

      // WHEN: User tries to delete
      const techTab = screen.getAllByText('Tech Stocks')[0].closest('div');
      fireEvent.mouseEnter(techTab!);
      fireEvent.click(screen.getByLabelText('Delete Tech Stocks'));

      // THEN: Error should display
      await waitFor(() => {
        expect(screen.getByText('Cannot delete default watchlist')).toBeInTheDocument();
      });
    });
  });

  // ===== EDGE CASES =====

  describe('Edge Cases: Validation & Boundaries', () => {
    test('prevents deleting last watchlist', async () => {
      // GIVEN: Only one watchlist
      (api.listWatchlists as jest.Mock).mockResolvedValue([
        { id: 1, name: 'My Stocks', stock_count: 5 },
      ]);

      render(<WatchlistTabs activeId={1} onSelect={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('My Stocks')).toBeInTheDocument();
      });

      // WHEN: User tries to delete
      const tab = screen.getAllByText('My Stocks')[0].closest('div');
      fireEvent.mouseEnter(tab!);

      // THEN: Delete button should not be visible
      expect(screen.queryByLabelText('Delete My Stocks')).not.toBeInTheDocument();

      // THEN: Error should show if delete is attempted (shouldn't happen UI-wise)
      expect(screen.queryByText('Cannot delete the last watchlist')).not.toBeInTheDocument();
    });

    test('prevents create with empty name', async () => {
      // GIVEN: Create form open
      render(<WatchlistTabs activeId={1} onSelect={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Create new watchlist group'));
      const input = screen.getByPlaceholderText('Group name…') as HTMLInputElement;

      // WHEN: User tries to submit empty name
      fireEvent.keyDown(input, { key: 'Enter' });

      // THEN: API should not be called
      expect(api.createWatchlist).not.toHaveBeenCalled();
    });

    test('prevents rename with empty name (reverts to edit mode)', async () => {
      // GIVEN: Rename form open
      render(<WatchlistTabs activeId={1} onSelect={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
      });

      const tab = screen.getAllByText('Tech Stocks')[0].closest('div');
      fireEvent.mouseEnter(tab!);
      fireEvent.click(screen.getByLabelText('Rename Tech Stocks'));

      const input = screen.getByDisplayValue('Tech Stocks') as HTMLInputElement;

      // WHEN: User clears and tries to submit
      await userEvent.clear(input);
      fireEvent.keyDown(input, { key: 'Enter' });

      // THEN: API should not be called
      expect(api.renameWatchlistGroup).not.toHaveBeenCalled();

      // THEN: Edit mode should close
      await waitFor(() => {
        expect(screen.queryByDisplayValue('Tech Stocks')).not.toBeInTheDocument();
      });
    });

    test('handles whitespace-only names as empty', async () => {
      // GIVEN: Create form open
      render(<WatchlistTabs activeId={1} onSelect={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Create new watchlist group'));
      const input = screen.getByPlaceholderText('Group name…');

      // WHEN: User submits whitespace
      await userEvent.type(input, '   ');
      fireEvent.keyDown(input, { key: 'Enter' });

      // THEN: API should not be called
      expect(api.createWatchlist).not.toHaveBeenCalled();
    });

    test('clears error when user starts new create', async () => {
      // GIVEN: Error from previous create
      (api.createWatchlist as jest.Mock).mockRejectedValueOnce(
        new Error('Failed')
      );

      render(<WatchlistTabs activeId={1} onSelect={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
      });

      // Cause error
      fireEvent.click(screen.getByLabelText('Create new watchlist group'));
      const input = screen.getByPlaceholderText('Group name…');
      await userEvent.type(input, 'Bad');
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });

      // WHEN: User clicks New again
      fireEvent.click(screen.getByLabelText('Create new watchlist group'));

      // THEN: Error should be cleared
      expect(screen.queryByText('Failed')).not.toBeInTheDocument();
    });
  });

  // ===== INTEGRATION: WATCHLIST CHANGE TRIGGERS PARENT REFETCH =====

  describe('Integration: onGroupsChanged Triggers Parent Refetch', () => {
    test('fires onGroupsChanged with updated list after any CRUD operation', async () => {
      // GIVEN: Component with onGroupsChanged tracking all calls
      const onGroupsChanged = jest.fn();
      const newWatchlist: Watchlist = { id: 3, name: 'New', stock_count: 0 };

      (api.createWatchlist as jest.Mock).mockResolvedValue(newWatchlist);

      render(
        <WatchlistTabs
          activeId={1}
          onSelect={jest.fn()}
          onGroupsChanged={onGroupsChanged}
        />
      );

      // Initial call from load
      await waitFor(() => {
        expect(onGroupsChanged).toHaveBeenCalledTimes(1);
      });

      const initialCallCount = onGroupsChanged.mock.calls.length;

      // WHEN: User creates new watchlist
      fireEvent.click(screen.getByLabelText('Create new watchlist group'));
      const input = screen.getByPlaceholderText('Group name…');
      await userEvent.type(input, 'New');
      fireEvent.keyDown(input, { key: 'Enter' });

      // THEN: onGroupsChanged should fire again with updated list
      await waitFor(() => {
        expect(onGroupsChanged).toHaveBeenCalledTimes(initialCallCount + 1);
      });

      // Verify the new list includes the created watchlist
      const lastCall = onGroupsChanged.mock.calls[onGroupsChanged.mock.calls.length - 1];
      expect(lastCall[0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 3, name: 'New' }),
        ])
      );
    });

    test('parent can use onGroupsChanged to refetch dependent data', async () => {
      // GIVEN: Mock parent that tracks refetch calls
      const onGroupsChanged = jest.fn();
      const mockRefetch = jest.fn();

      (api.createWatchlist as jest.Mock).mockResolvedValue({
        id: 3,
        name: 'Test',
        stock_count: 0,
      });

      // Setup: Parent would refetch when groups change
      const ParentComponent = () => {
        const handleGroupsChanged = (groups: Watchlist[]) => {
          onGroupsChanged(groups);
          mockRefetch(); // Parent refetches dashboard data
        };

        return (
          <WatchlistTabs
            activeId={1}
            onSelect={jest.fn()}
            onGroupsChanged={handleGroupsChanged}
          />
        );
      };

      render(<ParentComponent />);

      await waitFor(() => {
        expect(onGroupsChanged).toHaveBeenCalledTimes(1); // Initial load
      });

      // WHEN: Watchlist is created
      fireEvent.click(screen.getByLabelText('Create new watchlist group'));
      const input = screen.getByPlaceholderText('Group name…');
      await userEvent.type(input, 'Test');
      fireEvent.keyDown(input, { key: 'Enter' });

      // THEN: Parent refetch should be triggered
      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalledTimes(1);
      });
    });
  });
});
