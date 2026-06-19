#!/usr/bin/env node
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const packages = readdirSync('packages', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `packages/${entry.name}`)
  .filter((path) => existsSync(`${path}/package.json`))
  .filter((path) => {
    const pkg = JSON.parse(readFileSync(`${path}/package.json`, 'utf8'));
    return !pkg.private && typeof pkg.scripts?.build === 'string';
  });

if (packages.length === 0) {
  console.log('No packages to build.');
  process.exit(0);
}

for (const path of packages) {
  execFileSync('npm', ['run', 'build', '--workspace', path], { stdio: 'inherit' });
}
