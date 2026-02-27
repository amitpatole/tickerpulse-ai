/**
 * Tests for WatchlistTabs Refetch Integration
 *
 * Design Spec: "Data integration hardening — `useDashboardData` already batch-fetches
 * and merges WS prices, but `WatchlistTabs` / `AIRatingsPanel` diverge on watchlist-scoped
 * refetch triggers. Unify the state surface."
 *
 * This test validates that when a watchlist is created/deleted/renamed, the parent
 * can use onGroupsChanged to refetch dashboard data scoped to the active watchlist.
 *
 * Acceptance Criteria:
 * 1. onGroupsChanged fires with complete updated list after each CRUD operation
 * 2. Parent can distinguish between "groups changed" and "active watchlist data changed"
 * 3. Switching watchlist (onSelect) does NOT duplicate refetch (separate concern)
 * 4. Error in watchlist CRUD does NOT trigger refetch (graceful degradation)
 */

import React, { useState, useCallback } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Watchlist } from '@/lib/types';
import * as api from '@/lib/api';

jest.mock('@/lib/api', () => ({
  listWatchlists: jest.fn(),
  createWatchlist: jest.fn(),
  renameWatchlistGroup: jest.fn(),
  deleteWatchlistGroup: jest.fn(),
}));

jest.mock('lucide-react', () => ({
  Plus: () => <div />,
  Pencil: () => <div />,
  Trash2: () => <div />,
  Check: () => <div />,
  X: () => <div />,
  Loader2: () => <div />,
}));

jest.mock('clsx', () => ({
  __esModule: true,
  default: (...args: any[]) => args.flat().filter(Boolean).join(' '),
}));

import WatchlistTabs from '../WatchlistTabs';

const mockWatchlists: Watchlist[] = [
  { id: 1, name: 'Tech', stock_count: 3 },
  { id: 2, name: 'Finance', stock_count: 2 },
];

