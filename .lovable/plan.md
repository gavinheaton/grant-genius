

# Implement Payment Gate for Application Flow

## Problem Identified

You're right - the payment flow is not connected to the application flow. Currently:

| Step | Current Behavior | Expected Behavior |
|------|------------------|-------------------|
| Login | Works via magic link | Same |
| Create Application | Allowed without payment | **Should check entitlement** |
| Work on Application | Allowed without payment | Can work on draft |
| Generate Report | Not implemented | **Requires payment** |
| Finalize/Download | Not implemented | **Requires paid entitlement** |

The `useEntitlements` hook exists and works, but it's not used anywhere in the application flow.

---

## Recommended Flow (Per Your PRD)

Based on your PRD's "Payment Gating" requirement, I recommend this flow:

```text
User Flow:
┌─────────────────────────────────────────────────────────────────┐
│  1. Create Application (FREE)                                   │
│     - Select grant                                              │
│     - Fill in inputs (summary, URL)                             │
│     - Draft saved automatically                                 │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. Generate Report (PAID)                                      │
│     - Check entitlement                                         │
│     - If no entitlement → Show purchase modal                   │
│     - After payment → Consume 1 entitlement → Generate report   │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. Download Report (ENTITLED)                                  │
│     - Already paid → Download PDF/DOCX                          │
└─────────────────────────────────────────────────────────────────┘
```

This matches your PRD: *"Users can fill inputs for free, but generating the final report requires payment."*

---

## Implementation Plan

### 1. Add Entitlement Check to ApplicationWorkspace

**File: `src/pages/ApplicationWorkspace.tsx`**

Add the `useEntitlements` hook and show entitlement status in the header:
- Display "X reports remaining" badge
- Show "Purchase Report" CTA if no entitlements

### 2. Create Purchase Modal Component

**New File: `src/components/PurchaseModal.tsx`**

A modal that:
- Shows when user clicks "Generate Report" without entitlement
- Displays pricing ($99 AUD)
- Mentions coupon code support (Stripe handles this automatically in Checkout)
- Has "Purchase Now" button that triggers `usePurchase().purchaseReport()`

### 3. Gate the "Sections" Tab Generation

**File: `src/pages/ApplicationWorkspace.tsx`**

When user clicks "Generate" button in Sections tab:
- Check `hasAvailableReport` from `useEntitlements`
- If false → Open PurchaseModal
- If true → Proceed with generation (consume entitlement)

### 4. Update Dashboard with Entitlement Status

**File: `src/pages/Dashboard.tsx`**

Show user's entitlement status:
- "You have X report credits" or "No credits - Purchase to generate reports"
- Quick "Buy Report" button

### 5. Handle Payment Success Redirect

**File: `src/pages/Dashboard.tsx`**

The checkout already redirects to `/dashboard?payment=success`. Add handling to:
- Show success toast
- Refresh entitlements
- Prompt user to continue with their application

---

## Technical Changes Summary

| File | Changes |
|------|---------|
| `src/pages/Dashboard.tsx` | Add entitlement display, handle `?payment=success` |
| `src/pages/ApplicationWorkspace.tsx` | Add entitlement check, integrate purchase modal |
| `src/components/PurchaseModal.tsx` | **New file** - Purchase CTA with Stripe checkout |
| `src/hooks/useEntitlements.ts` | No changes needed - already works |
| `src/hooks/usePurchase.ts` | No changes needed - already works |

---

## Coupon Codes

You mentioned setting up coupon codes in Stripe - good news! Stripe Checkout automatically handles coupon codes. Users will see a "Add promotion code" field on the checkout page if you've enabled it in your Stripe Dashboard under Checkout settings.

No code changes needed for coupon support.

---

## Database: Entitlement Consumption

When a report is generated, we need to mark the entitlement as "used". This requires:

1. **Increment `used_quantity`** on the entitlement
2. **Create `entitlement_consumptions` record** linking entitlement → report

This will be handled when implementing the actual report generation flow.

---

## Summary

The Stripe integration is working - the issue is that the **entitlement check is not wired into the UI**. This plan adds:

1. Entitlement status display in Dashboard and Workspace
2. Purchase modal that triggers Stripe Checkout
3. Gate on "Generate Report" action
4. Payment success handling

After implementation, users will be able to:
- Create drafts for free
- See their report credits
- Purchase via Stripe (with coupon support)
- Generate reports only with valid entitlements

