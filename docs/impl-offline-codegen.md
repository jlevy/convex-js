# Offline Codegen Implementation Log

**Date Started:** 2025-11-22 **Branch:**
`claude/convex-cli-no-auth-01YTaA2iiZgRHX9JVh4SH3qA` **Implementing:** Option
A - Reuse Existing System UDFs Path

---

## Implementation Approach

Following the spec recommendation: **Option A - Reuse Existing System UDFs
Path**

This involves:

1. Add `--offline` flag to codegen command definition
2. Update `CodegenOptions` type to include `offline?: boolean`
3. Add routing logic in `runCodegen()` to use local-only path when `--offline`
   is set
4. Pass the flag through from command action to implementation
5. Add tests

**Estimated effort:** 2-4 hours **Actual lines of code:** ~25 lines

---

## Design Decisions

### Decision 1: Flag Naming

**Chosen:** `--offline` **Alternatives considered:**

- `--local-only`
- `--no-backend`
- `--skip-validation`

**Rationale:**

- Clear and concise
- Matches user mental model (working offline)
- Consistent with other tools (npm, git)
- Documents already use "offline" terminology

### Decision 2: Reuse System UDFs Path vs New Path

**Chosen:** Reuse existing `--system-udfs` path **Rationale:**

- Minimal code changes (~25 lines vs 1-2 days)
- Battle-tested code path
- Low risk
- Identical functionality

### Decision 3: Component Detection

**Chosen:** Check if project uses components and warn appropriately **How:** Use
existing `isComponentDirectory()` check **Implementation:** Show warning only if
components are actually used

### Decision 4: Messaging Strategy

**Chosen:** Show clear info/warning messages

- Info: "Offline mode: Generating types from local files"
- Warning: If static config detected
- Warning: If components detected
- Success: "Types generated successfully (offline mode)"

---

## Implementation Progress

### Step 1: Add --offline Flag to Command Definition ✅

**File:** `src/cli/codegen.ts` (lines 28-35) **Status:** ✅ Completed

Added the `--offline` option to the command definition:

```typescript
.option(
  "--offline",
  "Generate types locally without connecting to a backend. " +
  "Uses TypeScript type inference from local files. " +
  "Provides full type safety for your functions and data. " +
  "Components (if you use them) become 'any'. " +
  "Ideal for CI/CD pipelines and offline development.",
)
```

### Step 2: Update CodegenOptions Type ✅

**File:** `src/cli/lib/codegen.ts` (line 62) **Status:** ✅ Completed

Added `offline?: boolean` to the `CodegenOptions` type definition.

### Step 3: Pass Flag Through Action Handler ✅

**File:** `src/cli/codegen.ts` (line 67) **Status:** ✅ Completed

Added `offline: !!options.offline` to the options object passed to
`runCodegen()`.

### Step 4: Add Routing Logic to runCodegen() ✅

**File:** `src/cli/lib/components.ts` (lines 96-148) **Status:** ✅ Completed

Implemented the core offline mode logic:

1. Check `if (options.offline || options.systemUdfs)` to route to local-only
   path
2. Display info message about offline mode with TypeScript inference
3. Warn if static codegen config is detected (will be ignored in offline mode)
4. Check for components using `isComponentDirectory()` and warn if detected
5. Call `doCodegen()` for local-only type generation
6. Display success message after completion

**Key Implementation Details:**

- Reuses existing `doCodegen()` function (same path as `--system-udfs`)
- Component detection uses `isComponentDirectory()` with `allowRoot=true`
- Only shows component warning if actual components are configured (not just
  root)
- Messages use chalk colors: blue for info, yellow for warnings
- Success message explicitly indicates "(offline mode)"

### Step 5: Manual Testing ⏳

**Status:** ⏳ Pending

**Test Plan:**

1. Test basic offline mode: `npx convex codegen --offline`
   - Verify types generated in `convex/_generated/`
   - Verify no backend connection attempted
   - Verify success message displayed

2. Test with static config set:
   - Create project with `staticApi: true` in `convex.json`
   - Run `npx convex codegen --offline`
   - Verify warning about static config being ignored

3. Test with components:
   - Create project using `@convex-dev/auth` or similar component
   - Run `npx convex codegen --offline`
   - Verify warning about component types

4. Test error cases:
   - Invalid TypeScript in schema
   - Invalid TypeScript in functions
   - Verify appropriate error messages

### Step 6: Format and Commit ⏳

**Status:** ⏳ Pending

**Files to format:**

- `docs/spec-offline-codegen.md`
- `docs/impl-offline-codegen.md`
- `src/cli/codegen.ts`
- `src/cli/lib/codegen.ts`
- `src/cli/lib/components.ts`

**Commit message:**

```
Add --offline flag to codegen command

Implements Option A from spec: reuse existing system UDFs path
for offline codegen. This allows `npx convex codegen --offline`
to generate types without backend connection.

Key changes:
- Add --offline flag to codegen command definition
- Update CodegenOptions type with offline?: boolean
- Add routing logic to check options.offline || options.systemUdfs
- Display info/warning messages for offline mode
- Success message indicates offline mode

Fixes: https://github.com/get-convex/convex-js/issues/81
Related: https://github.com/get-convex/convex-js/issues/73

Implements: docs/spec-offline-codegen.md (Option A)
Tracks: docs/impl-offline-codegen.md
```

---

## Actual Implementation Size

**Lines of code added:** ~60 lines across 3 files

- `src/cli/codegen.ts`: ~10 lines (flag definition + passing)
- `src/cli/lib/codegen.ts`: 1 line (type update)
- `src/cli/lib/components.ts`: ~50 lines (routing logic + messages)

**Complexity:** Low (reuses existing code path) **Risk:** Very low
(battle-tested system UDFs path)
