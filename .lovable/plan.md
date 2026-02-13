

# SEO Blog / Help Center for 1MGAMING

## Overview

Add a Help Center with 6 long-form SEO articles targeting Solana wallet users, crypto gamers, and skill-game players. Zero risk to existing game/wallet logic -- only new files plus minor additions to the router and footer.

## New Files to Create

| File | Purpose |
|------|---------|
| `src/pages/HelpCenter.tsx` | Hub page listing all 6 article cards at `/help` |
| `src/pages/HelpArticle.tsx` | Slug-based article renderer at `/help/:slug` |
| `src/data/helpArticles.ts` | All 6 articles as a typed array (title, slug, meta description, content as JSX) |

## Existing Files Modified (minimal, safe changes only)

| File | Change |
|------|--------|
| `src/App.tsx` | Add 2 routes: `/help` and `/help/:slug`. Import `HelpCenter` and `HelpArticle`. |
| `src/components/Footer.tsx` | Add `{ to: "/help", labelKey: "footer.helpGuides" }` to the `links` array |
| `src/i18n/locales/en.json` | Add `"footer.helpGuides": "Help & Guides"` |

No other files are touched. No wallet, game, edge function, or layout changes.

## Architecture

### Data Layer: `src/data/helpArticles.ts`

A single file exporting an array of article objects:

```text
interface HelpArticle {
  slug: string;
  title: string;
  metaDescription: string;  // 150-160 chars for SEO
  keywords: string[];
  content: () => JSX.Element; // Returns article body with h1, h2s, paragraphs
}
```

Each article's `content` function returns properly structured JSX with:
- One `<h1>` (the title)
- Multiple `<h2>` section headings
- Natural keyword density
- Internal links to other articles and the homepage
- 800-1200 words per article

### HelpCenter Page (`/help`)

- Header: "1MGAMING Help & Guides"
- Intro paragraph explaining the platform
- 6 clickable cards in a responsive grid (1 col mobile, 2 col tablet, 3 col desktop)
- Each card shows title + short description, links to `/help/[slug]`
- Uses existing Card components for visual consistency

### HelpArticle Page (`/help/:slug`)

- Reads `slug` from `useParams()`
- Looks up article from the data array
- Sets `document.title` and meta description via `useEffect` for SEO
- Renders the article content
- Shows "Back to Help Center" link
- 404-style fallback if slug not found
- Bottom section with links to related articles

## The 6 Articles

| # | Slug | Title |
|---|------|-------|
| 1 | `connect-phantom-wallet-1mgaming` | How to Connect Phantom Wallet to 1MGAMING |
| 2 | `connect-solflare-wallet-1mgaming` | How to Connect Solflare Wallet to 1MGAMING |
| 3 | `connect-backpack-wallet-1mgaming` | How to Connect Backpack Wallet to 1MGAMING |
| 4 | `solana-skill-games-not-luck` | Solana Skill Games -- Skill Not Luck |
| 5 | `play-real-money-chess-solana` | Play Real Money Chess on Solana (No RNG) |
| 6 | `compare-solana-wallets-gaming` | Compare Solana Wallets for Gaming: Phantom vs Solflare vs Backpack |

Each article includes internal links to at least one other help article and the homepage.

## SEO Structure per Article

- `document.title` set dynamically (e.g., "How to Connect Phantom Wallet to 1MGAMING | 1M Gaming")
- Meta description tag updated via `useEffect`
- Clean URL slugs
- Proper heading hierarchy (h1 > h2)
- Natural keyword usage, no stuffing

## Router Changes (in `src/App.tsx`)

Two new routes added alongside existing ones:

```text
<Route path="/help" element={<HelpCenter />} />
<Route path="/help/:slug" element={<HelpArticle />} />
```

## Footer Change

Add one entry to the existing `links` array in `Footer.tsx`:

```text
{ to: "/help", labelKey: "footer.helpGuides" }
```

This automatically appears in both the desktop link row and the mobile collapsible menu.

## Safety Guarantees

- No wallet logic modified
- No game engine files touched
- No edge functions changed
- No database changes
- No new dependencies added
- All content is hardcoded JSX (no markdown parser, no CMS)
- Existing layout/responsiveness unaffected
- Works on mobile and desktop
- Works on direct URL load and refresh (standard React Router)

