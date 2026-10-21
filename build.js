
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

function fill(html, tag, content) {
  const re = new RegExp(`(<!-- ${tag}:START[^>]*-->)[\\s\\S]*?(<!-- ${tag}:END -->)`);
  if (!re.test(html)) throw new Error(`Missing <!-- ${tag}:START --> marker`);
  return html.replace(re, (_, start, end) => `${start}\n${content}\n        ${end}`);
}

// Reads width/height of a JPEG or PNG (no extra packages needed).
// For JPEGs it also respects the camera's rotation flag, so a vertical
// photo that is stored sideways is still detected as vertical.
function imageSize(file) {
  try {
    const buf = fs.readFileSync(file);
    if (buf.readUInt32BE(0) === 0x89504e47) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let o = 2;
      let orientation = 1;
      while (o + 4 < buf.length) {
        if (buf[o] !== 0xff) { o++; continue; }
        const m = buf[o + 1];
        if (m === 0xff) { o++; continue; }
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
        if (m === 0xe1 && buf.toString("ascii", o + 4, o + 8) === "Exif") {
          const t = o + 10;
          const le = buf.toString("ascii", t, t + 2) === "II";
          const u16 = (p) => (le ? buf.readUInt16LE(p) : buf.readUInt16BE(p));
          const u32 = (p) => (le ? buf.readUInt32LE(p) : buf.readUInt32BE(p));
          const ifd = t + u32(t + 4);
          const n = u16(ifd);
          for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12;
            if (u16(e) === 0x0112) orientation = u16(e + 8);
          }
        }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          let h = buf.readUInt16BE(o + 5);
          let w = buf.readUInt16BE(o + 7);
          if (orientation >= 5 && orientation <= 8) [w, h] = [h, w];
          return { w, h };
        }
        o += 2 + buf.readUInt16BE(o + 2);
      }
    }
  } catch (e) {}
  return null;
}

const rows = [];

PROJECTS.forEach((p, idx) => {
  const dir = path.join("images", p.slug);
  fs.mkdirSync(dir, { recursive: true });

  const files = fs.readdirSync(dir).filter((f) => IMAGE.test(f)).sort(byName);
  const cover = files.find((f) => /^cover\./i.test(f));
  const photos = files.filter((f) => f !== cover);

  if (!cover) console.warn(`! ${dir}/ has no cover photo (name one cover.jpg)`);

  const coverSrc = `images/${p.slug}/${encodeURIComponent(cover || "cover.jpg")}`;
  const count = `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`;

  rows.push(`        <li>
          <a class="index-item" href="work/${p.slug}/index.html" data-img="${coverSrc}">
            <span class="index-num">${String(idx + 1).padStart(2, "0")}</span>
            <span class="index-name">${esc(p.title)}</span>
            <span class="index-count">${count}</span>
            <img class="index-thumb" src="${coverSrc}" alt="" loading="lazy">
          </a>
        </li>`);

  let tallCount = 0;
  const figures = photos.map((file, i) => {
    const classes = [];
    if (/-wide\./i.test(file)) classes.push("wide");
    else {
      const size = imageSize(path.join(dir, file));
      if (size && size.h > size.w * 1.05) { classes.push("tall"); tallCount++; }
    }
    const cls = classes.length ? ` class="${classes.join(" ")}"` : "";
    let img = `<img src="../../images/${p.slug}/${encodeURIComponent(file)}" alt="${esc(p.title)}, photo ${i + 1}" loading="lazy">`;
    if (p.lastPhotoLink && i === photos.length - 1) {
      img = `<a href="${p.lastPhotoLink}" target="_blank" rel="noopener">${img}</a>`;
    }
    return `        <figure${cls}>${img}</figure>`;
  });

  const page = path.join("work", p.slug, "index.html");
  const html = fs.readFileSync(page, "utf8");
  const body = figures.length
    ? figures.join("\n")
    : `        <!-- No photos yet: add images to ${dir}/ and run: node build.js -->`;
  fs.writeFileSync(page, fill(html, "GALLERY", body));

  console.log(`${p.slug}: cover ${cover ? "ok" : "MISSING"}, ${photos.length} gallery photo(s), ${tallCount} vertical`);
});

const home = fs.readFileSync("index.html", "utf8");
fs.writeFileSync("index.html", fill(home, "TILES", rows.join("\n")));
console.log("Done.");
