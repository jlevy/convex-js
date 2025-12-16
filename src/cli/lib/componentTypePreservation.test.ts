import { describe, test, expect } from "vitest";
import {
  extractComponentTypes,
  extractComponentTypeAnnotation,
  hasRealComponentTypes,
  isDeclarationFile,
} from "./componentTypePreservation.js";

describe("extractComponentTypes", () => {
  test("extracts real component types from api.d.ts", () => {
    const content = `
import type { FilterApi, FunctionReference } from "convex/server";

export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
export declare const components: {
  rateLimiter: {
    lib: {
      checkRateLimit: FunctionReference<"query", "internal", { name: string }, boolean>;
    };
  };
};
`;
    const result = extractComponentTypes(content);
    expect(result).not.toBeNull();
    expect(result).toContain("components");
    expect(result).toContain("rateLimiter");
    expect(result).toContain("checkRateLimit");
  });

  test("returns null for AnyComponents stub", () => {
    const content = `
import type { AnyComponents, FilterApi, FunctionReference } from "convex/server";

export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
export declare const components: AnyComponents;
`;
    const result = extractComponentTypes(content);
    expect(result).toBeNull();
  });

  test("returns null for qualified AnyComponents stub (convex.AnyComponents)", () => {
    const content = `
import * as convex from "convex/server";

export declare const api: convex.FilterApi<typeof fullApi, convex.FunctionReference<any, "public">>;
export declare const components: convex.AnyComponents;
`;
    const result = extractComponentTypes(content);
    expect(result).toBeNull();
  });

  test("returns null when no components export exists", () => {
    const content = `
import type { FilterApi, FunctionReference } from "convex/server";

export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
`;
    const result = extractComponentTypes(content);
    expect(result).toBeNull();
  });

  test("handles multi-line nested component types", () => {
    const content = `
export declare const components: {
  rateLimiter: {
    lib: {
      checkRateLimit: FunctionReference<
        "query",
        "internal",
        {
          config:
            | { kind: "token bucket"; rate: number; period: number }
            | { kind: "fixed window"; rate: number; period: number };
          name: string;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      clearAll: FunctionReference<"mutation", "internal", { before?: number }, null>;
    };
  };
  actionCache: {
    lib: {
      get: FunctionReference<"query", "internal", { name: string; args: any }, any>;
      put: FunctionReference<"mutation", "internal", { name: string; value: any }, void>;
    };
  };
};
`;
    const result = extractComponentTypes(content);
    expect(result).not.toBeNull();
    expect(result).toContain("rateLimiter");
    expect(result).toContain("actionCache");
    expect(result).toContain("checkRateLimit");
    expect(result).toContain("clearAll");
  });

  test("handles empty component types object", () => {
    const content = `
export declare const components: {};
`;
    const result = extractComponentTypes(content);
    expect(result).not.toBeNull();
    expect(result).toContain("components");
  });

  test("does not extract non-component exports", () => {
    const content = `
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
export declare const someOtherExport: { foo: string };
`;
    const result = extractComponentTypes(content);
    expect(result).toBeNull();
  });

  test("handles .ts file format with assignment", () => {
    const content = `
import { anyApi, componentsGeneric } from "convex/server";

export const api = anyApi as any;
export const internal = anyApi as any;
export const components: {
  rateLimiter: { lib: { check: FunctionReference<"query", "internal", {}, boolean> } };
} = componentsGeneric();
`;
    const result = extractComponentTypes(content);
    // Should extract type annotation even from .ts file
    expect(result).not.toBeNull();
    expect(result).toContain("components");
    expect(result).toContain("rateLimiter");
  });

  test("handles components with generic type parameters", () => {
    const content = `
export declare const components: {
  auth: {
    lib: {
      getUser: FunctionReference<"query", "internal", Record<string, never>, User | null>;
    };
  };
};
`;
    const result = extractComponentTypes(content);
    expect(result).not.toBeNull();
    expect(result).toContain("auth");
    expect(result).toContain("getUser");
  });
});

describe("hasRealComponentTypes", () => {
  test("returns true for real component types with nested objects", () => {
    const decl = `export declare const components: { rateLimiter: { lib: { check: FunctionReference } } };`;
    expect(hasRealComponentTypes(decl)).toBe(true);
  });

  test("returns true for empty object type", () => {
    const decl = `export declare const components: {};`;
    expect(hasRealComponentTypes(decl)).toBe(true);
  });

  test("returns false for null", () => {
    expect(hasRealComponentTypes(null)).toBe(false);
  });

  test("returns false for AnyComponents type", () => {
    const decl = `export declare const components: AnyComponents;`;
    expect(hasRealComponentTypes(decl)).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(hasRealComponentTypes("")).toBe(false);
  });

  // Edge case: type reference (not object literal) should return false
  test("returns false for type reference that is not AnyComponents", () => {
    const decl = `export declare const components: SomeOtherType;`;
    expect(hasRealComponentTypes(decl)).toBe(false);
  });

  // Edge case: generic type reference should return false
  test("returns false for generic type reference", () => {
    const decl = `export declare const components: ComponentTypes<MyApp>;`;
    expect(hasRealComponentTypes(decl)).toBe(false);
  });
});

