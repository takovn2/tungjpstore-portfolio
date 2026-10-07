import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import sharp from 'sharp';

const outDir = resolve('public/images/blog');
const rawDir = '/tmp/blog-topic-stock';
mkdirSync(rawDir, { recursive: true });

const ps = spawnSync('ps', ['eww', '-p', '39974'], { encoding: 'utf8' });
const keyLine = (ps.stdout || '').split(/\s+/).find((t) => t.startsWith('ROUTER_API_KEY='));
const API_KEY = keyLine ? keyLine.slice('ROUTER_API_KEY='.length) : process.env.ROUTER_API_KEY;
if (!API_KEY) throw new Error('No API key');

// Multiple candidate Unsplash photo IDs per asset. We vision-check and pick the first match.
const ASSETS = [
  {
    slug: 'ai-workflow-system',
    want: 'team/office planning workflow whiteboard meeting laptop process design',
    reject: ['cat', 'lighthouse', 'forest', 'market', 'lake', 'beach', 'hair'],
    accept: ['whiteboard', 'meeting', 'office', 'laptop', 'desk', 'team', 'people', 'planning', 'sticky', 'chart', 'notebook', 'computer', 'work'],
    candidates: [
      '1531482615713-2afd69097998', // team meeting
      '1552664730-d307ca884978', // workshop sticky notes
      '1517245386807-bb43f82c33c4', // laptop collaborative
      '1542744173-8e7e53415bb0', // business meeting
      '1600880292203-757bb62b4baf', // coworking office
    ],
  },
  {
    slug: 'ai-workflow-system-detail',
    want: 'hands sticky notes flowchart desk planning',
    reject: ['cat', 'lighthouse', 'forest', 'market', 'lake', 'beach'],
    accept: ['sticky', 'note', 'hand', 'paper', 'desk', 'pen', 'notebook', 'laptop', 'document', 'marker', 'whiteboard'],
    candidates: [
      '1553877522-43269d4ea984',
      '1432888498266-38ffec3eaf0a',
      '1454165804606-c3d57bc86b40',
      '1484480974693-6ca0a78fb36b',
      '1516321318423-f06f85e504b3',
    ],
  },
  {
    slug: 'cloudflare-rag-edge',
    want: 'server rack data center infrastructure',
    reject: ['cat', 'lighthouse', 'forest', 'market', 'lake', 'beach', 'football', 'cafe'],
    accept: ['server', 'rack', 'data', 'cable', 'network', 'datacenter', 'data center', 'computer room', 'infrastructure', 'hardware'],
    candidates: [
      '1558494949-ef010cbdcc31',
      '1544197150-b99a580bb7a2',
      '1597852074816-d933c7bf14e8',
      '1518770660439-4636190af475',
      '1451187580459-43490279c0fa',
    ],
  },
  {
    slug: 'cloudflare-rag-edge-detail',
    want: 'documents research desk knowledge files laptop',
    reject: ['cat', 'lighthouse', 'forest', 'market', 'lake', 'beach'],
    accept: ['document', 'paper', 'book', 'desk', 'laptop', 'file', 'folder', 'research', 'notebook', 'library', 'reading'],
    candidates: [
      '1454165804606-c3d57bc86b40',
      '1481627834876-b7833e8f5570',
      '1507842217343-583bb7270b66',
      '1434030216411-0b793f4b4173',
      '1524995997946-a1c2e315a42f',
    ],
  },
  {
    slug: 'multilingual-product-system',
    want: 'diverse team collaboration meeting product',
    reject: ['cat', 'lighthouse', 'forest', 'market', 'lake', 'beach', 'server'],
    accept: ['team', 'people', 'meeting', 'table', 'office', 'collaboration', 'group', 'laptop', 'discussion', 'cowork'],
    candidates: [
      '1521737711867-e3b97375f902',
      '1522202176988-66273c2fd55f',
      '1600880292089-90a7e086ee0c',
      '1515187029135-18ee286d815b',
      '1543269865-cbf427effbad',
    ],
  },
  {
    slug: 'multilingual-product-system-detail',
    want: 'hands documents translation desk languages paperwork',
    reject: ['cat', 'lighthouse', 'forest', 'market', 'lake', 'beach'],
    accept: ['paper', 'document', 'hand', 'desk', 'pen', 'notebook', 'laptop', 'keyboard', 'writing', 'book'],
    candidates: [
      '1450101499163-c8848c66ca85',
      '1455390582262-044cdead277a',
      '1434030216411-0b793f4b4173',
      '1516321318423-f06f85e504b3',
      '1460925895917-afdab827c52f',
    ],
  },
  {
    slug: 'agentic-ai-security-gates',
    want: 'security operations monitors cybersecurity control room',
    reject: ['cat', 'lighthouse', 'forest', 'market', 'lake', 'beach', 'football'],
    accept: ['monitor', 'screen', 'computer', 'security', 'office', 'desk', 'code', 'server', 'operations', 'dark', 'display'],
    candidates: [
      '1563986768609-322da13575f3',
      '1555949963-aa79dcee981c',
      '1550751827-4bd374c3f58b',
      '1526374965328-7f61d4dc18c5',
      '1510511459019-5dda7724fd87',
    ],
  },
  {
    slug: 'agentic-ai-security-gates-detail',
    want: 'access badge laptop approval security desk',
    reject: ['cat', 'lighthouse', 'forest', 'market', 'lake', 'beach'],
    accept: ['laptop', 'hand', 'keyboard', 'desk', 'computer', 'badge', 'card', 'phone', 'screen', 'typing'],
    candidates: [
      '1486312338219-ce68d2c6f44d',
      '1516321318423-f06f85e504b3',
      '1555949963-ff9fe0c870eb',
      '1498050108023-c5249f4df085',
      '1581091226825-a6a2a5aee158',
    ],
  },
  {
    slug: 'logivn-one-order-flow',
    want: 'cafe restaurant coffee shop interior service',
    reject: ['cat', 'lighthouse', 'forest', 'server rack', 'football', 'stadium', 'lake'],
    accept: ['cafe', 'coffee', 'restaurant', 'barista', 'table', 'interior', 'shop', 'counter', 'drink', 'food', 'cup'],
    candidates: [
      '1554118811-1e0d58224f24',
      '1495474472287-4d71bcdd2085',
      '1501339847302-ac426a4a7cbb',
      '1445116572660-236099ec97a0',
      '1517248135467-4c7edcad34c4',
    ],
  },
  {
    slug: 'logivn-one-order-flow-detail',
    want: 'restaurant kitchen cook order ticket food prep',
    reject: ['cat', 'lighthouse', 'forest', 'lake', 'football', 'beach'],
    accept: ['kitchen', 'cook', 'chef', 'food', 'plate', 'restaurant', 'stove', 'stainless', 'cooking', 'pan'],
    candidates: [
      '1556910103-1c02745aae4d',
      '1414235077428-338989a2e8c0',
      '1504674900247-0877df9cc836',
      '1559339352-11d035aa65de',
      '1466978913421-dad2ebd01d17',
    ],
  },
  {
    slug: 'fball-matchday-state',
    want: 'football soccer pitch grass players match',
    reject: ['cat', 'lighthouse', 'forest', 'cafe', 'server', 'market', 'lake'],
    accept: ['football', 'soccer', 'pitch', 'field', 'ball', 'player', 'grass', 'sport', 'stadium', 'athlete', 'kick'],
    candidates: [
      '1574629810360-7efbbe195018',
      '1431324155629-1a6deb1dec8d',
      '1529900748604-07564a03e7a6',
      '1579952363873-27f3bade9f55',
      '1517927033932-b3d18e61fb3a',
    ],
  },
  {
    slug: 'fball-matchday-state-detail',
    want: 'soccer ball cleats sideline match day detail',
    reject: ['cat', 'lighthouse', 'forest', 'cafe', 'server', 'market'],
    accept: ['ball', 'football', 'soccer', 'cleat', 'boot', 'grass', 'field', 'sport', 'shoe'],
    candidates: [
      '1431324155629-1a6deb1dec8d',
      '1579952363873-27f3bade9f55',
      '1517927033932-b3d18e61fb3a',
      '1461896836934-ffe607ba6851',
      '1489944440615-453fc71d1a59',
    ],
  },
  {
    slug: 'tenant-boundary-product',
    want: 'modern office glass rooms workspace boundaries',
    reject: ['cat', 'lighthouse', 'forest', 'market', 'beach', 'football', 'lake', 'vegetable'],
    accept: ['office', 'glass', 'building', 'workspace', 'meeting', 'room', 'corridor', 'desk', 'interior', 'window'],
    candidates: [
      '1497366216548-37526070297c',
      '1497366811353-6870744d04b2',
      '1486406146926-c627a92ad1ab',
      '1497215842964-222b430dc094',
      '1462826303086-329426d1aef5',
    ],
  },
  {
    slug: 'tenant-boundary-product-detail',
    want: 'person laptop office work access workspace',
    reject: ['cat', 'lighthouse', 'forest', 'market', 'beach', 'football', 'lake'],
    accept: ['laptop', 'desk', 'computer', 'typing', 'office', 'hand', 'keyboard', 'screen', 'work'],
    candidates: [
      '1486312338219-ce68d2c6f44d',
      '1498050108023-c5249f4df085',
      '1516321318423-f06f85e504b3',
      '1581091226825-a6a2a5aee158',
      '1522071820081-009f0129c71c',
    ],
  },
  {
    slug: 'payment-evidence-first',
    want: 'finance desk paperwork calculator receipts reconciliation',
    reject: ['cat', 'lighthouse', 'forest', 'football', 'server rack', 'lake', 'beach'],
    accept: ['paper', 'document', 'calculator', 'desk', 'receipt', 'invoice', 'finance', 'money', 'ledger', 'tax', 'form', 'pen'],
    candidates: [
      '1554224155-6726b3ff858f',
      '1556742049-0cfed4f6a45d',
      '1450101499163-c8848c66ca85',
      '1554224154-26032ffc0d31',
      '1460925895917-afdab827c52f',
    ],
  },
  {
    slug: 'payment-evidence-first-detail',
    want: 'hands checking receipt payment evidence closeup',
    reject: ['cat', 'lighthouse', 'forest', 'football', 'beach', 'lake'],
    accept: ['hand', 'receipt', 'paper', 'card', 'payment', 'phone', 'wallet', 'money', 'document', 'desk', 'tablet'],
    candidates: [
      '1556742111-a301076d9d18',
      '1556741533-f6acd90203f4',
      '1563013544-824ae1b704d3',
      '1556740758-90de374c12ad',
      '1580048915910-0e5f1b3d0f58',
    ],
  },
];

