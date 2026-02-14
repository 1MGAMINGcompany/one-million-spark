

## Add Jurisdiction Disclaimer to User Responsibility Section

**What changes:** One small text addition to `src/pages/TermsOfService.tsx` -- append a second sentence/paragraph inside the "C. User Responsibility" section.

**File:** `src/pages/TermsOfService.tsx` (lines 74-78)

The existing paragraph will be followed by a new paragraph with the additional legal language:

> Users are solely responsible for ensuring that participation in skill-based competitions involving digital assets is lawful in their jurisdiction. 1MGAMING does not make representations regarding the legality of participation in any specific country, state, or territory.

This will be added as a second `<p>` tag with the same `text-muted-foreground leading-relaxed` styling plus a `mt-3` top margin for spacing, keeping it visually consistent with the rest of the section.

No other files, routes, or logic will be touched.

