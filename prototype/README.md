# RedSky — Interactive Prototype Package

RedSky is the internal operating system for RSM Capital: one workspace for relationships, investments, projects, government affairs and institutional knowledge, with an embedded AI assistant. This package contains the complete, working design prototype, ready to hand to Claude Code (or any engineer) to implement.

> **Confidential — RSM Capital internal.** Every person, company, figure, assessment score and news item in the prototype is illustrative sample data.

## Run it

No build step and no internet connection are needed (fonts fall back to system fonts when offline).

```bash
cd prototype
python3 -m http.server 8000     # or: npx serve .
# open http://localhost:8000/index.html
```

You can also open `prototype/index.html` directly in a browser.

URL options:

| Parameter | Values | Effect |
|---|---|---|
| `startAt` | `onboarding` (default), `home` | Skip straight to the home dashboard |
| `theme` | `light` (default), `dark` | Initial appearance |

Example: `index.html?startAt=home&theme=dark`. `identity.html` is the brand and component reference sheet.

## What's in the package

```
redsky-prototype/
├── README.md                 ← you are here
├── CLAUDE_CODE_BRIEF.md      ← paste-ready brief for starting implementation in Claude Code
├── docs/
│   ├── SPEC.md               ← full product + implementation spec (screens, logic, data model, rules)
│   └── screenshots/          ← key screens, captured from the running prototype
├── prototype/                ← standalone, runnable build
│   ├── index.html            ← the full prototype (onboarding → home dashboard)
│   ├── identity.html         ← RedSky identity & component sheet
│   ├── runtime/dc-runtime.js ← tiny renderer that runs the design-component format on React 18
│   ├── vendor/               ← React 18.3.1 + ReactDOM (production UMD)
│   └── assets/logos/         ← connector logos (Microsoft 365, Outlook, Teams, OneDrive, Todoist)
├── source/                   ← original design-canvas sources (unchanged)
│   ├── Main.dc.html          ← the prototype: template + styles + all logic
│   ├── Identity.dc.html
│   └── canvas.json
├── data/
│   └── sample-data.json      ← every sample record and config table, extracted from the source
└── design/
    ├── tokens.json / tokens.css   ← color, type and radius tokens (light + dark)
    ├── prototype-styles.css        ← the complete prototype stylesheet
    └── RSM_Brand_Guide.pdf         ← source brand guide (palette, typography)
```

## How the prototype is built

`source/Main.dc.html` is a single "Design Component" file. It has three parts:

1. **Styles**: one stylesheet, all colors as CSS variables, with light and dark themes.
2. **Template**: HTML with `{{holes}}`, `<sc-if>` conditionals and `<sc-for>` loops.
3. **Logic**: one class (`class Component extends DCLogic`) holding all state, sample data, the personalization engine and the event handlers. `renderVals()` returns everything the template needs.

`prototype/index.html` runs that same template and logic unchanged, through `runtime/dc-runtime.js` on React 18. **This is a prototype harness, not a production architecture.** The production app should be rebuilt as typed React components. `docs/SPEC.md §10` describes the recommended structure.

## Using this with Claude Code

1. Put this folder in (or next to) the RedSky repository. The roadmap starts from a Twenty CRM fork with a TypeScript/NestJS backend.
2. Start a session and paste the contents of `CLAUDE_CODE_BRIEF.md`.
3. Point Claude Code at `docs/SPEC.md` as the source of truth, `prototype/index.html` as the behavioral reference, and `docs/screenshots/` for visual fidelity.

## Known gaps

- **Logos.** There are no logos for AlphaSense, Harmonic, Carta, PitchBook, Gödel Terminal, LegiStorm, OpenSecrets, Plaud or Superhuman Mail; these show monograms. Add official brand assets to `prototype/assets/logos/` and the `logo` field in the integration table.
- **Simulated AI and connectors.** AI answers, assessment extraction and all connectors are simulated. Every connector is marked "Coming soon".
- **Session-only state.** Choices last until the page is reloaded; nothing persists.
- **Asset URLs in `source/`.** The `.dc.html` files reference logos as `/_blob/…` URLs, which only resolve on the design canvas. The standalone build rewrites them to `assets/logos/…`.
