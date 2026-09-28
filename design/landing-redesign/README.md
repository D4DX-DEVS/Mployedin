# Landing redesign artifacts

These three isolated prototypes explore a modern AI-era landing direction for MPLOYEDIN. They reuse the product's cobalt/cyan palette, rounded surface language, and Manrope typography without changing production components.

## Artifacts

1. **[01-ai-match-hero.html](./01-ai-match-hero.html)** — hero with explainable match signals, verification, and recommendation limits.
2. **[02-ai-workflow.html](./02-ai-workflow.html)** — role-specific professional/employer path with interactive workflow steps.
3. **[03-trust-explainer.html](./03-trust-explainer.html)** — provenance, privacy inputs, discoverability control, and stable proof content.

The shared [styles.css](./styles.css) contains responsive layout, logical spacing, focus states, touch-sized controls, and reduced-motion behavior. The [audit.md](./audit.md) records evidence, findings, scorecard, traceability, and the validation plan.

The prototypes are English, left-to-right review states with a `dir` hook and logical spacing ready for an Arabic/RTL pass. Their standalone font stack falls back to the browser's Manrope/system font; production should keep using the app's loaded `--font-manrope` token.

## Preview locally

From the repository root:

```bash
python3 -m http.server 3999 --directory design/landing-redesign
```

Then open:

- `http://localhost:3999/01-ai-match-hero.html`
- `http://localhost:3999/02-ai-workflow.html`
- `http://localhost:3999/03-trust-explainer.html`

These are review artifacts. AI scores, roles, statuses, counts, verification language, and privacy controls are illustrative requirements until connected to real product data, permissions, and consent rules.
