# ARCHIVED SOURCE BRIEF — REFERENCE ONLY

Operational source of truth: `README.md`, `CONTENT.md`, `DESIGN_SYSTEM.md`, the current source code and verified Cloudflare configuration. Do not reinitialize or migrate the stack based on this archived brief.

# CODEX MASTER PROMPT
## Build a World-Class Portfolio for an Independent Product Builder

**Primary target:** OpenAI Codex  
**Project type:** Premium personal portfolio and product-builder identity  
**Default implementation:** Next.js App Router + TypeScript + Tailwind CSS + Motion  
**Default language:** English with Vietnamese-ready content architecture  
**Quality bar:** International design studio / premium technology company  
**Default owner name:** TUNG — keep all identity content centralized and easy to replace

---

# HOW TO USE THIS FILE

Paste this entire document into Codex as the primary instruction for the project.

Codex must treat this file as:

1. A product requirements document.
2. A creative direction brief.
3. A UX specification.
4. A design-system specification.
5. A frontend implementation specification.
6. A testing and acceptance checklist.

Codex must not interpret this as a request for a visual mockup only. The required output is a complete, production-quality website implementation.

If an existing repository is provided, Codex must inspect the repository before making changes. Preserve useful architecture and existing working behavior. Replace weak design or implementation only where necessary.

If no repository exists, initialize a clean production-ready project.

---

# 0. EXECUTION PROTOCOL FOR CODEX

You are acting simultaneously as:

- Creative Director
- Brand Strategist
- Senior Product Designer
- UX Writer
- Design Systems Lead
- Staff Frontend Engineer
- Accessibility Specialist
- Performance Engineer
- SEO Engineer
- QA Engineer

You must take ownership of decisions.

Do not ask the user to choose between multiple design directions unless a missing legal, identity, or factual detail makes implementation impossible. For ordinary design and engineering choices, make the strongest reasonable decision and continue.

Do not stop after producing a plan.

Do not stop after producing wireframes.

Do not stop after creating a hero section.

Do not stop after scaffolding components.

Complete the website to a production-ready state.

Work in the following order:

1. Inspect the repository and existing assets.
2. Identify the current stack and constraints.
3. Create or refine the information architecture.
4. Establish content data and design tokens.
5. Build the page shell and global layout.
6. Implement the home page.
7. Implement work and case-study pages.
8. Implement supporting pages.
9. Add motion and interactions.
10. Add responsive behavior.
11. Add accessibility and reduced-motion behavior.
12. Add SEO, metadata and structured data.
13. Add validation, analytics hooks and contact behavior.
14. Test, audit and fix.
15. Provide a concise completion summary.

Before editing code:

- Read `package.json`.
- Read the existing folder structure.
- Read existing global styles.
- Identify the package manager.
- Identify installed UI and animation libraries.
- Identify lint, type-check and test commands.
- Search for existing design tokens and reusable components.
- Search for existing content and assets.
- Never install a competing framework without a concrete reason.

When choosing dependencies:

- Prefer existing dependencies.
- Avoid unnecessary packages.
- Prefer browser-native features and CSS where practical.
- Use Motion only for purposeful interaction and reveal behavior.
- Do not add GSAP unless the requested behavior cannot be achieved cleanly with CSS or Motion.
- Do not add a heavy icon library when a small icon set or inline SVG is sufficient.
- Do not add a CMS unless one already exists or the content architecture clearly requires it.
- Keep the system deployable to Vercel or Cloudflare without vendor lock-in.

When editing:

- Use strict TypeScript.
- Avoid `any`.
- Avoid duplicated markup.
- Keep content separate from presentation.
- Keep animation values centralized.
- Keep project data centralized.
- Use semantic HTML.
- Preserve keyboard accessibility.
- Provide meaningful error and empty states.
- Respect `prefers-reduced-motion`.
- Do not hide important content on mobile.
- Do not ship placeholder lorem ipsum.

At the end:

- Run type checking.
- Run linting.
- Run tests.
- Run a production build.
- Fix all preventable errors.
- Report any remaining limitation honestly.

---

# 1. PRODUCT VISION

This website is not a standard developer portfolio.

It is the digital identity of an independent product builder who can:

- Discover valuable business problems.
- Design products around real operational needs.
- Architect scalable software systems.
- Build full-stack applications.
- Automate repetitive business processes.
- Understand payments, invoicing and operational infrastructure.
- Make difficult product and business decisions.
- Turn software into an operating business.

The website must position the owner above the category of “freelance web developer.”

The desired position is:

> Independent Product Builder  
> Product Architect  
> Systems Thinker  
> Technical Founder  
> Strategic Engineering Partner

The visitor should leave with the impression:

> “This person can take a complex business problem, design the product, architect the system, build it and make it commercially useful.”

The website must feel like the personal site of someone capable of building significant infrastructure products.

It must not feel like:

- A junior developer portfolio.
- A résumé converted into a website.
- A generic Next.js template.
- A theme marketplace demo.
- A personal blog with decorative animation.
- A neon cyberpunk interface.
- A collection of technology logos.
- A gallery of screenshots without strategic context.
- A job-seeker page filled with skill percentages.
- An imitation of Apple, Stripe, Vercel or Linear.

Use those companies only as quality references for restraint, clarity, hierarchy and execution.

---

# 2. BUSINESS GOALS

The website must support the following outcomes:

## Primary outcomes

1. Establish credibility with startup founders, operators, technical leaders and potential partners.
2. Demonstrate the ability to build products, not only interfaces.
3. Showcase selected projects through business, product and technical reasoning.
4. Generate high-quality conversations for collaboration, consulting, partnerships or investment.
5. Create a durable personal brand that remains relevant as products evolve.

## Secondary outcomes

1. Show engineering depth without overwhelming non-technical visitors.
2. Show product judgment, including the ability to stop or archive weak opportunities.
3. Create a professional destination for GitHub, social profiles, introductions and media references.
4. Support future Vietnamese and English content.
5. Support future articles, experiments and project updates without redesigning the core system.

## Explicit non-goals

Do not optimize the site primarily for:

- Mass freelance lead generation.
- A large résumé download funnel.
- Entry-level employment applications.
- Publishing daily blog posts.
- Showing every experiment ever created.
- Maximizing visual effects.
- Demonstrating every frontend library.

---

# 3. AUDIENCE

## Primary audience A — Startup founders

They need to understand:

- Can this person identify the right problem?
- Can this person make product decisions?
- Can this person build an MVP that can become a real system?
- Can this person communicate clearly?
- Can this person balance speed, cost and long-term architecture?

## Primary audience B — CTOs and technical leaders

They need to understand:

- Is the engineering thinking credible?
- Are architecture decisions intentional?
- Does the person understand reliability, security and observability?
- Can the person work across product and infrastructure?
- Can the person avoid unnecessary complexity?

## Primary audience C — Investors and strategic partners

They need to understand:

- Does this person think in markets and systems?
- Can this person allocate resources rationally?
- Can this person build defensible infrastructure?
- Is there evidence of persistence and judgment?
- Can this person communicate a product thesis?

## Secondary audience — Designers and engineers

They need to see:

- Craft.
- Technical depth.
- Reusable systems.
- Good collaboration instincts.
- Respect for UX and accessibility.

## Secondary audience — Recruiters

They are not the main audience, but the site should still make the owner’s role, capabilities, location and availability understandable within 30 seconds.

---

# 4. CORE POSITIONING

Use this as the central positioning statement:

> I design and build digital infrastructure for real businesses.

Supporting statement:

> I work across product strategy, system architecture and full-stack engineering to turn complex operations into software that can scale.

Alternative short statement for metadata and compact layouts:

> Independent product builder focused on SaaS, business automation and financial infrastructure.

Brand promise:

> Complex inside. Simple outside.

Builder philosophy:

> Own the critical layers. Integrate the commodity layers.

Business principle:

> Technology is never the goal. Business impact is.

---

# 5. BRAND CHARACTER

The brand must feel:

- Calm
- Precise
- Strategic
- Technical
- Mature
- Independent
- Premium
- Human
- Intentional
- Globally credible

The brand must not feel:

- Loud
- Aggressive
- Hype-driven
- Childish
- Gamer-oriented
- Trend-dependent
- Corporate and faceless
- Overly luxurious
- Pretentiously artistic
- Artificially mysterious

Writing tone:

- Direct.
- Specific.
- Understated.
- Confident without exaggeration.
- Technically literate.
- Business-aware.
- Short sentences where possible.
- No empty claims such as “passionate,” “innovative,” “world-class” or “results-driven” unless supported by evidence.

---

# 6. CREATIVE DIRECTION

Combine the following design influences:

