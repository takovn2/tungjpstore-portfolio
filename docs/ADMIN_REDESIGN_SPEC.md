# TUNG Admin Redesign Specification

Status: Production baseline implemented; advanced route/dashboard/media-library work remains staged  
Scope: `/admin`, `/admin/*`, admin APIs, and supporting CMS/CRM capabilities  
Default admin language: Vietnamese  
Public authoring locales: Vietnamese (`vi`), English (`en`), Japanese (`ja`), Simplified Chinese (`zh`)

This document is both the original target specification and the continuing roadmap. Sections labelled as target behavior are not evidence that every advanced interaction exists. Current production evidence is recorded below and in `docs/PHASE_RELEASE_STATUS.md`.

### Implementation snapshot — 2026-07-24

| Area | Production baseline | Next target |
| --- | --- | --- |
| Admin shell | Editorial Control Desk, Vietnamese UI, responsive rail, explicit busy/dirty/confirm states | Split browser-addressable routes and add Overview dashboard |
| Content | CRUD, four-locale editor, block editor, draft/publish/unpublish, revision reads, trash/restore, batch publish capped at 4 | Side-by-side locale quality, draft preview and human-readable revision compare |
| Contacts | Inbox/detail, privacy-safe search/filter, status/stage/priority, assignee, tags, follow-up, notes, activity and `mailto:` handoff | Optional scoped email-provider integration and retention tooling |
| Media | Validated raster upload to R2, immutable key, public URL and cover selection | Browse/search/usage/delete/purge library |
| Settings | Contact email plus advanced config with optimistic version | Fully structured profile, SEO and health fields |
| Security | Cloudflare Access active on `/admin` and `/admin/*`; Worker JWT allowlist, Origin/CSRF, no-store/noindex | Bundle inline admin assets and tighten CSP further |
| Platform | CONTACT/CONTENT D1 migrations `0001`–`0005`, R2 custom domain, Turnstile and Worker deploy active | Query-budget instrumentation and operational retention automation |

## 1. Outcome

Redesign `/admin` from a single technical CMS form into an editorial control desk for the TUNG portfolio. The new experience must make four jobs fast and safe:

1. Understand what needs attention.
2. Edit and publish public content in four locales.
3. Manage portfolio media without touching object IDs or source code.
4. Process contact submissions as a small owner-operated CRM.

The interface must feel related to the public portfolio without copying its marketing layout. Public pages are expressive and narrative; admin is calm, dense, operational, and evidence-led.

## 2. Historical Baseline Audit

The findings in this section describe the pre-redesign surface that motivated the work. They are retained as decision history, not as a current production-status report. The implementation snapshot above is authoritative for the current baseline.

### 2.1 Critical UX findings

1. The entire CMS is one page with content type tabs, list, editor, settings, and media upload sharing one surface. This prevents a clear mental model and makes future CRM/media work difficult (`src/pages/admin/index.astro:119`).
2. Media is a footer upload form rather than a library. Authors must copy or reuse an opaque media ID, cannot browse existing assets, inspect usage, replace variants, or select an image visually (`src/pages/admin/index.astro:136`, `src/pages/admin/index.astro:161`).
3. The content list identifies entries primarily by slug and technical version. It does not expose localized title, translation completeness, draft freshness, published state, or the next useful action (`src/pages/admin/index.astro:224`).
4. The editor shows all four locales as long disclosure panels. It lacks a completion model, side-by-side comparison, preview, field-level publish issues, unsaved-change protection, and a clear separation between content, SEO, and publishing (`src/pages/admin/index.astro:219`).
5. Publish, unpublish, soft delete, and restore are adjacent actions with similar weight. There is no confirmation flow, impact summary, or revision choice before destructive/state-changing operations (`src/pages/admin/index.astro:146`, `src/pages/admin/index.astro:228`).
6. Settings contains one structured email field and otherwise exposes raw JSON. This is a developer escape hatch, not a no-code control surface (`src/pages/admin/index.astro:150`).
7. The existing `CONTACT_DB` is not represented in admin. There is no inbox, status workflow, detail view, notes, or response handoff even though submissions already carry status and useful project context.
8. There is no dashboard. The owner cannot see pending drafts, incomplete translations, new contacts, recent publishes, failed configuration, or media health before opening individual sections.
9. Unsaved edits can be discarded without warning when the user changes content type or opens Settings. There is no dirty-state guard, route confirmation, or `beforeunload` protection (`src/pages/admin/index.astro:222`, `src/pages/admin/index.astro:234`).
10. Deleted entries disappear from the default list even though the API supports `deleted=deleted|all`. The current interface therefore exposes Restore only before reload and has no durable Trash workflow (`src/pages/admin/index.astro:224`, `src/pages/admin/api/[...path].ts:279`).
11. Async save, publish, delete, settings, and upload operations do not expose a processing state or reliably prevent double submission (`src/pages/admin/index.astro:227`, `src/pages/admin/index.astro:233`).

### 2.2 Visual and interaction findings

