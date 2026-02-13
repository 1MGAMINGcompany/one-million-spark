import { useEffect } from "react";

const SITE_URL = "https://1mgaming.com";

interface SeoMetaProps {
  title: string;
  description: string;
  path: string;
  ogType?: string;
  ogImage?: string;
}

/**
 * Sets document.title, meta description, canonical, OG + Twitter tags.
 * Safe for Vite SPA — no external deps.
 */
export function useSeoMeta({ title, description, path, ogType = "website", ogImage }: SeoMetaProps) {
  useEffect(() => {
    document.title = title;
    const url = `${SITE_URL}${path}`;
    const image = ogImage || `${SITE_URL}/images/og-logo.png`;

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const setLink = (rel: string, href: string) => {
      let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        document.head.appendChild(el);
      }
      el.setAttribute("href", href);
    };

    setMeta("name", "description", description);
    setLink("canonical", url);

    // OG
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:type", ogType);
    setMeta("property", "og:image", image);

    // Twitter
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", image);
  }, [title, description, path, ogType, ogImage]);
}

export default useSeoMeta;
