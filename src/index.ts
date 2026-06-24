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
  schneier: { title: 'Schneier on Security', url: 'https://www.schneier.com/feed/atom/', category: 'security', source: 'schneier.com', description: 'Bruce Schneier on security & cryptography' },
  bleepingcomputer: { title: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/', category: 'security', source: 'bleepingcomputer.com', description: 'Security & technology news, breaches, malware' },
  'who-news': { title: 'WHO News', url: 'https://www.who.int/rss-feeds/news-english.xml', category: 'health', source: 'who.int', description: 'World Health Organization news releases' },
  'fda-press': { title: 'FDA Press Releases', url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml', category: 'government', source: 'fda.gov', description: 'US FDA press releases (drugs, food, devices)' },
  'ftc-consumer': { title: 'FTC Consumer Protection', url: 'https://www.ftc.gov/feeds/press-release-consumer-protection.xml', category: 'government', source: 'ftc.gov', description: 'US FTC consumer-protection press releases (scams, fraud, refunds)' },
  'ecb-press': { title: 'ECB Press', url: 'https://www.ecb.europa.eu/rss/press.html', category: 'finance', source: 'ecb.europa.eu', description: 'European Central Bank press releases' },
  nature: { title: 'Nature', url: 'http://feeds.nature.com/nature/rss/current', category: 'science', source: 'nature.com', description: 'Nature journal — latest research & news' },
  sciencedaily: { title: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/all.xml', category: 'science', source: 'sciencedaily.com', description: 'Breaking science news across all fields' },
  'phys-org': { title: 'Phys.org', url: 'https://phys.org/rss-feed/', category: 'science', source: 'phys.org', description: 'Physics, space, tech & science news' },
  wired: { title: 'WIRED', url: 'https://www.wired.com/feed/rss', category: 'tech', source: 'wired.com', description: 'Technology, science & culture' },
  'the-verge': { title: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'tech', source: 'theverge.com', description: 'Technology, gadgets & culture' },
  'mit-tech-review': { title: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', category: 'tech', source: 'technologyreview.com', description: 'Emerging-technology analysis (AI, biotech, climate)' },
  engadget: { title: 'Engadget', url: 'https://www.engadget.com/rss.xml', category: 'tech', source: 'engadget.com', description: 'Consumer-tech & gadget news' },
  'nyt-world': { title: 'New York Times — World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', category: 'news', source: 'nytimes.com', description: 'NYT world news' },
  aljazeera: { title: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'news', source: 'aljazeera.com', description: 'Al Jazeera English — world news' },
  'dw-news': { title: 'Deutsche Welle', url: 'https://rss.dw.com/rdf/rss-en-all', category: 'news', source: 'dw.com', description: 'Deutsche Welle — German & world news (English)' },
  propublica: { title: 'ProPublica', url: 'https://www.propublica.org/feeds/propublica/main', category: 'news', source: 'propublica.org', description: 'Investigative journalism' },
  cnn: { title: 'CNN', url: 'http://rss.cnn.com/rss/edition.rss', category: 'news', source: 'cnn.com', description: 'CNN international news' },
  france24: { title: 'France 24', url: 'https://www.france24.com/en/rss', category: 'news', source: 'france24.com', description: 'France 24 English — world news' },
  'times-of-india': { title: 'Times of India', url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', category: 'news', source: 'timesofindia.indiatimes.com', description: 'India & world top stories' },
  politico: { title: 'Politico', url: 'https://www.politico.com/rss/politicopicks.xml', category: 'news', source: 'politico.com', description: 'US politics & policy' },
  axios: { title: 'Axios', url: 'https://api.axios.com/feed/', category: 'news', source: 'axios.com', description: 'Concise news across politics, business & tech' },
  boe: { title: 'Bank of England', url: 'https://www.bankofengland.co.uk/rss/news', category: 'finance', source: 'bankofengland.co.uk', description: 'Bank of England news & monetary policy' },
  cnbc: { title: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', category: 'finance', source: 'cnbc.com', description: 'Business, markets & finance news' },
  marketwatch: { title: 'MarketWatch', url: 'http://feeds.marketwatch.com/marketwatch/topstories/', category: 'finance', source: 'marketwatch.com', description: 'Markets & investing news' },
  statnews: { title: 'STAT News', url: 'https://www.statnews.com/feed/', category: 'health', source: 'statnews.com', description: 'Health, medicine & biotech journalism' },
  'new-scientist': { title: 'New Scientist', url: 'https://www.newscientist.com/feed/home/', category: 'science', source: 'newscientist.com', description: 'Science & technology news' },
  quanta: { title: 'Quanta Magazine', url: 'https://www.quantamagazine.org/feed/', category: 'science', source: 'quantamagazine.org', description: 'Math & fundamental-science journalism' },
  'the-register': { title: 'The Register', url: 'https://www.theregister.com/headlines.atom', category: 'tech', source: 'theregister.com', description: 'Enterprise IT & technology news' },
  'venturebeat-ai': { title: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', category: 'tech', source: 'venturebeat.com', description: 'Artificial-intelligence industry news' },
  'bbc-sport': { title: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', category: 'sports', source: 'bbc.co.uk', description: 'BBC Sport headlines' },
  'sky-sports': { title: 'Sky Sports', url: 'https://www.skysports.com/rss/12040', category: 'sports', source: 'skysports.com', description: 'Sky Sports news' },
  coindesk: { title: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'crypto', source: 'coindesk.com', description: 'Cryptocurrency & blockchain news' },
  cointelegraph: { title: 'Cointelegraph', url: 'https://cointelegraph.com/rss', category: 'crypto', source: 'cointelegraph.com', description: 'Crypto news & analysis' },
  decrypt: { title: 'Decrypt', url: 'https://decrypt.co/feed', category: 'crypto', source: 'decrypt.co', description: 'Crypto & web3 news' },
  'carbon-brief': { title: 'Carbon Brief', url: 'https://www.carbonbrief.org/feed/', category: 'climate', source: 'carbonbrief.org', description: 'Climate science & policy analysis' },
  'inside-climate': { title: 'Inside Climate News', url: 'https://insideclimatenews.org/feed/', category: 'climate', source: 'insideclimatenews.org', description: 'Climate & environment journalism' },
  grist: { title: 'Grist', url: 'https://grist.org/feed/', category: 'climate', source: 'grist.org', description: 'Climate, justice & solutions' },
  variety: { title: 'Variety', url: 'https://variety.com/feed/', category: 'entertainment', source: 'variety.com', description: 'Film, TV & entertainment industry' },
  'hollywood-reporter': { title: 'The Hollywood Reporter', url: 'https://www.hollywoodreporter.com/feed/', category: 'entertainment', source: 'hollywoodreporter.com', description: 'Entertainment industry news' },
  pitchfork: { title: 'Pitchfork', url: 'https://pitchfork.com/rss/news/', category: 'entertainment', source: 'pitchfork.com', description: 'Music news & reviews' },
  polygon: { title: 'Polygon', url: 'https://www.polygon.com/rss/index.xml', category: 'gaming', source: 'polygon.com', description: 'Video game & pop-culture news' },
  ign: { title: 'IGN', url: 'https://feeds.ign.com/ign/all', category: 'gaming', source: 'ign.com', description: 'Games, movies & tech reviews' },
  eurogamer: { title: 'Eurogamer', url: 'https://www.eurogamer.net/feed', category: 'gaming', source: 'eurogamer.net', description: 'Video game news & reviews' },
  openai: { title: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml', category: 'ai', source: 'openai.com', description: 'OpenAI research & product announcements' },
  deepmind: { title: 'Google DeepMind Blog', url: 'https://deepmind.google/blog/rss.xml', category: 'ai', source: 'deepmind.google', description: 'DeepMind AI research' },
  'google-ai': { title: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', category: 'ai', source: 'blog.google', description: 'Google AI announcements' },
  huggingface: { title: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', category: 'ai', source: 'huggingface.co', description: 'Open-source ML / AI articles' },
  'github-blog': { title: 'The GitHub Blog', url: 'https://github.blog/feed/', category: 'dev', source: 'github.blog', description: 'GitHub product & engineering' },
  'stackoverflow-blog': { title: 'Stack Overflow Blog', url: 'https://stackoverflow.blog/feed/', category: 'dev', source: 'stackoverflow.blog', description: 'Software development articles' },
  'aws-blog': { title: 'AWS News Blog', url: 'https://aws.amazon.com/blogs/aws/feed/', category: 'dev', source: 'aws.amazon.com', description: 'Amazon Web Services announcements' },
  'google-dev': { title: 'Google Developers Blog', url: 'https://developers.googleblog.com/feeds/posts/default', category: 'dev', source: 'developers.googleblog.com', description: 'Google developer platform news' },
  'web-dev': { title: 'web.dev', url: 'https://web.dev/feed.xml', category: 'dev', source: 'web.dev', description: 'Modern web development (Google)' },
  'mozilla-hacks': { title: 'Mozilla Hacks', url: 'https://hacks.mozilla.org/feed/', category: 'dev', source: 'hacks.mozilla.org', description: 'Web platform & Firefox engineering' },
  smashing: { title: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', category: 'dev', source: 'smashingmagazine.com', description: 'Web design & front-end development' },
  'css-tricks': { title: 'CSS-Tricks', url: 'https://css-tricks.com/feed/', category: 'dev', source: 'css-tricks.com', description: 'CSS & front-end techniques' },
  forbes: { title: 'Forbes Business', url: 'https://www.forbes.com/business/feed/', category: 'business', source: 'forbes.com', description: 'Business news & analysis' },
  'business-insider': { title: 'Business Insider', url: 'https://www.businessinsider.com/rss', category: 'business', source: 'businessinsider.com', description: 'Business, tech & markets news' },
  fortune: { title: 'Fortune', url: 'https://fortune.com/feed/', category: 'business', source: 'fortune.com', description: 'Business & corporate news' },
  'fast-company': { title: 'Fast Company', url: 'https://www.fastcompany.com/latest/rss', category: 'business', source: 'fastcompany.com', description: 'Business, innovation & design' },
  boj: { title: 'Bank of Japan', url: 'https://www.boj.or.jp/en/rss/whatsnew.xml', category: 'finance', source: 'boj.or.jp', description: 'Bank of Japan news (English)' },
  rba: { title: 'Reserve Bank of Australia', url: 'https://www.rba.gov.au/rss/rss-cb-media-releases.xml', category: 'finance', source: 'rba.gov.au', description: 'RBA media releases' },
  boc: { title: 'Bank of Canada', url: 'https://www.bankofcanada.ca/content_type/press-releases/feed/', category: 'finance', source: 'bankofcanada.ca', description: 'Bank of Canada press releases' },
  riksbank: { title: 'Sveriges Riksbank', url: 'https://www.riksbank.se/en-gb/rss/press-releases/', category: 'finance', source: 'riksbank.se', description: 'Swedish central bank press releases' },
  rbi: { title: 'Reserve Bank of India', url: 'https://www.rbi.org.in/pressreleases_rss.xml', category: 'finance', source: 'rbi.org.in', description: 'RBI press releases' },
  'scientific-american': { title: 'Scientific American', url: 'http://rss.sciam.com/ScientificAmerican-Global', category: 'science', source: 'scientificamerican.com', description: 'Science news & analysis' },
  cbc: { title: 'CBC News', url: 'https://www.cbc.ca/webfeed/rss/rss-topstories', category: 'news', source: 'cbc.ca', description: 'Canadian Broadcasting Corporation top stories' },
  'abc-au': { title: 'ABC News (Australia)', url: 'https://www.abc.net.au/news/feed/51120/rss.xml', category: 'news', source: 'abc.net.au', description: 'Australian Broadcasting Corporation news' },
  'japan-times': { title: 'The Japan Times', url: 'https://www.japantimes.co.jp/feed/', category: 'news', source: 'japantimes.co.jp', description: 'Japan & Asia news (English)' },
  'spiegel-intl': { title: 'Der Spiegel International', url: 'https://www.spiegel.de/international/index.rss', category: 'news', source: 'spiegel.de', description: 'German & world news (English)' },
  'spaceflight-now': { title: 'Spaceflight Now', url: 'https://spaceflightnow.com/feed/', category: 'space', source: 'spaceflightnow.com', description: 'Rocket launches & space-mission news' },
  'universe-today': { title: 'Universe Today', url: 'https://www.universetoday.com/feed/', category: 'space', source: 'universetoday.com', description: 'Astronomy & space-exploration news' },
  electrek: { title: 'Electrek', url: 'https://electrek.co/feed/', category: 'automotive', source: 'electrek.co', description: 'EVs, Tesla & clean-transport news' },
  insideevs: { title: 'InsideEVs', url: 'https://insideevs.com/rss/articles/all/', category: 'automotive', source: 'insideevs.com', description: 'Electric-vehicle news & reviews' },
  'the-drive': { title: 'The Drive', url: 'https://www.thedrive.com/feed', category: 'automotive', source: 'thedrive.com', description: 'Cars, gear & automotive culture' },
  motor1: { title: 'Motor1', url: 'https://www.motor1.com/rss/news/all/', category: 'automotive', source: 'motor1.com', description: 'Car news & reviews' },
  jalopnik: { title: 'Jalopnik', url: 'https://jalopnik.com/rss', category: 'automotive', source: 'jalopnik.com', description: 'Car culture & news' },
  eater: { title: 'Eater', url: 'https://www.eater.com/rss/index.xml', category: 'food', source: 'eater.com', description: 'Restaurants, dining & food culture' },
  'bon-appetit': { title: 'Bon Appétit', url: 'https://www.bonappetit.com/feed/rss', category: 'food', source: 'bonappetit.com', description: 'Recipes, cooking & food news' },
  dezeen: { title: 'Dezeen', url: 'https://www.dezeen.com/feed/', category: 'design', source: 'dezeen.com', description: 'Architecture & design news' },
  archdaily: { title: 'ArchDaily', url: 'https://www.archdaily.com/rss/', category: 'design', source: 'archdaily.com', description: 'Architecture news & projects' },
  core77: { title: 'Core77', url: 'https://www.core77.com/blog/rss.xml', category: 'design', source: 'core77.com', description: 'Industrial & product design' },
  'design-milk': { title: 'Design Milk', url: 'https://design-milk.com/feed/', category: 'design', source: 'design-milk.com', description: 'Modern design, interiors & products' },
  oilprice: { title: 'OilPrice.com', url: 'https://oilprice.com/rss/main', category: 'energy', source: 'oilprice.com', description: 'Oil, gas & energy-markets news' },
  'utility-dive': { title: 'Utility Dive', url: 'https://www.utilitydive.com/feeds/news/', category: 'energy', source: 'utilitydive.com', description: 'Electric-utility & power-sector news' },
  'pv-magazine': { title: 'pv magazine', url: 'https://www.pv-magazine.com/feed/', category: 'energy', source: 'pv-magazine.com', description: 'Solar & renewable-energy news' },
  scotusblog: { title: 'SCOTUSblog', url: 'https://www.scotusblog.com/feed/', category: 'government', source: 'scotusblog.com', description: 'US Supreme Court news & analysis' },
  'nvidia-blog': { title: 'NVIDIA Blog', url: 'https://blogs.nvidia.com/feed/', category: 'ai', source: 'blogs.nvidia.com', description: 'NVIDIA AI & accelerated-computing news' },
  bair: { title: 'Berkeley AI Research', url: 'https://bair.berkeley.edu/blog/feed.xml', category: 'ai', source: 'bair.berkeley.edu', description: 'BAIR AI-research blog' },
  'cloudflare-blog': { title: 'Cloudflare Blog', url: 'https://blog.cloudflare.com/rss/', category: 'dev', source: 'blog.cloudflare.com', description: 'Cloudflare engineering & product' },
  'netflix-tech': { title: 'Netflix TechBlog', url: 'https://netflixtechblog.com/feed', category: 'dev', source: 'netflixtechblog.com', description: 'Netflix engineering' },
  infoq: { title: 'InfoQ', url: 'https://feed.infoq.com/', category: 'dev', source: 'infoq.com', description: 'Software architecture & development news' },
  'dev-to': { title: 'DEV Community', url: 'https://dev.to/feed', category: 'dev', source: 'dev.to', description: 'Developer community articles' },
  lwn: { title: 'LWN.net', url: 'https://lwn.net/headlines/rss', category: 'dev', source: 'lwn.net', description: 'Linux & open-source development news' },
  'the-conversation': { title: 'The Conversation', url: 'https://theconversation.com/us/articles.atom', category: 'science', source: 'theconversation.com', description: 'Research-driven news & analysis by academics' },
  livescience: { title: 'Live Science', url: 'https://www.livescience.com/feeds/all', category: 'science', source: 'livescience.com', description: 'Science news (space, health, nature, tech)' },
  'space-com': { title: 'Space.com', url: 'https://www.space.com/feeds/all', category: 'space', source: 'space.com', description: 'Space, astronomy & spaceflight news' },
  'the-block': { title: 'The Block', url: 'https://www.theblock.co/rss.xml', category: 'crypto', source: 'theblock.co', description: 'Crypto markets & industry news' },
  blockworks: { title: 'Blockworks', url: 'https://blockworks.co/feed', category: 'crypto', source: 'blockworks.co', description: 'Crypto & digital-assets news' },
  deadline: { title: 'Deadline', url: 'https://deadline.com/feed/', category: 'entertainment', source: 'deadline.com', description: 'Film, TV & Hollywood breaking news' },
  billboard: { title: 'Billboard', url: 'https://www.billboard.com/feed/', category: 'entertainment', source: 'billboard.com', description: 'Music industry & charts news' },
  'pc-gamer': { title: 'PC Gamer', url: 'https://www.pcgamer.com/rss/', category: 'gaming', source: 'pcgamer.com', description: 'PC gaming news & reviews' },
  kotaku: { title: 'Kotaku', url: 'https://kotaku.com/rss', category: 'gaming', source: 'kotaku.com', description: 'Gaming & pop-culture news' },
  'cbs-news': { title: 'CBS News', url: 'https://www.cbsnews.com/latest/rss/main', category: 'news', source: 'cbsnews.com', description: 'CBS News (US) top stories' },
  'foreign-policy': { title: 'Foreign Policy', url: 'https://foreignpolicy.com/feed/', category: 'news', source: 'foreignpolicy.com', description: 'International affairs & geopolitics' },
  skift: { title: 'Skift', url: 'https://skift.com/feed/', category: 'travel', source: 'skift.com', description: 'Travel-industry news & analysis' },
  'the-points-guy': { title: 'The Points Guy', url: 'https://thepointsguy.com/feed/', category: 'travel', source: 'thepointsguy.com', description: 'Points, miles, flights & travel deals' },
  'nomadic-matt': { title: 'Nomadic Matt', url: 'https://www.nomadicmatt.com/travel-blog/feed/', category: 'travel', source: 'nomadicmatt.com', description: 'Budget-travel tips & guides' },
  petapixel: { title: 'PetaPixel', url: 'https://petapixel.com/feed/', category: 'photography', source: 'petapixel.com', description: 'Photography news & gear' },
  dpreview: { title: 'DPReview', url: 'https://www.dpreview.com/feeds/news.xml', category: 'photography', source: 'dpreview.com', description: 'Camera & photography reviews' },
  fstoppers: { title: 'Fstoppers', url: 'https://fstoppers.com/rss.xml', category: 'photography', source: 'fstoppers.com', description: 'Photography & filmmaking' },
  adweek: { title: 'Adweek', url: 'https://www.adweek.com/feed/', category: 'marketing', source: 'adweek.com', description: 'Advertising & marketing news' },
  digiday: { title: 'Digiday', url: 'https://digiday.com/feed/', category: 'marketing', source: 'digiday.com', description: 'Digital media & marketing' },
  'marketing-dive': { title: 'Marketing Dive', url: 'https://www.marketingdive.com/feeds/news/', category: 'marketing', source: 'marketingdive.com', description: 'Marketing-industry news' },
  'microsoft-research': { title: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/feed/', category: 'ai', source: 'microsoft.com', description: 'Microsoft Research (AI & computing)' },
  'the-gradient': { title: 'The Gradient', url: 'https://thegradient.pub/rss/', category: 'ai', source: 'thegradient.pub', description: 'AI/ML research perspectives' },
  'martin-fowler': { title: 'Martin Fowler', url: 'https://martinfowler.com/feed.atom', category: 'dev', source: 'martinfowler.com', description: 'Software design & architecture' },
  'stripe-blog': { title: 'Stripe Blog', url: 'https://stripe.com/blog/feed.rss', category: 'dev', source: 'stripe.com', description: 'Stripe engineering & product' },
  'go-blog': { title: 'The Go Blog', url: 'https://go.dev/blog/feed.atom', category: 'dev', source: 'go.dev', description: 'Go programming language news' },
  'rust-blog': { title: 'Rust Blog', url: 'https://blog.rust-lang.org/feed.xml', category: 'dev', source: 'blog.rust-lang.org', description: 'Rust programming language news' },
  phoronix: { title: 'Phoronix', url: 'https://www.phoronix.com/rss.php', category: 'dev', source: 'phoronix.com', description: 'Linux hardware & open-source benchmarks' },
  undark: { title: 'Undark', url: 'https://undark.org/feed/', category: 'science', source: 'undark.org', description: 'Science journalism — where science meets society' },
  nautilus: { title: 'Nautilus', url: 'https://nautil.us/feed/', category: 'science', source: 'nautil.us', description: 'Science & philosophy long-reads' },
  'big-think': { title: 'Big Think', url: 'https://bigthink.com/feed/', category: 'science', source: 'bigthink.com', description: 'Big ideas in science & philosophy' },
  'bitcoin-magazine': { title: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/feed', category: 'crypto', source: 'bitcoinmagazine.com', description: 'Bitcoin news & analysis' },
  'rock-paper-shotgun': { title: 'Rock Paper Shotgun', url: 'https://www.rockpapershotgun.com/feed', category: 'gaming', source: 'rockpapershotgun.com', description: 'PC gaming news & reviews' },
  gamespot: { title: 'GameSpot', url: 'https://www.gamespot.com/feeds/news/', category: 'gaming', source: 'gamespot.com', description: 'Video game news & reviews' },
  indiewire: { title: 'IndieWire', url: 'https://www.indiewire.com/feed/', category: 'entertainment', source: 'indiewire.com', description: 'Film & TV industry news' },
  stereogum: { title: 'Stereogum', url: 'https://www.stereogum.com/feed/', category: 'entertainment', source: 'stereogum.com', description: 'Indie music news & reviews' },
  'sb-nation': { title: 'SB Nation', url: 'https://www.sbnation.com/rss/index.xml', category: 'sports', source: 'sbnation.com', description: 'Sports news & community' },
  motorsport: { title: 'Motorsport.com', url: 'https://www.motorsport.com/rss/all/news/', category: 'sports', source: 'motorsport.com', description: 'F1 & motorsport news' },
  'medpage-today': { title: 'MedPage Today', url: 'https://www.medpagetoday.com/rss/headlines.xml', category: 'health', source: 'medpagetoday.com', description: 'Medical news for professionals' },
  'fierce-pharma': { title: 'Fierce Pharma', url: 'https://www.fiercepharma.com/rss/xml', category: 'health', source: 'fiercepharma.com', description: 'Pharma-industry news' },
  'nbc-news': { title: 'NBC News', url: 'https://feeds.nbcnews.com/nbcnews/public/news', category: 'news', source: 'nbcnews.com', description: 'NBC News (US) top stories' },
  vox: { title: 'Vox', url: 'https://www.vox.com/rss/index.xml', category: 'news', source: 'vox.com', description: 'Explanatory news & analysis' },
  'the-intercept': { title: 'The Intercept', url: 'https://theintercept.com/feed/', category: 'news', source: 'theintercept.com', description: 'Investigative journalism' },
  scmp: { title: 'South China Morning Post', url: 'https://www.scmp.com/rss/91/feed', category: 'news', source: 'scmp.com', description: 'Hong Kong, China & Asia news' },
};

const tools: McpToolExport['tools'] = [
  {
    name: 'list_feeds',
    description: 'List the curated feeds available (id, title, category, source). Optionally filter by category (security, health, finance, business, government, science, ai, dev, news, tech, space, sports, crypto, climate, entertainment, gaming, automotive, food, design, energy, travel, photography, marketing) or keyword. Pass an id to read_feed.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category: security, health, finance, business, government, science, ai, dev, news, tech, space, sports, crypto, climate, entertainment, gaming, automotive, food, design, energy, travel, photography, marketing.' },
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
