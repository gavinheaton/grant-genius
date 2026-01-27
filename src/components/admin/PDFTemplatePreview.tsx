import { supabase } from "@/integrations/supabase/client";

interface PDFTemplatePreviewProps {
  template: {
    page_format: string;
    logo_path: string | null;
    header_text: string;
    footer_text: string;
    primary_color: string;
    secondary_color: string;
    font_family: string;
    heading_sizes_json: {
      h1: number;
      h2: number;
      h3: number;
      body: number;
    };
    include_cover_page: boolean;
    watermark_text: string;
  };
}

export function PDFTemplatePreview({ template }: PDFTemplatePreviewProps) {
  const logoUrl = template.logo_path
    ? supabase.storage.from("pdf-assets").getPublicUrl(template.logo_path).data.publicUrl
    : null;

  const aspectRatio = template.page_format === "Letter" ? "8.5/11" : "210/297";

  return (
    <div className="sticky top-4">
      <h3 className="text-sm font-medium mb-3">Live Preview</h3>
      <div
        className="bg-white border shadow-lg overflow-hidden relative"
        style={{
          aspectRatio,
          width: "100%",
          maxWidth: "280px",
          fontFamily: template.font_family,
        }}
      >
        {/* Watermark */}
        {template.watermark_text && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden"
            style={{
              transform: "rotate(-45deg)",
              opacity: 0.08,
            }}
          >
            <span
              className="text-4xl font-bold whitespace-nowrap"
              style={{ color: template.primary_color }}
            >
              {template.watermark_text}
            </span>
          </div>
        )}

        {/* Header */}
        <div
          className="px-3 py-2 border-b text-white text-center"
          style={{ backgroundColor: template.primary_color }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo"
              className="h-5 mx-auto object-contain"
            />
          ) : (
            <span className="text-xs opacity-80">
              {template.header_text || "Header"}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-3 space-y-2">
          {template.include_cover_page && (
            <div className="text-center mb-3 pb-2 border-b border-dashed">
              <div
                className="font-bold"
                style={{
                  fontSize: `${Math.max(8, template.heading_sizes_json.h1 / 3)}px`,
                  color: template.primary_color,
                }}
              >
                Report Title
              </div>
              <div
                className="text-muted-foreground"
                style={{ fontSize: `${Math.max(6, template.heading_sizes_json.body / 2)}px` }}
              >
                Generated on {new Date().toLocaleDateString()}
              </div>
            </div>
          )}

          <div
            className="font-semibold"
            style={{
              fontSize: `${Math.max(7, template.heading_sizes_json.h1 / 3.5)}px`,
              color: template.primary_color,
            }}
          >
            Heading 1
          </div>
          <div
            className="font-medium"
            style={{
              fontSize: `${Math.max(6, template.heading_sizes_json.h2 / 3.5)}px`,
              color: template.secondary_color,
            }}
          >
            Heading 2
          </div>
          <div
            className="font-medium"
            style={{
              fontSize: `${Math.max(5, template.heading_sizes_json.h3 / 3.5)}px`,
            }}
          >
            Heading 3
          </div>
          <div
            className="text-muted-foreground leading-tight"
            style={{ fontSize: `${Math.max(5, template.heading_sizes_json.body / 2.5)}px` }}
          >
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
            eiusmod tempor incididunt ut labore.
          </div>

          {/* Sample table */}
          <div
            className="border rounded overflow-hidden mt-2"
            style={{ borderColor: template.primary_color }}
          >
            <div
              className="px-1 py-0.5 text-white text-center"
              style={{
                backgroundColor: template.primary_color,
                fontSize: "5px",
              }}
            >
              Sample Table
            </div>
            <div className="grid grid-cols-2 text-center" style={{ fontSize: "4px" }}>
              <div className="border-r border-b p-0.5">Item A</div>
              <div className="border-b p-0.5">$1,000</div>
              <div className="border-r p-0.5">Item B</div>
              <div className="p-0.5">$2,500</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="absolute bottom-0 left-0 right-0 px-3 py-1 border-t text-center"
          style={{
            fontSize: "5px",
            backgroundColor: "#f8f9fa",
            color: template.primary_color,
          }}
        >
          {template.footer_text
            .replace("{page}", "1")
            .replace("{pages}", "5")
            .replace("{date}", new Date().toLocaleDateString())}
        </div>
      </div>

      <div className="mt-3 text-xs text-muted-foreground text-center">
        {template.page_format} format
      </div>
    </div>
  );
}
