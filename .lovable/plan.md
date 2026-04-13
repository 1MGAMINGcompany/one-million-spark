

## Operator Agreement Patch — Implementation Plan

### Summary
Add a mandatory Operator Agreement step as the final onboarding step. Three files changed, one migration added. No other systems touched.

---

### 1. Database Migration
Add two nullable columns to `public.operators`:
```sql
ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS agreement_version text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS agreement_accepted_at timestamptz DEFAULT NULL;
```

### 2. Frontend — `src/pages/platform/OperatorOnboarding.tsx`
- Add state: `const [agreedToTerms, setAgreedToTerms] = useState(false);`
- Add a 7th step (index 6) to the `steps` array with title "Operator Agreement"
- Step content: scrollable container (`max-h-64 overflow-y-auto`) with static agreement text covering all required sections, plus a checkbox using the existing `Checkbox` component
- Checkbox label: "I have read and agree to the Operator Agreement"
- `isStepValid()`: for step 6, return `agreedToTerms`
- `handleCreate`: add `agreement_version: "1.0"` to the JSON body
- Import `Checkbox` from `@/components/ui/checkbox`

The agreement text will be structured with clear section headings (Platform Access, Operator Responsibilities, Revenue Disclaimer, Suspension/Termination, Liability, Fees/Payouts, Prohibited Conduct). Easily replaceable with final legal copy later.

### 3. Backend — `supabase/functions/operator-manage/index.ts`
In the `create_operator` action (line 225–258):
- After existing validation, add: if `body.agreement_version` is missing or not a non-empty string, return 400 error
- On insert (line 247–251): add `agreement_version: body.agreement_version, agreement_accepted_at: new Date().toISOString()` to the insert object
- On update path (line 234–237): add the same two fields to the update object

### Files Changed
| File | Change |
|------|--------|
| `supabase/migrations/[new].sql` | Add 2 columns to operators |
| `src/pages/platform/OperatorOnboarding.tsx` | Add agreement step + checkbox + send version |
| `supabase/functions/operator-manage/index.ts` | Validate + store agreement fields |

### Guarantees
- Launch button stays disabled until checkbox is checked
- Server rejects `create_operator` without `agreement_version`
- No changes to wallet, purchase, admin, sweep, event, or any other flow
- Agreement text is static/replaceable — no external fetch needed

