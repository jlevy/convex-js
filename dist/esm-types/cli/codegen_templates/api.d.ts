export declare function importPath(modulePath: string): string;
export declare function moduleIdentifier(modulePath: string): string;
export declare function apiCodegen(modulePaths: string[], opts?: {
    useTypeScript?: boolean;
    includeComponentsStub?: boolean;
    preservedComponentTypes?: string | undefined;
}): {
    DTS: string;
    JS: string;
    TS?: never;
} | {
    TS: string;
    DTS?: never;
    JS?: never;
};
//# sourceMappingURL=api.d.ts.map