/**
 * Citation Normalizer + Bracket Token Linter
 * 
 * Ensures final report outputs contain NO internal markers, placeholders, or source IDs.
 * Replaces [S0-1], [ARTICLE-1], etc. with numeric linked citations [1], [2], [3].
 * 
 * This module provides:
 * 1. Source map building from step0 output
 * 2. Citation normalization + linking (numeric style)
 * 3. Placeholder resolution from requiredInputs
 * 4. Bracket token linting (hard fail)
 * 5. References section generation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SourceEntry {
  id: string;
  title?: string;
  publisher?: string;
  authors?: string;
  author?: string;
  year?: string;
  date?: string;
  url?: string;
  dateAccessed?: string;
  mla_citation?: string;
  apa_citation?: string;
}

export interface CitationIndex {
  sourceById: Map<string, SourceEntry>;
  citationOrder: Map<string, number>; // S0-1 → 1 (first appearance order)
  usedSourceIds: Set<string>;
}

export interface NormalizationResult {
  normalizedHtml: string;
  citationIndex: CitationIndex;
  unknowns: UnknownEntry[];
  referencesHtml: string;
  stats: NormalizationStats;
}

export interface NormalizationStats {
  totalMarkersFound: number;
  markersResolved: number;
  markersRemoved: number;
  placeholdersResolved: number;
  placeholdersRemoved: number;
}

export interface UnknownEntry {
  type: 'citation_unresolved' | 'applicant_input_missing';
  original_token: string;
  location_hint: string;
  sentence_context?: string;
  what_is_missing: string;
  what_would_validate: string;
}

export interface LintResult {
  passed: boolean;
  violations: string[];
  violationCount: number;
}

export interface LintViolation {
  pattern: string;
  match: string;
  sentence: string;
  offset: number;
}

// ============================================================================
// ALIAS RECOVERY TABLE
// Maps common AI-generated marker names to canonical source IDs
// ============================================================================

const ALIAS_MAP: Record<string, string> = {
  'article': 'ARTICLE-1',
  'source1': 'S0-1',
  'source 1': 'S0-1',
  'source2': 'S0-2',
  'source 2': 'S0-2',
  'source3': 'S0-3',
  'source 3': 'S0-3',
  'ref1': 'S0-1',
  'ref2': 'S0-2',
  'reference1': 'S0-1',
  'reference2': 'S0-2',
};

// ============================================================================
// INTERNAL MARKER PATTERNS
// Patterns that indicate internal source markers needing replacement
// ============================================================================

// Matches: [S0-1], [S12-3], [ARTICLE-1], [SEARCH-2], [SOURCE-12]
const INTERNAL_SOURCE_ID_PATTERN = /\[([A-Z][A-Z0-9]*-[A-Z0-9]+)\]/gi;

// Matches: <sup>[S0-1]</sup> (superscript-wrapped)
const SUPERSCRIPT_SOURCE_PATTERN = /<sup>\s*\[([A-Z][A-Z0-9]*-[A-Z0-9]+)\]\s*<\/sup>/gi;

// Matches any bracketed token that looks like a source marker
const GENERIC_SOURCE_PATTERN = /\[([A-Za-z]+[\d]*-?[\w]*(?:\s*,\s*[A-Za-z]+[\d]*-?[\w]*)*)\]/g;

// ============================================================================
// FORBIDDEN PATTERNS (for linting)
// These must NEVER appear in final output
// ============================================================================

const FORBIDDEN_PATTERNS: { pattern: RegExp; name: string }[] = [
  // Internal source ID formats
  { pattern: /\[S\d+-[A-Z0-9]+\]/gi, name: 'Internal source ID [S0-1]' },
  { pattern: /\[ARTICLE-\d+\]/gi, name: 'Article marker [ARTICLE-1]' },
  { pattern: /\[SEARCH-\d+\]/gi, name: 'Search marker [SEARCH-1]' },
  { pattern: /\[SOURCE-\d+\]/gi, name: 'Source marker [SOURCE-1]' },
  { pattern: /<sup>\s*\[[A-Z][A-Z0-9]*-[A-Z0-9]+\]\s*<\/sup>/gi, name: 'Superscript internal ID' },
  
  // Step reference patterns (new)
  { pattern: /\[step\d+\]/gi, name: '[stepN] reference' },
  { pattern: /\[Source\d*\]/gi, name: '[Source1] marker' },
  
  // Generic single-word markers
  { pattern: /\[article\]/gi, name: '[article]' },
  { pattern: /\[ref\]/gi, name: '[ref]' },
  { pattern: /\[reference\d*\]/gi, name: '[reference]' },
  
  // Placeholder patterns
  { pattern: /\{TBD\}/gi, name: '{TBD}' },
  { pattern: /\[TBD\]/gi, name: '[TBD]' },
  { pattern: /\[\{TBD\}\]/gi, name: '[{TBD}]' },
  { pattern: /\[Insert[^\]]*\]/gi, name: '[Insert...]' },
  { pattern: /\[PROJECT\s*NAME\]/gi, name: '[PROJECT NAME]' },
  { pattern: /\[COMPANY\]/gi, name: '[COMPANY]' },
  { pattern: /\[Your\s+[^\]]*\]/gi, name: '[Your...]' },
  { pattern: /Source\s+[12]\b/gi, name: 'Source 1/2' },
  { pattern: /Hypothetical\s+\w+/gi, name: 'Hypothetical [Entity]' },
  { pattern: /\{value\}/gi, name: '{value}' },
  { pattern: /\{\s*\}/g, name: '{}' },
  
  // Budget placeholders: $[Amount], $[...]
  { pattern: /\$\[[^\]]+\]/g, name: 'Budget placeholder $[...]' },
  
  // Curly brace placeholders (exclude valid style/class attributes)
  { pattern: /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, name: 'Curly placeholder {name}' },
  
  // "undefined" adjacent to brackets or source markers
  { pattern: /undefined\s*\[/gi, name: 'undefined before bracket' },
  { pattern: /\]\s*undefined/gi, name: 'undefined after bracket' },
  { pattern: /\bundefined\b(?=\s*(?:S\d|Source|ref|ARTICLE))/gi, name: 'undefined near source ref' },
];

// ============================================================================
// SOURCE MAP BUILDER
// ============================================================================

/**
 * Build a lookup map from step0 sources array
 */
