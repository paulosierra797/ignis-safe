#!/usr/bin/env bash
# One-time: capture 3-run Lighthouse baselines for every audited route.
# Dev tooling for perf/lighthouse-optimization — removed at the end.
set -u
# Git Bash mangles "/foo" args into Windows paths — keep our route paths literal.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'
cd "$(dirname "$0")/.."

PERS="C:/Users/Asus/AppData/Local/Temp/claude/lh-prof-personnel-1"
ADMIN="C:/Users/Asus/AppData/Local/Temp/claude/lh-prof-admin-1"
LABEL="${1:-baseline}"

echo "=== PUBLIC ($LABEL) ==="
node scripts/lh-audit.mjs --runs 3 --label "${LABEL}-public" \
  --url "Landing Page=/" \
  --url "Organizational Chart public=/organizational-chart" \
  --url "Terms=/terms" \
  --url "Privacy=/privacy" \
  --url "Send Message=/send-message" \
  --url "Attendance Login public=/attendance-login"

echo "=== PERSONNEL ($LABEL) ==="
node scripts/lh-audit.mjs --runs 3 --label "${LABEL}-personnel" --profile "$PERS" \
  --url "Personnel - Announcements=/personnel/announcements" \
  --url "Personnel - Shift Schedule=/personnel/operations" \
  --url "Personnel - Profile=/personnel/profile" \
  --url "Personnel - Attendance=/attendance-personnel" \
  --url "Personnel - Reports=/reports" \
  --url "Personnel - Audit Logs=/personnel/history"

echo "=== ADMIN ($LABEL) ==="
node scripts/lh-audit.mjs --runs 3 --label "${LABEL}-admin" --profile "$ADMIN" \
  --url "Admin Organization Chart=/dashboard/chart" \
  --url "Admin Assessment Questions=/dashboard/assessment-questions" \
  --url "Admin Messages=/dashboard/visitor-messages" \
  --url "Admin About Us Content=/dashboard/about-us" \
  --url "Admin Personnel Mgmt=/dashboard/accounts" \
  --url "Admin Users=/dashboard/users" \
  --url "Admin Attendance=/attendance-admin" \
  --url "Admin Dashboard=/dashboard"

echo "=== DONE ($LABEL) ==="
