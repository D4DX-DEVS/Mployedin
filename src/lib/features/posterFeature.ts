/**
 * AI poster generation (employer poster maker + public /poster/[slug] share page).
 *
 * Hidden 2026-10-15: the owner is not using posters for now. Every page answers
 * 404, every poster API answers 404 (see posterGate.ts), and the buttons,
 * legacy redirects and post-success toast action are hidden. Nothing is
 * deleted: set this to `true` to bring the whole feature back.
 *
 * Kept free of imports so client components can read it.
 */
export const POSTERS_ENABLED = false;
