#!/usr/bin/env node

const DEFAULT_URL =
  "https://diploma.spbu.ru/gp/index?GpSearch%5Bname_ru%5D=&GpSearch%5Btitle_ru%5D=&GpSearch%5Beditor_ru%5D=%D0%9A%D0%BE%D1%80%D1%85%D0%BE%D0%B2&GpSearch%5Bdp_id%5D=15&GpSearch%5Bstatus%5D=1&GpSearch%5Byear%5D=&page=2";

function parseArgs(argv) {
  const options = {
    url: process.env.SPBU_URL || DEFAULT_URL,
    cookie: process.env.SPBU_COOKIE || "",
    delayMs: Number(process.env.SPBU_DELAY_MS || 300),
    output: process.env.SPBU_OUTPUT || "",
    outputDir: process.env.SPBU_OUTPUT_DIR || "outputs",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--url") {
      options.url = argv[i + 1];
      i += 1;
    } else if (arg === "--cookie") {
      options.cookie = argv[i + 1];
      i += 1;
    } else if (arg === "--delay-ms") {
      options.delayMs = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--output") {
      options.output = argv[i + 1];
      i += 1;
    } else if (arg === "--output-dir") {
      options.outputDir = argv[i + 1];
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.url) {
    throw new Error("Missing --url or SPBU_URL");
  }

  if (!options.cookie) {
    throw new Error("Missing --cookie or SPBU_COOKIE");
  }

  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
    throw new Error("delay-ms must be a non-negative number");
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scrape_spbu_links.js --cookie "<cookie>" [--url "<url>"] [--delay-ms 300] [--output result.json]

Env vars:
  SPBU_COOKIE   Cookie header value
  SPBU_URL      Start URL for gp/index
  SPBU_DELAY_MS Delay between requests in milliseconds
  SPBU_OUTPUT   Optional output file path
  SPBU_OUTPUT_DIR Directory for per-run JSON files
`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractLinks(html, origin) {
  const matches = html.match(/\/gp\/view\?id=\d+/g) || [];
  return [...new Set(matches)].map((path) => new URL(path, origin).href);
}

function extractMaxPage(html, currentPage) {
  const pageMatches = [...html.matchAll(/(?:\?|&|&amp;)page=(\d+)/g)];
  const pageNumbers = pageMatches
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (pageNumbers.length === 0) {
    return currentPage;
  }

  return Math.max(currentPage, ...pageNumbers);
}

function decodeHtmlEntities(text) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === "#") {
      const isHex = entity[1]?.toLowerCase() === "x";
      const value = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }

    return named[entity] ?? match;
  });
}

function stripTags(html) {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function extractFirstMatch(text, regex) {
  const match = text.match(regex);
  return match ? match[1] || match[0] : "";
}

function parseDetailPage(html, viewUrl) {
  const rowRegex = /<tr>\s*<th>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  const fields = {};

  for (const match of html.matchAll(rowRegex)) {
    const key = stripTags(match[1]);
    const valueHtml = match[2];
    const valueText = stripTags(valueHtml);
    const links = [...valueHtml.matchAll(/href="([^"]+)"/g)].map((item) => item[1]);

    fields[key] = {
      text: valueText,
      links,
    };
  }

  const rawTitle = fields["Наименование ВКР"]?.text || "";
  const rawWorkUrl =
    fields["Наименование ВКР"]?.links.find((link) => link.includes("hdl.handle.net")) ||
    extractFirstMatch(html, /href="(https:\/\/hdl\.handle\.net\/[^"]+)"/i);
  const id = Number(extractFirstMatch(viewUrl, /id=(\d+)/));

  return {
    id: Number.isFinite(id) ? id : null,
    view_url: viewUrl,
    student_name:
      fields["ФИО выпускника"]?.text || stripTags(extractFirstMatch(html, /<h1>([\s\S]*?)<\/h1>/i)),
    program: fields["Направление подготовки (специальность)"]?.text || "",
    qualification: fields["Квалификация"]?.text || "",
    thesis_title: rawTitle,
    work_url: rawWorkUrl || "",
    status: fields["Статус"]?.text || "",
    supervisor: fields["ФИО научного руководителя"]?.text || "",
    year: fields["Год"]?.text || "",
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, value.text])
    ),
  };
}

async function fetchPage(url, cookie) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "ru,en;q=0.9",
      "Cache-Control": "max-age=0",
      Cookie: cookie,
      DNT: "1",
      "Upgrade-Insecure-Requests": "1",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 YaBrowser/26.3.0.0 Safari/537.36",
    },
    redirect: "follow",
  });

  return response;
}

async function writeOutput(filePath, content) {
  const fs = await import("node:fs/promises");
  await fs.writeFile(filePath, content, "utf8");
}

async function ensureDir(dirPath) {
  const fs = await import("node:fs/promises");
  await fs.mkdir(dirPath, { recursive: true });
}

async function ensureParentDir(filePath) {
  const path = await import("node:path");
  await ensureDir(path.dirname(filePath));
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "query";
}

function buildRunFileName(url) {
  const parsed = new URL(url);
  const editor = parsed.searchParams.get("GpSearch[editor_ru]") || "all";
  const dpId = parsed.searchParams.get("GpSearch[dp_id]") || "all";
  const status = parsed.searchParams.get("GpSearch[status]") || "all";
  const year = parsed.searchParams.get("GpSearch[year]") || "all";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${slugify(editor)}__dp${dpId}__status${status}__year${year}__${stamp}.json`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const initialUrl = new URL(options.url);
  const baseUrl = new URL(options.url);
  const found = new Set();

  baseUrl.searchParams.set("page", "1");

  let currentPage = 1;
  let maxPage = 1;

  while (currentPage <= maxPage) {
    baseUrl.searchParams.set("page", String(currentPage));
    const pageUrl = baseUrl.toString();

    console.error(`Fetching page ${currentPage}/${maxPage}: ${pageUrl}`);

    const response = await fetchPage(pageUrl, options.cookie);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${pageUrl}`);
    }

    const html = await response.text();
    const pageLinks = extractLinks(html, baseUrl.origin);
    const detectedMaxPage = extractMaxPage(html, currentPage);

    maxPage = Math.max(maxPage, detectedMaxPage);

    console.error(
      `Found ${pageLinks.length} links on page ${currentPage}; last page so far: ${maxPage}`
    );

    for (const link of pageLinks) {
      found.add(link);
    }

    if (pageLinks.length === 0 && currentPage >= detectedMaxPage) {
      console.error("No more result links, stopping.");
      break;
    }

    currentPage += 1;

    if (currentPage <= maxPage && options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  const viewLinks = [...found].sort((a, b) => {
    const aId = Number(a.match(/id=(\d+)/)?.[1] || 0);
    const bId = Number(b.match(/id=(\d+)/)?.[1] || 0);
    return aId - bId;
  });

  console.error(`Collecting details for ${viewLinks.length} view pages`);

  const items = [];

  for (let i = 0; i < viewLinks.length; i += 1) {
    const viewUrl = viewLinks[i];
    console.error(`Fetching detail ${i + 1}/${viewLinks.length}: ${viewUrl}`);

    const response = await fetchPage(viewUrl, options.cookie);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${viewUrl}`);
    }

    const html = await response.text();
    items.push(parseDetailPage(html, viewUrl));

    if (i + 1 < viewLinks.length && options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  const payload = {
    source_url: initialUrl.toString(),
    collected_at: new Date().toISOString(),
    pages_scanned: maxPage,
    total: items.length,
    items,
  };

  const output = `${JSON.stringify(payload, null, 2)}\n`;

  const outputPath = options.output || `${options.outputDir}/${buildRunFileName(options.url)}`;

  await ensureParentDir(outputPath);
  await writeOutput(outputPath, output);
  console.error(`Saved ${items.length} records from ${maxPage} pages to ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
