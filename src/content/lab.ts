export type LabStatus = "active" | "testing" | "research" | "paused" | "archived";

export type LabEntry = {
	slug: string;
	topic: string;
	category: "Infrastructure" | "Operations" | "Product development";
	status: LabStatus;
	statusLabel: string;
	question: string;
	whyItMatters: string;
	currentConclusion: string;
	lastUpdated: string;
	lastUpdatedLabel: string;
	href: string | null;
};

export const labEntries = [
	{
		slug: "payment-confirmation-reconciliation",
		topic: "Payment confirmation and reconciliation",
		category: "Infrastructure",
		status: "research",
		statusLabel: "RESEARCH",
		question: "What must be true before a transaction signal can safely change merchant state?",
		whyItMatters:
			"A payment flow is not reliable because the happy path looks clean. It is reliable when matching, retries and evidence remain understandable after a provider or network failure.",
		currentConclusion:
			"Start with idempotent state transitions, explicit matching rules and signed delivery. This is architecture research, not a claim of a launched payment product.",
		lastUpdated: "2026-07-25",
		lastUpdatedLabel: "25 Jul 2026",
		href: "/blog/payment-evidence-before-merchant-state",
	},
	{
		slug: "tenant-boundaries-in-practice",
		topic: "Tenant boundaries people can trust",
		category: "Operations",
		status: "active",
		statusLabel: "ACTIVE",
		question: "How should a product make workspace, role and permission boundaries visible without slowing down the work?",
		whyItMatters:
			"LogiVN and Fball both serve more than one team. A fast interface is not useful if the wrong person can see or change the wrong operational state.",
		currentConclusion:
			"Treat tenancy, roles and audit history as product concepts. Row-level or service-level checks should reinforce the same boundary instead of becoming a hidden afterthought.",
		lastUpdated: "2026-07-25",
		lastUpdatedLabel: "25 Jul 2026",
		href: "/blog/tenant-boundaries-people-can-trust",
	},
	{
		slug: "low-cost-cloud-operations",
		topic: "Low-cost cloud operations that leave room to learn",
		category: "Infrastructure",
		status: "testing",
		statusLabel: "TESTING",
		question: "How much operational capability can a small product retain while staying inside a Cloudflare-first budget?",
		whyItMatters:
			"Early products need room to change direction. The infrastructure should make safe releases and recovery possible without pretending the product already needs an enterprise operating model.",
		currentConclusion:
			"Prefer managed primitives, explicit limits and replaceable adapters. Introduce stateful complexity only when a measured workflow needs it.",
		lastUpdated: "2026-07-25",
		lastUpdatedLabel: "25 Jul 2026",
		href: "/blog/rag-on-cloudflare-free",
	},
	{
		slug: "assisted-operations-with-confirmation",
		topic: "Assisted operations with a human confirmation step",
		category: "Product development",
		status: "active",
		statusLabel: "ACTIVE",
		question: "Where can AI reduce coordination work without silently changing business state?",
		whyItMatters:
			"Both restaurants and football clubs have repetitive coordination. Suggestions can help, but an unreviewed automation can also create confusion at the worst moment.",
		currentConclusion:
			"Use AI for proposals, summaries and extraction; require a person to confirm changes to orders, squads, permissions or money. Keep provider integrations off until they are configured and verified.",
		lastUpdated: "2026-07-25",
		lastUpdatedLabel: "25 Jul 2026",
		href: "/blog/ai-starts-with-the-workflow",
	},
	{
		slug: "e-invoicing-domain-model",
		topic: "An explicit domain for electronic invoicing",
		category: "Operations",
		status: "research",
		statusLabel: "RESEARCH",
		question: "Where should invoice lifecycle and evidence live so provider integrations can change without rewriting operations?",
		whyItMatters:
			"Invoices connect an operational record to financial administration. Treating them as a file export hides the states that need review, correction and audit.",
		currentConclusion:
			"Model the invoice lifecycle and evidence first. Only publish a provider or compliance claim after the integration has been verified end to end.",
		lastUpdated: "2026-07-25",
		lastUpdatedLabel: "25 Jul 2026",
		href: null,
	},
] as const satisfies readonly LabEntry[];

export const labCategories = ["All", "Infrastructure", "Operations", "Product development"] as const;
