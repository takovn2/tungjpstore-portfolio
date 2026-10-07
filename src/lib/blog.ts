import type { BodyBlock } from "./admin/types";

export function textFromBody(blocks: BodyBlock[]) {
  return blocks.flatMap((block) => {
    if (block.type === "paragraph" || block.type === "heading" || block.type === "quote") return [block.text];
    if (block.type === "list") return block.items;
    if (block.type === "image") return [block.alt];
    if (block.type === "cta") return [block.label];
    if (block.type === "metric") return [block.label, block.value];
    return [];
  }).join(" ").trim();
}

export function estimateReadingMinutes(blocks: BodyBlock[]) {
  const text = textFromBody(blocks);
  if (!text) return 1;
  const cjkCharacters = text.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const words = text
    .replace(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil((words / 220) + (cjkCharacters / 500)));
}

export function validIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}
