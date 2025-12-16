"use strict";
import { header } from "./common.js";
export function importPath(modulePath) {
  const filePath = modulePath.replace(/\\/g, "/");
  const lastDot = filePath.lastIndexOf(".");
  return filePath.slice(0, lastDot === -1 ? void 0 : lastDot);
}
export function moduleIdentifier(modulePath) {
  let safeModulePath = importPath(modulePath).replace(/\//g, "_").replace(/-/g, "_");
  if (["fullApi", "api", "internal", "components"].includes(safeModulePath)) {
    safeModulePath = `${safeModulePath}_`;
  }
  const reserved = [
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "new",
    "null",
    "return",
    "super",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "let",
    "static",
    "yield",
    "await",
    "enum",
    "implements",
    "interface",
    "package",
    "private",
    "protected",
    "public"
  ];
  if (reserved.includes(safeModulePath)) {
    safeModulePath = `${safeModulePath}_`;
  }
  return safeModulePath;
}
export function apiCodegen(modulePaths, opts) {
  const useTypeScript = opts?.useTypeScript ?? false;
  const includeComponentsStub = opts?.includeComponentsStub ?? false;
  if (!useTypeScript) {
    const componentsImport = includeComponentsStub ? ", AnyComponents" : "";
    const componentsExportDTS = includeComponentsStub ? "\nexport declare const components: AnyComponents;" : "";
    const componentsExportJS = includeComponentsStub ? `
import { componentsGeneric } from "convex/server";
export const components = componentsGeneric();` : "";
    const apiDTS = `${header("Generated `api` utility.")}
  import type { ApiFromModules, FilterApi, FunctionReference${componentsImport} } from "convex/server";
  ${modulePaths.map(
      (modulePath) => `import type * as ${moduleIdentifier(modulePath)} from "../${importPath(
        modulePath
      )}.js";`
    ).join("\n")}

  /**
   * A utility for referencing Convex functions in your app's API.
   *
   * Usage:
   * \`\`\`js
   * const myFunctionReference = api.myModule.myFunction;
   * \`\`\`
   */
  declare const fullApi: ApiFromModules<{
    ${modulePaths.map(
      (modulePath) => `"${importPath(modulePath)}": typeof ${moduleIdentifier(modulePath)},`
    ).join("\n")}
  }>;
  export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
  export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;${componentsExportDTS}
  `;
    const apiJS = `${header("Generated `api` utility.")}
  import { anyApi } from "convex/server";

  /**
   * A utility for referencing Convex functions in your app's API.
   *
   * Usage:
   * \`\`\`js
   * const myFunctionReference = api.myModule.myFunction;
   * \`\`\`
   */
  export const api = anyApi;
  export const internal = anyApi;${componentsExportJS}
  `;
    return {
      DTS: apiDTS,
      JS: apiJS
    };
  } else {
    const componentsImportTS = includeComponentsStub ? ", AnyComponents" : "";
    const componentsImportRuntimeTS = includeComponentsStub ? ", componentsGeneric" : "";
    const componentsExportTS = includeComponentsStub ? `

export const components: AnyComponents = componentsGeneric();` : "";
    const apiTS = `${header("Generated `api` utility.")}
import type { ApiFromModules, FilterApi, FunctionReference${componentsImportTS} } from "convex/server";
import { anyApi${componentsImportRuntimeTS} } from "convex/server";
${modulePaths.map(
      (modulePath) => `import type * as ${moduleIdentifier(modulePath)} from "../${importPath(
        modulePath
      )}.js";`
    ).join("\n")}

const fullApi: ApiFromModules<{
  ${modulePaths.map(
      (modulePath) => `"${importPath(modulePath)}": typeof ${moduleIdentifier(modulePath)},`
    ).join("\n")}
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * \`\`\`js
 * const myFunctionReference = api.myModule.myFunction;
 * \`\`\`
 */
export const api: FilterApi<typeof fullApi, FunctionReference<any, "public">> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * \`\`\`js
 * const myFunctionReference = internal.myModule.myFunction;
 * \`\`\`
 */
export const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">> = anyApi as any;${componentsExportTS}
`;
    return {
      TS: apiTS
    };
  }
}
//# sourceMappingURL=api.js.map
