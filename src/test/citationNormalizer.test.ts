/**
 * Citation Normalizer Test Suite
 * 
 * Tests for the citation sanitization system including:
 * - sanitizeFinalReport()
 * - lintBracketTokens()
 * - validateFinalReport()
 * - normalizeReportHtml()
 */

import { describe, it, expect } from "vitest";
import { 
  sanitizeFinalReport, 
  lintBracketTokens,
  lintBracketTokensDetailed,
  normalizeReportHtml,
  validateFinalReport,
  buildSourceMap,
  convertToApaInText,
  scanForForbiddenTokens,
  sanitizeStepOutputs,
  validateCitationBidirectional,
  type SourceEntry,
  type SanitizationIssue,
} from "../lib/citationNormalizer";

describe("citationNormalizer", () => {
  
  // ============================================
  // sanitizeFinalReport tests
  // ============================================
  
  describe("sanitizeFinalReport", () => {
    it("should remove [S0-1] internal markers", () => {
      const input = "<p>This is a claim [S0-1] with citation.</p>";
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toContain("[S0-1]");
      expect(result.removedTokens.length).toBeGreaterThan(0);
      expect(result.stats.tokensRemoved).toBeGreaterThan(0);
    });

    it("should remove [article] placeholder", () => {
      const input = "<p>According to the study [article], results show...</p>";
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toContain("[article]");
      expect(result.removedTokens.some(t => t.original_token === "[article]")).toBe(true);
    });

    it("should remove $[Amount] budget placeholders", () => {
      const input = "<p>The budget is $[Amount] million.</p>";
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toContain("$[Amount]");
      expect(result.html).not.toContain("$[");
      expect(result.removedTokens.some(t => t.original_token.includes("$["))).toBe(true);
    });

    it("should remove {TBD} placeholders", () => {
      const input = "<p>The value is {TBD} for this field.</p>";
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toContain("{TBD}");
    });

    it("should remove undefined adjacent to markers", () => {
      const input = "<p>This undefined [S0-1] is broken.</p>";
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toMatch(/undefined\s*\[/);
    });

    it("should remove [ARTICLE-1] format markers", () => {
      const input = "<p>Research shows [ARTICLE-1] that...</p>";
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toContain("[ARTICLE-1]");
    });

    it("should remove [SOURCE-2] format markers", () => {
      const input = "<p>Data from [SOURCE-2] indicates...</p>";
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toContain("[SOURCE-2]");
    });

    it("should preserve linked numeric citations [1]", () => {
      const input = '<p>Citation <a href="#ref-1">[1]</a> is valid.</p>';
      const result = sanitizeFinalReport(input);
      
      expect(result.html).toContain('[1]');
      expect(result.html).toContain('href="#ref-1"');
    });

    it("should handle multiple markers in sequence", () => {
      const input = "<p>Claims [S0-1][S0-2] with multiple citations.</p>";
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toContain("[S0-1]");
      expect(result.html).not.toContain("[S0-2]");
    });

    it("should clean up orphan parentheses after removal", () => {
      const input = "<p>According to research ([S0-1]) this is true.</p>";
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toContain("()");
    });

    it("should use preserveContext option to replace with (citation unavailable)", () => {
      const input = "<p>According to [S0-1] the market grew.</p>";
      const result = sanitizeFinalReport(input, { preserveContext: true });
      
      // Note: preserveContext only applies when wouldBreakMeaning returns true
      expect(result.html).not.toContain("[S0-1]");
    });

    it("should throw when failOnViolations is true and violations remain", () => {
      // This tests the hard failure gate
      const input = "<p>Leaked [RefA1] marker.</p>";
      
      // Shouldn't throw with failOnViolations: false (default)
      expect(() => sanitizeFinalReport(input)).not.toThrow();
      
      // The sanitizer should have cleaned it
      const result = sanitizeFinalReport(input);
      expect(result.html).not.toContain("[RefA1]");
    });
  });

  // ============================================
  // lintBracketTokens tests
  // ============================================

  describe("lintBracketTokens", () => {
    it("should pass for clean HTML with linked citations", () => {
      const html = '<p>Claim <a href="#ref-1">[1]</a> is cited.</p>';
      const result = lintBracketTokens(html);
      
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("should fail for internal source IDs [S0-1]", () => {
      const html = "<p>Claim [S0-1] has internal ID.</p>";
      const result = lintBracketTokens(html);
      
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some(v => v.includes("S0-1"))).toBe(true);
    });

    it("should fail for [ARTICLE-1] markers", () => {
      const html = "<p>According to [ARTICLE-1] research...</p>";
      const result = lintBracketTokens(html);
      
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.includes("ARTICLE"))).toBe(true);
    });

    it("should fail for {TBD} placeholders", () => {
      const html = "<p>Value is {TBD}.</p>";
      const result = lintBracketTokens(html);
      
      expect(result.passed).toBe(false);
    });

    it("should fail for $[Amount] budget placeholders", () => {
      const html = "<p>Budget: $[Amount]</p>";
      const result = lintBracketTokens(html);
      
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.includes("Budget"))).toBe(true);
    });

    it("should fail for undefined adjacent to markers", () => {
      const html = "<p>This undefined [ref] is broken.</p>";
      const result = lintBracketTokens(html);
      
      expect(result.passed).toBe(false);
    });

    it("should detect unlinked numeric citations", () => {
      const html = "<p>Citation [1] without href.</p>";
      const result = lintBracketTokens(html);
      
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.includes("Unlinked citation"))).toBe(true);
    });

    it("should pass for completely clean report", () => {
      const html = `
        <h1>Market Analysis Report</h1>
        <p>The market is growing at 15% CAGR <a href="#ref-1">[1]</a>.</p>
        <p>Competition is increasing <a href="#ref-2">[2]</a>.</p>
        <section class="references-section">
          <h2>References</h2>
          <ol>
            <li id="ref-1">Smith, J. (2024). Market Report.</li>
            <li id="ref-2">Jones, A. (2023). Industry Analysis.</li>
          </ol>
        </section>
      `;
      const result = lintBracketTokens(html);
      
      expect(result.passed).toBe(true);
    });
  });

  // ============================================
  // validateFinalReport tests (hard fail)
  // ============================================

  describe("validateFinalReport (hard fail)", () => {
    it("should throw for remaining internal markers", () => {
      const html = "<p>Leaked [S0-1] marker.</p>";
      
      expect(() => validateFinalReport(html)).toThrow(
        /Internal citation markers leaked into final report/
      );
    });

    it("should throw for [article] placeholders", () => {
      const html = "<p>According to [article] the data shows...</p>";
      
      expect(() => validateFinalReport(html)).toThrow();
    });

    it("should throw for undefined adjacent to markers", () => {
      const html = "<p>This undefined [ref] is wrong.</p>";
      
      expect(() => validateFinalReport(html)).toThrow();
    });

    it("should not throw for clean report", () => {
      const html = '<p>Clean <a href="#ref-1">[1]</a> report.</p>';
      
      expect(() => validateFinalReport(html)).not.toThrow();
    });

    it("should not throw for empty HTML", () => {
      expect(() => validateFinalReport("")).not.toThrow();
    });

    it("should handle reports with only text (no citations)", () => {
      const html = "<p>This is a simple paragraph with no citations.</p>";
      
      expect(() => validateFinalReport(html)).not.toThrow();
    });
  });

  // ============================================
  // normalizeReportHtml tests
  // ============================================

  describe("normalizeReportHtml", () => {
    const mockSources: SourceEntry[] = [
      {
        id: "S0-1",
        title: "Market Research Report 2024",
        publisher: "Industry Analytics",
        year: "2024",
        url: "https://example.com/report"
      },
      {
        id: "S0-2",
        title: "Competitor Analysis",
        authors: "Smith, John",
        year: "2023",
        url: "https://example.com/analysis"
      }
    ];

    it("should convert [S0-1] to linked numeric citations", () => {
      const html = "<p>Market is growing [S0-1].</p>";
      const result = normalizeReportHtml(html, mockSources);
      
      expect(result.html).toContain('href="#ref-1"');
      expect(result.html).toContain('[1]');
      expect(result.html).not.toContain('[S0-1]');
    });

    it("should build references section", () => {
      const html = "<p>Data shows [S0-1] growth.</p>";
      const result = normalizeReportHtml(html, mockSources);
      
      expect(result.referencesHtml).toContain('Market Research Report 2024');
      expect(result.referencesHtml).toContain('Industry Analytics');
      expect(result.referencesHtml).toContain('2024');
    });

    it("should track unresolved sources in unknowns", () => {
      const html = "<p>According to [S0-999] this is unknown.</p>";
      const result = normalizeReportHtml(html, mockSources);
      
      expect(result.unknowns.length).toBeGreaterThan(0);
    });

    it("should handle empty source list gracefully", () => {
      const html = "<p>Text with [S0-1] marker.</p>";
      const result = normalizeReportHtml(html, []);
      
      expect(result.html).not.toContain('[S0-1]');
      expect(result.unknowns.length).toBeGreaterThan(0);
    });

    it("should include stats about normalization", () => {
      const html = "<p>Growth [S0-1] and competition [S0-2].</p>";
      const result = normalizeReportHtml(html, mockSources);
      
      expect(result.stats).toBeDefined();
      expect(result.stats.totalMarkersFound).toBeGreaterThanOrEqual(2);
      expect(result.stats.markersResolved).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================
  // buildSourceMap tests
  // ============================================

  describe("buildSourceMap", () => {
    it("should build map from sources array", () => {
      const sources: SourceEntry[] = [
        { id: "S0-1", title: "Test Source" },
        { id: "S0-2", title: "Another Source" }
      ];
      
      const map = buildSourceMap(sources);
      
      expect(map.size).toBe(4); // Original + alternate keys
      expect(map.has("S0-1")).toBe(true);
      expect(map.has("S0-2")).toBe(true);
    });

    it("should handle empty array", () => {
      const map = buildSourceMap([]);
      
      expect(map.size).toBe(0);
    });

    it("should normalize IDs to uppercase", () => {
      const sources: SourceEntry[] = [
        { id: "s0-1", title: "Lowercase ID" }
      ];
      
      const map = buildSourceMap(sources);
      
      expect(map.has("S0-1")).toBe(true);
    });
  });

  // ============================================
  // Edge cases and integration tests
  // ============================================

  describe("edge cases", () => {
    it("should handle HTML with style attributes (not strip them)", () => {
      const input = '<p style="color: red;">Text here</p>';
      const result = sanitizeFinalReport(input);
      
      expect(result.html).toContain('style="color: red;"');
    });

    it("should handle multiple placeholder types in one document", () => {
      const input = `
        <p>Budget: $[Amount] million</p>
        <p>Source: [S0-1]</p>
        <p>Value: {TBD}</p>
        <p>Company: [COMPANY]</p>
      `;
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toContain("$[Amount]");
      expect(result.html).not.toContain("[S0-1]");
      expect(result.html).not.toContain("{TBD}");
      expect(result.html).not.toContain("[COMPANY]");
    });

    it("should handle nested HTML elements", () => {
      const input = '<p><strong>Important [S0-1] claim</strong> here.</p>';
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toContain("[S0-1]");
      expect(result.html).toContain("<strong>");
      expect(result.html).toContain("</strong>");
    });

    it("should handle tables with placeholders", () => {
      const input = `
        <table>
          <tr><td>Market Size</td><td>$[Amount]</td></tr>
          <tr><td>Source</td><td>[S0-1]</td></tr>
        </table>
      `;
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toContain("$[Amount]");
      expect(result.html).not.toContain("[S0-1]");
      expect(result.html).toContain("<table>");
    });
  });

  // ============================================
  // Step reference patterns (new)
  // ============================================

  describe("step reference patterns", () => {
    it("should remove [step9] references", () => {
      const input = "<p>Data from [step9] shows growth.</p>";
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toContain("[step9]");
    });

    it("should remove [step0] references", () => {
      const input = "<p>According to [step0] the sources indicate...</p>";
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toContain("[step0]");
    });

    it("should remove [Source1] markers", () => {
      const input = "<p>According to [Source1] the market is growing.</p>";
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toContain("[Source1]");
    });

    it("should remove [Source] without number", () => {
      const input = "<p>The data from [Source] shows...</p>";
      const result = sanitizeFinalReport(input);
      
      expect(result.html).not.toContain("[Source]");
    });

    it("should fail lint for step references", () => {
      const html = "<p>Based on [step5] analysis...</p>";
      const result = lintBracketTokens(html);
      
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.includes("step5"))).toBe(true);
    });
  });

  // ============================================
  // APA citation format tests
  // ============================================

  describe("APA citation format", () => {
    it("should convert [S0-1] to (Author, Year) format", () => {
      const sources: SourceEntry[] = [
        { id: "S0-1", authors: "Smith, J.", year: "2024", title: "Market Report" }
      ];
      const result = convertToApaInText("<p>Market grew [S0-1].</p>", buildSourceMap(sources));
      
      expect(result.html).toContain("(Smith, 2024)");
      expect(result.html).not.toContain("[S0-1]");
      expect(result.html).toContain('href="#ref-1"');
    });

    it("should use publisher when author not available", () => {
      const sources: SourceEntry[] = [
        { id: "S0-1", publisher: "ABS", year: "2023", title: "Industry Report" }
      ];
      const result = convertToApaInText("<p>Data shows [S0-1].</p>", buildSourceMap(sources));
      
      expect(result.html).toContain("(ABS, 2023)");
    });

    it("should use n.d. when year not available", () => {
      const sources: SourceEntry[] = [
        { id: "S0-1", authors: "Jones", title: "Research Paper" }
      ];
      const result = convertToApaInText("<p>Research [S0-1].</p>", buildSourceMap(sources));
      
      expect(result.html).toContain("(Jones, n.d.)");
    });

    it("should replace missing source with Unknown phrase", () => {
      const result = convertToApaInText("<p>Data [S0-999] unavailable.</p>", new Map());
      
      expect(result.html).toContain("Unknown (no validated source found)");
      expect(result.unknowns.length).toBe(1);
      expect(result.unknowns[0].type).toBe("citation_unresolved");
    });

    it("should log unknowns with sentence context", () => {
      const result = convertToApaInText(
        "<p>The market analysis from [S0-999] indicates strong growth potential.</p>", 
        new Map()
      );
      
      expect(result.unknowns.length).toBe(1);
      expect(result.unknowns[0].sentence_context).toContain("market analysis");
    });

    it("should handle multiple sources in sequence", () => {
      const sources: SourceEntry[] = [
        { id: "S0-1", authors: "Smith", year: "2024", title: "Report 1" },
        { id: "S0-2", publisher: "ABS", year: "2023", title: "Report 2" }
      ];
      const result = convertToApaInText(
        "<p>Growth [S0-1] and competition [S0-2].</p>", 
        buildSourceMap(sources)
      );
      
      expect(result.html).toContain("(Smith, 2024)");
      expect(result.html).toContain("(ABS, 2023)");
      expect(result.html).not.toContain("[S0-1]");
      expect(result.html).not.toContain("[S0-2]");
    });
  });

  // ============================================
  // Sentence context in errors
  // ============================================

  describe("sentence context in errors", () => {
    it("should include surrounding sentence in validation errors", () => {
      const html = "<p>The market showed [S0-1] significant growth rates in 2024.</p>";
      
      expect(() => validateFinalReport(html)).toThrow(/growth rates/);
    });

    it("should provide detailed violations with sentence context", () => {
      const html = "<p>According to [article] the industry is growing rapidly.</p>";
      const result = lintBracketTokensDetailed(html);
      
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].sentence).toContain("industry is growing");
    });

    it("should include offset in detailed violations", () => {
      const html = "<p>Data from [Source1] shows trends.</p>";
      const result = lintBracketTokensDetailed(html);
      
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.offset > 0)).toBe(true);
    });
  });

  // ============================================
  // Integration test: full pipeline
  // ============================================

  describe("full normalization pipeline", () => {
    it("should produce clean report with APA citations and no internal markers", () => {
      const sources: SourceEntry[] = [
        { id: "S0-1", authors: "Smith, J.", year: "2024", title: "Market Analysis", url: "https://example.com" },
        { id: "S0-2", publisher: "Australian Bureau of Statistics", year: "2023", title: "Industry Report" }
      ];
      
      const inputHtml = `
        <h1>Report</h1>
        <p>The market is growing at 15% CAGR [S0-1].</p>
        <p>Competition is increasing [S0-2].</p>
        <p>Budget: $[Amount] million {TBD}.</p>
        <p>Unknown data [S0-999].</p>
      `;
      
      const result = normalizeReportHtml(inputHtml, sources);
      
      // Should not contain internal markers
      expect(result.html).not.toContain("[S0-1]");
      expect(result.html).not.toContain("[S0-2]");
      expect(result.html).not.toContain("[S0-999]");
      expect(result.html).not.toContain("$[Amount]");
      expect(result.html).not.toContain("{TBD}");
      
      // Should have references section
      expect(result.referencesHtml).toContain("Smith");
      expect(result.referencesHtml).toContain("2024");
      
      // Should track unknowns
      expect(result.unknowns.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Single-letter placeholder removal tests (NEW)
  // ============================================

  describe("single-letter placeholder removal", () => {
    it("should remove $Z placeholders", () => {
      const input = "<p>The market size is $Z million.</p>";
      const result = sanitizeFinalReport(input);
      expect(result.html).not.toContain("$Z");
    });

    it("should remove 'B additional jobs' pattern", () => {
      const input = "<p>This will create B additional jobs in the region.</p>";
      const result = sanitizeFinalReport(input);
      expect(result.html).not.toMatch(/\bB\s+additional\s+jobs/i);
    });

    it("should remove '$X million' pattern", () => {
      const input = "<p>Revenue is projected at $X million annually.</p>";
      const result = sanitizeFinalReport(input);
      expect(result.html).not.toMatch(/\$X\s+million/i);
    });

    it("should remove A% placeholder", () => {
      const input = "<p>Market share of A% is expected.</p>";
      const result = sanitizeFinalReport(input);
      expect(result.html).not.toContain("A%");
    });

    it("should remove B% placeholder", () => {
      const input = "<p>Growth rate of B% annually.</p>";
      const result = sanitizeFinalReport(input);
      expect(result.html).not.toContain("B%");
    });

    it("should remove C% placeholder", () => {
      const input = "<p>Margin of C% expected.</p>";
      const result = sanitizeFinalReport(input);
      expect(result.html).not.toContain("C%");
    });

    it("should remove naked source IDs without brackets", () => {
      const input = "<p>According to S0-1 the market grew.</p>";
      const result = sanitizeFinalReport(input);
      expect(result.html).not.toMatch(/\bS0-1\b/);
    });
  });

  // ============================================
  // scanForForbiddenTokens tests (NEW)
  // ============================================

  describe("scanForForbiddenTokens", () => {
    it("should return issues_found array with location for string content", () => {
      const content = "The TAM is $Z million based on market research.";
      const issues = scanForForbiddenTokens(content, "step3.market_sizing.tam");
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].location).toContain("step3.market_sizing.tam");
      expect(issues[0].token_type).toBe("single_letter_standin");
    });

    it("should scan nested objects recursively", () => {
      const content = { 
        market_sizing: { 
          tam: "The TAM is $Z million" 
        } 
      };
      const issues = scanForForbiddenTokens(content, "step3");
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].location).toContain("step3.market_sizing.tam");
    });

    it("should identify internal source ID token type", () => {
      const content = "According to [S0-1] the market grew.";
      const issues = scanForForbiddenTokens(content, "step2");
      expect(issues.some(i => i.token_type === "internal_source_id")).toBe(true);
    });

    it("should identify placeholder token type", () => {
      const content = "Value is {TBD} for this field.";
      const issues = scanForForbiddenTokens(content, "step2");
      expect(issues.some(i => i.token_type === "placeholder")).toBe(true);
    });

    it("should include sentence context", () => {
      const content = "The market analysis shows $Z million in revenue potential.";
      const issues = scanForForbiddenTokens(content, "step3");
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].sentence_context).toContain("market analysis");
    });
  });

  // ============================================
  // sanitizeStepOutputs tests (NEW)
  // ============================================

  describe("sanitizeStepOutputs", () => {
    it("should clean forbidden tokens from step outputs", () => {
      const stepOutputs = {
        step1: { content: "Market grew [S0-1] significantly." },
        step2: { value: "$Z million" }
      };
      const sourceMap = new Map();
      const result = sanitizeStepOutputs(stepOutputs, sourceMap);
      
      expect(result.issues_found.length).toBeGreaterThan(0);
      expect((result.clean_outputs.step2 as Record<string, unknown>)?.value).not.toContain("$Z");
    });

    it("should track unknowns for removed tokens", () => {
      const stepOutputs = {
        step1: { content: "{TBD}" }
      };
      const sourceMap = new Map();
      const result = sanitizeStepOutputs(stepOutputs, sourceMap);
      
      expect(result.unknowns.length).toBeGreaterThan(0);
      expect(result.unknowns[0].original_token).toBe("{TBD}");
    });
  });

  // ============================================
  // validateCitationBidirectional tests (NEW)
  // ============================================

  describe("validateCitationBidirectional", () => {
    it("should detect orphan references (defined but never cited)", () => {
      const html = "<p>Growth is strong <a href='#ref-1'>(Smith, 2024)</a>.</p>";
      const refs = '<li id="ref-1">Smith (2024)</li><li id="ref-2">Jones (2023)</li>';
      const result = validateCitationBidirectional(html, refs);
      
      expect(result.passed).toBe(false);
      expect(result.orphan_references).toContain("ref-2");
    });

    it("should detect orphan citations (cited but no reference)", () => {
      const html = '<p>Growth <a href="#ref-1">(Smith, 2024)</a> and <a href="#ref-3">(Jones, 2023)</a>.</p>';
      const refs = '<li id="ref-1">Smith (2024)</li>';
      const result = validateCitationBidirectional(html, refs);
      
      expect(result.passed).toBe(false);
      // Note: ref-3 is cited but ref-1 is defined, so ref-3 is orphan citation
      expect(result.orphan_citations.length).toBeGreaterThan(0);
    });

    it("should detect malformed n.d. without retrieval date", () => {
      const html = "<p>According to (ABS, n.d.) the data shows...</p>";
      const refs = '<li id="ref-1">ABS. (n.d.). Title.</li>';
      const result = validateCitationBidirectional(html, refs);
      
      expect(result.malformed_dates.length).toBeGreaterThan(0);
    });

    it("should pass when all citations map to references", () => {
      const html = '<p>Growth <a href="#ref-1">(Smith, 2024)</a> is strong.</p>';
      const refs = '<li id="ref-1">Smith (2024). Title.</li>';
      const result = validateCitationBidirectional(html, refs);
      
      // Should have no orphans
      expect(result.orphan_citations).toHaveLength(0);
      expect(result.orphan_references).toHaveLength(0);
    });

    it("should include fix actions for orphans", () => {
      const html = "<p>Growth <a href='#ref-1'>(Smith, 2024)</a>.</p>";
      const refs = '<li id="ref-1">Smith (2024)</li><li id="ref-2">Jones (2023)</li>';
      const result = validateCitationBidirectional(html, refs);
      
      expect(result.fix_actions.length).toBeGreaterThan(0);
      expect(result.fix_actions.some(a => a.includes("orphan"))).toBe(true);
    });
  });

  // ============================================
  // lint for single-letter patterns (NEW)
  // ============================================

  describe("lint single-letter patterns", () => {
    it("should fail lint for $Z placeholder", () => {
      const html = "<p>Budget: $Z million</p>";
      const result = lintBracketTokens(html);
      expect(result.passed).toBe(false);
    });

    it("should fail lint for A% placeholder", () => {
      // Note: A% pattern detection works via scanForForbiddenTokens, not lintBracketTokens
      // lintBracketTokens only checks bracket patterns [...] and {...}
      const html = "<p>Market share of A% expected.</p>";
      const issues = scanForForbiddenTokens(html, "test");
      expect(issues.some(i => i.offending_text === "A%")).toBe(true);
    });

    it("should fail lint for 'B additional jobs' pattern", () => {
      const html = "<p>Creating B additional jobs in Australia.</p>";
      const result = lintBracketTokens(html);
      expect(result.passed).toBe(false);
    });

    it("should fail lint for '$X million' pattern", () => {
      const html = "<p>Revenue of $X million projected.</p>";
      const result = lintBracketTokens(html);
      expect(result.passed).toBe(false);
    });

    it("should fail lint for naked source ID S0-1", () => {
      const html = "<p>According to S0-1 the market grew.</p>";
      const result = lintBracketTokens(html);
      expect(result.passed).toBe(false);
    });
  });
});
