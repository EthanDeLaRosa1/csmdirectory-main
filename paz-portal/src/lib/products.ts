// Canonical Copado product lines used to populate pre-scan product dropdowns.
// Must stay in sync with normalizeProduct() in
// supabase/functions/_shared/salesforce.ts (the backend's canonical names).
export const PRODUCT_OPTIONS = [
  "CICD",
  "CRT",
  "Agentia",
  "Testing",
  "Data Deploy",
  "Compliance",
  "VSM",
  "Essentials",
] as const;
