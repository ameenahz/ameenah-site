const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const PROJECTS = [
  {
    slug: "dinner-party",
    title: "Fable x Sally Al-Hadidi Dinner Party",
    // The last gallery photo links here 
    lastPhotoLink: "https://fable.com/pages/come-host-with-me-episode-06",
  },
  { slug: "street-and-documentary", title: "Street and Documentary" },
  { slug: "graduation-and-prom", title: "Graduation and Prom Photography" },
  { slug: "roots-of-diaspora", title: "Roots of Diaspora Photo Exhibition" },
];

// ---- Image optimization settings ----
const OUT_ROOT = path.join("images", "optimized");
const GALLERY_WIDTHS = [480, 800, 1200, 1600];
const COVER_WIDTHS = [400, 700, 1000];
const WEBP_QUALITY = 72;

// About page photo (original goes in images/about/)
const ABOUT_DIR = path.join("images", "about");
const ABOUT_WIDTHS = [400, 700, 1000];
const ABOUT_SIZES = "(max-width: 767px) 66vw, (min-width: 1400px) 513px, 37vw";

// How many gallery photos load right away (the rest lazy-load)
const EAGER_GALLERY_PHOTOS = 3;

// How wide each image actually displays, matched to style.css.
// If you change --gallery-width, the gutters or the grid gaps, update these.
const GALLERY_SIZES = "(min-width: 1364px) 584px, 44vw"; // two-column gallery
const WIDE_SIZES = "(min-width: 1364px) 1200px, 88vw"; // -wide photos span both columns
const COVER_SIZES = "(max-width: 767px) 88vw, (min-width: 1400px) 576px, 44vw"; // homepage tiles

const IMAGE = /\.(jpe?g|png|webp|avif)$/i;
const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const safe = (s) => s.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

function fill(html, tag, content) {
  const re = new RegExp(`(<!-- ${tag}:START[^>]*-->)[\\s\\S]*?(<!-- ${tag}:END -->)`);
  if (!re.test(html)) throw new Error(`Missing <!-- ${tag}:START --> marker`);
  return html.replace(re, (_, start, end) => `${start}\n${content}\n        ${end}`);
}

// ---- Settings tracking: if you change widths/quality, everything is regenerated ----
fs.mkdirSync(OUT_ROOT, { recursive: true });
const SETTINGS_FILE = path.join(OUT_ROOT, ".settings");
const SETTINGS_KEY = JSON.stringify({ GALLERY_WIDTHS, COVER_WIDTHS, WEBP_QUALITY });
const forceRebuild =
  !fs.existsSync(SETTINGS_FILE) || fs.readFileSync(SETTINGS_FILE, "utf8") !== SETTINGS_KEY;
if (forceRebuild) console.log("Settings changed (or first run): regenerating all images...");

// Files we want to keep this run; anything else in images/optimized/ gets deleted
const keep = new Set();

// Resize one source image into several WebP widths (skips files already up to date).
// Returns paths relative to the site root, a tiny blur placeholder, and dimensions.
async function optimize(srcFile, slug, targetWidths) {
  const meta = await sharp(srcFile).metadata();
  // EXIF orientations 5-8 mean the image is rotated 90°, so width/height swap
  const swap = meta.orientation >= 5;
  const w = swap ? meta.height : meta.width;
  const h = swap ? meta.width : meta.height;

  let widths = targetWidths.filter((x) => x <= w);
  if (!widths.length) widths = [w];

  const outDir = path.join(OUT_ROOT, slug);
  fs.mkdirSync(outDir, { recursive: true });
  const base = safe(path.basename(srcFile));
  const srcTime = fs.statSync(srcFile).mtimeMs;

  const variants = [];
  for (const width of widths) {
    const outName = `${base}-${width}.webp`;
    const outPath = path.join(outDir, outName);
    keep.add(path.resolve(outPath));

    const upToDate =
      !forceRebuild && fs.existsSync(outPath) && fs.statSync(outPath).mtimeMs >= srcTime;
    if (!upToDate) {
      await sharp(srcFile)
        .rotate() // apply EXIF orientation, then strip it
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toFile(outPath);
    }
    variants.push({ width, rel: `images/optimized/${slug}/${outName}` });
  }

  // Tiny 24px preview, embedded in the HTML so something shows instantly
  const tiny = await sharp(srcFile)
    .rotate()
    .resize({ width: 24 })
    .webp({ quality: 40 })
    .toBuffer();
  const placeholder = `data:image/webp;base64,${tiny.toString("base64")}`;

  const largest = variants[variants.length - 1];
  return {
    variants,
    placeholder,
    width: largest.width,
    height: Math.round((largest.width * h) / w),
  };
}