export function buildSourceMap(sources: SourceEntry[]): Map<string, SourceEntry> {
  const map = new Map<string, SourceEntry>();
  
  if (!sources || !Array.isArray(sources)) {
    return map;
  }
  
  for (const source of sources) {
    if (source.id) {
      // Normalize ID to uppercase for consistent lookup
      const normalizedId = source.id.toUpperCase();
      map.set(normalizedId, source);
      
      // Also add without the prefix for fuzzy matching
      // e.g., "S0-1" → also store as "1" if step is 0
      const match = source.id.match(/^[A-Z]+(\d+)-(\d+)$/i);
      if (match) {
        const altKey = `${match[1]}-${match[2]}`;
        if (!map.has(altKey.toUpperCase())) {
          map.set(altKey.toUpperCase(), source);
        }
      }
    }
  }
  
  return map;
}

/**
 * Try to resolve a marker ID to a canonical source ID
 */
function resolveMarkerId(
  markerId: string, 
  sourceMap: Map<string, SourceEntry>
): string | null {
  const normalized = markerId.toUpperCase().trim();
  
  // Direct match
  if (sourceMap.has(normalized)) {
    return normalized;
  }
  
  // Try alias recovery
  const aliasKey = markerId.toLowerCase().trim();
  if (ALIAS_MAP[aliasKey]) {
    const aliasId = ALIAS_MAP[aliasKey].toUpperCase();
    if (sourceMap.has(aliasId)) {
      return aliasId;
    }
  }
  
  // Try pattern variations
  // [article] → ARTICLE-1
  if (!/\d/.test(normalized)) {
    const withNumber = `${normalized}-1`;
    if (sourceMap.has(withNumber)) {
      return withNumber;
    }
  }
  
  return null;
}

/**
 * Extract a location hint from surrounding context
 */
function extractLocationHint(html: string, matchIndex: number): string {
  const contextStart = Math.max(0, matchIndex - 50);
  const contextEnd = Math.min(html.length, matchIndex + 50);
  let context = html.substring(contextStart, contextEnd);
  
  // Try to find section heading
  const headingMatch = context.match(/<h[23][^>]*>([^<]+)<\/h[23]>/i);
  if (headingMatch) {
    return `Near section: ${headingMatch[1]}`;
  }
  
  // Clean up and truncate
  context = context.replace(/<[^>]+>/g, ' ').trim();
  if (context.length > 60) {
    context = context.substring(0, 60) + '...';
  }
  
  return `In text: "${context}"`;
}

