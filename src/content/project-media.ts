import type { Locale } from "../i18n/dictionaries";

export type ProjectMediaKey = "logivn" | "fball" | "payment-infrastructure";

const covers: Record<ProjectMediaKey, string> = {
	logivn: "/images/projects/logivn-showcase-cover.webp",
	fball: "/images/projects/fball-showcase-cover.webp",
	"payment-infrastructure": "/images/projects/payment-research.webp",
};

const legacyCovers: Partial<Record<ProjectMediaKey, string[]>> = {
	logivn: ["/images/projects/logivn-operations.webp", "/images/projects/logivn-operations-v2.webp"],
	fball: ["/images/projects/fball-matchday.webp", "/images/projects/fball-operations-v2.webp"],
};

const alts: Record<ProjectMediaKey, Record<Locale, string>> = {
	logivn: {
		vi: "Tổng quan LogiVN với dashboard, đơn hàng, nhân sự và trợ lý LogiBot AI",
		en: "LogiVN overview featuring its dashboard, orders, staff operations and LogiBot AI",
		ja: "ダッシュボード、注文、スタッフ運用、LogiBot AIをまとめたLogiVNの概要",
		zh: "展示仪表盘、订单、员工运营与 LogiBot AI 的 LogiVN 总览",
	},
	fball: {
		vi: "Tổng quan Fball.vn với quản lý đội, lịch trận, điểm danh, quỹ và ghép trận",
		en: "Fball.vn overview featuring team management, match schedules, attendance, funds and matchmaking",
		ja: "チーム管理、試合日程、出欠、資金、マッチングをまとめたFball.vnの概要",
		zh: "展示球队管理、赛程、出勤、球队资金与约赛功能的 Fball.vn 总览",
	},
	"payment-infrastructure": {
		vi: "Minh họa nghiên cứu vận hành thanh toán: ý định, đối chiếu, chống trùng lặp và webhook có chữ ký",
		en: "Illustrated payment operations research: intent, matching, idempotency and signed webhooks",
		ja: "決済意図、照合、冪等処理、署名付きWebhookを示す決済運用リサーチのイラスト",
		zh: "支付运营研究示意图：支付意图、匹配、幂等与签名 Webhook",
	},
};

export function projectCover(slug: string): string | null {
	return covers[slug as ProjectMediaKey] ?? null;
}

export function resolveProjectCover(slug: string, image?: string | null): string | null {
	const key = slug as ProjectMediaKey;
	if (!image || legacyCovers[key]?.includes(image)) return covers[key] ?? image ?? null;
	return image;
}

export function projectCoverAlt(slug: string, locale: Locale): string {
	return alts[slug as ProjectMediaKey]?.[locale] ?? slug;
}
