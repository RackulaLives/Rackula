# Spike #622: Codebase Exploration

## Files Examined

**Data Persistence:**

- `src/lib/utils/file.ts`: File picker and file reading utilities
- `src/lib/utils/archive.ts`: ZIP archive creation/extraction (uses JSZip)
- `src/lib/utils/share.ts`: URL-based layout sharing (pako compression + base64url)
- `src/lib/utils/yaml.ts`: YAML serialization/deserialization

**State Management:**

- `src/lib/stores/layout.svelte.ts`: Central layout store (Svelte 5 runes)
- `src/lib/utils/session-storage.ts`: localStorage for UI state

**External Service Integration:**

- `src/lib/utils/netbox-import.ts`: NetBox API integration (existing pattern)
- `src/lib/components/ImportFromNetBoxDialog.svelte`: External import UI

**UI Components:**

- `src/lib/components/ShareDialog.svelte`: Current sharing UI
- `src/lib/components/ExportDialog.svelte`: Export options UI
- `src/App.svelte`: Main app orchestrating dialogs

## Current Architecture

### Data Persistence Methods

| Method          | Storage                 | Authentication | User Action      |
| --------------- | ----------------------- | -------------- | ---------------- |
| Session Storage | localStorage            | None           | Automatic        |
| File-based      | Browser download/upload | None           | Manual save/load |
| URL Sharing     | Query param             | None           | Copy/paste URL   |

### File Save/Load Flow

```
Save: Layout → YAML serialize → ZIP bundle → Browser download
Load: File picker → ZIP extract → YAML parse → loadLayout()
```

### URL Sharing Flow

```
Share: Layout → Minimal format → pako compress → base64url → URL
Load: URL param → base64url decode → pako inflate → loadLayout()
```

**Key observation:** All current operations are client-side only. No backend, no authentication.

## Integration Points

### Where Git/GitHub Would Connect

1. **Save Decision Point** (`App.svelte`)
   - Currently: `downloadArchive()` triggers browser download
   - Git hook: Add "Save to GitHub" option alongside download

2. **Load Mechanism** (`archive.ts`)
   - Currently: `openFilePicker()` for local files
   - Git hook: Add "Load from GitHub" fetching from repo

3. **Existing API Pattern** (`netbox-import.ts`)
   - Shows how to integrate external API
   - Fetch → Validate with Zod → Transform → Load to store

4. **Layout Store** (`layout.svelte.ts`)
   - `loadLayout()` is the single entry point for data
   - Any source (file, URL, GitHub) feeds through same path

## Existing Patterns

### External API Integration (NetBox example)

```typescript
// netbox-import.ts pattern:
async function importFromNetBox(url: string) {
  const response = await fetch(url);
  const data = await response.json();
  const validated = NetBoxSchema.parse(data);
  // Transform and load...
}
```

### Lazy Loading Dependencies

```typescript
// archive.ts pattern:
async function createArchive() {
  const JSZip = (await import("jszip")).default;
  // Use JSZip...
}
```

### File I/O with Error Handling

```typescript
// file.ts pattern:
async function openFile(): Promise<Result> {
  try {
    const file = await showOpenFilePicker();
    // Process...
  } catch (error) {
    // Handle cancellation, errors...
  }
}
```

## Constraints

### Browser Limitations

| Constraint            | Impact                         | Workaround                     |
| --------------------- | ------------------------------ | ------------------------------ |
| No file system access | Can't write to arbitrary paths | File picker + download only    |
| CORS restrictions     | Can't call GitHub API directly | Need proxy or CORS headers     |
| Token storage         | localStorage is JS-readable    | Short-lived tokens, OAuth flow |
| No native git         | Can't run git commands         | isomorphic-git or API-only     |

### GitHub API Considerations

| Factor        | Unauthenticated | Authenticated        |
| ------------- | --------------- | -------------------- |
| Rate limit    | 60/hour         | 5,000/hour           |
| Private repos | No access       | Full access          |
| Write access  | None            | With scope           |
| CORS          | Blocked         | Blocked (need proxy) |

### Security Considerations

- **Token storage:** Browser localStorage is accessible to any JS on the page
- **OAuth flow:** Requires redirect URI, backend for token exchange
- **PAT handling:** User must manually create and provide token

## Summary

### Strengths for Git Integration

- YAML format already human-readable and git-friendly
- Layout store has clean load/save semantics
- Existing API integration pattern (NetBox) to follow
- Component architecture supports new dialogs

### Challenges

- Authentication requires backend or complex OAuth
- CORS blocks direct GitHub API calls from browser
- No native git operations in browser
- Token storage security in browser environment

### Recommended Starting Point

1. **Read-only first:** Fetch public layouts from GitHub repos
2. **Backend proxy:** Small service to handle CORS and auth
3. **OAuth flow:** For authenticated write access
4. **Treat as sharing service:** Not primary storage (yet)