- Cinematic dark minimalism.
- Editorial typography.
- Premium B2B SaaS clarity.
- Technical system-diagram precision.
- Selective Bento composition.
- Subtle scrollytelling.
- Monochrome photography or abstract system imagery.
- High-quality motion with long, calm easing.
- Spacious layouts with deliberate asymmetry.

Approximate visual ratio:

- 70% clarity and restraint.
- 20% character and editorial expression.
- 10% motion and surprise.

The design must rely primarily on:

- Typography.
- Proportion.
- Rhythm.
- Content hierarchy.
- Art direction.
- Transitions.
- Composition.

It must not rely primarily on:

- Gradients.
- Glassmorphism.
- Neon glows.
- 3D gimmicks.
- Decorative particles.
- Excessive shadows.
- Repeated cards.
- Oversized rounded rectangles everywhere.

---

# 7. ANTI-TEMPLATE RULES

The final site must not resemble a generic AI-generated portfolio.

Avoid these patterns:

1. A centered hero with a circular avatar above it.
2. “Hi, I’m X” followed by rotating job titles.
3. A row of social icons directly under the hero.
4. Skill progress bars.
5. Skill percentages.
6. A giant logo cloud.
7. Every section inside a rounded card.
8. Purple-blue gradients.
9. Animated glowing blobs.
10. A grid of six identical project cards.
11. Floating technology icons.
12. A fake terminal as the primary identity device.
13. Excessive glass panels.
14. A timeline copied from a résumé.
15. Generic testimonials without real attribution.
16. A contact form presented as the entire final section without a strong statement.
17. More than one primary accent color.
18. Multiple font styles competing for attention.
19. Scroll-jacking.
20. Long loading intros.
21. Custom cursors that harm usability.
22. Text marquees running continuously.
23. Decorative 3D scenes unrelated to the work.
24. Hover effects that move content dramatically.
25. Repeated “Learn more” buttons.
26. Generic headings such as “What I do” and “My skills” without stronger editorial framing.
27. Empty metrics.
28. Fake client logos.
29. Fake user numbers.
30. Any unsupported claim.

---

# 8. CONTENT TRUTH RULE

Never invent:

- Revenue.
- Customer count.
- Transaction count.
- Uptime.
- Number of invoices.
- Number of users.
- Number of countries.
- Client names.
- Testimonials.
- Awards.
- Funding.
- Production scale.
- Security certification.

When real metrics are unavailable, use one of these approaches:

1. Show scope metrics that can be verified from the repository.
2. Show architecture characteristics instead of business numbers.
3. Mark the value as “In development.”
4. Use qualitative outcomes.
5. Use a visible placeholder in the centralized content file.
6. Omit the metric entirely.

Examples of acceptable scope metrics:

- Number of product domains.
- Number of modules.
- Number of services.
- Number of workflows automated.
- Number of integrations.
- Number of supported roles.
- Number of major architectural layers.

Only display them if verified.

---

# 9. SITE ARCHITECTURE

Implement a hybrid portfolio:

## Primary pages

1. `/` — Home
2. `/work` — Selected work index
3. `/work/logivn` — LogiVN case study
4. `/work/payment-infrastructure` — Payment infrastructure case study
5. `/work/fball` — Fball.vn case study
6. `/about` — About and working principles
7. `/lab` — Experiments, research and active explorations
8. `/contact` — Contact and collaboration
9. `/privacy` — Privacy statement if analytics or contact storage is used

## Utility routes

- `/sitemap.xml`
- `/robots.txt`
- Open Graph image route if generated programmatically.
- RSS only if articles are implemented.

## Navigation behavior

Primary desktop navigation:

- Work
- Lab
- About
- Contact

Identity mark on the left:

- “TUNG” or owner name.
- A compact product-builder descriptor may appear after scrolling.

Right-side status:

- “Available for selected projects”
- Small status dot.
- Language switch if localization is implemented.

Mobile navigation:

- Clear menu button.
- Full-screen or large-sheet navigation.
- No tiny floating icons.
- Close with Escape.
- Trap focus when open.
- Restore focus after closing.
- Prevent background scroll while open.

---

# 10. HOME PAGE NARRATIVE

The home page is a story, not a collection of independent components.

Narrative sequence:

1. Identity.
2. What the owner builds.
3. Why that matters.
4. What is currently being built.
5. Evidence through selected work.
6. Product and system thinking.
7. Working philosophy.
8. Invitation to collaborate.

The visitor should understand the owner’s positioning before seeing the technology stack.

---

# 11. GLOBAL PAGE SHELL

## Header

Desktop:

- Position sticky.
- Transparent initially.
- Gains a subtle surface and hairline border after scrolling.
- Maximum height around 72px.
- Content aligned to global grid.
- Name mark on left.
- Navigation in center or left-center.
- Availability and language on right.

Scrolled state:

- Slightly reduced vertical padding.
- Background becomes `rgba(9,10,12,0.82)`.
- Use backdrop blur only where supported and not excessively.
- Border becomes visible.
- Transition duration 300–450ms.

Mobile:

- Height around 60–64px.
- Name mark left.
- Menu button right.
- Status text may be omitted, but availability can be shown inside menu.

## Main

- Use semantic `<main>`.
- Maintain consistent page gutters.
- Avoid outer card containers.
- Use full-bleed sections only for intentional cinematic moments.

## Footer

Footer should contain:

- Owner name.
- One-sentence positioning.
- Location.
- Current year.
- Navigation.
- Selected social links.
- Email.
- Privacy link if relevant.

The footer should feel conclusive, not like an afterthought.

---

# 12. HERO SECTION

## Goal

Communicate identity and positioning within five seconds.

## Layout

Desktop:

- Minimum height approximately 85svh, but avoid fragile fixed-height assumptions.
- Two-column composition.
- Left side: copy.
- Right side: portrait or abstract system visual.
- Align the bottom of the hero content with a subtle project/status strip.

Mobile:

- Copy first.
- Visual second.
- Keep the main headline fully readable without forced awkward line breaks.
- Do not make the portrait occupy the entire first viewport.

## Hero eyebrow

Use:

`INDEPENDENT PRODUCT BUILDER · VIETNAM / JAPAN`

If location is uncertain, centralize it as editable content.

Use uppercase mono or small sans typography with wide tracking.

## Hero headline

Default:

> I design and build  
> digital infrastructure  
> for real businesses.

Use an editorial serif for one meaningful phrase or the entire headline, depending on visual balance.

Preferred implementation:

- “I design and build” in sans or compact serif.
- “digital infrastructure” in editorial serif.
- “for real businesses.” in sans or serif based on composition.

Do not mix more than two typefaces in the headline.

## Hero supporting copy

Default:

> I work across product strategy, system architecture and full-stack engineering to turn complex operations into software that can scale.

Maximum comfortable width: 48–58 characters.

## Hero actions

Primary:

`Explore selected work`

Secondary:

`How I build`

Behavior:

- Primary scrolls or routes to selected work.
- Secondary routes to About or philosophy section.
- Use real links for navigation.
- Do not use button elements for links.

## Hero visual

Preferred priority:

1. A strong monochrome portrait supplied by the user.
2. A purpose-built abstract architecture composition.
3. A restrained typographic/diagram composition.

If no portrait exists:

- Do not fetch random stock photography.
- Do not invent a face.
- Build an abstract visual from SVG lines, nodes and a subtle grid.
- The visual should suggest system architecture, coordination and scale.
- Keep it monochrome with a very restrained accent.

Portrait treatment when available:

- Black and white.
- Strong contrast.
- Natural grain.
- No fake lens flare.
- No rounded profile-card appearance.
- Use a thoughtful crop.
- Maintain responsive focal point.
- Include meaningful alt text.

## Hero detail strip

Optional bottom row:

- Currently building: LogiVN.
- Focus: SaaS, operations, financial infrastructure.
- Status: Available for selected collaborations.

This row should be subtle and not compete with the headline.

---

# 13. MISSION STATEMENT SECTION

Use a large editorial statement that unfolds as the visitor scrolls.

Default copy:

> I do not build isolated features.  
> I build systems that can operate, scale and become businesses.

Alternative expanded sequence:

> I do not build websites.  
> I build systems.  
> Systems that remove repetitive work.  
> Systems that support real operations.  
> Systems that can become businesses.

Choose one sequence, not both.

Interaction:

- Each line transitions from muted to primary text as it enters the active reading zone.
- Use opacity and color, not dramatic movement.
- Use a sticky or progressive reveal only if it remains smooth on low-powered devices.
- Disable sticky complexity under reduced motion.
- Ensure all text is present in the DOM and readable without JavaScript.

---

# 14. AT-A-GLANCE SECTION

Use a selective Bento layout, but avoid equal repetitive cards.

Section label:

`AT A GLANCE`

Section heading:

> Product thinking, engineering and business operations — in one practice.

Suggested items:

## Card A — Currently building

Title:

`LogiVN`

Body:

