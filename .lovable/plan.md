

## Rebrand Help & Article Pages for 1mg.live Premium Identity

The help center and article pages currently inherit the global light theme (beige/off-white background, gold accents), creating a visual disconnect from the dark premium 1mg.live identity. This plan fixes that with a cohesive dark theme, stronger SEO structure, safer legal language, and conversion CTAs.

---

### 1. Force Dark Theme on Help Pages

**Files:** `HelpCenter.tsx`, `HelpArticle.tsx`, `TermsOfService.tsx`, `Support.tsx`

- Wrap each page in a container with explicit dark background and text colors instead of relying on the global theme
- Apply `bg-[#06080f]` (near-black navy) as the page background, matching the 1mg.live landing page
- Use `text-white` as base text color
- Accent color shifts from gold (`text-primary`) to electric blue (`text-blue-400` / `text-blue-500`) for links, headings, and highlights
- This ensures visual consistency whether the user arrived from 1mg.live or 1mgaming.com

### 2. Restyle Article Content

**File:** `helpArticles.tsx`

- Replace all `text-primary` heading classes with `text-blue-400` for the 1mg.live blue identity
- Replace `text-foreground/80`, `text-foreground/70`, `text-foreground/60` with explicit `text-white/80`, `text-white/70`, `text-white/60`
- Update `border-border` to `border-white/10`
- Keep `prose prose-invert max-w-none` but add overrides for link colors to use blue

### 3. Add Top CTA Banner to Articles

**File:** `HelpArticle.tsx`

- Add a slim CTA bar between breadcrumb and article content:
  - Text: "Launch your own predictions app"
  - Button: "Get Started — $2,400" linking to `https://1mg.live`
- Styled as a subtle gradient bar (`bg-gradient-to-r from-blue-600/10 to-blue-400/10 border border-blue-500/20`)

### 4. Upgrade ArticleCTA Component

**File:** `ArticleCTA.tsx`

- Restyle with dark card background (`bg-white/5 border-blue-500/20`)
- Change button variant from gold to blue gradient
- Add links to: `/buy-predictions-app`, `https://demo.1mg.live`, `/help`
- Update copy to be more conversion-focused:
  - "Ready to launch your predictions app?"
  - "Start earning from sports predictions in minutes"

### 5. Restyle HelpCenter Grid

**File:** `HelpCenter.tsx`

- Dark background: `bg-[#06080f] min-h-screen`
- Card styling: `bg-white/5 border-white/10 hover:border-blue-500/30`
- Section headers in `text-blue-400`
- "Read guide" link in blue

### 6. Fix Legal Language (are-prediction-markets-legal article)

**File:** `helpArticles.tsx` — slug `are-prediction-markets-legal`

Current problematic language:
- "Prediction markets on 1MGAMING are accessible globally" — too absolute

Replace with safer, jurisdiction-aware language:
- "Prediction market regulations vary by jurisdiction. Users should verify local rules before participating."
- Add a disclaimer section: "This content is informational only and does not constitute legal advice."
- Remove the "Global Access" section or rewrite it as "Availability" with proper caveats

### 7. Strengthen SEO Structure

**File:** `HelpArticle.tsx`

- Add `datePublished` and `dateModified` to Article JSON-LD schema
- Add `author` field to JSON-LD (Organization: "1MGAMING")
- Ensure each article has exactly one `<h1>` (already done in content)
- Add internal link block at bottom of every article pointing to: Buy App page, Demo, Help Center

**File:** `FAQSection.tsx`
- Already has FAQ schema — no changes needed

### 8. Restyle Related Articles & FAQ

**Files:** `RelatedArticles.tsx`, `FAQSection.tsx`

- Dark card styling: `bg-white/5 border-white/10`
- FAQ triggers and content in white/blue tones
- Related article cards with blue hover border

---

### Files to modify
- `src/pages/HelpCenter.tsx`
- `src/pages/HelpArticle.tsx`
- `src/pages/TermsOfService.tsx`
- `src/pages/Support.tsx`
- `src/data/helpArticles.tsx`
- `src/components/seo/ArticleCTA.tsx`
- `src/components/seo/RelatedArticles.tsx`
- `src/components/seo/FAQSection.tsx`

### Implementation order
1. HelpArticle + HelpCenter dark theme wrappers
2. helpArticles.tsx color class replacements (all 10 articles)
3. ArticleCTA redesign with conversion links
4. RelatedArticles + FAQSection restyle
5. Legal language fix on the "are-prediction-markets-legal" article
6. JSON-LD schema improvements
7. TermsOfService + Support page dark theme
8. Top CTA banner on article pages

