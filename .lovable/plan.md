

## Fix: Missing comma in Spanish locale JSON

**Problem**: `src/i18n/locales/es.json` line 1665 is missing a trailing comma after `"liveSet": "Set"`, causing a JSON parse error that breaks the build.

**Fix**: Add the missing comma on line 1665:
```
"liveSet": "Set",
```

That's a one-character fix. I'll also quickly scan the other 9 locale files for the same issue to prevent repeat failures.

