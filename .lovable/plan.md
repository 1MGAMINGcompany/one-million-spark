

# Update Login Methods: Remove Apple, Add Twitter/X

## What Changes

One file needs updating:

**`src/components/PrivyProviderWrapper.tsx`** (line 24)

Change the `loginMethods` array from:
```
["email", "google", "apple"]
```
to:
```
["email", "google", "twitter"]
```

This removes the Apple sign-in option from the Privy login modal and adds Twitter/X as a sign-in method. Privy uses `"twitter"` as the identifier for X/Twitter login.

No other files need changes -- Privy's login modal automatically shows/hides buttons based on this array.

## Requirements

Make sure Twitter/X is also enabled as a login method in your Privy Dashboard (dashboard.privy.io) -- same place where you configured Google.