> A modular operating system for small and medium businesses, with workflows spanning operations, invoicing and financial administration.

Status:

`ACTIVE DEVELOPMENT`

## Card B — Core disciplines

- Product strategy
- System architecture
- Full-stack engineering
- Business automation

## Card C — Focus domains

- SaaS
- Business operations
- Payments
- Invoicing
- Tax workflows
- Internal tools

Only include tax claims as a focus, not as a certified product capability, unless verified.

## Card D — Builder philosophy

> Own the critical layers. Integrate the commodity layers.

## Card E — System status

Display a restrained status list:

- LogiVN — Active
- Payment infrastructure — Research / Prototype
- Fball.vn — Archived

Do not mimic a bright gaming terminal.

## Card F — Location and working mode

Default:

`Vietnam / Japan`

Supporting line:

> Independent, remote-first and comfortable working across product, design and engineering.

## Composition rules

- One large card.
- Two medium cards.
- Two or three compact cards.
- Vary span and height with purpose.
- Maintain a clear reading order.
- Do not make every card interactive.
- Avoid icons unless they add meaning.

---

# 15. SELECTED WORK SECTION

Section label:

`SELECTED WORK`

Heading:

> Products built around real operational problems.

Intro:

> A small selection of projects showing how I move from problem definition to product architecture and implementation.

Show exactly three primary projects by default:

1. LogiVN.
2. Payment Infrastructure.
3. Fball.vn.

Each project entry should feel like an editorial feature, not a small card.

## Project display pattern

Desktop:

- Alternating large media and text.
- At least one project can use a sticky media frame.
- Use project number.
- Use status.
- Use domain tags.
- Include a concise thesis.
- Include one outcome or scope statement.
- Include an explicit case-study link.

Mobile:

- Media above text.
- Preserve project number and status.
- Keep CTA visible.
- Avoid horizontal drag interactions.

## Project hover behavior

- Image scale from 1 to approximately 1.015–1.025.
- Border or overlay changes subtly.
- Arrow shifts 2–4px.
- Text remains stable.
- No large card tilt.
- No pointer-following distortion.

---

# 16. PROJECT 01 — LOGIVN

## Positioning

Name:

`LogiVN`

Category:

`Business Operating System`

One-line thesis:

> A modular operating platform designed to simplify daily operations for small and medium businesses.

Suggested tags:

- SaaS
- Operations
- Inventory
- Invoicing
- Automation
- Financial workflows

Only use tags that are truly supported by the project.

## Home-page summary

> LogiVN brings fragmented operational workflows into one coherent system, designed to remain simple for the user while supporting complex rules behind the interface.

## Case-study narrative

### Context

Small and medium businesses often operate across disconnected tools, spreadsheets, messaging apps and manual paperwork. The result is duplicate work, inconsistent data and poor visibility.

### Product question

> How can one system reduce operational fragmentation without forcing small businesses to adopt enterprise-level complexity?

### Responsibilities

Use only verified responsibilities. Default editable list:

- Product strategy
- Information architecture
- System design
- Full-stack implementation
- Workflow automation
- Infrastructure decisions

### Product principles

1. Start with operational truth, not feature categories.
2. Keep common actions fast.
3. Make business rules explicit.
4. Automate repetitive work.
5. Preserve auditability.
6. Scale module by module.
7. Keep critical data portable.

### Show system domains

Potential domains:

- Organization and permissions.
- Customer and supplier records.
- Product and inventory.
- Sales workflows.
- Purchase workflows.
- Invoice workflows.
- Payment reconciliation.
- Reporting.
- Notifications.
- Audit logs.
- Integrations.

Do not imply every domain is complete. Mark each as:

- Live.
- In progress.
- Planned.
- Research.

### Architecture presentation

Show a simplified diagram with:

- Web application.
- API layer.
- Authentication.
- Domain services.
- Relational database.
- Queue or background jobs.
- Object storage.
- Integration adapters.
- Observability.

Use the actual architecture when known.

### Key design challenge

Explain how the interface hides complexity without hiding important business state.

### Business value

Use qualitative language unless metrics are verified:

- Reduces duplicated operational work.
- Consolidates fragmented data.
- Creates consistent workflows.
- Establishes a foundation for invoicing and financial administration.
- Enables future integration without redesigning the entire product.

### Reflection

Include a concise founder-level reflection:

> The difficult part was not adding features. It was deciding which operational concepts had to become stable foundations before the product could expand safely.

---

# 17. PROJECT 02 — PAYMENT INFRASTRUCTURE

## Positioning

Name:

`Payment Infrastructure`

Category:

`Programmable Payment Operations`

One-line thesis:

> A programmable layer for payment confirmation, transaction matching, webhook delivery and merchant reconciliation.

Status should default to:

`RESEARCH / PROTOTYPE`

Do not present it as a production payment processor unless it truly is one.

## Product problem

Many startups need reliable confirmation and reconciliation but do not need to become licensed payment processors. They need infrastructure that connects bank or payment signals to product workflows.

## Core capabilities to illustrate

- Payment intent creation.
- Reference generation.
- Transaction ingestion.
- Matching rules.
- Idempotent processing.
- Webhook signing.
- Retry strategy.
- Delivery logs.
- Reconciliation.
- Merchant configuration.
- Audit history.
- Alerting.

## Important compliance framing

Clearly distinguish:

- Payment orchestration.
- Payment confirmation.
- Transaction reconciliation.
- Licensed payment processing.
- Banking services.

Never claim the system holds funds or acts as a licensed processor unless verified.

## Architecture diagram

Suggested flow:

1. Merchant application creates a payment intent.
2. Infrastructure produces a unique reference.
3. Transaction signals enter through supported adapters.
4. Matching engine evaluates amount, reference and timing.
5. Confirmed state is written idempotently.
6. Signed webhook is sent to the merchant.
7. Failed deliveries enter retry workflow.
8. Dashboard exposes evidence and audit history.

## Product principles

- Idempotency by default.
- Auditability.
- Clear failure states.
- Secure webhook verification.
- Retry without duplicate business actions.
- Separation of merchant state and provider state.
- Low operational cost.
- Replaceable adapters.

## Case-study conclusion

> The product value is not the payment screen. It is the reliable state transition between money movement and the merchant’s software.

---

# 18. PROJECT 03 — FBALL.VN

## Positioning

Name:

`Fball.vn`

Category:

`Sports Content Platform`

Status:

`ARCHIVED`

Do not hide the archived status.

## Strategic role

Use this project to demonstrate judgment, experimentation and resource allocation.

## Case-study focus

- Original hypothesis.
- Audience or market need.
- Product and content architecture.
- What was built.
- What was learned.
- Why focus shifted.
- How the decision improved resource allocation.

## Suggested narrative

> Fball.vn explored how a focused football platform could combine content, structured data and product experiences. The project became valuable not only for what was built, but for the decision to stop expanding it when another opportunity showed stronger strategic value.

## Key message

Stopping a project can be evidence of discipline.

Avoid framing the project as failure.

Use language such as:

- Archived.
- Paused.
- Strategic focus shift.
- Resource reallocation.
- Thesis not strong enough to justify continued investment.

## Reflection

> Building is only one part of product judgment. Knowing when not to continue is equally important.

---

# 19. CASE-STUDY PAGE TEMPLATE

Every project page must use a consistent architecture without feeling mechanically identical.

## Required sections

1. Project hero.
2. Project thesis.
3. Context.
4. Problem.
5. Role and responsibilities.
6. Constraints.
7. Product principles.
8. System or information architecture.
9. Selected flows.
10. Design decisions.
11. Technical decisions.
12. Outcomes or current state.
13. What changed.
14. Reflection.
15. Next project navigation.

## Project hero content

- Project number.
- Name.
- Category.
- Status.
- One-sentence thesis.
- Date range if verified.
- Role.
- Hero visual.
- Link to live product or repository if public.

## Context section

Use concise paragraphs and one strong pull quote.

## Constraint section

Examples:

- Limited budget.
- Solo or small-team execution.
- Need for rapid iteration.
- Complex business rules.
- Regulatory boundaries.
- Integration uncertainty.
- Mobile-heavy usage.
- Low-cost infrastructure.

Only include real constraints.

## Architecture section

- Use diagrams that remain understandable on mobile.
- Provide accessible text descriptions.
- Show only meaningful layers.
- Avoid showing every database table.
- Clearly label synchronous versus asynchronous flows where relevant.
- Use consistent visual grammar across case studies.

## Outcome section

When metrics are unavailable:

- Show completed scope.
- Show current maturity.
- Show operational improvements.
- Show architectural readiness.
- Show lessons.

## Reflection section

Must include a genuine tradeoff or lesson.

Avoid generic statements such as “I learned a lot.”

---

# 20. ABOUT PAGE

The About page should explain how the owner thinks and works.

## Hero heading

