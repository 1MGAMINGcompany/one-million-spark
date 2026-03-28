

# Prediction Markets SEO Content — Help & Guides Expansion

## Overview
Add 6 new long-form SEO articles focused on prediction markets to the Help & Guides section on both 1mgaming.com and 1mg.live. Each article targets high-intent search queries, includes structured FAQ schema for rich snippets, and links internally to the predictions page.

## New Articles (added to `src/data/helpArticles.tsx`)

### 1. `what-are-prediction-markets`
**Title:** "What Are Prediction Markets? A Complete Guide"
- What prediction markets are, how they work (buy shares in outcomes)
- History (Iowa Electronic Markets, Intrade, Polymarket)
- How prices reflect probabilities (43¢ = 43% chance)
- Real-world use cases: sports, politics, crypto, entertainment
- FAQ schema: 5-6 questions

### 2. `are-prediction-markets-legal`
**Title:** "Are Prediction Markets Legal? What You Need to Know"
- US regulatory landscape (CFTC, Kalshi ruling, Polymarket)
- Why crypto-based prediction markets operate globally
- How 1MGAMING operates (non-custodial, blockchain settlement)
- Difference between predictions and gambling (skill/information vs luck)
- FAQ schema: 5-6 questions

### 3. `prediction-markets-growth-2025`
**Title:** "Prediction Markets in 2025: Growth, Volume & Why They Matter"
- Market size stats ($50B+ traded on Polymarket in 2024)
- Projected growth (Goldman Sachs, Bloomberg data points)
- Why 1MGAMING is positioned: crypto-native, low fees, real-time settlement
- Liquidity explanation: what it is, why it matters, how Polymarket provides it
- Why we're the best: aggregated odds, instant crypto payouts, no KYC friction
- FAQ schema

### 4. `how-to-place-a-prediction`
**Title:** "How to Place a Prediction on 1MGAMING — Step by Step"
- Connect wallet → Browse events → Pick outcome → Confirm
- Screenshots-style walkthrough (text descriptions)
- Understanding odds/prices (percentage display)
- What happens after you predict (settlement, payouts)
- How to check your open positions
- FAQ schema

### 5. `how-prediction-payouts-work-crypto`
**Title:** "How Prediction Payouts Work with Crypto"
- What happens when you win (shares → full value)
- Settlement process (automatic on-chain)
- How to withdraw/convert crypto to cash (exchange ramps)
- Gas fees explained (Solana = near zero)
- Supported wallets (Phantom, Solflare, Backpack)
- FAQ schema

### 6. `what-is-liquidity-prediction-markets`
**Title:** "What Is Liquidity in Prediction Markets?"
- Liquidity explained simply (ability to buy/sell without moving price)
- Order books vs AMMs
- Why Polymarket liquidity matters for 1MGAMING users
- How volume affects odds accuracy
- FAQ schema

## File Changes

### `src/data/helpArticles.tsx`
- Add 6 new article entries with full long-form JSX content (~100-150 lines each)
- Each article has: slug, title, metaDescription, keywords, cardDescription, content()
- Internal links to `/predictions`, other help articles, and wallet guides

### `src/components/seo/FAQSection.tsx`
- Add FAQ entries for all 6 new slugs in the `walletFAQs` map (rename to `articleFAQs`)

### `src/pages/HelpCenter.tsx`
- Add new "Prediction Markets" category section with slugs for the 6 articles
- Render via existing `ArticleGrid` component

### `public/sitemap.xml`
- Add 6 new `<url>` entries for `/help/{slug}`

### `src/pages/platform/PlatformApp.tsx`
- Add `/help` and `/help/:slug` routes so 1mg.live also serves these SEO pages
- Import and render `HelpCenter` and `HelpArticle` components

## SEO Features (already built, reused)
- `useSeoMeta` — canonical, OG, Twitter tags (already wired in HelpArticle)
- `JsonLd` — Article + BreadcrumbList schema (already in HelpArticle)
- `FAQSection` — FAQPage schema for Google rich results
- `ArticleCTA` — conversion CTAs at bottom of each article
- `RelatedArticles` — internal linking between articles

## Keyword Targets
- "what are prediction markets"
- "are prediction markets legal"
- "prediction markets 2025 growth"
- "how to place a prediction crypto"
- "prediction market payouts crypto"
- "prediction market liquidity explained"
- "polymarket alternative"
- "best prediction market platform"