1. Current admin uses a green-on-green radial gradient, soft rounded panels, pill badges, and repeated card borders. It reads like a generic dark SaaS dashboard and does not match the public brand's ink/paper/lime editorial engineering direction (`src/pages/admin/index.astro:19`, `DESIGN_SYSTEM.md:15`).
2. Serif typography, editorial hierarchy, lime action signaling, and public proof language are mostly absent. Conversely, rounded surfaces and decorative gradient treatment are more prominent than the brand permits (`DESIGN_SYSTEM.md:17`, `DESIGN_SYSTEM.md:22`).
3. The content area does not distinguish navigation chrome from the reading/editing canvas. Long multilingual writing on a uniformly dark surface increases fatigue.
4. Current motion is limited to generic hover lift and color transitions. It does not communicate navigation, save/publish progress, panel hierarchy, or state changes (`src/pages/admin/index.astro:40`).

### 2.3 Accessibility findings

1. Content-type controls declare `role="tab"` but do not implement arrow-key tab behavior, `aria-controls`, or associated tabpanels (`src/pages/admin/index.astro:122`). They should become navigation links or a complete tabs pattern, not partial tabs.
2. Editor/list transitions do not deliberately move focus or announce the new page context.
3. Errors are written into one global live region. Publish issues are not linked to their fields or locale tabs, and long error lists may create noisy announcements (`src/pages/admin/index.astro:118`, `src/pages/admin/index.astro:169`).
4. Block reordering has accessible buttons, which is good, but the editor needs keyboard-preserving drag alternatives, position announcements, and focus retention after move/delete (`src/pages/admin/index.astro:202`).
5. Mobile actions wrap but do not form a deliberate sticky save/publish workflow. Dense forms, long locale panels, and technical revision strings remain difficult on narrow screens.
6. The file and alt inputs in the current Media form do not have visible labels; placeholder text is not an accessible name (`src/pages/admin/index.astro:161`).

### 2.4 Capabilities that must be preserved

- Cloudflare Access JWT verification and exact email authorization.
- Same-origin CSRF protection for every mutation.
- Optimistic locking and explicit `409` conflict handling.
- Draft, published, archived revision history.
- Four-locale publish validation.
- Structured block content; no arbitrary HTML.
- R2 raster-only upload, MIME/signature validation, immutable object keys, and 8 MB application limit.
- Admin `private, no-store` and `noindex` behavior.
- Soft delete/restore and audit logging.

## 3. Product Principles

1. **Start with attention, not inventory.** Dashboard and list views show what needs action before raw counts.
2. **Vietnamese defines intent.** Vietnamese is the default authoring tab, but publishing remains blocked until all four required locales are complete.
3. **One primary action per context.** Create, save, publish, upload, and reply are visually distinct and never compete on the same plane.
4. **Human-readable before technical.** Show title, status, locale readiness, and dates before IDs, versions, or JSON.
5. **Drafts are safe; publishing is deliberate.** Editing never changes public content until an explicit publish confirmation succeeds.
6. **No fake intelligence or analytics.** Do not invent traffic, AI scores, performance, or quota figures that the application cannot verify.
7. **Progressive disclosure.** Common fields are first-class controls. Raw JSON exists only in a clearly marked developer diagnostics view and is not required for routine work.
8. **Cloudflare Paid by design.** Paginate, index, cache appropriately, stream media, and spend quota deliberately rather than treating paid capacity as an excuse for unbounded work.

## 4. Visual Direction: Editorial Control Desk

### 4.1 Composition

- Persistent dark ink navigation chrome.
- Warm paper editing canvas for long-form content and previews.
- Thin technical rules instead of repeated rounded cards.
- Lime is reserved for the active route, primary positive action, focus, ready state, and successful publish.
- Coral/red is reserved for validation and destructive actions.
- Mono typography is reserved for dates, versions, slugs, request IDs, and system health.
- Serif is used only for page titles, content titles, previews, and meaningful editorial moments.
- Sans is used for navigation, forms, tables, descriptions, and operational data.

The admin may reuse the public brand tokens conceptually, but must define admin-specific semantic tokens so the light editor canvas remains accessible.

### 4.2 Required semantic tokens

```text
--admin-chrome-bg       near --ink
--admin-chrome-surface  near --ink-soft
--admin-canvas          near --paper
--admin-canvas-soft     warmer/lower contrast paper
--admin-text            near --ink
--admin-text-muted      accessible neutral
--admin-line            subtle structural rule
--admin-line-strong     interactive boundary
--admin-accent          --accent lime
--admin-accent-ink      --accent-ink
--admin-success         semantic success distinct from body copy
--admin-warning         semantic warning
--admin-danger          --danger family
--admin-focus           high-contrast focus color
```

Color must never be the only status signal. Every status includes text and, where useful, a simple icon.

### 4.3 Density and geometry

- Sidebar and tables use compact density; forms use comfortable density.
- Primary controls have a minimum 44 px target on touch devices.
- Default corner radius is small and technical. Large pill shapes are limited to compact status filters/tags.
- Avoid glassmorphism, glow, floating gradient blobs, bento dashboards, and decorative charts.
- Use whitespace and rules to form groups before introducing a bordered container.

