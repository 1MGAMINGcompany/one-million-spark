import { useParams, Link } from "react-router-dom";
import { helpArticles } from "@/data/helpArticles";
import { ArrowLeft } from "lucide-react";
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

const SITE_URL = "https://one-million-spark.lovable.app";

const HelpArticle = () => {
  const { slug } = useParams<{ slug: string }>();
  const article = helpArticles.find((a) => a.slug === slug);

  // Always call hooks — use fallback values when article not found
  useSeoMeta({
    title: article ? `${article.title} | 1MGAMING` : "Article Not Found | 1MGAMING",
    description: article?.metaDescription || "The guide you're looking for doesn't exist.",
    path: `/help/${slug || ""}`,
    ogType: "article",
  });

  if (!article) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-primary mb-4">Article Not Found</h1>
        <p className="text-foreground/60 mb-8">The guide you're looking for doesn't exist.</p>
        <Link to="/help" className="text-primary hover:text-primary/80 transition-colors">
          ← Back to Help Center
        </Link>
      </div>
    );
  }

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.metaDescription,
    url: `${SITE_URL}/help/${article.slug}`,
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
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <JsonLd data={articleJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />

      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/help">Help & Guides</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{article.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Link
        to="/help"
        className="inline-flex items-center gap-1 text-sm text-primary/70 hover:text-primary mb-8 transition-colors"
      >
        <ArrowLeft className="w-3 h-3" /> Back to Help Center
      </Link>

      {article.content()}

      <FAQSection slug={article.slug} />
      <ArticleCTA />
      <RelatedArticles currentSlug={article.slug} />
    </div>
  );
};

export default HelpArticle;
