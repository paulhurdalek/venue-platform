import { randomUUID } from 'node:crypto';
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const isolatedE2eDistDirectory = /^\.next-e2e-[a-z0-9-]+$/;
const isolatedE2eTypeScriptConfig = /^tsconfig\.e2e-[a-z0-9-]+\.json$/;

export function createE2eNextDistDirectoryName() {
  return `.next-e2e-${process.pid}-${randomUUID()}`;
}

export function createE2eTypeScriptConfigName(e2eNextDistDirectoryName) {
  if (!isolatedE2eDistDirectory.test(e2eNextDistDirectoryName)) {
    throw new Error('Cannot derive an E2E TypeScript config from an unsafe directory name.');
  }
  return `tsconfig.e2e-${e2eNextDistDirectoryName.slice('.next-e2e-'.length)}.json`;
}

export function resolveE2eNextDistDirectory(webDirectory, directoryName) {
  if (!isolatedE2eDistDirectory.test(directoryName)) {
    throw new Error('Refusing to use a non-isolated Next.js E2E directory.');
  }
  const resolvedDirectory = resolve(webDirectory, directoryName);
  const relativeDirectory = relative(webDirectory, resolvedDirectory);
  if (
    !relativeDirectory ||
    isAbsolute(relativeDirectory) ||
    relativeDirectory === '..' ||
    relativeDirectory.startsWith(`..${sep}`)
  ) {
    throw new Error('The Next.js E2E directory must remain inside apps/web.');
  }
  return resolvedDirectory;
}

export async function removeE2eNextDistDirectory(webDirectory, directoryName) {
  const directory = resolveE2eNextDistDirectory(webDirectory, directoryName);
  await rm(directory, { force: true, maxRetries: 10, recursive: true, retryDelay: 200 });
}

export function resolveE2eTypeScriptConfig(webDirectory, fileName) {
  if (!isolatedE2eTypeScriptConfig.test(fileName)) {
    throw new Error('Refusing to use a non-isolated Next.js E2E TypeScript config.');
  }
  return resolve(webDirectory, fileName);
}

export async function createE2eTypeScriptConfig(webDirectory, fileName) {
  const source = resolve(webDirectory, 'tsconfig.json');
  const destination = resolveE2eTypeScriptConfig(webDirectory, fileName);
  await copyFile(source, destination);
}

export async function removeE2eTypeScriptConfig(webDirectory, fileName) {
  const file = resolveE2eTypeScriptConfig(webDirectory, fileName);
  await rm(file, { force: true });
}

export async function snapshotFiles(paths) {
  return Promise.all(
    paths.map(async (path) => {
      try {
        return { content: await readFile(path), existed: true, path };
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          return { content: undefined, existed: false, path };
        }
        throw error;
      }
    }),
  );
}

export async function restoreFileSnapshots(snapshots, expectedTemporaryMarker) {
  await Promise.all(
    snapshots.map(async ({ content, existed, path }) => {
      let current;
      try {
        current = await readFile(path);
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
          throw error;
        }
      }
      if (existed && current?.equals(content)) return;
      if (!current?.toString('utf8').includes(expectedTemporaryMarker)) {
        throw new Error(
          `Refusing to overwrite an unexpectedly changed file during E2E cleanup: ${path}`,
        );
      }
      if (existed) await writeFile(path, content);
      else await rm(path, { force: true });
    }),
  );
}
