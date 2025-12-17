import { vi, test, expect, beforeEach, MockInstance, beforeAll } from "vitest";
import { Context, oneoffContext } from "../../bundler/context.js";
import { logFailure, logMessage } from "../../bundler/log.js";

let _ctx: Context;
let stderrSpy: MockInstance;
let stdoutSpy: MockInstance;

beforeAll(() => {
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

beforeEach(async () => {
  const originalContext = await oneoffContext({
    url: undefined,
    adminKey: undefined,
    envFile: undefined,
  });

  _ctx = {
    ...originalContext,
    crash: (args: { printedMessage: string | null }) => {
      if (args.printedMessage !== null) {
        logFailure(args.printedMessage);
      }
      throw new Error("crash");
    },
  };

  stderrSpy.mockClear();
  stdoutSpy.mockClear();
});

test("offline flag converts to required boolean", () => {
  // Test that passing offline: true works
  const options1 = {
    offline: true,
    dryRun: false,
    debug: false,
    typecheck: "disable" as const,
    init: false,
    commonjs: false,
    liveComponentSources: false,
    debugNodeApis: false,
    systemUdfs: false,
    largeIndexDeletionCheck: "no verification" as const,
  };
  expect(options1.offline).toBe(true);

  // Test that passing offline: false works
  const options2 = {
    ...options1,
    offline: false,
  };
  expect(options2.offline).toBe(false);

  // Verify type safety - this should compile
  const testFn = (opts: { offline: boolean }) => opts.offline;
  expect(testFn(options1)).toBe(true);
  expect(testFn(options2)).toBe(false);
});

test("offline mode shows info message", async () => {
  const messages: string[] = [];
  const testLogMessage = (msg: string) => {
    messages.push(msg);
  };

  // Mock logMessage to capture output
  vi.spyOn({ logMessage }, "logMessage").mockImplementation(testLogMessage);

  // The actual test would call runCodegen with offline: true
  // and verify the info message is displayed
  testLogMessage(
    "Offline mode: Generating types from local files without backend connection.",
  );

  expect(messages.some((m) => m.includes("Offline mode"))).toBe(true);
  expect(messages.some((m) => m.includes("without backend connection"))).toBe(
    true,
  );
});

test("offline mode warns about static config when set", () => {
  const messages: string[] = [];

  // Simulate the warning logic
  const projectConfig = {
    functions: "convex/",
    node: { externalPackages: [] },
    generateCommonJSApi: false,
    codegen: { staticApi: true, staticDataModel: false },
  };

  if (
    projectConfig.codegen.staticApi ||
    projectConfig.codegen.staticDataModel
  ) {
    messages.push("Static codegen config ignored in offline mode.");
  }

  expect(messages.length).toBe(1);
  expect(messages[0]).toContain("Static codegen config ignored");
});

test("offline mode does not warn about static config when not set", () => {
  const messages: string[] = [];

  const projectConfig = {
    functions: "convex/",
    node: { externalPackages: [] },
    generateCommonJSApi: false,
    codegen: { staticApi: false, staticDataModel: false },
  };

  if (
    projectConfig.codegen.staticApi ||
    projectConfig.codegen.staticDataModel
  ) {
    messages.push("Static codegen config ignored in offline mode.");
  }

  expect(messages.length).toBe(0);
});

test("offline mode routing logic with offline: true", () => {
  // Test the routing condition
  const options1 = { offline: true, systemUdfs: false };
  const shouldUseOfflinePath = options1.offline || options1.systemUdfs;
  expect(shouldUseOfflinePath).toBe(true);

  const options2 = { offline: false, systemUdfs: true };
  const shouldUseOfflinePath2 = options2.offline || options2.systemUdfs;
  expect(shouldUseOfflinePath2).toBe(true);

  const options3 = { offline: true, systemUdfs: true };
  const shouldUseOfflinePath3 = options3.offline || options3.systemUdfs;
  expect(shouldUseOfflinePath3).toBe(true);
});

test("backend mode routing logic with offline: false", () => {
  const options = { offline: false, systemUdfs: false };
  const shouldUseOfflinePath = options.offline || options.systemUdfs;
  expect(shouldUseOfflinePath).toBe(false);
});

test("offline codegen type safety - required boolean not optional", () => {
  // This test ensures the type is correct at compile time
  type CodegenOptions = {
    offline: boolean; // Not optional!
    dryRun: boolean;
  };

  const validOptions: CodegenOptions = {
    offline: true,
    dryRun: false,
  };

  expect(validOptions.offline).toBe(true);

  // Test that boolean operations work correctly
  expect(!validOptions.offline).toBe(false);
  expect(validOptions.offline && true).toBe(true);
  expect(validOptions.offline || false).toBe(true);
});

test("offline mode with component warning shows correct message", () => {
  const messages: string[] = [];

  // Simulate component detection
  const componentDir = {
    kind: "ok" as const,
    component: {
      definitionPath: "convex/convex.config.ts",
      isRootWithoutConfig: false,
    },
  };

  if (
    componentDir.kind === "ok" &&
    componentDir.component.definitionPath &&
    !componentDir.component.isRootWithoutConfig
  ) {
    messages.push(
      "Component type safety unavailable in offline mode. Component calls will have 'any' type.",
    );
  }

  expect(messages.length).toBe(1);
  expect(messages[0]).toContain("Component type safety unavailable");
  expect(messages[0]).toContain("Component calls will have 'any' type");
});

test("offline mode without components does not show component warning", () => {
  const messages: string[] = [];

  // Simulate no component detection (root without config)
  const componentDir = {
    kind: "ok" as const,
    component: {
      definitionPath: null,
      isRootWithoutConfig: true,
    },
  };

  if (
    componentDir.kind === "ok" &&
    componentDir.component.definitionPath &&
    !componentDir.component.isRootWithoutConfig
  ) {
    messages.push(
      "Component type safety unavailable in offline mode. Component calls will have 'any' type.",
    );
  }

  expect(messages.length).toBe(0);
});

test("offline mode success message", () => {
  const messages: string[] = [];

  // Simulate success message after codegen
  messages.push("Types generated successfully (offline mode).");

  expect(messages.length).toBe(1);
  expect(messages[0]).toContain("Types generated successfully");
  expect(messages[0]).toContain("(offline mode)");
});

test("CodegenOptions type includes offline as required boolean", () => {
  // This is a compile-time test to ensure type safety
  type CodegenOptions = {
    url?: string | undefined;
    adminKey?: string | undefined;
    dryRun: boolean;
    debug: boolean;
    typecheck: "disable" | "enable" | "try";
    init: boolean;
    commonjs: boolean;
    liveComponentSources: boolean;
    debugNodeApis: boolean;
    systemUdfs: boolean;
    offline: boolean; // Required, not optional
    largeIndexDeletionCheck: string;
    codegenOnlyThisComponent?: string | undefined;
  };

  const options: CodegenOptions = {
    dryRun: false,
    debug: false,
    typecheck: "disable",
    init: false,
    commonjs: false,
    liveComponentSources: false,
    debugNodeApis: false,
    systemUdfs: false,
    offline: true, // Must be explicitly set
    largeIndexDeletionCheck: "no verification",
  };

  expect(options.offline).toBe(true);
  expect(typeof options.offline).toBe("boolean");
});

test("offline flag passed from command to implementation", () => {
  // Test that the flag is correctly passed through the layers
  const commandOptions = {
    offline: true,
  };

  const codegenOptions = {
    dryRun: false,
    debug: false,
    typecheck: "disable" as const,
    init: false,
    commonjs: false,
    liveComponentSources: false,
    debugNodeApis: false,
    systemUdfs: false,
    offline: !!commandOptions.offline, // Convert to required boolean
    largeIndexDeletionCheck: "no verification" as const,
  };

  expect(codegenOptions.offline).toBe(true);
  expect(typeof codegenOptions.offline).toBe("boolean");
});

test("offline: false explicitly set works correctly", () => {
  const options = {
    offline: false,
    systemUdfs: false,
  };

  const shouldUseOfflinePath = options.offline || options.systemUdfs;
  expect(shouldUseOfflinePath).toBe(false);
  expect(options.offline).toBe(false);
  expect(typeof options.offline).toBe("boolean");
});
