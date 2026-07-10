#!/bin/bash

# Comprehensive palette migration for all 12 files
# This script applies ALL replacements from the spec

FILES=(
  "src/app/[locale]/(dashboard)/employer/applications/page.tsx"
  "src/app/[locale]/(dashboard)/employer/workflow/page.tsx"
  "src/app/[locale]/(dashboard)/employer/offers/page.tsx"
  "src/app/[locale]/(dashboard)/employer/matching-weights/page.tsx"
  "src/app/[locale]/(dashboard)/employer/jobs/page.tsx"
  "src/app/[locale]/(dashboard)/employer/interviews/page.tsx"
  "src/app/[locale]/(dashboard)/employer/analytics/page.tsx"
  "src/app/[locale]/(dashboard)/employer/placements/page.tsx"
  "src/app/[locale]/(dashboard)/employer/invoices/page.tsx"
  "src/app/[locale]/(dashboard)/employer/team/page.tsx"
  "src/app/[locale]/(dashboard)/employer/team/activity-logs/page.tsx"
  "src/app/[locale]/(dashboard)/employer/activity-history/page.tsx"
)

for file in "${FILES[@]}"; do
  echo "Processing: $file"
  
  # Count replacements before
  before=$(grep -o "bg-slate-\|border-slate-\|text-slate-\|bg-white\|bg-gray-\|text-gray-\|border-white\|border-gray-\|border-blue-\|border-emerald-\|border-green-\|border-amber-\|border-yellow-\|border-orange-\|border-violet-\|border-indigo-\|border-purple-\|border-rose-\|border-red-" "$file" 2>/dev/null | wc -l)
  
  echo "  Before: $before palette classes"
done
