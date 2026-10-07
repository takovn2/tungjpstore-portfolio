export type SiteLink = {
	label: string;
	href: string;
	external?: boolean;
};

export type SiteConfig = {
	name: string;
	fullName: string;
	role: string;
	location: string;
	availability: string;
	url: string;
	domain: string;
	email: string | null;
	description: string;
	positioning: string;
	supportingStatement: string;
	brandPromise: string;
	builderPhilosophy: string;
	businessPrinciple: string;
};

export const siteConfig: SiteConfig = {
	name: "TUNG",
	fullName: "Tung",
	role: "Independent product builder",
	location: "Vietnam / Japan",
	availability: "Open to a small number of thoughtful collaborations",
	url: "https://tung.codes",
	domain: "tung.codes",
	email: "hello@tung.codes",
	description:
		"Tung designs and builds product systems for real operations: from LogiVN for F&B teams to Fball.vn for grassroots football clubs.",
	positioning: "I turn messy operating work into software people can actually run.",
	supportingStatement:
		"I work from product framing through architecture and full-stack delivery, keeping the visible experience clear while the critical rules remain dependable underneath.",
	brandPromise: "Make the next decision obvious.",
	builderPhilosophy: "Own the critical layers. Keep optional layers replaceable.",
	businessPrinciple: "Technology earns its place when it improves the way a business works.",
};

export const primaryNavigation = [
	{ label: "Work", href: "/work" },
	{ label: "Services & pricing", href: "/pricing" },
	{ label: "Lab", href: "/lab" },
	{ label: "Blog", href: "/blog" },
	{ label: "About", href: "/about" },
	{ label: "Contact", href: "/contact" },
] satisfies SiteLink[];

export const footerNavigation = [
	...primaryNavigation,
	{ label: "Privacy", href: "/privacy" },
] satisfies SiteLink[];

export const aboutContent = {
	heading: "I build at the point where product decisions meet everyday operations.",
	intro:
		"The work is practical: understand what a team is trying to do, remove the coordination that keeps getting repeated, then build a system that can carry the next version of the business.",
	operatingPerspective:
		"I start with the real operating loop, not a feature list. Who needs to know what, when does a decision become state, and where does the work break when the day gets busy? Those answers shape the product boundary before the interface is polished.",
	process: [
		"Watch the operating loop.",
		"Name the constraint that matters most.",
		"Turn repeated decisions into product state.",
		"Build the smallest complete workflow.",
		"Verify behaviour in the real context.",
		"Expand only when the foundation earns it.",
	],
	principles: [
		"Make the next decision obvious.",
		"Automate repetition before adding ceremony.",
		"Keep tenant and permission boundaries explicit.",
		"Show failure states instead of hiding them.",
		"Build for the next change, not an imagined scale.",
	],
	capabilities: [
		"Product framing and discovery",
		"Workflow and information architecture",
		"Multi-tenant product systems",
		"Full-stack implementation",
		"Realtime and integration boundaries",
		"Operational admin tools",
		"MVP-to-platform evolution",
	],
	currentFocus: [
		"LogiVN · F&B operations",
		"Fball.vn · grassroots club operations",
		"Payment confirmation research",
		"Cloudflare-first infrastructure",
		"Tools that make small teams more capable",
	],
	personalNote:
		"I work independently between Vietnam and Japan. Depending on the problem, that means moving from a product question to a data boundary, a screen, a failing edge case or the release checklist in the same day.",
} as const;