## 5. Information Architecture

### 5.1 Top-level navigation

```text
Overview
Content
  Pages
  Projects
  Journal
Media
Contacts
Settings
```

`Content` is a labeled group, not an additional destination. The visible top-level decision set remains small.

Sidebar footer:

- `View live site` external/open-new-tab action.
- Current Access identity.
- Session/security label: `Protected by Cloudflare Access`.
- Compact environment badge: `Production` or `Local`, sourced from configuration rather than hostname guessing.

### 5.2 Route model

```text
/admin/                         Overview
/admin/content/pages            Site sections
/admin/content/projects         Projects
/admin/content/posts            Journal/posts
/admin/content/:type/new        Create
/admin/content/:type/:id        Edit
/admin/media                    Media library
/admin/contacts                 Contacts inbox
/admin/contacts/:id             Contact detail
/admin/settings                 Settings
/admin/activity                 Optional deep-link for audit history
/admin/preview/...              Access-protected draft preview
```

All routes, APIs, media previews, and draft previews remain beneath `/admin/*`. Cloudflare Access must protect both exact `/admin` and wildcard `/admin/*`.

### 5.3 Navigation behavior

- Desktop: fixed 248 px sidebar; content scrolls independently only where necessary.
- Medium viewport: collapsible 72 px rail with labels available on focus/expand.
- Mobile: top app bar and modal navigation drawer; drawer closes on route selection and Escape, traps focus, and restores focus to the trigger.
- Browser URL is the source of navigation state. Refresh/back/forward must preserve the current section or content item.
- Do not use incomplete ARIA tabs for primary navigation; use links with `aria-current="page"`.

## 6. Overview Dashboard

### 6.1 Purpose

Answer, in order:

1. Is the publishing system healthy?
2. What needs the owner's attention?
3. What changed recently?
4. What is the fastest next action?

### 6.2 Layout

Header:

- `Control desk`
- Current date/time in owner timezone.
- Primary CTA: `Create content`, opening a small menu for Project, Post, or Page section.
- Secondary CTA: `View live site`.

Attention queue, ordered by importance:

- New contact submissions.
- Drafts with unsaved or unpublished changes.
- Entries blocked by missing locale/SEO fields.
- Recently failed publish/upload attempts, if recorded.
- Missing Access/R2/D1 configuration.

Operational summary:

- Published projects.
- Published posts.
- Drafts waiting.
- New contacts.
- Translation readiness across four locales.

Recent activity:

- Actor, action, human title, content type, relative time.
- Link to affected item/revision.
- No raw JSON in the list.

System health:

- Access configured and identity verified.
- `CONTENT_DB`, `CONTACT_DB`, and `MEDIA` bindings reachable.
- Media public base URL configured.
- Last successful read and last publish attempt.

Do not call Cloudflare's account REST API from the Worker to display plan usage. The dashboard reports configuration/application health only and links the owner to Cloudflare Dashboard for authoritative quota/billing data.

## 7. Content Lists

Pages, Projects, and Journal use one list pattern with type-specific columns.

### 7.1 Header and filters

- Human title and explanation.
- Primary CTA: `New project`, `New post`, or `New section`.
- Search by title or slug.
- Filters: All, Draft, Published, Archived, Deleted.
- Locale readiness filter: Complete, Missing translation, Missing SEO.
- Sort: Updated, Published, Display order, Title.
- Result count and active-filter summary.

Search is submitted/debounced responsibly and backed by bounded queries. Do not query D1 per keystroke without debounce or minimum input length.

### 7.2 Desktop row

- Content title in Vietnamese; slug below in mono.
- Type-specific proof: project status/live URL, post publication date, section placement.
- Workflow status.
- Locale readiness: `4/4` plus exact missing locale labels.
- Updated date and actor.
- Overflow menu for secondary actions.
- Whole title area opens editor; destructive actions are never row-wide.

### 7.3 Mobile card

- Title, slug, workflow status, readiness, updated date.
- Primary `Edit` action.
- Secondary overflow menu.
- No horizontally scrolling data table.

### 7.4 Empty/error states

- Empty content type: explain what belongs here and offer one creation CTA.
- Empty filtered result: preserve filters and offer `Clear filters`.
- D1 unavailable: state that content cannot be safely loaded; never show a successful empty state.
- Deleted items are visually separated and require an explicit filter.

## 8. Content Editor

### 8.1 Page structure

Sticky editor header:

- Back to list.
- Human title or `Untitled`.
- Status: Draft, Published, Archived, Deleted.
- Dirty/saving/saved indicator.
- `Preview` secondary action.
- `Save draft` neutral primary workflow action.
- `Publish` lime action, visually isolated at the far end.
- More menu: Unpublish, Revision history, Soft delete, Restore.

Desktop >= 1280 px:

```text
Editor 64-68% | Preview/quality rail 32-36%
```

