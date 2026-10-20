# RedSky — Product & Implementation Specification

Version: prototype handoff, October 19, 2026 · Owner: RSM Capital · Status: design prototype, approved for implementation planning

This document is the source of truth for implementing what the prototype shows. Where this spec and the prototype disagree, follow the spec and flag the difference. The prototype (`prototype/index.html`) is the behavioral reference, and `docs/screenshots/` is the visual reference.

---

## 1. Product vision

**One workspace. Every relationship. Every opportunity. All institutional knowledge.**

RedSky is RSM Capital's internal operating environment. CRM is one foundation inside it, not the whole product. Employees start their day in RedSky. There they see what they need to know, what needs their attention, who they should speak with, and which opportunities and projects are moving. An embedded AI assistant helps throughout.

The prototype covers the first-release experience:

1. A personalized **onboarding** flow in 9 steps.
2. An intelligent, customizable **home dashboard**.
3. Global surfaces: **command palette, RedSky AI panel, meeting preparation, record previews, settings, quick create**.
4. **Workstyle Intelligence**: an optional, assessment-informed personalization feature.
5. **Role-aware demo profiles** that show how the home page differs by role.

### Non-negotiable product principles

These apply everywhere and must survive implementation:

| Principle | What it means in the UI |
|---|---|
| **Permission-aware** | Search, AI and records only use data the employee is authorized to see, and the copy says so ("Only records you're authorized to access"). |
| **Human confirmation** | Any action that creates or changes records, tasks, drafts or sharing goes through a confirmation dialog. The dialog says the action is recorded in the audit log. AI proposes; people decide. |
| **Facts vs AI** | Recorded facts are neutral and labeled **Recorded**. AI-generated content sits on the Whisper-blue AI treatment and is labeled **AI suggested**, **Proposed adjustment**, etc. Never mix the two. |
| **Honest data states** | Sample or illustrative data is labeled. Features that aren't available say "Coming soon" or "Planned · Phase N". Nothing implies a live integration that doesn't exist. |
| **Confidentiality cues** | Show an "Internal" chip in the top bar, lock icons on private data, and disclosure notes for interactions with public officials. |
| **Employee control** | Recommendations, including workstyle-based ones, inform settings and never determine them. Every recommendation can be overridden or reverted. |

---

## 2. Brand & design system

The palette and typography come from the RSM Capital Visual Identity guide (`design/RSM_Brand_Guide.pdf`). All tokens are in `design/tokens.css` and `design/tokens.json`. The full prototype stylesheet is in `design/prototype-styles.css`.

### 2.1 Palette

| Brand color | Hex | RedSky role |
|---|---|---|
| Crimson | `#941B1E` | Primary accent: primary buttons, active states, priority |
| Coffee | `#5B332E` | Depth: welcome hero (`#231714`), avatars |
| Cactus | `#162F1C` | Positive states (derived `#2E6A45` text) |
| Leatherbound | `#78522B` | Warning states (derived `#8A5A1F` text) |
| Dust Cloud | `#EEEBDF` | Light ground family (`--bg #F7F5EF`); dark-mode text |
| Palomino | `#ECDCB9` | Highlights on dark surfaces |
| Whisper | `#CCD9E2` | **Reserved for AI**: AI backgrounds and borders (`--aib`, `--aibd`) |

The light theme uses warm off-white grounds and warm near-black text. The dark theme uses deep coffee-charcoal (`--bg #161210`). Text tokens meet WCAG AA contrast: `--tx3 #736961` on `--bg` is 4.9:1.

### 2.2 Typography

