
# Unify All "Connect Wallet" Buttons to Use Same Handler

## Problem Summary
Multiple "Connect Wallet" buttons exist across the app with different implementations:
- **Working**: `WalletButton.tsx` (Navbar desktop + mobile dropdown)  
- **Broken/Incomplete**: Uses `useWalletModal().setVisible(true)` which opens the native modal instead of the custom deep-link-aware dialog

When users click connect buttons outside the Navbar, they get the native wallet-adapter modal which doesn't handle iOS deep links or Android MWA properly.

## Solution

### 1. Create Unified Hook: `src/hooks/useUnifiedWalletConnect.ts`

A single hook that exposes:
- `openWalletDialog()` - Opens the wallet chooser dialog
- `dialogOpen` / `setDialogOpen` - Dialog state
- All platform detection + handlers reused from WalletButton

This hook will NOT duplicate the WalletButton logic—it will export a **ref callback** that WalletButton can use to expose its dialog opener.

### 2. Create Wallet Connect Context: `src/contexts/WalletConnectContext.tsx`

Since WalletButton manages its own dialog state, we need a context to share the "open dialog" function across the app:

```typescript
// WalletConnectContext.tsx
interface WalletConnectContextType {
  openConnectDialog: () => void;
}

const WalletConnectContext = createContext<WalletConnectContextType | null>(null);

export function useConnectWallet() {
  const ctx = useContext(WalletConnectContext);
  if (!ctx) throw new Error("useConnectWallet must be used within WalletConnectProvider");
  return ctx;
}

export function WalletConnectProvider({ children }) {
  const [openFn, setOpenFn] = useState<(() => void) | null>(null);
  
  const registerOpenDialog = useCallback((fn: () => void) => {
    setOpenFn(() => fn);
  }, []);
  
  const openConnectDialog = useCallback(() => {
    openFn?.();
  }, [openFn]);
  
  return (
    <WalletConnectContext.Provider value={{ openConnectDialog, registerOpenDialog }}>
      {children}
    </WalletConnectContext.Provider>
  );
}
```

### 3. Update WalletButton to Register Its Dialog Opener

```typescript
// In WalletButton.tsx
const { registerOpenDialog } = useConnectWallet();

useEffect(() => {
  registerOpenDialog(() => setDialogOpen(true));
}, [registerOpenDialog]);
```

### 4. Replace All Other Connect Handlers

| File | Line(s) | Current | Replace With |
|------|---------|---------|--------------|
| `WalletGateModal.tsx` | 30-33 | `setVisible(true)` | `openConnectDialog()` |
| `AddFunds.tsx` | 151 | `setVisible(true)` | `openConnectDialog()` |
| `ConnectWalletGate.tsx` | 165 | Opens own dialog | Use `openConnectDialog()` |
| `Room.tsx` | 1169 | Opens WalletGateModal | Use `openConnectDialog()` directly |
| `ChessGame.tsx` | 1097-1101 | Text only | Add button with `openConnectDialog()` |
| `CheckersGame.tsx` | 1214-1218 | Text only | Add button with `openConnectDialog()` |
| `DominosGame.tsx` | 1309-1313 | Text only | Add button with `openConnectDialog()` |
| `LudoGame.tsx` | 984-988 | Text only | Add button with `openConnectDialog()` |
| `BackgammonGame.tsx` | 1923-1927 | Text only | Add button with `openConnectDialog()` |
| `MultiplayerGamePlaceholder.tsx` | 105-109 | Text only | Add button with `openConnectDialog()` |
| `WalletRequired.tsx` | 17-21 | Text only | Add button with `openConnectDialog()` |

### 5. Add Provider to App.tsx

Wrap app with `<WalletConnectProvider>` inside the existing SolanaProvider.

## File Changes Summary

| File | Change Type |
|------|-------------|
| `src/contexts/WalletConnectContext.tsx` | **NEW** - Context + hook |
| `src/components/WalletButton.tsx` | Register dialog opener |
| `src/App.tsx` | Add WalletConnectProvider |
| `src/components/WalletGateModal.tsx` | Use `openConnectDialog()` |
| `src/pages/AddFunds.tsx` | Use `openConnectDialog()` |
| `src/components/ConnectWalletGate.tsx` | Simplify to use `openConnectDialog()` |
| `src/pages/Room.tsx` | Use `openConnectDialog()` directly |
| `src/pages/ChessGame.tsx` | Add connect button |
| `src/pages/CheckersGame.tsx` | Add connect button |
| `src/pages/DominosGame.tsx` | Add connect button |
| `src/pages/LudoGame.tsx` | Add connect button |
| `src/pages/BackgammonGame.tsx` | Add connect button |
| `src/components/MultiplayerGamePlaceholder.tsx` | Add connect button |
| `src/components/WalletRequired.tsx` | Add connect button |

## What's NOT Changing

- WalletButton.tsx dialog UI/logic - stays exactly the same
- Navbar placement - stays exactly the same
- No new modals - reuses existing WalletButton dialog
- Mobile deep link logic - already works, just centralizing access

## Verification

After implementation, searching for these patterns should show unified usage:
- `useWalletModal` - Should only remain in WalletButton.tsx (if needed at all)
- `setVisible(true)` - Should be removed entirely
- `openConnectDialog` - Should appear in all connect buttons

## Technical Details

```text
┌─────────────────────────────────────────────────────────────────┐
│                         App.tsx                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              WalletConnectProvider                        │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │  Navbar                                            │  │   │
│  │  │   └─ WalletButton (registers openDialog)           │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │  Any Page/Component                                │  │   │
│  │  │   └─ useConnectWallet().openConnectDialog()        │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```