> I work at the intersection of product, engineering and business operations.

## Intro copy

> My focus is building practical systems that remove repetitive work and give smaller businesses access to infrastructure usually associated with larger organizations.

## Suggested sections

### A. Operating perspective

Explain that the owner starts from operational reality, not from a list of features.

### B. How I work

1. Understand the business system.
2. Identify the highest-leverage constraint.
3. Define stable product concepts.
4. Build the smallest coherent system.
5. Measure behavior and operational outcomes.
6. Expand only when the foundation supports it.

### C. Principles

Use three to five principles:

- Complex inside, simple outside.
- Automate before adding process.
- Own the critical layers.
- Make failure states visible.
- Build for change, not speculation.

### D. Capabilities

Group by outcomes, not technologies:

- Product strategy.
- Product architecture.
- Full-stack systems.
- Workflow automation.
- Financial and operational integrations.
- Technical discovery.
- MVP-to-platform evolution.

### E. Current focus

- LogiVN.
- Electronic invoicing.
- Tax workflow integration.
- Low-cost payment operations.
- Infrastructure for small businesses.

### F. Personal note

Keep it human and brief.

Do not create a long autobiographical timeline unless real details are supplied.

---

# 21. LAB PAGE

Purpose:

Show active thinking without diluting the main portfolio.

Possible categories:

- Research.
- Prototypes.
- Architecture notes.
- Product experiments.
- Build logs.
- Decision memos.

Default entries:

1. Payment confirmation and reconciliation.
2. Electronic invoicing architecture.
3. Tax workflow automation.
4. Low-cost infrastructure patterns.
5. AI-assisted product development.

Each lab item should include:

- Status.
- Question.
- Why it matters.
- Current conclusion.
- Last updated date.
- Link to detail if content exists.

Avoid a generic blog-card grid.

Use an index that feels like a research notebook or technical archive.

---

# 22. CONTACT EXPERIENCE

## Goal

Invite high-quality conversations, not generic form submissions.

## Heading

> Let’s build something meaningful.

## Supporting copy

> I am open to selected collaborations involving SaaS, operational systems, payment infrastructure and product architecture.

## Collaboration categories

Optional selection:

- Product collaboration.
- Technical architecture.
- SaaS build.
- Operational automation.
- Strategic partnership.
- Other.

## Form fields

Required:

- Name.
- Email.
- What are you building?
- What problem are you trying to solve?

Optional:

- Company.
- Website.
- Budget range.
- Timeline.

Do not force budget if the site is not intended as a freelance sales funnel.

## Form behavior

- Validate on blur and submit.
- Preserve user input after recoverable errors.
- Show clear success state.
- Show clear error state.
- Include a honeypot field.
- Add rate limiting at the server or provider level if the form is live.
- Do not expose API keys.
- Do not fake submission success.
- If no backend is configured, provide a mailto fallback and clearly mark integration configuration.

## Direct contact

Display an editable email address.

Social links should be limited to relevant platforms:

- GitHub.
- LinkedIn.
- X only if actively used.

Do not show empty or inactive channels.

---

# 23. CONTENT MODEL

Create a centralized content architecture.

Preferred files:

- `content/site.ts`
- `content/projects.ts`
- `content/navigation.ts`
- `content/social.ts`
- `content/lab.ts`

Or a single structured content directory if MDX is used.

## Example site content structure

```ts
export const siteConfig = {
  name: "TUNG",
  fullName: "Tung",
  role: "Independent Product Builder",
  location: "Vietnam / Japan",
  email: "hello@example.com",
  availability: "Available for selected projects",
  description:
    "Independent product builder focused on SaaS, business automation and financial infrastructure.",
};
```

Use obvious placeholders for unknown values.

Do not scatter owner identity strings across components.

## Project data

Each project should support:

- slug
- number
- name
- category
- status
- summary
- thesis
- responsibilities
- domains
- stack
- date
- links
- hero media
- sections
- metrics
- architecture nodes
- next project

Prefer typed data.

---

# 24. COPYWRITING RULES

## General

- Use active voice.
- Prefer concrete nouns and verbs.
- Remove filler.
- Avoid exaggerated adjectives.
- Avoid repeating “build” in every sentence.
- Avoid using “innovative.”
- Avoid “passionate developer.”
- Avoid “crafting digital experiences.”
- Avoid “turning ideas into reality.”
- Avoid “pixel-perfect” in public-facing copy.
- Avoid excessive em dashes.
- Keep paragraphs short.
- Use headings that communicate an argument.

## Project copy

Do not describe only features.

For every project, explain:

1. What operating problem existed?
2. Why was it difficult?
3. What product concept simplified it?
4. What architecture supported that concept?
5. What tradeoff was made?
6. What changed as a result?

## Technical language

Use enough technical detail to establish credibility.

Provide plain-language context so non-technical visitors can follow.

Example:

Weak:

> Implemented Kafka and Redis for scalability.

Better:

> Separated immediate user actions from background processing so integrations and retries could fail safely without blocking the core workflow.

Then optionally identify the technologies.

---

# 25. DESIGN SYSTEM — COLOR

## Core tokens

```css
:root {
  --background: 42 14% 4%;
  --foreground: 60 9% 95%;

  --surface-1: 220 15% 8%;
  --surface-2: 220 13% 10%;
  --surface-3: 220 11% 13%;

  --muted: 218 8% 57%;
  --muted-foreground: 218 8% 66%;

  --border: 0 0% 100% / 0.08;
  --border-strong: 0 0% 100% / 0.14;

  --accent: 78 100% 65%;
  --accent-foreground: 80 40% 6%;

  --danger: 3 78% 61%;
  --success: 142 55% 55%;
  --warning: 39 92% 60%;
}
```

If using hex tokens:

- Background: `#090A0C`
- Surface 1: `#111317`
- Surface 2: `#15181D`
- Primary text: `#F4F4F2`
- Secondary text: `#8F949D`
- Accent: `#C8FF4D`
- Border: `rgba(255,255,255,0.08)`
- Strong border: `rgba(255,255,255,0.14)`

## Color usage

Accent may be used for:

- Primary CTA.
- Active navigation indicator.
- Small status dot.
- Diagram highlight.
- Important keyword.
- Focus ring.
- Selected filter.

Accent must not be used for:

- Large page backgrounds.
- Every icon.
- Every heading.
- Multiple card borders.
- Large gradient washes.
- Body copy.

## Contrast

- All essential text must meet WCAG AA.
- Muted text must remain readable.
- Do not use opacity so low that text disappears on common displays.
- Test focus rings against every surface.

## Optional light mode

Do not implement light mode unless it is executed with equal quality.

A poor light mode is worse than a focused dark-only experience.

If implemented:

- Use warm off-white.
- Preserve the editorial identity.
- Avoid pure white.
- Test all media and diagrams.

---

# 26. DESIGN SYSTEM — TYPOGRAPHY

## Font strategy

Preferred:

- Editorial display: Instrument Serif.
- Sans: Geist or Inter.
- Mono: Geist Mono or IBM Plex Mono.

Use local or framework-supported font loading.

Avoid layout shift.

Use `next/font` when using Next.js.

Do not load excessive font weights.

Suggested weights:

- Serif: 400.
- Sans: 400, 500, 600.
- Mono: 400, 500.

## Type scale

Use fluid `clamp()` values.

Suggested tokens:

```css
--text-xs: clamp(0.72rem, 0.69rem + 0.12vw, 0.8rem);
--text-sm: clamp(0.84rem, 0.80rem + 0.16vw, 0.94rem);
--text-base: clamp(1rem, 0.96rem + 0.18vw, 1.12rem);
--text-lg: clamp(1.2rem, 1.08rem + 0.5vw, 1.48rem);
--text-xl: clamp(1.5rem, 1.3rem + 0.9vw, 2.1rem);
--text-2xl: clamp(2rem, 1.55rem + 1.8vw, 3.2rem);
--text-3xl: clamp(2.8rem, 1.9rem + 3.3vw, 5.5rem);
--text-display: clamp(3.4rem, 2rem + 5.7vw, 8.5rem);
```

## Line height

- Display: 0.92–1.02.
- Major headings: 1.0–1.1.
- Body: 1.55–1.75.
- Labels: 1.2–1.4.

## Tracking

- Display serif: slightly negative where visually appropriate.
- Uppercase labels: positive tracking.
- Body: normal.
- Avoid excessive negative tracking on mobile.

## Typography rules

- Maximum body line length: approximately 65–72 characters.
- Maximum hero supporting copy: approximately 52–58 characters.
- Keep orphaned single words under control using balanced wrapping when supported.
- Do not manually add `<br>` everywhere.
- Use explicit line breaks only when editorial composition requires them.
- Test localization expansion.

---

# 27. DESIGN SYSTEM — SPACING

Use a consistent spacing scale.

