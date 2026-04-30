#!/usr/bin/env bash
# scripts/auditAppCheck.sh
# T1 — Sprint 1
#
# Audit App Check enforcement readiness by counting VERIFIED vs UNVERIFIED
# log entries from monitorAppCheck() over a configurable window.
#
# Usage:
#   ./scripts/auditAppCheck.sh                # default 7d window
#   ./scripts/auditAppCheck.sh 14d            # custom window
#
# Requires: gcloud CLI authenticated against project samaye-53723.
# The threshold for safe enforcement is < 0.5% UNVERIFIED on every CF.

set -euo pipefail

PROJECT_ID="${SUIVIBABY_PROJECT_ID:-samaye-53723}"
WINDOW="${1:-7d}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI not found. Install it from https://cloud.google.com/sdk/docs/install" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found. Install with: brew install jq" >&2
  exit 1
fi

echo "Auditing App Check logs for project=${PROJECT_ID} over window=${WINDOW}"
echo "Threshold for safe enforcement: < 0.5% UNVERIFIED per function"
echo ""

TMP_FILE="$(mktemp)"
trap 'rm -f "${TMP_FILE}"' EXIT

gcloud logging read \
  '(textPayload:"[AppCheck]") AND (textPayload:"VERIFIED" OR textPayload:"UNVERIFIED")' \
  --project="${PROJECT_ID}" \
  --freshness="${WINDOW}" \
  --limit=10000 \
  --format=json \
  > "${TMP_FILE}"

TOTAL="$(jq 'length' "${TMP_FILE}")"
if [[ "${TOTAL}" -eq 0 ]]; then
  echo "No App Check log entries found in the window — nothing to audit."
  exit 0
fi

echo "Total log entries: ${TOTAL}"
echo ""
printf "%-32s %10s %10s %10s\n" "FUNCTION" "VERIFIED" "UNVERIFIED" "%UNVERIFIED"
printf "%-32s %10s %10s %10s\n" "--------------------------------" "----------" "----------" "----------"

# Extract: function name (token after the colon in "[AppCheck] <fn>:") +
# verification state (VERIFIED|UNVERIFIED). Aggregate counts in jq.
jq -r '
  .[]
  | (.textPayload // .jsonPayload.message // "")
  | capture("\\[AppCheck\\] (?<fn>[^:]+): (?<status>VERIFIED|UNVERIFIED)")
  | "\(.fn)\t\(.status)"
' "${TMP_FILE}" \
  | sort \
  | uniq -c \
  | awk '
{
  count=$1
  fn=$2
  status=$3
  totals[fn] += count
  if (status == "VERIFIED")    verified[fn] += count
  if (status == "UNVERIFIED") unverified[fn] += count
}
END {
  any_warn = 0
  for (fn in totals) {
    v = (verified[fn]   ? verified[fn]   : 0)
    u = (unverified[fn] ? unverified[fn] : 0)
    pct = (totals[fn] > 0) ? (u * 100.0 / totals[fn]) : 0
    flag = (pct >= 0.5) ? " ⚠" : ""
    printf "%-32s %10d %10d %9.2f%%%s\n", fn, v, u, pct, flag
    if (pct >= 0.5) any_warn = 1
  }
  printf "\n"
  if (any_warn) {
    print "STATUS: NOT READY — at least one function has >= 0.5% UNVERIFIED."
    print "        Resolve before flipping APPCHECK_ENFORCE=true."
    exit 1
  } else {
    print "STATUS: READY — all functions below the 0.5% UNVERIFIED threshold."
    print "        Safe to deploy with APPCHECK_ENFORCE=true on critical CFs."
  }
}
'