Below 1280 px, preview becomes a drawer/full-width mode and the editor is single column.

### 8.2 Content model sections

1. Basics: slug, display order, status metadata, live URL, cover image.
2. Localized content: four locale tabs.
3. SEO and social: title, description, preview.
4. Publishing: readiness, revision, impact, confirmation.

Common metadata appears once. Localized fields never repeat common URLs/status unless the data model requires a locale-specific label.

### 8.3 Locale workspace

Use tabs with complete ARIA behavior:

- `VI — Source`
- `EN`
- `日本語`
- `简体中文`

Each tab shows one of:

- `Ready`
- `Incomplete`
- `Empty`
- `Invalid`

Tab labels include a visible status mark and accessible status text. Arrow keys move between tabs; Home/End move first/last; focus behavior follows the chosen automatic/manual activation policy consistently.

Vietnamese opens by default for new content. Switching locale must retain unsaved data and restore the previous scroll/focus position when returning.

Provide `Copy structure from Vietnamese` only as an explicit action. It may copy block structure and empty placeholders, but must not publish or claim a machine translation. Existing translated text is never overwritten without confirmation.

### 8.4 Block editor

Supported blocks remain:

- Paragraph
- Heading
- Quote
- List
- Image
- CTA
- Metric

Required behavior:

- `Add block` opens a compact block chooser with description/examples.
- Each block has a drag handle for pointer users and Move up/Move down buttons for keyboard users.
- Moving or deleting retains logical focus and announces the new position.
- Delete block supports immediate Undo; it does not require a modal for every minor action.
- Image block selects from Media Library; authors do not type an R2 URL in the primary path.
- Image alt is required per locale and belongs to the content usage, not blindly inherited from the asset.
- CTA validates internal paths or HTTPS URLs and provides `Open link` verification.
- Metric block warns against unverified claims but does not invent validation evidence.
- Raw body JSON is available only under `Developer diagnostics`, is collapsed by default, and carries a warning that invalid edits can block publishing.

### 8.5 SEO quality panel

Per locale:

- SEO title and description fields with current/max guidance, not a fake numerical SEO score.
- Search result preview using the correct locale route.
- Canonical and hreflang summary read-only.
- Missing/invalid fields link directly to the input.
- Social image uses the selected cover media; show actual crop guidance rather than a generated placeholder.

### 8.6 Save behavior

- Do not write on every keystroke. Current revision storage creates durable history and D1 writes; explicit or thoughtfully debounced draft saves are required.
- Phase 1 uses explicit `Save draft` plus dirty-state warning on navigation/close.
- Saving disables duplicate submit but does not lock reading/editing unrelated sections.
- Success feedback appears near the sticky header and includes timestamp.
- `409 conflict` opens a conflict panel with `Reload latest` and `Copy my unsaved content`; never silently overwrite.
- Do not persist Access tokens, CSRF tokens, contact PII, or whole drafts in browser local storage.

### 8.7 Preview

- Draft preview is served under `/admin/preview/*`, behind Access and `private, no-store`.
- Viewport presets: Desktop, Tablet, Mobile.
- Locale switcher is contained inside preview controls and does not change the editor's selected locale without explicit action.
- Preview must use the real public components and draft revision, not an approximate admin template.
- Preview errors identify missing content/binding and never fall back to a public published revision without labeling it.

### 8.8 Publish workflow

Publishing opens a review sheet, not an immediate mutation:

- Item and destination URL.
- Draft revision/version.
- Four-locale readiness.
- Cover/CTA/link warnings.
- Whether this is first publish or replaces an existing public revision.
- Primary `Publish now`; secondary `Cancel`.

On success:

- Show persistent success notice with `View live page` and `View revision`.
- Update status/version without forcing a full-page reload.
- Public cache freshness is described honestly; do not promise global instant purge unless implemented and verified.

Unpublish, soft delete, and restore each use action-specific confirmation copy. Soft delete requires typing the slug or checking an explicit confirmation for high-impact records.

## 9. Revision History and Activity

- Timeline ordered newest first.
- Each entry shows version, status, actor, timestamp, and action.
- `Compare` presents human-readable field/block changes where available; raw JSON is a secondary diagnostic.
- `Restore as new draft` is the only restore-from-history behavior. Historical rows remain immutable.
- Publishing a restored revision follows the normal four-locale validation and confirmation flow.
- Audit events are append-only in the UI; no delete control.

## 10. Media Library

### 10.1 Main view

- Dedicated `/admin/media` route.
- Grid/list toggle; grid is default for images.
- Search by filename/alt.
- Filters: type, upload date, active/deleted, used/unused.
- Upload CTA and drag/drop zone.
- Paginated/cursor-loaded results; no unbounded bucket listing.

### 10.2 Asset card/detail

- Real thumbnail from admin preview or public custom domain.
- Filename, format, dimensions when known, byte size, upload date.
- Usage count and links to referencing content.
- Default asset description as authoring assistance only.
- Copy public URL.
- Select/use action when opened from an editor.
- Soft delete only when unreferenced; otherwise explain references and block deletion.