describe('WatchlistTabs — Refetch Integration (Design Spec Pattern)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.listWatchlists as jest.Mock).mockResolvedValue(mockWatchlists);
  });

  /**
   * AC1: onGroupsChanged fires with complete list after CRUD
   * Demonstrates: Parent can use this to refetch watchlist-scoped data
   */
  test('fires onGroupsChanged with complete updated list when watchlist created', async () => {
    // GIVEN: Parent component tracking group changes
    let lastGroupsState: Watchlist[] = [];
    let refetchCount = 0;

    const Parent = () => {
      const [groups, setGroups] = useState<Watchlist[]>([]);

      const handleGroupsChanged = useCallback((updatedGroups: Watchlist[]) => {
        // This is what parent does: store new state and trigger refetch
        lastGroupsState = updatedGroups;
        refetchCount++;
      }, []);

      return (
        <>
          <div data-testid="group-count">{groups.length}</div>
          <WatchlistTabs
            activeId={1}
            onSelect={() => {}}
            onGroupsChanged={handleGroupsChanged}
          />
        </>
      );
    };

    (api.createWatchlist as jest.Mock).mockResolvedValue({
      id: 3,
      name: 'Healthcare',
      stock_count: 0,
    });

    render(<Parent />);

    await waitFor(() => {
      expect(screen.getByText('Tech')).toBeInTheDocument();
    });

    // Initial load fires onGroupsChanged
    expect(refetchCount).toBe(1);
    expect(lastGroupsState).toEqual(mockWatchlists);

    // WHEN: User creates new watchlist
    fireEvent.click(screen.getByLabelText('Create new watchlist group'));
    const input = screen.getByPlaceholderText('Group name…');
    await userEvent.type(input, 'Healthcare');
    fireEvent.keyDown(input, { key: 'Enter' });

    // THEN: onGroupsChanged fires with new list
    await waitFor(() => {
      expect(refetchCount).toBe(2);
    });

    // THEN: lastGroupsState should include new watchlist
    expect(lastGroupsState).toHaveLength(3);
    expect(lastGroupsState).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 3, name: 'Healthcare' }),
      ])
    );
  });

  /**
   * AC2: Parent can distinguish between "groups changed" and "active watchlist changed"
   * Demonstrates: Separate refetch concerns (watchlist list vs. watchlist data)
   */
  test('parent can separate "groups changed" from "active watchlist selected"', async () => {
    // GIVEN: Parent tracks both events separately
    const events: string[] = [];

    const Parent = () => {
      const handleGroupsChanged = useCallback((groups: Watchlist[]) => {
        events.push(`groups-changed: ${groups.length} groups`);
      }, []);

      const handleSelectWatchlist = useCallback((id: number) => {
        events.push(`selected: watchlist ${id}`);
      }, []);

      return (
        <WatchlistTabs
          activeId={1}
          onSelect={handleSelectWatchlist}
          onGroupsChanged={handleGroupsChanged}
        />
      );
    };

    render(<Parent />);

    await waitFor(() => {
      expect(screen.getByText('Tech')).toBeInTheDocument();
    });

    events.length = 0; // Clear initial load event

    // WHEN: User selects different watchlist
    fireEvent.click(screen.getByRole('tab', { name: /Finance/ }));

    // THEN: Only onSelect fires, NOT onGroupsChanged
    await waitFor(() => {
      expect(events).toEqual(['selected: watchlist 2']);
    });

    // WHEN: User creates new watchlist
    (api.createWatchlist as jest.Mock).mockResolvedValue({
      id: 3,
      name: 'New',
      stock_count: 0,
    });

    fireEvent.click(screen.getByLabelText('Create new watchlist group'));
    const input = screen.getByPlaceholderText('Group name…');
    await userEvent.type(input, 'New');
    fireEvent.keyDown(input, { key: 'Enter' });

    // THEN: Both callbacks fire, but can be handled separately
    await waitFor(() => {
      expect(events).toContain('groups-changed: 3 groups');
      expect(events).toContain('selected: watchlist 3');
    });
  });

  /**
   * AC3: Switching watchlist does NOT duplicate refetch
   * Demonstrates: onSelect and onGroupsChanged serve different purposes
   */
  test('switching watchlist triggers onSelect only, not onGroupsChanged', async () => {
    // GIVEN: Tracking all callback invocations
    const onSelectCalls: number[] = [];
    const onGroupsChangedCalls: number[] = [];

    const Parent = () => {
      return (
        <WatchlistTabs
          activeId={1}
          onSelect={(id) => onSelectCalls.push(id)}
          onGroupsChanged={(groups) => onGroupsChangedCalls.push(groups.length)}
        />
      );
    };

    render(<Parent />);

    await waitFor(() => {
      expect(screen.getByText('Tech')).toBeInTheDocument();
    });

    // onGroupsChanged fired once during load
    expect(onGroupsChangedCalls).toEqual([2]);
    onSelectCalls.length = 0;
    onGroupsChangedCalls.length = 0;

    // WHEN: User clicks another tab
    fireEvent.click(screen.getByRole('tab', { name: /Finance/ }));

    // THEN: Only onSelect fires
    await waitFor(() => {
      expect(onSelectCalls).toEqual([2]);
      expect(onGroupsChangedCalls).toEqual([]);
    });
  });

  /**
   * AC4: Error in CRUD does NOT trigger refetch
   * Demonstrates: Graceful degradation, parent only refetches on success
   */
  test('error during watchlist creation does NOT fire onGroupsChanged', async () => {
    // GIVEN: CreateWatchlist throws error
    const onGroupsChangedCalls: number[] = [];

    (api.createWatchlist as jest.Mock).mockRejectedValue(
      new Error('Quota exceeded')
    );

    const Parent = () => {
      return (
        <WatchlistTabs
          activeId={1}
          onSelect={jest.fn()}
          onGroupsChanged={(groups) => onGroupsChangedCalls.push(groups.length)}
        />
      );
    };

    render(<Parent />);

    await waitFor(() => {
      expect(screen.getByText('Tech')).toBeInTheDocument();
    });

    onGroupsChangedCalls.length = 0; // Clear initial load

    // WHEN: User tries to create and fails
    fireEvent.click(screen.getByLabelText('Create new watchlist group'));
    const input = screen.getByPlaceholderText('Group name…');
    await userEvent.type(input, 'Invalid');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Quota exceeded')).toBeInTheDocument();
    });

    // THEN: onGroupsChanged should NOT fire (no new data to refetch)
    expect(onGroupsChangedCalls).toEqual([]);
  });

  /**
   * Bonus: Shows parent refetch pattern using composition
   * Demonstrates: How parent wires refetch on group changes
   */
  test('parent can wire watchlist change to refetch dashboard data', async () => {
    // GIVEN: Parent component that refetches when watchlist groups change
    let dashboardRefreshCount = 0;
    let currentWatchlistId = 1;

    const mockDashboardRefetch = jest.fn().mockImplementation(() => {
      dashboardRefreshCount++;
      return Promise.resolve();
    });

    const Parent = () => {
      const [activeWatchlist, setActiveWatchlist] = useState(1);

      const handleGroupsChanged = async (groups: Watchlist[]) => {
        // Parent refetches dashboard data when groups change
        // (e.g., new watchlist created, so dashboard might show different totals)
        await mockDashboardRefetch();
      };

      return (
        <>
          <div data-testid="active-id">{activeWatchlist}</div>
          <WatchlistTabs
            activeId={activeWatchlist}
            onSelect={setActiveWatchlist}
            onGroupsChanged={handleGroupsChanged}
          />
        </>
      );
    };

    (api.createWatchlist as jest.Mock).mockResolvedValue({
      id: 3,
      name: 'New Watchlist',
      stock_count: 0,
    });

    render(<Parent />);

    await waitFor(() => {
      expect(screen.getByText('Tech')).toBeInTheDocument();
    });

    // Refetch was called once during initial load
    expect(dashboardRefreshCount).toBe(1);

    // WHEN: User creates new watchlist
    fireEvent.click(screen.getByLabelText('Create new watchlist group'));
    const input = screen.getByPlaceholderText('Group name…');
    await userEvent.type(input, 'New Watchlist');
    fireEvent.keyDown(input, { key: 'Enter' });

    // THEN: Dashboard refetch should be triggered
    await waitFor(() => {
      expect(dashboardRefreshCount).toBe(2);
      expect(mockDashboardRefetch).toHaveBeenCalledTimes(2);
    });

    // WHEN: User switches watchlist (NOT a group change)
    fireEvent.click(screen.getByRole('tab', { name: /Finance/ }));

    // THEN: Refetch NOT triggered again (only onSelect fired)
    expect(dashboardRefreshCount).toBe(2);

    // WHEN: User renames watchlist (group change)
    (api.renameWatchlistGroup as jest.Mock).mockResolvedValue({
      id: 2,
      name: 'Financials',
      stock_count: 2,
    });

    const financeTab = screen.getAllByText('Finance')[0].closest('div');
    fireEvent.mouseEnter(financeTab!);
    fireEvent.click(screen.getByLabelText('Rename Finance'));

    const renameInput = screen.getByDisplayValue('Finance');
    await userEvent.clear(renameInput);
    await userEvent.type(renameInput, 'Financials');
    fireEvent.keyDown(renameInput, { key: 'Enter' });

    // THEN: Refetch triggered again
    await waitFor(() => {
      expect(dashboardRefreshCount).toBe(3);
    });
  });

  /**
   * Pattern validation: Unifying state surface
   * Demonstrates: Design goal of single source of truth
   */
  test('unified state surface: onGroupsChanged contains all group data for parent refetch', async () => {
    // GIVEN: Parent that maintains unified watchlist state
    const ParentState = {
      groups: [] as Watchlist[],
      activeId: 1,
      refetchTriggerCount: 0,
    };

    const Parent = () => {
      return (
        <WatchlistTabs
          activeId={ParentState.activeId}
          onSelect={(id) => {
            ParentState.activeId = id;
          }}
          onGroupsChanged={(groups) => {
            // Single unified state update from WatchlistTabs
            ParentState.groups = groups;
            ParentState.refetchTriggerCount++;
          }}
        />
      );
    };

    render(<Parent />);

    await waitFor(() => {
      expect(screen.getByText('Tech')).toBeInTheDocument();
    });

    // Initial state loaded
    expect(ParentState.groups).toEqual(mockWatchlists);
    expect(ParentState.activeId).toBe(1);
    expect(ParentState.refetchTriggerCount).toBe(1);

    // WHEN: Multiple operations occur
    const operations = [
      {
        name: 'create',
        action: async () => {
          (api.createWatchlist as jest.Mock).mockResolvedValue({
            id: 3,
            name: 'New',
            stock_count: 0,
          });
          fireEvent.click(screen.getByLabelText('Create new watchlist group'));
          const input = screen.getByPlaceholderText('Group name…');
          await userEvent.type(input, 'New');
          fireEvent.keyDown(input, { key: 'Enter' });
        },
      },
    ];

    for (const op of operations) {
      await op.action();
    }

    // THEN: Parent state is consistent and refetch triggered
    await waitFor(() => {
      expect(ParentState.refetchTriggerCount).toBe(2);
      expect(ParentState.groups.length).toBe(3);
    });
  });
});
