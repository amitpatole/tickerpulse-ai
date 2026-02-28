'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react';
import {
  listWatchlists,
  createWatchlist,
  renameWatchlistGroup,
  deleteWatchlistGroup,
} from '@/lib/api';
import type { Watchlist } from '@/lib/types';
import { useWatchlistTab } from '@/hooks/useWatchlistTab';

interface WatchlistTabsProps {
  activeId: number;
  onSelect: (id: number) => void;
  /** Called after any create / rename / delete so the parent can react if needed. */
  onGroupsChanged?: (groups: Watchlist[]) => void;
}

export default function WatchlistTabs({
  activeId,
  onSelect,
  onGroupsChanged,
}: WatchlistTabsProps) {
  const [groups, setGroups] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const newInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const { tabId: persistedTabId, setTabId, isLoading: persistedLoading } = useWatchlistTab();
  const restoredRef = useRef(false);

  async function load() {
    try {
      const data = await listWatchlists();
      setGroups(data);
      onGroupsChanged?.(data);
    } catch {
      setError('Failed to load watchlist groups');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (creatingNew) newInputRef.current?.focus();
  }, [creatingNew]);

  useEffect(() => {
    if (editingId !== null) editInputRef.current?.focus();
  }, [editingId]);

  // Restore persisted active tab once both groups and persisted state are ready.
  // restoredRef guards against re-running if deps change after the first run.
  useEffect(() => {
    if (loading || persistedLoading || restoredRef.current || groups.length === 0) return;
    restoredRef.current = true;
    if (persistedTabId !== undefined && groups.some((g) => g.id === persistedTabId)) {
      onSelect(persistedTabId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, persistedLoading, groups.length]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createWatchlist(name);
      const next = [...groups, created];
      setGroups(next);
      setNewName('');
      setCreatingNew(false);
      onSelect(created.id);
      setTabId(created.id);
      onGroupsChanged?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create watchlist');
    } finally {
      setSaving(false);
    }
  }

  async function handleRename(id: number) {
    const name = editName.trim();
    if (!name) {
      setEditingId(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await renameWatchlistGroup(id, name);
      const next = groups.map((g) => (g.id === id ? { ...g, name: updated.name } : g));
      setGroups(next);
      setEditingId(null);
      onGroupsChanged?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename watchlist');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (groups.length <= 1) {
      setError('Cannot delete the last watchlist');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await deleteWatchlistGroup(id);
      const next = groups.filter((g) => g.id !== id);
      setGroups(next);
      if (activeId === id && next.length > 0) {
        onSelect(next[0].id);
        setTabId(next[0].id);
      }
      onGroupsChanged?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete watchlist');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-10 items-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span className="text-sm">Loading groups…</span>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div
        className="flex items-center gap-1 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Watchlist groups"
      >
        {groups.map((group) => {
          const isActive = group.id === activeId;
          const isEditing = editingId === group.id;

          return (
            <div
              key={group.id}
              className={`group flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/40'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
              }`}
            >
              {isEditing ? (
                <>
                  <input
                    ref={editInputRef}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(group.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="w-28 rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-sm text-white outline-none focus:border-blue-500"
                    maxLength={100}
                    aria-label={`Rename ${group.name}`}
                  />
                  <button
                    onClick={() => handleRename(group.id)}
                    disabled={saving || !editName.trim()}
                    aria-label="Confirm rename"
                    className="text-green-400 hover:text-green-300 disabled:opacity-40"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    aria-label="Cancel rename"
                    className="text-slate-500 hover:text-slate-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      onSelect(group.id);
                      setTabId(group.id);
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <span>{group.name}</span>
                    <span className="rounded-full bg-slate-700/60 px-1.5 py-0.5 text-xs text-slate-400">
                      {group.stock_count}
                    </span>
                  </button>
                  <div className="ml-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      onClick={() => {
                        setEditingId(group.id);
                        setEditName(group.name);
                        setError(null);
                      }}
                      aria-label={`Rename ${group.name}`}
                      className="rounded p-0.5 text-slate-500 hover:text-slate-300"
                    >
                      <Pencil className="h-3 w-3" aria-hidden="true" />
                    </button>
                    {groups.length > 1 && (
                      <button
                        onClick={() => handleDelete(group.id)}
                        aria-label={`Delete ${group.name}`}
                        className="rounded p-0.5 text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* New group — inline form or trigger button */}
        {creatingNew ? (
          <div className="flex shrink-0 items-center gap-1">
            <input
              ref={newInputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') {
                  setCreatingNew(false);
                  setNewName('');
                }
              }}
              placeholder="Group name…"
              maxLength={100}
              className="w-32 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500"
              aria-label="New watchlist group name"
            />
            <button
              onClick={handleCreate}
              disabled={saving || !newName.trim()}
              aria-label="Confirm create group"
              className="text-green-400 hover:text-green-300 disabled:opacity-40"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={() => {
                setCreatingNew(false);
                setNewName('');
                setError(null);
              }}
              aria-label="Cancel create group"
              className="text-slate-500 hover:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setCreatingNew(true);
              setError(null);
            }}
            aria-label="Create new watchlist group"
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-700/50 hover:text-slate-300"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>New</span>
          </button>
        )}
      </div>

      {error && (
        <p className="mt-1 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
