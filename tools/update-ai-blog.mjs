import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const blogDir = path.join(rootDir, "blog");
const postsDir = path.join(blogDir, "posts");
const dataDir = path.join(blogDir, "data");
const maxNewsItems = Number.parseInt(process.env.BLOG_MAX_NEWS || "10", 10);
const maxFinanceItems = Number.parseInt(process.env.BLOG_MAX_FINANCE || "6", 10);
const maxPapers = Number.parseInt(process.env.BLOG_MAX_PAPERS || "6", 10);
const arxivPoolSize = Number.parseInt(process.env.BLOG_ARXIV_POOL || String(Math.max(48, maxPapers * 8)), 10);
const maxStoredPosts = Number.parseInt(process.env.BLOG_MAX_STORED_POSTS || "60", 10);
const assetVersion = "20260613e";

const arxivTopics = [
  "cat:cs.AI",
  "cat:cs.LG",
  "cat:cs.CL",
  "cat:cs.CV",
  "cat:cs.MA",
  "cat:stat.ML"
];

const arxivTopicNames = arxivTopics.map((topic) => topic.replace(/^cat:/, ""));

const newsSources = [
  {
    name: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
    track: "AI"
  },
  {
    name: "Google AI",
    url: "https://blog.google/technology/ai/rss/",
    track: "AI"
  },
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    track: "AI/Tech"
  },
  {
    name: "VentureBeat AI",
    url: "https://venturebeat.com/category/ai/feed/",
    track: "AI"
  },
  {
    name: "The Verge",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    track: "AI/Tech"
  },
  {
    name: "Hacker News",
    url: "https://hnrss.org/frontpage?points=150&count=12",
    track: "Tech"
  },
  {
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    track: "Tech"
  }
];

