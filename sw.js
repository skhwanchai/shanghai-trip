// เปลี่ยนเลขเวอร์ชันทุกครั้งที่แก้ไฟล์ เพื่อให้มือถือโหลดของใหม่
const VERSION = "sh26-v6";
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
function photoUrls() {
  try { importScripts("./data.js"); } catch (e) { return []; }
  const u = (img, w) => `https://images.unsplash.com/photo-${img}?w=${w}&q=70&auto=format&fit=crop`;
  const out = SIZES.hero.map(w => u(HERO_PHOTO.img, w));
  for (const p of PLACES) if (p.photo) for (const w of SIZES.place) out.push(u(p.photo.img, w));
  return out;
}

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(FILES);
    // รูป: พยายามเก็บให้ครบ ถ้าบางรูปโหลดไม่ได้ก็ข้ามไป แอปจะแสดงลายเส้นแทน
    const pc = await caches.open(PHOTOS);
    await Promise.all(photoUrls().map(async url => {
      if (await pc.match(url)) return;
      try { const r = await fetch(url, { mode: "cors" }); if (r.ok) await pc.put(url, r); } catch {}
    }));
    self.skipWaiting();
  })());
});

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

  // ไฟล์แอป: ใช้ของในเครื่องก่อน (ทำงานได้แม้ GitHub ถูกบล็อก) แล้วอัปเดตเบื้องหลังถ้ามีเน็ต
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
