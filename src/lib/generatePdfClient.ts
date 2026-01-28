import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { type PdfTemplate } from "@/hooks/usePdfTemplates";

// A4 dimensions in mm
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

// Letter dimensions in mm
const LETTER_WIDTH_MM = 215.9;
const LETTER_HEIGHT_MM = 279.4;

// Legal dimensions in mm
const LEGAL_WIDTH_MM = 215.9;
const LEGAL_HEIGHT_MM = 355.6;

interface GeneratePdfOptions {
  template: PdfTemplate;
  grantName: string;
  reportTitle: string;
  generatedDate: string;
}

interface PageDimensions {
  width: number;
  height: number;
}

function getPageDimensions(format: string): PageDimensions {
  switch (format.toLowerCase()) {
    case "letter":
      return { width: LETTER_WIDTH_MM, height: LETTER_HEIGHT_MM };
    case "legal":
      return { width: LEGAL_WIDTH_MM, height: LEGAL_HEIGHT_MM };
    case "a4":
    default:
      return { width: A4_WIDTH_MM, height: A4_HEIGHT_MM };
  }
}

/**
 * Preload a Google Font before PDF generation
 */
export async function preloadGoogleFont(fontFamily: string): Promise<void> {
  // Check if font is already loaded
  const existingLink = document.querySelector(`link[href*="${fontFamily.replace(/ /g, '+')}"]`);
  if (existingLink) {
    await document.fonts.ready;
    return;
  }

  const link = document.createElement('link');
  link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`;
  link.rel = 'stylesheet';
  document.head.appendChild(link);
  
  // Wait for font to load with timeout
  await Promise.race([
    document.fonts.ready,
    new Promise(resolve => setTimeout(resolve, 3000)) // 3s timeout
  ]);
}

/**
 * Find page break positions from elements with data-page-break attribute
 */
function findPageBreakPositions(element: HTMLElement): number[] {
  const breakElements = element.querySelectorAll('[data-page-break="true"]');
  const positions: number[] = [];
  
  breakElements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    // Get the position relative to the container
    positions.push(htmlEl.offsetTop);
  });
  
  return positions.sort((a, b) => a - b);
}

/**
 * Generate a PDF from an HTML element using html2canvas and jsPDF
 * with smart page breaks at section boundaries
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  options: GeneratePdfOptions
): Promise<Blob> {
  const { template } = options;
  
  // Preload font first
  await preloadGoogleFont(template.font_family);
  
  // Wait a bit for font to be applied
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Determine page format dimensions
  const { width: pageWidth, height: pageHeight } = getPageDimensions(template.page_format);
  
  // Get margins from template
  const margins = template.margins_json;
  const contentWidth = pageWidth - margins.left - margins.right;
  const contentHeight = pageHeight - margins.top - margins.bottom - 15; // Reserve 15mm for footer
  
  // Find page break positions before capturing
  const breakPositions = findPageBreakPositions(element);
  
  // Capture the element with html2canvas at high resolution
  const canvas = await html2canvas(element, {
    scale: 2, // 2x resolution for crisp output
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });
  
  // Create PDF document
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: template.page_format.toLowerCase() as "a4" | "letter" | "legal",
  });
  
  // Calculate scaling factor (canvas pixels to PDF mm)
  const scale = contentWidth / canvas.width;
  const pxPerMm = canvas.width / contentWidth;
  
  // Calculate page height in pixels
  const pageHeightPx = contentHeight * pxPerMm;
  
  // Determine slice points
  let slicePoints: number[] = [0];
  
  if (breakPositions.length > 0 && template.section_page_breaks) {
    // Use smart slicing at section boundaries
    // Convert break positions to canvas pixels (accounting for scale used by html2canvas)
    const breakPositionsPx = breakPositions.map(pos => pos * 2); // html2canvas scale is 2
    
    let currentY = 0;
    for (const breakPx of breakPositionsPx) {
      if (breakPx > currentY) {
        slicePoints.push(breakPx);
        currentY = breakPx;
      }
    }
    slicePoints.push(canvas.height);
  } else {
    // Fall back to fixed-height slicing
    let y = 0;
    while (y < canvas.height) {
      y += pageHeightPx;
      slicePoints.push(Math.min(y, canvas.height));
    }
  }
  
  // Remove duplicates and sort
  slicePoints = [...new Set(slicePoints)].sort((a, b) => a - b);
  
  const totalPages = slicePoints.length - 1;
  
  // For each page, slice the canvas and add to PDF
  for (let page = 0; page < totalPages; page++) {
    if (page > 0) {
      pdf.addPage();
    }
    
    const sourceY = slicePoints[page];
    const sourceHeight = slicePoints[page + 1] - sourceY;
    
    // Skip empty pages
    if (sourceHeight <= 0) continue;
    
    // Create a temporary canvas for this page slice
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.min(sourceHeight, pageHeightPx);
    
    const ctx = pageCanvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(
        canvas,
        0, sourceY, canvas.width, pageCanvas.height,
        0, 0, canvas.width, pageCanvas.height
      );
    }
    
    // Calculate the height for this specific page slice in mm
    const sliceHeightMm = pageCanvas.height * scale;
    
    // Add the sliced image to the PDF
    const imgData = pageCanvas.toDataURL("image/jpeg", 0.95);
    pdf.addImage(
      imgData,
      "JPEG",
      margins.left,
      margins.top,
      contentWidth,
      Math.min(sliceHeightMm, contentHeight)
    );
    
    // Add footer with page numbers and branding
    addFooter(pdf, template, page + 1, totalPages, pageWidth, pageHeight);
  }
  
  // Return as blob
  return pdf.output("blob");
}

/**
 * Add footer with page numbers and branding to a PDF page
 */
function addFooter(
  pdf: jsPDF,
  template: PdfTemplate,
  currentPage: number,
  totalPages: number,
  pageWidth: number,
  pageHeight: number
): void {
  const footerY = pageHeight - 10;
  
  // Footer text (left side - page numbers)
  if (template.footer_text) {
    const footerText = template.footer_text
      .replace("{page}", String(currentPage))
      .replace("{pages}", String(totalPages))
      .replace("{date}", new Date().toLocaleDateString());
    
    pdf.setFontSize(9);
    pdf.setTextColor(128, 128, 128);
    pdf.text(footerText, template.margins_json.left, footerY);
  }
  
  // Powered by text (right side)
  const poweredByText = (template as any).powered_by_text || "Powered by Disruptors Co";
  if (poweredByText) {
    pdf.setFontSize(8);
    pdf.setTextColor(160, 160, 160);
    pdf.text(poweredByText, pageWidth - template.margins_json.right, footerY, { align: "right" });
  }
}

/**
 * Download a blob as a file
 */
export function downloadPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate and download a PDF in one call
 */
export async function generateAndDownloadPdf(
  element: HTMLElement,
  options: GeneratePdfOptions,
  filename: string
): Promise<void> {
  const blob = await generatePdfFromElement(element, options);
  downloadPdf(blob, filename);
}
