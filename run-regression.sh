#!/usr/bin/env bash

# Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
# Proprietary and confidential. Unauthorized use is strictly prohibited.
# See LICENSE file in the project root for full license information.

# run-regression.sh

set -euo pipefail

REPO="CoveritLabs/coverit-regression-framework"
WORKFLOW_FILE="coverit-regression.yml"

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] <branch>

Trigger the CoverIt Regression workflow via GitHub Actions API.

Arguments:
  branch                    Branch to run the workflow on (required)

Options:
  -f, --feature <regex>     Feature name or file regex (featureRegex input)
  -s, --scenario <regex>    Scenario name regex (scenarioRegex input)
  -m, --marks <marks>       Comma-separated marks, e.g. @smoke,@checkout
  -h, --help                Show this help message

Environment:
  GITHUB_TOKEN              GitHub token with actions:write scope (required)

Examples:
  $(basename "$0") main
  $(basename "$0") my-branch -f checkout
  $(basename "$0") my-branch -f checkout -s "happy path"
  $(basename "$0") my-branch -m @smoke,@checkout
  $(basename "$0") my-branch -f checkout -s "happy path" -m @smoke
EOF
}

BRANCH=""
FEATURE_REGEX=""
SCENARIO_REGEX=""
MARKS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage; exit 0 ;;
    -f|--feature)
      FEATURE_REGEX="${2:?--feature requires a value}"; shift 2 ;;
    -s|--scenario)
      SCENARIO_REGEX="${2:?--scenario requires a value}"; shift 2 ;;
    -m|--marks)
      MARKS="${2:?--marks requires a value}"; shift 2 ;;
    -*)
      echo "Unknown option: $1"; usage; exit 1 ;;
    *)
      if [[ -z "$BRANCH" ]]; then
        BRANCH="$1"; shift
      else
        echo "Unexpected argument: $1"; usage; exit 1
      fi ;;
  esac
done

if [[ -z "$BRANCH" ]]; then
  echo "Error: branch is required."
  usage; exit 1
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "Error: GITHUB_TOKEN environment variable is not set."
  echo "Please set it to a GitHub token with actions:write scope."
  exit 1
fi

INPUTS="{}"

build_inputs() {
  local inputs="{}"
  [[ -n "$FEATURE_REGEX" ]]  && inputs=$(echo "$inputs" | jq --arg v "$FEATURE_REGEX"  '. + {featureRegex: $v}')
  [[ -n "$SCENARIO_REGEX" ]] && inputs=$(echo "$inputs" | jq --arg v "$SCENARIO_REGEX" '. + {scenarioRegex: $v}')
  [[ -n "$MARKS" ]]          && inputs=$(echo "$inputs" | jq --arg v "$MARKS"          '. + {marks: $v}')
  echo "$inputs"
}

INPUTS=$(build_inputs)

PAYLOAD=$(python3 - <<EOF
import json, sys

inputs = {}
feature  = """$FEATURE_REGEX"""
scenario = """$SCENARIO_REGEX"""
marks    = """$MARKS"""

if feature:  inputs["featureRegex"]  = feature
if scenario: inputs["scenarioRegex"] = scenario
if marks:    inputs["marks"]         = marks

print(json.dumps({"ref": """$BRANCH""", "inputs": inputs}))
EOF
)

echo "Triggering '$WORKFLOW_FILE' on branch '$BRANCH'..."
echo "Inputs: $(python3 -c "import json,sys; d=json.loads('''$PAYLOAD'''); print(json.dumps(d['inputs']))")"

HTTP_STATUS=$(curl -s -o /tmp/gh_response.json -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$REPO/actions/workflows/$WORKFLOW_FILE/dispatches" \
  -d "$PAYLOAD")

if [[ "$HTTP_STATUS" == "204" ]]; then
  echo "✓ Workflow triggered successfully."
  echo "  https://github.com/$REPO/actions"
else
  echo "✗ Failed (HTTP $HTTP_STATUS):"
  cat /tmp/gh_response.json
  exit 1
fi
