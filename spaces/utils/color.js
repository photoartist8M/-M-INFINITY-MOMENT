import * as THREE from 'three';

// ======================================================================
// utils/color.js
// 元ファイルの [SECTION: colorUtils] 〜 [SECTION: colorUtils end] をそのまま移動
// ======================================================================

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToColor(h, s, l) {
  const c = new THREE.Color();
  c.setHSL(h, s, l);
  return c;
}

function toPastel(h, s, l, hueShift = 0) {
  const hue = ((h + hueShift) % 1 + 1) % 1;
  const sat = THREE.MathUtils.clamp(s * 1.2 + 0.15, 0.35, 1.0);
  const light = THREE.MathUtils.clamp(l, 0.2, 0.55);
  return hslToColor(hue, sat, light);
}

export function extractPastelColors(img) {
  const w = 60, h = 60;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0, w, h);
  const data = cx.getImageData(0, 0, w, h).data;

  function pickVividColor(yStart, yEnd) {
    let bestS = -1, bestH = 0, bestL = 0.5;
    for (let y = yStart; y < yEnd; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const [ph, ps, pl] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
        if (ps > bestS) {
          bestS = ps;
          bestH = ph;
          bestL = pl;
        }
      }
    }
    return [bestH, bestS, bestL];
  }

  const bandCount = 5;
  const bandHeight = h / bandCount;
  const colors = [];
  for (let i = 0; i < bandCount; i++) {
    const [ph, ps, pl] = pickVividColor(Math.floor(i * bandHeight), Math.floor((i + 1) * bandHeight));
    const hueShift = (i / (bandCount - 1) - 0.5) * 0.12 + (Math.random() - 0.5) * 0.05;
    colors.push(toPastel(ph, ps, pl, hueShift));
  }
  return colors;
}