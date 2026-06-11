#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];

if (!version || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
  console.error('Usage: node scripts/sync-release-version.mjs X.Y.Z');
  process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');

const files = {
  packageJson: join(repoRoot, 'package.json'),
  cargoToml: join(repoRoot, 'src-tauri', 'Cargo.toml'),
  cargoLock: join(repoRoot, 'src-tauri', 'Cargo.lock'),
};

function writePackageVersion() {
  const raw = readFileSync(files.packageJson, 'utf8');
  const data = JSON.parse(raw);
  data.version = version;
  writeFileSync(files.packageJson, `${JSON.stringify(data, null, 2)}\n`);
}

function writeCargoTomlVersion() {
  const raw = readFileSync(files.cargoToml, 'utf8');
  const pattern = /(^\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m;

  if (!pattern.test(raw)) {
    throw new Error('Could not find [package] version in src-tauri/Cargo.toml');
  }

  const next = raw.replace(pattern, `$1${version}$3`);
  writeFileSync(files.cargoToml, next);
}

function writeCargoLockVersion() {
  const raw = readFileSync(files.cargoLock, 'utf8');
  const pattern = /(\[\[package\]\]\nname = "claw-client"\nversion = ")([^"]+)(")/;

  if (!pattern.test(raw)) {
    throw new Error('Could not find claw-client package version in src-tauri/Cargo.lock');
  }

  const next = raw.replace(pattern, `$1${version}$3`);
  writeFileSync(files.cargoLock, next);
}

writePackageVersion();
writeCargoTomlVersion();
writeCargoLockVersion();