async function download(id) {
  const url = `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1800&h=1012&q=85`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 ProfileBlogBot/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${id}`);
  return Buffer.from(await r.arrayBuffer());
}

async function describe(buf) {
  const small = await sharp(buf).resize(480).jpeg({ quality: 55 }).toBuffer();
  const b64 = small.toString('base64');
  const r = await fetch('http://localhost:20128/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'One short factual sentence: what is the main subject of this photo?' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ],
      }],
      max_tokens: 60,
    }),
  });
  const j = await r.json();
  return (j.choices?.[0]?.message?.content || '').trim();
}

function ok(desc, asset) {
  const d = desc.toLowerCase();
  if (asset.reject.some((w) => d.includes(w))) return false;
  return asset.accept.some((w) => d.includes(w));
}

async function toWebp(buf, dest) {
  let quality = 78;
  let out;
  for (let i = 0; i < 8; i++) {
    out = await sharp(buf).resize(1600, 900, { fit: 'cover', position: 'attention' }).webp({ quality, effort: 6 }).toBuffer();
    if (out.length <= 180 * 1024) break;
    quality -= 8;
  }
  writeFileSync(dest, out);
  return out.length;
}

const results = [];
for (const asset of ASSETS) {
  let chosen = null;
  for (const id of asset.candidates) {
    try {
      process.stdout.write(`\n${asset.slug} candidate ${id}... `);
      const buf = await download(id);
      writeFileSync(resolve(rawDir, `${asset.slug}-${id}.jpg`), buf);
      const desc = await describe(buf);
      process.stdout.write(desc + ' ');
      if (!ok(desc, asset)) {
        process.stdout.write('REJECT');
        continue;
      }
      const size = await toWebp(buf, resolve(outDir, `${asset.slug}.webp`));
      process.stdout.write(`ACCEPT ${size}B`);
      chosen = { slug: asset.slug, id, desc, size };
      break;
    } catch (e) {
      process.stdout.write(`ERR ${e.message}`);
    }
  }
  if (!chosen) {
    console.error(`\nFAILED ${asset.slug}`);
    results.push({ slug: asset.slug, failed: true });
  } else {
    results.push(chosen);
  }
}

console.log('\n\n=== FINAL ===');
for (const r of results) console.log(JSON.stringify(r));
if (results.some((r) => r.failed)) process.exit(1);
