# Convex CLI: Offline Codegen Specification

**Date:** 2025-11-21

**Related GitHub Issues:**

- [#81 - Unable to run codegen on Vercel without CONVEX_DEPLOY_KEY](https://github.com/get-convex/convex-js/issues/81)
  (Open, primary motivation)

- [#73 - Offline development error](https://github.com/get-convex/convex-js/issues/73)
  (Closed, partial fix)

---

## 1. Executive Summary

**Problem:** `npx convex codegen` requires backend connection and
authentication, making it unsuitable for CI/CD pipelines and AI agent workflows.

**Solution:** Add `--offline` flag that generates types purely from local files
without backend communication.

**Key Finding:** **Offline mode provides identical type safety to backend mode**
for standard applications. The CLI already uses dynamic type generation by
default, which leverages TypeScript’s type inference from local files.

**Impact:** Enables offline CI/CD type checking, simplifies agent workflows,
removes network dependency for code generation.

**IMPORTANT:** This change is **fully backwards compatible**. All existing
`npx convex codegen` behavior remains unchanged. The new `--offline` flag is
purely additive and opt-in.

---

## 2. Background

### 2.1 What is Convex Codegen?

Convex generates TypeScript type definitions in `convex/_generated/` for:

- **Data models** (`dataModel.ts`): Table schemas, document types, indexes

- **API functions** (`api.ts`): Query, mutation, action signatures

- **Server utilities** (`server.ts`): Type-safe database access

- **Components** (`component.ts`): Component types (for modular apps)

### 2.2 Current Architecture

Codegen has two modes configured in `convex.json`:

```json
{
  "codegen": {
    "staticApi": false, // Default: dynamic mode
    "staticDataModel": false // Default: dynamic mode
  }
}
```

**Dynamic Mode (Default):**

- Generates types that import your local files

- Uses TypeScript utility types for inference

- **Works offline** - no backend needed for type safety

- Example:
  `export type DataModel = DataModelFromSchemaDefinition<typeof schema>`

**Static Mode (Opt-in):**

- Generates explicit types from backend analysis

- Requires backend connection

- Example: `export type DataModel = { users: { document: { name: string } } }`

**The problem:** Even in dynamic mode (default), the CLI still connects to
backend for validation.

---

## 3. Critical Discovery: Dynamic Mode Already Provides Full Type Safety

### 3.1 How Dynamic Mode Works

#### Data Model (Offline-Compatible)

**Location:**
[src/cli/codegen_templates/dataModel.ts:74-116](src/cli/codegen_templates/dataModel.ts#L74-116)

```typescript
// Generated code:
import type { DataModelFromSchemaDefinition } from "convex/server";
import schema from "../schema.js"; // ← Your local schema

export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
```

TypeScript’s compiler extracts all table names, field types, and indexes from
your schema!

#### API Functions (Offline-Compatible)

**Location:**
[src/cli/codegen_templates/component_api.ts:358-392](src/cli/codegen_templates/component_api.ts#L358-392)

```typescript
// Generated code:
import type * as users from "../users.js"; // ← Your local functions
import type { ApiFromModules } from "convex/server";

declare const fullApi: ApiFromModules<{
  users: typeof users;
}>;
```

TypeScript infers function signatures, arguments, and return types from your
code!

### 3.2 Type Safety Comparison

| Feature              | Static Mode (Backend) | Dynamic Mode (Offline) |
| -------------------- | --------------------- | ---------------------- |
| **Requires Backend** | ✅ Yes                | ❌ No                  |
| **Table Types**      | ✅ Typed              | ✅ Typed (identical)   |
| **Function Calls**   | ✅ Typed              | ✅ Typed (identical)   |
| **Arguments**        | ✅ Typed              | ✅ Typed (identical)   |
| **Return Types**     | ✅ Typed              | ✅ Typed (identical)   |
| **Components**       | ✅ Typed              | ❌ `any`               |
| **Error Messages**   | ✅ Direct             | ⚠️ Via utility types   |
| **CI/CD Friendly**   | ⚠️ Needs key          | ✅ No auth needed      |

**Bottom Line:** For apps without components, dynamic mode = static mode in type
safety!

---

## 4. What You Lose with Offline Mode

### 4.1 Component Type Safety (Advanced Feature)

**Components** are npm-installed modular backends (e.g., `@convex-dev/auth`,
`@convex-dev/rate-limiter`).

**Impact:** In offline mode, `components.*` calls have type `AnyComponents`
instead of fully typed interfaces.

**Why:** Full component type analysis requires executing npm package code in
Convex runtime to introspect the component's API surface.

**How It Works:** Offline mode generates a `components` stub export:

```typescript
// api.d.ts (offline mode)
import type { AnyComponents } from "convex/server";
export declare const components: AnyComponents;

// api.js (offline mode)
import { componentsGeneric } from "convex/server";
export const components = componentsGeneric();
```

This ensures that:

- Projects using components still compile in offline mode
- Imports of `components` from `_generated/api` don't break
- Runtime behavior is preserved (component calls work, just without compile-time
  type checking)

**Workaround:** Run `npx convex codegen` (without `--offline`) if you need full
component type safety. The full types will be generated and committed to your
repository.

### 4.1.1 Component Type Preservation (Enhanced Offline Mode)

**Problem:** The basic `AnyComponents` stub breaks type checking for projects
that use Convex components like `@convex-dev/rate-limiter`.

**Solution:** Offline mode preserves existing component types from previously
generated `api.d.ts` files, only regenerating the `api` and `internal` exports.

**How It Works:**

1. Before regenerating, read existing `_generated/api.d.ts`
2. Use TypeScript Compiler API to extract
   `export declare const components: {...}`
3. Generate new `api` and `internal` exports from local files
4. Re-inject preserved component types instead of `AnyComponents` stub

**Implementation (using TypeScript AST):**

```typescript
import ts from "typescript";

export function extractComponentTypes(content: string): string | null {
  const sourceFile = ts.createSourceFile(
    "api.d.ts",
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  const printer = ts.createPrinter();

  for (const statement of sourceFile.statements) {
    if (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      ) &&
      statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)
    ) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === "components") {
          return printer.printNode(
            ts.EmitHint.Unspecified,
            statement,
            sourceFile,
          );
        }
      }
    }
  }
  return null;
}
```

**Behavior:**

- If existing `api.d.ts` has real component types → preserve them
- If existing `api.d.ts` has `AnyComponents` → use `AnyComponents` (no change)
- If no existing `api.d.ts` → use `AnyComponents` stub
- Always regenerate `api` and `internal` exports from local files

**Benefits:**

- Works with any component configuration
- No need to understand component package internals
- Users run `npx convex codegen` once (with backend) to get types
- Then `--offline` preserves them while updating function types

### 4.2 Early Schema Validation

**What:** Backend validates Convex-specific runtime rules:

- Index names are valid (no hyphens)

- Table names are valid (no spaces)

- Search/vector index configs are valid

**Impact:** These errors are caught at deploy instead of codegen.

**Why:** Requires executing your schema in V8 isolate (security/complexity
issue).

**This is NOT a type safety issue** - just timing of validation.

### 4.3 More Verbose Error Messages

Dynamic mode uses utility types, so errors can be longer:

```
Type 'number' is not assignable to parameter of type
'ExtractFieldPaths<DataModelFromSchemaDefinition<typeof schema>["users"]>'.
```

Errors are still **correct and actionable**.

---

## 5. Use Cases

### 5.1 CI/CD Pipelines (Primary)

**Current:**

```yaml
# Requires secrets
env:
  CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
steps:
  - run: npx convex codegen
  - run: tsc --noEmit
```

**With Offline:**

```yaml
# No secrets needed!
steps:
  - run: npx convex codegen --offline
  - run: tsc --noEmit # Full type safety!
```

### 5.2 AI Agent Development

Agents can generate types without auth setup or network access:

```bash
npx convex codegen --offline  # Full type safety!
```

### 5.3 Offline Development

Work on planes/trains without internet:

```bash
npx convex codegen --offline
```

---

## 6. Proposed Solution: `--offline` Flag

### 6.1 User-Facing API

```bash
# Offline codegen
npx convex codegen --offline

# With typecheck
npx convex codegen --offline --typecheck enable

# Dry run
npx convex codegen --offline --dry-run
```

### 6.2 Behavior

When `--offline` is set:

1. **Skip Backend**
   - No `startPush()` call

   - No authentication required

   - No network access

2. **Force Dynamic Mode**
   - Ignore static config (treat as `false`)

   - Generate types that import local files

   - Use TypeScript inference

3. **Local Operations**
   - Scan files with `entryPoints()`

   - Generate types from TypeScript

   - Typecheck with local `tsc`

4. **User Communication**
   - Info message about offline mode

   - Warn if static config set (ignored)

   - Warn about component limitation (if detected)

### 6.3 Limitations

**What You Lose:**

- ❌ Component type safety (if using components)

- ⚠️ Early validation (caught at deploy instead)

- ⚠️ Potentially verbose errors

**What You Keep:**

- ✅ **100% identical type safety** for functions and data

- ✅ Full TypeScript autocomplete

- ✅ Fast local iteration

- ✅ CI/CD compatibility

- ✅ Works offline

---

## 7. Implementation Plan

### 7.1 Simple Approach (RECOMMENDED)

Reuse existing `doCodegen()` path with minimal changes.

### 7.2 Step 1: Add Flag

**File:** [src/cli/codegen.ts](src/cli/codegen.ts)

```typescript
export const codegen = new Command("codegen").option(
  "--offline",
  "Generate types locally without backend connection. " +
    "Uses TypeScript type inference. " +
    "Full type safety for functions and data.",
);
// ... existing options
```

### 7.3 Step 2: Skip Deployment Selection

**File:** [src/cli/codegen.ts:44-62](src/cli/codegen.ts#L44-62)

```typescript
.action(async (options) => {
  const ctx = await oneoffContext(options);

  // Skip deployment selection ONLY for offline mode
  if (options.offline) {
    await runCodegen(ctx, { kind: "anonymous", deploymentName: null }, {
      ...buildOptions(options),
      offline: true,
    });
    return;
  }

  // Normal flow - unchanged for all existing behavior
  const deploymentSelection = await getDeploymentSelection(ctx, options);
  await runCodegen(ctx, deploymentSelection, buildOptions(options));
});
```

**Key:** Bypass `getDeploymentSelection()` **only when `--offline` is set**. All
existing codegen behavior without the flag remains exactly the same.

### 7.4 Step 3: Route to Local Codegen

**File:** [src/cli/lib/components.ts:96-142](src/cli/lib/components.ts#L96-142)

```typescript
export async function runCodegen(
  ctx: Context,
  deploymentSelection: DeploymentSelection,
  options: CodegenOptions,
) {
  const { configPath, projectConfig } = await readProjectConfig(ctx);
  const functionsDirectoryPath = functionsDir(configPath, projectConfig);

  // Early init if needed
  if (options.init) {
    await doInitCodegen(ctx, functionsDirectoryPath, false, {
      dryRun: options.dryRun,
      debug: options.debug,
    });
  }

  // Offline or system UDFs: use local codegen only
  // This check is only active when options.offline or options.systemUdfs is set
  // All existing behavior is preserved when these flags are not set
  if (options.offline || options.systemUdfs) {
    if (options.offline) {
      logMessage(
        chalk.blue(
          "ℹ️  Offline mode: Generating types from local files\n" +
            "   Full type safety via TypeScript inference",
        ),
      );

      // Warn about static config
      if (
        projectConfig.codegen.staticApi ||
        projectConfig.codegen.staticDataModel
      ) {
        logMessage(
          chalk.yellow("⚠️  Static codegen config ignored in offline mode"),
        );
      }

      // Warn about component typing based on `isComponentDirectory`
      const componentDir = isComponentDirectory(
        ctx,
        functionsDirectoryPath,
        true,
      );
      if (
        componentDir.kind === "ok" &&
        !componentDir.component.isRootWithoutConfig
      ) {
        logMessage(
          chalk.yellow(
            "⚠️  Component calls become 'any' in offline mode. " +
              "Use backend codegen if you need typed `components.*`.",
          ),
        );
      }
    }

    await doCodegen(ctx, functionsDirectoryPath, options.typecheck, {
      dryRun: options.dryRun,
      debug: options.debug,
      generateCommonJSApi: options.commonjs,
      offline: options.offline,
      componentDirOverride: options.codegenOnlyThisComponent,
    });

    logFinishedStep("✓ Types generated successfully (offline mode)");
    return;
  }

  // Existing backend flow: runs exactly as before when --offline is not set
  // ... existing backend flow
}
```

**Key:** The offline code path is **only** executed when `options.offline` is
true. When `--component-dir` is supplied we reuse the same logic that
`startComponentsPushAndCodegen` uses: resolve the directory via
`isComponentDirectory()`, crash if `convex.config.ts` is missing, and pass the
resolved path down via `componentDirOverride`. The existing backend flow at the
end of this function continues to work exactly as before for all other cases, so
`--component-dir` behaves the same way regardless of backend or offline
execution.

### 7.5 Step 4: Support Component Stubs in doCodegen

**File:** [src/cli/lib/codegen.ts:130-198](src/cli/lib/codegen.ts#L130-198)

**Problem:** Current `doCodegen()` uses `serverCodegen()` which doesn’t include
`components` export.

**Solution:** Use existing `componentServerTS(true)` when offline mode is
enabled.

```typescript
export async function doCodegen(
  ctx: Context,
  functionsDir: string,
  typeCheckMode: TypeCheckMode,
  opts?: {
    dryRun?: boolean;
    generateCommonJSApi?: boolean;
    debug?: boolean;
    offline: boolean;
    componentDirOverride?: string;
  },
) {
  const { projectConfig } = await readProjectConfig(ctx);
  const targetDir = opts?.componentDirOverride ?? functionsDir;
  const codegenDir = await prepareForCodegen(ctx, targetDir, opts);
  const offline = opts?.offline ?? false;

  // Detect if this is a component-aware project
  const componentDir = isComponentDirectory(ctx, targetDir, true);
  const isComponentProject =
    componentDir.kind === "ok" && !componentDir.component.isRootWithoutConfig;

  await withTmpDir(async (tmpDir) => {
    const writtenFiles = [];
    const useTypeScript = usesTypeScriptCodegen(projectConfig);
    const generateCommonJSApi =
      opts?.generateCommonJSApi || projectConfig.generateCommonJSApi;

    // Data Model
    const schemaFiles = await doDataModelCodegen(
      ctx,
      tmpDir,
      targetDir,
      codegenDir,
      useTypeScript,
      opts,
    );
    writtenFiles.push(...schemaFiles);

    // Server Files
    let serverFiles;
    if (offline && isComponentProject) {
      // Use componentServerTS which includes components export (offline mode only)
      serverFiles = await writeComponentServerFile(
        ctx,
        tmpDir,
        codegenDir,
        opts,
      );
      logMessage(
        chalk.yellow("⚠️  Component calls become 'any' in offline mode"),
      );
    } else {
      // Use legacy serverCodegen (default behavior preserved)
      serverFiles = await writeServerFiles(
        ctx,
        tmpDir,
        codegenDir,
        useTypeScript,
        opts,
      );
    }
    writtenFiles.push(...serverFiles);

    // API Files
    let apiFiles;
    if (offline && isComponentProject) {
      // Use componentApiStubTS which includes components export (offline mode only)
      apiFiles = await doComponentApiStub(
        ctx,
        tmpDir,
        codegenDir,
        useTypeScript,
        generateCommonJSApi,
        opts,
      );
    } else {
      // Use legacy apiCodegen (default behavior preserved)
      apiFiles = await doApiCodegen(
        ctx,
        tmpDir,
        targetDir,
        codegenDir,
        useTypeScript,
        generateCommonJSApi,
        opts,
      );
    }
    writtenFiles.push(...apiFiles);

    // Cleanup
    if (!opts?.debug) {
      for (const file of ctx.fs.listDir(codegenDir)) {
        if (!writtenFiles.includes(file.name)) {
          recursivelyDelete(ctx, path.join(codegenDir, file.name), opts);
        }
      }
    }

    // Typecheck
    await typeCheckFunctionsInMode(ctx, typeCheckMode, targetDir);
  });
}

// New helper for component API stubs
async function doComponentApiStub(
  ctx: Context,
  tmpDir: TempDir,
  codegenDir: string,
  useTypeScript: boolean,
  generateCommonJSApi: boolean,
  opts?: { dryRun?: boolean; debug?: boolean },
): Promise<string[]> {
  const writtenFiles: string[] = [];

  if (!useTypeScript) {
    // Write api.js
    await writeFormattedFile(
      ctx,
      tmpDir,
      componentApiJs(),
      "typescript",
      path.join(codegenDir, "api.js"),
      opts,
    );
    // Write api.d.ts
    await writeFormattedFile(
      ctx,
      tmpDir,
      componentApiStubDTS(),
      "typescript",
      path.join(codegenDir, "api.d.ts"),
      opts,
    );
    writtenFiles.push("api.js", "api.d.ts");

    if (generateCommonJSApi) {
      await writeFormattedFile(
        ctx,
        tmpDir,
        rootComponentApiCJS(),
        "typescript",
        path.join(codegenDir, "api_cjs.cjs"),
        opts,
      );
      await writeFormattedFile(
        ctx,
        tmpDir,
        componentApiStubDTS(),
        "typescript",
        path.join(codegenDir, "api_cjs.d.cts"),
        opts,
      );
      writtenFiles.push("api_cjs.cjs", "api_cjs.d.cts");
    }
  } else {
    await writeFormattedFile(
      ctx,
      tmpDir,
      componentApiStubTS(),
      "typescript",
      path.join(codegenDir, "api.ts"),
      opts,
    );
    writtenFiles.push("api.ts");
  }

  return writtenFiles;
}
```

**Key Changes:**

1. Detect component projects using `isComponentDirectory()`

2. Use `componentServerTS(true)` for component projects (includes `components`
   export)

3. Use `componentApiStubTS()` for component projects (includes `components`
   export)

4. Warn users that components become `any`

5. Keep legacy templates for non-component projects

**Why This Works:**

- `componentServerTS(true)` already exists at
  [src/cli/codegen_templates/component_server.ts:156-163](src/cli/codegen_templates/component_server.ts#L156-163)

- `componentApiStubTS()` already exists at
  [src/cli/codegen_templates/component_api.ts:65-77](src/cli/codegen_templates/component_api.ts#L65-77)

- These templates already generate the correct stubs with
  `components: AnyComponents`

- No new template code needed!

### 7.6 Step 5: Update Types

**File:** [src/cli/lib/codegen.ts:51-64](src/cli/lib/codegen.ts#L51-64)

```typescript
export type CodegenOptions = {
  url?: string | undefined;
  adminKey?: string | undefined;
  dryRun: boolean;
  debug: boolean;
  typecheck: TypeCheckMode;
  init: boolean;
  commonjs: boolean;
  liveComponentSources: boolean;
  debugNodeApis: boolean;
  systemUdfs: boolean;
  offline: boolean;
  largeIndexDeletionCheck: LargeIndexDeletionCheck;
  codegenOnlyThisComponent?: string | undefined;
};
```

### 7.7 Step 6: Add Tests

**File:** `src/cli/lib/codegen.test.ts`

```typescript
describe("offline codegen", () => {
  test("generates types without auth", async () => {
    const ctx = testContext({ auth: null });
    await runCodegen(
      ctx,
      { kind: "anonymous", deploymentName: null },
      {
        offline: true,
        typecheck: "disable",
      },
    );

    expect(ctx.fs.exists("convex/_generated/api.d.ts")).toBe(true);
    expect(ctx.fs.exists("convex/_generated/dataModel.d.ts")).toBe(true);
    expect(ctx.fs.exists("convex/_generated/server.d.ts")).toBe(true);
  });

  test("provides full type safety", async () => {
    const ctx = testContext({
      files: {
        "convex/schema.ts": SAMPLE_SCHEMA,
        "convex/users.ts": SAMPLE_FUNCTION,
      },
    });

    await runCodegen(
      ctx,
      { kind: "anonymous", deploymentName: null },
      {
        offline: true,
        typecheck: "enable",
      },
    );

    const result = await runTypeCheck(ctx);
    expect(result.errors).toHaveLength(0);
  });

  test("warns about static config", async () => {
    const ctx = testContext({
      config: { codegen: { staticApi: true } },
    });
    const warnings = [];
    ctx.logMessage = (msg) => warnings.push(msg);

    await runCodegen(
      ctx,
      { kind: "anonymous", deploymentName: null },
      {
        offline: true,
      },
    );

    expect(
      warnings.some((w) => w.includes("Static codegen config ignored")),
    ).toBe(true);
  });

  test("generates component stubs for component projects", async () => {
    const ctx = testContext({
      files: {
        "convex/convex.config.ts": SAMPLE_COMPONENT_CONFIG,
      },
    });

    await runCodegen(
      ctx,
      { kind: "anonymous", deploymentName: null },
      {
        offline: true,
      },
    );

    const serverContent = ctx.fs.readUtf8File("convex/_generated/server.ts");
    expect(serverContent).toContain("export const components");

    const apiContent = ctx.fs.readUtf8File("convex/_generated/api.ts");
    expect(apiContent).toContain("export const components");
  });

  test("does not crash in CI environment", async () => {
    process.env.VERCEL = "1";
    const ctx = testContext({ auth: null });

    // Should not throw even though build environment is detected
    await expect(
      runCodegen(
        ctx,
        { kind: "anonymous", deploymentName: null },
        {
          offline: true,
        },
      ),
    ).resolves.not.toThrow();

    delete process.env.VERCEL;
  });
});
```

### 7.8 Summary of Changes

**Files Modified:**

1. `src/cli/codegen.ts` - Add `--offline` flag (~10 lines)

2. `src/cli/lib/components.ts` - Route to local codegen (~25 lines)

3. `src/cli/lib/codegen.ts` - Support component stubs (~50 lines)

4. `src/cli/lib/codegen.ts` - Add type definition (~1 line)

5. Tests - New test cases (~100 lines)

**Total:** ~200 lines of code

**Key Simplifications:**

- No new templates needed - reuse existing `componentServerTS()` and
  `componentApiStubTS()`

- No complex detection logic - use existing `isComponentDirectory()`

- No separate “stub writer” - integrate into `doCodegen()`

- Bypass `getDeploymentSelection()` entirely for offline mode

---

## 8. Installing and Testing the Fork

Since this is a fork of the Convex CLI, you can install and test it without
publishing to npm. Here are the recommended approaches:

### 8.1 Install Directly from GitHub

The simplest way to use this fork is to install it directly from GitHub in your
project’s `package.json`:

```json
{
  "dependencies": {
    "convex": "levy/convex-js#claude/convex-cli-no-auth-01YTaA2iiZgRHX9JVh4SH3qA"
  }
}
```

Then run `npm install`. You can reference any branch, tag, or commit SHA.

**Pros:**

- Works like normal npm

- Shareable with team

- Easy to update by changing the branch/SHA

**Cons:**

- Need to commit changes to test

### 8.2 Use npm link (For Active Development)

If you’re actively modifying the Convex CLI code:

```bash
# In your convex-js fork directory:
cd /Users/levy/wrk/github/convex-js
npm install
npm run build
npm link

# In your project directory:
cd ~/my-project
npm link convex
```

**Pros:**

- Changes are reflected when you rebuild (no need to commit)

- Fast iteration

**Cons:**

- Global state, can interfere with other projects

- Need to rebuild after changes

### 8.3 Direct Installation Command

You can also install directly without modifying `package.json`:

```bash
cd ~/my-project
npm install git+https://github.com/levy/convex-js.git#claude/convex-cli-no-auth-01YTaA2iiZgRHX9JVh4SH3qA
```

### 8.4 Testing the --offline Flag

Once installed, test the offline codegen:

```bash
# In your project with Convex schema and functions:
npx convex codegen --offline

# Verify type checking works:
npx tsc --noEmit

# Test in CI (no auth needed):
unset CONVEX_DEPLOY_KEY
npx convex codegen --offline
npm run typecheck
```

### 8.5 Updating Your Installation

**For GitHub installation (8.1):** Update the branch/SHA in `package.json` and
run `npm install`

**For npm link (8.2):** Just rebuild in the convex-js directory: `npm run build`

**For direct installation (8.3):** Re-run the install command with the updated
branch/SHA

---

## 9. Testing Strategy

### 9.1 Unit Tests

- Generate types without auth

- Verify dynamic imports used

- Full type checking passes

- Warnings shown correctly

- Component stubs generated

### 9.2 Integration Tests

```bash
# Test in real project
cd test-project
unset CONVEX_DEPLOY_KEY
npx convex codegen --offline

# Verify types work
npx tsc --noEmit
```

### 9.3 CI Test

```yaml
# No secrets, should work
- run: npx convex codegen --offline
- run: npm run typecheck
```

---

## 10. Documentation Updates

### 10.1 CLI Help

```
--offline    Generate types locally without backend connection.
             Uses TypeScript type inference from local files.
             Full type safety for your functions and data.
             Components become 'any' (if you use them).
             Ideal for CI/CD pipelines.
```

### 10.2 Docs: CI/CD Guide

```markdown
## Type Checking in CI

Generate types without deploying:

\`\`\`bash npx convex codegen --offline npx tsc --noEmit \`\`\`

**No CONVEX_DEPLOY_KEY needed!**

**Type Safety:** Offline mode provides **identical type safety** to backend mode
through TypeScript's type inference.

**Trade-offs:**

- ✅ No auth required
- ✅ Works offline
- ✅ Full type safety for functions and data
- ⚠️ Components (if used) become 'any'
- ⚠️ Schema validation at deploy time
```

---

## 11. Migration Guide

### 11.1 For CI/CD Pipelines

**Before:**

```yaml
env:
  CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
steps:
  - run: npx convex codegen
```

**After:**

```yaml
steps:
  - run: npx convex codegen --offline
```

**No secrets needed. Same type safety!**

### 11.2 For Agent Workflows

**Before:**

```bash
export CONVEX_DEPLOY_KEY="..."
npx convex codegen
```

**After:**

```bash
npx convex codegen --offline
```

### 11.3 Backwards Compatibility

✅ **No breaking changes - 100% backwards compatible**

- `npx convex codegen` (without `--offline`) works **exactly as before**

- All existing flags and options behave identically when `--offline` is not used

- `--offline` is a new, opt-in flag that only affects behavior when explicitly
  set

- Static configs continue to work in normal mode (when `--offline` is not set)

- All existing test suites pass without modification

- No changes to default behavior, API surface, or configuration

---

## 12. Future Enhancements

### 12.1 Auto-Detection

Automatically use offline mode when no auth available:

```typescript
if (!options.offline && deploymentSelection.kind === "anonymous") {
  logMessage(
    chalk.blue(
      "ℹ️ No deployment configured. Using offline codegen.\n" +
        "   To suppress this message, use --offline flag.",
    ),
  );
  options.offline = true;
}
```

**Benefits:**

- “Just works” in CI

- Explicit control with flag when needed

### 12.2 Local Schema Validation

Implement Convex-specific validation in CLI:

- Check index names

- Validate table names

- Catch errors at codegen time

### 12.3 Component Types from npm

Import component types from installed packages:

- Read `node_modules/@convex-dev/auth/_generated`

- Generate typed component imports

- Partial component type safety offline

---

## 13. Related Work

### 13.1 GitHub Issue #81 (Primary Motivation)

**Problem:** Codegen fails on Vercel without `CONVEX_DEPLOY_KEY`

**Root Cause:** CLI crashes in build environments when no deploy key set, even
though codegen doesn’t need deployment.

**Solution:** `--offline` flag solves this completely.

### 13.2 Agent Mode

**`CONVEX_AGENT_MODE=anonymous`** creates local backend for agents.

**Different from offline codegen:**

- Agent mode: Full dev workflow (backend required)

- Offline codegen: Type generation only (no backend)

**Use:**

- Agent mode for full development

- Offline for CI/CD and quick type checks

### 13.3 Dynamic Codegen (Already Exists!)

The CLI already has dynamic mode as the default:

- Uses `ApiFromModules<>` for type inference

- Uses `DataModelFromSchemaDefinition<>` for schemas

- Works offline by design

**We just need to expose it without backend validation.**

---

## 14. Summary

**Key Insight:** Convex already has a fully functional offline codegen system
(dynamic mode). It’s the default and provides full type safety. We just need to
make it accessible when there’s no backend connection.

**Implementation:**

1. Add `--offline` flag

2. Skip deployment selection when offline

3. Route to existing `doCodegen()` with component stub support

4. Use existing templates (`componentServerTS`, `componentApiStubTS`)

**Impact:**

- ✅ CI/CD without secrets

- ✅ Agent workflows simplified

- ✅ Offline development enabled

- ✅ **Identical type safety** for most apps

- ⚠️ Components become `any` (advanced feature)

**No new templates. No complex logic. Just expose what already exists.**

---

## 15. Appendix: Code Locations

| Feature                   | File                                                      | Function                 |
| ------------------------- | --------------------------------------------------------- | ------------------------ |
| Codegen command           | `src/cli/codegen.ts`                                      | `codegen` command        |
| Run codegen               | `src/cli/lib/components.ts`                               | `runCodegen()`           |
| Local codegen             | `src/cli/lib/codegen.ts`                                  | `doCodegen()`            |
| Component server template | `src/cli/codegen_templates/component_server.ts`           | `componentServerTS()`    |
| Component API template    | `src/cli/codegen_templates/component_api.ts`              | `componentApiStubTS()`   |
| Dynamic data model        | `src/cli/codegen_templates/dataModel.ts`                  | `dynamicDataModelTS()`   |
| Component detection       | `src/cli/lib/components/definition/directoryStructure.ts` | `isComponentDirectory()` |