// Build an <img> tag. `prefix` is the path back to site root ("" or "../../")
// eager: load right away. priority: also tell the browser it's the most important one.
function imgTag({ info, prefix, alt, sizes, eager, priority }) {
  const srcset = info.variants.map((v) => `${prefix}${v.rel} ${v.width}w`).join(", ");
  const fallback = info.variants[Math.min(1, info.variants.length - 1)];
  const loading = eager
    ? `loading="eager"${priority ? ` fetchpriority="high"` : ""}`
    : `loading="lazy"`;
  const style = `background:url('${info.placeholder}') center/cover no-repeat`;
  return `<img src="${prefix}${fallback.rel}" srcset="${srcset}" sizes="${sizes}" width="${info.width}" height="${info.height}" style="${style}" alt="${esc(alt)}" ${loading} decoding="async">`;
}

// Delete optimized files that no longer belong to any photo
function prune() {
  let removed = 0;
  for (const slug of fs.readdirSync(OUT_ROOT)) {
    const dir = path.join(OUT_ROOT, slug);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!keep.has(path.resolve(dir, f))) {
        fs.unlinkSync(path.join(dir, f));
        removed++;
      }
    }
  }
  if (removed) console.log(`Removed ${removed} unused optimized file(s).`);
}

(async () => {
  const rows = [];

  for (const [idx, p] of PROJECTS.entries()) {
    const dir = path.join("images", p.slug);
    fs.mkdirSync(dir, { recursive: true });

    const files = fs.readdirSync(dir).filter((f) => IMAGE.test(f)).sort(byName);
    const cover = files.find((f) => /^cover\./i.test(f));
    const photos = files.filter((f) => f !== cover);

    if (!cover) console.warn(`! ${dir}/ has no cover photo (name one cover.jpg)`);

    // ---- Cover tile on the homepage (all load right away, first two get top priority) ----
    if (cover) {
      const info = await optimize(path.join(dir, cover), p.slug, COVER_WIDTHS);
      const tag = imgTag({
        info,
        prefix: "",
        alt: p.title,
        sizes: COVER_SIZES,
        eager: true,
        priority: idx < 2,
      });
      rows.push(`      <a class="tile" href="work/${p.slug}/index.html">
        ${tag}
        <span class="tile-title">${esc(p.title)}</span>
      </a>`);
    } else {
      rows.push(`      <a class="tile" href="work/${p.slug}/index.html">
        <span class="tile-title">${esc(p.title)}</span>
      </a>`);
    }

    // ---- Gallery page ----
    const figures = [];
    for (const [i, file] of photos.entries()) {
      const info = await optimize(path.join(dir, file), p.slug, GALLERY_WIDTHS);
      const isWide = /-wide\./i.test(file);
      const cls = isWide ? ` class="wide"` : "";
      let img = imgTag({
        info,
        prefix: "../../",
        alt: `${p.title}, photo ${i + 1}`,
        sizes: isWide ? WIDE_SIZES : GALLERY_SIZES,
        eager: i < EAGER_GALLERY_PHOTOS,
        priority: i === 0,
      });
      if (p.lastPhotoLink && i === photos.length - 1) {
        img = `<a href="${p.lastPhotoLink}" target="_blank" rel="noopener">${img}</a>`;
      }
      figures.push(`        <figure${cls}>${img}</figure>`);
    }

    const page = path.join("work", p.slug, "index.html");
    const html = fs.readFileSync(page, "utf8");
    const body = figures.length
      ? figures.join("\n")
      : `        <!-- No photos yet: add images to ${dir}/ and run: node build.js -->`;
    fs.writeFileSync(page, fill(html, "GALLERY", body));

    console.log(`${p.slug}: cover ${cover ? "ok" : "MISSING"}, ${photos.length} gallery photo(s)`);
  }

  const home = fs.readFileSync("index.html", "utf8");
  fs.writeFileSync("index.html", fill(home, "TILES", rows.join("\n")));

  // ---- About page photo ----
  if (fs.existsSync("about.html")) {
    fs.mkdirSync(ABOUT_DIR, { recursive: true });
    const aboutFile = fs.readdirSync(ABOUT_DIR).filter((f) => IMAGE.test(f)).sort(byName)[0];
    if (!aboutFile) {
      console.warn(`! ${ABOUT_DIR}/ is empty (put your about photo there)`);
    } else {
      const info = await optimize(path.join(ABOUT_DIR, aboutFile), "about", ABOUT_WIDTHS);
      const tag = imgTag({
        info,
        prefix: "",
        alt: "Ameenah Ramsey",
        sizes: ABOUT_SIZES,
        eager: true,
        priority: true,
      });
      const aboutHtml = fs.readFileSync("about.html", "utf8");
      fs.writeFileSync("about.html", fill(aboutHtml, "ABOUT_PHOTO", `        ${tag}`));
      console.log(`about: ${aboutFile} ok`);
    }
  }

  prune();
  fs.writeFileSync(SETTINGS_FILE, SETTINGS_KEY);
  console.log("Done.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});