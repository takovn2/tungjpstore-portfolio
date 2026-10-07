import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

const outDir = resolve('scripts/blog-longform');
mkdirSync(outDir, { recursive: true });

const ps = spawnSync('ps', ['eww', '-p', '39974'], { encoding: 'utf8' });
const keyLine = (ps.stdout || '').split(/\s+/).find((t) => t.startsWith('ROUTER_API_KEY='));
const API_KEY = keyLine ? keyLine.slice('ROUTER_API_KEY='.length) : process.env.ROUTER_API_KEY;
if (!API_KEY) throw new Error('No API key');

const ARTICLES = [
  {
    slug: 'ai-starts-with-the-workflow',
    cover: 'ai-workflow-system',
    detail: 'ai-workflow-system-detail',
    sortOrder: 300,
    meta: { series: 'digital-systems', surface: 'blog', status: 'live', featured: true },
    topic: {
      vi: 'AI nên bắt đầu từ quy trình, không phải từ mô hình',
      en: 'AI should start with the workflow, not the model',
      ja: 'AIはモデルではなく、業務の流れから始める',
      zh: 'AI 应从工作流程开始，而不是从模型开始',
    },
    angle: 'Workflow-first AI product design for operational systems (orders, clubs, payments). AI proposes; humans confirm. No fake metrics. Evidence from building LogiVN and Fball-style systems.',
  },
  {
    slug: 'rag-on-cloudflare-free',
    cover: 'cloudflare-rag-edge',
    detail: 'cloudflare-rag-edge-detail',
    sortOrder: 310,
    meta: { series: 'digital-systems', surface: 'blog', status: 'live', featured: true },
    topic: {
      vi: 'Xây RAG ở edge: bắt đầu bằng ranh giới chi phí và dữ liệu',
      en: 'Build edge RAG with clear data and cost boundaries',
      ja: '境界を決めてエッジでRAGをつくる',
      zh: '在边缘构建 RAG：先划清数据与成本边界',
    },
    angle: 'Edge RAG on Cloudflare Workers: index boundaries, cost caps, refuse weak evidence, lifecycle of documents. Not a magic box.',
  },
  {
    slug: 'multilingual-products-without-translation-debt',
    cover: 'multilingual-product-system',
    detail: 'multilingual-product-system-detail',
    sortOrder: 320,
    meta: { series: 'digital-systems', surface: 'blog', status: 'live', featured: true },
    topic: {
      vi: 'Sản phẩm đa ngôn ngữ không nên tạo ra nợ dịch thuật',
      en: 'Multilingual products should not create translation debt',
      ja: '多言語プロダクトで翻訳負債を増やさない',
      zh: '多语言产品不应制造翻译债务',
    },
    angle: 'vi/en/ja/zh product localization: stable keys, context, length design, SEO hreflang, CMS completeness states. No empty locale shells.',
  },
  {
    slug: 'safe-agentic-ai-authority-boundaries',
    cover: 'agentic-ai-security-gates',
    detail: 'agentic-ai-security-gates-detail',
    sortOrder: 330,
    meta: { series: 'digital-systems', surface: 'blog', status: 'live', featured: true },
    topic: {
      vi: 'AI agent an toàn cần ranh giới quyền và điều kiện dừng',
      en: 'Safe agents need authority boundaries and stop conditions',
      ja: '安全なAIエージェントには権限の境界と停止条件が必要',
      zh: '安全的 AI 代理需要权限边界与停止条件',
    },
    angle: 'Agentic AI: least privilege, stop conditions, human confirmation for state changes, audit trails. Authority is the product.',
  },
  {
    slug: 'logivn-one-order-one-kitchen-truth',
    cover: 'logivn-one-order-flow',
    detail: 'logivn-one-order-flow-detail',
    sortOrder: 400,
    meta: { series: 'product-notes', surface: 'blog', status: 'live', featured: true, product: 'logivn' },
    topic: {
      vi: 'LogiVN: một order, một sự thật cho bếp',
      en: 'LogiVN: one order, one kitchen truth',
      ja: 'LogiVN: 一つの注文、キッチンの一つの真実',
      zh: 'LogiVN：一笔订单，厨房的同一真相',
    },
    angle: 'LogiVN multi-tenant F&B SaaS: shared order object from QR guest to kitchen. Tenancy before widgets. No venue counts or revenue claims. Live product https://logivn.com',
  },
  {
    slug: 'fball-match-day-as-shared-state',
    cover: 'fball-matchday-state',
    detail: 'fball-matchday-state-detail',
    sortOrder: 410,
    meta: { series: 'product-notes', surface: 'blog', status: 'live', featured: true, product: 'fball' },
    topic: {
      vi: 'Fball.vn: ngày thi đấu là trạng thái dùng chung',
      en: 'Fball.vn: match day as shared state',
      ja: 'Fball.vn: 試合当日は共有状態',
      zh: 'Fball.vn：把比赛日变成共享状态',
    },
    angle: 'Fball.vn club OS: schedule, attendance, lineup as shared team state. Workspace is tenant. Provider modules gated. Live https://fball.vn',
  },
  {
    slug: 'tenant-boundaries-people-can-trust',
    cover: 'tenant-boundary-product',
    detail: 'tenant-boundary-product-detail',
    sortOrder: 420,
    meta: { series: 'product-notes', surface: 'blog', status: 'live', featured: false, product: 'operations' },
    topic: {
      vi: 'Ranh giới tenant mà người dùng có thể tin',
      en: 'Tenant boundaries people can trust',
      ja: '人が信頼できるテナント境界',
      zh: '用户能够信任的租户边界',
    },
    angle: 'Multi-tenant product design for LogiVN and Fball: visible boundaries, roles, audit. Product concept not only SQL filter.',
  },
  {
    slug: 'payment-evidence-before-merchant-state',
    cover: 'payment-evidence-first',
    detail: 'payment-evidence-first-detail',
    sortOrder: 430,
    meta: { series: 'product-notes', surface: 'blog', status: 'live', featured: false, product: 'payment-research' },
    topic: {
      vi: 'Bằng chứng trước trạng thái merchant',
      en: 'Evidence before merchant state',
      ja: '加盟店状態の前に証拠を置く',
      zh: '先有证据，再改商户状态',
    },
    angle: 'Payment research (not launched product): intent, matching, idempotency, signed webhooks. No funds-handling claim. Evidence before merchant state.',
  },
];

