# VO-306: Implement keyboard navigation for news feed panel

## Technical Design

## Technical Design Spec: VO-351 — News Feed Keyboard Navigation

---

### Approach

Scope keyboard handling entirely to the `NewsFeed` component using a local event handler on the list container — no global hook changes. Arrow keys, Enter/Space, Home/End, and Escape are intercepted only when focus lives inside the panel, which eliminates conflict risk with `useKeyboardShortcuts.ts`. Programmatic focus is managed via a `refs` array keyed by item index.

---

### Files to Modify / Create

| Action | Path |
|---|---|
| Modify | `frontend/src/components/dashboard/NewsFeed.tsx` |
| Modify | `frontend/src/components/KeyboardShortcutsModal.tsx` |
| Create | `frontend/src/hooks/useNewsFeedKeyboard.ts` |

---

### Data Model Changes

None. Pure frontend feature.

---

### API Changes

None.

---

### Frontend Changes

**`useNewsFeedKeyboard.ts`** (new hook)
- Accepts `itemCount`, `onOpen(index)`, `onClose()` callbacks
- Returns `focusedIndex`, `setFocusedIndex`, `itemRefs`, `handleKeyDown`
- `handleKeyDown` maps:
  - `ArrowDown` → `focusedIndex + 1`, clamp to `itemCount - 1`, `e.preventDefault()`
  - `ArrowUp` → `focusedIndex - 1`, clamp to `0`, `e.preventDefault()`
  - `Home` → `0`; `End` → `itemCount - 1`
  - `Enter` / `Space` → call `onOpen(focusedIndex)`
  - `Escape` → call `onClose()`, blur active element
- `useEffect` fires `itemRefs[focusedIndex]?.current?.focus()` when index changes

**`NewsFeed.tsx`** changes
- List container: `role="list"` + `aria-label="News feed"`
- Each article `<div>` → `role="listitem"`, `tabIndex={0}`, `ref={itemRefs[i]}`
- `aria-label={`${item.ticker}: ${item.title}, ${timeAgo}, ${item.sentiment_label}`}`
- `onKeyDown={handleKeyDown}` on the container (event delegation)
- `onFocus` on each item → `setFocusedIndex(i)` to sync hook state on mouse/tab focus
- Focus ring: add `focus:outline-none focus:ring-2 focus:ring-blue-500 focus:rounded-md` to item class
- `aria-live="polite"` region wrapping the list for screen reader announcements on refresh

**`KeyboardShortcutsModal.tsx`** changes
- Add a `"News Feed"` group to `SHORTCUT_GROUPS` with entries for `↑↓`, `Enter/Space`, `Esc`, `Home/End`

---

### Testing Strategy

Single test file: `frontend/src/__tests__/NewsFeed.keyboard.test.tsx` using **React Testing Library**.

- Render component with mocked `useApi` returning fixture articles
- `fireEvent.keyDown(container, { key: 'ArrowDown' })` → assert second item receives focus
- `ArrowUp` from index 0 → assert index stays at 0 (no wrap)
- `Home` / `End` → assert first/last item focused
- `Enter` on focused item → assert `window.open` called with correct URL
- `Escape` → assert `document.activeElement` is no longer inside the list
- Assert ARIA attributes: `role="list"`, `role="listitem"`, `aria-label` content includes headline + ticker
- Assert focus ring class present on focused item

No backend tests required.