```css
--space-1: 0.25rem;
--space-2: 0.5rem;
--space-3: 0.75rem;
--space-4: 1rem;
--space-5: 1.25rem;
--space-6: 1.5rem;
--space-8: 2rem;
--space-10: 2.5rem;
--space-12: 3rem;
--space-16: 4rem;
--space-20: 5rem;
--space-24: 6rem;
--space-32: 8rem;
--space-40: 10rem;
--space-48: 12rem;
```

Section spacing:

- Mobile: 88–120px.
- Tablet: 120–168px.
- Desktop: 160–240px.
- Project hero may use larger spacing.

Page gutters:

- Mobile: 20px.
- Large mobile: 24px.
- Tablet: 40px.
- Desktop: 64px.
- Wide desktop: 80px.

Use CSS variables or utility abstractions to keep gutters consistent.

---

# 28. DESIGN SYSTEM — GRID

## Desktop

- 12 columns.
- Maximum content width: 1280–1360px.
- Wide visual sections may extend to 1480–1600px.
- Gap: 24–32px.

## Tablet

- 8 columns.
- Gap: 20–24px.

## Mobile

- 4 columns.
- Gap: 16px.

## Alignment rules

- Reuse key vertical axes.
- Align section labels.
- Align body copy across sections where reasonable.
- Allow intentional asymmetry, not accidental misalignment.
- Avoid centering everything.
- Use full-width media only when it supports the narrative.

---

# 29. DESIGN SYSTEM — SURFACES

## Radius

Use fewer radii.

Suggested:

- Small controls: 10px.
- Buttons: 999px or 12px depending on direction.
- Standard cards: 16–20px.
- Large media frame: 24px.
- Avoid 32px+ unless justified.

## Borders

- Hairline borders.
- Use borders to define structure, not decorate.
- Increase border contrast on hover only slightly.

## Shadows

Keep shadows subtle.

Preferred:

```css
box-shadow:
  0 1px 0 rgba(255,255,255,0.03) inset,
  0 24px 80px rgba(0,0,0,0.24);
```

Do not use glow shadows around every element.

## Grain

A subtle global grain overlay may be used if:

- It is lightweight.
- It does not reduce readability.
- It is disabled or simplified on low-power/mobile devices.
- It does not animate continuously.

---

# 30. ICONOGRAPHY

Use icons only when they improve scanning or indicate interaction.

Preferred style:

- Simple line icons.
- Consistent stroke.
- Mostly monochrome.
- 16–20px for UI.
- 24px for section support.

Avoid:

- Colorful brand icons in main storytelling.
- Large decorative icon circles.
- Inconsistent icon sets.
- Emoji as primary UI.
- Icons without labels in ambiguous contexts.

Technology logos may appear in the stack section, but keep them restrained and secondary.

---

# 31. BUTTONS AND LINKS

## Primary button

- Accent background.
- Dark text.
- Strong focus state.
- Subtle hover lift or arrow shift.
- No glow.
- No dramatic scaling.

## Secondary button

- Transparent or subtle surface.
- Hairline border.
- Primary text.
- Hover surface increase.

## Text link

- Underline reveal or arrow shift.
- Must remain understandable without hover.
- Use visible focus style.

## Interaction geometry

- Minimum target size: 44x44px.
- Do not place tiny adjacent links.
- Use consistent padding.

---

# 32. NAVIGATION DETAILS

## Active state

Use one restrained technique:

- Small accent dot.
- Underline.
- Text-color change.

Do not combine all three.

## Anchor behavior

- Respect reduced motion.
- Account for sticky header.
- Update URL only where useful.
- Avoid scroll position surprises.

## Page transition

Optional:

- Short opacity/blur transition.
- Keep duration under approximately 500ms.
- Do not block navigation.
- Do not animate the entire page from extreme positions.
- Respect browser history and loading states.

---

# 33. MOTION SYSTEM

Motion must communicate hierarchy and state.

## Motion principles

1. Motion explains change.
2. Motion directs attention.
3. Motion preserves spatial continuity.
4. Motion never delays access.
5. Motion must remain usable at 60fps.
6. Motion must degrade gracefully.

## Duration tokens

```ts
export const duration = {
  instant: 0.12,
  fast: 0.2,
  normal: 0.36,
  slow: 0.56,
  cinematic: 0.78,
};
```

## Easing tokens

Suggested CSS:

```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
--ease-soft: cubic-bezier(0.22, 1, 0.36, 1);
```

## Reveal behavior

Default reveal:

- `opacity: 0` to `1`.
- `transform: translateY(16px)` to `0`.
- Optional blur `8px` to `0`.
- Duration 500–700ms.
- Stagger 60–100ms.
- Trigger once for ordinary content.

Do not animate every paragraph.

## Hover motion

- Card media scale: maximum 1.025.
- Arrow translation: maximum 4px.
- Card elevation: maximum 4px.
- Button translation: maximum 2px.

## Scroll-linked motion

Use sparingly.

Allowed:

- Mission statement active-line reveal.
- One sticky project sequence.
- Subtle visual progress.
- Very small parallax depth.

Disallowed:

- Pinning every section.
- Horizontal scrolling as the main navigation.
- Scroll velocity distortion.
- Large camera movements.
- Content that becomes unreadable when JavaScript fails.

## Reduced motion

When `prefers-reduced-motion: reduce`:

- Disable parallax.
- Disable scroll-linked transforms.
- Remove blur transitions.
- Use near-instant opacity changes.
- Preserve navigation state.
- Preserve all content.

---

# 34. RESPONSIVE DESIGN

Do not “shrink the desktop design.”

Recompose each major section.

## Breakpoint strategy

Use content-driven breakpoints.

Suggested:

- Small: below 480px.
- Mobile: 480–767px.
- Tablet: 768–1023px.
- Desktop: 1024–1439px.
- Wide: 1440px and above.

Align these with the project’s Tailwind configuration.

## Mobile rules

- Use 20–24px gutters.
- Keep body text at least 16px.
- Avoid tiny labels.
- Stack project media and copy.
- Remove nonessential decorative layers.
- Simplify architecture diagrams.
- Keep call-to-action buttons easy to reach.
- Avoid fixed-height sections.
- Avoid accidental horizontal overflow.
- Test long project names and translated content.
- Keep navigation understandable.
- Avoid hover-only information.

## Tablet rules

- Use split layouts selectively.
- Do not force desktop card spans.
- Preserve rhythm.
- Consider two-column Bento groups.

## Wide desktop rules

- Do not let text lines become too long.
- Use whitespace rather than endlessly expanding cards.
- Keep the visual focus near the content center.
- Ensure the hero does not look empty.

---

# 35. ACCESSIBILITY

Target WCAG 2.2 AA.

## Required

- Semantic landmarks.
- Correct heading hierarchy.
- One `<h1>` per page.
- Skip-to-content link.
- Keyboard navigation.
- Visible focus indicators.
- Meaningful link text.
- Proper form labels.
- Error association.
- Live regions for submission feedback.
- Alt text for meaningful images.
- Empty alt for decorative images.
- Captions or descriptions for complex diagrams.
- Color is not the only state indicator.
- Minimum target size.
- Reduced motion support.
- Sufficient contrast.
- No auto-playing audio.
- No flashing content.
- Dialog focus management.
- Escape closes dialogs and mobile navigation.
- Body scroll restoration.

## Architecture diagrams

Each diagram must have:

- A descriptive heading.
- A short plain-language summary.
- Accessible labels.
- A text fallback listing nodes and relationships.
- Clear distinction between decorative and semantic SVG elements.

## Forms

- Instructions before errors where needed.
- Inline errors.
- Error summary for multiple errors if useful.
- Do not clear fields after failed submission.
- Submit button state must be announced.
- Success state must be announced.

---

# 36. PERFORMANCE BUDGET

Target:

- Lighthouse Performance: 95+.
- Accessibility: 95+.
- Best Practices: 95+.
- SEO: 95+.
- LCP: under 2.5 seconds on realistic mobile conditions.
- CLS: under 0.1.
- INP: under 200ms where practical.
- Initial JavaScript kept minimal.
- No unnecessary client components.

## Rules

- Prefer Server Components.
- Mark components as client only when interaction requires it.
- Use optimized images.
- Use responsive image sizes.
- Define image dimensions or aspect ratios.
- Preload only critical fonts and hero media.
- Avoid large autoplay video.
- Avoid loading all project media on the home page at full resolution.
- Lazy-load below-the-fold media.
- Avoid heavy canvas effects.
- Avoid constant `requestAnimationFrame`.
- Avoid scroll listeners without throttling or framework support.
- Avoid bundle-heavy chart libraries for simple diagrams.
- Use SVG or CSS for diagrams.
- Remove unused code.
- Analyze bundle size if available.
- Avoid multiple animation frameworks.

