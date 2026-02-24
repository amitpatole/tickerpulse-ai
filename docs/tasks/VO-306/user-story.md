# VO-306: Implement keyboard navigation for news feed panel

## User Story

# User Story: Keyboard Navigation for News Feed Panel

---

## User Story

**As a** power-user trader monitoring multiple news feeds,
**I want** to navigate the news feed panel entirely via keyboard,
**so that** I can scan and act on news items without breaking my workflow or reaching for the mouse.

---

## Acceptance Criteria

- **Arrow keys** (`↑`/`↓`) move focus between news items in the panel
- **`Enter`** or **`Space`** expands/opens the focused news item (detail view or external link)
- **`Escape`** collapses an open item and returns focus to the feed list
- **`Home`/`End`** jump to first/last item in the feed
- **`Tab`** moves focus out of the panel to the next UI region (standard tab order)
- Focused item is visually distinct (visible focus ring, not just color — accessibility requirement)
- Keyboard navigation works whether the panel is docked or in floating mode
- Screen reader announces item headline and timestamp when focused (ARIA roles/labels)
- No keyboard shortcut conflicts with existing global bindings

---

## Priority Reasoning

**Medium-High.** This is a power-user feature that directly improves trading workflow efficiency — our core value prop. News feeds are time-sensitive; mouse dependency is friction. Also addresses baseline accessibility compliance. Not blocking any current sprint, but high ROI for engaged users. Ships after any open P0 bugs.

---

## Estimated Complexity

**3 / 5**

Standard keyboard event handling and ARIA work, but requires audit of existing focus management across panel modes (docked vs. floating) and conflict-checking against global keybindings. No backend changes needed.