### 10.3 Upload

- JPEG, PNG, GIF, WebP, AVIF only; SVG remains rejected.
- Maximum 8 MB is an application rule and is displayed before selection.
- Client performs early validation; server remains authoritative for MIME, signature, and size.
- Show progress, cancel where possible, processing, success, and failure states.
- Stream upload to R2; do not buffer multiple large files in memory.
- Object keys stay immutable. Replacing an image creates a new asset.
- No dependency on Cloudflare Images or paid transformations.
- Encourage optimized WebP/AVIF and appropriate dimensions; do not claim automatic resizing unless implemented.

## 11. Contacts CRM

### 11.1 Scope

Contacts is an owner-only lightweight inbox over `CONTACT_DB`, not a sales automation platform.

Phase 1 statuses:

- New
- Reviewing
- Replied
- Closed
- Spam

### 11.2 Inbox

- Default view: New, newest first.
- Search by name, email, company, or project website with bounded, indexed queries.
- Filters: status, locale, date.
- Row/card: sender, company, concise message preview, locale, received time, status.
- Pagination/cursor required.
- New count appears in sidebar and dashboard.

### 11.3 Detail

- Sender and organization details.
- Building/project context and full message.
- Original locale and received timestamp.
- Safe external links for project website.
- Status controls.
- Internal notes/history if the supporting schema is added.
- `Reply by email` opens a `mailto:` handoff with a clear subject; phase 1 does not claim that the portfolio sent an email.
- `Mark replied` is explicit after external email handoff.
- Spam and delete/privacy actions require confirmation.

### 11.4 Privacy/security

- Contact PII never enters analytics, client logs, URL query strings, local storage, or public cache.
- Contact API responses are `private, no-store`.
- List/detail reads require the same Access JWT and allowed-email authorization as CMS writes.
- Audit status changes and data deletion requests.
- Do not display raw IP or attempt to reverse the stored IP hash.
- Retention UI must not promise an automatic policy until a tested scheduled/manual process exists.

## 12. Settings

Settings is divided into structured sections:

1. **Profile and contact**: public email, location, availability, social links.
2. **Homepage defaults**: hero media selection and shared profile values where not represented as content sections.
3. **SEO defaults**: site name, default social image, fallback description.
4. **Locales**: read-only required locale set and Vietnamese-default policy in phase 1.
5. **Media**: public base URL and bucket health, primarily read-only.
6. **Security and environment**: Access identity, protected paths, binding health, deployment environment.
7. **Developer diagnostics**: config JSON, IDs, versions, and request health; collapsed and clearly labeled advanced.

Saving settings uses optimistic locking and shows the fields changed. Settings are not mixed into the content editor or media page.

## 13. Responsive Specification

### >= 1280 px

- Full sidebar.
- Editor plus quality/preview rail.
- Tables for lists and contacts.
- Sticky editor header and optional sticky quality rail.

### 768-1279 px

- Collapsible rail or drawer.
- Editor single column; preview opens full-width drawer.
- Filters collapse into a filter sheet.
- Lists retain essential columns only.

### < 768 px

- Mobile app bar with menu and current section.
- Single-column forms and blocks.
- List rows become cards.
- Sticky bottom action bar for `Save draft` and `Publish`; it must not cover focused fields or browser safe areas.
- Secondary/destructive actions move to an overflow sheet.
- Locale tabs are horizontally scrollable with visible focus and selected state; content itself never scrolls horizontally.
- Touch targets minimum 44 x 44 px.

Mandatory viewport QA: 320x568, 375x812, 390x844, 768x1024, 1024x768, 1440x900.

## 14. System States and Feedback

Every route/component must define:

- Initial loading: structural skeleton, not a blank panel.
- Refreshing: preserve existing content with subtle progress.
- Empty: explain why and provide one next action.
- Filtered empty: keep filters visible and allow reset.
- Saving/uploading/publishing: immediate disabled/progress state.
- Success: clear message plus relevant next action.
- Validation error: field error and summary linking to the field/locale.
- Network/service unavailable: preserve unsaved input and provide retry.
- Access required (`401`): redirect/auth guidance without exposing data.
- Access forbidden (`403`): identity shown where safe and no retry loop.
- Missing configuration (`503`): identify Access, D1, R2, or media configuration category without leaking secrets.
- Optimistic conflict (`409`): compare/reload/copy path.
- Deleted/archived: clear read-only/status treatment and restore action.
- Offline: do not imply save/publish succeeded.

Toast messages are for short confirmations. Blocking errors and publish validation remain inline/persistent. Live regions announce concise state changes, not entire error documents.

## 15. Accessibility Requirements

