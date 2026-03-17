#!/usr/bin/env bash

set -euo pipefail

fixture_slug="transformer-review"
api_base=""
paper_id=""
slug=""
label=""
description=""
max_papers=""
expand_id=""
update_snapshots="0"

usage() {
  cat <<'EOF'
Usage:
  npm run review:loop -- [--fixture transformer-review]
  npm run review:loop -- --paper-id PAPER_ID --slug fixture-name [--api http://127.0.0.1:8000]

Options:
  --fixture           Existing fixture slug to review. Default: transformer-review
  --paper-id          Generate a live fixture before running Playwright
  --slug              Output slug for generated fixture
  --api               Backend API base URL. Default: http://127.0.0.1:8000
  --label             Label for generated fixture
  --description       Description for generated fixture
  --max-papers        Max papers for live fixture generation
  --expand-id         Optional expand target for live fixture generation
  --update-snapshots  Pass through to Playwright
  --help              Show this message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fixture)
      fixture_slug="$2"
      shift 2
      ;;
    --paper-id)
      paper_id="$2"
      shift 2
      ;;
    --slug)
      slug="$2"
      shift 2
      ;;
    --api)
      api_base="$2"
      shift 2
      ;;
    --label)
      label="$2"
      shift 2
      ;;
    --description)
      description="$2"
      shift 2
      ;;
    --max-papers)
      max_papers="$2"
      shift 2
      ;;
    --expand-id)
      expand_id="$2"
      shift 2
      ;;
    --update-snapshots)
      update_snapshots="1"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "[review:loop] unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -n "$paper_id" || -n "$slug" ]]; then
  if [[ -z "$paper_id" || -z "$slug" ]]; then
    echo "[review:loop] --paper-id and --slug must be provided together" >&2
    usage
    exit 1
  fi

  generator_args=(./scripts/generate-live-review-fixture.mjs --paper-id "$paper_id" --slug "$slug")
  [[ -n "$api_base" ]] && generator_args+=(--api "$api_base")
  [[ -n "$label" ]] && generator_args+=(--label "$label")
  [[ -n "$description" ]] && generator_args+=(--description "$description")
  [[ -n "$max_papers" ]] && generator_args+=(--max-papers "$max_papers")
  [[ -n "$expand_id" ]] && generator_args+=(--expand-id "$expand_id")

  echo "[review:loop] generating live fixture \"$slug\""
  node "${generator_args[@]}"
  fixture_slug="$slug"
fi

review_run_id="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
playwright_output_dir="test-results/${fixture_slug}-${review_run_id}"
playwright_args=(test -c playwright.config.ts --output "$playwright_output_dir")
[[ "$update_snapshots" == "1" ]] && playwright_args+=(--update-snapshots)

echo "[review:loop] running Playwright with fixture \"$fixture_slug\""
echo "[review:loop] screenshots will be stored under ${playwright_output_dir}/"

node -e "require('fs').writeFileSync('/tmp/scholargraph3d-review-loop.json', JSON.stringify({ fixture: process.argv[1], runId: process.argv[2] }))" "$fixture_slug" "$review_run_id"

cleanup() {
  rm -f /tmp/scholargraph3d-review-loop.json
}

trap cleanup EXIT

./node_modules/.bin/playwright "${playwright_args[@]}"