| Use | Typeface | Notes |
|---|---|---|
| Display: greetings, page titles, record titles, wordmark | **Faculty Glyphic** (the brand's "special use" face) | Weight 400 only. Letter-spacing −0.01em |
| UI and body | **Fira Sans** 400/500/600 (the brand's body face) | Base size 13.5px. Tabular numbers for data |
| Figures, keyboard hints, IDs | **Fira Mono** | |

The brand's headline faces (Taberna Serif, Macklin Slab, Westmount) aren't on Google Fonts. If RSM licenses them for web use, Macklin Slab can replace Faculty Glyphic for H2-level titles.

### 2.3 RedSky mark

An original mark: a crimson badge whose silhouette echoes RSM's alternate logo (a hexagon with gently peaked top and bottom edges). It holds a Dust Cloud serif "R" above a thin Palomino horizon line. The SVG appears inline throughout the source; search for `M4 7.4 16 4l12 3.4v17.2L16 28 4 24.6z`. The wordmark is "RedSky" in Faculty Glyphic with "RSM CAPITAL" in letter-spaced Fira Sans. The mark never replaces the RSM Capital primary logo.

### 2.4 Core components (class names in the prototype)

| Component | Classes | Notes |
|---|---|---|
| Buttons | `.btn`, `.btn-p` (primary crimson: white text, dark text on hover per stakeholder request), `.btn-g` (ghost), `.btn-ai` (AI action), `.btn-sm`, `.btn-lg`, `.btn-i` (icon-only, needs `aria-label`) | |
| Chips | `.chip`, `.chip-o`, `.chip-ai`, `.chip-ac`, `.chip-ok`, `.chip-wn` | Status and metadata |
| Status dot text | `.status .st-ok/.st-wn/.st-ac/.st-n` | Project and prep status |
| Cards | `.card`, `.wc` (widget card), `.rc` (relationship), `.pc` (project), `.mtg` (meeting), `.wsr` (workstyle recommendation) | Radius 10–12px, thin border, minimal shadow |
| Selectable cards | `.sel` with `aria-pressed`; `.opt` (pill option) | Onboarding choices |
| Switch | `.sw` with `role="switch" aria-checked` | |
| Segmented control | `.seg` with `aria-pressed` buttons | |
| AI surfaces | `.ai-box`, `.ai-tag`, `.tile-ai` | Whisper blue |
| Recorded label | `.rec-tag` | Neutral grey |
| Drawers, modals, popovers | `.drawer` (560px), `.drawer-w` (780px), `.modal` inside `.mwrap`, `.pop`, `.backdrop` | Esc closes the top-most layer |
| Toast | `.toast` | With optional Undo |
| Rows | `.row` (hover reveals `.hov` actions), `.trow` (table-like grid rows) | |
| Avatars | `.av` + tone `.av-0…5` | Initials fallback |
| Priority bars | `.pri[data-p=high/med/low]` | Three ascending bars |

**Icons** are 24×24 stroke icons (1.6px, round caps) defined as path strings in the `I` table (see `data/sample-data.json`, where icons appear as `icon:<name>`). Production can swap in Lucide, which closely matches this stroke style.

**Motion:** content enters with an 8px rise and fade (380ms), drawers slide in from the right (300ms), popovers pop (180ms). All of it respects `prefers-reduced-motion`.

**Responsive behavior:**

- **Desktop (≥1180px):** full 12-column widget grid.
- **Below 1180px:** 4-column widgets go to half width and 8-column widgets to full width.
- **Below 900px:** the sidebar becomes an off-canvas drawer (opened from the hamburger) and all widgets go full width.
- **Below 640px:** tables collapse to three columns and secondary controls hide.

---

## 3. Information architecture

### 3.1 Global layout (three zones)

- **Left: sidebar** (248px, collapsible to a 60px icon rail).
  - Top: RedSky mark, workspace name, the employee's avatar, and a collapse button.
  - Middle: grouped, collapsible navigation.
  - Bottom: Integrations, Settings, Help, and the profile row.
- **Top: command bar.**
  - Page title with an "Internal" chip.
  - Universal search button (⌘K).
  - New (quick create), Ask RedSky (⌘J), Notifications, theme toggle, Settings, avatar.
- **Center:** the page.
- **Right:** RedSky AI panel (440px) and drawers.

### 3.2 Navigation (role-adaptive)

| Group | Items (role filter) |
|---|---|
| Workspace | Home, Inbox (badge), My Tasks (live open count), Calendar, Meetings |
| Relationships | People, Companies, Organizations, Relationship Intelligence |
| Investments | Deal Pipeline (vc, exec, finance, research, bd) · Portfolio (vc, exec, finance, research) · Diligence (vc, legal, finance) · Investment Research (vc, research, exec) |
| Operations | Projects · Energy & Infrastructure (energy, exec) · Government Affairs (ga, legal, exec) · Business Development (bd, exec) |
| Knowledge & Intelligence | Documents, Research, Intelligence, RedSky AI (opens panel) |
| Bottom | Integrations (→ Settings › Connected apps), Settings, Help, Profile |

How the role filter works:

- An item without a role filter is always shown.
- An item with a filter is shown if the employee has a matching role. Executive Leadership sees everything.
- Hidden items are counted, and a "Show N more modules" toggle reveals them.

**Module pages.**

- Home, People (table) and Deal Pipeline (kanban by stage) are designed.
- Every other module shows a designed placeholder:
  - its group and title;
  - a "Planned · Phase N — Name" chip;
  - a description and a planned-capabilities grid;
  - a 5-phase roadmap strip with its phase highlighted;
  - an "Ask RedSky about this" action.
- Phases come from the RedSky roadmap deck:

| Phase | Name | Months |
|---|---|---|
| P1 | Foundation | 0–2 |
| P2 | Intelligence | 2–4 |
| P3 | Operations | 4–7 |
| P4 | Integration | 7–10 |
| P5 | Autonomous OS | 10–18+ |

---

## 4. Onboarding (9 steps)

A shell with a top bar (logo, "Workspace setup", "Confidential · RSM Capital internal", "Step N of 9", theme toggle) and a 2px crimson progress bar.

- **Steps 2–9:** a left step rail (hidden below 1040px) and a footer with Back, a contextual hint, an optional Skip, and Continue.
- **Revisiting steps:** steps already reached can be revisited from the rail; steps not yet reached are locked.

| # | Step | Content and behavior | Validation |
|---|---|---|---|
| 1 | **Welcome** | Personalized "Welcome to RedSky, {first}." Tagline and brief explanation, a 3-item preview of the setup, "About 5 minutes · 9 short steps", and a **Get started** button. On the right, a dark Coffee panel shows a connectivity diagram: 8 domains orbiting the RedSky mark. | — |
| 2 | **Profile** | Prefilled from Microsoft Entra ID with a source tag on each field ("Entra ID", "Missing from directory", "Managed by IT"). Fields: name, last name, preferred name, title, department (select), email (read-only), phone, office (select), bio (280 characters with counter). Photo upload (read client-side) or a monogram with 6 color choices. Choosing a department pre-selects the matching roles. | First name required |
| 3 | **Role** | Nine multi-select cards (icon, name, description). Cards matching the department show a "Suggested from your department" chip. A live "What this changes" panel previews home widgets, navigation modules and recommended workflows. | ≥1 role |
| 4 | **Workstyle** (optional) | See §7. Intro (consent + drag-and-drop TTI PDF upload or sample) → reading the report (7 checklist rows) → "Your Workstyle. Your RedSky." results with 6 recommendations and a live before/after home preview. | Continue is disabled while the report is being read |
| 5 | **Connect** | 15 connectors in 3 groups as provider cards: logo or monogram, name, kind, status chip, what connecting enables, an access/permission line, and an action. Summary chips and a "Notify me about all" button. | Optional |
| 6 | **Preferences** | Q1: what RedSky should help with most (9 multi-select options). Q2: what to see first (6 single-select options → default home view). Q3: information density (Focused / Balanced / Comprehensive, each with a mini diagram). Options matching a workstyle recommendation show a "Workstyle suggestion" chip. | Optional |
| 7 | **RedSky AI** | Capability list, with each item marked "Available in pilot" or "Planned · Phase 2". Three response styles (Concise / Analytical / Executive), each with a sample answer. Privacy & access card with switches: personalize with email and calendar (on); external research providers (disabled, needs an administrator); always show sources (locked on). | Optional |
| 8 | **Home page** | Widget gallery of 13 cards, each with a mini skeleton preview, a "Recommended" chip and a switch. Sticky live preview on a 12-column mini grid; drag blocks to reorder. "Reset to recommended". | Optional |
| 9 | **You're ready** | "Your RedSky workspace is ready." Summary rows (profile, focus areas, workstyle, connectors, opens-to, AI style, home page), each with Edit to jump back. A preview of the personalized workspace and a large **Enter RedSky** button. | — |

**Enter RedSky** plays a roughly 2-second transition (four checklist rows tick and a bar fills), opens the home view chosen in step 6, and shows a welcome toast.

---

## 5. Home dashboard

**Header row:**

- View tabs: Overview, My Tasks, Relationships, Projects, Pipeline. The default tab comes from the "opens to" preference.
- The date and a "Sample data" label.
- **Customize**.

The non-Overview tabs show that one widget at full width with every item visible.

**Widget grid:** 12 columns, sizes S=4, M=6, L=8, XL=12, `grid-auto-flow: dense`.

### 5.1 Widgets (13)

| ID | Name | Content | Interactions |
|---|---|---|---|
| `brief` | Daily Brief | Label "Daily Brief · Monday, October 19"; serif "Good morning, {preferred}."; an AI-synthesized paragraph (profile-specific); provenance line ("Synthesized by RedSky AI · From your calendar, tasks and CRM · 7:02 AM"); up to 4 stat tiles; 3 highlight cards (Next up / Most time-sensitive / Reconnect); quick-actions row | View full brief (AI panel with a brief answer), Ask RedSky, Customize brief (Settings › Home page). Stat tiles and highlights open records, prep or tabs |
| `attention` | Needs Your Attention | Prioritized rows: completion circle, priority bars, title, type chip, related record link, AI source note, due date (red when today or overdue), suggested action button | **Complete** (undo toast), **Dismiss** (undo toast), **Open** (record preview), suggested action (Draft with AI / Prepare / Approve / Open). Sorting follows the task-organization preference (§7.5). Footer: "N open · N completed today · N overdue", View all |
| `meetings` | Today's Meetings | Cards: time, duration, "Next · in 52 min" on the next meeting, prep status, title, attendee avatars and names, organization chip, related deal or project chip | **Prepare with RedSky AI** opens the meeting-prep drawer (§6.3); the related chip opens a preview |
| `relationships` | Relationships to Reconnect | Cards: avatar, name, title · organization, strength chip (Strong/Warm/Cooling/New), last interaction, owner, a **Recorded** fact, an **AI suggested** next step | Open (preview), Draft note (AI draft) |
| `pipeline` | Investment Pipeline | 6 stage tiles (count, weekly change, value, bar) and a "Recent movement" table. Marked as sample data | Stage tiles open the pipeline page; rows open the deal preview |
| `projects` | Active Projects | Cards: name, type, status (On track / At risk / Needs decision / Starting), progress bar, recent activity, next milestone and date, owner, "N tasks need attention" | Open (preview) |
| `intel` | Intelligence Feed | A banner "Illustrative content — not real news"; items with topic, source, date, headline, an AI-tinted "Why it matters" | Save (toggle), Share (internal link toast), Ask AI |
| `govaffairs` | Government Affairs Monitor | Tracked bills or proceedings: jurisdiction, RSM position, a 5-stage progress strip, a change chip, the next date. Footer: disclosure-logging note | Open the related project |
| `airecs` | AI Recommendations | AI cards: suggestion, "Based on…" basis, action and Dismiss | Actions go through confirmation, AI drafts or schedule proposals |
| `approvals` | Decisions Awaiting You | Title, requester, due date | Review (preview), **Approve** (confirmation → Approved chip, and the linked task completes) |
| `portfolio` | Portfolio Watchlist | Table: company, sector, latest update, status, owner | — |
| `documents` | Recent Documents | File rows with source and editor | Open the document preview (Summarize with AI / Open in SharePoint) |
| `team` | Team Activity | Activity feed | — |

**Detail level** sets how many items each widget shows: Focused 3, Balanced 4, Comprehensive 6. A full-width tab shows up to 12.

### 5.2 Customize mode

Turning on Customize gives the Overview:

- A banner with: Detail (Focused/Balanced/Comprehensive), Opens to (default view), Add widgets (opens the widget library drawer), Reset to recommended, and Done.
- Widget cards with dashed borders. They can be dragged by HTML5 drag-and-drop, and each header gets a size control (S/M/L/XL), Move earlier/later and Hide.
- An "Add widget" tile at the end of the grid.

Choices persist for the session, per profile. Production should persist them per user (§10).

### 5.3 Role recommendation engine (`recommend(roles, goals, density)`)

1. **Score each widget.**
   - For each selected role, the role's ordered widget list adds 8 to its first widget and `6 − index` to each later one.
   - Each selected goal adds 4 to its mapped widgets.
   - Fixed bonuses: attention +3, meetings +2, AI recommendations +1.
   - The weight tables are in `data/sample-data.json`: `ROLE_W`, `GOAL_W`, `BASE`.
2. **Order** by score, breaking ties by the `BASE` order.
3. **Take N widgets:** Focused 4, Balanced 8, Comprehensive 12.
4. **Pin** attention first and, if it made the cut, meetings second.
5. **Pack sizes into rows.**
   - A wide widget followed by a narrow one (or the reverse) becomes 8 + 4.
   - Any other pair becomes 6 + 6.
   - A leftover single widget becomes 12.
   - Wide widgets: attention, projects, pipeline, approvals, intel, relationships. Narrow widgets: meetings, airecs, team, documents.
6. **Brief:** the brief is always first, at 12.

Until the employee edits the layout by hand (`layoutTouched`), changes to roles, goals or density re-run the recommendation. "Reset to recommended" clears `layoutTouched`.

Resulting default layouts:

- **Government Affairs & BD:** Brief · Attention 8 + Meetings 4 · Relationships 6 + Gov Affairs 6 · Intel 6 + Projects 6 · AI Recs 4 + Pipeline 8
- **Investments:** Brief · Attention 8 + Meetings 4 · Pipeline 6 + Portfolio 6 · Documents 4 + Intel 8 · AI Recs 4 + Relationships 8
- **Executive:** Brief · Attention 8 + Meetings 4 · Approvals 6 + Relationships 6 · Pipeline 6 + Intel 6 · Team 4 + Projects 8

### 5.4 Demo profile switcher

A floating "Demo" pill in the bottom right (a prototype control, labeled as not part of RedSky) switches between three profiles and can restart onboarding:

| Profile | Person | Roles | Default AI style |
|---|---|---|---|
| **A · Government Affairs & BD (primary)** | Cody, Director, Government Affairs | ga, bd | Concise |
| **B · Investments** | Marcus Chen, Principal, Venture Investments | vc, research | Analytical |
| **C · Executive Leadership** | Eleanor Vance, Managing Partner | exec | Executive |

Each profile has its own meetings, tasks, reconnect list, projects, intelligence, AI recommendations, brief copy and highlights.

---

## 6. Global surfaces

### 6.1 Command palette (⌘K / Ctrl+K)

- **Layout:** a centered modal with a search input (auto-focused) and grouped results with an icon, label, sub-label and hint.
- **Footer:** keyboard hints and "Only records you're authorized to access".
- **Empty query:**
  - Suggested: Ask RedSky AI, Prepare for my next meeting, Create task, Customize home page, Toggle theme.
  - Recent: Halcyon deal, Priya Raman, the permitting project, the stakeholder memo.
- **With a query:** the first item is always `Ask RedSky: "<query>"`, followed by filtered People, Companies, Deals, Projects, Meetings, Documents, Actions and Go to.
- **Keyboard:** ↑/↓ moves through results, Enter runs the selected item, Esc closes. Hovering a result moves the selection to it.

### 6.2 RedSky AI panel (⌘J)

- **Placement:** a right-side panel. The header carries a "Simulated responses · prototype" label, a New conversation button and Close.
- **Response style:** a segmented control (Concise / Analytical / Executive). Each answer stores the style it was written in.
- **Empty state:** "How can I help, {first}?" with 6 suggested prompts and "Searching across" source chips.
- **Answer anatomy:**
  1. An "RedSky AI · Simulated · {style}" label.
  2. Executive only: a "Bottom line" first.
  3. A lead paragraph. Concise uses the short version.
  4. Bullets: 3 for Concise, 4 for Executive, all for Analytical.
  5. Optionally a draft, in a quoted box.
  6. Analytical only: a Reasoning box.
  7. **Sources**: chips that open the cited records.
  8. **Proposed actions**: "Open" for navigation, "Review & confirm" for any change, then a Done chip once completed.
- **Simulated answers:** next meeting, projects this week, follow-ups, pipeline changes, everything about Halcyon, decisions waiting, full brief, reconnect, drafts, document summaries, intelligence context, module info, research.
- **Free text** is matched to an answer by keyword. Unknown questions get an honest "this prototype answers sample questions" reply.
- **Footer:** an input (Enter sends, Shift+Enter adds a new line) and the note "Uses only information you're authorized to access… changes to records always ask for confirmation".

### 6.3 Meeting preparation drawer

- **Header:**
  - "Prepared by RedSky AI · simulated" chip and, when tailored by workstyle, a format chip such as "One page · 15-min reminder · from your workstyle".
  - Time, duration, location, title, organization, a related record link and prep status.
- **Body, in order:**
  1. A disclosure warning when a public official attends.
  2. AI summary.
  3. Participants (Recorded).
  4. Relationship history timeline (Recorded).
  5. Related documents (Recorded).
  6. Recent relevant developments (Illustrative), hidden in one-page format.
  7. Suggested discussion topics (AI suggested).
  8. Outstanding follow-ups (Recorded) with checkboxes.
- **Footer:** Ask a follow-up · Add follow-ups to My Tasks (confirmation) · Mark as prepared (updates the meeting card status).

### 6.4 Record preview drawer

Record types: contact, company, deal, project and document.

- **Header:** avatar or icon, title, sub-label, "Sample record" chip.
- **Body:**
  - A key-field list.
  - A stage strip for deals and a progress bar for projects.
  - The open commitment (Recorded) and the AI-suggested next step.
  - Recent activity timeline and related-record chips.
  - An access line: "Visible to you under your current permissions · …".
- **Actions** depend on the type: Draft note, Log interaction, Create task, Approve (executive, with confirmation), Ask RedSky, Open pipeline, Summarize with AI.
- **Public officials** are classified "Public official — disclosure rules apply".

### 6.5 Quick create (+ New, and the quick actions)

| Type | Fields | Result |
|---|---|---|
| Create task | Title, related to, due date | Added to My Tasks |
| Add contact | Name, organization, relationship owner | "Submitted for review — duplicates are checked first" |
| Log meeting | Title, related to, when | Notes that the log supports disclosure review |
| Add opportunity | Company, source, stage (first three stages) | Added (sample) |
| Upload document | File picker (stays local), name, link to, visibility | Simulated upload |
| Start research | Topic, related, depth | Opens an AI research answer |

### 6.6 Notifications, settings, toasts

**Notifications popover:** 4 sample items that open their records, a "Mark all as read" link, a "Batched · 9 AM & 3 PM" chip when batching is on, and a link to notification settings.

**Settings modal**, seven tabs:

| Tab | Contents |
|---|---|
| Profile | Profile fields, a link to My Workstyle, focus areas, Restart onboarding |
| **My Workstyle** | See §7.6 |
| Appearance | Light/Dark theme cards; sidebar expanded or collapsed |
| Home page | Opens to; detail level; what the Daily Brief includes (4 switches); Customize widgets; Reset to recommended for my role |
| RedSky AI | Response style; personalize with email and calendar; external providers (administrator-governed); privacy note |
| Notifications | 5 category switches; non-urgent notifications real-time or batched; Daily Brief delivery time |
| Connected apps | All 15 connectors with status and action |

**Confirmation dialog:** title, body, a list of the exact items affected, "Requires your confirmation · recorded in the audit log", Cancel and the action button.

**Toasts:** appear at the bottom center for about 4.2 seconds. Complete, dismiss and other reversible actions offer Undo.

### 6.7 Keyboard

| Shortcut | Action |
|---|---|
| ⌘/Ctrl+K | Command palette |
| ⌘/Ctrl+J | Toggle RedSky AI |
| Esc | Close the top-most layer: confirm → create → palette → settings → prep → preview → library → popovers → AI → customize |

---

## 7. Workstyle Intelligence (onboarding step 4 and Settings › My Workstyle)

A personalization feature informed by the employee's own TTI Talent Insights assessment. It is optional, private by default and controlled by consent. It is a premium workspace feature, not an HR test.

### 7.1 Governance rules (must be enforced in implementation)

1. **Optional.** The step can be skipped, and so can every recommendation.
2. **Explicit consent before processing.** Upload stays disabled until the consent checkbox is ticked. The consent text says: private to the employee, not shared unless they choose, never used for evaluation or employment decisions.
3. **Private by default.** No manager or coworker can see assessment data unless the employee turns on sharing, and each share needs its own explicit consent dialog. Sharing exposes only a short preference summary, never scores, Driving Forces or the report. Sharing can be revoked at any time.
4. **Never used for** ranking, performance evaluation, hiring or employment decisions. State this in the UI, and enforce it in data access policy and audit.
5. **Not deterministic.** Copy describes *tendencies*, never fixed traits or predictions of performance.
6. **The employee controls the final configuration.** Recommendations only propose settings. Each one can be accepted, customized, dismissed, overridden later or reverted. Later onboarding steps let the employee change anything.
7. **Deletable.** "Remove assessment data" deletes the report and the extracted insights and keeps the employee's current settings.

### 7.2 Intro

- **Consent and upload:**
  - The consent checkbox card.
  - A large drag-and-drop zone ("Drop your TTI Talent Insights report", PDF only), disabled until consent.
  - "Preview with a sample assessment", for demos.
- **What RedSky reads:**
  - DISC behavioral characteristics.
  - Natural and adapted behavioral styles.
  - The 12 Driving Forces.
  - Communication, decision-making and motivational preferences.
  - Preferred working environment.
- **"Your data, your control"** card listing the five promises.

### 7.3 Reading the report

The file name, a progress bar and a 7-row checklist that ticks through each extracted element (about 360ms per row). In the prototype this is simulated and the file never leaves the device.

### 7.4 Results: "Your Workstyle. Your RedSky."

- **Insights card:**
  - **DISC** natural vs adapted bars for D, I, S and C, with scores and a style note.
  - **12 Driving Forces** as 6 two-pole scales: Instinctive–Intellectual, Selfless–Resourceful, Objective–Harmonious, Altruistic–Intentional, Collaborative–Commanding, Structured–Receptive. The stronger pole is emphasized and the primary drivers appear as chips.
  - **How you tend to work:** communication, decision-making, motivation, environment.
  - A "simulated extraction, illustrative values" note.
- **Six recommendation cards.** Each has an icon, area and status chip; a **From your assessment** insight; an AI-tinted **Proposed adjustment**; **Why it might help**; and Accept / Customize (shows the option selector) / Dismiss (becomes Restore). There's also an **Accept all** button.
- **Live preview** (sticky): a Before/After toggle, a mini home grid with changed blocks highlighted, and a settings list (AI responses, detail level, meeting prep, tasks, notifications, AI drafts) with "Changed" chips.

| Area | Default suggestion | Options | Effect on RedSky |
|---|---|---|---|
| Dashboard layout | Action first | Action first / People first / Keep my order | Re-orders widgets: attention, approvals and meetings first, background reading last (or relationships and meetings first) |
| Meeting preparation | One page · 15 min | One page · 15 / One page · 30 / Detailed · 30 | `prepFormat`. One-page hides Developments and trims history to 2 items; the format chip shows in the prep drawer |
| Task organization | Priority · Top 3 | Priority · Top 3 / Due date / Relationship | `taskGroup`. Changes the attention sort, adds "Top 3" chips, changes the widget subtitle |
| Communication | Direct · batched | Direct · batched / Direct · real-time / Warm · batched | `notifMode` (batched shows a chip in notifications) and `draftTone` |
| AI response format | Executive | Executive / Concise / Analytical | `aiStyle` |
| Information density | Focused | Focused / Balanced / Comprehensive | `density`, and re-runs the recommended layout |

### 7.5 Applying recommendations (`wsApply`)

- **Baseline.** When the assessment is first processed, a *baseline* snapshot is taken of: density, layout, layoutTouched, aiStyle, prepFormat, taskGroup, notifMode and draftTone.
- **Recomputing.** Every accept, dismiss or option change recomputes the effective settings: baseline + every accepted recommendation, applied in a fixed order (density → layout → AI → prep → tasks → communication).
- **Reverting.** Turning a recommendation off restores the baseline value.
- **Updating the report** keeps the existing decisions and baseline.

### 7.6 My Workstyle (Settings)

- **Header:** the file, the date added, "private to you", and Update (replace the report).
- **Insights:** DISC, primary drivers and preferences, condensed.
- **Your recommendations:** each has an on/off switch and an option selector, with the note "Turning one off restores the setting you had before".
- **Sharing, off by default:**
  - Share a summary with my manager (consent dialog).
  - Show my communication preferences to colleagues (visible only to colleagues who also opt in; consent dialog).
- **Coming later · always opt-in:**
  - Personalized AI meeting preparation.
  - Suggested communication approaches for colleagues.
  - Individual workstyle coaching.
  - Team collaboration summaries (aggregated, never individual scores).
- **Policy note** and **Remove assessment data** (with confirmation).

---

## 8. Integrations

15 connectors in three groups. **All are "Coming soon"** in this release; the action is "Notify me", which changes to "You'll be notified". The UI also supports these states for later:

| State | Chip | Action |
|---|---|---|
| connected | Connected | Disconnect |
| connecting | Connecting… | (spinner) |
| available | Available to connect | Connect |
| admin | Requires administrator setup | Request access |
| requested | Access requested | (disabled) |
| soon / notify | Coming soon | Notify me / You'll be notified |

| Group | Connectors (logo available ✓) |
|---|---|
| Productivity | Microsoft 365 ✓, Outlook Email ✓, Outlook Calendar ✓, Microsoft Teams ✓, OneDrive / SharePoint ✓ (OneDrive mark), Plaud, Superhuman Mail, Todoist ✓ |
| Investment Intelligence | AlphaSense, Harmonic, Carta, PitchBook, Gödel Terminal |
| Government Affairs & Research | LegiStorm, OpenSecrets |

Each card shows what connecting would enable and the permission scope (for example "Respects existing SharePoint permissions"). Connectors without a logo show a colored monogram until official brand assets are supplied.

Because nothing is connected, home widgets show **sample data**. In production, an unconnected source shows the designed empty state instead, such as "Connect Outlook Calendar to see today's meetings". The markup for those empty states remains in the source.

---

## 9. Data model

All sample data is in `data/sample-data.json`, keyed by the constant names in the source. Suggested production entities (TypeScript):

```ts
type RoleId = 'exec'|'vc'|'energy'|'ga'|'bd'|'ops'|'finance'|'legal'|'research';
type WidgetId = 'brief'|'attention'|'meetings'|'relationships'|'pipeline'|'portfolio'|'projects'|'documents'|'intel'|'govaffairs'|'airecs'|'team'|'approvals';

interface Employee { id; firstName; lastName; preferredName; title; department; email; phone?; office?; bio?; photoUrl?; monogramTone: 0|1|2|3|4|5; roles: RoleId[]; }
interface WorkspacePreferences {
  goals: string[]; landing: 'brief'|'tasks'|'relationships'|'projects'|'pipeline'|'custom';
  density: 'focused'|'balanced'|'comprehensive'; aiStyle: 'concise'|'analytical'|'executive'; aiUseContext: boolean;
  layout: { id: WidgetId; size: 4|6|8|12 }[]; layoutTouched: boolean;
  briefIncludes: { meetings: boolean; tasks: boolean; opps: boolean; followups: boolean };
  notifications: { prep: boolean; due: boolean; rel: boolean; pipe: boolean; gov: boolean }; notifMode: 'realtime'|'batched'; digestTime: string;
  prepFormat: 'standard'|'onepage-15'|'onepage-30'|'detailed-30'; taskGroup: 'priority'|'top3'|'due'|'relationship'; draftTone: 'standard'|'direct'|'warm';
  theme: 'light'|'dark'; sidebar: 'full'|'collapsed';
}
interface WorkstyleProfile {           // stored encrypted, owner-only access
  employeeId; sourceFile; addedAt; consentAt; disc: {k:'D'|'I'|'S'|'C'; natural:number; adapted:number}[];
  drivingForces: { motivator; leftPole; rightPole; position:number }[]; primaryDrivers: string[];
  preferences: { communication; decisionMaking; motivation; environment };
  recommendations: Record<'layout'|'prep'|'tasks'|'comm'|'ai'|'density', { status:'pending'|'accepted'|'dismissed'; choice:string }>;
  baseline: Partial<WorkspacePreferences>; sharing: { manager:boolean; colleagues:boolean; consentLog: {scope; grantedAt; revokedAt?}[] };
}
interface Person { id; name; title; org; ownerId; strength:'Strong'|'Warm'|'Cooling'|'New'; isPublicOfficial?: boolean; lastInteraction; openCommitment?; }
interface Deal { id; company; round; targetAllocation; stage: 0..5; leadId; sector; latestActivity; }
interface Project { id; name; kind; status; ownerId; progress; nextMilestone; milestoneDate; openTasks; }
interface Meeting { id; start; duration; title; org; attendeeIds; related?: {kind; id}; prepStatus; location; involvesPublicOfficial?: boolean; }
interface AttentionItem { id; priority:'high'|'med'|'low'; type; title; related: {kind; id; label}; due; suggestedAction:'draft'|'prep'|'approve'|'open'|'summarize'; source?: string; }
interface Approval { id; title; requestedBy; due; related: {kind; id}; status:'pending'|'approved'; }
interface IntelItem { id; headline; source; publishedAt; topic; whyItMatters /* AI */; related?: {kind; id}; }
interface Connector { id; name; group; kind; enables; accessScope; state:'connected'|'available'|'admin'|'requested'|'soon'|'notify'; logoUrl?; }
interface AiAnswer { lead; short?; bottomLine?; bullets: string[]; reasoning?; draft?; sources: {kind; id; label}[]; actions: ProposedAction[]; }
interface ProposedAction { label; description; kind:'tasks'|'draft'|'doc'|'prep'|'nav'|'preview'; requiresConfirmation: boolean; payload; }
```

---

## 10. Implementation guidance

### 10.1 Target stack

This follows the RedSky roadmap deck.

| Phase | Stack |
|---|---|
| Phase 1 | Twenty CRM fork, rebranded; TypeScript/NestJS; PostgreSQL + Redis; Microsoft Entra ID SSO; Microsoft Graph for Outlook, Teams and SharePoint; AI through an AI gateway (Anthropic) |
| Later phases | RedSky-native modules replace Twenty screens progressively |

**Build the RedSky shell and home as RedSky-native React components rather than reskinning Twenty's UI.**

### 10.2 Suggested front-end structure

```
apps/redsky-web/src/
  design-system/        tokens.css (from design/), Button, Chip, Card, Switch, Segmented, Avatar, Icon, Drawer, Modal, Popover, Toast, ConfirmDialog
  shell/                Sidebar (role-aware nav), CommandBar, CommandPalette, AiPanel, DemoSwitcher (dev only)
  onboarding/           OnboardingShell + steps/{Welcome,Profile,Role,Workstyle,Connect,Preferences,AiPrefs,HomeBuilder,Ready}
  home/                 HomePage, WidgetGrid, CustomizeBar, WidgetLibrary, widgets/{DailyBrief,Attention,Meetings,Relationships,Pipeline,Projects,Intel,GovAffairs,AiRecs,Approvals,Portfolio,Documents,Team}
  records/              RecordPreviewDrawer (contact|company|deal|project|doc), MeetingPrepDrawer
  settings/             SettingsModal + tabs/{Profile,Workstyle,Appearance,HomePage,Ai,Notifications,ConnectedApps}
  workstyle/            recommend.ts, wsApply.ts, extraction client, consent + sharing flows
  lib/                  personalization (recommend/pack/orderLayout), keyboard, permissions, audit
```

- **State:** server state with React Query or GraphQL. Preferences go in a per-user store persisted to the backend.
- **Pure functions:** port `recommend`, `pack`, `orderLayout` and `wsApply` from the source as pure, unit-tested functions. The behavior is specified in §5.3 and §7.5.
- **Widget registry:** each widget declares `{ id, name, description, icon, previewKind, defaultSize, dataSource, requiredConnector? }`, so new modules plug in.
- **Confirmation:** route every mutation that an AI proposed, or that touches sharing, through a single `ConfirmDialog` + audit-log call.

### 10.3 Backend touchpoints (production)

| Feature | Source of truth |
|---|---|
| Profile prefill | Microsoft Entra ID / Graph `/me` |
| Meetings, attendees | Graph Calendar; RedSky entity matching for people and companies |
| Email capture and follow-ups | `redsky@rsmcapital.com` → Graph webhook → extraction → human review |
| Documents | SharePoint/OneDrive search with existing ACLs |
| Relationships, deals, projects | RedSky / Twenty objects in PostgreSQL |
| Intelligence | Licensed providers (LegiStorm, AlphaSense, …) once contracted. Until then, label content as illustrative or omit it |
| AI | AI gateway; retrieval limited to the requesting user's permissions; every answer returns sources; proposed actions returned as structured data, never auto-executed |
| Workstyle | PDF parsed server-side under the employee's consent. Store only the extracted profile, encrypted and owner-scoped. No reporting, search or AI access to it from other users; excluded from analytics. Audit every read. Hard-delete on removal |

### 10.4 Accessibility

- **Real controls:** use real `<button>`, `<input>` and `<label>` elements, and give icon-only buttons an `aria-label`.
- **ARIA states:** switches use `role="switch"` + `aria-checked`, toggles use `aria-pressed`, checkboxes use `role="checkbox"`, drawers and modals use `role="dialog"`, toasts use `role="status"`.
- **Contrast and focus:** text contrast ≥4.5:1 and visible focus rings (`:focus-visible` with the accent).
- **Motion:** respect `prefers-reduced-motion`.
- **Drag-and-drop alternatives:** every drag-and-drop action also has a button alternative (Move earlier / Move later).

---

## 11. Acceptance checklist (from the original brief)

- [ ] Start and complete onboarding; move back and forward; revisit completed steps from the rail
- [ ] Save profile information (including photo upload and preferred name in greetings)
- [ ] Select roles (department-suggested), with live impact preview
- [ ] Workstyle: consent-gated upload, sample path, simulated extraction, 6 recommendations with Accept/Customize/Dismiss, live before/after preview, effects visible on home
- [ ] Select or skip integrations (all "Coming soon" with Notify me)
- [ ] Choose goals, landing view and density; AI style and privacy
- [ ] Enable or disable widgets, drag to reorder, reset to recommended
- [ ] Enter RedSky with a transition; home reflects onboarding choices
- [ ] Switch demo profiles (GA/BD primary, Investments, Executive)
- [ ] Command palette with search, keyboard navigation and Ask RedSky
- [ ] Open and close the RedSky AI panel; ask suggested and free-text questions; sources open records; proposed actions require confirmation
- [ ] Meeting preparation drawer; follow-ups to tasks with confirmation; mark prepared
- [ ] Complete, dismiss and undo a task; open contact, deal and project previews
- [ ] Customize mode: add, remove, resize, reorder; detail level; default view
- [ ] Light/dark mode; collapsible sidebar; responsive tablet and mobile behavior
- [ ] My Workstyle: review, update, override, consent-gated sharing, remove data

## 12. Open items

- Official logos for the 9 connectors without one; confirm brand-use permission for every connector logo.
- Web licensing for RSM brand headline fonts (Taberna Serif, Macklin Slab, Westmount).
- Legal and compliance review of the Workstyle consent text, sharing scopes and retention period; TTI licensing for parsing reports.
- Lobbying-disclosure logging requirements for interactions with public officials (fields, retention, export).
- Decide whether batched notifications and draft tone become general preferences outside Workstyle (they are already editable in Settings › Notifications).
