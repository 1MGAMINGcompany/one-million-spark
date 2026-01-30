

# Harden Token Extraction with UUID Validation + Nested JSON Support

## Overview

Upgrade `getSessionToken()` in `useGameInvites.ts` to be production-safe by:
1. Validating tokens are actual UUIDs (not random long strings)
2. Supporting nested JSON structures for future-proofing

## Current Code (lines 29-44)

```typescript
function getSessionToken(): string | null {
  const latest = localStorage.getItem("session_token_latest");
  if (latest) return latest;  // ⚠️ No validation - could return any string

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("session_token_") && key !== "session_token_latest") {
      const token = localStorage.getItem(key);
      if (token) return token;  // ⚠️ No validation
    }
  }
  return null;
}
```

**Problems:**
- Returns any string without validation
- Doesn't check `1mg_session_*` keys (JSON storage)
- No UUID format verification

## Solution

Replace lines 29-44 with three functions:

### 1. UUID Validator
```typescript
function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}
```

### 2. Token Extractor (handles raw + JSON)
```typescript
function extractTokenFromStoredValue(value: string | null): string | null {
  if (!value) return null;

  // Case A: raw UUID stored directly
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && isUuidLike(trimmed)) {
    return trimmed;
  }

  // Case B: JSON stored session object
  try {
    const obj = JSON.parse(value);

    // Check all known patterns including nested structures
    const candidates: unknown[] = [
      obj?.session_token,
      obj?.sessionToken,
      obj?.token,
      obj?.access_token,
      obj?.session?.token,
      obj?.session?.session_token,
      obj?.data?.token,
      obj?.data?.session_token,
    ];

    for (const c of candidates) {
      if (typeof c === "string" && isUuidLike(c)) return c;
    }
  } catch {
    // not JSON
  }

  return null;
}
```

### 3. Updated Token Discovery
```typescript
function getSessionToken(): string | null {
  // 1) Prefer global latest
  const latest = extractTokenFromStoredValue(localStorage.getItem("session_token_latest"));
  if (latest) return latest;

  // 2) Scan all keys for known patterns
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    // Raw token patterns (session_token_<roomPda>)
    if (key.startsWith("session_token_") && key !== "session_token_latest") {
      const t = extractTokenFromStoredValue(localStorage.getItem(key));
      if (t) return t;
    }

    // JSON session patterns (1mg_session_<roomPda>)
    if (key.startsWith("1mg_session_")) {
      const t = extractTokenFromStoredValue(localStorage.getItem(key));
      if (t) return t;
    }
  }

  return null;
}
```

## File Changes

| File | Lines | Change |
|------|-------|--------|
| `src/hooks/useGameInvites.ts` | 29-44 | Replace with 3 hardened functions |

## Security Benefits

| Issue | Before | After |
|-------|--------|-------|
| Random long string returned as token | Possible | Blocked (UUID regex) |
| JSON-wrapped tokens missed | Yes | Handled |
| Nested JSON structures | Not supported | Supported |
| `1mg_session_*` keys | Ignored | Scanned |

## Risk Assessment

- **Self-contained**: Only touches `useGameInvites.ts`
- **No backend changes**: Edge functions unchanged
- **No new wallet prompts**: Auth flow unchanged
- **Backward compatible**: Works with all existing token storage patterns

