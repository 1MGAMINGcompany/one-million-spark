
# Complete i18n Translation Audit Fix

## Problem Identified
The Room.tsx page and RecoverFundsButton component have many hardcoded English strings that don't change when users switch languages. The screenshot shows French is selected but strings like "Stake Information", "Entry Fee", "Pot (when full)", "Winner Gets", "Cancel Room", and "Recover Funds" remain in English.

## Solution Overview
Add comprehensive translation keys for all Room page and Recover Funds strings across all 11 supported languages.

---

## Technical Implementation

### 1. Add Missing Translation Keys to English (en.json)

Add a new `roomPage` namespace with all Room.tsx strings:

```json
"roomPage": {
  "backToRooms": "Back to Rooms",
  "loadingRoom": "Loading room…",
  "roomNotFound": "Room Not Found",
  "roomNotFoundDesc": "This room may have been cancelled or doesn't exist.",
  "invalidRoomLink": "The room link appears to be invalid or malformed.",
  "backToRoomList": "Back to Room List",
  "yourRoom": "Your Room",
  "game": "GAME",
  "players": "PLAYERS",
  "turnTime": "TURN TIME",
  "stakeInformation": "Stake Information",
  "entryFee": "Entry Fee",
  "potWhenFull": "Pot (when full)",
  "currentDeposited": "Current deposited",
  "winnerGets": "Winner Gets",
  "platformFeeNote": "5% platform fee deducted from winnings",
  "playersLabel": "Players:",
  "you": "You",
  "creator": "Creator",
  "waitingForOpponent": "Waiting for opponent to join...",
  "connectWalletToJoin": "Connect Wallet to Join",
  "waitingForWallet": "Waiting for wallet...",
  "signingDisabled": "Signing Disabled",
  "resolveActiveRoomFirst": "Resolve Active Room First",
  "joinGameAndStake": "Join Game & Stake {{amount}} SOL",
  "joinGame": "Join Game",
  "playAgain": "Play Again",
  "gameInProgress": "Game in progress",
  "cancelling": "Cancelling…",
  "cancelRoom": "Cancel Room",
  "closing": "Closing…",
  "recoverRentCloseRoom": "Recover Rent (Close Room)",
  "connectWalletTitle": "Connect a Solana Wallet to Play",
  "connectWalletDesc": "Connect your wallet to join this room and compete for SOL prizes.",
  "rematchCreated": "Rematch room created!",
  "invitePlayersWithLink": "Invite players with a link. Anyone can join if they have SOL.",
  "copied": "Copied!",
  "copyLink": "Copy Link",
  "share": "Share…",
  "dismiss": "Dismiss",
  "activeRoomWarning": "You have an active room",
  "activeRoomWarningDesc": "Cancel your room before joining or creating another.",
  "goToYourRoom": "Go to your room →"
},
"recoverFunds": {
  "recoverFunds": "Recover Funds",
  "checking": "Checking...",
  "processing": "Processing...",
  "cancelRoomRecoverTitle": "Cancel Room & Recover Funds",
  "cancelRoomRecoverDesc": "This will cancel the room and return your stake of {{amount}} SOL to your wallet.",
  "signTransactionNote": "You will need to sign a transaction to complete this action.",
  "confirmAndSign": "Confirm & Sign",
  "cancel": "Cancel"
}
```

### 2. Add French Translations (fr.json)

```json
"roomPage": {
  "backToRooms": "Retour aux Salles",
  "loadingRoom": "Chargement de la salle…",
  "roomNotFound": "Salle Introuvable",
  "roomNotFoundDesc": "Cette salle a peut-être été annulée ou n'existe pas.",
  "invalidRoomLink": "Le lien de la salle semble invalide ou mal formé.",
  "backToRoomList": "Retour à la Liste",
  "yourRoom": "Votre Salle",
  "game": "JEU",
  "players": "JOUEURS",
  "turnTime": "TEMPS DE TOUR",
  "stakeInformation": "Informations sur la Mise",
  "entryFee": "Frais d'Entrée",
  "potWhenFull": "Pot (complet)",
  "currentDeposited": "Actuellement déposé",
  "winnerGets": "Le Gagnant Reçoit",
  "platformFeeNote": "5% de frais de plateforme déduits des gains",
  "playersLabel": "Joueurs :",
  "you": "Vous",
  "creator": "Créateur",
  "waitingForOpponent": "En attente d'un adversaire...",
  "connectWalletToJoin": "Connecter le Portefeuille pour Rejoindre",
  "waitingForWallet": "En attente du portefeuille...",
  "signingDisabled": "Signature Désactivée",
  "resolveActiveRoomFirst": "Résoudre la Salle Active d'Abord",
  "joinGameAndStake": "Rejoindre et Miser {{amount}} SOL",
  "joinGame": "Rejoindre la Partie",
  "playAgain": "Rejouer",
  "gameInProgress": "Partie en cours",
  "cancelling": "Annulation…",
  "cancelRoom": "Annuler la Salle",
  "closing": "Fermeture…",
  "recoverRentCloseRoom": "Récupérer le Loyer (Fermer la Salle)",
  "connectWalletTitle": "Connecter un Portefeuille Solana pour Jouer",
  "connectWalletDesc": "Connectez votre portefeuille pour rejoindre cette salle et concourir pour des prix en SOL.",
  "rematchCreated": "Salle de revanche créée !",
  "invitePlayersWithLink": "Invitez des joueurs avec un lien. Tout le monde peut rejoindre avec du SOL.",
  "copied": "Copié !",
  "copyLink": "Copier le Lien",
  "share": "Partager…",
  "dismiss": "Fermer",
  "activeRoomWarning": "Vous avez une salle active",
  "activeRoomWarningDesc": "Annulez votre salle avant d'en rejoindre ou d'en créer une autre.",
  "goToYourRoom": "Aller à votre salle →"
},
"recoverFunds": {
  "recoverFunds": "Récupérer les Fonds",
  "checking": "Vérification...",
  "processing": "Traitement...",
  "cancelRoomRecoverTitle": "Annuler la Salle et Récupérer les Fonds",
  "cancelRoomRecoverDesc": "Cela annulera la salle et restituera votre mise de {{amount}} SOL à votre portefeuille.",
  "signTransactionNote": "Vous devrez signer une transaction pour compléter cette action.",
  "confirmAndSign": "Confirmer et Signer",
  "cancel": "Annuler"
}
```

