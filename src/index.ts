interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Live Feeds (RSS/Atom) MCP.
 *
 * Read curated and arbitrary RSS / Atom / RDF feeds — government & security
 * advisories, health threats, finance/regulatory, science, tech and world news.
 * A registry of vetted, Cloudflare-reachable feeds makes discovery cheap, and
 * the fetcher is CF-robust: it fetches+parses directly, and on a Cloudflare
 * egress block falls back to the rss2json proxy. Adding a feed = a registry
 * entry, not a new pack.
 */


const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PROXY = 'https://api.rss2json.com/v1/api.json';
const MAX_ITEMS = 50;

interface FeedDef { title: string; url: string; category: string; source: string; description: string }

/** Curated registry — every entry verified reachable from the Cloudflare gateway. */
const FEEDS: Record<string, FeedDef> = {
  'cisa-advisories': { title: 'CISA Cybersecurity Advisories', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', category: 'security', source: 'cisa.gov', description: 'US CISA cybersecurity & ICS advisories' },
  krebs: { title: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', category: 'security', source: 'krebsonsecurity.com', description: 'In-depth security news & investigation' },
  'the-hacker-news': { title: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', category: 'security', source: 'thehackernews.com', description: 'Cybersecurity news & breaches' },
  'cdc-newsroom': { title: 'CDC Newsroom', url: 'https://tools.cdc.gov/api/v2/resources/media/132608.rss', category: 'health', source: 'cdc.gov', description: 'US CDC health news & alerts' },
  'ecdc-threats': { title: 'ECDC Communicable Disease Threats', url: 'https://www.ecdc.europa.eu/en/taxonomy/term/2942/feed', category: 'health', source: 'ecdc.europa.eu', description: 'European CDC disease-threat reports' },
  'sec-press': { title: 'SEC Press Releases', url: 'https://www.sec.gov/news/pressreleases.rss', category: 'finance', source: 'sec.gov', description: 'US SEC press releases & enforcement' },
  'fed-press': { title: 'Federal Reserve Press', url: 'https://www.federalreserve.gov/feeds/press_all.xml', category: 'finance', source: 'federalreserve.gov', description: 'US Federal Reserve press releases' },
  'bbc-world': { title: 'BBC World News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'news', source: 'bbc.co.uk', description: 'BBC world headlines' },
  'npr-news': { title: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', category: 'news', source: 'npr.org', description: 'NPR top news' },
  'guardian-world': { title: 'The Guardian — World', url: 'https://www.theguardian.com/world/rss', category: 'news', source: 'theguardian.com', description: 'Guardian world news' },
  'hacker-news': { title: 'Hacker News', url: 'https://news.ycombinator.com/rss', category: 'tech', source: 'news.ycombinator.com', description: 'Hacker News front page' },
  'ars-technica': { title: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'tech', source: 'arstechnica.com', description: 'Technology news & analysis' },
  techcrunch: { title: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'tech', source: 'techcrunch.com', description: 'Startup & tech industry news' },
  'nasa-news': { title: 'NASA Breaking News', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss', category: 'space', source: 'nasa.gov', description: 'NASA mission & science news' },
  'esa-news': { title: 'ESA Space News', url: 'https://www.esa.int/rssfeed/Our_Activities/Space_News', category: 'space', source: 'esa.int', description: 'European Space Agency news' },
};

const tools: McpToolExport['tools'] = [
  {
    name: 'list_feeds',
    description: 'List the curated feeds available (id, title, category, source). Optionally filter by category (security, health, finance, news, tech, space) or keyword. Pass an id to read_feed.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category: security, health, finance, news, tech, space.' },
        query: { type: 'string', description: 'Keyword to match in feed title/source/description.' },
      },
    },
  },
  {
    name: 'read_feed',
    description: 'Read a curated feed by its id (from list_feeds). Returns normalized items (title, link, published, summary). Optionally filter items by keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        feed: { type: 'string', description: 'Curated feed id, e.g. "cisa-advisories", "bbc-world".' },
        query: { type: 'string', description: 'Keyword filter over item title/summary.' },
        limit: { type: 'number', description: `Max items (1-${MAX_ITEMS}, default 20).` },
      },
      required: ['feed'],
    },
  },
  {
    name: 'fetch_feed',
    description: 'Fetch and normalize any RSS / Atom / RDF feed by URL. CF-robust: fetches directly and falls back to a proxy if the source blocks the gateway. Use list_feeds first for curated sources.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Feed URL, e.g. "https://news.ycombinator.com/rss".' },
        query: { type: 'string', description: 'Keyword filter over item title/summary.' },
        limit: { type: 'number', description: `Max items (1-${MAX_ITEMS}, default 20).` },
      },
      required: ['url'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_feeds':
      return listFeeds(args);
    case 'read_feed': {
      const id = String(args.feed ?? '').trim();
      const def = FEEDS[id];
      if (!def) throw new Error(`Unknown feed "${args.feed}". Use list_feeds to see valid ids.`);
      return readFeed(def.url, args, { id, ...def });
    }
    case 'fetch_feed': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('Pass a valid feed `url` (http/https).');
      return readFeed(url, args);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function listFeeds(args: Record<string, unknown>): unknown {
  const cat = typeof args.category === 'string' ? args.category.trim().toLowerCase() : '';
  const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
  const feeds = Object.entries(FEEDS)
    .filter(([, d]) => (!cat || d.category === cat) && (!q || `${d.title} ${d.source} ${d.description}`.toLowerCase().includes(q)))
    .map(([id, d]) => ({ id, title: d.title, category: d.category, source: d.source, description: d.description }));
  return { categories: [...new Set(Object.values(FEEDS).map((d) => d.category))].sort(), count: feeds.length, feeds };
}

async function readFeed(url: string, args: Record<string, unknown>, meta?: Record<string, unknown>): Promise<unknown> {
  const limit = clamp(numArg(args.limit, 20), 1, MAX_ITEMS);
  const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
  const { items, via } = await getFeed(url);
  let out = items;
  if (q) out = out.filter((i) => `${i.title} ${i.summary}`.toLowerCase().includes(q));
  return {
    feed: meta ? { id: meta.id, title: meta.title, source: meta.source } : { url },
    via,
    total_matching: out.length,
    count: Math.min(out.length, limit),
    items: out.slice(0, limit),
  };
}

interface FeedItem { title: string; link: string; published?: string; summary?: string; author?: string; categories?: string[]; id?: string }

/** Fetch directly; on a CF/egress block (non-feed or 4xx) fall back to the rss2json proxy. */
async function getFeed(url: string): Promise<{ items: FeedItem[]; via: string }> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } });
    if (res.ok) {
      const xml = await res.text();
      if (/<(item|entry)[\s>]/i.test(xml)) return { items: parseFeed(xml), via: 'direct' };
    }
  } catch {
    /* fall through to proxy */
  }
  // Proxy fallback (rss2json fetches server-side, bypassing CF-specific blocks).
  const pres = await fetch(`${PROXY}?rss_url=${encodeURIComponent(url)}&count=${MAX_ITEMS}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  const body = (await pres.json().catch(() => ({}))) as { status?: string; items?: ProxyItem[] };
  if (body.status === 'ok' && Array.isArray(body.items)) {
    return {
      items: body.items.map((i) => ({
        title: clean(i.title), link: i.link || '', published: i.pubDate || undefined,
        summary: clean(i.description)?.slice(0, 500) || undefined, author: i.author || undefined,
        categories: Array.isArray(i.categories) ? i.categories : undefined, id: i.guid || i.link,
      })),
      via: 'proxy',
    };
  }
  throw new Error(`Feed unreachable: ${url} (blocked directly and via proxy). The source may block datacenter egress.`);
}

interface ProxyItem { title?: string; link?: string; pubDate?: string; description?: string; author?: string; categories?: string[]; guid?: string }

function parseFeed(xml: string): FeedItem[] {
  const out: FeedItem[] = [];
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  for (const b of blocks) {
    const link = extractLink(b);
    out.push({
      title: clean(tag(b, 'title')),
      link,
      published: tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date') || undefined,
      summary: clean(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content'))?.slice(0, 500) || undefined,
      author: clean(tag(b, 'dc:creator') || authorName(b)) || undefined,
      categories: cats(b),
      id: tag(b, 'guid') || tag(b, 'id') || link,
    });
  }
  return out;
}

function extractLink(b: string): string {
  const rss = b.match(/<link>([\s\S]*?)<\/link>/i);
  if (rss && rss[1].trim()) return clean(rss[1]);
  // Atom: prefer rel="alternate", else first href
  const alt = b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || b.match(/<link[^>]*href=["']([^"']+)["']/i);
  return alt ? alt[1].trim() : '';
}
function authorName(b: string): string {
  const a = b.match(/<author>([\s\S]*?)<\/author>/i);
  if (!a) return '';
  const name = a[1].match(/<name>([\s\S]*?)<\/name>/i);
  return name ? name[1] : a[1];
}
function cats(b: string): string[] | undefined {
  const list: string[] = [];
  for (const m of b.matchAll(/<category[^>]*?(?:term=["']([^"']+)["'][^>]*)?>([\s\S]*?)<\/category>/gi)) {
    const v = clean(m[1] || m[2]);
    if (v) list.push(v);
  }
  for (const m of b.matchAll(/<category[^>]*term=["']([^"']+)["'][^>]*\/>/gi)) list.push(m[1]);
  return list.length ? [...new Set(list)].slice(0, 10) : undefined;
}
function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name.replace(':', '\\:')}[^>]*>([\\s\\S]*?)<\\/${name.replace(':', '\\:')}>`, 'i'));
  return m ? unwrap(m[1]) : '';
}
function unwrap(s: string): string {
  const m = s.trim().match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return (m ? m[1] : s).trim();
}
function clean(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    // expose entity-encoded tags, then strip real + decoded tags (letter-led, so "5 < 10" survives)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    // decode remaining entities (&amp; last to avoid double-decoding)
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
function numArg(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : dflt;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
