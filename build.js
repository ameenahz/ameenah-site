const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const PROJECTS = [
  {
    slug: "dinner-party",
    title: "Fable x Sally Al-Hadidi Dinner Party",
    lastPhotoLink: "https://fable.com/pages/come-host-with-me-episode-06",
  },
  { slug: "street-and-documentary", title: "Street and Documentary" },
  { slug: "graduation-and-prom", title: "Graduation and Prom Photography" },
  { slug: "roots-of-diaspora", title: "Roots of Diaspora Photo Exhibition" },
];

// ---- Image optimization settings ----
const OUT_ROOT = path.join("images", "optimized");
const GALLERY_WIDTHS = [480, 800, 1200, 1800, 2400];
const COVER_WIDTHS = [480, 800, 1200];
const WEBP_QUALITY = 78;

// Adjust these to match your CSS layout (how wide the image displays)
const GALLERY_SIZES = "(max-width: 900px) 100vw, 1200px";
const COVER_SIZES = "(max-width: 700px) 100vw, 50vw";

const IMAGE = /\.(jpe?g|png|webp|avif)$/i;
const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const safe = (s) => s.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

function fill(html, tag, content) {
  const re = new RegExp(`(<!-- ${tag}:START[^>]*-->)[\\s\\S]*?(<!-- ${tag}:END -->)`);
  if (!re.test(html)) throw new Error(`Missing <!-- ${tag}:START --> marker`);
  return html.replace(re, (_, start, end) => `${start}\n${content}\n        ${end}`);
}

// Resize one source image into several WebP widths (skips files already up to date).
// Returns paths relative to the site root, plus dimensions for width/height attributes.
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
    const upToDate = fs.existsSync(outPath) && fs.statSync(outPath).mtimeMs >= srcTime;
    if (!upToDate) {
      await sharp(srcFile)
        .rotate() // apply EXIF orientation, then strip it
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toFile(outPath);
    }
    variants.push({ width, rel: `images/optimized/${slug}/${outName}` });
  }

  const largest = variants[variants.length - 1];
  return {
    variants,
    width: largest.width,
    height: Math.round((largest.width * h) / w),
  };
}

// Build an <img> tag. `prefix` is the path back to site root ("" or "../../")
function imgTag({ info, prefix, alt, sizes, eager }) {
  const srcset = info.variants.map((v) => `${prefix}${v.rel} ${v.width}w`).join(", ");
  const fallback = info.variants[Math.min(1, info.variants.length - 1)];
  const loading = eager ? `loading="eager" fetchpriority="high"` : `loading="lazy"`;
  return `<img src="${prefix}${fallback.rel}" srcset="${srcset}" sizes="${sizes}" width="${info.width}" height="${info.height}" alt="${esc(alt)}" ${loading} decoding="async">`;
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

    // ---- Cover tile on the homepage ----
    if (cover) {
      const info = await optimize(path.join(dir, cover), p.slug, COVER_WIDTHS);
      const tag = imgTag({
        info,
        prefix: "",
        alt: p.title,
        sizes: COVER_SIZES,
        eager: idx < 2, // first two tiles are likely above the fold
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
      const cls = /-wide\./i.test(file) ? ` class="wide"` : "";
      let img = imgTag({
        info,
        prefix: "../../",
        alt: `${p.title}, photo ${i + 1}`,
        sizes: GALLERY_SIZES,
        eager: i === 0, // only the first photo loads right away
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
  console.log("Done.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});