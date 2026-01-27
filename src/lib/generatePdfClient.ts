import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { type PdfTemplate } from "@/hooks/usePdfTemplates";

// A4 dimensions in mm
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

// Convert mm to pixels at 96 DPI
const MM_TO_PX = 3.7795275591;

interface GeneratePdfOptions {
  template: PdfTemplate;
  grantName: string;
  reportTitle: string;
  generatedDate: string;
}

/**
 * Generate a PDF from an HTML element using html2canvas and jsPDF
 * @param element - The HTML element to capture
 * @param options - PDF generation options
 * @returns Promise<Blob> - The generated PDF as a blob
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  options: GeneratePdfOptions
): Promise<Blob> {
  const { template } = options;
  
  // Determine page format dimensions
  const pageWidth = A4_WIDTH_MM;
  const pageHeight = A4_HEIGHT_MM;
  
  // Get margins from template
  const margins = template.margins_json;
  const contentWidth = pageWidth - margins.left - margins.right;
  const contentHeight = pageHeight - margins.top - margins.bottom;
  
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
    format: template.page_format.toLowerCase() as "a4" | "letter",
  });
  
  // Calculate scaling to fit content width
  const imgWidth = contentWidth;
  const imgHeight = (canvas.height * contentWidth) / canvas.width;
  
  // Calculate how many pages we need
  const totalPages = Math.ceil(imgHeight / contentHeight);
  
  // For each page, slice the canvas and add to PDF
  for (let page = 0; page < totalPages; page++) {
    if (page > 0) {
      pdf.addPage();
    }
    
    // Calculate the portion of the canvas to use for this page
    const sourceY = page * (canvas.height / totalPages);
    const sourceHeight = canvas.height / totalPages;
    
    // Create a temporary canvas for this page slice
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sourceHeight;
    
    const ctx = pageCanvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(
        canvas,
        0, sourceY, canvas.width, sourceHeight,
        0, 0, canvas.width, sourceHeight
      );
    }
    
    // Add the sliced image to the PDF
    const imgData = pageCanvas.toDataURL("image/jpeg", 0.95);
    pdf.addImage(
      imgData,
      "JPEG",
      margins.left,
      margins.top,
      imgWidth,
      contentHeight
    );
    
    // Add footer with page numbers
    if (template.footer_text) {
      const footerText = template.footer_text
        .replace("{page}", String(page + 1))
        .replace("{pages}", String(totalPages));
      
      pdf.setFontSize(10);
      pdf.setTextColor(128, 128, 128);
      pdf.text(
        footerText,
        pageWidth / 2,
        pageHeight - 10,
        { align: "center" }
      );
    }
  }
  
  // Return as blob
  return pdf.output("blob");
}

/**
 * Download a blob as a file
 * @param blob - The blob to download
 * @param filename - The filename for the download
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
 * @param element - The HTML element to capture
 * @param options - PDF generation options
 * @param filename - The filename for the download
 */
export async function generateAndDownloadPdf(
  element: HTMLElement,
  options: GeneratePdfOptions,
  filename: string
): Promise<void> {
  const blob = await generatePdfFromElement(element, options);
  downloadPdf(blob, filename);
}
