

# Add "My Profile" Button to Desktop Navbar

## What changes

When a user is signed in, a small profile/avatar button will appear in the desktop navbar (next to the existing sound, notification, and AI helper icons). Clicking it navigates to `/player/{walletAddress}`. This mirrors the "My Profile" link already available in the mobile menu.

## Technical details

### File: `src/components/Navbar.tsx`

1. Import `User` icon from `lucide-react` (add to existing import).
2. In the desktop navigation section (around line 159, after the AI Helper button and before `<PrivyLoginButton />`), add a conditional block:
   - Only render when `isPrivyUser && walletAddress` is truthy.
   - Render a `<Link to={/player/${walletAddress}}>` styled as an icon button matching the existing sound/notification toggle style.
   - Use the `User` icon (size 20) with the same gold glow styling.
   - Include a tooltip or title attribute: "My Profile".
3. Also add a "Sign Out" icon button (using `LogOut` icon, already imported) next to the profile button for desktop parity with mobile, OR keep it minimal with just the profile link.

### Minimal diff (lines ~159-169 area)

After the Sparkles/AI helper button and before `<PrivyLoginButton />`, insert:

```tsx
{isPrivyUser && walletAddress && (
  <Link
    to={`/player/${walletAddress}`}
    onClick={handleNavClick}
    className="p-2 rounded-lg text-primary hover:text-primary/80 hover:bg-secondary transition-all duration-200 drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.3)]"
    aria-label="My Profile"
    title="My Profile"
  >
    <User size={20} />
  </Link>
)}
```

No new files, no database changes, no edge function changes. Single file edit.

