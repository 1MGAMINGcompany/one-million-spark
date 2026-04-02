import { useParams, Link } from "react-router-dom";
import { helpArticles } from "@/data/helpArticles";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useSeoMeta } from "@/components/seo/SeoMeta";
import JsonLd from "@/components/seo/JsonLd";
import FAQSection from "@/components/seo/FAQSection";
import ArticleCTA from "@/components/seo/ArticleCTA";
import RelatedArticles from "@/components/seo/RelatedArticles";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const SITE_URL = "https://1mgaming.com";

const HelpArticle = () => {
  const { slug } = useParams<{ slug: string }>();
  const article = helpArticles.find((a) => a.slug === slug);

  useSeoMeta({
    title: article ? `${article.title} | 1MGAMING` : "Article Not Found | 1MGAMING",
    description: article?.metaDescription || "The guide you're looking for doesn't exist.",
    path: `/help/${slug || ""}`,
    ogType: "article",
  });

  if (!article) {
    return (
      <div className="min-h-screen bg-[#06080f] text-white">
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-3xl font-bold text-blue-400 mb-4">Article Not Found</h1>
          <p className="text-white/60 mb-8">The guide you're looking for doesn't exist.</p>
          <Link to="/help" className="text-blue-400 hover:text-blue-300 transition-colors">
            ← Back to Help Center
          </Link>
        </div>
      </div>
    );
  }

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.metaDescription,
    url: `${SITE_URL}/help/${article.slug}`,
    datePublished: "2025-01-15",
    dateModified: "2025-06-01",
    author: {
      "@type": "Organization",
      name: "1MGAMING",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "1MGAMING",
      url: SITE_URL,
    },
    isPartOf: {
      "@type": "WebSite",
      name: "1MGAMING",
      url: SITE_URL,
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Help & Guides", item: `${SITE_URL}/help` },
      { "@type": "ListItem", position: 3, name: article.title, item: `${SITE_URL}/help/${article.slug}` },
    ],
  };

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <JsonLd data={articleJsonLd} />
        <JsonLd data={breadcrumbJsonLd} />

        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/" className="text-white/50 hover:text-blue-400">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="text-white/30" />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/help" className="text-white/50 hover:text-blue-400">Help & Guides</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="text-white/30" />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-white/70">{article.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Top CTA Banner */}
        <div className="mb-8 rounded-lg bg-gradient-to-r from-blue-600/10 to-blue-400/10 border border-blue-500/20 px-5 py-3 flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-white/70">Launch your own predictions app</p>
          <a
            href="https://1mg.live"
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors"
          >
            Get Started — $2,400 <ArrowRight className="w-3 h-3" />
          </a>
        </div>

        <Link
          to="/help"
          className="inline-flex items-center gap-1 text-sm text-blue-400/70 hover:text-blue-400 mb-8 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Back to Help Center
        </Link>

        {article.content()}

        <FAQSection slug={article.slug} />
        <ArticleCTA />
        <RelatedArticles currentSlug={article.slug} />

        {/* Internal links block */}
        <div className="mt-10 pt-6 border-t border-white/10 flex flex-wrap gap-4 text-sm text-white/50">
          <Link to="/help" className="hover:text-blue-400 transition-colors">Help Center</Link>
          <a href="/demo" className="hover:text-blue-400 transition-colors">Live Demo</a>
          <a href="https://1mg.live" className="hover:text-blue-400 transition-colors">Buy Your App</a>
        </div>
      </div>
    </div>
  );
};

export default HelpArticle;