- WCAG 2.2 AA target for admin workflows.
- Landmarks: header, navigation, main, complementary preview rail where appropriate.
- Skip link to main editor/list content.
- One `h1` per route; heading hierarchy follows screen structure.
- Navigation uses links and `aria-current`; tabs implement the full tabs keyboard pattern.
- Every input has a visible label, description when needed, and field-specific error association.
- Required fields are conveyed programmatically and in text.
- Focus moves to route/editor headings after SPA-like navigation and returns predictably after dialogs/drawers.
- Dialogs have accessible name/description, focus trap, Escape close where safe, and trigger focus return.
- Destructive confirmation cannot rely on color or icon alone.
- Block reorder/delete works with keyboard and screen reader announcements.
- Status badges contain readable text; icons are decorative unless they add distinct information.
- Zoom to 200% must not lose actions or require two-dimensional scrolling.
- Japanese/Chinese content does not depend on word spaces for wrapping.
- Reduced motion removes nonessential transitions without removing feedback or content.

## 16. Motion Specification

Motion communicates hierarchy and state; it is never a continuous decoration.

- Route/view entry: short fade and small translate on the main content only.
- Sidebar active indicator: direct positional transition.
- Drawer/sheet: transform plus opacity with focus available only after opening.
- Save/publish: immediate button state, subtle progress, then check/status confirmation.
- Block insertion/reorder: brief positional continuity; no bounce.
- Toast: enter ease-out, exit ease-in.
- Upload: real progress where available; indeterminate treatment otherwise.

Use transform and opacity for motion. Avoid animating layout dimensions, box shadows, or large background effects. Motion must not delay input or navigation.

Under `prefers-reduced-motion: reduce`:

- Remove translation/scale and decorative stagger.
- Keep immediate opacity/state changes where needed for comprehension.
- Do not set long-running animation loops.

## 17. Cloudflare Paid and Performance Constraints

1. Use Workers Paid capacity deliberately, but do not add Cloudflare Images, Stream, paid Access features or a third-party CMS without a measured product need.
2. Access is active for the production application. A deployment to another account/zone must still treat activation and any Dashboard billing/quota confirmation as an explicit owner action.
3. All admin APIs use bindings (`CONTENT_DB`, `CONTACT_DB`, `MEDIA`) rather than Cloudflare REST calls from the Worker.
4. D1 lists are paginated and index-aligned. Avoid N+1 queries and repeated full counts on every interaction.
5. Dashboard summaries may use a small batched set of aggregate queries, cached only within the current response. Admin responses remain `private, no-store`.
6. Explicit draft save avoids a D1 write per keystroke. Bulk publish is bounded and validated before the write batch.
7. R2 uploads stream and remain bounded by the 8 MB application rule. Media grids use thumbnails/appropriately sized sources when available.
8. No attempt is made to display authoritative Cloudflare plan usage without an approved, scoped account API integration; initial release links to Dashboard instead.
9. Client bundle remains small. A framework may be introduced only if code splitting and interaction complexity justify it; do not ship a heavy editor framework merely for layout.
10. Public content caching behavior is separate from admin. Admin and preview are always private/no-store.
11. Quota numbers are not hard-coded into UI or documentation without verification against current Cloudflare docs/account entitlements.

### 17.1 Verified Paid-plan boundaries as of 2026-07-24

These numbers are implementation constraints, not marketing copy. Re-check them before release because Cloudflare can change plan terms.

