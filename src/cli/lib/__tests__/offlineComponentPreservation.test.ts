import { describe, expect, test } from "vitest";
import { extractComponentTypes, hasRealComponentTypes } from "../componentTypePreservation.js";

describe("offline component preservation post-pass", () => {
  test("preserves existing component types when stub is emitted", () => {
    const preserved = `export declare const components: {
  rateLimiter: { lib: { checkRateLimit: FunctionReference<"query", "internal", { name: string }, boolean>; }; };
};`;

    const generatedWithStub = `
import type { ApiFromModules, FilterApi, FunctionReference, AnyComponents } from "convex/server";
declare const fullApi: ApiFromModules<{}>;
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
export declare const components: AnyComponents;
`;

    const preservedDecl = extractComponentTypes(preserved);
    expect(hasRealComponentTypes(preservedDecl)).toBe(true);

    const replaced = generatedWithStub.replace(
      "export declare const components: AnyComponents;",
      preserved.trim(),
    );
    expect(replaced).toContain("rateLimiter");
    // Allow AnyComponents import to remain; ensure the declaration is preserved.
    const preservedDeclText = preserved.trim();
    expect(replaced).toContain(preservedDeclText);
  });
});

