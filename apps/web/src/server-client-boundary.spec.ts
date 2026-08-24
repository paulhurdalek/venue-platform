import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const appRoot = fileURLToPath(new URL('../app', import.meta.url));
const serverRouteFiles = new Set(['layout.tsx', 'loading.tsx', 'not-found.tsx', 'page.tsx']);

describe('server/client module boundary', () => {
  it('does not call exports from client modules in Server Component routes', () => {
    const violations = findFiles(appRoot)
      .filter((file) => serverRouteFiles.has(basename(file)))
      .flatMap(findClientExportCalls);

    expect(violations).toEqual([]);
  });
});

function findFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? findFiles(path)
      : ['.ts', '.tsx'].includes(extname(path))
        ? [path]
        : [];
  });
}

function findClientExportCalls(file: string): string[] {
  const source = sourceFile(file);
  if (hasUseClientDirective(source)) return [];

  const clientBindings = new Set<string>();
  const clientNamespaces = new Set<string>();

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const importedFile = resolveImport(file, statement.moduleSpecifier.text);
    if (!importedFile || !hasUseClientDirective(sourceFile(importedFile))) continue;

    const clause = statement.importClause;
    if (clause.isTypeOnly) continue;
    if (clause.name) clientBindings.add(clause.name.text);
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      clientNamespaces.add(clause.namedBindings.name.text);
    }
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        if (!element.isTypeOnly) clientBindings.add(element.name.text);
      }
    }
  }

  const violations: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const directCall =
        ts.isIdentifier(node.expression) && clientBindings.has(node.expression.text);
      const namespaceCall =
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        clientNamespaces.has(node.expression.expression.text);
      if (directCall || namespaceCall) {
        const position = source.getLineAndCharacterOfPosition(node.getStart(source));
        violations.push(`${relative(appRoot, file)}:${position.line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

function sourceFile(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function hasUseClientDirective(source: ts.SourceFile): boolean {
  const firstStatement = source.statements[0];
  return Boolean(
    firstStatement &&
    ts.isExpressionStatement(firstStatement) &&
    ts.isStringLiteral(firstStatement.expression) &&
    firstStatement.expression.text === 'use client',
  );
}

function resolveImport(importer: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(importer), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}
