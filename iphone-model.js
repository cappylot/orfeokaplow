import * as THREE from 'three';

/* iPhone 17 Pro — real dimensions in metres, y-up, centred on the origin. */
export const DIM = { W: 0.0719, H: 0.1500, D: 0.00875, R: 0.0118, SIDE: 0.0016 };

function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = w / 2, y = h / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);  s.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x, y - r);   s.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
  s.lineTo(-x + r, y);  s.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-x, -y + r); s.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function panel(w, h, r, mat, name) {
  const g = new THREE.ShapeGeometry(roundedRect(w, h, r), 24);
  g.computeBoundingBox();
  const bb = g.boundingBox, sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y;
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / sx, (p.getY(i) - bb.min.y) / sy);
  uv.needsUpdate = true;
  const m = new THREE.Mesh(g, mat); m.name = name; return m;
}

function slab(w, h, r, depth, mat, name, bevel = 0.0004) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w, h, r), {
    depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel,
    bevelThickness: bevel, bevelSegments: 4, curveSegments: 36
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  const m = new THREE.Mesh(g, mat); m.name = name; return m;
}

/* --- back-glass engraving -------------------------------------------------
   A laser etch changes the surface, not the colour. These maps drive bump,
   roughness and metalness from the portrait, so the figure catches raking light
   and all but vanishes head-on — the way a real engraving does. */
const ETCH = {
  width:  1.00,     // edge to edge across the back panel
  centre: 0.37,     // centred in the space left under the camera plateau
  floor:  0.16,     // shallowest cut, so the whole silhouette still reads
  gamma:  1.85,     // tonal contrast of the etch
  slope:  9.00,     // how sharply the walls of the cut turn the normal
  rough:  0.92,     // the frosted floor scatters; bare glass is 0.32
  metal:  0.00,     // ...and holds no specular metal at all
  tint:   0.26      // frost lift, on top of the relief
};