- Workers Paid permits up to 10,000 subrequests per invocation and six simultaneous outgoing connections; the five-minute cron has 30 seconds of CPU and up to 15 minutes of wall time. Static Asset requests still bypass the User Worker when the route is not Worker-first. Source: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
- The deployed Worker runs on the Paid plan. D1 permits up to 1,000 queries per invocation; statements inside `db.batch()` still count individually. The maintenance sweep reserves 133 queries below that ceiling (867 worst-case) and keeps payOS reconciliation, payment expiry and reservation release bounded. Source: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
- R2 Standard currently includes 10 GB-month storage, 1 million Class A operations, and 10 million Class B operations per month in its free tier; Internet egress is free. The free tier does not apply to Infrequent Access storage. Source: [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

### 17.2 Current implementation constraints and follow-up work

1. `assets.run_worker_first` now uses a reviewed dynamic-route allowlist. Packaged assets bypass the User Worker; SSR/API/admin, locale routes and canonical redirects remain Worker-first. Keep this allowlist synchronized whenever a new dynamic route is added. Source: [Static Assets billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).
2. Bulk publish is hard-capped at `4` items per request in the API and smoke contract. Do not raise the cap until a query-budget test proves validation, mutation, audit and post-read stay within the current D1 Paid invocation boundary with headroom.
3. Query-budget instrumentation for overview, list, save, publish and future dashboard aggregates remains follow-up work. Passing small fixtures alone is not proof of Paid-plan safety.
4. The admin must not fetch authoritative Cloudflare billing/quota usage through account REST APIs. Provide external Dashboard links and application-level health only.

## 18. Security and Access Requirements

- Cloudflare Access protects exact `tung.codes/admin` and wildcard `tung.codes/admin/*`.
- Keep `workers_dev: false`; production must not expose a secondary `workers.dev` hostname outside the Access-protected custom domain.
- Canonical admin hostname is the apex. Any `www` request must redirect to apex before reaching an unprotected application surface.
- Worker verifies `Cf-Access-Jwt-Assertion` signature, issuer, audience, expiry, subject, and email allowlist before any D1/R2 access.
- Mutations require same-origin `Origin`, same-site fetch context, CSRF cookie/header match, allowed content type, and body limit.
- Access and CSRF tokens remain in secure cookies/in-memory runtime; never place them in URLs or persistent browser storage.
- Admin shell, API, preview, contacts, and media preview return `private, no-store`; admin shell also returns noindex headers/meta.
- CSP continues to restrict media to the approved R2 custom domain and blocks framing.
- Move the monolithic inline admin CSS/JavaScript toward bundled same-origin assets so CSP can remove or narrow `'unsafe-inline'`. This refactor must not delay Access enforcement or weaken the current CSP while migration is incomplete.
- External links use HTTPS and safe opener behavior.
- Raw errors, SQL, secrets, binding IDs, and JWT contents are not rendered to users.
- Destructive actions are audited with actor, entity, request ID, and timestamp.
- A visible shell caused by Access misconfiguration must still reveal no data because every API independently authenticates.
- Access is active in production for exact `/admin` and wildcard `/admin/*`; release QA must still verify both unauthenticated redirect behavior and an allowed owner session.

## 19. API/Data Extensions and Remaining Roadmap

The redesign cannot be completed only with CSS. Backend scope and current status:

| Capability | Status |
| --- | --- |
| Overview summary with bounded aggregates and recent audit entries | Pending |
| Content list pagination, server search, status/readiness filters and localized display title | Partial; current list is bounded by the existing API and filtered in the shell |
| Publish-readiness response grouped by locale/field | Partial; server validation exists, dedicated quality response/UI pending |
| Draft preview route reading a specific draft revision | Pending |
| Revision list/detail/restore-as-new-draft contract | Partial; revision APIs and normal restore exist, compare/restore-from-history UI pending |
| Media list/search/detail/reference count/soft-delete endpoints | Pending; upload/read-by-ID exists |
| Contacts list/detail/search/update endpoints over `CONTACT_DB` | Implemented |
| Contact notes and activity events | Implemented by CONTACT migration `0004` |
| Structured settings schema beyond `contactEmail` | Pending |

Every new mutation keeps optimistic versioning, validation, CSRF, Access authorization, and audit logging.

`AdminBindings` already includes `CONTACT_DB`, and CRM endpoints are implemented. The contact schema remains physically separate from `CONTENT_DB`; no CMS migration may be applied to the contact database.

## 20. Admin Delivery Sequence and Status

| Phase | Status | Implemented artifact | Exit for next maturity level |
| --- | --- | --- | --- |
| 1. Shell/foundation | Baseline complete | Editorial tokens, rail navigation, feedback, confirmations and responsive shell | Browser-addressable sub-routes replace view-only navigation |
| 2. Overview/lists | Partial | Content lists, search, active/deleted scope and clear states | Overview attention queue, bounded aggregates, readiness/status filters |
| 3. Editor | Baseline complete | Four-locale editor, structured blocks, dirty guard, optimistic save and publish validation | Locale tabs/quality rail, field-linked issues and real preview |
| 4. Revisions/preview | Partial | Revision list/detail APIs and immutable revision workflow | Compare UI, restore-as-new-draft and Access-protected preview route |
| 5. Media | Partial | R2 upload, validation, public URL and cover assignment | Browse/search/usage/soft-delete/purge library |
| 6. Contacts CRM | Baseline complete | Inbox/detail, filters/search, status/stage/priority, tags, notes, follow-up, activity and email handoff | Optional provider integration and tested retention/deletion workflow |
| 7. Settings/health | Partial | Versioned contact email and advanced config | Structured profile/SEO fields and binding health surface |
| 8. Hardening/release | Baseline complete | Responsive behavior, reduced motion, Access/CSRF/JWT/no-store, smoke/check/build/dry-run and production verification | Dedicated automated a11y and D1 query-budget suites |

Each step must leave existing publish/security behavior functional; visual refactoring cannot bypass current server checks.

Before production cutover, list and apply all pending migrations for both databases rather than assuming the seed migration is the latest. Take a D1 bookmark/export before any data-removal migration. Revision/audit/contact growth must be reviewed against the verified D1 storage boundary and receive a documented archival/retention procedure before it approaches operational risk.

Known controlled risks for the next increment:

- R2 objects become public and long-cacheable after upload. The current baseline has no complete browse/delete/purge workflow, so sensitive or draft-only media must never be uploaded.
- `CONTENT 0005` now preserves safe siblings when sanitizing a list. Because production had already recorded this migration name before the source hardening, changing the file does not replay it remotely; production data was audited after the original application, and any future corrective data change must use a new forward migration.

## 21. Acceptance Criteria

### IA and navigation

- [ ] Overview, Pages, Projects, Journal, Media, Contacts, and Settings have distinct URLs and headings.
- [ ] Refresh/back/forward preserve route and selected item.
- [ ] Desktop sidebar, medium rail/drawer, and mobile drawer meet the responsive behavior above.
- [ ] Primary navigation uses links with `aria-current`, not incomplete tab semantics.

### Dashboard

- [ ] Dashboard shows actionable drafts, incomplete locales, new contacts, recent activity, and binding/configuration health.
- [ ] It does not show invented analytics, Cloudflare usage, or fake metrics.
- [ ] Every dashboard item links to the relevant workflow.

### Content/editor

- [ ] Lists expose localized title, workflow state, four-locale readiness, update time, and next action.
- [ ] Editor separates common metadata, localized content, SEO, preview, and publishing.
- [ ] Locale tabs expose Ready/Incomplete/Empty/Invalid and work by keyboard.
- [ ] Routine editing never requires media IDs or JSON.
- [ ] Dirty state and navigation warning prevent accidental loss.
- [ ] `409` conflict cannot silently overwrite content.
- [ ] Publish requires explicit review and all server-side four-locale checks.
- [ ] Unpublish/delete/restore use distinct confirmations and retain revision history.
- [ ] Changing section/item or opening Settings with dirty data presents a leave/discard/cancel decision; browser refresh/close warns when supported.
- [ ] Trash is reachable after reload, supports Deleted/All filtering, and Restore returns an item to a reviewable draft state.
- [ ] Save/publish/delete/settings/upload disable duplicate triggers, expose `aria-busy`/progress, and announce completion or failure.

### Media

- [ ] Authors can browse, search, preview, select, and inspect asset usage.
- [ ] Upload file and alt controls have visible labels and field-specific errors; placeholders are never the only accessible name.
- [ ] Upload enforces raster formats and 8 MB application limit client- and server-side.
- [ ] R2 keys remain immutable; referenced assets cannot be hard-deleted.
- [ ] No paid image transformation product is required.

### Contacts

- [ ] Owner can list, search, filter, open, and update contact status.
- [ ] Reply action is honestly represented as external email handoff unless a provider is implemented.
- [ ] Contact PII never enters cache, analytics, URL, local storage, or public logs.
- [ ] Contact access requires verified Access identity and is audited.

### Settings

- [ ] Common owner tasks use structured fields.
- [ ] Advanced JSON is optional, collapsed, and clearly labeled diagnostic functionality.
- [ ] Binding/Access health is visible without exposing secrets or claiming plan usage.

### Accessibility and responsive

- [ ] Full workflows are keyboard-completable at 100% and 200% zoom.
- [ ] Focus management is tested for navigation, editor entry, dialogs, drawers, and block operations.
- [ ] Field errors are programmatically associated and publish summaries link to exact fields/locales.
- [ ] Status is never color-only; contrast meets WCAG 2.2 AA.
- [ ] 320, 375, 390, 768, 1024, and 1440 px layouts have no clipped actions or horizontal content overflow.
- [ ] Reduced-motion mode preserves all content and feedback.

### Security and Cloudflare

- [ ] Access protects both `/admin` and `/admin/*` in production.
- [ ] Direct API requests without valid Access JWT never read D1/R2.
- [ ] Mutations without valid Origin/CSRF are rejected.
- [ ] Admin/API/preview/contact/media responses remain private/no-store; admin remains noindex.
- [ ] D1 queries are paginated/indexed and media uploads are streamed/bounded.
- [ ] `/_astro/*` and other packaged static assets bypass the User Worker in production; verified static requests do not consume Worker request allocation.
- [x] The maintenance path is tested against the Paid-plan 1,000-query D1 ceiling (867 worst-case statements).
- [x] Current bulk publish rejects more than 4 items in the API; a higher cap requires a set-based implementation and a query-budget test proving compliance with the current D1 invocation boundary.
- [ ] No mandatory paid Cloudflare service or unverified quota number is introduced.
- [ ] `workers_dev` remains disabled and no alternate hostname bypasses the Access-protected apex route.
- [ ] Admin production bundle is compatible with a tightened CSP; any remaining `'unsafe-inline'` is documented as a temporary migration constraint.

### Verification

- [ ] Unit/smoke tests cover routing, auth, CSRF, validation, conflict, publish readiness, media, and contacts.
- [ ] Automated accessibility checks run on every main admin route.
- [ ] Manual keyboard and screen-reader checks cover one complete edit/publish and contact-processing workflow.
- [ ] Production QA verifies allowed and denied Access identities, exact/wildcard protected paths, D1/R2 bindings, and real draft preview.
- [ ] Production QA verifies there are no pending migrations for `CONTACT_DB` or `CONTENT_DB`, and confirms a recovery bookmark/export exists before data-removal migrations.

## 22. Non-Goals for the First Redesign

- Multi-tenant admin or public user accounts.
- Custom password authentication.
- Collaborative real-time editing.
- Automated machine translation publishing.
- Email campaign or full sales CRM automation.
- Cloudflare account billing/quota dashboard inside the app.
- Arbitrary HTML/WYSIWYG execution.
- Cloudflare Images/Stream dependency.
- Automatic AI-generated media publishing.
