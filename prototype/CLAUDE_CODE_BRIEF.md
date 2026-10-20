# Brief for Claude Code: implement RedSky onboarding and home

Copy everything below the line into a new Claude Code session that is opened in the RedSky repository, with this `redsky-prototype/` folder available.

---

You're implementing the first release of **RedSky**, RSM Capital's internal operating system, from an approved interactive prototype.

**Reference material** (in `redsky-prototype/`):

- `docs/SPEC.md` is the source of truth: screens, behavior, personalization logic, governance rules, data model and recommended structure. Read all of it before planning.
- `prototype/index.html` is the working behavioral reference. Serve the folder (`cd prototype && python3 -m http.server 8000`) and click through. `?startAt=home` skips onboarding.
- `source/Main.dc.html` is the full prototype source. The `<script type="text/x-dc">` block holds all logic: `recommend()`, `pack()`, `orderLayout()`, `wsApply()`, the AI answer builder, and every handler. The template above it shows the exact markup and copy.
- `docs/screenshots/` is the visual reference.
- `design/tokens.css`, `design/tokens.json` and `design/prototype-styles.css` are the design tokens and complete styles.
- `data/sample-data.json` has all sample records and config tables. Use them as seed and fixture data.
- `prototype/assets/logos/` holds the connector logos.

**What to build:**

1. A RedSky-native React + TypeScript front end following `docs/SPEC.md §10.2`.
   - Design-system primitives first: tokens, Button, Chip, Card, Switch, Segmented, Avatar, Icon, Drawer, Modal, Popover, Toast, ConfirmDialog.
   - Then the app shell: role-aware Sidebar, CommandBar, CommandPalette (⌘K) and AiPanel (⌘J).
2. The **9-step onboarding** (§4), including **Workstyle Intelligence** (§7) and its governance rules (§7.1).
3. The **home dashboard** (§5): 13 widgets, the widget registry, customize mode with drag, resize, hide and reset, detail levels, and view tabs.
4. **Meeting preparation** and **record preview** drawers, quick create, notifications, and the **Settings** modal, including My Workstyle (§6–7).
5. The **personalization logic** as pure, unit-tested functions ported from the prototype: `recommend`, `pack`, `orderLayout`, `wsApply`. Match the default layouts listed in §5.3.
6. Persist preferences per user through the backend. Use a mock API layer first, shaped like the §9 interfaces, seeded from `data/sample-data.json`.

**Rules you must keep:**

- **Confirmation for every change.** Any action that creates or changes records, tasks, drafts or sharing goes through a confirmation dialog and an audit-log hook. AI only proposes.
- **Recorded vs AI.** Recorded facts and AI-generated content stay visually distinct: neutral styling and a "Recorded" label for facts, Whisper-blue styling and an "AI suggested" label for AI.
- **Label anything that isn't real.** Sample, illustrative or simulated content is labeled. Connectors are all "Coming soon" with Notify me. Don't fake live integrations.
- **Workstyle data:** optional; consent before processing; private by default; sharing per scope with explicit consent and revocable; never used for ranking, performance evaluation, hiring or employment decisions; deletable while keeping settings; described as tendencies.
- **Accessibility:** real buttons, inputs and labels; ARIA states as in §10.4; AA contrast; reduced motion; a button alternative for every drag-and-drop action.

**How to work:**

- Start by proposing a plan and file structure for my approval. Then build in vertical slices: (1) design system + shell, (2) home + widgets, (3) overlays, (4) onboarding, (5) Workstyle, (6) settings.
- Write tests for the personalization functions. Compare each slice against `prototype/index.html` and the screenshots.
- Don't rebuild the prototype's `dc-runtime.js` template engine. It's a prototype harness only.
- Flag anything in the spec that conflicts with the existing Twenty fork, or that needs a backend decision, instead of guessing.
