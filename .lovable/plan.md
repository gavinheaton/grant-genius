

# Collapsible Research Details During Report Generation

## Overview

When report generation starts, the "Research Details" card will automatically collapse to a compact summary, keeping the generation progress and reports list prominently visible. Users can expand it anytime to review their inputs.

---

## Behavior

| State | Research Details Card |
|-------|----------------------|
| **Before generation** | Fully expanded (editable form) |
| **During generation** | Auto-collapsed to summary strip |
| **After generation** | Stays collapsed, expandable on click |

---

## Visual Design

**Collapsed State (during/after generation):**
```text
+--------------------------------------------------+
| Research Details                    [v] Expand   |
| Article: https://doi.org/10.1234... | 87 words   |
+--------------------------------------------------+
```

**Expanded State:**
- Full form with URL input, summary textarea, TRL, IP Status
- Collapse button in header

---

## Implementation

### 1. Update ReportInputs Component

Wrap the card content in a `Collapsible` component with:
- `isCollapsed` prop to control open/closed state
- `onToggle` callback for user interaction
- Collapsed view showing a compact summary (truncated URL + word count)
- Smooth animation using existing `animate-accordion-down/up`

**Changes to `src/components/workspace/ReportInputs.tsx`:**
```typescript
// Add new props
interface ReportInputsProps {
  inputs: ApplicationInputs;
  onInputChange: (field: keyof ApplicationInputs, value: string) => void;
  disabled?: boolean;
  isCollapsed?: boolean;      // NEW
  onToggleCollapse?: () => void;  // NEW
}

// Wrap CardContent in Collapsible
<Collapsible open={!isCollapsed} onOpenChange={() => onToggleCollapse?.()}>
  <CardHeader>
    <div className="flex items-center justify-between">
      <CardTitle>Research Details</CardTitle>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm">
          {isCollapsed ? <ChevronDown /> : <ChevronUp />}
        </Button>
      </CollapsibleTrigger>
    </div>
    {/* Collapsed summary shown when collapsed */}
    {isCollapsed && (
      <div className="text-sm text-muted-foreground truncate">
        {inputs.publicArticleUrl || "No URL"} • {wordCount} words
      </div>
    )}
  </CardHeader>
  <CollapsibleContent>
    <CardContent>
      {/* existing form fields */}
    </CardContent>
  </CollapsibleContent>
</Collapsible>
```

### 2. Update ApplicationWorkspace

Add state to track collapsed status and auto-collapse when generation starts:

**Changes to `src/pages/ApplicationWorkspace.tsx`:**
```typescript
// Add state
const [inputsCollapsed, setInputsCollapsed] = useState(false);

// Auto-collapse when generation starts
useEffect(() => {
  if (isGenerating) {
    setInputsCollapsed(true);
  }
}, [isGenerating]);

// Pass props to ReportInputs
<ReportInputs 
  inputs={inputs} 
  onInputChange={handleInputChange}
  disabled={isGenerating}
  isCollapsed={inputsCollapsed}
  onToggleCollapse={() => setInputsCollapsed(!inputsCollapsed)}
/>
```

### 3. Auto-scroll to Progress Card

When generation starts, smoothly scroll the progress card into view:

```typescript
// Add ref
const progressRef = useRef<HTMLDivElement>(null);

// Scroll when generation starts
useEffect(() => {
  if (isGenerating && progressRef.current) {
    progressRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}, [isGenerating]);

// Add ref to progress section
<div ref={progressRef}>
  {isGenerating && activeRun && (
    <GenerationProgress ... />
  )}
</div>
```

---

## Files to Modify

1. `src/components/workspace/ReportInputs.tsx` - Add collapsible wrapper and summary view
2. `src/pages/ApplicationWorkspace.tsx` - Add collapse state, auto-collapse logic, and scroll behavior

---

## User Experience

1. User fills in Research Details and clicks "Generate Report"
2. The Research Details card smoothly collapses to a single-line summary
3. The page scrolls down to show the progress indicator prominently
4. User watches the 10-step progress in real-time
5. User can click "Expand" anytime to review their inputs
6. When complete, the Reports List appears below the progress

