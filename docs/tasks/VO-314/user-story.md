# VO-314: Add earnings calendar widget to market overview dashboard

## User Story

# VO-312: Earnings Calendar Widget — Market Overview Dashboard

---

## User Story

**As a** retail trader using the market overview dashboard,
**I want** to see upcoming earnings announcements for stocks I follow,
**so that** I can anticipate volatility and make informed trading decisions before major catalysts.

---

## Acceptance Criteria

- [ ] Widget displays upcoming earnings events within a configurable lookahead window (default: 7 days)
- [ ] Each entry shows: ticker, company name, date, time (pre/post market), and EPS estimate if available
- [ ] Watchlist stocks are visually highlighted/prioritized at the top of the list
- [ ] Widget is visible on the market overview dashboard without requiring navigation
- [ ] Data refreshes automatically (max staleness: 1 hour)
- [ ] Clicking a ticker navigates to the stock detail page
- [ ] Widget degrades gracefully if data source is unavailable (shows last known data + stale indicator)
- [ ] Empty state handled cleanly when no earnings are upcoming in the window

---

## Priority Reasoning

**Medium-High.** Earnings events are the single biggest driver of short-term price volatility. Traders who miss an earnings date get burned. This is a low-friction, high-visibility feature that directly reduces a painful blind spot. Theo's instinct is right — it belongs on the dashboard, not buried in a separate calendar view.

---

## Estimated Complexity

**3 / 5**

Moderate. UI is straightforward. The complexity lives in the data layer: sourcing reliable earnings data (likely a third-party API), caching it appropriately, and filtering/sorting relative to a user's watchlist. No new auth or permissions required.