describe("isDeclarationFile", () => {
  test("returns true for .d.ts content", () => {
    const content = `
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const components: { rateLimiter: {} };
`;
    expect(isDeclarationFile(content)).toBe(true);
  });

  test("returns false for .ts content", () => {
    const content = `
import { anyApi } from "convex/server";
export const api = anyApi as any;
export const components = componentsGeneric();
`;
    expect(isDeclarationFile(content)).toBe(false);
  });

  // Edge case: comment containing "export declare const" should not match
  test("returns false for .ts content with comment containing declare", () => {
    const content = `
// This file does NOT have export declare const - it's a .ts file
import { anyApi } from "convex/server";
export const api = anyApi as any;
`;
    expect(isDeclarationFile(content)).toBe(false);
  });

  // Edge case: string literal containing "export declare const" should not match
  test("returns false for .ts content with string literal containing declare", () => {
    const content = `
const example = "export declare const components: AnyComponents;";
export const api = anyApi as any;
`;
    expect(isDeclarationFile(content)).toBe(false);
  });
});

describe("extractComponentTypeAnnotation", () => {
  test("extracts type annotation from simple declaration", () => {
    const decl = `export declare const components: { rateLimiter: {} };`;
    const result = extractComponentTypeAnnotation(decl);
    expect(result).toBe("{\n    rateLimiter: {};\n}");
  });

  test("extracts type annotation from complex nested declaration", () => {
    const decl = `export declare const components: {
    rateLimiter: {
        lib: {
            checkRateLimit: FunctionReference<"query", "internal", { name: string; }, boolean>;
        };
    };
};`;
    const result = extractComponentTypeAnnotation(decl);
    expect(result).not.toBeNull();
    expect(result).toContain("rateLimiter");
    expect(result).toContain("checkRateLimit");
    expect(result).toContain("FunctionReference");
  });

  test("extracts type annotation from multi-component declaration", () => {
    const decl = `export declare const components: {
    rateLimiter: {
        lib: { check: FunctionReference<"query", "internal", {}, boolean>; };
    };
    actionCache: {
        lib: { get: FunctionReference<"query", "internal", {}, any>; };
    };
};`;
    const result = extractComponentTypeAnnotation(decl);
    expect(result).not.toBeNull();
    expect(result).toContain("rateLimiter");
    expect(result).toContain("actionCache");
  });

  test("returns null for null input", () => {
    expect(extractComponentTypeAnnotation(null)).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(extractComponentTypeAnnotation("")).toBeNull();
  });

  test("returns null for declaration without type annotation", () => {
    // This shouldn't happen in practice, but test the edge case
    const decl = `export declare const components;`;
    expect(extractComponentTypeAnnotation(decl)).toBeNull();
  });

  test("returns null for non-components declaration", () => {
    const decl = `export declare const api: FilterApi<typeof fullApi>;`;
    expect(extractComponentTypeAnnotation(decl)).toBeNull();
  });

  test("handles empty object type", () => {
    const decl = `export declare const components: {};`;
    const result = extractComponentTypeAnnotation(decl);
    expect(result).toBe("{}");
  });

  test("handles generic type parameters correctly", () => {
    const decl = `export declare const components: {
    auth: {
        lib: {
            getUser: FunctionReference<"query", "internal", Record<string, never>, User | null>;
        };
    };
};`;
    const result = extractComponentTypeAnnotation(decl);
    expect(result).not.toBeNull();
    expect(result).toContain("Record<string, never>");
    expect(result).toContain("User | null");
  });

  test("roundtrip: extractComponentTypes then extractComponentTypeAnnotation", () => {
    // Test that the two functions work together correctly
    const content = `
import type { FilterApi, FunctionReference } from "convex/server";

export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const components: {
  rateLimiter: {
    lib: {
      check: FunctionReference<"query", "internal", { name: string }, boolean>;
    };
  };
};
`;
    const fullDecl = extractComponentTypes(content);
    expect(fullDecl).not.toBeNull();

    const typeAnnotation = extractComponentTypeAnnotation(fullDecl);
    expect(typeAnnotation).not.toBeNull();
    expect(typeAnnotation).toContain("rateLimiter");
    expect(typeAnnotation).toContain("check");
    // Should NOT contain the declaration boilerplate
    expect(typeAnnotation).not.toContain("export");
    expect(typeAnnotation).not.toContain("declare");
    expect(typeAnnotation).not.toContain("const components");
  });
});
