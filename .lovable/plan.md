

# Premium Mobile Menu Redesign (Privy-first)

## Overview

Restructure the mobile hamburger menu to be clean, wallet-clutter-free, and Privy-first. The menu will have a premium "Account Card" at the top when signed in, followed by navigation links, then toggles, and finally a collapsed Advanced section for external wallets.

## Layout (top to bottom)

```text
+-------------------------------------+
| ACCOUNT CARD (if signed in)         |
|   "Signed in as" 4aTb...93Ks       |
|   Balance: 1.234 SOL               |
|   [Add Funds]  [My Profile] [Out]  |
+-------------------------------------+
| --- OR if not signed in ---         |
|   [Continue]  (Privy login button)  |
+-------------------------------------+
| Home                                |
| Create Room                         |
| Room List                           |
| Leaderboard                         |
| Language: [selector]                |
+-------------------------------------+
| Sound toggle                        |
| Notifications toggle                |
+-------------------------------------+
| v Advanced: External Wallet         |
|   (collapsed by default)            |
|   Helper text + WalletButton        |
+-------------------------------------+
```

## Changes

### 1. `src/components/Navbar.tsx` -- Rewrite mobile menu section (lines 174-266)

**Account Card (signed in)**:
- Import `usePrivy` from `@privy-io/react-auth` and `usePrivySolBalance` hook
- When Privy authenticated with a Solana wallet address:
  - Show a styled card with gold border accent at the top of the mobile menu
  - "Signed in as" label + shortened wallet address (font-mono)
  - Balance chip showing SOL amount from `usePrivySolBalance` (with loading skeleton)
  - Three action buttons in a row: "Add Funds" (Link to /add-funds, closes menu), "My Profile" (Link to /player/:address, closes menu), "Disconnect" (calls Privy logout)
- When not authenticated:
  - Show the Privy login button (which already says "Continue" per existing translations)

**Navigation links**:
- Remove "Add Funds" from `navItems` since it is now in the Account Card (only in mobile; desktop keeps it)
- Mobile nav items: Home, Create Room, Room List, Leaderboard
- Keep existing active-state styling

**Toggles section**:
- Language selector row
- Sound toggle row  
- Notifications toggle row
- (Same as current, just positioned after nav links)

**Advanced section**:
- Keep existing Collapsible with "Advanced: Connect External Wallet"
- Keep WalletButton inside
- No changes to external wallet logic

### 2. `src/i18n/locales/*.json` -- Add new translation keys (all 10 locales)

Add to the `wallet` section:
- `"signedInAs"`: "Signed in as"
- `"addFunds"`: "Add Funds" (reuse existing `nav.addFunds` where possible)

These are minimal additions since most keys already exist (`wallet.disconnect`, `nav.myProfile`, `wallet.continue`).

### 3. Desktop menu -- No structural changes

The desktop menu stays exactly as-is. Only the mobile `{isOpen && ...}` block changes.

## Technical Details

- `usePrivySolBalance()` is already available and provides `isPrivyUser`, `walletAddress`, `balanceSol`, `loading`
- `usePrivy()` provides `authenticated`, `logout`, `login`
- The Account Card uses existing Tailwind classes: `bg-secondary`, `border-primary/30`, gold accents via `text-primary`
- The "Add Funds" link in the Account Card replaces the nav item for mobile only; desktop `navItems` array is unchanged
- Mobile navItems will be filtered to exclude `/add-funds` path

## Files Modified

| File | Change |
|------|--------|
| `src/components/Navbar.tsx` | Rewrite mobile menu: Account Card at top, reorder sections, import usePrivy + usePrivySolBalance |
| `src/i18n/locales/en.json` | Add `wallet.signedInAs` |
| `src/i18n/locales/es.json` | Add `wallet.signedInAs` (Spanish) |
| `src/i18n/locales/ar.json` | Add `wallet.signedInAs` (Arabic) |
| `src/i18n/locales/pt.json` | Add `wallet.signedInAs` (Portuguese) |
| `src/i18n/locales/fr.json` | Add `wallet.signedInAs` (French) |
| `src/i18n/locales/de.json` | Add `wallet.signedInAs` (German) |
| `src/i18n/locales/zh.json` | Add `wallet.signedInAs` (Chinese) |
| `src/i18n/locales/it.json` | Add `wallet.signedInAs` (Italian) |
| `src/i18n/locales/ja.json` | Add `wallet.signedInAs` (Japanese) |
| `src/i18n/locales/hi.json` | Add `wallet.signedInAs` (Hindi) |

