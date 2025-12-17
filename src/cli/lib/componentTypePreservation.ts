/**
 * Component Type Preservation for Offline Codegen
 *
 * When running `npx convex codegen --offline`, this module extracts existing
 * component type declarations from previously generated api.d.ts files.
 * This allows offline mode to preserve full component type safety from
 * a previous backend-connected codegen run.
 *
 * Uses TypeScript Compiler API for robust parsing of type declarations.
 */

import ts from "typescript";

/**
 * Extracts the component type declaration from an existing api.d.ts file.
 * Uses TypeScript Compiler API for robust parsing.
 *
 * @param content - The content of the existing api.d.ts file
 * @returns The component declaration string, or null if not found or is AnyComponents
 */
export function extractComponentTypes(content: string): string | null {
  const sourceFile = ts.createSourceFile(
    "api.d.ts",
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

  for (const statement of sourceFile.statements) {
    if (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      // Check for both `export declare const` and `export const`
      const isDeclare = statement.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.DeclareKeyword,
      );

      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === "components") {
          // Check if it's AnyComponents (we don't want to preserve that)
          if (decl.type && ts.isTypeReferenceNode(decl.type)) {
            const typeName = decl.type.typeName;
            // Handle both simple identifier (AnyComponents) and qualified name (convex.AnyComponents)
            const typeNameText = ts.isIdentifier(typeName)
              ? typeName.text
              : ts.isQualifiedName(typeName)
                ? typeName.right.text
                : null;
            if (typeNameText === "AnyComponents") {
              return null; // Don't preserve AnyComponents stub
            }
          }

          // For .d.ts files, we want the declaration
          if (isDeclare) {
            return printer.printNode(
              ts.EmitHint.Unspecified,
              statement,
              sourceFile,
            );
          }

          // For .ts files with actual assignment, extract just the type annotation
          if (decl.type) {
            // Reconstruct as a declare statement for .d.ts output
            const typeText = printer.printNode(
              ts.EmitHint.Unspecified,
              decl.type,
              sourceFile,
            );
            return `export declare const components: ${typeText};`;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Checks if the given component declaration represents real component types
 * (not AnyComponents stub or other type references).
 *
 * Note: This uses string matching, which is safe because the input comes from
 * TypeScript's AST printer (via extractComponentTypes), ensuring consistent
 * output format. Real component types are always object type literals with `{`,
 * while stubs like AnyComponents or other type references never contain `{`.
 *
 * @param componentDecl - The component declaration string from extractComponentTypes
 * @returns true if the declaration contains real component types (object literal)
 */
export function hasRealComponentTypes(componentDecl: string | null): boolean {
  if (!componentDecl) return false;
  // Real component types are always object type literals, which contain `{`
  // Type references (like AnyComponents, SomeType, etc.) never contain `{`
  return (
    componentDecl.includes("{") && !componentDecl.includes("AnyComponents")
  );
}

/**
 * Extracts just the type annotation from a component declaration string.
 * Uses TypeScript Compiler API for robust parsing.
 *
 * Given input like:
 *   "export declare const components: { rateLimiter: { ... } };"
 * Returns:
 *   "{ rateLimiter: { ... } }"
 *
 * @param componentDecl - The full component declaration string from extractComponentTypes
 * @returns The type annotation string (without 'export declare const components:'), or null if parsing fails
 */
export function extractComponentTypeAnnotation(
  componentDecl: string | null,
): string | null {
  if (!componentDecl) return null;

  const sourceFile = ts.createSourceFile(
    "component.d.ts",
    componentDecl,
    ts.ScriptTarget.Latest,
    true,
  );

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.name.text === "components" &&
          decl.type
        ) {
          return printer.printNode(
            ts.EmitHint.Unspecified,
            decl.type,
            sourceFile,
          );
        }
      }
    }
  }
  return null;
}

/**
 * Checks if the content appears to be from a .d.ts file (declaration file)
 * vs a .ts file (implementation file).
 *
 * Uses TypeScript AST to check for actual `export declare` statements,
 * ignoring comments and string literals.
 */
export function isDeclarationFile(content: string): boolean {
  const sourceFile = ts.createSourceFile(
    "check.ts",
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  // Look for any variable statement with both export and declare modifiers
  for (const statement of sourceFile.statements) {
    if (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      ) &&
      statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)
    ) {
      return true;
    }
  }
  return false;
}
