
const fs = require("fs");
const path = require("path");

const PROJECTS = [
  {
    slug: "dinner-party",
    title: "Fable x Sally Al-Hadidi Dinner Party",
    // The last gallery photo links here (like on your Squarespace site)
    lastPhotoLink: "https://fable.com/pages/come-host-with-me-episode-06",
  },
  { slug: "street-and-documentary", title: "Street and Documentary" },
  { slug: "graduation-and-prom", title: "Graduation and Prom Photography" },
  { slug: "roots-of-diaspora", title: "Roots of Diaspora Photo Exhibition" },
];

const IMAGE = /\.(jpe?g|png|webp|avif)$/i;
const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// Replace everything between <!-- TAG:START ... --> and <!-- TAG:END -->
function fill(html, tag, content) {
  const re = new RegExp(`(<!-- ${tag}:START[^>]*-->)[\\s\\S]*?(<!-- ${tag}:END -->)`);
  if (!re.test(html)) throw new Error(`Missing <!-- ${tag}:START --> marker`);
  return html.replace(re, (_, start, end) => `${start}\n${content}\n        ${end}`);
}

const tiles = [];

for (const p of PROJECTS) {
  const dir = path.join("images", p.slug);
  fs.mkdirSync(dir, { recursive: true });

  const files = fs.readdirSync(dir).filter((f) => IMAGE.test(f)).sort(byName);
  const cover = files.find((f) => /^cover\./i.test(f));
  const photos = files.filter((f) => f !== cover);

  if (!cover) console.warn(`! ${dir}/ has no cover photo (name one cover.jpg)`);

  tiles.push(`      <a class="tile" href="work/${p.slug}/index.html">
        <img src="images/${p.slug}/${encodeURIComponent(cover || "cover.jpg")}" alt="${esc(p.title)}" loading="lazy">
        <span class="tile-title">${esc(p.title)}</span>
      </a>`);

  const figures = photos.map((file, i) => {
    const wide = /-wide\./i.test(file) ? ' class="wide"' : "";
    let img = `<img src="../../images/${p.slug}/${encodeURIComponent(file)}" alt="${esc(p.title)}, photo ${i + 1}" loading="lazy">`;
    if (p.lastPhotoLink && i === photos.length - 1) {
      img = `<a href="${p.lastPhotoLink}" target="_blank" rel="noopener">${img}</a>`;
    }
    return `        <figure${wide}>${img}</figure>`;
  });

  const page = path.join("work", p.slug, "index.html");
  const html = fs.readFileSync(page, "utf8");
  const body = figures.length
    ? figures.join("\n")
    : `        <!-- No photos yet: add images to ${dir}/ and run: node build.js -->`;
  fs.writeFileSync(page, fill(html, "GALLERY", body));

  console.log(`${p.slug}: cover ${cover ? "ok" : "MISSING"}, ${photos.length} gallery photo(s)`);
}

const home = fs.readFileSync("index.html", "utf8");
fs.writeFileSync("index.html", fill(home, "TILES", tiles.join("\n")));
console.log("Done.");
