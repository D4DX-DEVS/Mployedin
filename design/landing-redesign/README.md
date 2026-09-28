# Landing redesign artifacts

These three isolated prototypes explore a modern AI-era landing direction for MPLOYEDIN. They reuse the product's cobalt/cyan palette, rounded surface language, and Manrope typography without changing production components.

## Artifacts

1. **[01-ai-match-hero.html](./01-ai-match-hero.html)** — hero with explainable match signals, verification, and recommendation limits.
2. **[02-ai-workflow.html](./02-ai-workflow.html)** — role-specific professional/employer path with interactive workflow steps.
3. **[03-trust-explainer.html](./03-trust-explainer.html)** — provenance, privacy inputs, discoverability control, and stable proof content.

The shared [styles.css](./styles.css) contains responsive layout, focus states, touch-sized controls, and reduced-motion behavior. The [audit.md](./audit.md) records evidence, findings, scorecard, traceability, and the validation plan.

## Preview locally

From the repository root:

```bash
python3 -m http.server 3999 --directory design/landing-redesign
```

Then open:

- `http://localhost:3999/01-ai-match-hero.html`
- `http://localhost:3999/02-ai-workflow.html`
- `http://localhost:3999/03-trust-explainer.html`

These are review artifacts. AI scores, roles, statuses, and counts are illustrative until connected to real product data and consent rules.