/**
 * Extract the sentence surrounding a match for error context
 */
function extractSentenceContext(html: string, matchIndex: number, matchLength: number): string {
  // Clean HTML for sentence extraction
  const cleanText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  
  // Estimate position in clean text (approximate)
  const beforeMatch = html.substring(0, matchIndex).replace(/<[^>]+>/g, ' ').length;
  
  // Find sentence boundaries
  const sentenceEnd = cleanText.indexOf('.', beforeMatch + matchLength);
  const sentenceEndPos = sentenceEnd === -1 ? Math.min(beforeMatch + matchLength + 80, cleanText.length) : Math.min(sentenceEnd + 1, cleanText.length);
  
  // Look back for sentence start
  let sentenceStart = beforeMatch;
  for (let i = beforeMatch - 1; i >= 0 && i >= beforeMatch - 150; i--) {
    if (cleanText[i] === '.' || cleanText[i] === '!' || cleanText[i] === '?') {
      sentenceStart = i + 1;
      break;
    }
    if (i === Math.max(0, beforeMatch - 150)) {
      sentenceStart = i;
    }
  }
  
  let sentence = cleanText.substring(sentenceStart, sentenceEndPos).trim();
  if (sentence.length > 200) {
    sentence = sentence.substring(0, 200) + '...';
  }
  
  return sentence;
}

// ============================================================================
// APA CITATION CONVERSION
// ============================================================================

/**
 * Format a source entry as an APA in-text citation: (Author, Year)
 */
function formatApaInTextCitation(source: SourceEntry): string {
  const author = source.authors || source.author || source.publisher || 'Unknown';
  const year = source.year || (source.date ? source.date.match(/\b(19|20)\d{2}\b/)?.[0] : null) || 'n.d.';
  
  // Clean author name for in-text citation (use first author/org name)
  let cleanAuthor = author;
  if (author.includes(',')) {
    // Multiple authors or "Last, First" format
    const parts = author.split(',');
    cleanAuthor = parts[0].trim();
    if (parts.length > 2) {
      cleanAuthor += ' et al.';
    }
  }
  
  return `(${cleanAuthor}, ${year})`;
}

/**
 * Convert internal source markers to APA in-text citations
 * 
 * Returns normalized HTML with APA citations and list of unknowns for missing sources
 */
export function convertToApaInText(
  html: string,
  sourceMap: Map<string, SourceEntry>
): { html: string; unknowns: UnknownEntry[]; citationOrder: Map<string, number> } {
  const unknowns: UnknownEntry[] = [];
  const citationOrder = new Map<string, number>();
  let nextNum = 1;
  let result = html;
  
  // Internal marker pattern
  const markerPattern = /\[([A-Z][A-Z0-9]*-[A-Z0-9]+)\]/gi;
  
  // First pass: collect all used sources and assign numbers
  let match: RegExpExecArray | null;
  const markerMatches: { fullMatch: string; markerId: string; index: number }[] = [];
  
  while ((match = markerPattern.exec(html)) !== null) {
    markerMatches.push({
      fullMatch: match[0],
      markerId: match[1].toUpperCase(),
      index: match.index
    });
    
    const normalizedId = match[1].toUpperCase();
    if (sourceMap.has(normalizedId) && !citationOrder.has(normalizedId)) {
      citationOrder.set(normalizedId, nextNum++);
    }
  }
  
  // Second pass: replace markers with APA citations (in reverse order to preserve indices)
  for (const { fullMatch, markerId, index } of markerMatches.reverse()) {
    const source = sourceMap.get(markerId);
    
    if (source) {
      const num = citationOrder.get(markerId)!;
      const apaCitation = formatApaInTextCitation(source);
      const linkedCitation = `<a href="#ref-${num}" class="citation-link">${apaCitation}</a>`;
      result = result.substring(0, index) + linkedCitation + result.substring(index + fullMatch.length);
    } else {
      // Source not found - replace with Unknown phrase and log
      const sentenceContext = extractSentenceContext(html, index, fullMatch.length);
      unknowns.push({
        type: 'citation_unresolved',
        original_token: fullMatch,
        location_hint: extractLocationHint(html, index),
        sentence_context: sentenceContext,
        what_is_missing: `Source ${markerId} not found in source pack`,
        what_would_validate: `Add source with id="${markerId}" to sources array`
      });
      result = result.substring(0, index) + 'Unknown (no validated source found)' + result.substring(index + fullMatch.length);
    }
  }
  
  return { html: result, unknowns, citationOrder };
}

