/**
 * Utility functions for parsing and rendering markdown content
 */

interface TableCell {
  content: string;
  align: 'left' | 'center' | 'right';
}

interface ParsedTable {
  headers: TableCell[];
  rows: TableCell[][];
}

/**
 * Parse alignment from separator row
 */
function parseAlignment(separator: string): ('left' | 'center' | 'right')[] {
  return separator
    .split('|')
    .filter(cell => cell.trim())
    .map(cell => {
      const trimmed = cell.trim();
      const leftColon = trimmed.startsWith(':');
      const rightColon = trimmed.endsWith(':');
      
      if (leftColon && rightColon) return 'center';
      if (rightColon) return 'right';
      return 'left';
    });
}

/**
 * Parse a single row into cells
 */
function parseRow(row: string, alignments: ('left' | 'center' | 'right')[]): TableCell[] {
  return row
    .split('|')
    .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1) // Remove empty first/last
    .map((cell, idx) => ({
      content: cell.trim(),
      align: alignments[idx] || 'left'
    }));
}

/**
 * Check if a line is a table separator row
 */
function isSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  // Check if it only contains |, -, :, and spaces
  return /^\|[\s\-:|]+\|$/.test(trimmed);
}

/**
 * Check if a line is a table row
 */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|');
}

/**
 * Parse markdown tables from content
 */
function parseTable(lines: string[], startIdx: number): { table: ParsedTable | null; endIdx: number } {
  // Need at least 2 lines (header + separator)
  if (startIdx + 1 >= lines.length) return { table: null, endIdx: startIdx };
  
  const headerLine = lines[startIdx];
  const separatorLine = lines[startIdx + 1];
  
  // Validate header and separator
  if (!isTableRow(headerLine) || !isSeparatorRow(separatorLine)) {
    return { table: null, endIdx: startIdx };
  }
  
  const alignments = parseAlignment(separatorLine);
  const headers = parseRow(headerLine, alignments);
  
  // Parse data rows
  const rows: TableCell[][] = [];
  let endIdx = startIdx + 2;
  
  while (endIdx < lines.length && isTableRow(lines[endIdx]) && !isSeparatorRow(lines[endIdx])) {
    rows.push(parseRow(lines[endIdx], alignments));
    endIdx++;
  }
  
  return {
    table: { headers, rows },
    endIdx: endIdx - 1
  };
}

/**
 * Format inline markdown (bold, italic, links) in cell content
 */
function formatInlineMarkdown(content: string): string {
  return content
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary hover:underline">$1</a>');
}

/**
 * Convert parsed table to HTML for in-app viewing (with Tailwind classes)
 */
function tableToHtml(table: ParsedTable): string {
  const alignClass = (align: 'left' | 'center' | 'right') => {
    switch (align) {
      case 'center': return 'text-center';
      case 'right': return 'text-right';
      default: return 'text-left';
    }
  };

  const headerCells = table.headers
    .map(h => `<th class="border border-border bg-muted px-4 py-2 font-medium ${alignClass(h.align)}">${formatInlineMarkdown(h.content)}</th>`)
    .join('');

  const bodyRows = table.rows
    .map((row, idx) => {
      const cells = row
        .map(c => `<td class="border border-border px-4 py-2 ${alignClass(c.align)}">${formatInlineMarkdown(c.content)}</td>`)
        .join('');
      const rowClass = idx % 2 === 1 ? 'bg-muted/30' : '';
      return `<tr class="${rowClass}">${cells}</tr>`;
    })
    .join('');

  return `
<div class="overflow-x-auto my-4">
  <table class="w-full border-collapse text-sm">
    <thead>
      <tr>${headerCells}</tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</div>`;
}

/**
 * Convert parsed table to HTML with inline styles for PDF rendering
 */
function tableToPdfHtml(table: ParsedTable, primaryColor: string = '#2563eb'): string {
  const alignStyle = (align: 'left' | 'center' | 'right') => `text-align: ${align};`;

  const headerCells = table.headers
    .map(h => `<th style="border: 1px solid #e5e7eb; padding: 10px 14px; background-color: ${primaryColor}; color: white; font-weight: 600; ${alignStyle(h.align)}">${formatInlineMarkdownForPdf(h.content)}</th>`)
    .join('');

  const bodyRows = table.rows
    .map((row, idx) => {
      const bgColor = idx % 2 === 1 ? '#f9fafb' : '#ffffff';
      const cells = row
        .map(c => `<td style="border: 1px solid #e5e7eb; padding: 10px 14px; ${alignStyle(c.align)}">${formatInlineMarkdownForPdf(c.content)}</td>`)
        .join('');
      return `<tr style="background-color: ${bgColor};">${cells}</tr>`;
    })
    .join('');

  return `
<table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
  <thead>
    <tr>${headerCells}</tr>
  </thead>
  <tbody>${bodyRows}</tbody>
</table>`;
}

/**
 * Format inline markdown for PDF (with inline styles)
 */
function formatInlineMarkdownForPdf(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #2563eb; text-decoration: underline;">$1</a>');
}

/**
 * Parse all markdown tables in content and convert to HTML
 * For in-app viewing with Tailwind classes
 */
export function parseMarkdownTables(content: string): string {
  if (!content) return '';
  
  const lines = content.split('\n');
  const result: string[] = [];
  let i = 0;
  
  while (i < lines.length) {
    if (isTableRow(lines[i]) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const { table, endIdx } = parseTable(lines, i);
      if (table) {
        result.push(tableToHtml(table));
        i = endIdx + 1;
        continue;
      }
    }
    result.push(lines[i]);
    i++;
  }
  
  return result.join('\n');
}

/**
 * Parse all markdown tables in content and convert to HTML with inline styles
 * For PDF rendering with html2canvas
 */
export function parseMarkdownTablesForPdf(content: string, primaryColor?: string): string {
  if (!content) return '';
  
  const lines = content.split('\n');
  const result: string[] = [];
  let i = 0;
  
  while (i < lines.length) {
    if (isTableRow(lines[i]) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const { table, endIdx } = parseTable(lines, i);
      if (table) {
        result.push(tableToPdfHtml(table, primaryColor));
        i = endIdx + 1;
        continue;
      }
    }
    result.push(lines[i]);
    i++;
  }
  
  return result.join('\n');
}

/**
 * Parse markdown content into sections by ## headings
 * For the new unified report_markdown format
 */
export interface ParsedSection {
  title: string;
  content: string;
}

export function parseMarkdownSections(markdown: string): ParsedSection[] {
  if (!markdown) return [];
  
  const sections: ParsedSection[] = [];
  const lines = markdown.split('\n');
  
  let currentTitle = '';
  let currentContent: string[] = [];
  
  for (const line of lines) {
    // Check for ## or ### section headers
    const headerMatch = line.match(/^#{1,3}\s+(.+)$/);
    
    if (headerMatch) {
      // Save previous section if exists
      if (currentTitle || currentContent.length > 0) {
        sections.push({
          title: currentTitle || 'Introduction',
          content: currentContent.join('\n').trim()
        });
      }
      
      currentTitle = headerMatch[1].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  
  // Don't forget the last section
  if (currentTitle || currentContent.length > 0) {
    sections.push({
      title: currentTitle || 'Content',
      content: currentContent.join('\n').trim()
    });
  }
  
  return sections.filter(s => s.content.length > 0);
}
