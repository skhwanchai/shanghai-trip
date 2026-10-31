// เปลี่ยนเลขเวอร์ชันทุกครั้งที่แก้ไฟล์ เพื่อให้มือถือโหลดของใหม่
const VERSION = "sh26-v8";
const PHOTOS = "sh26-photos-v1"; // รูปจาก Unsplash แยกไว้ จะได้ไม่ต้องโหลดใหม่ทุกครั้งที่อัปเดตแอป
const FILES = [
  "./",
  "./index.html",
  "./data.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./fonts/limelight-latin-400-normal.woff2",
  "./fonts/poiret-one-latin-400-normal.woff2",
  "./fonts/chonburi-thai-400-normal.woff2",
  "./fonts/chonburi-latin-400-normal.woff2",
  "./fonts/mrs-saint-delafield-latin-400-normal.woff2"
];

// ขนาดรูปต้องตรงกับที่ index.html ใช้
const SIZES = { place: [1000, 700, 400, 300, 500, 900], hero: [1200] };
try { importScripts("./data.js"); } catch (e) {}
function photoUrls() {
  if (typeof PLACES === "undefined") return [];
  const u = (img, w) => `https://images.unsplash.com/photo-${img}?w=${w}&q=70&auto=format&fit=crop`;
  const out = typeof HERO_PHOTO !== "undefined" ? SIZES.hero.map(w => u(HERO_PHOTO.img, w)) : [];
  for (const p of PLACES) if (p.photo) for (const w of SIZES.place) out.push(u(p.photo.img, w));
  return out;
}
// เก็บรูปทั้งหมดไว้ในเครื่อง ทำเบื้องหลัง ไม่ทำให้แอปเปิดช้า รูปไหนโหลดไม่ได้ก็ข้าม (จะแสดงลายเส้นแทน)
async function cachePhotos() {
  const pc = await caches.open(PHOTOS);
  for (const url of photoUrls()) {
    if (await pc.match(url)) continue;
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(url, { mode: "cors", signal: ctl.signal }); clearTimeout(t);
      if (r.ok) await pc.put(url, r);
    } catch {}
  }
}

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("message", e => { if (e.data === "cache-photos") e.waitUntil(cachePhotos()); });

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== PHOTOS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // รูป Unsplash: ใช้ของในเครื่องก่อน ถ้าไม่มีค่อยโหลดแล้วเก็บไว้
  if (url.hostname === "images.unsplash.com") {
    e.respondWith(caches.open(PHOTOS).then(async c => {
      const hit = await c.match(req.url);
      if (hit) return hit;
      try { const r = await fetch(req.url, { mode: "cors" }); if (r.ok) c.put(req.url, r.clone()); return r; }
      catch { return Response.error(); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // หน้าเว็บ + data.js: ลองดึงของใหม่ก่อน (รอไม่เกิน 3 วินาที) ถ้าเน็ตช้า/GitHub ถูกบล็อก ใช้ของในเครื่อง
  const fresh = req.mode === "navigate" || /\/(index\.html|data\.js)?$/.test(url.pathname) || url.pathname.endsWith("/data.js");
  if (fresh) {
    e.respondWith(caches.open(VERSION).then(async cache => {
      // no-cache = ถามเซิร์ฟเวอร์ทุกครั้งว่ามีของใหม่ไหม (GitHub Pages เก็บแคชไว้ 10 นาที)
      const net = fetch(req.url, { cache: "no-cache" }).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; });
      const timeout = new Promise(r => setTimeout(() => r(null), 3000));
      try {
        const res = await Promise.race([net, timeout]);
        if (res && res.ok) return res;
      } catch {}
      return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("./index.html")) || net;
    }));
    return;
  }

  // ไฟล์อื่น (ฟอนต์ ไอคอน): ใช้ของในเครื่องก่อน แล้วอัปเดตเบื้องหลังถ้ามีเน็ต
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return hit || (await net) || cache.match("./index.html");
    })
  );
});
