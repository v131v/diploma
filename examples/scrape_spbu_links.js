#!/usr/bin/env node

const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const DEFAULT_INPUT = "examples/top15_bachelor_related_to_formal_brief.json";
const DEFAULT_PDF_DIR = "examples/pdf";
const DEFAULT_TXT_DIR = "examples/txt";
const DEFAULT_CONCURRENCY = 4;

const CYRILLIC_MAP = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function parseArgs(argv) {
  const options = {
    command: "download-from-meta",
    input: process.env.SPBU_INPUT || DEFAULT_INPUT,
    pdfDir: process.env.SPBU_PDF_DIR || DEFAULT_PDF_DIR,
    txtDir: process.env.SPBU_TXT_DIR || DEFAULT_TXT_DIR,
    concurrency: Number(process.env.SPBU_CONCURRENCY || DEFAULT_CONCURRENCY),
    delayMs: Number(process.env.SPBU_DELAY_MS || 0),
  };

  const args = [...argv];
  if (args[0] && !args[0].startsWith("-")) {
    options.command = args.shift();
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--input") {
      options.input = args[i + 1];
      i += 1;
    } else if (arg === "--meta") {
      options.input = args[i + 1];
      i += 1;
    } else if (arg === "--pdf-dir") {
      options.pdfDir = args[i + 1];
      i += 1;
    } else if (arg === "--txt-dir") {
      options.txtDir = args[i + 1];
      i += 1;
    } else if (arg === "--concurrency") {
      options.concurrency = Number(args[i + 1]);
      i += 1;
    } else if (arg === "--delay-ms") {
      options.delayMs = Number(args[i + 1]);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.concurrency) || options.concurrency < 1) {
    throw new Error("concurrency must be a positive number");
  }

  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
    throw new Error("delay-ms must be a non-negative number");
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node examples/scrape_spbu_links.js download-from-meta [--input examples/top15_bachelor_related_to_formal_brief.json] [--pdf-dir examples/pdf] [--txt-dir examples/txt]

Env vars:
  SPBU_INPUT        Input JSON path, defaults to examples/top15_bachelor_related_to_formal_brief.json
  SPBU_PDF_DIR      Directory for downloaded PDFs
  SPBU_TXT_DIR      Directory for extracted TXT files
  SPBU_CONCURRENCY  Max concurrent download tasks
  SPBU_DELAY_MS     Delay between items in milliseconds
