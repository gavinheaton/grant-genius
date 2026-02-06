

# Super Admin AI Assistant

## Overview

Build an AI-powered Admin Assistant accessible only to Super Admins that can:
1. **Execute SQL queries** against the database (read-only or with write capabilities)
2. **Analyze and troubleshoot** failed report runs
3. **Provide system diagnostics** and recommend actions
4. **Explain deployment status** and guide on republishing

This won't embed the Lovable editor itself (not technically possible), but creates a purpose-built AI assistant that handles the specific admin tasks you'd typically ask Lovable to do.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Admin AI Assistant Page                       │
│  /admin/assistant (Super Admin only)                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Chat Interface                                              ││
│  │  ┌─────────────────────────────────────────────────────────┐││
│  │  │ [AI] How can I help you manage Grant Genius today?     │││
│  │  ├─────────────────────────────────────────────────────────┤││
│  │  │ [User] Show me all failed runs from today              │││
│  │  ├─────────────────────────────────────────────────────────┤││
│  │  │ [AI] I found 3 failed runs today:                      │││
│  │  │      • Run abc123 - Step 5 timeout (user@email.com)    │││
│  │  │      • Run def456 - AI rate limited (other@email.com)  │││
│  │  │      ...                                                │││
│  │  │      Would you like me to analyze the errors?          │││
│  │  └─────────────────────────────────────────────────────────┘││
│  │  ┌─────────────────────────────────────────────────────────┐││
│  │  │  [Input: Type your question or command...]      [Send] │││
│  │  └─────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Quick Actions Panel:                                            │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │ Query DB     │ │ Analyze Runs │ │ System Status│             │
│  └──────────────┘ └──────────────┘ └──────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Capabilities

### 1. SQL Query Execution
The assistant can run SQL queries against the database:

**User**: "Show me all users who signed up this week"
**AI**: Executes query, formats and displays results as a table

**User**: "How many reports completed successfully yesterday?"
**AI**: Runs aggregation query, returns count with context

### 2. Report Run Diagnostics
**User**: "Why did run abc123 fail?"
**AI**: Fetches run details, step outputs, error messages, and provides analysis

**User**: "Resume the stalled runs"
**AI**: Lists stalled runs and offers to invoke resume-report-run function

### 3. System Health Analysis
**User**: "Are there any edge functions not deployed?"
**AI**: Calls system-health endpoint, analyzes response, lists issues

**User**: "What's the success rate this week?"
**AI**: Queries report_runs, calculates metrics, provides insights

### 4. Guided Actions
**User**: "Deploy the missing functions"
**AI**: Explains that functions deploy on Publish, provides clear instructions

## Technical Implementation

### New Files to Create

| File | Purpose |
|------|---------|
| `src/pages/admin/AdminAssistant.tsx` | Main page with chat UI |
| `src/components/admin/AdminChatInterface.tsx` | Chat message display and input |
| `src/components/admin/AdminChatMessage.tsx` | Individual message component (supports markdown, tables) |
| `src/hooks/useAdminAssistant.ts` | Hook for AI interactions and streaming |
| `supabase/functions/admin-assistant/index.ts` | Edge function with tool-calling AI |

### Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add route for `/admin/assistant` |
| `src/components/admin/AdminSidebar.tsx` | Add "AI Assistant" nav item (Super Admin only) |
| `supabase/config.toml` | Register new edge function |

### Edge Function Design

The `admin-assistant` edge function will use Lovable AI with **tool calling** for structured operations:

**Available Tools for the AI:**
1. `execute_sql` - Run read-only SQL queries
2. `get_run_details` - Fetch detailed info about a report run
3. `list_stalled_runs` - Get currently stalled runs
4. `invoke_function` - Call other edge functions (resume, cancel, etc.)
5. `check_system_health` - Get function deployment status

**Security:**
- Super Admin role verification required
- SQL queries are read-only by default (SELECT only)
- Dangerous operations require confirmation
- All actions logged to audit_logs table

### UI Components

**Chat Interface Features:**
- Streaming responses (token-by-token rendering)
- Markdown rendering for AI responses
- Code blocks with syntax highlighting for SQL
- Data tables for query results
- Quick action buttons for common tasks
- Message history within session

## Files and Changes

### 1. New Edge Function
**File**: `supabase/functions/admin-assistant/index.ts`

- Verify super_admin role
- System prompt with Grant Genius context
- Tool definitions for SQL, run analysis, function invocation
- Streaming response back to client
- Audit logging for all actions

### 2. Admin Assistant Page
**File**: `src/pages/admin/AdminAssistant.tsx`

- Full-height chat interface
- Message history state
- Quick action buttons
- Loading/streaming states

### 3. Chat Components
**File**: `src/components/admin/AdminChatInterface.tsx`

- ScrollArea for messages
- Input with send button
- Streaming text display

**File**: `src/components/admin/AdminChatMessage.tsx`

- ReactMarkdown for AI responses
- Table rendering for query results
- Code block formatting

### 4. Hook for AI Interactions
**File**: `src/hooks/useAdminAssistant.ts`

- SSE streaming implementation
- Message state management
- Tool result handling

### 5. Routing and Navigation
**File**: `src/App.tsx`
- Add route: `/admin/assistant`

**File**: `src/components/admin/AdminSidebar.tsx`
- Add "AI Assistant" item to System section (Super Admin only)

## Sample Interactions

### Query Example
```
User: Show me the top 5 users by report count

AI: I'll query the database for that information.

[Executing SQL...]

| Email              | Reports | Success Rate |
|--------------------|---------|--------------|
| alice@example.com  | 15      | 93%          |
| bob@example.com    | 12      | 83%          |
| carol@example.com  | 8       | 100%         |
| dave@example.com   | 6       | 67%          |
| eve@example.com    | 5       | 80%          |

Alice is your most active user with 15 reports and a 93% success rate!
```

### Diagnostics Example
```
User: Why is run xyz failing?

AI: Let me analyze run xyz...

**Run Details:**
- Application: "Renewable Energy Commercialization"
- User: researcher@university.edu
- Status: Failed at Step 7 (market_analysis)

**Error:**
> Rate limit exceeded. Please try again later.

**Analysis:**
This run failed due to AI rate limiting, likely from too many concurrent 
requests. The user's previous step (competitor_research) completed 
successfully, so all data up to step 6 is preserved.

**Recommended Actions:**
1. Wait 5 minutes, then resume the run
2. Or I can invoke the resume function now - shall I proceed?
```

### Deployment Guidance
```
User: The cancel-report-run function isn't working

AI: Let me check the deployment status...

[Checking system health...]

**Status:** The `cancel-report-run` function is deployed and responding.

However, I see the function was recently updated (CORS headers changed).
If you made code changes in Lovable but haven't published yet, the 
deployed version won't have those changes.

**To deploy the latest version:**
1. Click the **Publish** button in the top-right corner of Lovable
2. Wait ~30-60 seconds for deployment
3. Test the function again

Would you like me to check the function's response headers?
```

## Security Considerations

1. **Super Admin Only**: The assistant is only accessible to super_admin role users
2. **Read-Only SQL Default**: SQL queries are SELECT-only unless explicitly enabled
3. **Audit Trail**: All AI interactions and tool executions are logged
4. **Rate Limiting**: Prevent abuse with request limits
5. **No Secret Exposure**: Never expose API keys or sensitive config values

## Dependencies

- Uses existing Lovable AI gateway (already configured)
- Uses existing authentication (useAdminAuth hook)
- Uses existing UI components (Card, Button, ScrollArea, etc.)
- react-markdown for message rendering (already available)