## Hero media

If using video:

- Muted.
- No sound.
- Short.
- Optimized.
- Poster image.
- Respects data-saving and reduced-motion conditions.
- Does not delay text rendering.

Prefer still imagery unless video materially improves the identity.

---

# 37. SEO

## Metadata

Every page must have:

- Unique title.
- Unique description.
- Canonical URL.
- Open Graph metadata.
- Twitter/X card metadata if relevant.
- Robots directives.
- Appropriate image.
- Locale.

## Default title pattern

Home:

`Tung — Independent Product Builder`

Project:

`LogiVN — Product Case Study by Tung`

About:

`About — Tung, Independent Product Builder`

## Structured data

Use appropriate JSON-LD:

- `Person`.
- `WebSite`.
- `CreativeWork` or `SoftwareApplication` only where accurate.
- `BreadcrumbList` on project pages.

Do not add unsupported ratings, offers or organization claims.

## Technical SEO

- Semantic links.
- Sitemap.
- Robots file.
- Stable slugs.
- Correct status codes.
- No broken internal links.
- Descriptive image filenames.
- Meaningful alt text.
- No duplicate page titles.
- No inaccessible content hidden behind client-only rendering.

---

# 38. INTERNATIONALIZATION

Design content architecture for at least:

- English.
- Vietnamese.

Full translation implementation is optional unless the repository already supports it, but all content should be centralized enough to add localization later.

If language switching is implemented:

- Use proper locale routes or a robust locale strategy.
- Preserve the current page during language switch.
- Use correct `lang` attribute.
- Update metadata.
- Do not mix languages inside one page.
- Persist preference without blocking first render.
- Ensure Vietnamese diacritics render correctly.
- Test line wrapping in both languages.

Default public language: English, unless existing project context indicates Vietnamese is primary.

---

# 39. TECH STACK

## Preferred stack

- Next.js App Router.
- TypeScript.
- Tailwind CSS.
- Motion.
- MDX or typed content objects.
- Zod for server-side form validation if already present or useful.
- React Hook Form only if the form complexity justifies it.
- Resend or a compatible provider for email if configured.
- Plausible or Umami for privacy-friendly analytics if requested.

## Dependency discipline

Before installing a package, answer internally:

1. Can this be done with existing dependencies?
2. Can this be done with CSS?
3. Can this be done with platform APIs?
4. Is the package maintained?
5. Does it materially improve reliability or accessibility?
6. What is the bundle cost?

Do not install:

- A full component library only for two controls.
- A charting library for simple architecture diagrams.
- Multiple form libraries.
- Multiple animation libraries.
- A state manager for local page state.
- A carousel library for static project media.
- A smooth-scroll library unless the browser behavior is genuinely insufficient.

---

# 40. RECOMMENDED PROJECT STRUCTURE

Adapt to the existing repository.

Suggested structure:

```txt
app/
  (site)/
    page.tsx
    work/
      page.tsx
      [slug]/
        page.tsx
    about/
      page.tsx
    lab/
      page.tsx
    contact/
      page.tsx
    privacy/
      page.tsx
  api/
    contact/
      route.ts
  opengraph-image.tsx
  sitemap.ts
  robots.ts
  layout.tsx
  globals.css

components/
  brand/
    wordmark.tsx
    availability.tsx
  layout/
    site-header.tsx
    mobile-nav.tsx
    site-footer.tsx
    page-shell.tsx
  ui/
    button.tsx
    link-arrow.tsx
    section-label.tsx
    status-badge.tsx
    divider.tsx
    focus-ring.tsx
  sections/
    hero.tsx
    mission-statement.tsx
    at-a-glance.tsx
    selected-work.tsx
    philosophy.tsx
    contact-cta.tsx
  project/
    project-hero.tsx
    project-overview.tsx
    project-section.tsx
    project-media.tsx
    project-metrics.tsx
    project-navigation.tsx
    architecture-diagram.tsx
    flow-diagram.tsx
  motion/
    reveal.tsx
    stagger.tsx
    text-reveal.tsx
    reduced-motion.tsx
  forms/
    contact-form.tsx
    field.tsx
    form-status.tsx

content/
  site.ts
  navigation.ts
  projects.ts
  lab.ts
  social.ts

lib/
  analytics.ts
  metadata.ts
  validation.ts
  utils.ts
  motion.ts
  constants.ts

public/
  images/
  projects/
  portraits/
  fonts/
```

Do not create empty folders.

---

# 41. COMPONENT INVENTORY

Implement only components that are used.

## Foundation

1. `Container`
2. `Section`
3. `SectionLabel`
4. `SectionHeading`
5. `TextLink`
6. `PrimaryLink`
7. `SecondaryLink`
8. `StatusBadge`
9. `Divider`
10. `VisuallyHidden`

## Layout

11. `SiteHeader`
12. `DesktopNavigation`
13. `MobileNavigation`
14. `SiteFooter`
15. `PageIntro`
16. `PageTransition` if justified

## Home sections

17. `Hero`
18. `HeroVisual`
19. `HeroStatusStrip`
20. `MissionStatement`
21. `AtAGlanceGrid`
22. `BuildingCard`
23. `DisciplinesCard`
24. `DomainsCard`
25. `SystemStatusCard`
26. `LocationCard`
27. `SelectedWork`
28. `FeaturedProject`
29. `PhilosophyQuote`
30. `ContactCTA`

## Project system

31. `ProjectHero`
32. `ProjectMetadata`
33. `ProjectMedia`
34. `ProjectSection`
35. `ProjectPullQuote`
36. `ProjectMetric`
37. `ProjectMetricsGrid`
38. `ArchitectureDiagram`
39. `FlowDiagram`
40. `DecisionTable`
41. `ProjectGallery`
42. `ProjectNavigation`

## About and Lab

43. `PrinciplesList`
44. `CapabilityGroup`
45. `WorkingProcess`
46. `LabIndex`
47. `LabEntry`

## Forms

48. `ContactForm`
49. `FormField`
50. `FormMessage`
51. `SubmitButton`

## Motion

52. `Reveal`
53. `Stagger`
54. `ActiveLineText`
55. `ReducedMotionBoundary`

Avoid a component for every `<div>`.

---

# 42. TAILWIND AND TOKEN MAPPING

Extend Tailwind or use CSS variables so design decisions are centralized.

Example:

```ts
theme: {
  extend: {
    colors: {
      background: "hsl(var(--background))",
      foreground: "hsl(var(--foreground))",
      surface: {
        1: "hsl(var(--surface-1))",
        2: "hsl(var(--surface-2))",
        3: "hsl(var(--surface-3))",
      },
      accent: {
        DEFAULT: "hsl(var(--accent))",
        foreground: "hsl(var(--accent-foreground))",
      },
    },
    maxWidth: {
      content: "1360px",
      reading: "72ch",
    },
    transitionTimingFunction: {
      out: "cubic-bezier(0.16, 1, 0.3, 1)",
      soft: "cubic-bezier(0.22, 1, 0.36, 1)",
    },
  },
}
```

Do not use arbitrary values throughout the entire codebase when a stable token would be better.

Arbitrary values are acceptable for intentional one-off editorial composition.

---

# 43. SHADCN/UI POLICY

If shadcn/ui exists:

- Reuse accessible primitives.
- Restyle them to match the design system.
- Avoid making the site look like a default shadcn dashboard.
- Use Dialog or Sheet primitives for mobile navigation where useful.
- Use form primitives if they improve accessibility.
- Do not render default component examples.
- Remove unused generated components.

If shadcn/ui does not exist:

- Do not install it automatically unless it clearly reduces complexity.
- Native semantic controls may be sufficient.

---

# 44. IMAGE AND MEDIA STRATEGY

## Required media categories

- Owner portrait or abstract hero visual.
- One visual system per featured project.
- Architecture diagrams.
- UI product screenshots where available.
- Optional texture or process imagery.

## If project screenshots are available

- Use real screenshots.
- Crop intentionally.
- Mask sensitive information.
- Maintain legibility.
- Avoid placing screenshots inside fake browser frames by default.
- Use one frame style consistently if frames are used.

## If project screenshots are not available

Create high-quality abstract product visuals from:

- Data structures.
- Interface fragments.
- Workflow diagrams.
- Structured typography.
- System nodes.
- Subtle grid.
- Status indicators.

Do not fabricate realistic dashboards that imply nonexistent functionality.

## Image optimization

- Use `next/image`.
- Provide sizes.
- Use modern formats.
- Avoid loading original multi-megabyte files.
- Include responsive variants.
- Keep visual aspect ratios stable.

---

# 45. ARCHITECTURE DIAGRAM VISUAL LANGUAGE

Create a reusable diagram system.

## Nodes

Types:

- Client.
- Gateway.
- Service.
- Data store.
- Queue.
- Worker.
- External provider.
- Observer.

