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
  'marginal-revolution': { title: 'Marginal Revolution', url: 'https://marginalrevolution.com/feed', category: 'economics', source: 'marginalrevolution.com', description: 'Economics blog (Tyler Cowen & Alex Tabarrok)' },
  'project-syndicate': { title: 'Project Syndicate', url: 'https://www.project-syndicate.org/rss', category: 'economics', source: 'project-syndicate.org', description: 'Global economics & policy commentary' },
  'calculated-risk': { title: 'Calculated Risk', url: 'https://www.calculatedriskblog.com/feeds/posts/default', category: 'economics', source: 'calculatedriskblog.com', description: 'US economy & housing analysis' },
  lithub: { title: 'Literary Hub', url: 'https://lithub.com/feed/', category: 'books', source: 'lithub.com', description: 'Literary culture, books & writing' },
  'paris-review': { title: 'The Paris Review', url: 'https://www.theparisreview.org/blog/feed/', category: 'books', source: 'theparisreview.org', description: 'Literature, interviews & writing' },
  lawfare: { title: 'Lawfare', url: 'https://www.lawfaremedia.org/feeds/articles', category: 'law', source: 'lawfaremedia.org', description: 'National-security law & policy' },
  'just-security': { title: 'Just Security', url: 'https://www.justsecurity.org/feed/', category: 'law', source: 'justsecurity.org', description: 'Law, rights & national-security analysis' },
  bdtechtalks: { title: 'TechTalks', url: 'https://bdtechtalks.com/feed/', category: 'ai', source: 'bdtechtalks.com', description: 'AI/ML explained for business & tech' },
  'one-useful-thing': { title: 'One Useful Thing', url: 'https://www.oneusefulthing.org/feed', category: 'ai', source: 'oneusefulthing.org', description: 'Practical AI essays (Ethan Mollick)' },
  'simon-willison': { title: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', category: 'ai', source: 'simonwillison.net', description: 'LLMs, tools & software engineering' },
  'daring-fireball': { title: 'Daring Fireball', url: 'https://daringfireball.net/feeds/main', category: 'dev', source: 'daringfireball.net', description: 'Apple, design & technology (John Gruber)' },
  'kubernetes-blog': { title: 'Kubernetes Blog', url: 'https://kubernetes.io/feed.xml', category: 'dev', source: 'kubernetes.io', description: 'Kubernetes project news' },
  'science-news': { title: 'Science News', url: 'https://www.sciencenews.org/feed', category: 'science', source: 'sciencenews.org', description: 'Society for Science — research news' },
  eos: { title: 'Eos', url: 'https://eos.org/feed', category: 'science', source: 'eos.org', description: 'Earth & space science news (AGU)' },
  zerohedge: { title: 'ZeroHedge', url: 'https://feeds.feedburner.com/zerohedge/feed', category: 'finance', source: 'zerohedge.com', description: 'Contrarian markets & finance commentary' },
  wolfstreet: { title: 'Wolf Street', url: 'https://wolfstreet.com/feed/', category: 'finance', source: 'wolfstreet.com', description: 'Markets, economy & finance analysis' },
  dlnews: { title: 'DL News', url: 'https://www.dlnews.com/arc/outboundfeeds/rss/', category: 'crypto', source: 'dlnews.com', description: 'Crypto & DeFi news' },
  'the-defiant': { title: 'The Defiant', url: 'https://thedefiant.io/feed', category: 'crypto', source: 'thedefiant.io', description: 'DeFi & crypto news' },
  vg247: { title: 'VG247', url: 'https://www.vg247.com/feed/news', category: 'gaming', source: 'vg247.com', description: 'Video game news' },
  collider: { title: 'Collider', url: 'https://collider.com/feed/', category: 'entertainment', source: 'collider.com', description: 'Movies & TV news' },
  'av-club': { title: 'The A.V. Club', url: 'https://www.avclub.com/rss', category: 'entertainment', source: 'avclub.com', description: 'Pop culture — film, TV & music' },
  'the-diplomat': { title: 'The Diplomat', url: 'https://thediplomat.com/feed/', category: 'news', source: 'thediplomat.com', description: 'Asia-Pacific politics & current affairs' },
  'rest-of-world': { title: 'Rest of World', url: 'https://restofworld.org/feed/latest/', category: 'news', source: 'restofworld.org', description: 'Tech & culture beyond the West' },
  'the-atlantic': { title: 'The Atlantic', url: 'https://www.theatlantic.com/feed/all/', category: 'news', source: 'theatlantic.com', description: 'Politics, culture & ideas (long-form)' },
  'the-kitchn': { title: 'The Kitchn', url: 'https://www.thekitchn.com/main.rss', category: 'food', source: 'thekitchn.com', description: 'Home cooking, recipes & kitchen tips' },
  'atlas-obscura': { title: 'Atlas Obscura', url: 'https://www.atlasobscura.com/feeds/latest', category: 'travel', source: 'atlasobscura.com', description: 'Hidden places & curiosities worldwide' },
  designboom: { title: 'designboom', url: 'https://www.designboom.com/feed/', category: 'design', source: 'designboom.com', description: 'Architecture, design & art' },
  tagesschau: { title: 'Tagesschau', url: 'https://www.tagesschau.de/index~rss2.xml', category: 'news', source: 'tagesschau.de', description: 'German news (ARD) — in German' },
  'le-monde': { title: 'Le Monde', url: 'https://www.lemonde.fr/rss/une.xml', category: 'news', source: 'lemonde.fr', description: 'French news — in French' },
  'el-pais': { title: 'El País', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', category: 'news', source: 'elpais.com', description: 'Spanish news — in Spanish' },
  ansa: { title: 'ANSA', url: 'https://www.ansa.it/sito/ansait_rss.xml', category: 'news', source: 'ansa.it', description: 'Italian news agency — in Italian' },
  nos: { title: 'NOS', url: 'https://feeds.nos.nl/nosnieuwsalgemeen', category: 'news', source: 'nos.nl', description: 'Dutch news (NOS) — in Dutch' },
  asahi: { title: 'Asahi Shimbun', url: 'https://www.asahi.com/rss/asahi/newsheadlines.rdf', category: 'news', source: 'asahi.com', description: 'Japanese news — in Japanese' },
  'inside-higher-ed': { title: 'Inside Higher Ed', url: 'https://www.insidehighered.com/rss.xml', category: 'news', source: 'insidehighered.com', description: 'US higher-education news' },
  'religion-news': { title: 'Religion News Service', url: 'https://religionnews.com/feed/', category: 'news', source: 'religionnews.com', description: 'Religion & faith news' },
  formula1: { title: 'Formula 1', url: 'https://www.formula1.com/en/latest/all.xml', category: 'sports', source: 'formula1.com', description: 'Official Formula 1 news' },
  'mma-fighting': { title: 'MMA Fighting', url: 'https://www.mmafighting.com/rss/index.xml', category: 'sports', source: 'mmafighting.com', description: 'MMA & UFC news' },
  espncricinfo: { title: 'ESPNcricinfo', url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml', category: 'sports', source: 'espncricinfo.com', description: 'Cricket news & analysis' },
  'ieee-spectrum': { title: 'IEEE Spectrum', url: 'https://spectrum.ieee.org/feeds/feed.rss', category: 'science', source: 'spectrum.ieee.org', description: 'Engineering & applied technology (IEEE)' },
  'plos-biology': { title: 'PLOS Biology', url: 'https://journals.plos.org/plosbiology/feed/atom', category: 'science', source: 'journals.plos.org', description: 'Open-access biology research' },
  elife: { title: 'eLife', url: 'https://elifesciences.org/rss/recent.xml', category: 'science', source: 'elifesciences.org', description: 'Open-access life-science research' },
  'physics-world': { title: 'Physics World', url: 'https://physicsworld.com/feed/', category: 'science', source: 'physicsworld.com', description: 'Physics news (Institute of Physics)' },
  'aas-nova': { title: 'AAS Nova', url: 'https://aasnova.org/feed/', category: 'science', source: 'aasnova.org', description: 'Astronomy research highlights (AAS)' },
  'simple-flying': { title: 'Simple Flying', url: 'https://simpleflying.com/feed/', category: 'transport', source: 'simpleflying.com', description: 'Airline & commercial-aviation news' },
  avweb: { title: 'AVweb', url: 'https://www.avweb.com/feed/', category: 'transport', source: 'avweb.com', description: 'General & business aviation news' },
  gcaptain: { title: 'gCaptain', url: 'https://gcaptain.com/feed/', category: 'transport', source: 'gcaptain.com', description: 'Maritime & shipping news' },
  inman: { title: 'Inman', url: 'https://www.inman.com/feed/', category: 'real-estate', source: 'inman.com', description: 'US residential real-estate news' },
  housingwire: { title: 'HousingWire', url: 'https://www.housingwire.com/feed/', category: 'real-estate', source: 'housingwire.com', description: 'US housing & mortgage-industry news' },
  '9to5mac': { title: '9to5Mac', url: 'https://9to5mac.com/feed/', category: 'tech', source: '9to5mac.com', description: 'Apple news & rumors' },
  macrumors: { title: 'MacRumors', url: 'https://feeds.macrumors.com/MacRumors-All', category: 'tech', source: 'macrumors.com', description: 'Apple news & rumors' },
  '9to5google': { title: '9to5Google', url: 'https://9to5google.com/feed/', category: 'tech', source: '9to5google.com', description: 'Google & Android news' },
  'android-police': { title: 'Android Police', url: 'https://www.androidpolice.com/feed/', category: 'tech', source: 'androidpolice.com', description: 'Android news & reviews' },
  'toms-hardware': { title: "Tom's Hardware", url: 'https://www.tomshardware.com/feeds/all', category: 'tech', source: 'tomshardware.com', description: 'PC hardware news & reviews' },
  servethehome: { title: 'ServeTheHome', url: 'https://www.servethehome.com/feed/', category: 'tech', source: 'servethehome.com', description: 'Server & enterprise-hardware news' },
  hackaday: { title: 'Hackaday', url: 'https://hackaday.com/blog/feed/', category: 'tech', source: 'hackaday.com', description: 'Hardware hacks & maker projects' },
  'dark-reading': { title: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml', category: 'security', source: 'darkreading.com', description: 'Enterprise cybersecurity news' },
  'the-record': { title: 'The Record', url: 'https://therecord.media/feed/', category: 'security', source: 'therecord.media', description: 'Cybersecurity & cybercrime news' },
  securityweek: { title: 'SecurityWeek', url: 'https://www.securityweek.com/feed/', category: 'security', source: 'securityweek.com', description: 'Enterprise security news' },
  omgubuntu: { title: 'OMG! Ubuntu', url: 'https://www.omgubuntu.co.uk/feed', category: 'dev', source: 'omgubuntu.co.uk', description: 'Ubuntu & Linux desktop news' },
  'yale-climate': { title: 'Yale Climate Connections', url: 'https://yaleclimateconnections.org/feed/', category: 'climate', source: 'yaleclimateconnections.org', description: 'Climate-change reporting' },
  'climate-home': { title: 'Climate Home News', url: 'https://www.climatechangenews.com/feed/', category: 'climate', source: 'climatechangenews.com', description: 'International climate-policy news' },
  'hr-dive': { title: 'HR Dive', url: 'https://www.hrdive.com/feeds/news/', category: 'business', source: 'hrdive.com', description: 'HR & workforce-management news' },
  'supply-chain-dive': { title: 'Supply Chain Dive', url: 'https://www.supplychaindive.com/feeds/news/', category: 'business', source: 'supplychaindive.com', description: 'Supply-chain & logistics news' },
  'construction-dive': { title: 'Construction Dive', url: 'https://www.constructiondive.com/feeds/news/', category: 'business', source: 'constructiondive.com', description: 'Construction-industry news' },
  'manufacturing-dive': { title: 'Manufacturing Dive', url: 'https://www.manufacturingdive.com/feeds/news/', category: 'business', source: 'manufacturingdive.com', description: 'Manufacturing-industry news' },
  'retail-dive': { title: 'Retail Dive', url: 'https://www.retaildive.com/feeds/news/', category: 'business', source: 'retaildive.com', description: 'Retail-industry news' },
  'grocery-dive': { title: 'Grocery Dive', url: 'https://www.grocerydive.com/feeds/news/', category: 'business', source: 'grocerydive.com', description: 'Grocery & food-retail news' },
  'healthcare-dive': { title: 'Healthcare Dive', url: 'https://www.healthcaredive.com/feeds/news/', category: 'health', source: 'healthcaredive.com', description: 'Healthcare-industry news' },
  'medtech-dive': { title: 'MedTech Dive', url: 'https://www.medtechdive.com/feeds/news/', category: 'health', source: 'medtechdive.com', description: 'Medical-device & medtech news' },
  nejm: { title: 'NEJM', url: 'https://www.nejm.org/action/showFeed?type=etoc&feed=rss&jc=nejm', category: 'health', source: 'nejm.org', description: 'New England Journal of Medicine — research' },
  jama: { title: 'JAMA', url: 'https://jamanetwork.com/rss/site_3/67.xml', category: 'health', source: 'jamanetwork.com', description: 'JAMA — medical research' },
  'banking-dive': { title: 'Banking Dive', url: 'https://www.bankingdive.com/feeds/news/', category: 'finance', source: 'bankingdive.com', description: 'Banking-industry news' },
  'cio-dive': { title: 'CIO Dive', url: 'https://www.ciodive.com/feeds/news/', category: 'tech', source: 'ciodive.com', description: 'Enterprise IT & CIO news' },
  'restaurant-dive': { title: 'Restaurant Dive', url: 'https://www.restaurantdive.com/feeds/news/', category: 'food', source: 'restaurantdive.com', description: 'Restaurant-industry news' },
  'le-figaro': { title: 'Le Figaro', url: 'https://www.lefigaro.fr/rss/figaro_actualites.xml', category: 'news', source: 'lefigaro.fr', description: 'French news — in French' },
  faz: { title: 'FAZ', url: 'https://www.faz.net/rss/aktuell/', category: 'news', source: 'faz.net', description: 'German news (FAZ) — in German' },
  'abc-es': { title: 'ABC (España)', url: 'https://www.abc.es/rss/2.0/portada/', category: 'news', source: 'abc.es', description: 'Spanish news (ABC) — in Spanish' },
  repubblica: { title: 'la Repubblica', url: 'https://www.repubblica.it/rss/homepage/rss2.0.xml', category: 'news', source: 'repubblica.it', description: 'Italian news — in Italian' },
  folha: { title: 'Folha de S.Paulo', url: 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml', category: 'news', source: 'folha.uol.com.br', description: 'Brazilian news — in Portuguese' },
  meduza: { title: 'Meduza', url: 'https://meduza.io/rss/en/all', category: 'news', source: 'meduza.io', description: 'Russia & ex-USSR news (English)' },
  calmatters: { title: 'CalMatters', url: 'https://calmatters.org/feed/', category: 'news', source: 'calmatters.org', description: 'California politics & policy' },
  'the-markup': { title: 'The Markup', url: 'https://themarkup.org/feeds/rss.xml', category: 'news', source: 'themarkup.org', description: 'Tech-accountability investigative journalism' },
  'the-19th': { title: 'The 19th', url: 'https://19thnews.org/feed/', category: 'news', source: '19thnews.org', description: 'Gender, politics & policy' },
  'texas-tribune': { title: 'The Texas Tribune', url: 'https://www.texastribune.org/feeds/main/', category: 'news', source: 'texastribune.org', description: 'Texas politics & policy' },
  cyclingweekly: { title: 'Cycling Weekly', url: 'https://www.cyclingweekly.com/feeds/all', category: 'sports', source: 'cyclingweekly.com', description: 'Cycling news & racing' },
  'highered-dive': { title: 'Higher Ed Dive', url: 'https://www.highereddive.com/feeds/news/', category: 'education', source: 'highereddive.com', description: 'Higher-education news' },
  'k12-dive': { title: 'K-12 Dive', url: 'https://www.k12dive.com/feeds/news/', category: 'education', source: 'k12dive.com', description: 'K-12 education news' },
  edsurge: { title: 'EdSurge', url: 'https://www.edsurge.com/articles_rss', category: 'education', source: 'edsurge.com', description: 'Education technology & learning' },
  the74: { title: 'The 74', url: 'https://www.the74million.org/feed/', category: 'education', source: 'the74million.org', description: 'US K-12 education news' },
  'biopharma-dive': { title: 'BioPharma Dive', url: 'https://www.biopharmadive.com/feeds/news/', category: 'health', source: 'biopharmadive.com', description: 'Biotech & pharma-industry news' },
  psyche: { title: 'Psyche', url: 'https://psyche.co/feed.rss', category: 'health', source: 'psyche.co', description: 'Psychology, mental health & philosophy' },
  'esg-dive': { title: 'ESG Dive', url: 'https://www.esgdive.com/feeds/news/', category: 'climate', source: 'esgdive.com', description: 'ESG & corporate-sustainability news' },
  'cfo-dive': { title: 'CFO Dive', url: 'https://www.cfodive.com/feeds/news/', category: 'finance', source: 'cfodive.com', description: 'CFO & corporate-finance news' },
  'payments-dive': { title: 'Payments Dive', url: 'https://www.paymentsdive.com/feeds/news/', category: 'finance', source: 'paymentsdive.com', description: 'Payments-industry news' },
  'cybersecurity-dive': { title: 'Cybersecurity Dive', url: 'https://www.cybersecuritydive.com/feeds/news/', category: 'security', source: 'cybersecuritydive.com', description: 'Enterprise cybersecurity news' },
  'waste-dive': { title: 'Waste Dive', url: 'https://www.wastedive.com/feeds/news/', category: 'business', source: 'wastedive.com', description: 'Waste & recycling-industry news' },
  'packaging-dive': { title: 'Packaging Dive', url: 'https://www.packagingdive.com/feeds/news/', category: 'business', source: 'packagingdive.com', description: 'Packaging-industry news' },
  'legal-dive': { title: 'Legal Dive', url: 'https://www.legaldive.com/feeds/news/', category: 'law', source: 'legaldive.com', description: 'Corporate legal & in-house counsel news' },
  'smart-cities-dive': { title: 'Smart Cities Dive', url: 'https://www.smartcitiesdive.com/feeds/news/', category: 'government', source: 'smartcitiesdive.com', description: 'Smart cities & urban-tech news' },
  'social-media-today': { title: 'Social Media Today', url: 'https://www.socialmediatoday.com/feeds/news/', category: 'marketing', source: 'socialmediatoday.com', description: 'Social media & digital marketing' },
  'hotel-dive': { title: 'Hotel Dive', url: 'https://www.hoteldive.com/feeds/news/', category: 'travel', source: 'hoteldive.com', description: 'Hotel & hospitality-industry news' },
  'trucking-dive': { title: 'Trucking Dive', url: 'https://www.truckingdive.com/feeds/news/', category: 'transport', source: 'truckingdive.com', description: 'Trucking & freight news' },
  clarin: { title: 'Clarín', url: 'https://www.clarin.com/rss/lo-ultimo/', category: 'news', source: 'clarin.com', description: 'Argentine news — in Spanish' },
  'jerusalem-post': { title: 'The Jerusalem Post', url: 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx', category: 'news', source: 'jpost.com', description: 'Israel & Middle East news (English)' },
  'straits-times': { title: 'The Straits Times', url: 'https://www.straitstimes.com/news/world/rss.xml', category: 'news', source: 'straitstimes.com', description: 'Singapore & Asia news (English)' },
  'the-hindu': { title: 'The Hindu', url: 'https://www.thehindu.com/news/national/feeder/default.rss', category: 'news', source: 'thehindu.com', description: 'India national news (English)' },
  'daily-sabah': { title: 'Daily Sabah', url: 'https://www.dailysabah.com/rssFeed/home', category: 'news', source: 'dailysabah.com', description: 'Turkey & world news (English)' },
  'irish-times': { title: 'The Irish Times', url: 'https://www.irishtimes.com/cmlink/news-1.1319192', category: 'news', source: 'irishtimes.com', description: 'Ireland & world news' },
  globo: { title: 'G1 (Globo)', url: 'https://g1.globo.com/rss/g1/', category: 'news', source: 'g1.globo.com', description: 'Brazilian news (G1) — in Portuguese' },
  'plos-one': { title: 'PLOS ONE', url: 'https://journals.plos.org/plosone/feed/atom', category: 'science', source: 'journals.plos.org', description: 'Open-access multidisciplinary research' },
  aeon: { title: 'Aeon', url: 'https://aeon.co/feed.rss', category: 'science', source: 'aeon.co', description: 'Ideas, philosophy & science essays' },
  'guardian-football': { title: 'Guardian Football', url: 'https://www.theguardian.com/football/rss', category: 'sports', source: 'theguardian.com', description: 'Football / soccer news (Guardian)' },
  velonews: { title: 'Velo', url: 'https://www.velonews.com/feed/', category: 'sports', source: 'velonews.com', description: 'Cycling & bike-racing news' },
  'last-week-in-ai': { title: 'Last Week in AI', url: 'https://lastweekin.ai/feed', category: 'ai', source: 'lastweekin.ai', description: 'Weekly AI news roundup' },
  lifehacker: { title: 'Lifehacker', url: 'https://lifehacker.com/feed/rss', category: 'tech', source: 'lifehacker.com', description: 'Productivity, tips & how-tos' },
  'import-ai': { title: 'Import AI', url: 'https://importai.substack.com/feed', category: 'ai', source: 'importai.substack.com', description: 'Weekly AI research & policy (Jack Clark)' },
  interconnects: { title: 'Interconnects', url: 'https://www.interconnects.ai/feed', category: 'ai', source: 'interconnects.ai', description: 'AI/ML research analysis (Nathan Lambert)' },
  'gary-marcus': { title: 'Gary Marcus', url: 'https://garymarcus.substack.com/feed', category: 'ai', source: 'garymarcus.substack.com', description: 'AI critique & analysis' },
  'sebastian-raschka': { title: 'Ahead of AI', url: 'https://magazine.sebastianraschka.com/feed', category: 'ai', source: 'magazine.sebastianraschka.com', description: 'ML & LLM deep dives' },
  'ai-supremacy': { title: 'AI Supremacy', url: 'https://www.ai-supremacy.com/feed', category: 'ai', source: 'ai-supremacy.com', description: 'AI-industry analysis' },
  'meta-eng': { title: 'Meta Engineering', url: 'https://engineering.fb.com/feed/', category: 'dev', source: 'engineering.fb.com', description: 'Meta engineering blog' },
  supabase: { title: 'Supabase', url: 'https://supabase.com/rss.xml', category: 'dev', source: 'supabase.com', description: 'Supabase product & engineering' },
  'discord-blog': { title: 'Discord Blog', url: 'https://discord.com/blog/rss.xml', category: 'dev', source: 'discord.com', description: 'Discord product & engineering' },
  vercel: { title: 'Vercel', url: 'https://vercel.com/atom', category: 'dev', source: 'vercel.com', description: 'Vercel & frontend-platform news' },
  'the-hill': { title: 'The Hill', url: 'https://thehill.com/news/feed/', category: 'government', source: 'thehill.com', description: 'US politics & policy' },
  govexec: { title: 'Government Executive', url: 'https://www.govexec.com/rss/all/', category: 'government', source: 'govexec.com', description: 'US federal-government management news' },
  'defense-one': { title: 'Defense One', url: 'https://www.defenseone.com/rss/all/', category: 'government', source: 'defenseone.com', description: 'US defense & national-security news' },
  'war-on-the-rocks': { title: 'War on the Rocks', url: 'https://warontherocks.com/feed/', category: 'government', source: 'warontherocks.com', description: 'National security & military strategy' },
  'foreign-affairs': { title: 'Foreign Affairs', url: 'https://www.foreignaffairs.com/rss.xml', category: 'news', source: 'foreignaffairs.com', description: 'International relations & foreign policy' },
  volkskrant: { title: 'de Volkskrant', url: 'https://www.volkskrant.nl/voorpagina/rss.xml', category: 'news', source: 'volkskrant.nl', description: 'Dutch news — in Dutch' },
  aftenposten: { title: 'Aftenposten', url: 'https://www.aftenposten.no/rss', category: 'news', source: 'aftenposten.no', description: 'Norwegian news — in Norwegian' },
  'helsingin-sanomat': { title: 'Helsingin Sanomat', url: 'https://www.hs.fi/rss/teasers/etusivu.xml', category: 'news', source: 'hs.fi', description: 'Finnish news — in Finnish' },
  politiken: { title: 'Politiken', url: 'https://politiken.dk/rss/senestenyt.rss', category: 'news', source: 'politiken.dk', description: 'Danish news — in Danish' },
  cna: { title: 'Channel NewsAsia', url: 'https://www.channelnewsasia.com/rssfeeds/8395986', category: 'news', source: 'channelnewsasia.com', description: 'Channel NewsAsia — Asia news (English)' },
  medscape: { title: 'Medscape', url: 'https://www.medscape.com/cx/rssfeeds/2700.xml', category: 'health', source: 'medscape.com', description: 'Medical news for clinicians' },
  'fierce-healthcare': { title: 'Fierce Healthcare', url: 'https://www.fiercehealthcare.com/rss/xml', category: 'health', source: 'fiercehealthcare.com', description: 'Healthcare-industry news' },
  'kff-health': { title: 'KFF Health News', url: 'https://kffhealthnews.org/feed/', category: 'health', source: 'kffhealthnews.org', description: 'Health-policy journalism (KFF)' },
  cryptoslate: { title: 'CryptoSlate', url: 'https://cryptoslate.com/feed/', category: 'crypto', source: 'cryptoslate.com', description: 'Crypto news & data' },
  protos: { title: 'Protos', url: 'https://protos.com/feed/', category: 'crypto', source: 'protos.com', description: 'Crypto investigative news' },
  'seeking-alpha': { title: 'Seeking Alpha', url: 'https://seekingalpha.com/feed.xml', category: 'finance', source: 'seekingalpha.com', description: 'Stock-market analysis & news' },
  gamesradar: { title: 'GamesRadar+', url: 'https://www.gamesradar.com/rss/', category: 'gaming', source: 'gamesradar.com', description: 'Games, movies & entertainment' },
  screenrant: { title: 'ScreenRant', url: 'https://screenrant.com/feed/', category: 'entertainment', source: 'screenrant.com', description: 'Movies, TV & pop culture' },
  defector: { title: 'Defector', url: 'https://defector.com/feed', category: 'sports', source: 'defector.com', description: 'Sports & culture (worker-owned)' },
};

const tools: McpToolExport['tools'] = [
  {
    name: 'list_feeds',
    description: 'List the curated feeds available (id, title, category, source). Optionally filter by category (security, health, finance, business, government, science, ai, dev, news, tech, space, sports, crypto, climate, entertainment, gaming, automotive, food, design, energy, travel, photography, marketing, economics, books, law, transport, real-estate, education) or keyword. Pass an id to read_feed.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category: security, health, finance, business, government, science, ai, dev, news, tech, space, sports, crypto, climate, entertainment, gaming, automotive, food, design, energy, travel, photography, marketing, economics, books, law, transport, real-estate, education.' },
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
