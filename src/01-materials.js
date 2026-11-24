// Seeded deterministic PRNG
function createRng(seed = 1337) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvasTexture(size, drawFn, { repeat = [1, 1], color = false, anisotropy = 8 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = anisotropy;
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

function buildProceduralTextures() {
  const R = createRng(202502);

  // 1. 2x2 Twill Carbon Fiber Weave (color + bump/roughness)
  const carbonColor = makeCanvasTexture(512, (ctx, S) => {
    ctx.fillStyle = '#0d0e11';
    ctx.fillRect(0, 0, S, S);
    const cells = 32;
    const w = S / cells;
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        // 2x2 diagonal twill pattern
        const phase = (x + y) % 4;
        const horiz = phase < 2;
        const grad = horiz
          ? ctx.createLinearGradient(x * w, 0, x * w + w, 0)
          : ctx.createLinearGradient(0, y * w, 0, y * w + w);
        grad.addColorStop(0, '#0a0b0d');
        grad.addColorStop(0.5, horiz ? '#363a42' : '#25282e');
        grad.addColorStop(1, '#0a0b0d');
        ctx.fillStyle = grad;
        ctx.fillRect(x * w, y * w, w, w);
      }
    }
  }, { repeat: [6, 6], color: true });

  const carbonRough = makeCanvasTexture(512, (ctx, S) => {
    ctx.fillStyle = '#606060';
    ctx.fillRect(0, 0, S, S);
    const cells = 32;
    const w = S / cells;
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const horiz = ((x + y) % 4) < 2;
        ctx.fillStyle = horiz ? '#3c3c3c' : '#7a7a7a';
        ctx.fillRect(x * w + 0.5, y * w + 0.5, w - 1, w - 1);
      }
    }
  }, { repeat: [6, 6], color: false });

  // 2. Cross-drilled Carbon-Ceramic Rotor texture (polar radial + drilled slots)
  const ceramicRotor = makeCanvasTexture(512, (ctx, S) => {
    const cx = S / 2;
    const cy = S / 2;
    ctx.fillStyle = '#383a3e';
    ctx.fillRect(0, 0, S, S);

    // Concentric subtle scoring rings
    for (let r = 90; r < 252; r += 2) {
      const v = 50 + Math.floor(R() * 26);
      ctx.strokeStyle = `rgb(${v},${v},${v + 2})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Subtle carbon-ceramic fibrous fleck
    for (let i = 0; i < 1800; i++) {
      const a = R() * Math.PI * 2;
      const r = 105 + R() * 142;
      const v = 40 + Math.floor(R() * 48);
      ctx.fillStyle = `rgba(${v},${v},${v},0.45)`;
      ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2, 2);
    }

    // Curved cross-drilled cooling holes (32 spirals x 4 holes)
    ctx.fillStyle = '#121316';
    const arms = 28;
    for (let i = 0; i < arms; i++) {
      const baseA = (i / arms) * Math.PI * 2;
      for (let k = 0; k < 4; k++) {
        const rr = 122 + k * 32;
        const aa = baseA + k * 0.085;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, { repeat: [1, 1], color: true });

  // 3. Brushed Aluminum / Metal anisotropic streaks
  const brushedMetal = makeCanvasTexture(512, (ctx, S) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 2400; i++) {
      const v = 96 + Math.floor(R() * 68);
      ctx.fillStyle = `rgba(${v},${v},${v},0.32)`;
      ctx.fillRect(R() * S, R() * S, 24 + R() * 180, 1);
    }
  }, { repeat: [2, 2], color: false });

  // 4. Tire Tread Pattern
  const tireTread = makeCanvasTexture(512, (ctx, S) => {
    ctx.fillStyle = '#191b1e';
    ctx.fillRect(0, 0, S, S);
    // Longitudinal circumferential water channels
    ctx.fillStyle = '#0c0d0f';
    [0.24, 0.42, 0.58, 0.76].forEach((u) => {
      ctx.fillRect(u * S - 7, 0, 14, S);
    });
    // Diagonal shoulder sipes
    ctx.strokeStyle = '#0c0d0f';
    ctx.lineWidth = 6;
    for (let y = -S; y < S * 2; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(S * 0.22, y + 26);
      ctx.moveTo(S, y);
      ctx.lineTo(S * 0.78, y + 26);
      ctx.stroke();
    }
  }, { repeat: [1, 14], color: true });

  // 5. Metallic paint micro-flake roughness
  const paintFlake = makeCanvasTexture(256, (ctx, S) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 4500; i++) {
      const v = 114 + Math.floor(R() * 32);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(R() * S, R() * S, 1.5, 1.5);
    }
  }, { repeat: [8, 8], color: false });

  // 6. Hexagonal Grille Texture
  const hexGrille = makeCanvasTexture(256, (ctx, S) => {
    ctx.fillStyle = '#090a0c';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#2c3038';
    ctx.lineWidth = 3;
    const rad = 14;
    const dx = rad * 1.5;
    const dy = rad * Math.sqrt(3);
    for (let col = -1; col < S / dx + 2; col++) {
      for (let row = -1; row < S / dy + 2; row++) {
        const cx = col * dx;
        const cy = row * dy + (col % 2 ? dy / 2 : 0);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          const px = cx + Math.cos(a) * (rad - 1.5);
          const py = cy + Math.sin(a) * (rad - 1.5);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  }, { repeat: [10, 3], color: true });

  return {
    carbonColor,
    carbonRough,
    ceramicRotor,
    brushedMetal,
    tireTread,
    paintFlake,
    hexGrille,
  };
}

const SU7_PAINTS = {
  yellow: {
    label: '闪电黄',
    color: '#F3C200',
    metalness: 0.24,
    roughness: 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.045,
    stripeColor: '#767E88',
    accent: '#F3C200',
  },
  silver: {
    label: '太空银',
    color: '#9BA4B0',
    metalness: 0.82,
    roughness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.045,
    stripeColor: '#F2C200',
    accent: '#D5DEE6',
  },
  white: {
    label: '珍珠白',
    color: '#ECEFED',
    metalness: 0.20,
    roughness: 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.045,
    stripeColor: '#3A404A',
    accent: '#F4F6FA',
  },
  black: {
    label: '曜石黑',
    color: '#101216',
    metalness: 0.54,
    roughness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    stripeColor: '#F2C200',
    accent: '#F2C200',
  },
  green: {
    label: '鹦鹉绿',
    color: '#165A54',
    metalness: 0.64,
    roughness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.045,
    stripeColor: '#CFD6DE',
    accent: '#49A87B',
  },
};

// Shared Cutaway Clipping Plane (active only on exterior materials)
const cutawayPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10);

function blackbodyColor(kelvin) {
  const T = Math.min(2400, Math.max(600, kelvin));
  if (T < 760) {
    const f = Math.max(0, (T - 640) / 120);
    return new THREE.Color(f * 0.42, 0.015 * f, 0);
  }
  const t = T / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = Math.max(0, 99.47 * Math.log(t) - 161.12);
    b = t <= 19 ? 0 : Math.max(0, 138.52 * Math.log(t - 10) - 305.04);
  } else {
    r = 255;
    g = 220;
    b = 180;
  }
  const scale = Math.min(2.4, (T - 680) / 360);
  return new THREE.Color((r / 255) * scale, (g / 255) * scale, (b / 255) * scale);
}

function createMaterialsLibrary() {
  const tex = buildProceduralTextures();

  const bodyPaint = new THREE.MeshPhysicalMaterial({
    color: SU7_PAINTS.yellow.color,
    metalness: SU7_PAINTS.yellow.metalness,
    roughness: SU7_PAINTS.yellow.roughness,
    roughnessMap: tex.paintFlake,
    clearcoat: SU7_PAINTS.yellow.clearcoat,
    clearcoatRoughness: SU7_PAINTS.yellow.clearcoatRoughness,
    envMapIntensity: 1.45,
  });

  const bodyPaintSecondary = new THREE.MeshPhysicalMaterial({
    color: SU7_PAINTS.yellow.color,
    metalness: SU7_PAINTS.yellow.metalness,
    roughness: SU7_PAINTS.yellow.roughness,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.4,
  });

  const stripeMat = new THREE.MeshPhysicalMaterial({
    color: SU7_PAINTS.yellow.stripeColor,
    metalness: 0.25,
    roughness: 0.22,
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const carbon = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    map: tex.carbonColor,
    roughnessMap: tex.carbonRough,
    metalness: 0.14,
    roughness: 0.34,
    clearcoat: 0.92,
    clearcoatRoughness: 0.10,
    envMapIntensity: 1.25,
  });

  const carbonMatte = new THREE.MeshStandardMaterial({
    color: '#d8dce2',
    map: tex.carbonColor,
    roughnessMap: tex.carbonRough,
    metalness: 0.12,
    roughness: 0.56,
  });

  const glossBlack = new THREE.MeshPhysicalMaterial({
    color: '#0e1014',
    metalness: 0.15,
    roughness: 0.12,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.35,
  });

  const matteTrim = new THREE.MeshStandardMaterial({
    color: '#17191f',
    metalness: 0.08,
    roughness: 0.72,
  });

  const hexMesh = new THREE.MeshStandardMaterial({
    color: '#1a1d22',
    map: tex.hexGrille,
    metalness: 0.5,
    roughness: 0.45,
  });

  const cabinGlass = new THREE.MeshPhysicalMaterial({
    color: '#080c12',
    metalness: 0.06,
    roughness: 0.12,
    transparent: true,
    opacity: 0.84,
    clearcoat: 0.28,
    clearcoatRoughness: 0.16,
    envMapIntensity: 0.52,
  });

  const headlightGlass = new THREE.MeshPhysicalMaterial({
    color: '#eef6ff',
    metalness: 0.0,
    roughness: 0.05,
    transparent: true,
    opacity: 0.28,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    depthWrite: false,
  });

  const taillightLens = new THREE.MeshPhysicalMaterial({
    color: '#2a0508',
    metalness: 0.1,
    roughness: 0.08,
    transparent: true,
    opacity: 0.56,
    clearcoat: 1.0,
  });

  const drlLed = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#e8f4ff',
    emissiveIntensity: 3.1,
    roughness: 0.15,
    metalness: 0.0,
  });

  const headlightBeam = new THREE.MeshStandardMaterial({
    color: '#f4f8ff',
    emissive: '#d8ecff',
    emissiveIntensity: 2.5,
    roughness: 0.2,
  });

  const haloTailLed = new THREE.MeshStandardMaterial({
    color: '#ff1f2d',
    emissive: '#ff1022',
    emissiveIntensity: 3.8,
    roughness: 0.18,
  });

  const f1BrakeLed = new THREE.MeshStandardMaterial({
    color: '#ff2424',
    emissive: '#ff1515',
    emissiveIntensity: 3.6,
    roughness: 0.2,
  });

  const goldBadge = new THREE.MeshStandardMaterial({
    color: '#F2C94C',
    metalness: 0.96,
    roughness: 0.16,
    envMapIntensity: 1.5,
  });

  // Wheels, Tires & Brakes
  const tireRubber = new THREE.MeshStandardMaterial({
    color: '#1b1d21',
    map: tex.tireTread,
    metalness: 0.03,
    roughness: 0.84,
  });

  const tireSidewall = new THREE.MeshStandardMaterial({
    color: '#16181c',
    metalness: 0.04,
    roughness: 0.78,
  });

  const forgedWheel = new THREE.MeshStandardMaterial({
    color: '#111317',
    metalness: 0.72,
    roughness: 0.19,
    envMapIntensity: 1.35,
    side: THREE.DoubleSide,
  });

  const wheelRimYellow = new THREE.MeshStandardMaterial({
    color: '#F2C400',
    metalness: 0.25,
    roughness: 0.22,
  });

  const satinGunmetal = new THREE.MeshStandardMaterial({
    color: '#343942',
    metalness: 0.58,
    roughness: 0.36,
    envMapIntensity: 1.15,
  });

  // Procedural high-resolution automotive decals & badges
  function drawSideUltraCanvas(canvas, stripeHex, isRightSide) {
    const W = 1024;
    const H = 192;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = stripeHex;

    // Tapered diagonal door stripe matching real SU7 Ultra side decal
    ctx.beginPath();
    if (!isRightSide) {
      // +X side: front is left (x=0), rear is right (x=W)
      ctx.moveTo(14, 150);
      ctx.lineTo(W - 48, 128);
      ctx.lineTo(W - 14, 62);
      ctx.lineTo(28, 86);
    } else {
      // -X side: rear is left (x=0), front is right (x=W)
      ctx.moveTo(48, 128);
      ctx.lineTo(W - 14, 150);
      ctx.lineTo(W - 28, 86);
      ctx.lineTo(14, 62);
    }
    ctx.closePath();
    ctx.fill();

    // Cut out italic "Ultra" script near front end of stripe
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.font = 'italic 800 70px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    if (!isRightSide) {
      ctx.textAlign = 'left';
      ctx.fillText('Ultra', 42, 118);
    } else {
      ctx.textAlign = 'right';
      ctx.fillText('Ultra', W - 42, 118);
    }
    ctx.restore();
  }

  const sideDecalCanvasL = document.createElement('canvas');
  const sideDecalCanvasR = document.createElement('canvas');
  drawSideUltraCanvas(sideDecalCanvasL, SU7_PAINTS.yellow.stripeColor, false);
  drawSideUltraCanvas(sideDecalCanvasR, SU7_PAINTS.yellow.stripeColor, true);

  const sideDecalTexL = new THREE.CanvasTexture(sideDecalCanvasL);
  sideDecalTexL.colorSpace = THREE.SRGBColorSpace;
  sideDecalTexL.anisotropy = 8;

  const sideDecalTexR = new THREE.CanvasTexture(sideDecalCanvasR);
  sideDecalTexR.colorSpace = THREE.SRGBColorSpace;
  sideDecalTexR.anisotropy = 8;

  const sideUltraDecalMat = new THREE.MeshPhysicalMaterial({
    map: sideDecalTexL,
    transparent: true,
    alphaTest: 0.15,
    metalness: 0.25,
    roughness: 0.22,
    clearcoat: 0.7,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  const sideUltraDecalRightMat = new THREE.MeshPhysicalMaterial({
    map: sideDecalTexR,
    transparent: true,
    alphaTest: 0.15,
    metalness: 0.25,
    roughness: 0.22,
    clearcoat: 0.7,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  function updateSideDecalColor(stripeHex) {
    drawSideUltraCanvas(sideDecalCanvasL, stripeHex, false);
    drawSideUltraCanvas(sideDecalCanvasR, stripeHex, true);
    sideDecalTexL.needsUpdate = true;
    sideDecalTexR.needsUpdate = true;
  }

  const frontPlateTex = makeCanvasTexture(512, (ctx, S) => {
    ctx.fillStyle = '#181c24';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#3b4252';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, S - 16, S - 16);
    ctx.fillStyle = '#e5e9f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 108px "Segoe UI", Arial, sans-serif';
    ctx.fillText('SU7', S * 0.31, S * 0.50);
    ctx.font = 'italic 700 94px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#d8dee9';
    ctx.fillText('Ultra', S * 0.69, S * 0.52);
  }, { repeat: [1, 1], color: true });

  const frontPlateMat = new THREE.MeshStandardMaterial({
    map: frontPlateTex,
    metalness: 0.35,
    roughness: 0.32,
  });

  const miBadgeTex = makeCanvasTexture(256, (ctx, S) => {
    ctx.fillStyle = '#14161b';
    ctx.fillRect(0, 0, S, S);
    // Carbon weave subtle background
    ctx.strokeStyle = '#252932';
    ctx.lineWidth = 4;
    for (let i = -S; i < S * 2; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + S, S);
      ctx.stroke();
    }
    ctx.strokeStyle = '#EBBF00';
    ctx.lineWidth = 14;
    ctx.strokeRect(14, 14, S - 28, S - 28);
    ctx.fillStyle = '#F2C94C';
    ctx.font = '900 112px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MI', S / 2, S / 2 + 4);
  }, { repeat: [1, 1], color: true });

  const miBadgeMat = new THREE.MeshStandardMaterial({
    map: miBadgeTex,
    metalness: 0.72,
    roughness: 0.24,
  });

  function makeBadgeTextMat(text, { italic = false, fontSize = 68, color = '#1f242d' } = {}) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 112;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = color;
    ctx.font = `${italic ? 'italic ' : ''}900 ${fontSize}px "Segoe UI", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      metalness: 0.55,
      roughness: 0.28,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }

  const rearXiaomiMat = makeBadgeTextMat('X I A O M I', { fontSize: 64, color: '#1f242d' });
  const rearSu7UltraMat = makeBadgeTextMat('SU7 Ultra', { italic: true, fontSize: 74, color: '#1f242d' });
  const rearCnMat = makeBadgeTextMat('小 米', { fontSize: 70, color: '#1f242d' });

  const machinedAlloy = new THREE.MeshStandardMaterial({
    color: '#cfd5de',
    metalness: 0.94,
    roughness: 0.18,
    envMapIntensity: 1.4,
  });

  const caliperYellow = new THREE.MeshPhysicalMaterial({
    color: '#F2C400',
    metalness: 0.35,
    roughness: 0.22,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
  });

  const brakeRotor = new THREE.MeshStandardMaterial({
    color: '#484b52',
    map: tex.ceramicRotor,
    metalness: 0.42,
    roughness: 0.52,
    emissive: new THREE.Color(0, 0, 0),
    emissiveIntensity: 1.0,
  });

  // Internal Mechanical Hardware
  const castAlu = new THREE.MeshStandardMaterial({
    color: '#9aa2ad',
    roughnessMap: tex.brushedMetal,
    metalness: 0.86,
    roughness: 0.34,
  });

  const darkCastAlu = new THREE.MeshStandardMaterial({
    color: '#464d57',
    roughnessMap: tex.brushedMetal,
    metalness: 0.82,
    roughness: 0.38,
  });

  const copperWinding = new THREE.MeshStandardMaterial({
    color: '#cc6830',
    metalness: 0.92,
    roughness: 0.22,
  });

  const siliconSteel = new THREE.MeshStandardMaterial({
    color: '#5a6270',
    metalness: 0.88,
    roughness: 0.26,
  });

  const hvOrange = new THREE.MeshStandardMaterial({
    color: '#FF5A00',
    metalness: 0.08,
    roughness: 0.42,
  });

  const batteryShell = new THREE.MeshStandardMaterial({
    color: '#6e7886',
    roughnessMap: tex.brushedMetal,
    metalness: 0.85,
    roughness: 0.32,
  });

  const batteryCell = new THREE.MeshStandardMaterial({
    color: '#255e6e',
    metalness: 0.62,
    roughness: 0.34,
  });

  const coolantPipe = new THREE.MeshStandardMaterial({
    color: '#bfc7d1',
    metalness: 0.92,
    roughness: 0.22,
  });

  const suspensionSpring = new THREE.MeshStandardMaterial({
    color: '#EBBF00',
    metalness: 0.32,
    roughness: 0.28,
  });

  const interiorAlcantara = new THREE.MeshStandardMaterial({
    color: '#1b1d22',
    metalness: 0.04,
    roughness: 0.88,
  });

  const seatYellowAccent = new THREE.MeshStandardMaterial({
    color: '#E5B800',
    metalness: 0.08,
    roughness: 0.65,
  });

  const screenGlow = new THREE.MeshStandardMaterial({
    color: '#18344c',
    emissive: '#38bdf8',
    emissiveIntensity: 0.9,
    roughness: 0.15,
  });

  // X-Ray translucent Fresnel-style ghost shell
  const xrayShellMat = new THREE.MeshPhysicalMaterial({
    color: '#55D6FF',
    emissive: '#0B3B59',
    emissiveIntensity: 0.55,
    metalness: 0.12,
    roughness: 0.16,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const xrayGlassMat = new THREE.MeshPhysicalMaterial({
    color: '#9BE7FF',
    emissive: '#0F4D73',
    emissiveIntensity: 0.35,
    metalness: 0.05,
    roughness: 0.1,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Registry of exterior materials that receive the cutaway clipping plane
  const EXTERIOR_CLIP_MATS = [
    bodyPaint,
    bodyPaintSecondary,
    stripeMat,
    sideUltraDecalMat,
    sideUltraDecalRightMat,
    frontPlateMat,
    miBadgeMat,
    rearXiaomiMat,
    rearSu7UltraMat,
    rearCnMat,
    satinGunmetal,
    carbon,
    carbonMatte,
    glossBlack,
    matteTrim,
    hexMesh,
    cabinGlass,
    headlightGlass,
    taillightLens,
    drlLed,
    headlightBeam,
    haloTailLed,
    f1BrakeLed,
    goldBadge,
  ];

  function setCutawayActive(active, cutX) {
    cutawayPlane.constant = cutX;
    for (const m of EXTERIOR_CLIP_MATS) {
      m.clippingPlanes = active ? [cutawayPlane] : null;
      m.clipShadows = active;
      if (!m._origSide) m._origSide = m.side;
      m.side = active ? THREE.DoubleSide : m._origSide;
      m.needsUpdate = true;
    }
  }

  return {
    bodyPaint,
    bodyPaintSecondary,
    stripeMat,
    sideUltraDecalMat,
    sideUltraDecalRightMat,
    frontPlateMat,
    miBadgeMat,
    rearXiaomiMat,
    rearSu7UltraMat,
    rearCnMat,
    satinGunmetal,
    wheelRimYellow,
    updateSideDecalColor,
    carbon,
    carbonMatte,
    glossBlack,
    matteTrim,
    hexMesh,
    cabinGlass,
    headlightGlass,
    taillightLens,
    drlLed,
    headlightBeam,
    haloTailLed,
    f1BrakeLed,
    goldBadge,
    tireRubber,
    tireSidewall,
    forgedWheel,
    machinedAlloy,
    caliperYellow,
    brakeRotor,
    castAlu,
    darkCastAlu,
    copperWinding,
    siliconSteel,
    hvOrange,
    batteryShell,
    batteryCell,
    coolantPipe,
    suspensionSpring,
    interiorAlcantara,
    seatYellowAccent,
    screenGlow,
    xrayShellMat,
    xrayGlassMat,
    setCutawayActive,
  };
}