const locales = ['vi', 'en', 'ja', 'zh'];

const localeInstructions = {
  vi: {
    name: 'Vietnamese',
    words: 3000,
    wordLabel: 'từ',
    style: 'Editorial Vietnamese, formal-professional but readable, proof-first, no marketing fluff, no fake metrics, no GitHub/repo mentions.',
  },
  en: {
    name: 'English',
    words: 3000,
    wordLabel: 'words',
    style: 'Editorial English, precise engineering prose, proof-first, no fake metrics, no repository links.',
  },
  ja: {
    name: 'Japanese',
    words: 2200,
    wordLabel: '文字相当の分量（約2200語相当の深さ）',
    style: '自然な日本語の編集文体。誇張や未検証指標なし。',
  },
  zh: {
    name: 'Simplified Chinese',
    words: 2200,
    wordLabel: '字词量约相当于2200词的深度',
    style: '简洁专业的简体中文编辑文体。无虚假指标，无仓库链接。',
  },
};

async function chat(messages, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300000);
  try {
    const r = await fetch('http://localhost:20128/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        temperature: 0.4,
        max_tokens: 16000,
        messages,
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j.error || j).slice(0, 400));
    return j.choices?.[0]?.message?.content || '';
  } catch (e) {
    if (attempt < 4) {
      console.log(` retry${attempt} after ${e.message?.slice?.(0,80) || e}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return chat(messages, attempt + 1);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('No JSON object in model output');
  return JSON.parse(raw.slice(start, end + 1));
}

function wordCount(blocks, locale) {
  const text = blocks.flatMap((b) => {
    if (b.type === 'list') return b.items;
    if (typeof b.text === 'string') return [b.text];
    return [];
  }).join(' ');
  if (locale === 'ja' || locale === 'zh') {
    // approximate "word" depth by characters / 2 for CJK
    return Math.round(text.replace(/\s+/g, '').length / 2);
  }
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function generateLocale(article, locale) {
  const li = localeInstructions[locale];
  const title = article.topic[locale];
  const prompt = `You are writing a long-form editorial blog article for TUNG's portfolio (tung.codes).

Design system tone: dark editorial engineering, proof-first, serif titles + practical body, no SaaS fluff, no fake metrics, no testimonials, no repository/source links.

Article title: ${title}
Slug: ${article.slug}
Angle: ${article.angle}
Language: ${li.name}
Target length: about ${li.words} ${li.wordLabel}
Style: ${li.style}

Return ONLY valid JSON (no markdown outside JSON) with this exact shape:
{
  "title": "...",
  "eyebrow": "short category label",
  "excerpt": "1-2 sentence deck",
  "seoTitle": "title — Tung (keep short)",
  "seoDescription": "meta description within SEO limits",
  "body": [
    {"type":"heading","text":"..."},
    {"type":"paragraph","text":"..."},
    {"type":"list","items":["...","...","..."]},
    {"type":"quote","text":"..."},
    {"type":"image","src":"/images/blog/${article.detail}.webp","alt":"locale-accurate alt for detail photo"},
    {"type":"cta","label":"...","href":"/contact"}
  ]
}

Body requirements:
- At least 18 blocks
- At least 8 headings, 12 paragraphs, 2 lists (3+ items each), 2 quotes
- Exactly ONE image block using src "/images/blog/${article.detail}.webp" placed around the middle (after section 3-4)
- Exactly ONE cta at the end (use /contact or product case study path when appropriate: LogiVN /work/logivn, Fball /work/fball, payment research /work/payment-infrastructure)
- Long, concrete paragraphs — operational examples, failure modes, checklists, limits of claims
- Do NOT invent revenue, user counts, or unproven performance numbers
- Do NOT mention GitHub, repositories, or source code locations
- seoTitle max ${locale === 'ja' || locale === 'zh' ? 45 : 70} chars
- seoDescription between ${locale === 'ja' || locale === 'zh' ? '30-120' : '70-180'} chars
- Reach approximately ${li.words} ${li.wordLabel} of body prose (headings+paragraphs+lists+quotes)`;

  const content = await chat([
    { role: 'system', content: 'You write world-class product engineering essays as strict JSON only.' },
    { role: 'user', content: prompt },
  ]);
  const data = extractJson(content);
  // normalize
  if (!Array.isArray(data.body)) throw new Error('missing body');
  // ensure image present
  if (!data.body.some((b) => b.type === 'image')) {
    data.body.splice(Math.min(8, data.body.length - 1), 0, {
      type: 'image',
      src: `/images/blog/${article.detail}.webp`,
      alt: data.title,
    });
  }
  // force correct image src
  data.body = data.body.map((b) => b.type === 'image'
    ? { type: 'image', src: `/images/blog/${article.detail}.webp`, alt: b.alt || data.title }
    : b);
  const wc = wordCount(data.body, locale);
  return { data, wc };
}

async function expandIfShort(article, locale, data, wc) {
  const target = localeInstructions[locale].words;
  if (wc >= target * 0.85) return { data, wc };
  const more = await chat([
    { role: 'system', content: 'Expand editorial JSON body only. Return full JSON article object.' },
    { role: 'user', content: `The article is too short (${wc}). Expand body paragraphs and add more practical sections to reach ~${target} words while keeping the same JSON schema and language (${locale}). Keep the single image src "/images/blog/${article.detail}.webp" and one final cta. Current JSON:\n${JSON.stringify(data)}` },
  ]);
  const expanded = extractJson(more);
  expanded.body = (expanded.body || data.body).map((b) => b.type === 'image'
    ? { type: 'image', src: `/images/blog/${article.detail}.webp`, alt: b.alt || expanded.title || data.title }
    : b);
  return { data: expanded, wc: wordCount(expanded.body, locale) };
}

const coverAlts = {
  vi: {
    'ai-workflow-system': 'Hai người cùng rà soát quy trình trên màn hình trước khi gắn AI',
    'cloudflare-rag-edge': 'Giá server và cáp mạng trong trung tâm dữ liệu cho hạ tầng tri thức edge',
    'multilingual-product-system': 'Nhóm sản phẩm làm việc quanh bàn khi xây nội dung đa ngôn ngữ',
    'agentic-ai-security-gates': 'Màn hình code — ranh giới quyền và kiểm soát cho AI agent',
    'logivn-one-order-flow': 'Không gian quán cà phê — order phải đồng bộ từ khách đến bếp',
    'fball-matchday-state': 'Bóng đá trên sân cỏ — ngày thi đấu cần trạng thái dùng chung',
    'tenant-boundary-product': 'Hành lang văn phòng hiện đại — ranh giới workspace cần nhìn thấy',
    'payment-evidence-first': 'Giấy tờ và máy tính cầm tay — bằng chứng trước trạng thái merchant',
  },
};

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const list = only.length ? ARTICLES.filter((a) => only.includes(a.slug)) : ARTICLES;
  const all = [];

  for (const article of list) {
    const cachePath = resolve(outDir, `${article.slug}.json`);
    if (existsSync(cachePath) && process.argv.includes('--resume')) {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
      const missing = locales.filter((l) => !cached.localizations?.[l]?.body);
      if (!missing.length) {
        all.push(cached);
        console.log('resume complete', article.slug);
        continue;
      }
      console.log('resume partial', article.slug, 'missing', missing.join(','));
      for (const locale of missing) {
        process.stdout.write(`\n${article.slug}/${locale} generating... `);
        let { data, wc } = await generateLocale(article, locale);
        ({ data, wc } = await expandIfShort(article, locale, data, wc));
        cached.localizations[locale] = {
          title: data.title,
          eyebrow: data.eyebrow,
          excerpt: data.excerpt,
          seoTitle: data.seoTitle,
          seoDescription: data.seoDescription,
          body: data.body,
        };
        cached.wordCounts = cached.wordCounts || {};
        cached.wordCounts[locale] = wc;
        console.log(`words≈${wc} blocks=${data.body.length}`);
        writeFileSync(cachePath, JSON.stringify(cached, null, 2));
      }
      all.push(cached);
      continue;
    }
    const entry = {
      slug: article.slug,
      cover: article.cover,
      coverAlt: coverAlts.vi[article.cover] || article.topic.vi,
      sortOrder: article.sortOrder,
      meta: article.meta,
      localizations: {},
      wordCounts: {},
    };
    for (const locale of locales) {
      process.stdout.write(`\n${article.slug}/${locale} generating... `);
      let { data, wc } = await generateLocale(article, locale);
      ({ data, wc } = await expandIfShort(article, locale, data, wc));
      entry.localizations[locale] = {
        title: data.title,
        eyebrow: data.eyebrow,
        excerpt: data.excerpt,
        seoTitle: data.seoTitle,
        seoDescription: data.seoDescription,
        body: data.body,
      };
      entry.wordCounts[locale] = wc;
      console.log(`words≈${wc} blocks=${data.body.length}`);
    }
    writeFileSync(cachePath, JSON.stringify(entry, null, 2));
    all.push(entry);
    console.log('saved', cachePath);
  }
  writeFileSync(resolve(outDir, 'index.json'), JSON.stringify(all, null, 2));
  console.log('\nDone', all.length, 'articles');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
