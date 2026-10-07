export type ProjectStatus = "active" | "research" | "archived";
export type DomainMaturity = "live" | "in-progress" | "planned" | "research" | "archived";

export type ProjectLink = {
	label: string;
	href: string;
	external?: boolean;
};

export type ProjectDomain = {
	name: string;
	status: DomainMaturity;
};

export type ArchitectureNode = {
	name: string;
	description: string;
	kind: "interface" | "service" | "data" | "integration" | "operations";
};

export type Project = {
	slug: "logivn" | "payment-infrastructure" | "fball";
	number: string;
	name: string;
	category: string;
	status: ProjectStatus;
	statusLabel: string;
	thesis: string;
	summary: string;
	tags: readonly string[];
	date: string | null;
	role: string | null;
	links: readonly ProjectLink[];
	context: readonly string[];
	problem: string;
	responsibilities: readonly string[];
	constraints: readonly string[];
	principles: readonly string[];
	domains: readonly ProjectDomain[];
	architectureIntro: string;
	architectureNodes: readonly ArchitectureNode[];
	architectureDescription: string;
	selectedFlows: readonly string[];
	designDecisions: readonly string[];
	technicalDecisions: readonly string[];
	outcomes: readonly string[];
	currentState: string;
	whatChanged: string;
	reflection: string;
	nextSlug: Project["slug"];
};

