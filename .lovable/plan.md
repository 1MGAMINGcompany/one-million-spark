

## Plan: Change Badge Text to "PREMIUM PREDICTIONS" + Default to Light Mode

### Changes

#### 1. Update badge text in all locale files
Change `hero.badge` from `"PREMIUM SKILL GAMING"` to `"PREMIUM PREDICTIONS"` in `src/i18n/locales/en.json` (and equivalent translations in ar, de, es, fr, hi, it, ja, pt, zh).

#### 2. Update SEO meta tags
**File:** `index.html`
- Change `<title>` from "Premium Skill Gaming Platform" to "Premium Predictions Platform"
- Update `og:title`, `og:description`, `twitter:title`, `twitter:description` similarly

#### 3. Default theme to light mode
**File:** `src/hooks/useTheme.ts`
- Change the default from `"dark"` to `"light"` (line 8: fallback when no localStorage value exists)

**File:** `index.html`
- Change the inline theme script (line 5) to default to `"light"` instead of `"dark"` — so the first paint is light mode for new visitors. Existing users who chose dark keep their preference via localStorage.

### Files Changed
1. `src/i18n/locales/en.json` — badge text
2. `src/i18n/locales/ar.json` through `zh.json` (9 files) — translated badge text
3. `index.html` — SEO meta tags + default theme script
4. `src/hooks/useTheme.ts` — default to `"light"`