// ============================================================================
// PLACEHOLDER RESOLVER
// ============================================================================

/**
 * Resolve bracketed placeholders using requiredInputs
 */
export function resolvePlaceholders(
  html: string,
  requiredInputs: Record<string, unknown>
): { html: string; unknowns: UnknownEntry[]; stats: { resolved: number; removed: number } } {
  const unknowns: UnknownEntry[] = [];
  let resolved = 0;
  let removed = 0;
  
  if (!html) {
    return { html: '', unknowns, stats: { resolved, removed } };
  }
  
  // Build label-to-value mapping (case-insensitive, whitespace-normalized)
  const labelMap = new Map<string, string>();
  for (const [key, value] of Object.entries(requiredInputs || {})) {
    if (value !== null && value !== undefined) {
      const normalizedLabel = key.toLowerCase().replace(/[_-]/g, ' ').trim();
      labelMap.set(normalizedLabel, String(value));
      
      // Also map the original key
      labelMap.set(key.toLowerCase(), String(value));
    }
  }
  
  // Match placeholders: [Project Title], [Lead University Name], [Insert X], etc.
  // Must start with letter, can contain letters and spaces
  const placeholderPattern = /\[([A-Za-z][A-Za-z\s]{2,}?)\]/g;
  
  const result = html.replace(placeholderPattern, (fullMatch, label, offset) => {
    const normalizedLabel = label.toLowerCase().trim();
    
    // Check for "Insert" prefix - always remove
    if (normalizedLabel.startsWith('insert')) {
      unknowns.push({
        type: 'applicant_input_missing',
        original_token: fullMatch,
        location_hint: extractLocationHint(html, offset),
        what_is_missing: `Value for "${label}"`,
        what_would_validate: 'Applicant-provided input'
      });
      removed++;
      return '';
    }
    
    // Try to find matching input by normalized label
    const normalizedKey = normalizedLabel.replace(/\s+/g, ' ');
    let matchedValue = labelMap.get(normalizedKey);
    
    // Try variations
    if (!matchedValue) {
      matchedValue = labelMap.get(normalizedLabel.replace(/\s+/g, '_'));
    }
    if (!matchedValue) {
      matchedValue = labelMap.get(normalizedLabel.replace(/\s+/g, ''));
    }
    
    if (matchedValue) {
      resolved++;
      return matchedValue;
    }
    
    // Not found - remove and log
    unknowns.push({
      type: 'applicant_input_missing',
      original_token: fullMatch,
      location_hint: extractLocationHint(html, offset),
      what_is_missing: `Value for "${label}"`,
      what_would_validate: `requiredInputs.${label.toLowerCase().replace(/\s+/g, '_')}`
    });
    removed++;
    return '';
  });
  
  return { html: result, unknowns, stats: { resolved, removed } };
}

// ============================================================================
// CITATION NORMALIZER
// ============================================================================

/**
 * Main citation normalization function
 * Replaces internal markers with numeric linked citations
 */
