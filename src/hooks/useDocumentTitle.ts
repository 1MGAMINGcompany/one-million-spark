import { useEffect } from "react";

/**
 * Sets `document.title` to the supplied string. Pass `null`/empty to skip.
 *
 * Intentionally minimal: does NOT touch meta description, canonical, or OG tags.
 * Use `useSeoMeta` from `@/components/seo/SeoMeta` for full SEO metadata on
 * marketing/SEO pages. This hook is for app-shell pages (operator, admin) where
 * we only need to control the browser tab title without rewriting OG/canonical.
 */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    document.title = title;
  }, [title]);
}

export default useDocumentTitle;
