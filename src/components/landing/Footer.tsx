import { GraduationCap } from "lucide-react";
import { Link } from "react-router-dom";
import { useCmsFooterPages } from "@/hooks/useCmsPages";
import { useAuth } from "@/hooks/useAuth";

export function Footer() {
  const { isAuthenticated } = useAuth();
  const { data: footerPages } = useCmsFooterPages();

  // Filter footer pages based on auth requirement
  const visibleFooterPages = footerPages?.filter(
    (page) => !page.requires_auth || isAuthenticated
  );

  return (
    <footer className="border-t bg-muted/30 py-12">
      <div className="container">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg gradient-hero">
              <GraduationCap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">Grant Genius</span>
          </div>
          
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            {/* Dynamic CMS footer pages */}
            {visibleFooterPages?.map((page) => (
              <Link
                key={page.id}
                to={`/page/${page.slug}`}
                className="hover:text-foreground transition-colors"
              >
                {page.title}
              </Link>
            ))}
            
            {/* Fallback links if no CMS pages configured */}
            {(!visibleFooterPages || visibleFooterPages.length === 0) && (
              <>
                <Link to="/page/privacy" className="hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
                <Link to="/page/terms" className="hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
              </>
            )}
            
            <a href="mailto:support@grantgenius.com.au" className="hover:text-foreground transition-colors">
              Support
            </a>
          </div>
          
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Grant Genius · Powered by Disruptors Co
          </p>
        </div>
      </div>
    </footer>
  );
}
