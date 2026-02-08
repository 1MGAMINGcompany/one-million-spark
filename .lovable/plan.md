
# Unify All Connect Wallet Buttons

## Problem Statement
Currently, the application has **two different connection methods** causing inconsistent mobile wallet behavior:

| Component | Current Method | MWA Support | Deep Links |
|-----------|---------------|-------------|------------|
| `WalletButton.tsx` (Navbar) | Custom dialog | ✅ Yes | ✅ Yes |
| `ConnectWalletGate.tsx` (Create/Join Room) | Custom dialog | ✅ Yes | ✅ Yes |
| `WalletGateModal.tsx` (Room entry) | `setVisible(true)` | ❌ No | ❌ No |
| `AddFunds.tsx` (Add Funds page) | `setVisible(true)` | ❌ No | ❌ No |

The `setVisible(true)` method opens the standard `@solana/wallet-adapter-react-ui` modal, which:
- Does NOT support Mobile Wallet Adapter (MWA) on Android
- Does NOT show iOS deep links to open in wallet browser
- Does NOT handle the "wallet not detected" fallback flow

## Solution Architecture

Create a **WalletConnectContext** that allows the primary `WalletButton` component to register its dialog opener function. All secondary components will call this registered function instead of `setVisible(true)`.

```text
┌─────────────────────────────────────────────────────────────┐
│                   WalletConnectProvider                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  openConnectDialog: () => void                       │    │
│  │  registerDialogOpener: (fn) => void                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                 │
│           ┌────────────────┼────────────────┐               │
│           ▼                ▼                ▼               │
│    WalletButton     WalletGateModal    AddFunds             │
│    (registers)      (calls context)   (calls context)       │
└─────────────────────────────────────────────────────────────┘
```

## Files to Create

### 1. `src/contexts/WalletConnectContext.tsx` (NEW)

```typescript
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface WalletConnectContextType {
  openConnectDialog: () => void;
  registerDialogOpener: (opener: () => void) => void;
}

const WalletConnectContext = createContext<WalletConnectContextType | null>(null);

export function WalletConnectProvider({ children }: { children: ReactNode }) {
  const [dialogOpener, setDialogOpener] = useState<(() => void) | null>(null);

  const registerDialogOpener = useCallback((opener: () => void) => {
    setDialogOpener(() => opener);
  }, []);

  const openConnectDialog = useCallback(() => {
    if (dialogOpener) {
      dialogOpener();
    } else {
      console.warn("[WalletConnect] No dialog opener registered");
    }
  }, [dialogOpener]);

  return (
    <WalletConnectContext.Provider value={{ openConnectDialog, registerDialogOpener }}>
      {children}
    </WalletConnectContext.Provider>
  );
}

export function useConnectWallet() {
  const context = useContext(WalletConnectContext);
  if (!context) {
    throw new Error("useConnectWallet must be used within WalletConnectProvider");
  }
  return context;
}
```

## Files to Modify

### 2. `src/App.tsx`

Add the new provider to the provider tree (inside SolanaProvider):

```typescript
import { WalletConnectProvider } from "./contexts/WalletConnectContext";

// In the provider tree:
<SolanaProvider>
  <WalletConnectProvider>
    {/* rest of providers */}
  </WalletConnectProvider>
</SolanaProvider>
```

### 3. `src/components/WalletButton.tsx`

Register the dialog opener function when component mounts:

```typescript
import { useConnectWallet } from "@/contexts/WalletConnectContext";

// Inside component:
const { registerDialogOpener } = useConnectWallet();

// Register the dialog opener on mount
useEffect(() => {
  registerDialogOpener(() => setDialogOpen(true));
}, [registerDialogOpener]);
```

### 4. `src/components/WalletGateModal.tsx`

Replace `setVisible(true)` with context call:

```typescript
// Before:
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
const { setVisible } = useWalletModal();
const handleConnectWallet = () => {
  onClose();
  setVisible(true);
};

// After:
import { useConnectWallet } from "@/contexts/WalletConnectContext";
const { openConnectDialog } = useConnectWallet();
const handleConnectWallet = () => {
  onClose();
  openConnectDialog();
};
```

### 5. `src/pages/AddFunds.tsx`

Replace `setVisible(true)` with context call:

```typescript
// Before:
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
const { setVisible } = useWalletModal();
<Button onClick={() => setVisible(true)}>Connect Wallet</Button>

// After:
import { useConnectWallet } from "@/contexts/WalletConnectContext";
const { openConnectDialog } = useConnectWallet();
<Button onClick={openConnectDialog}>Connect Wallet</Button>
```

## Technical Details

### Why Context Pattern?

1. **Single Source of Truth**: The `WalletButton` component already contains all the complex logic for:
   - MWA detection and connection on Android
   - iOS deep links to wallet browsers (Phantom, Solflare)
   - Wallet detection fallback modals
   - Connection timeout handling

2. **No Code Duplication**: Secondary components simply trigger the dialog - no need to copy 500+ lines of wallet logic

3. **Consistent UX**: Users get the same mobile-optimized experience everywhere

### What Happens on Mobile Now

**Before (broken):**
- User taps "Connect Wallet" in AddFunds or WalletGateModal
- Standard adapter modal opens
- On iOS: No way to open in wallet browser
- On Android: MWA not triggered properly

**After (unified):**
- User taps "Connect Wallet" anywhere
- WalletButton's custom dialog opens
- On iOS: Shows "Open in Phantom/Solflare" deep links
- On Android: Shows "Use Installed Wallet" MWA option + fallback deep links

## Summary of Changes

| File | Action |
|------|--------|
| `src/contexts/WalletConnectContext.tsx` | Create new context |
| `src/App.tsx` | Add WalletConnectProvider |
| `src/components/WalletButton.tsx` | Register dialog opener |
| `src/components/WalletGateModal.tsx` | Use context instead of setVisible |
| `src/pages/AddFunds.tsx` | Use context instead of setVisible |

## No Changes To

- `ConnectWalletGate.tsx` - Already has correct implementation
- Mobile wallet adapter registration
- Deep link logic
- Any game files or AI files
