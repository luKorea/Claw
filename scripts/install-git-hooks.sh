#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [[ -z "$repo_root" ]]; then
  echo "Git hooks install skipped: not inside a Git repository."
  exit 0
fi

cd "$repo_root"

if [[ ! -d ".githooks" ]]; then
  echo "Git hooks install skipped: .githooks directory is missing."
  exit 0
fi

if [[ -f ".githooks/pre-push" ]]; then
  chmod +x ".githooks/pre-push"
fi

git config core.hooksPath .githooks
echo "Git hooks installed: core.hooksPath=$(git config --get core.hooksPath)"