`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function ensureParentDir(filePath) {
  await ensureDir(path.dirname(filePath));
}

async function writeJson(filePath, value) {
  await ensureParentDir(filePath);
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, "utf8"));
}

function normalizeRepoPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function transliterate(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[А-Яа-яЁё]/g, (char) => {
      const lower = char.toLowerCase();
      return CYRILLIC_MAP[lower] ?? "";
    });
}

function slugify(value, limit = 96) {
  return transliterate(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, limit) || "item";
}

function buildArtifactBaseName(item) {
  const base = slugify(item.student_name || item.thesis_title || "item", 40);
  const title = slugify(item.thesis_title || "work", 80);
  return `${item.id || "item"}_${base}_${title}`.slice(0, 160);
}

function extractFirstMatch(text, regex) {
  const match = text.match(regex);
  return match ? match[1] || match[0] : "";
}

async function curlGetPage(url) {
  const marker = "__CURL_EFFECTIVE_URL__:";
  const { stdout } = await execFileAsync(
    "curl",
    [
      "-L",
      "--fail",
      "--silent",
      "--show-error",
      "--retry",
      "2",
      "--retry-delay",
      "2",
      "--max-time",
      "60",
      "--write-out",
      `\n${marker}%{url_effective}`,
      url,
    ],
    { maxBuffer: 64 * 1024 * 1024 }
  );

  const index = stdout.lastIndexOf(`\n${marker}`);
  if (index === -1) {
    return {
      text: stdout,
      finalUrl: url,
    };
  }

  return {
    text: stdout.slice(0, index),
    finalUrl: stdout.slice(index + marker.length + 1).trim() || url,
  };
}

function extractBodyHtml(html) {
  return extractFirstMatch(html, /<body\b[^>]*>([\s\S]*?)<\/body>/i) || html;
}

function extractDownloadCandidates(html, pageUrl) {
  const bodyHtml = extractBodyHtml(html);
  const matches = bodyHtml.match(/\/bitstreams?\/[^"'&?\s]+\/download\b/gi) || [];
  const seen = new Set();
  const candidates = [];

  for (const rawLink of matches) {
    const absolute = new URL(rawLink, pageUrl).toString();
    if (seen.has(absolute)) {
      continue;
    }
    seen.add(absolute);
    candidates.push({
      downloadUrl: absolute,
      downloadPath:
        absolute.match(/https?:\/\/[^/]+\/(bitstreams?\/[^?]+?\/download)\b/i)?.[1] || "",
      sourceName: path.posix.basename(rawLink),
      sourceDescription: "body_bitstream_candidate",
    });
  }

  return candidates;
}

async function downloadFile(url, destinationPath) {
  await ensureParentDir(destinationPath);
  await execFileAsync(
    "curl",
    [
      "-L",
      "--fail",
      "--silent",
      "--show-error",
      "--retry",
      "3",
      "--retry-delay",
      "2",
      "--retry-all-errors",
      "--max-time",
      "180",
      "-o",
      destinationPath,
      url,
    ],
    { maxBuffer: 16 * 1024 * 1024 }
  );

  const buffer = await fsp.readFile(destinationPath);
  if (!buffer.slice(0, 5).toString("utf8").startsWith("%PDF-")) {
    await fsp.rm(destinationPath, { force: true });
    throw new Error("Downloaded file is not a PDF");
  }
}

async function extractPdfText(pdfPath, txtPath) {
  await ensureParentDir(txtPath);
  await execFileAsync("pdftotext", ["-enc", "UTF-8", pdfPath, txtPath]);
  const content = await fsp.readFile(txtPath, "utf8");
  if (!content.trim()) {
    return {
      status: "empty",
      text: content,
    };
  }
  return {
    status: "extracted",
    text: content,
  };
}

function isNonThesisText(content) {
  const normalized = content.slice(0, 4000).trim().toLowerCase();
  return (
    /^отзыв\b/.test(normalized) ||
    /^рецензия\b/.test(normalized) ||
    /^review\b/.test(normalized) ||
    normalized.includes("отзыв на выпускную квалификационную работу") ||
    normalized.includes("рецензия на выпускную квалификационную работу")
  );
}

async function mapLimit(items, limit, iteratee) {
  const results = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const index = currentIndex;
      currentIndex += 1;
      results[index] = await iteratee(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function tryDownloadCandidate(candidate, item, options) {
  const baseName = buildArtifactBaseName(item);
  const pdfPath = path.join(options.pdfDir, `${baseName}.pdf`);
  const txtPath = path.join(options.txtDir, `${baseName}.txt`);

  await fsp.rm(pdfPath, { force: true });
  await fsp.rm(txtPath, { force: true });

  await downloadFile(candidate.downloadUrl, pdfPath);
  const { status, text } = await extractPdfText(pdfPath, txtPath);

  if (isNonThesisText(text)) {
    await fsp.rm(pdfPath, { force: true });
    await fsp.rm(txtPath, { force: true });
    return {
      accepted: false,
      reviewLike: true,
    };
  }

  return {
    accepted: true,
    pdfPath,
    txtPath,
    textStatus: status,
  };
}

async function enrichMetaItem(item, options, index, total) {
  const enriched = { ...item };
  enriched.hdl_url = enriched.hdl_url || enriched.work_url || "";
  enriched.download_url = "";
  enriched.download_path = "";
  enriched.pdf_path = "";
  enriched.txt_path = "";
  enriched.download_status = "";
  enriched.text_status = "";
  enriched.download_error = "";

  console.error(`[${index + 1}/${total}] Downloading ${enriched.id} ${enriched.student_name}`);

  if (!enriched.hdl_url) {
    enriched.download_status = "missing";
    enriched.text_status = "missing";
    enriched.download_error = "Missing handle URL";
    return enriched;
  }

  try {
    const { text: html, finalUrl } = await curlGetPage(enriched.hdl_url);
    const candidates = extractDownloadCandidates(html, finalUrl);

    if (candidates.length === 0) {
      enriched.download_status = "missing";
      enriched.text_status = "missing";
      enriched.download_error = "Unable to find bitstream download candidates in body HTML";
      return enriched;
    }

    let reviewLikeCount = 0;

    for (const candidate of candidates) {
      enriched.download_url = candidate.downloadUrl;
      enriched.download_path = candidate.downloadPath;

      try {
        const result = await tryDownloadCandidate(candidate, enriched, options);
        if (!result.accepted) {
          reviewLikeCount += 1;
          continue;
        }

        enriched.pdf_path = normalizeRepoPath(result.pdfPath);
        enriched.txt_path = normalizeRepoPath(result.txtPath);
        enriched.download_status = "downloaded";
        enriched.text_status = result.textStatus;
        enriched.download_error = "";
        return enriched;
      } catch (candidateError) {
        enriched.download_error = candidateError.message;
      }
    }

    enriched.download_status = "missing";
    enriched.text_status = "missing";
    enriched.download_error =
      reviewLikeCount > 0
        ? "All bitstream candidates resolved to review/review-like documents"
        : enriched.download_error || "Unable to download any bitstream candidate";
  } catch (error) {
    enriched.download_status = "failed";
    enriched.text_status = "failed";
    enriched.download_error = error.message;
  }

  if (options.delayMs > 0) {
    await sleep(options.delayMs);
  }

  return enriched;
}

function buildSummary(items) {
  const summary = {
    downloaded: 0,
    failed: 0,
    missing: 0,
  };

  for (const item of items) {
    if (item.download_status === "downloaded") {
      summary.downloaded += 1;
    } else if (item.download_status === "failed") {
      summary.failed += 1;
    } else if (item.download_status === "missing") {
      summary.missing += 1;
    }
  }

  return summary;
}

function buildTextSummary(items) {
  const summary = {
    extracted: 0,
    empty: 0,
    failed: 0,
    missing: 0,
  };

  for (const item of items) {
    if (item.text_status === "extracted") {
      summary.extracted += 1;
    } else if (item.text_status === "empty") {
      summary.empty += 1;
    } else if (item.text_status === "failed") {
      summary.failed += 1;
    } else if (item.text_status === "missing") {
      summary.missing += 1;
    }
  }

  return summary;
}

async function runDownloadFromMeta(options) {
  const input = await readJson(options.input);
  if (!Array.isArray(input.items)) {
    throw new Error("Input JSON must contain an items array");
  }

  await ensureDir(options.pdfDir);
  await ensureDir(options.txtDir);

  const enrichedItems = await mapLimit(input.items, options.concurrency, (item, index) =>
    enrichMetaItem(item, options, index, input.items.length)
  );

  input.files_generated_at = new Date().toISOString();
  input.download_summary = buildSummary(enrichedItems);
  input.text_extraction_summary = buildTextSummary(enrichedItems);
  input.items = enrichedItems;

  await writeJson(options.input, input);
  console.error(`Updated ${options.input}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.command !== "download-from-meta") {
    throw new Error(`Unknown command: ${options.command}`);
  }

  await runDownloadFromMeta(options);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
