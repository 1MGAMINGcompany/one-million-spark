import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE_URL = "https://1mgaming.com";

interface SeoMetaProps {
  title: string;
  description: string;
  path?: string;
  ogType?: string;
  ogImage?: string;
}

/**
 * Sets document.title, meta description, canonical, OG + Twitter tags.
 * Canonical and og:url are derived from the current React Router location.
 */
export function useSeoMeta({ title, description, path, ogType = "website", ogImage }: SeoMetaProps) {
  const location = useLocation();

  useEffect(() => {
    const rawPath = (path ?? location.pathname) || "/";
    const normalizedPath =
      rawPath !== "/" && rawPath.endsWith("/") ? rawPath.slice(0, -1) : rawPath;
    const canonicalUrl = `${SITE_URL}${normalizedPath}`;
    const image = ogImage || `${SITE_URL}/images/og-logo.png`;

    document.title = title;

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    // Canonical link
    let link = document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", canonicalUrl);

    setMeta("name", "description", description);

    // OG
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:type", ogType);
    setMeta("property", "og:image", image);

    // Twitter
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", image);

    // Site-level
    setMeta("property", "og:site_name", "1M Gaming");
  }, [title, description, path, ogType, ogImage, location.pathname]);
}

export default useSeoMeta;
