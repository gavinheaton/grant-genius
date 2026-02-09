import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useCmsPage } from "@/hooks/useCmsPages";
import { useAuth } from "@/hooks/useAuth";

export default function CmsPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: page, isLoading, error } = useCmsPage(slug);

  // Handle auth redirect for protected pages
  useEffect(() => {
    if (!authLoading && page?.requires_auth && !isAuthenticated) {
      navigate("/auth", { state: { from: location.pathname } });
    }
  }, [page, isAuthenticated, authLoading, navigate, location.pathname]);

  // Show loading state
  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container py-12">
          <Skeleton className="h-10 w-1/3 mb-6" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Show 404 for missing or unpublished pages
  if (!page || error) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container py-12">
          <div className="text-center py-16">
            <h1 className="text-4xl font-bold mb-4">Page Not Found</h1>
            <p className="text-muted-foreground mb-6">
              The page you're looking for doesn't exist or has been removed.
            </p>
            <Button onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Don't show unpublished pages to non-admins
  // (RLS handles this, but this is a fallback)
  if (!page.is_published) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container py-12">
          <div className="text-center py-16">
            <h1 className="text-4xl font-bold mb-4">Page Not Available</h1>
            <p className="text-muted-foreground mb-6">
              This page is currently not published.
            </p>
            <Button onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <title>{page.title} | Grant Genius</title>
        {page.meta_description && (
          <meta name="description" content={page.meta_description} />
        )}
      </Helmet>

      <Header />

      <main className="flex-1 container py-12">
        <article className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">{page.title}</h1>
          
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <ReactMarkdown>{page.content_html || ""}</ReactMarkdown>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