## Visual distinctions

Use shape, border style and labels, not many colors.

Example:

- Client: solid surface.
- Service: standard border.
- Data store: double-line or database icon.
- Queue: dashed border.
- External provider: muted border.
- Critical path: accent line.
- Async path: dashed connector.

## Connectors

- Arrow direction must be clear.
- Avoid crossing lines.
- Label important transitions.
- Use consistent spacing.
- Provide mobile alternative.

## Mobile fallback

For narrow screens, transform diagrams into:

- Vertical sequence.
- Numbered steps.
- Expandable text explanation.
- Simplified node list.

Do not force a tiny unreadable desktop diagram onto mobile.

---

# 46. HOME PAGE DETAILED BUILD ORDER

Implement in this sequence:

## Step 1 — Header

- Responsive.
- Accessible.
- Sticky.
- Scroll state.
- Mobile menu.

## Step 2 — Hero

- Copy.
- CTA.
- Visual.
- Status strip.
- Responsive line breaks.
- Motion.

## Step 3 — Mission statement

- Active-line progression.
- Reduced-motion fallback.

## Step 4 — At a glance

- Editorial Bento.
- Real content.
- Responsive spans.

## Step 5 — Selected work

- Three project features.
- Strong links.
- Real status labels.
- Image loading strategy.

## Step 6 — System-thinking proof

Add one strong section titled:

`FROM OPERATIONS TO ARCHITECTURE`

Heading:

> Good software begins with a clear model of the business.

Show a left-to-right or vertical conceptual progression:

- Operational reality.
- Product model.
- System boundaries.
- Reliable workflows.
- Business leverage.

This section should connect product thinking to engineering.

## Step 7 — Philosophy

Large quote and three principles.

## Step 8 — Contact CTA

Strong final statement.

## Step 9 — Footer

Complete identity and utility links.

---

# 47. WORK INDEX PAGE

The work index must provide more context than the home page.

## Hero

Heading:

> Selected products, systems and experiments.

Intro:

> Each project is presented through the problem, the decisions and the system behind the interface.

## Filtering

Do not add filtering unless more than six projects exist.

With three projects, use an editorial index.

## Project rows

Each row includes:

- Number.
- Name.
- Category.
- Status.
- Year or range if verified.
- Thesis.
- Link.

Use large visual rhythm and distinct project media.

## Archive

Include archived work transparently.

Archive label must not look like an error.

---

# 48. LAB INDEX PAGE

Use a denser information design than the portfolio.

Possible layout:

- Left: research categories.
- Main: chronological entries.
- Right: current questions or status.

On mobile, use one column.

Each entry:

- Date.
- Status.
- Topic.
- Question.
- Short conclusion.
- Read more link.

Status values:

- Active.
- Testing.
- Research.
- Paused.
- Archived.

---

# 49. LOADING, EMPTY AND ERROR STATES

## Loading

- Use layout-stable skeletons only where data is dynamic.
- Most portfolio content should render statically.
- Avoid full-page spinners.
- Do not delay text for media.

## Empty states

Examples:

- Lab has no published notes.
- Project link is private.
- Contact provider not configured.

State the limitation clearly and provide a useful alternative.

## Error states

- Use a designed 404 page.
- Include return links.
- Preserve brand tone.
- Avoid jokes that reduce professionalism.
- Contact form errors must be actionable.

---

# 50. 404 PAGE

Heading:

> This path does not belong to the system.

Supporting copy:

> The page may have moved, or the link may be incomplete.

Actions:

- Return home.
- View selected work.

Use a small diagram fragment or route motif.

Keep it lightweight.

---

# 51. ANALYTICS

Analytics must be privacy-conscious.

Track only meaningful events:

- Hero primary CTA click.
- Project case-study open.
- Contact CTA click.
- Contact form success.
- External GitHub click.
- External LinkedIn click.
- Language switch.
- Case-study completion proxy if useful.

Do not track:

- Every scroll movement.
- Cursor movement.
- Sensitive form field values.
- Personal message content.
- Excessive fingerprinting data.

Centralize analytics calls.

The site must work when analytics is blocked.

---

# 52. CONTACT BACKEND

Preferred behavior:

1. Client validates basic fields.
2. Server validates again.
3. Honeypot checked.
4. Rate limit applied.
5. Message sent through configured provider.
6. Generic success response returned.
7. Server logs exclude sensitive message contents where possible.
8. Error does not expose internal details.

Environment variables must be documented.

Example:

```env
RESEND_API_KEY=
CONTACT_TO_EMAIL=
CONTACT_FROM_EMAIL=
NEXT_PUBLIC_SITE_URL=
```

Do not commit secrets.

If provider integration is not possible:

- Build the UI and validation.
- Add a clear setup document.
- Use a working mailto fallback.
- Do not simulate successful delivery.

---

# 53. SECURITY

- Validate all form input.
- Sanitize or safely render user-provided content.
- Do not use `dangerouslySetInnerHTML` without controlled content.
- Set secure headers where practical.
- Use `rel="noopener noreferrer"` for appropriate external links.
- Protect contact endpoint from abuse.
- Do not expose environment variables.
- Do not log secrets.
- Keep dependencies current within repository constraints.
- Avoid arbitrary remote image domains.
- Avoid third-party scripts unless necessary.
- Use Content Security Policy if the deployment setup supports it cleanly.

---

# 54. CODE QUALITY

## TypeScript

- Strict mode.
- No avoidable `any`.
- Typed project data.
- Typed component props.
- Typed server responses.
- Discriminated unions for status where useful.

## React

- Prefer Server Components.
- Keep client boundaries small.
- Avoid unnecessary state.
- Avoid effects for derived values.
- Avoid unstable list keys.
- Avoid deeply nested prop drilling where a simpler composition works.
- Do not introduce global state without need.

## CSS

- Keep global CSS focused on tokens, base styles and utilities.
- Avoid massive page-specific global styles.
- Use Tailwind consistently.
- Use component CSS only for complex visual behavior.
- Avoid `!important`.
- Avoid magic z-index values.
- Document unusual techniques.

## Naming

- Use descriptive names.
- Avoid abbreviations such as `cmp`, `cnt`, `itm`.
- Use consistent project terminology.
- Match content vocabulary.

---

# 55. TESTING STRATEGY

Use the repository’s existing test stack.

If none exists, add the minimum appropriate setup.

## Required validation

1. Type check.
2. Lint.
3. Production build.
4. Key route rendering.
5. Mobile navigation interaction.
6. Contact form validation.
7. Keyboard navigation.
8. Reduced motion behavior.
9. Internal links.
10. No console errors.

## Recommended Playwright tests

- Home page loads.
- Header navigation works.
- Mobile menu opens and closes.
- Escape closes mobile menu.
- Focus returns to menu button.
- Selected project opens.
- Project page has one H1.
- Contact form rejects invalid email.
- Contact form error is announced.
- Skip link works.
- 404 route displays recovery links.

## Visual testing

Review at minimum:

- 375x812.
- 390x844.
- 768x1024.
- 1024x768.
- 1440x900.
- 1728x1117.

Check:

- Cropping.
- Wrapping.
- Overflow.
- Section rhythm.
- Image loading.
- Focus rings.
- Diagrams.
- Footer.

---

# 56. PERFORMANCE AUDIT CHECKLIST

- No oversized images.
- No unused video.
- No render-blocking third-party script.
- Fonts subset and optimized.
- Hero text renders immediately.
- Hero media does not cause CLS.
- Minimal client-side hydration.
- Motion components loaded only where required.
- No expensive blur applied to huge areas on mobile.
- No continuously animated grain.
- No giant SVG filters.
- No duplicate icon packages.
- No unnecessary polyfills.
- No repeated data fetching.
- Static generation used where appropriate.
- Sitemap generated correctly.
- Error pages lightweight.

---

# 57. ACCESSIBILITY AUDIT CHECKLIST

- Skip link visible on focus.
- Header controls labeled.
- Mobile menu state announced.
- Focus trap works.
- Focus order matches visual order.
- No keyboard trap.
- Visible focus on dark and accent backgrounds.
- Heading levels logical.
- Decorative images ignored.
- Project media alt text meaningful.
- Diagrams include text alternative.
- Form fields have labels.
- Required fields identified.
- Errors connected to fields.
- Success announced.
- Link purpose clear.
- Status not conveyed by color alone.
- Body text meets contrast.
- Muted text meets contrast.
- Motion reduction tested.
- 200% zoom usable.
- Page works without hover.
- Touch targets meet minimum size.

---

# 58. VISUAL QA CHECKLIST

