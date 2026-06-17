#!/usr/bin/env node
import { readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const packages = readdirSync('packages', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `packages/${entry.name}`)
  .filter((path) => existsSync(`${path}/package.json`));

if (packages.length === 0) {
  console.log('No packages to build.');
  process.exit(0);
}

// Shared packages must build before dependents (npm -ws order is not dependency-aware).
const ordered = [
  ...packages.filter((path) => path.endsWith('/core')),
  ...packages.filter((path) => !path.endsWith('/core')),
];

for (const path of ordered) {
  execFileSync('npm', ['run', 'build', '--workspace', path], { stdio: 'inherit' });
}
