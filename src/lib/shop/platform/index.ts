/** Platform wave F1–F10 pure modules (client + server safe). */
export * from "./attribution.ts";
export * from "./recommend.ts";
export * from "./merchandising.ts";
export * from "./trust.ts";
export * from "./inventory-intel.ts";
export * from "./ops-snapshot.ts";
export * from "./flywheel.ts";
export * from "./checkout-mesh.ts";
// Server-only helpers live in ./service.ts (D1 + optional XAI) — import directly from there.
