import { useParams, Link } from "react-router-dom";
import { useEffect } from "react";
import { helpArticles } from "@/data/helpArticles";
import { ArrowLeft } from "lucide-react";

const HelpArticle = () => {
  const { slug } = useParams<{ slug: string }>();
  const article = helpArticles.find((a) => a.slug === slug);

  useEffect(() => {
    if (article) {
      document.title = `${article.title} | 1M Gaming`;
      const meta = document.querySelector('meta[name="description"]');
      if (meta) {
        meta.setAttribute("content", article.metaDescription);
      }
    }
  }, [article]);

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

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <Link
        to="/help"
        className="inline-flex items-center gap-1 text-sm text-primary/70 hover:text-primary mb-8 transition-colors"
      >
        <ArrowLeft className="w-3 h-3" /> Back to Help Center
      </Link>

      {article.content()}
    </div>
  );
};

export default HelpArticle;
