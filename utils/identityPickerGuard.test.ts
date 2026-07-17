import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const collectSourceFiles = (root: string): string[] => readdirSync(root).flatMap((entry) => {
  const path = join(root, entry);
  if (statSync(path).isDirectory()) return collectSourceFiles(path);
  return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [path] : [];
});

describe('identity picker canonical token guard', () => {
  it('does not construct legacy underscore identity option values in UI sources', () => {
    const projectRoot = process.cwd();
    const offenders = ['components', 'pages']
      .flatMap((directory) => collectSourceFiles(join(projectRoot, directory)))
      .filter((path) => /`(?:user|role)_\$\{/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(projectRoot, path));

    expect(offenders).toEqual([]);
  });
});