const financeSources = [
  {
    name: "Yahoo Finance Markets",
    url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EDJI,%5EIXIC&region=US&lang=en-US",
    track: "Markets"
  },
  {
    name: "CNBC Markets",
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    track: "Stocks"
  },
  {
    name: "MarketWatch Top Stories",
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    track: "Finance"
  },
  {
    name: "MarketWatch MarketPulse",
    url: "https://feeds.content.dowjones.io/public/rss/mw_marketpulse",
    track: "MarketPulse"
  }
];

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const decodeEntities = (value) =>
  String(value ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");

const cleanText = (value) =>
  decodeEntities(
    String(value ?? "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();

const normalizeWhitespace = (value) =>
  cleanText(value).replace(/\s+/g, " ").trim();

const formatLosAngelesDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const formatSourceDate = (value, fallback) => {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 16);
  }

  return formatLosAngelesDate(date);
};

const getTag = (xml, tagName) => {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? normalizeWhitespace(match[1]) : "";
};

const getBlocks = (xml, tagName) =>
  [...xml.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi"))]
    .map((match) => match[1]);

const getAttribute = (tag, attributeName) => {
  const escaped = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`${escaped}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? decodeEntities(match[1]) : "";
};

const getAuthors = (xml) =>
  [...xml.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/gi)]
    .map((match) => normalizeWhitespace(match[1]))
    .filter(Boolean);

const getCategories = (xml) =>
  [...xml.matchAll(/<category[^>]*term="([^"]+)"/gi)]
    .map((match) => normalizeWhitespace(match[1]))
    .filter(Boolean);

const getAlternateLink = (xml) => {
  const preferred = xml.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i);
  if (preferred) {
    return decodeEntities(preferred[1]);
  }

  const fallback = xml.match(/<id>([\s\S]*?)<\/id>/i);
  return fallback ? normalizeWhitespace(fallback[1]) : "";
};

const normalizePaperUrl = (url) => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith("arxiv.org")) {
      const id = parsed.pathname.replace(/^\/abs\//, "").replace(/v\d+$/i, "");
      return `arxiv:${id.toLowerCase()}`;
    }

    return parsed.toString().replace(/v\d+$/i, "").toLowerCase();
  } catch {
    return String(url || "").replace(/v\d+$/i, "").toLowerCase();
  }
};

const paperTopic = (paper) =>
  paper.categories.find((category) => arxivTopicNames.includes(category))
  || paper.categories[0]
  || "AI research";

const collectPreviouslyFeaturedPaperUrls = async (posts) => {
  const recentPosts = posts.slice(0, 14);
  const urlSets = await Promise.all(recentPosts.map(async (post) => {
    if (!post?.url) {
      return [];
    }

    const postPath = path.join(rootDir, post.url);
    if (!existsSync(postPath)) {
      return [];
    }

    const html = await readFile(postPath, "utf8");
    return [...html.matchAll(/https?:\/\/arxiv\.org\/abs\/[^"'<\s]+/gi)]
      .map((match) => normalizePaperUrl(match[0]));
  }));

  return new Set(urlSets.flat());
};

const selectDiversePapers = (papers, previouslyFeaturedUrls = new Set()) => {
  const buckets = new Map();
  const seen = new Set(previouslyFeaturedUrls);

  for (const paper of papers) {
    const normalizedUrl = normalizePaperUrl(paper.url);
    if (!normalizedUrl || seen.has(normalizedUrl)) {
      continue;
    }

    seen.add(normalizedUrl);
    const topic = paperTopic(paper);
    const bucket = buckets.get(topic) || [];
    bucket.push(paper);
    buckets.set(topic, bucket);
  }

  const selected = [];
  const topicOrder = [
    ...arxivTopicNames,
    ...[...buckets.keys()].filter((topic) => !arxivTopicNames.includes(topic))
  ];

  while (selected.length < maxPapers) {
    let added = false;
    for (const topic of topicOrder) {
      const next = buckets.get(topic)?.shift();
      if (!next) {
        continue;
      }

      selected.push(next);
      added = true;
      if (selected.length === maxPapers) {
        break;
      }
    }

    if (!added) {
      break;
    }
  }

  if (selected.length >= maxPapers) {
    return selected;
  }

  const fallbackSeen = new Set(selected.map((paper) => normalizePaperUrl(paper.url)));
  for (const paper of papers) {
    const normalizedUrl = normalizePaperUrl(paper.url);
    if (fallbackSeen.has(normalizedUrl)) {
      continue;
    }

    fallbackSeen.add(normalizedUrl);
    selected.push(paper);
    if (selected.length === maxPapers) {
      break;
    }
  }

  return selected;
};

const getFeedLink = (xml) => {
  const atom = xml.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i)
    || xml.match(/<link[^>]*href="([^"]+)"[^>]*rel="alternate"/i);
  if (atom) {
    return decodeEntities(atom[1]);
  }

  const rss = xml.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (rss) {
    return normalizeWhitespace(rss[1]);
  }

  const guid = xml.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
  return guid ? normalizeWhitespace(guid[1]) : "";
};

const normalizeImageUrl = (value, baseUrl) => {
  const imageUrl = decodeEntities(value || "").trim();
  if (!imageUrl || imageUrl.startsWith("data:")) {
    return "";
  }

  try {
    const normalized = imageUrl.startsWith("//")
      ? `https:${imageUrl}`
      : new URL(imageUrl, baseUrl).toString();
    return /^https?:\/\//i.test(normalized) ? normalized : "";
  } catch {
    return "";
  }
};

const findFeedImage = (block, sourceUrl) => {
  const mediaTag = block.match(/<media:(?:content|thumbnail)\b[^>]*>/i);
  const enclosureTag = block.match(/<enclosure\b[^>]*>/i);
  const imageTag = block.match(/<image\b[^>]*>/i);
  const imageUrlTag = block.match(/<image>\s*<url>([\s\S]*?)<\/url>\s*<\/image>/i);
  const imgTag = block.match(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/i);

  return normalizeImageUrl(mediaTag ? getAttribute(mediaTag[0], "url") : "", sourceUrl)
    || normalizeImageUrl(enclosureTag ? getAttribute(enclosureTag[0], "url") : "", sourceUrl)
    || normalizeImageUrl(imageTag ? getAttribute(imageTag[0], "href") || getAttribute(imageTag[0], "url") : "", sourceUrl)
    || normalizeImageUrl(imageUrlTag ? imageUrlTag[1] : "", sourceUrl)
    || normalizeImageUrl(imgTag ? imgTag[1] : "", sourceUrl);
};

const findMetaImage = (html, baseUrl) => {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  const preferredNames = new Set([
    "og:image",
    "og:image:url",
    "og:image:secure_url",
    "twitter:image",
    "twitter:image:src",
    "thumbnail"
  ]);

  for (const tag of metaTags) {
    const key = (
      getAttribute(tag, "property")
      || getAttribute(tag, "name")
      || getAttribute(tag, "itemprop")
    ).toLowerCase();
    if (!preferredNames.has(key)) {
      continue;
    }

    const image = normalizeImageUrl(getAttribute(tag, "content"), baseUrl);
    if (image) {
      return image;
    }
  }

  const imageLink = (html.match(/<link\b[^>]*rel=["'][^"']*image_src[^"']*["'][^>]*>/i) || [])[0];
  return normalizeImageUrl(imageLink ? getAttribute(imageLink, "href") : "", baseUrl);
};

const fetchArticleImage = async (url) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(url, {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent": "TransformerLabDailyBlog/1.0"
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return "";
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType && !contentType.includes("html") && !contentType.includes("xml")) {
      return "";
    }

    return findMetaImage(await response.text(), response.url || url);
  } catch {
    return "";
  }
};

const abstractPreview = (abstract) => {
  const words = normalizeWhitespace(abstract).split(" ").filter(Boolean);
  if (words.length <= 34) {
    return words.join(" ");
  }

  return `${words.slice(0, 34).join(" ")}...`;
};

const fetchRecentPapers = async (previouslyFeaturedUrls = new Set()) => {
  const params = new URLSearchParams({
    search_query: arxivTopics.join(" OR "),
    sortBy: "submittedDate",
    sortOrder: "descending",
    max_results: String(arxivPoolSize)
  });
  const response = await fetch(`https://export.arxiv.org/api/query?${params.toString()}`, {
    headers: {
      "User-Agent": "TransformerLabDailyBlog/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`arXiv request failed with status ${response.status}`);
  }

  const xml = await response.text();
  const papers = getBlocks(xml, "entry").map((entry) => ({
    title: getTag(entry, "title"),
    summary: getTag(entry, "summary"),
    published: getTag(entry, "published").slice(0, 10),
    updated: getTag(entry, "updated").slice(0, 10),
    authors: getAuthors(entry),
    categories: getCategories(entry),
    url: getAlternateLink(entry)
  })).filter((paper) => paper.title && paper.url);

  return selectDiversePapers(papers, previouslyFeaturedUrls);
};

const fetchFeedItems = async (source) => {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "TransformerLabDailyBlog/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`${source.name} feed failed with status ${response.status}`);
  }

  const xml = await response.text();
  const blocks = getBlocks(xml, "item").length ? getBlocks(xml, "item") : getBlocks(xml, "entry");
  return blocks.slice(0, 8).map((block) => {
    const publishedRaw = getTag(block, "pubDate") || getTag(block, "published") || getTag(block, "updated");
    return {
      title: getTag(block, "title"),
      published: formatSourceDate(publishedRaw, ""),
      source: source.name,
      track: source.track,
      url: getFeedLink(block),
      image: findFeedImage(block, source.url)
    };
  }).filter((item) => item.title && item.url);
};

const enrichNewsItemImages = async (items) => {
  const settled = await Promise.allSettled(items.map(async (item) => ({
    ...item,
    image: item.image || await fetchArticleImage(item.url)
  })));

  return settled.map((result, index) =>
    result.status === "fulfilled" ? result.value : items[index]
  );
};

const fetchHeadlineItems = async (sources, maxItems) => {
  const settled = await Promise.allSettled(sources.map(fetchFeedItems));
  const items = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const seen = new Set();
  const unique = items.filter((item) => {
    const key = `${item.url || ""}|${item.title.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  const selected = unique
    .sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0))
    .slice(0, maxItems);

  return enrichNewsItemImages(selected);
};

const fetchNewsItems = async () => fetchHeadlineItems(newsSources, maxNewsItems);

const fetchFinanceItems = async () => fetchHeadlineItems(financeSources, maxFinanceItems);

const readJson = async (filePath, fallback) => {
  if (!existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(await readFile(filePath, "utf8"));
};

const renderHeader = (title, stylesheetPrefix, scriptPrefix) => `<!doctype html>
<html lang="en">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-8V8TMW9VEZ"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'G-8V8TMW9VEZ');
  </script>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(title)}">
  <meta name="theme-color" content="#990000">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${stylesheetPrefix}styles.css?v=${assetVersion}">
  <script src="${scriptPrefix}script.js?v=${assetVersion}" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>

  <header class="site-header" data-header>
    <nav class="nav" aria-label="Primary navigation">
      <a class="brand" href="${stylesheetPrefix}#top" aria-label="Transformer Lab home">
        <span class="brand-mark">TL</span>
        <span>
          <strong>Transformer Lab</strong>
          <small>AI digest + finance banner</small>
        </span>
      </a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-menu">
        <span class="sr-only">Toggle navigation</span>
        <span></span>
        <span></span>
        <span></span>
      </button>
      <div class="nav-links" id="site-menu">
        <a href="${stylesheetPrefix}#top">Home</a>
        <a href="${stylesheetPrefix}#lab">Lab</a>
        <a href="${stylesheetPrefix}#research">Research</a>
        <a href="${stylesheetPrefix}#students">Students</a>
        <a href="${stylesheetPrefix}#publications">Publications</a>
        <a href="${stylesheetPrefix}#ai-blog">AI Blog</a>
        <a href="${stylesheetPrefix}#contact">Contact</a>
      </div>
    </nav>
  </header>`;

const renderFooter = (prefix) => `  <footer class="site-footer">
    <div>
      <strong>Transformer Lab</strong>
      <p>Transform research into real life.</p>
    </div>
    <div class="footer-links">
      <a href="${prefix}#top">Home</a>
      <a href="${prefix}#lab">Lab</a>
      <a href="${prefix}#ai-blog">AI Blog</a>
      <a href="${prefix}#contact">Contact</a>
    </div>
  </footer>
</body>
</html>
`;

const renderNewsItems = (newsItems, date) => {
  if (!newsItems.length) {
    return `        <li>
          <p class="pub-year">News</p>
          <h2>No feed items were available for ${escapeHtml(date)}</h2>
          <p>The next scheduled run will try the AI and technology news feeds again.</p>
        </li>`;
  }

  return newsItems.map((item, index) => {
    if (!item.image) {
      return `        <li>
          <p class="pub-year">News ${String(index + 1).padStart(2, "0")} | ${escapeHtml(item.published || date)}</p>
          <h2><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></h2>
          <p><strong>Source:</strong> ${escapeHtml(item.source)}</p>
          <p><strong>Track:</strong> ${escapeHtml(item.track)}</p>
        </li>`;
    }

    return `        <li class="digest-card">
          <a class="digest-card-media" href="${escapeHtml(item.url)}" aria-label="${escapeHtml(item.title)}">
            <img src="${escapeHtml(item.image)}" alt="" loading="lazy">
          </a>
          <div class="digest-card-body">
            <p class="pub-year">News ${String(index + 1).padStart(2, "0")} | ${escapeHtml(item.published || date)}</p>
            <h2><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></h2>
            <p><strong>Source:</strong> ${escapeHtml(item.source)}</p>
            <p><strong>Track:</strong> ${escapeHtml(item.track)}</p>
          </div>
        </li>`;
  }).join("\n");
};

const renderFinanceItems = (financeItems, date) => {
  if (!financeItems.length) {
    return `        <li>
          <p class="pub-year">Markets</p>
          <h2>No finance or stock-market feed items were available for ${escapeHtml(date)}</h2>
          <p>The next scheduled run will try the market news feeds again.</p>
        </li>`;
  }

  return financeItems.map((item, index) => {
    if (!item.image) {
      return `        <li>
          <p class="pub-year">Market ${String(index + 1).padStart(2, "0")} | ${escapeHtml(item.published || date)}</p>
          <h2><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></h2>
          <p><strong>Source:</strong> ${escapeHtml(item.source)}</p>
          <p><strong>Track:</strong> ${escapeHtml(item.track)}</p>
        </li>`;
    }

    return `        <li class="digest-card">
          <a class="digest-card-media" href="${escapeHtml(item.url)}" aria-label="${escapeHtml(item.title)}">
            <img src="${escapeHtml(item.image)}" alt="" loading="lazy">
          </a>
          <div class="digest-card-body">
            <p class="pub-year">Market ${String(index + 1).padStart(2, "0")} | ${escapeHtml(item.published || date)}</p>
            <h2><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></h2>
            <p><strong>Source:</strong> ${escapeHtml(item.source)}</p>
            <p><strong>Track:</strong> ${escapeHtml(item.track)}</p>
          </div>
        </li>`;
  }).join("\n");
};

const renderPaperItems = (papers, date) => {
  if (!papers.length) {
    return `        <li>
          <p class="pub-year">Research</p>
          <h2>No arXiv papers were available for ${escapeHtml(date)}</h2>
          <p>The next scheduled run will try the research feed again.</p>
        </li>`;
  }

  return papers.map((paper, index) => {
    const authors = paper.authors.slice(0, 6).join(", ");
    const authorText = paper.authors.length > 6 ? `${authors}, et al.` : authors;
    const categories = paper.categories.slice(0, 4).join(", ");
    return `        <li>
          <p class="pub-year">Paper ${String(index + 1).padStart(2, "0")} | ${escapeHtml(paper.published || paper.updated || date)}</p>
          <h2><a href="${escapeHtml(paper.url)}">${escapeHtml(paper.title)}</a></h2>
          <p><strong>Authors:</strong> ${escapeHtml(authorText || "Not listed")}</p>
          <p><strong>Topics:</strong> ${escapeHtml(categories || "AI research")}</p>
          <p>${escapeHtml(abstractPreview(paper.summary))}</p>
        </li>`;
  }).join("\n");
};

const renderVisualStrip = (newsItems) => {
  const images = [];
  const addImage = (image) => {
    if (image && !images.includes(image)) {
      images.push(image);
    }
  };

  newsItems.map((item) => item.image).forEach(addImage);
  if (!images.length) {
    return "";
  }

  return `      <div class="digest-visual-strip" aria-label="Digest visuals">
${images.slice(0, 3).map((image, index) => `        <img src="${escapeHtml(image)}" alt="" loading="${index === 0 ? "eager" : "lazy"}">`).join("\n")}
      </div>`;
};

const renderFinanceBanner = (financeItems, date) => {
  const sourceCount = new Set(financeItems.map((item) => item.source).filter(Boolean)).size;
  const sourceLabel = sourceCount === 1 ? "finance source" : "finance sources";
  return `      <aside class="finance-digest-banner" aria-labelledby="finance-title">
        <div>
          <p class="blog-kicker">Finance/stocks | ${escapeHtml(date)}</p>
          <h2 id="finance-title">Finance and stock market news</h2>
          <p>Separate market headlines from finance sources, provided for context only, not investment advice.</p>
        </div>
        <div class="finance-banner-stats" aria-label="Finance digest summary">
          <div>
            <strong>${escapeHtml(financeItems.length || "0")}</strong>
            <span>market headlines</span>
          </div>
          <div>
            <strong>${escapeHtml(sourceCount || "0")}</strong>
            <span>${escapeHtml(sourceLabel)}</span>
          </div>
          <a class="text-link" href="#finance-list">Read finance items</a>
        </div>
      </aside>`;
};

const renderPost = ({ date, papers, newsItems, financeItems }) => `${renderHeader(`Daily AI and Tech Digest | ${date}`, "../../", "../../")}

  <main id="main">
    <article class="section blog-post">
      <p class="eyebrow">Daily AI and Tech Digest</p>
      <h1>AI and tech digest for ${escapeHtml(date)}</h1>
      <p class="blog-meta">Published by the Transformer Lab agent. Sources: AI/tech RSS feeds, finance RSS feeds, and arXiv recent submissions.</p>
      <p>
        Today's digest combines source-linked AI news, broader technology headlines,
        and recent research papers. The finance/stocks banner below separates
        market headlines from the AI and research sections, so students, teachers,
        and collaborators can scan each lane clearly.
      </p>
${renderVisualStrip(newsItems)}

      <section class="digest-section" aria-labelledby="news-title">
        <h2 id="news-title">Latest AI and tech news</h2>
        <p>Headline-only links to original sources, grouped for quick scanning.</p>
        <ul class="paper-list">
${renderNewsItems(newsItems, date)}
        </ul>
      </section>

${renderFinanceBanner(financeItems, date)}

      <section class="digest-section finance-digest-section" aria-label="Finance and stock market headline list">
        <ul class="paper-list" id="finance-list">
${renderFinanceItems(financeItems, date)}
        </ul>
      </section>

      <section class="digest-section" aria-labelledby="papers-title">
        <h2 id="papers-title">Recent research papers</h2>
        <p>Recent arXiv submissions selected for topic variety, with recent repeats filtered out when enough new papers are available.</p>
        <ul class="paper-list">
${renderPaperItems(papers, date)}
        </ul>
      </section>

      <p><a class="text-link" href="../">Back to all posts</a></p>
    </article>
  </main>

${renderFooter("../../")}`;

const renderIndex = (posts) => {
  const postCards = posts.map((post) => `        <article class="blog-card">
          <p class="blog-kicker">${escapeHtml(post.date)}</p>
          <h2><a href="${escapeHtml(post.url.replace(/^blog\//, ""))}">${escapeHtml(post.title)}</a></h2>
          <p>${escapeHtml(post.summary)}</p>
        </article>`).join("\n");

  return `${renderHeader("AI and Tech Blog | Transformer Lab", "../", "../")}

  <main id="main">
    <section class="section section-band blog-page">
      <div class="section-heading">
        <p class="eyebrow">Transformer Lab</p>
        <h1>Daily AI and tech digest</h1>
      </div>
      <div class="research-intro">
        <p>
          A daily, source-linked scan of AI news, technology news, product updates,
          and recent research papers, with a separate finance/stocks banner for
          market headlines. The digest is
          generated by the Transformer Lab agent for students, teachers, and collaborators.
        </p>
      </div>
      <aside class="finance-preview-banner blog-index-banner" aria-label="Finance and stocks banner">
        <div>
          <p class="blog-kicker">Separate market lane</p>
          <h2>Finance/stocks daily banner</h2>
          <p>Market headlines now sit in their own banner inside each digest, clearly separated from AI, technology, and research-paper updates.</p>
        </div>
        <a class="text-link" href="${escapeHtml((posts[0]?.url || "posts/").replace(/^blog\//, ""))}#finance-title">Open finance banner</a>
      </aside>
      <section class="blog-index-section" aria-labelledby="written-digest-title">
        <h2 id="written-digest-title">Written digests</h2>
        <div class="blog-index-list">
${postCards}
        </div>
      </section>
    </section>
  </main>

${renderFooter("../")}`;
};

const main = async () => {
  await mkdir(postsDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });

  const date = process.env.BLOG_DATE || formatLosAngelesDate();
  const postsPath = path.join(dataDir, "posts.json");
  const oldPosts = await readJson(postsPath, []);
  const previouslyFeaturedPaperUrls = await collectPreviouslyFeaturedPaperUrls(oldPosts);
  const [papersResult, newsResult, financeResult] = await Promise.allSettled([
    fetchRecentPapers(previouslyFeaturedPaperUrls),
    fetchNewsItems(),
    fetchFinanceItems()
  ]);
  const papers = papersResult.status === "fulfilled" ? papersResult.value : [];
  const newsItems = newsResult.status === "fulfilled" ? newsResult.value : [];
  const financeItems = financeResult.status === "fulfilled" ? financeResult.value : [];

  if (!papers.length && !newsItems.length && !financeItems.length) {
    throw new Error("No news, finance, or research items were returned");
  }

  const slug = `${date}-ai-tech-digest`;
  const postUrl = `blog/posts/${slug}.html`;
  const title = `AI and tech digest for ${date}`;
  const summary = `A source-linked digest of ${newsItems.length} AI/tech headlines, a separate finance banner with ${financeItems.length} market headlines, and ${papers.length} recent research papers.`;
  const post = { date, title, summary, url: postUrl };

  await writeFile(path.join(postsDir, `${slug}.html`), renderPost({ date, papers, newsItems, financeItems }), "utf8");

  const posts = [post, ...oldPosts.filter((item) => item.date !== date && item.url !== post.url)].slice(0, maxStoredPosts);

  await writeFile(postsPath, `${JSON.stringify(posts, null, 2)}\n`, "utf8");
  await writeFile(path.join(dataDir, "latest.json"), `${JSON.stringify(post, null, 2)}\n`, "utf8");
  await writeFile(path.join(blogDir, "index.html"), renderIndex(posts), "utf8");

  console.log(`Published ${postUrl}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