function alphaBounds(d, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] <= 16) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? { x: 0, y: 0, w, h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function canvasTex(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 16;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/* returns a back-glass material with the portrait etched into it */
function engravedBack(img, base, panelW, panelH) {
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

  // trim the cutout to its opaque bounds so the figure sits centred on the glass
  const src = document.createElement('canvas');
  src.width = img.width; src.height = img.height;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, 0, 0);
  const box = alphaBounds(sctx.getImageData(0, 0, src.width, src.height).data, src.width, src.height);

  // one texel grid across the whole panel, so every map shares its UVs
  const TW = 1024, TH = Math.round(TW * panelH / panelW);
  const cut = document.createElement('canvas');
  cut.width = TW; cut.height = TH;
  const ctx = cut.getContext('2d', { willReadFrequently: true });

  const dw = ETCH.width * TW, dh = dw * box.h / box.w;
  ctx.drawImage(img, box.x, box.y, box.w, box.h,
                (TW - dw) / 2, TH * (1 - ETCH.centre) - dh / 2, dw, dh);

  /* depth of cut per texel: a laser bites hardest where the photograph is
     darkest, and a floor under the whole silhouette keeps the figure a shape
     rather than a scatter of dark features */
  const px = ctx.getImageData(0, 0, TW, TH).data;
  const cutDepth = new Float32Array(TW * TH);
  for (let i = 0, j = 0; j < cutDepth.length; i += 4, j++) {
    const lum = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
    const tone = clamp01(0.5 + (0.5 - lum) * ETCH.gamma);
    cutDepth[j] = (px[i + 3] / 255) * (ETCH.floor + (1 - ETCH.floor) * tone);
  }

  const mk = () => { const c = document.createElement('canvas'); c.width = TW; c.height = TH; return c; };
  const nrmC = mk(), ormC = mk(), albC = mk();
  const nrm = nrmC.getContext('2d').createImageData(TW, TH);
  const orm = ormC.getContext('2d').createImageData(TW, TH);
  const alb = albC.getContext('2d').createImageData(TW, TH);

  const col = base.color, bR = col.r * 255, bG = col.g * 255, bB = col.b * 255;
  const bRough = base.roughness, bMetal = base.metalness;
  const at = (x, y) => cutDepth[Math.min(TH - 1, Math.max(0, y)) * TW + Math.min(TW - 1, Math.max(0, x))];

  for (let y = 0, j = 0; y < TH; y++) for (let x = 0; x < TW; x++, j++) {
    const e = cutDepth[j], i = j * 4;

    // tangent-space normal from the slope of the cut (v runs up, rows run down)
    const gx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * ETCH.slope;
    const gy = (at(x, y - 1) - at(x, y + 1)) * 0.5 * ETCH.slope;
    const inv = 1 / Math.hypot(gx, gy, 1);
    nrm.data[i]     = (gx * inv * 0.5 + 0.5) * 255;
    nrm.data[i + 1] = (gy * inv * 0.5 + 0.5) * 255;
    nrm.data[i + 2] = (inv * 0.5 + 0.5) * 255;
    nrm.data[i + 3] = 255;

    orm.data[i] = 255;                             // ao, unused
    orm.data[i + 1] = 255 * (bRough + e * (ETCH.rough - bRough));
    orm.data[i + 2] = 255 * (bMetal + e * (ETCH.metal - bMetal));
    orm.data[i + 3] = 255;

    const f = e * ETCH.tint;                       // frost lifts the glass a little
    alb.data[i]     = bR + (255 - bR) * f;
    alb.data[i + 1] = bG + (255 - bG) * f;
    alb.data[i + 2] = bB + (255 - bB) * f;
    alb.data[i + 3] = 255;
  }
  nrmC.getContext('2d').putImageData(nrm, 0, 0);
  ormC.getContext('2d').putImageData(orm, 0, 0);
  albC.getContext('2d').putImageData(alb, 0, 0);

  const m = base.clone();
  m.name = 'backGlassEngraved';
  m.color.set(0xffffff);                 // the colour now comes from the map
  m.map = canvasTex(albC, true);
  m.normalMap = canvasTex(nrmC, false);
  m.roughnessMap = m.metalnessMap = canvasTex(ormC, false);
  m.roughness = m.metalness = 1;         // both are carried by the map
  return m;
}

export function buildPhone(screenTexture, portrait) {
  const { W, H, D, R, SIDE } = DIM;

  const M = {
    frame: new THREE.MeshStandardMaterial({ color: 0x7c8189, metalness: 0.36, roughness: 0.26 }),
    frameDark: new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.35, roughness: 0.34 }),
    backGlass: new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.2, roughness: 0.32 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x08090b, metalness: 0.15, roughness: 0.08 }),
    lensRing: new THREE.MeshStandardMaterial({ color: 0x8a8e94, metalness: 0.4, roughness: 0.22 }),
    lensGlass: new THREE.MeshStandardMaterial({ color: 0x0a1018, metalness: 0.3, roughness: 0.05 }),
    lensIris: new THREE.MeshStandardMaterial({ color: 0x1b2a3d, metalness: 0.25, roughness: 0.15 }),
    flash: new THREE.MeshStandardMaterial({ color: 0xf3e4c8, roughness: 0.5, emissive: 0x2a2318 }),
    sensor: new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.4 })
  };
  M.screen = new THREE.MeshStandardMaterial({
    map: screenTexture, emissiveMap: screenTexture, emissive: 0xffffff,
    emissiveIntensity: 0.85, roughness: 0.35, metalness: 0
  });
  Object.entries(M).forEach(([k, v]) => { v.name = k; });

  const phone = new THREE.Group();
  phone.name = 'iPhone_17_Pro';

  phone.add(slab(W, H, R, D, M.frame, 'body', 0.0006));

  const cover = panel(W - 0.0004, H - 0.0004, R - 0.0002, M.glass, 'cover_glass');
  cover.position.z = D / 2 + 0.00012;
  phone.add(cover);

  const display = panel(W - SIDE * 2, H - SIDE * 2, R - SIDE, M.screen, 'display');
  display.position.z = D / 2 + 0.00022;
  phone.add(display);

  const backW = W - 0.0008, backH = H - 0.0008;
  const backMat = portrait ? engravedBack(portrait, M.backGlass, backW, backH) : M.backGlass;
  const back = panel(backW, backH, R - 0.0004, backMat, 'back_glass');
  back.position.z = -D / 2 - 0.00012;
  back.rotation.y = Math.PI;
  phone.add(back);

  const plW = W - 0.0032, plH = 0.0300, plD = 0.0026;
  const plateau = slab(plW, plH, 0.0085, plD, M.backGlass, 'camera_plateau', 0.0006);
  plateau.position.set(0, H / 2 - plH / 2 - 0.0060, -D / 2 - plD / 2 - 0.0002);
  plateau.rotation.y = Math.PI;
  phone.add(plateau);

  const plZ = -D / 2 - plD - 0.0002;
  const cy = plateau.position.y;

  function lens(x, y, r, name) {
    const g = new THREE.Group(); g.name = name;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, 0.0026, 48), M.lensRing);
    ring.name = name + '_ring'; ring.rotation.x = Math.PI / 2; ring.position.z = -0.0013;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.78, 0.0020, 48), M.lensGlass);
    barrel.name = name + '_glass'; barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.0021;
    const iris = new THREE.Mesh(new THREE.SphereGeometry(r * 0.52, 40, 24), M.lensIris);
    iris.name = name + '_element'; iris.scale.z = 0.35; iris.position.z = -0.0028;
    g.add(ring, barrel, iris);
    g.position.set(x, y, plZ);
    return g;
  }
  const lensR = 0.0076, sp = 0.0166;
  phone.add(lens(-plW / 2 + 0.0112, cy + sp * 0.5, lensR, 'lens_wide'));
  phone.add(lens(-plW / 2 + 0.0112, cy - sp * 0.5, lensR, 'lens_ultrawide'));
  phone.add(lens(-plW / 2 + 0.0112 + sp * 0.88, cy, lensR, 'lens_telephoto'));

  function puck(x, y, r, mat, name, h = 0.0009) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), mat);
    m.name = name; m.rotation.x = Math.PI / 2; m.position.set(x, y, plZ - h / 2 + 0.0002);
    return m;
  }
  phone.add(puck(plW / 2 - 0.0090, cy + 0.0062, 0.0034, M.sensor, 'flash_housing', 0.0008));
  phone.add(puck(plW / 2 - 0.0090, cy + 0.0062, 0.0024, M.flash, 'flash_lens', 0.0011));
  phone.add(puck(plW / 2 - 0.0090, cy - 0.0022, 0.0016, M.sensor, 'microphone'));
  phone.add(puck(plW / 2 - 0.0090, cy - 0.0088, 0.0026, M.lensGlass, 'lidar_scanner'));

  function button(side, y, len, thick, name, mat = M.frameDark) {
    const b = slab(len, thick, thick * 0.45, 0.0012, mat, name, 0.0003);
    b.rotation.z = Math.PI / 2;
    b.rotation.y = side * Math.PI / 2;
    b.position.set(side * (W / 2 + 0.00035), y, 0);
    return b;
  }
  phone.add(button(-1, H / 2 - 0.0330, 0.0075, 0.0035, 'action_button'));
  phone.add(button(-1, H / 2 - 0.0480, 0.0130, 0.0035, 'volume_up'));
  phone.add(button(-1, H / 2 - 0.0640, 0.0130, 0.0035, 'volume_down'));
  phone.add(button(1, H / 2 - 0.0480, 0.0230, 0.0035, 'side_button'));
  phone.add(button(1, H / 2 - 0.0810, 0.0120, 0.0032, 'camera_control', M.glass));

  const port = new THREE.Mesh(new THREE.CapsuleGeometry(0.0016, 0.0055, 6, 24), M.sensor);
  port.name = 'usb_c_port';
  port.rotation.z = Math.PI / 2;
  port.position.set(0, -DIM.H / 2 + 0.0010, 0);
  port.scale.z = 0.55;
  phone.add(port);

  const grille = new THREE.Group(); grille.name = 'speaker_grille';
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.00042, 0.00042, 0.0016, 16), M.sensor);
      hole.name = `grille_hole_${s > 0 ? 'r' : 'l'}${i}`;
      hole.position.set(s * (0.0090 + i * 0.0022), -H / 2 + 0.0009, 0);
      grille.add(hole);
    }
  }
  phone.add(grille);

  return phone;
}

export function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`could not load ${url}`));
    img.src = url;
  });
}

export async function loadScreenTexture(url = './assets/screen.png') {
  const tex = await new THREE.TextureLoader().loadAsync(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