export function normalizeCitations(
  html: string,
  sourceMap: Map<string, SourceEntry>,
  requiredInputs: Record<string, unknown> = {}
): NormalizationResult {
  const citationOrder = new Map<string, number>();
  const usedSourceIds = new Set<string>();
  const unknowns: UnknownEntry[] = [];
  let nextCitationNum = 1;
  let normalizedHtml = html || '';
  
  const stats: NormalizationStats = {
    totalMarkersFound: 0,
    markersResolved: 0,
    markersRemoved: 0,
    placeholdersResolved: 0,
    placeholdersRemoved: 0,
  };
  
  // STEP 1: Resolve placeholders first
  const placeholderResult = resolvePlaceholders(normalizedHtml, requiredInputs);
  normalizedHtml = placeholderResult.html;
  unknowns.push(...placeholderResult.unknowns);
  stats.placeholdersResolved = placeholderResult.stats.resolved;
  stats.placeholdersRemoved = placeholderResult.stats.removed;
  
  // STEP 2: First pass - find all source markers and build citation order
  const allMarkers: { marker: string; sourceId: string | null; index: number }[] = [];
  
  // Find superscript-wrapped markers first
  let match: RegExpExecArray | null;
  const supPattern = new RegExp(SUPERSCRIPT_SOURCE_PATTERN.source, 'gi');
  while ((match = supPattern.exec(normalizedHtml)) !== null) {
    const markerId = match[1].toUpperCase();
    const sourceId = resolveMarkerId(markerId, sourceMap);
    allMarkers.push({ marker: match[0], sourceId, index: match.index });
    stats.totalMarkersFound++;
  }
  
  // Find regular bracketed markers
  const bracketPattern = new RegExp(GENERIC_SOURCE_PATTERN.source, 'g');
  while ((match = bracketPattern.exec(normalizedHtml)) !== null) {
    const markerContent = match[1];
    
    // Skip if it looks like a placeholder (all letters, spaces)
    if (/^[A-Za-z\s]+$/.test(markerContent) && markerContent.length > 3) {
      continue;
    }
    
    // Handle multiple markers: [S0-1, S0-2]
    const parts = markerContent.split(/\s*,\s*/);
    for (const part of parts) {
      const markerId = part.trim().toUpperCase();
      const sourceId = resolveMarkerId(markerId, sourceMap);
      
      // Only count as marker if it looks like a source ID
      if (/^[A-Z]/.test(markerId) && (sourceId || /\d/.test(markerId))) {
        allMarkers.push({ marker: `[${part.trim()}]`, sourceId, index: match.index });
        stats.totalMarkersFound++;
      }
    }
  }
  
  // Build citation order based on first appearance
  for (const { sourceId } of allMarkers) {
    if (sourceId && sourceMap.has(sourceId) && !citationOrder.has(sourceId)) {
      citationOrder.set(sourceId, nextCitationNum++);
      usedSourceIds.add(sourceId);
    }
  }
  
  // STEP 3: Replace superscript markers with linked citations
  normalizedHtml = normalizedHtml.replace(
    SUPERSCRIPT_SOURCE_PATTERN,
    (fullMatch, markerId, offset) => {
      const sourceId = resolveMarkerId(markerId, sourceMap);
      
      if (sourceId && citationOrder.has(sourceId)) {
        const num = citationOrder.get(sourceId)!;
        stats.markersResolved++;
        return `<a href="#ref-${num}" class="citation-link"><sup>[${num}]</sup></a>`;
      }
      
      // Unresolved - log and remove
      unknowns.push({
        type: 'citation_unresolved',
        original_token: fullMatch,
        location_hint: extractLocationHint(normalizedHtml, offset),
        what_is_missing: 'Source not found in source pack',
        what_would_validate: `Valid source entry with id="${markerId}" in step0.sources[]`
      });
      stats.markersRemoved++;
      return '';
    }
  );
  
  // STEP 4: Replace regular bracketed markers
  // Handle both single and multi-marker cases: [S0-1] and [S0-1, S0-2]
  normalizedHtml = normalizedHtml.replace(
    /\[([A-Za-z][A-Za-z0-9]*-[A-Za-z0-9]+(?:\s*,\s*[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9]+)*)\]/g,
    (fullMatch, markerGroup, offset) => {
      const markers = markerGroup.split(/\s*,\s*/);
      const nums: number[] = [];
      
      for (const marker of markers) {
        const markerId = marker.trim().toUpperCase();
        const sourceId = resolveMarkerId(markerId, sourceMap);
        
        if (sourceId && citationOrder.has(sourceId)) {
          nums.push(citationOrder.get(sourceId)!);
        } else {
          // Unresolved - log
          unknowns.push({
            type: 'citation_unresolved',
            original_token: `[${marker}]`,
            location_hint: extractLocationHint(normalizedHtml, offset),
            what_is_missing: 'Source not found in source pack',
            what_would_validate: `Valid source entry with id="${marker}" in step0.sources[]`
          });
        }
      }
      
      if (nums.length === 0) {
        stats.markersRemoved++;
        return ''; // Remove unresolved markers
      }
      
      // Build linked citation(s)
      stats.markersResolved += nums.length;
      const links = [...new Set(nums)].sort((a, b) => a - b).map(n => 
        `<a href="#ref-${n}" class="citation-link">[${n}]</a>`
      );
      return links.join('');
    }
  );
  
  // STEP 5: Clean up any remaining forbidden patterns
  for (const { pattern } of FORBIDDEN_PATTERNS) {
    normalizedHtml = normalizedHtml.replace(pattern, '');
  }
  
  // Clean up orphan parentheses and double spaces
  normalizedHtml = normalizedHtml.replace(/\(\s*\)/g, '');
  normalizedHtml = normalizedHtml.replace(/\(\s*;\s*\)/g, '');
  normalizedHtml = normalizedHtml.replace(/\s{2,}/g, ' ');
  
  // STEP 6: Build references section
  const referencesHtml = buildReferencesSection(
    { sourceById: sourceMap, citationOrder, usedSourceIds },
    sourceMap
  );
  
  return {
    normalizedHtml,
    citationIndex: { sourceById: sourceMap, citationOrder, usedSourceIds },
    unknowns,
    referencesHtml,
    stats,
  };
}

