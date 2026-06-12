import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const blogDir = path.join(rootDir, "blog");
const postsDir = path.join(blogDir, "posts");
const dataDir = path.join(blogDir, "data");
const siteUrl = "https://jihao2021.github.io";
const maxPapers = Number.parseInt(process.env.BLOG_MAX_PAPERS || "8", 10);
const maxStoredPosts = Number.parseInt(process.env.BLOG_MAX_STORED_POSTS || "60", 10);
const assetVersion = "20260612";
const topics = [
  "cat:cs.AI",
  "cat:cs.LG",
  "cat:cs.CL",
  "cat:cs.CV",
  "cat:cs.MA",
  "cat:stat.ML"
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
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");

const normalizeWhitespace = (value) =>
  decodeEntities(value).replace(/\s+/g, " ").trim();

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

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);

const getTag = (xml, tagName) => {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? normalizeWhitespace(match[1]) : "";
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

const abstractPreview = (abstract) => {
  const words = normalizeWhitespace(abstract).split(" ").filter(Boolean);
  if (words.length <= 34) {
    return words.join(" ");
  }

  return `${words.slice(0, 34).join(" ")}...`;
};

const fetchRecentPapers = async () => {
  const params = new URLSearchParams({
    search_query: topics.join(" OR "),
    sortBy: "submittedDate",
    sortOrder: "descending",
    max_results: String(maxPapers)
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
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => {
    const entry = match[1];
    return {
      title: getTag(entry, "title"),
      summary: getTag(entry, "summary"),
      published: getTag(entry, "published").slice(0, 10),
      updated: getTag(entry, "updated").slice(0, 10),
      authors: getAuthors(entry),
      categories: getCategories(entry),
      url: getAlternateLink(entry)
    };
  }).filter((paper) => paper.title && paper.url);
};

const readJson = async (filePath, fallback) => {
  if (!existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(await readFile(filePath, "utf8"));
};

const renderHeader = (title, stylesheetPrefix, scriptPrefix) => `<!doctype html>
<html lang="en">
<head>
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
          <small>Daily AI research digest</small>
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

const renderPost = ({ date, papers }) => {
  const paperItems = papers.map((paper, index) => {
    const authors = paper.authors.slice(0, 6).join(", ");
    const authorText = paper.authors.length > 6 ? `${authors}, et al.` : authors;
    const categories = paper.categories.slice(0, 4).join(", ");
    return `        <li>
          <p class="pub-year">${String(index + 1).padStart(2, "0")} | ${escapeHtml(paper.published || paper.updated || date)}</p>
          <h2><a href="${escapeHtml(paper.url)}">${escapeHtml(paper.title)}</a></h2>
          <p><strong>Authors:</strong> ${escapeHtml(authorText || "Not listed")}</p>
          <p><strong>Topics:</strong> ${escapeHtml(categories || "AI research")}</p>
          <p>${escapeHtml(abstractPreview(paper.summary))}</p>
        </li>`;
  }).join("\n");

  return `${renderHeader(`Daily AI Research Digest | ${date}`, "../../", "../../")}

  <main id="main">
    <article class="section blog-post">
      <p class="eyebrow">Daily AI Research Digest</p>
      <h1>AI research digest for ${escapeHtml(date)}</h1>
      <p class="blog-meta">Published by the Transformer Lab research agent. Sources: arXiv recent submissions.</p>
      <p>
        Today's digest highlights recent AI papers connected to language models,
        learning systems, agents, computer vision, multi-agent intelligence, and
        research computing. Use it as a fast reading map, then follow the source
        links for the full papers.
      </p>
      <ul class="paper-list">
${paperItems}
      </ul>
      <p><a class="text-link" href="../">Back to all posts</a></p>
    </article>
  </main>

${renderFooter("../../")}`;
};

const renderIndex = (posts) => {
  const postCards = posts.map((post) => `        <article class="blog-card">
          <p class="blog-kicker">${escapeHtml(post.date)}</p>
          <h2><a href="${escapeHtml(post.url.replace(/^blog\//, ""))}">${escapeHtml(post.title)}</a></h2>
          <p>${escapeHtml(post.summary)}</p>
        </article>`).join("\n");

  return `${renderHeader("AI Research Blog | Transformer Lab", "../", "../")}

  <main id="main">
    <section class="section section-band blog-page">
      <div class="section-heading">
        <p class="eyebrow">Transformer Lab</p>
        <h1>Daily AI research digest</h1>
      </div>
      <div class="research-intro">
        <p>
          A daily, source-linked scan of recent AI, machine learning, language model,
          multi-agent, and research computing papers. The digest is generated by the
          Transformer Lab research agent.
        </p>
      </div>
      <div class="blog-index-list">
${postCards}
      </div>
    </section>
  </main>

${renderFooter("../")}`;
};

const main = async () => {
  await mkdir(postsDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });

  const date = process.env.BLOG_DATE || formatLosAngelesDate();
  const papers = await fetchRecentPapers();
  if (!papers.length) {
    throw new Error("No papers returned from arXiv");
  }

  const slug = `${date}-ai-research-digest`;
  const postUrl = `blog/posts/${slug}.html`;
  const title = `AI research digest for ${date}`;
  const summary = `A source-linked digest of ${papers.length} recent AI papers across language models, machine learning, agents, and research computing.`;
  const post = { date, title, summary, url: postUrl };

  await writeFile(path.join(postsDir, `${slug}.html`), renderPost({ date, papers }), "utf8");

  const postsPath = path.join(dataDir, "posts.json");
  const oldPosts = await readJson(postsPath, []);
  const posts = [post, ...oldPosts.filter((item) => item.url !== post.url)].slice(0, maxStoredPosts);

  await writeFile(postsPath, `${JSON.stringify(posts, null, 2)}\n`, "utf8");
  await writeFile(path.join(dataDir, "latest.json"), `${JSON.stringify(post, null, 2)}\n`, "utf8");
  await writeFile(path.join(blogDir, "index.html"), renderIndex(posts), "utf8");

  console.log(`Published ${postUrl}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