### 3. Add Translations for All Other Languages

Similar translations will be added to:
- Spanish (es.json)
- Portuguese (pt.json)
- German (de.json)
- Italian (it.json)
- Arabic (ar.json)
- Chinese (zh.json)
- Japanese (ja.json)
- Hindi (hi.json)

### 4. Update Room.tsx

Replace all hardcoded strings with `t()` function calls:

| Line | Original | New |
|------|----------|-----|
| 859 | `Back to Rooms` | `{t("roomPage.backToRooms")}` |
| 873 | `Loading room…` | `{t("roomPage.loadingRoom")}` |
| 997 | `Your Room` | `{t("roomPage.yourRoom")}` |
| 1006 | `Game` | `{t("roomPage.game")}` |
| 1012 | `Players` | `{t("roomPage.players")}` |
| 1021 | `Turn Time` | `{t("roomPage.turnTime")}` |
| 1037 | `Stake Information` | `{t("roomPage.stakeInformation")}` |
| 1041 | `Entry Fee` | `{t("roomPage.entryFee")}` |
| 1045 | `Pot (when full)` | `{t("roomPage.potWhenFull")}` |
| 1047 | `Current deposited:` | `{t("roomPage.currentDeposited")}` |
| 1051 | `Winner Gets` | `{t("roomPage.winnerGets")}` |
| 1055 | `5% platform fee...` | `{t("roomPage.platformFeeNote")}` |
| 1060 | `Players:` | `{t("roomPage.playersLabel")}` |
| 1071 | `(You)` | `({t("roomPage.you")})` |
| 1072 | `Creator` | `{t("roomPage.creator")}` |
| 1077 | `(Creator)` | `({t("roomPage.creator")})` |
| 1160 | `Waiting for opponent...` | `{t("roomPage.waitingForOpponent")}` |
| 1180 | `Game in progress` | `{t("roomPage.gameInProgress")}` |
| 1192 | `Connect Wallet to Join` | `{t("roomPage.connectWalletToJoin")}` |
| 1216 | `Cancel Room` | `{t("roomPage.cancelRoom")}` |
| 1240 | `Recover Rent (Close Room)` | `{t("roomPage.recoverRentCloseRoom")}` |
| ... | (and all others) | |

### 5. Update RecoverFundsButton.tsx

Add `useTranslation` hook and replace all hardcoded strings:

```typescript
import { useTranslation } from "react-i18next";

// Inside component:
const { t } = useTranslation();

// Replace:
"Recover Funds" → t("recoverFunds.recoverFunds")
"Checking..." → t("recoverFunds.checking")
"Cancel Room & Recover Funds" → t("recoverFunds.cancelRoomRecoverTitle")
// etc.
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/i18n/locales/en.json` | Add `roomPage` and `recoverFunds` namespaces |
| `src/i18n/locales/fr.json` | Add French translations |
| `src/i18n/locales/es.json` | Add Spanish translations |
| `src/i18n/locales/pt.json` | Add Portuguese translations |
| `src/i18n/locales/de.json` | Add German translations |
| `src/i18n/locales/it.json` | Add Italian translations |
| `src/i18n/locales/ar.json` | Add Arabic translations |
| `src/i18n/locales/zh.json` | Add Chinese translations |
| `src/i18n/locales/ja.json` | Add Japanese translations |
| `src/i18n/locales/hi.json` | Add Hindi translations |
| `src/pages/Room.tsx` | Replace ~40 hardcoded strings with t() calls |
| `src/components/RecoverFundsButton.tsx` | Add translations for ~10 strings |

---

## Translation Count Summary

- **New English keys**: ~45 strings
- **Languages to update**: 10 (all non-English)
- **Total new translations**: ~450 strings

## Verification

After implementation:
1. Switch app to French → Room page should show all French text
2. Switch to Spanish → All Room page text in Spanish
3. Test all 11 languages to ensure complete coverage
