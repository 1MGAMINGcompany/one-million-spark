

# New-User-Friendly Prediction Flow

## Changes

### 1. FightCard.tsx — Open WalletGateModal instead of disabling buttons
- Remove `disabled={!wallet}` from both Predict buttons
- When clicked without a wallet, call a new `onWalletRequired` callback (passed from parent) which opens the existing `WalletGateModal`
- Improve claim waiting text: replace "Claims open shortly after resolution..." with "You won! Your reward will be ready to claim in a few minutes. A **Claim Reward** button will appear right here."

### 2. PredictionModal.tsx — Add success screen + "Need SOL?" link
- Add a `submitted` state. After `onSubmit` succeeds, show a "What Happens Next?" screen instead of closing:
  - Checkmark icon + "Prediction Placed!"
  - Step 1: "Watch the fight"
  - Step 2: "If your fighter wins, a Claim Reward button appears after a short safety buffer (~5 min)"
  - Step 3: "Tap Claim Reward to get your SOL sent to your wallet"
  - "Got it" dismiss button
- Add a "Need SOL?" link below the amount input pointing to `/add-funds`
- Parent (`FightPredictions.tsx`) passes an `onSuccess` callback to trigger this state

### 3. FightPredictions.tsx — Wire up WalletGateModal
- Import and render `WalletGateModal` with local state `showWalletGate`
- `handlePredict` checks `isConnected`: if false, open `WalletGateModal` instead of the prediction modal
- After successful submission, keep the modal open in success-explainer mode instead of immediately closing + toasting

### Files changed
- `src/components/predictions/FightCard.tsx`
- `src/components/predictions/PredictionModal.tsx`
- `src/pages/FightPredictions.tsx`