- The page does not look like a template.
- The hero is visually distinctive.
- Typography is the primary identity device.
- Serif use is intentional.
- Accent is restrained.
- Whitespace is generous but not empty.
- No section feels copied from a dashboard.
- Cards do not dominate the entire layout.
- Project hierarchy is strong.
- Real content appears before technology logos.
- Animation is calm.
- No visual effect competes with reading.
- Mobile feels designed, not collapsed.
- The footer closes the story.
- The site remains credible with motion disabled.

---

# 59. CONTENT QA CHECKLIST

- No lorem ipsum.
- No fake metrics.
- No fake testimonials.
- No fake client logos.
- No unsupported “production” claim.
- Payment infrastructure framing is legally cautious.
- Archived project status is transparent.
- Every project explains a problem.
- Every project includes a decision.
- Every project includes a lesson.
- Technical terms receive context.
- Owner name and email centralized.
- Location centralized.
- Availability centralized.
- Project links accurate.
- Grammar consistent.
- English capitalization consistent.
- Status labels consistent.

---

# 60. FINAL ACCEPTANCE CRITERIA

The implementation is complete only when all mandatory criteria below are met.

## Brand

- The owner is positioned as an independent product builder.
- The website does not position the owner primarily as a job-seeking frontend developer.
- The tone is calm, premium and credible.
- The site has a distinct identity without visual excess.

## UX

- Core positioning is clear within the first viewport.
- Selected work is reachable immediately.
- Case studies are easy to scan.
- Contact path is obvious.
- Navigation works across all target sizes.
- Mobile experience preserves the core story.

## Design

- Dark editorial direction is consistent.
- One accent color is used.
- Typography and spacing create the premium feeling.
- Bento composition is selective.
- Project presentations feel substantial.
- Motion is purposeful.
- Diagrams are legible.

## Engineering

- TypeScript is strict.
- Components are reusable.
- Content is centralized.
- Client components are limited.
- Build succeeds.
- No critical lint error.
- No preventable console error.
- Dependencies are justified.
- Performance budget is respected.

## Accessibility

- WCAG AA target.
- Keyboard navigation.
- Visible focus.
- Reduced motion.
- Semantic HTML.
- Form accessibility.
- Diagram alternatives.

## Content

- No fake claims.
- LogiVN is the primary project.
- Payment infrastructure is framed accurately.
- Fball.vn is transparently archived.
- Product thinking is visible.
- Business impact is visible.
- Technical depth is visible.

---

# 61. DEFAULT PUBLIC-FACING COPY

Use this copy as the initial version. Keep it centralized and editable.

## Home hero

Eyebrow:

`INDEPENDENT PRODUCT BUILDER · VIETNAM / JAPAN`

Headline:

> I design and build  
> digital infrastructure  
> for real businesses.

Supporting copy:

> I work across product strategy, system architecture and full-stack engineering to turn complex operations into software that can scale.

Primary CTA:

`Explore selected work`

Secondary CTA:

`How I build`

## Mission

> I do not build isolated features.  
> I build systems that can operate, scale and become businesses.

## At a glance heading

> Product thinking, engineering and business operations — in one practice.

## Selected work heading

> Products built around real operational problems.

## Systems section

Label:

`FROM OPERATIONS TO ARCHITECTURE`

Heading:

> Good software begins with a clear model of the business.

Body:

> I translate operational reality into stable product concepts, clear system boundaries and workflows that can evolve without becoming fragile.

## Philosophy

Quote:

> Technology is never the goal. Business impact is.

Principles:

1. Complex inside, simple outside.
2. Own the critical layers.
3. Build for change, not speculation.

## Contact

Heading:

> Let’s build something meaningful.

Body:

> I am open to selected collaborations involving SaaS, operational systems, payment infrastructure and product architecture.

CTA:

`Start a conversation`

---

# 62. DEFAULT PROJECT COPY

## LogiVN

Name:

`LogiVN`

Category:

`Business Operating System`

Status:

`ACTIVE DEVELOPMENT`

Thesis:

> A modular operating platform designed to simplify daily operations for small and medium businesses.

Summary:

> LogiVN brings fragmented workflows into one coherent system, keeping common actions simple while supporting complex operational rules behind the interface.

Reflection:

> The difficult part was not adding features. It was deciding which operational concepts had to become stable foundations before the product could expand safely.

## Payment Infrastructure

Name:

`Payment Infrastructure`

Category:

`Programmable Payment Operations`

Status:

`RESEARCH / PROTOTYPE`

Thesis:

> A programmable layer for payment confirmation, transaction matching, webhook delivery and merchant reconciliation.

Summary:

> The product focuses on the reliable state transition between money movement and a merchant’s software, with auditability, idempotency and clear failure handling.

Reflection:

> The visible payment experience is only the surface. The real product is reliable operational state.

## Fball.vn

Name:

`Fball.vn`

Category:

`Sports Content Platform`

Status:

`ARCHIVED`

Thesis:

> An exploration of structured football content, product experiences and audience-focused publishing.

Summary:

> The project became valuable not only for what was built, but for the decision to stop expanding it when another opportunity showed stronger strategic value.

Reflection:

> Building is only one part of product judgment. Knowing when not to continue is equally important.

---

# 63. IMPLEMENTATION DECISION RULES

When a design question appears, follow this hierarchy:

1. Clarity.
2. Accessibility.
3. Content truth.
4. Performance.
5. Brand consistency.
6. Visual novelty.

When a technical question appears, follow this hierarchy:

1. Correctness.
2. Simplicity.
3. Maintainability.
4. Security.
5. Performance.
6. Extensibility.

When a conflict appears between an animation and usability:

Choose usability.

When a conflict appears between a visual trick and performance:

Choose performance.

When a conflict appears between a generic component and an intentional editorial composition:

Use the intentional composition, but keep its data and primitives reusable.

When a metric cannot be verified:

Omit or mark it clearly.

When a portrait is missing:

Use an abstract system visual.

When content is incomplete:

Use explicit centralized placeholders, not invented facts.

---

# 64. PHASED DELIVERY IN THE REPOSITORY

Codex must implement continuously, but organize work internally into these phases.

## Phase A — Foundation

- Repository inspection.
- Content model.
- Tokens.
- Fonts.
- Layout primitives.
- Header and footer.
- Metadata foundation.

## Phase B — Home

- Hero.
- Mission.
- At a glance.
- Selected work.
- Systems-thinking section.
- Philosophy.
- Contact CTA.

## Phase C — Work system

- Work index.
- Case-study template.
- Three project pages.
- Architecture components.
- Project navigation.

## Phase D — Supporting pages

- About.
- Lab.
- Contact.
- Privacy.
- 404.

## Phase E — Interaction and polish

- Motion.
- Hover.
- Scroll behavior.
- Mobile menu.
- Form states.
- Reduced motion.

## Phase F — Production readiness

- SEO.
- Analytics hooks.
- Contact backend or documented fallback.
- Accessibility.
- Performance.
- Tests.
- Build.
- Documentation.

Do not leave obvious sections as TODO unless a real external dependency is missing.

---

# 65. DOCUMENTATION TO CREATE

Create or update:

## `README.md`

Include:

- Project overview.
- Stack.
- Local setup.
- Environment variables.
- Content editing.
- Image replacement.
- Contact form setup.
- Analytics setup.
- Build and deployment.
- Testing commands.

## `CONTENT.md`

Include:

- Where owner identity is stored.
- Where project content is stored.
- Required fields.
- How to replace placeholders.
- How to add a project.
- How to add a Lab entry.
- Image requirements.

## Optional `DESIGN_SYSTEM.md`

Include:

- Color tokens.
- Typography.
- Spacing.
- Motion.
- Component rules.
- Accessibility expectations.

Do not create documentation that contradicts the code.

---

# 66. FINAL RESPONSE FORMAT FROM CODEX

After implementation, respond with:

## Completed

A concise explanation of what was built.

## Key decisions

The most important design and architecture decisions.

## Files changed

A compact summary by area, not a dump of every filename.

## Validation

Report results for:

- Type check.
- Lint.
- Tests.
- Production build.

## Configuration still required

List only real external items such as:

- Contact provider API key.
- Final portrait.
- Real email.
- Analytics domain.
- Production URL.

## Known limitations

Be honest.

Do not claim completion if the build fails.

---

# 67. FINAL CREATIVE DIRECTIVE

The final website must make the visitor feel that the owner understands the complete journey from business problem to operating software.

It should not say:

> “Look at the technologies I know.”

It should demonstrate:

> “I can understand a business system, define the right product, design the architecture, build the software and make rational decisions about what deserves continued investment.”

The site must be visually memorable because of judgment and restraint, not because of effects.

The final impression should be:

> This person does not merely build websites.  
> This person builds systems that can become businesses.

---

# BEGIN EXECUTION

Inspect the repository now.

Create a short internal implementation plan, then begin editing immediately.

Do not stop at analysis.

Do not return only a design proposal.

Build the complete production-ready website described above.

# END MASTER PROMPT
