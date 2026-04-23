
## Explanation and prevention plan for the broken “View Live Demo”

### What happened

The demo stopped working because `/demo` is not currently a real, independent demo app.

The 1mg.live routing system treats paths like this:

```text
1mg.live/                → main 1mg.live sales page
1mg.live/{operatorSlug}  → a live operator app
```

So a path such as:

```text
1mg.live/silvertooth
```

loads the operator app whose database slug is `silvertooth`.

The problem is that the demo link was handled like a normal operator path instead of being protected as a permanent demo destination. That created two possible failure modes:

```text
1mg.live/demo
```

could be interpreted as an operator slug called `demo`.

If there is no active operator record for `demo`, users see:

```text
This page / app does not exist
```

Then the temporary fix redirected:

```text
/demo → /silvertooth
```

That made the demo depend on the `silvertooth` operator app. This is fragile because if that operator slug changes, is deleted, becomes inactive, or fails to load, the public demo disappears.

That is why this happened. It was not a payment issue or login issue. It was a routing/demo-app stability issue.

### Why users should never see that again

The public demo should not depend on a customer/operator app that can change.

The correct model is:

```text
/demo = permanent platform demo route
```

not:

```text
/demo = redirect to some existing operator app
```

The demo needs to be treated as a protected system page, like `/purchase`, `/dashboard`, `/help`, and `/admin`, not as a normal operator slug.

### Why “View Live Demo” disappeared when not signed in

It should not have been changed to require sign-in.

The live demo is a sales preview. Visitors should be able to view it before logging in or buying.

From the current landing page code, the `View Live Demo` link is not intentionally auth-gated. It appears in the hero CTA area and final CTA area. However, the current placement is too subtle: it is a small text link under the buy button and wallet explanation, so on mobile or certain viewport sizes it can feel missing, especially when the signed-out state shows only a prominent Sign In button in the nav.

The fix should make the demo CTA clearly visible to signed-out users as a proper secondary button, not a small buried text link.

## Fix plan

### 1. Make `/demo` a permanent public route

File:

```text
src/pages/platform/PlatformApp.tsx
```

Replace the fragile redirect:

```tsx
<Route path="/demo" element={<Navigate to="/silvertooth" replace />} />
```

with a dedicated demo route component.

Target behavior:

```text
/demo → always loads the official demo app
```

No login required.

### 2. Stop relying on `silvertooth` as the demo

Create a single source of truth for the official demo slug.

Example:

```tsx
const OFFICIAL_DEMO_OPERATOR_SLUG = "demo";
```

Then `/demo` should render:

```tsx
<OperatorApp subdomain={OFFICIAL_DEMO_OPERATOR_SLUG} isDemo />
```

or a small `DemoOperatorRoute` wrapper.

This avoids using a real customer/operator app as the demo.

### 3. Ensure the `demo` operator record exists and is protected

Use the backend database to ensure there is a stable official demo operator:

```text
subdomain: demo
brand_name: 1MG Live Demo
status: active
```

This record should be treated as platform-owned demo content, not a customer app.

If there is already a demo-like record, update it instead of creating duplicates.

### 4. Add a safe fallback if the demo record is missing

If `/demo` fails to load the official demo operator, users should not see “This app does not exist.”

Instead, show a branded recovery screen:

```text
Live demo is temporarily unavailable.
Return to 1MG.live
Contact support
```

This makes the failure clear and prevents users from thinking the platform is broken or their app disappeared.

### 5. Make “View Live Demo” clearly visible when signed out

File:

```text
src/pages/platform/LandingPage.tsx
```

Change the small text link into a visible secondary CTA next to the buy button.

Signed-out users should see:

```text
[BUY NOW — $2,400 USDC]  [View Live Demo]
```

On mobile:

```text
[BUY NOW — $2,400 USDC]
[View Live Demo]
```

The demo button should:

- Use a blue/transparent platform style
- Not require login
- Link to `/demo`
- Be visible whether signed in or signed out

### 6. Keep buy/login behavior unchanged

Only the purchase flow should require login:

```text
Buy Now → login if needed → purchase page
View Live Demo → no login → public demo
```

This restores the original sales behavior: visitors can preview the app before creating an account.

### 7. Add a routing audit so this does not regress

Audit these paths:

```text
/
 /demo
 /buy-predictions-app
 /purchase
 /dashboard
 /onboarding
 /help
 /admin
 /demo on signed-out session
 /demo on signed-in session
```

Verify:

```text
/demo never falls into the generic operator slug fallback
/demo never requires login
/demo never redirects to a mutable customer slug
View Live Demo is visible when signed out
View Live Demo is visible on mobile
View Live Demo opens the demo app
```

### 8. Add code-level guardrails

Update comments in the routing file so future edits do not accidentally break this again:

```text
/demo is a reserved public platform route.
Do not redirect it to a customer/operator slug.
Do not auth-gate it.
```

Also ensure `demo` remains listed as a reserved platform route in the domain routing utility so it cannot collide with normal operator slugs.

## Expected result

After the fix:

```text
1mg.live main page → View Live Demo visible while signed out
Click View Live Demo → opens public demo immediately
No login required
No “page does not exist”
No dependency on silvertooth or any customer operator app
```

This will make the demo route stable and prevent user apps or demo previews from “disappearing” because of slug changes, missing records, or auth changes.