export const projects = [
	{
		slug: "logivn",
		number: "01",
		name: "LogiVN",
		category: "Multi-tenant F&B SaaS",
		status: "active",
		statusLabel: "LIVE PRODUCT · ACTIVE DEVELOPMENT",
		thesis: "One operating flow from a guest's QR order to the kitchen, table and operations desk.",
		summary:
			"LogiVN is a multi-tenant operating platform for Vietnamese cafes and restaurants. It connects QR ordering, live order and kitchen workflows, tables, reservations, payments, inventory and staff operations without making each surface feel like a separate product.",
		tags: ["F&B SaaS", "QR ordering", "Kitchen operations", "Realtime", "Inventory", "Multi-tenant"],
		date: null,
		role: "Product strategy, architecture and full-stack implementation",
		links: [
			{ label: "Open LogiVN", href: "https://logivn.com", external: true },
		],
		context: [
			"A restaurant rarely has one workflow. Guests order, staff confirm, the kitchen prepares, tables change state, payments close and owners still need a trustworthy operational view.",
			"When each step lives in a different tool or chat thread, small changes create repeated coordination work. LogiVN treats the venue as one connected operating system while keeping each role's interface focused.",
		],
		problem:
			"How can a restaurant run one consistent flow across guests, service staff, kitchen and management without turning daily work into enterprise software?",
		responsibilities: [
			"Product direction and workflow definition",
			"Information and tenant architecture",
			"Customer, staff and platform-admin experiences",
			"Full-stack implementation",
			"Realtime state and integration boundaries",
			"Release verification and operations",
		],
		constraints: [
			"Guests must be able to order with almost no learning curve.",
			"Order state must remain consistent across customer, service and kitchen surfaces.",
			"Tenant data and permissions must stay isolated as the product expands.",
		],
		principles: [
			"Model the service flow before adding screens.",
			"Show each role only the decisions it needs to make.",
			"Keep operational state visible and explicit.",
			"Use realtime updates where waiting changes the work.",
			"Keep external providers behind replaceable adapters.",
		],
		domains: [
			{ name: "Tenant, venue and role boundaries", status: "live" },
			{ name: "QR menu, modifiers, combos and ordering", status: "live" },
			{ name: "Order, table and kitchen workflows", status: "live" },
			{ name: "Pickup, delivery and reservations", status: "live" },
			{ name: "Staff and permission management", status: "live" },
			{ name: "Inventory and operational analytics", status: "in-progress" },
			{ name: "Payments and VietQR workflows", status: "in-progress" },
			{ name: "Platform administration", status: "in-progress" },
		],
		architectureIntro:
			"Three product surfaces share the same tenant-aware operational state: the guest experience, the venue workspace and the platform control plane.",
		architectureNodes: [
			{
				name: "Guest ordering",
				description: "QR menu, modifiers, combos, ordering, service requests, pickup, delivery and reservations.",
				kind: "interface",
			},
			{
				name: "Venue workspace",
				description: "Realtime order, kitchen, table, payment, promotion, stock and staff workflows.",
				kind: "interface",
			},
			{
				name: "Tenant-aware application layer",
				description: "Authentication, roles, validation and business rules applied consistently across every surface.",
				kind: "service",
			},
			{
				name: "Operational data",
				description: "PostgreSQL records, realtime events and stored media separated by tenant and venue.",
				kind: "data",
			},
			{
				name: "Provider adapters",
				description: "Boundaries for maps, VietQR and AI providers so integrations do not own the core product model.",
				kind: "integration",
			},
		],
		architectureDescription:
			"LogiVN uses Next.js App Router, React and TypeScript for the product surfaces, with Supabase providing PostgreSQL, authentication, realtime and storage. Zustand and Zod keep client state and input contracts explicit; maps, VietQR and AI capabilities sit behind provider boundaries.",
		selectedFlows: [
			"A guest opens the QR menu, configures an item and sends an order into the venue's live queue.",
			"Service and kitchen staff move the same order through confirmation, preparation and completion without recreating it in another tool.",
			"Owners manage tables, reservations, payments, inventory and staff from the same tenant-aware workspace.",
		],
		designDecisions: [
			"Separate guest, staff and platform-admin surfaces while keeping their underlying state connected.",
			"Prioritize the next operational decision instead of exposing every available field at once.",
			"Use status, ownership and timestamps to make handoffs understandable during a busy service.",
		],
		technicalDecisions: [
			"Use tenant-aware data access and permissions as a foundation, not a later filter.",
			"Apply realtime updates to order and kitchen state where stale information creates immediate coordination cost.",
			"Validate boundaries with typed schemas and isolate replaceable external providers behind adapters.",
		],
		outcomes: [
			"A public product at logivn.com connects guest ordering with venue operations on one status model.",
			"Observable core loop: QR menu → order → kitchen/table → close of service, without chat-thread handoffs for those steps.",
			"Inventory, VietQR payments and platform admin expand on a defined tenant foundation — labelled in-progress, not fully done.",
			"No public claims of venue counts, revenue or service speed without verifiable sources.",
		],
		currentState:
			"LogiVN is publicly accessible at logivn.com and remains under active development. This case study describes verified product surfaces and does not publish unverified usage metrics.",
		whatChanged:
			"The project grew from solving individual restaurant tasks into defining a connected operating model for guests, venue teams and platform administration (2024 → present).",
		reflection:
			"The hard part is not adding another screen. It is keeping one order, one permission model and one operational truth intact as the product reaches more roles.",
		nextSlug: "fball",
	},
	{
		slug: "payment-infrastructure",
		number: "LAB",
		name: "Payment Operations Research",
		category: "Research note · not a launched product",
		status: "research",
		statusLabel: "RESEARCH",
		thesis: "What must be true before a payment signal can safely change merchant state?",
		summary:
			"An architecture study into payment confirmation, matching, signed webhook delivery and reconciliation. It is published as ongoing research, not presented alongside LogiVN and Fball as a finished product.",
		tags: ["Research", "Idempotency", "Reconciliation", "Webhooks"],
		date: null,
		role: "Architecture research and prototyping",
		links: [],
		context: [
			"A successful payment screen does not prove that a merchant system received trustworthy state.",
			"The useful design question begins after the transfer signal: how to match it, record it once, deliver it safely and explain every failure.",
		],
		problem:
			"How can transaction evidence become auditable merchant state without duplicated actions or claims that the software processes or holds funds?",
		responsibilities: ["Domain research", "Failure-state modelling", "Architecture prototyping"],
		constraints: [
			"The system must not imply banking, custody or licensed payment processing.",
			"Retries must never repeat a merchant action.",
			"Provider state and merchant state need separate, inspectable lifecycles.",
		],
		principles: ["Idempotency by default.", "Signed delivery.", "Visible evidence and failure history.", "Replaceable provider adapters."],
		domains: [
			{ name: "Payment intent and reference", status: "research" },
			{ name: "Transaction ingestion and matching", status: "research" },
			{ name: "Signed webhook delivery", status: "research" },
			{ name: "Reconciliation and audit history", status: "research" },
		],
		architectureIntro: "The study follows one state transition from external evidence to a merchant-visible event.",
		architectureNodes: [
			{ name: "Payment intent", description: "Defines the expected amount, reference and validity window.", kind: "service" },
			{ name: "Provider adapter", description: "Normalizes evidence without owning merchant state.", kind: "integration" },
			{ name: "Matching and idempotency", description: "Evaluates evidence and guarantees one state transition.", kind: "service" },
			{ name: "Audit store", description: "Retains the decision and delivery history.", kind: "data" },
			{ name: "Webhook delivery", description: "Signs events and retries recoverable failures.", kind: "operations" },
		],
		architectureDescription:
			"A merchant creates an intent; an adapter normalizes transaction evidence; matching rules evaluate amount, reference and time. Confirmed state is written idempotently before a signed webhook is delivered and every attempt is recorded.",
		selectedFlows: [
			"Create an intent with an unambiguous reference.",
			"Match external evidence against explicit rules.",
			"Commit state once, then deliver and retry a signed event.",
		],
		designDecisions: [
			"Show evidence and delivery history rather than compressing the workflow into one optimistic status.",
			"Keep the product language focused on confirmation and reconciliation, not movement or custody of funds.",
		],
		technicalDecisions: [
			"Make every state-changing operation idempotent.",
			"Keep provider adapters replaceable and delivery attempts auditable.",
		],
		outcomes: [
			"Intent–match–confirm model clear enough to prototype and test failure cases.",
			"Retry strategy documented so business actions are not repeated.",
			"Still research: no production claim about processing, holding or moving funds.",
			"Legal boundaries kept explicit in public copy.",
		],
		currentState: "Research and prototype work only (2025 → present). No production payment-processing capability is claimed.",
		whatChanged: "The focus moved from the checkout surface to the reliability and evidence behind a state transition.",
		reflection: "In payment operations, the happy path is a demo. The product is the evidence and recovery model around it.",
		nextSlug: "logivn",
	},
	{
		slug: "fball",
		number: "02",
		name: "Fball.vn",
		category: "Club OS for grassroots football",
		status: "active",
		statusLabel: "PUBLIC PRODUCT · EXPANDING",
		thesis: "Turn a scattered match plan into a repeatable rhythm for the whole team.",
		summary:
			"Fball brings match schedules, attendance, lineups, members and the team fund into one shared workspace, so captains can finalize the squad with less manual chasing and players always know what happens next.",
		tags: ["Football SaaS", "Team workspace", "Attendance", "Lineups", "Finance ledger", "Matchmaking", "Permissions"],
		date: null,
		role: "Product strategy, architecture and full-stack implementation",
		links: [
			{ label: "Open Fball.vn", href: "https://fball.vn", external: true },
		],
		context: [
			"Before a grassroots match, a captain needs three answers: when are we playing, who is coming and how will the squad be split? Those answers are often buried across long group-chat threads and hand-built lists.",
			"Fball gives each club its own workspace, turning recurring coordination into visible product state while keeping members, roles and team data inside a clear tenant boundary.",
		],
		problem:
			"How can a lightweight product remove match-day coordination work without taking away the flexibility and social rhythm of a grassroots team?",
		responsibilities: [
			"Product direction and club workflow modelling",
			"Team, membership and permission architecture",
			"Match-day experience and full-stack implementation",
			"Finance ledger and quota boundaries",
			"Release, SEO and provider-integration planning",
		],
		constraints: [
			"A captain needs to understand team status at a glance, often on mobile and close to kick-off.",
			"Team membership, roles and data must remain isolated by workspace.",
			"Features that incur provider costs must stay optional and controlled by flags or plan limits.",
		],
		principles: [
			"Make attendance a shared state, not another chat message.",
			"Build the match-day loop before expanding the platform.",
			"Keep roles and permissions explicit as teams grow.",
			"Require confirmation before automation changes club state.",
			"Gate provider-cost modules deliberately.",
		],
		domains: [
			{ name: "Authentication, onboarding and invitations", status: "live" },
			{ name: "Match calendar and attendance", status: "live" },
			{ name: "Squad, lineup and team splitting", status: "live" },
			{ name: "Members, roles and permissions", status: "live" },
			{ name: "Announcements and audit history", status: "live" },
			{ name: "Team fund and finance ledger", status: "live" },
			{ name: "Discovery, open match spots and recruitment", status: "live" },
			{ name: "Maps, venues and provider integrations", status: "in-progress" },
			{ name: "AI operator, media and Telegram adapters", status: "in-progress" },
		],
		architectureIntro:
			"Fball treats a team as the tenant: every match, attendance response, role and ledger entry belongs to one controlled workspace.",
		architectureNodes: [
			{
				name: "Club workspace",
				description: "Responsive product surfaces for schedules, attendance, lineups, members, announcements and funds.",
				kind: "interface",
			},
			{
				name: "Team and match domains",
				description: "Explicit rules for membership, permissions, match state, quotas and finance records.",
				kind: "service",
			},
			{
				name: "Supabase data boundary",
				description: "Authentication and PostgreSQL records protected by team-aware row-level security.",
				kind: "data",
			},
			{
				name: "Optional providers",
				description: "Provider-gated adapters for maps and venues, media, AI proposals, Telegram and other cost-bearing capabilities.",
				kind: "integration",
			},
			{
				name: "Audit and quota controls",
				description: "Operational evidence and plan boundaries that keep expansion inspectable.",
				kind: "operations",
			},
		],
		architectureDescription:
			"Fball uses Next.js App Router, React, TypeScript and Tailwind for the workspace. Supabase Auth and PostgreSQL with row-level security enforce team boundaries. Optional maps, media, AI and messaging modules remain behind feature flags and provider adapters.",
		selectedFlows: [
			"Publish a match once, then collect each player's attendance through one shared link and state model.",
			"Build a squad or split teams from the confirmed attendance list instead of recreating names by hand.",
			"Track contributions and expenses in a team ledger that members with the right role can review.",
			"Post an open match spot or request to join a team through the public discovery flow.",
		],
		designDecisions: [
			"Lead each match with time, venue, attendance and the next action a member needs to take.",
			"Keep captain controls distinct from the simpler member experience.",
			"Treat expansion modules as opt-in capabilities, not noise in the core match-day flow.",
		],
		technicalDecisions: [
			"Use team-aware row-level security to enforce tenant boundaries close to the data.",
			"Model roles, quotas and audit history before adding provider-driven automation.",
			"Keep maps, media, AI and messaging integrations disabled by default until configured and justified.",
		],
		outcomes: [
			"A public product at fball.vn for Vietnamese grassroots club operations — not a sports content platform.",
			"Live core loop: schedule, attendance, lineup, members, permissions and team fund in a team-scoped workspace.",
			"Public routes /tim-doi, /ghep-tran and /san-bong are live; AI, media and messaging remain gated.",
			"No public claims of team counts, match volume or conversion without verifiable sources.",
		],
		currentState:
			"Fball.vn is publicly accessible and actively expanding (2024 → present). The public app supports account confirmation, team onboarding and invitations, team-scoped match operations, finance and discovery; provider-dependent modules remain gated by configuration and plan limits.",
		whatChanged:
			"The product evolved from a match scheduler into a club operating system with membership, permissions, finance, public discovery and controlled provider integrations.",
		reflection:
			"The challenge is not adding more screens. It is keeping teams, permissions and state correct as a match-day tool grows into finance, discovery and automation.",
		nextSlug: "logivn",
	},
] as const satisfies readonly Project[];

export type ProjectSlug = (typeof projects)[number]["slug"];

export function getProject(slug: ProjectSlug): Project {
	const project = projects.find((candidate) => candidate.slug === slug);

	if (!project) {
		throw new Error(`Unknown project: ${slug}`);
	}

	return project;
}
