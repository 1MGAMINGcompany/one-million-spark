

## Fix: External Wallet Button in WalletGateModal Opens Empty Modal

### Problem
When clicking "Connect an external wallet" in the predictions flow, `WalletGateModal` calls `setVisible(true)` from the Solana wallet adapter's built-in modal. But `SolanaProvider` registers zero wallet adapters (`wallets = []`), so the modal opens empty/blank.

The app already has a fully functional custom wallet picker dialog inside `ConnectWalletGate.tsx` that shows Phantom, Solflare, and Backpack with icons, detection, deep links, and MWA support.

### Solution
Refactor `WalletGateModal` to show the custom wallet picker dialog (from `ConnectWalletGate`) instead of the empty adapter modal.

**Changes to `src/components/WalletGateModal.tsx`:**
- Remove `useWalletModal` import and usage
- Add local state `showWalletPicker` to control a custom wallet picker dialog
- Import and reuse the wallet selection logic from `ConnectWalletGate` — specifically, embed the same 3-wallet picker dialog (Phantom, Solflare, Backpack) with icons, deep-link support, and detection badges
- When user clicks "Connect External Wallet" → close the gate modal, open the wallet picker dialog with the 3 wallets

This can be done by either:
1. Extracting the wallet picker dialog from `ConnectWalletGate` into a shared component (e.g., `WalletPickerDialog`) and using it in both places, OR
2. Directly embedding the wallet picker logic in `WalletGateModal`

**Recommended: Option 1** — Create a `WalletPickerDialog` component extracted from `ConnectWalletGate`, then use it in both `WalletGateModal` and `ConnectWalletGate` to avoid duplication.

### Files to change
1. **Create `src/components/WalletPickerDialog.tsx`** — Extract the wallet picker dialog (the `Dialog` with Phantom/Solflare/Backpack buttons, detection, deep links, MWA) from `ConnectWalletGate`
2. **Update `src/components/ConnectWalletGate.tsx`** — Use the new `WalletPickerDialog` instead of inline dialog
3. **Update `src/components/WalletGateModal.tsx`** — Replace `useWalletModal().setVisible(true)` with opening `WalletPickerDialog`

