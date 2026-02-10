import { GraduationCap } from "lucide-react";
import { Link } from "react-router-dom";
import { useCmsFooterPages } from "@/hooks/useCmsPages";
import { useAuth } from "@/hooks/useAuth";
import { useHomepageSettings } from "@/hooks/useHomepageSettings";

export function Footer() {
  const { isAuthenticated } = useAuth();
  const { data: footerPages } = useCmsFooterPages();
  const { data: settings } = useHomepageSettings();

  const visibleFooterPages = footerPages?.filter(
    (page) => !page.requires_auth || isAuthenticated
  );

  const brandDescription = settings?.footer_brand_description ?? "Empowering researchers to win commercialisation grants with AI-assisted applications.";
  const columns = settings?.footer_columns ?? [];
  const copyright = (settings?.footer_copyright ?? "© {year} Grant Genius · Powered by Disruptors Co").replace("{year}", String(new Date().getFullYear()));
  const supportEmail = settings?.footer_support_email ?? "support@grantgenius.com.au";

  const hasColumns = columns.length > 0;

  return (
    <footer className="border-t bg-muted/30 py-12">
      <div className="container">
        {hasColumns ? (
          /* Multi-column layout when footer columns are configured */
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand column */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg gradient-hero">
                  <GraduationCap className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="font-semibold">Grant Genius</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{brandDescription}</p>
              <a
                href={`mailto:${supportEmail}`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {supportEmail}
              </a>
            </div>

            {/* Dynamic columns */}
            {columns.map((col, i) => (
              <div key={i}>
                <h4 className="font-semibold text-sm mb-3">{col.heading}</h4>
                <ul className="space-y-2">
                  {col.links.map((link, j) => (
                    <li key={j}>
                      {link.url.startsWith("/") ? (
                        <Link
                          to={link.url}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {link.label}
                        </Link>
                      ) : (
                        <a
                          href={link.url}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                          target={link.url.startsWith("http") ? "_blank" : undefined}
                          rel={link.url.startsWith("http") ? "noopener noreferrer" : undefined}
                        >
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* CMS pages column (if any) */}
            {visibleFooterPages && visibleFooterPages.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-3">Legal</h4>
                <ul className="space-y-2">
                  {visibleFooterPages.map((page) => (
                    <li key={page.id}>
                      <Link
                        to={`/page/${page.slug}`}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {page.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Copyright */}
            <div className="md:col-span-4 pt-6 border-t">
              <p className="text-sm text-muted-foreground">{copyright}</p>
            </div>
          </div>
        ) : (
          /* Simple layout (original style) when no columns configured */
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg gradient-hero">
                <GraduationCap className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">Grant Genius</span>
            </div>

            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              {visibleFooterPages?.map((page) => (
                <Link
                  key={page.id}
                  to={`/page/${page.slug}`}
                  className="hover:text-foreground transition-colors"
                >
                  {page.title}
                </Link>
              ))}

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

              <a href={`mailto:${supportEmail}`} className="hover:text-foreground transition-colors">
                Support
              </a>
            </div>

            <p className="text-sm text-muted-foreground">{copyright}</p>
          </div>
        )}
      </div>
    </footer>
  );
}
