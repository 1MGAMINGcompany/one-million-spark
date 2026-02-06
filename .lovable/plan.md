
# Fix: Add QueryClientProvider to App Root

## Problem
The app crashes with **"No QueryClient set, use QueryClientProvider to set one"** on all game routes (`/play/:roomPda`). This prevents:
- Games from loading
- Forfeit button from working
- Users from closing stuck rooms

## Root Cause
In my last edit, I added `useQueryClient()` to the `useForfeit` hook to invalidate stale room data after settlement. However, the app never had a `QueryClientProvider` in its provider hierarchy.

React Query requires a `QueryClientProvider` wrapping the app to make `useQueryClient()` work. Without it, any component that calls `useQueryClient()` will crash.

## Solution
Add `QueryClientProvider` to the provider hierarchy in `App.tsx`. This is a standard React Query setup that should have been in place.

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Import `QueryClient`, `QueryClientProvider` from `@tanstack/react-query`; create a `queryClient` instance; wrap the app with `QueryClientProvider` |

## Implementation

```text
Current provider hierarchy in App.tsx:
┌─ AppErrorBoundary ─────────────────────┐
│ ┌─ SolanaProvider ───────────────────┐ │
│ │ ┌─ TxLockProvider ───────────────┐ │ │
│ │ │ ┌─ LoadingProvider ──────────┐ │ │ │
│ │ │ │ ... other providers        │ │ │ │
│ │ │ │ ┌─ BrowserRouter ────────┐ │ │ │ │
│ │ │ │ │ <AppContent />         │ │ │ │ │
│ │ │ │ └────────────────────────┘ │ │ │ │
│ │ │ └────────────────────────────┘ │ │ │
│ │ └────────────────────────────────┘ │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘

After fix:
┌─ AppErrorBoundary ─────────────────────┐
│ ┌─ QueryClientProvider ──────────────┐ │  <-- NEW
│ │ ┌─ SolanaProvider ───────────────┐ │ │
│ │ │ ...                            │ │ │
│ │ └────────────────────────────────┘ │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

## Code Changes for `src/App.tsx`

Add imports at top:
```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
```

Create the QueryClient instance (outside component to prevent recreation on re-renders):
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});
```

Wrap App component:
```tsx
const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <SolanaProvider>
        {/* ... rest of providers unchanged ... */}
      </SolanaProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);
```

## Expected Behavior After Fix
1. Game pages load without crashing
2. Forfeit button works and properly invalidates cache
3. After forfeiting, the room disappears from UI immediately
4. Users can create new rooms after settling old ones
