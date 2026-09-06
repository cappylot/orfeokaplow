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

export function buildPhone(screenTexture) {
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

  const back = panel(W - 0.0008, H - 0.0008, R - 0.0004, M.backGlass, 'back_glass');
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

export async function loadScreenTexture(url = './assets/screen.png') {
  const tex = await new THREE.TextureLoader().loadAsync(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