// ============================================================================
// REFERENCES BUILDER
// ============================================================================

/**
 * Generate APA-style reference author string
 */
function formatReferenceAuthor(source: SourceEntry): string {
  if (source.authors) return source.authors;
  if (source.author) return source.author;
  if (source.publisher) return source.publisher;
  return 'Unknown';
}

/**
 * Extract year from various date formats
 */
function extractYear(source: SourceEntry): string {
  if (source.year) return source.year;
  
  if (source.date) {
    const yearMatch = source.date.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) return yearMatch[0];
  }
  
  if (source.dateAccessed) {
    const yearMatch = source.dateAccessed.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) return yearMatch[0];
  }
  
  return 'n.d.';
}

/**
 * Build the References section HTML
 */
export function buildReferencesSection(
  citationIndex: CitationIndex,
  sourceMap: Map<string, SourceEntry>
): string {
  const entries: { num: number; sourceId: string; entry: SourceEntry }[] = [];
  
  for (const [sourceId, num] of citationIndex.citationOrder) {
    const entry = sourceMap.get(sourceId);
    if (entry) {
      entries.push({ num, sourceId, entry });
    }
  }
  
  if (entries.length === 0) {
    return '';
  }
  
  // Sort by citation number
  entries.sort((a, b) => a.num - b.num);
  
  const listItems = entries.map(({ num, entry }) => {
    const author = formatReferenceAuthor(entry);
    const year = extractYear(entry);
    const title = entry.title || 'Untitled';
    const publisher = entry.publisher || '';
    const url = entry.url || '';
    
    // APA format: Author. (Year). Title. Publisher. URL
    let citation = `${author}. (${year}). <em>${title}</em>.`;
    if (publisher && publisher !== author) {
      citation += ` ${publisher}.`;
    }
    
    const urlHtml = url 
      ? ` <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
      : '';
    
    return `<li id="ref-${num}">${citation}${urlHtml}</li>`;
  });
  
  return `
<section class="references-section">
  <h2>References</h2>
  <ol class="references-list">
    ${listItems.join('\n    ')}
  </ol>
</section>`;
}

// ============================================================================
// BRACKET TOKEN LINTER
// ============================================================================

/**
 * Lint HTML for any remaining forbidden bracket tokens
 * Returns passed=false if any violations found
 */
export function lintBracketTokens(html: string): LintResult {
  if (!html) {
    return { passed: true, violations: [], violationCount: 0 };
  }
  
  const violations: string[] = [];
  
  // Check all forbidden patterns
  for (const { pattern, name } of FORBIDDEN_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      violations.push(`${name}: "${match[0]}"`);
    }
  }
  
  // Check for any remaining brackets that aren't valid linked citations
  const bracketPattern = /\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  
  while ((match = bracketPattern.exec(html)) !== null) {
    const content = match[1];
    const fullMatch = match[0];
    
    // ALLOWED: Numeric citations that are hyperlinked [1], [2], etc.
    if (/^\d+$/.test(content)) {
      // Check if this is inside an <a> tag with href="#ref-N"
      const beforeContext = html.substring(Math.max(0, match.index - 100), match.index);
      if (beforeContext.includes('href="#ref-')) {
        continue; // Valid linked citation
      }
      // Unlinked numeric citation - still a violation
      violations.push(`Unlinked citation: "${fullMatch}"`);
      continue;
    }
    
    // Skip if already counted by a specific pattern
    const alreadyCounted = FORBIDDEN_PATTERNS.some(({ pattern }) => {
      pattern.lastIndex = 0;
      return pattern.test(fullMatch);
    });
    
    if (!alreadyCounted) {
      // Check if it looks like an internal marker
      if (/^[A-Z]/.test(content) && /\d/.test(content)) {
        violations.push(`Bracket token: "${fullMatch}"`);
      }
    }
  }
  
  // Deduplicate violations
  const uniqueViolations = [...new Set(violations)];
  
  return {
    passed: uniqueViolations.length === 0,
    violations: uniqueViolations,
    violationCount: uniqueViolations.length,
  };
}

// ============================================================================
// SANITIZE FINAL REPORT
// ============================================================================

export interface SanitizationResult {
  html: string;
  removedTokens: UnknownEntry[];
  stats: {
    tokensRemoved: number;
    tokensReplaced: number;
  };
}

/**
 * Check if removing a token at this position would break sentence meaning
 * Returns true if the token appears to be critical to the sentence
 */
function wouldBreakMeaning(html: string, offset: number, match: string): boolean {
  // Get surrounding context
  const before = html.substring(Math.max(0, offset - 30), offset).trim();
  const after = html.substring(offset + match.length, offset + match.length + 30).trim();
  
  // If token is preceded by "according to" or "as reported by" type phrases
  if (/(?:according\s+to|as\s+(?:reported|stated|noted)\s+by|per|from)\s*$/i.test(before)) {
    return true;
  }
  
  // If token is the subject of a verb (followed by verb-like patterns)
  if (/^(?:\s*(?:shows?|reports?|states?|indicates?|found|concluded))/i.test(after)) {
    return true;
  }
  
  return false;
}

/**
 * Sanitize final report HTML by removing all forbidden tokens
 * 
 * Options:
 * - preserveContext: Replace tokens with "(citation unavailable)" instead of removing
 * - failOnViolations: Throw error if violations remain after sanitization
 */
export function sanitizeFinalReport(
  html: string,
  options: { 
    preserveContext?: boolean;
    failOnViolations?: boolean;
  } = {}
): SanitizationResult {
  const { preserveContext = false, failOnViolations = false } = options;
  const removedTokens: UnknownEntry[] = [];
  let sanitized = html || '';
  let tokensRemoved = 0;
  let tokensReplaced = 0;

  // Apply all forbidden pattern replacements
  for (const { pattern, name } of FORBIDDEN_PATTERNS) {
    pattern.lastIndex = 0;
    
    sanitized = sanitized.replace(pattern, (match, ...args) => {
      // Extract offset from args (second to last argument in replace callback)
      const offset = typeof args[args.length - 2] === 'number' ? args[args.length - 2] : 0;
      
      removedTokens.push({
        type: 'citation_unresolved',
        original_token: match,
        location_hint: extractLocationHint(html, offset),
        what_is_missing: `Unresolved ${name}`,
        what_would_validate: 'Valid source in source pack or applicant input'
      });

      if (preserveContext && wouldBreakMeaning(html, offset, match)) {
        tokensReplaced++;
        return '(citation unavailable)';
      }
      
      tokensRemoved++;
      return '';
    });
  }
  
  // Clean up any remaining generic bracket tokens that look like internal markers
  // [SomeID123], [RefA1], etc. but NOT linked citations
  const genericBracketPattern = /\[([A-Za-z]+\d+[^\]]*)\]/g;
  sanitized = sanitized.replace(genericBracketPattern, (match, content, offset) => {
    // Skip if this is inside a link
    const before = sanitized.substring(Math.max(0, offset - 50), offset);
    if (before.includes('href="#ref-')) {
      return match;
    }
    
    removedTokens.push({
      type: 'citation_unresolved',
      original_token: match,
      location_hint: extractLocationHint(html, offset),
      what_is_missing: `Generic bracket token`,
      what_would_validate: 'Valid source ID or remove marker'
    });
    
    if (preserveContext && wouldBreakMeaning(html, offset, match)) {
      tokensReplaced++;
      return '(citation unavailable)';
    }
    
    tokensRemoved++;
    return '';
  });

  // Clean up orphan artifacts
  sanitized = sanitized.replace(/\(\s*\)/g, '');
  sanitized = sanitized.replace(/\(\s*;\s*\)/g, '');
  sanitized = sanitized.replace(/\s{2,}/g, ' ');
  sanitized = sanitized.replace(/\s+([.,;:!?])/g, '$1');

  // Hard fail check if requested
  if (failOnViolations) {
    const remaining = lintBracketTokens(sanitized);
    if (!remaining.passed) {
      throw new Error(
        `Internal citation markers leaked into final report: ${remaining.violations.slice(0, 5).join(', ')}`
      );
    }
  }

  return {
    html: sanitized,
    removedTokens,
    stats: { tokensRemoved, tokensReplaced }
  };
}

// ============================================================================
// VALIDATE FINAL REPORT (HARD FAILURE GATE)
// ============================================================================

/**
 * Lint with detailed violation info including sentence context
 */
export function lintBracketTokensDetailed(html: string): { 
  passed: boolean; 
  violations: LintViolation[];
  violationCount: number;
} {
  if (!html) {
    return { passed: true, violations: [], violationCount: 0 };
  }
  
  const violations: LintViolation[] = [];
  
  // Check all forbidden patterns
  for (const { pattern, name } of FORBIDDEN_PATTERNS) {
    pattern.lastIndex = 0;
    
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      violations.push({
        pattern: name,
        match: match[0],
        sentence: extractSentenceContext(html, match.index, match[0].length),
        offset: match.index
      });
    }
  }
  
  // Check for unlinked bracket tokens
  const bracketPattern = /\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  
  while ((match = bracketPattern.exec(html)) !== null) {
    const content = match[1];
    const fullMatch = match[0];
    
    // ALLOWED: Numeric citations that are hyperlinked [1], [2], etc.
    if (/^\d+$/.test(content)) {
      const beforeContext = html.substring(Math.max(0, match.index - 100), match.index);
      if (beforeContext.includes('href="#ref-')) {
        continue; // Valid linked citation
      }
      violations.push({
        pattern: 'Unlinked citation',
        match: fullMatch,
        sentence: extractSentenceContext(html, match.index, fullMatch.length),
        offset: match.index
      });
      continue;
    }
    
    // Skip if already counted by a specific pattern
    const alreadyCounted = violations.some(v => v.match === fullMatch && v.offset === match!.index);
    if (!alreadyCounted && (/^[A-Z]/.test(content) || /\d/.test(content))) {
      violations.push({
        pattern: 'Bracket token',
        match: fullMatch,
        sentence: extractSentenceContext(html, match.index, fullMatch.length),
        offset: match.index
      });
    }
  }
  
  // Deduplicate by match + offset
  const unique = violations.filter((v, i, arr) => 
    arr.findIndex(x => x.match === v.match && x.offset === v.offset) === i
  );
  
  return {
    passed: unique.length === 0,
    violations: unique,
    violationCount: unique.length
  };
}

/**
 * Validate that no forbidden patterns remain in the final report
 * Throws an error if any violations are found, including sentence context
 * 
 * This is a hard failure gate - call this before saving reports
 */
export function validateFinalReport(html: string): void {
  if (!html) return;
  
  const result = lintBracketTokensDetailed(html);
  
  if (!result.passed) {
    const errorDetails = result.violations.slice(0, 5).map(v => 
      `- ${v.match} in: "${v.sentence}"`
    ).join('\n');
    
    throw new Error(
      `Internal citation markers leaked into final report:\n${errorDetails}`
    );
  }
}

// ============================================================================
// FULL NORMALIZATION PIPELINE
// ============================================================================

/**
 * Run the complete normalization pipeline:
 * 1. Build source map
 * 2. Resolve placeholders
 * 3. Normalize citations to numeric linked format
 * 4. Build references section
 * 5. Lint for violations
 * 
 * Returns normalized HTML with references appended, or throws if lint fails
 */
export function normalizeReportHtml(
  html: string,
  sources: SourceEntry[],
  requiredInputs: Record<string, unknown> = {},
  options: { appendReferences?: boolean; failOnLintError?: boolean } = {}
): {
  html: string;
  referencesHtml: string;
  unknowns: UnknownEntry[];
  stats: NormalizationStats;
  lintResult: LintResult;
} {
  const { appendReferences = true, failOnLintError = false } = options;
  
  // Build source map
  const sourceMap = buildSourceMap(sources);
  
  // Run normalization
  const result = normalizeCitations(html, sourceMap, requiredInputs);
  
  // Append references if requested
  let finalHtml = result.normalizedHtml;
  if (appendReferences && result.referencesHtml) {
    // Check if references already exist
    if (!finalHtml.includes('<section class="references-section">') && 
        !finalHtml.includes('<h2>References</h2>')) {
      finalHtml += '\n' + result.referencesHtml;
    }
  }
  
  // Run lint check
  const lintResult = lintBracketTokens(finalHtml);
  
  if (failOnLintError && !lintResult.passed) {
    throw new Error(`Citation lint failed: ${lintResult.violations.slice(0, 5).join(', ')}`);
  }
  
  return {
    html: finalHtml,
    referencesHtml: result.referencesHtml,
    unknowns: result.unknowns,
    stats: result.stats,
    lintResult,
  };
}
