

# Clean Up Legal/Help Pages — Remove Solana References, Add Predictions

## Overview
Remove all Solana/SOL/blockchain/wallet-specific references from legal, support, and help pages. Reframe the platform as a skill-based gaming + prediction market platform using USDC. Add Predictions as a featured product throughout.

## File Changes

### 1. `src/i18n/locales/en.json` — Update all legal/footer translation keys

**Privacy section (lines 897-916)**:
- Section 1: Change "blockchain" / "wallet address" → "account information" / "login credentials"
- Section 2: Remove "Solana network" → "facilitate gameplay and process transactions"
- Section 3: Remove "Solana blockchain" → "securely stored with encryption"
- Section 5: Remove "Solana wallet providers (Phantom, Solflare, Backpack)" → "wallet providers and payment processors"

**Terms section (lines 980-998)**:
- Remove `cryptoTitle`/`cryptoText`/`cryptoPoint1-3` (all Solana-specific crypto policy)
- Update `gasFeesTitle`/`gasFeesText` → "Transaction Fees" with generic low-fee language
- Update `fairPlayText` to remove "on-chain" and "blockchain" references
- Keep skill-based messaging intact

**Game Rules section (lines 847-896)**: Add a "Predictions" entry with rules covering how prediction markets work on the platform

### 2. `src/pages/TermsOfService.tsx` — Rewrite sections

- Section E "Blockchain Transparency" → "Platform Transparency" — outcomes are verifiable and auditable
- Remove "Solana blockchain" from the text
- Remove the "Gas Fees" section referencing Solana fees → replace with "Transaction Fees" about platform fees only
- Keep all other sections (skill-based, user responsibility, age requirement) unchanged

### 3. `src/pages/GameRules.tsx` — Add Predictions game entry

- Add a "Predictions" accordion item explaining how prediction markets work on the platform

### 4. `src/pages/HelpCenter.tsx` — Remove Solana wallet guides, rebrand

- Remove `walletSlugs` section (Phantom, Solflare, Backpack, Compare wallets) — these are Solana-specific
- Remove "Wallet Guides" `ArticleGrid`
- Update SEO title/description to remove "Solana" references
- Update header description to say "skill gaming + prediction markets platform" instead of "Solana-based"
- Update JSON-LD descriptions similarly
- Keep Skill Games and Prediction Markets sections

### 5. `src/pages/PrivacyPolicy.tsx` — No code changes needed (uses translation keys)

### 6. `src/pages/Support.tsx` — No changes needed (already generic)

### 7. `src/data/helpArticles.tsx` — Trim Solana-specific articles

- Remove 4 wallet guide articles: `connect-phantom-wallet-1mgaming`, `connect-solflare-wallet-1mgaming`, `connect-backpack-wallet-1mgaming`, `compare-solana-wallets-gaming`
- Update `solana-skill-games-not-luck` slug/title → "skill-games-not-luck" / "Skill Games — Skill Not Luck" — remove Solana references from content, replace SOL with generic "real stakes"
- Update `play-real-money-chess-solana` slug/title → "play-real-money-chess" / "Play Real Money Chess" — remove SOL/Solana references
- Update `ludo-skill-or-luck-competitive-strategy` — remove "play for real SOL" line at bottom
- Update engineering article — keep but remove Solana from title, soften blockchain specifics
- Prediction articles: remove "Polymarket" mentions per brand sovereignty memory, replace with "1MGAMING market data"

### Summary of Removals
- All Phantom/Solflare/Backpack wallet guide articles
- All "SOL", "Solana", "blockchain" references in legal pages
- Polymarket brand mentions in help articles

### Summary of Additions
- Predictions entry in Game Rules accordion
- Generic "USDC" or stake-neutral language throughout
- Platform-first branding in all help content

