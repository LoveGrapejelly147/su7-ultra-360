// Parametric surface lofting & V2 photo-matched exterior body assembly for Xiaomi SU7 Ultra
// Frame: Y-up, +Z = Front, -Z = Rear, floor at y = 0
// Dimensions: Length 5.115 m, Width 1.970 m, Height 1.465 m, Wheelbase 3.000 m

function clampNum(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function smoothStepNum(edge0, edge1, x) {
  const t = clampNum((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Build symmetric left (+X) & right (-X) lofted meshes from stations:
// stations = [{ z, pts: [[x, y], ...] }] ordered FRONT (+Z) -> REAR (-Z)
// Each station's pts ordered LOWER/OUTER edge -> UPPER/INNER centerline (x >= 0)
function buildSymmetricLoftGeometry(stations, { mirror = true } = {}) {
  const nZ = stations.length;
  const nP = stations[0].pts.length;
  const vertCountPerSide = nZ * nP;
  const sideCount = mirror ? 2 : 1;

  const positions = new Float32Array(vertCountPerSide * sideCount * 3);
  const uvs = new Float32Array(vertCountPerSide * sideCount * 2);
  const indices = [];

  for (let i = 0; i < nZ; i++) {
    const st = stations[i];
    for (let j = 0; j < nP; j++) {
      const idx = i * nP + j;
      const [x, y] = st.pts[j];
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = st.z;
      uvs[idx * 2] = (st.z + 2.6) * 0.35;
      uvs[idx * 2 + 1] = (j / (nP - 1)) * 1.4;
    }
  }

  for (let i = 0; i < nZ - 1; i++) {
    for (let j = 0; j < nP - 1; j++) {
      const a = i * nP + j;
      const b = (i + 1) * nP + j;
      const c = (i + 1) * nP + (j + 1);
      const d = i * nP + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  if (mirror) {
    const offset = vertCountPerSide;
    for (let i = 0; i < nZ; i++) {
      const st = stations[i];
      for (let j = 0; j < nP; j++) {
        const idx = offset + i * nP + j;
        const [x, y] = st.pts[j];
        positions[idx * 3] = -x;
        positions[idx * 3 + 1] = y;
        positions[idx * 3 + 2] = st.z;
        uvs[idx * 2] = (st.z + 2.6) * 0.35;
        uvs[idx * 2 + 1] = (j / (nP - 1)) * 1.4;
      }
    }
    for (let i = 0; i < nZ - 1; i++) {
      for (let j = 0; j < nP - 1; j++) {
        const a = offset + i * nP + j;
        const b = offset + (i + 1) * nP + j;
        const c = offset + (i + 1) * nP + (j + 1);
        const d = offset + i * nP + (j + 1);
        indices.push(a, d, b);
        indices.push(b, d, c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Build single-side lofted strip (used for side decals and asymmetrical trim)
function buildSingleSideLoft(stations, side = 1, uvFn = null) {
  const nZ = stations.length;
  const nP = stations[0].pts.length;
  const positions = new Float32Array(nZ * nP * 3);
  const uvs = new Float32Array(nZ * nP * 2);
  const indices = [];

  for (let i = 0; i < nZ; i++) {
    const st = stations[i];
    for (let j = 0; j < nP; j++) {
      const idx = i * nP + j;
      const [x, y] = st.pts[j];
      positions[idx * 3] = side * x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = st.z;
      if (uvFn) {
        const [u, v] = uvFn(i, j, nZ, nP, st);
        uvs[idx * 2] = u;
        uvs[idx * 2 + 1] = v;
      } else {
        uvs[idx * 2] = i / (nZ - 1);
        uvs[idx * 2 + 1] = j / (nP - 1);
      }
    }
  }

  for (let i = 0; i < nZ - 1; i++) {
    for (let j = 0; j < nP - 1; j++) {
      const a = i * nP + j;
      const b = (i + 1) * nP + j;
      const c = (i + 1) * nP + (j + 1);
      const d = i * nP + (j + 1);
      if (side > 0) {
        indices.push(a, b, d, b, c, d);
      } else {
        indices.push(a, d, b, b, d, c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Dense longitudinal stations concentrating smoothly around nose, arches, and tail
function buildBodyZStations() {
  const zs = [];
  const addRange = (zStart, zEnd, step) => {
    for (let z = zStart; z > zEnd + 1e-5; z -= step) {
      zs.push(Number(z.toFixed(4)));
    }
  };
  addRange(2.49, 1.94, 0.045);
  addRange(1.94, 1.06, 0.028); // Dense circular front arch
  addRange(1.06, -1.06, 0.085);
  addRange(-1.06, -1.94, 0.028); // Dense circular rear arch
  addRange(-1.94, -2.42, 0.045);
  zs.push(-2.44);
  return zs;
}

// Smooth 13-point SU7 Ultra cross-section sampler (low shark nose, sculpted flanks, widebody rear haunches)
function sampleSU7LowerBody(z) {
  const noseTaper = smoothStepNum(2.50, 1.82, z); // 0 at tip, 1 by front axle
  const tailTaper = smoothStepNum(-2.46, -1.72, z); // 0 at tail, 1 by rear haunch
  const frontFlare = Math.exp(-Math.pow((z - 1.50) / 0.34, 2)) * 0.032;
  const rearHaunch = Math.exp(-Math.pow((z + 1.44) / 0.54, 2)) * 0.058;
  const doorWaistPinch = Math.exp(-Math.pow((z - 0.04) / 0.65, 2)) * 0.024;

  const halfWMax =
    (0.62 + 0.325 * noseTaper) * (0.81 + 0.19 * tailTaper) +
    frontFlare +
    rearHaunch -
    doorWaistPinch;

  // Bottom sill height lifts cleanly at front nose (exposing 3-bay aero mouth) and at rear diffuser
  let ySill = 0.148;
  if (z > 1.96) {
    ySill = 0.148 + smoothStepNum(1.96, 2.49, z) * 0.218; // rises cleanly to 0.366 at nose bridge
  }
  if (z < -1.94) {
    ySill = 0.148 + smoothStepNum(-1.94, -2.44, z) * 0.205; // lifts to 0.353 above rear twin-arch diffuser
  }

  // Beltline / fender shoulder height
  let yBelt = 0.875;
  if (z >= 0.88) {
    const t = (z - 0.88) / (2.49 - 0.88);
    yBelt = 0.875 - 0.395 * Math.pow(t, 1.38); // drops smoothly to 0.48 at nose
  } else if (z >= -1.08) {
    const t = (0.88 - z) / 1.96;
    yBelt = 0.875 + 0.095 * smoothStepNum(0, 1, t);
  } else {
    const t = (-1.08 - z) / 1.36;
    yBelt = 0.970 + Math.sin(t * Math.PI * 0.5) * 0.028 - t * 0.032;
  }

  // Circular wheel-arch cutouts (R = 0.402 front, 0.405 rear)
  let archCutY = ySill;
  let archOutFlare = 0;
  const fDist = Math.abs(z - 1.50);
  if (fDist < 0.402) {
    const h = 0.360 + Math.sqrt(Math.max(0, 0.402 * 0.402 - fDist * fDist));
    archCutY = Math.max(archCutY, h);
    archOutFlare = 0.016 * (1 - fDist / 0.402);
  }
  const rDist = Math.abs(z + 1.50);
  if (rDist < 0.405) {
    const h = 0.360 + Math.sqrt(Math.max(0, 0.405 * 0.405 - rDist * rDist));
    archCutY = Math.max(archCutY, h);
    archOutFlare = 0.020 * (1 - rDist / 0.405);
  }

  // Crown inner edge where hood / greenhouse / trunk deck meet side fenders
  let xInner = halfWMax * 0.72;
  let yCrown = yBelt + 0.032;
  if (z > 0.88) {
    // Muscular raised front fender ridges flanking lower clamshell hood
    const t = (z - 0.88) / (2.49 - 0.88);
    xInner = (0.635 - 0.255 * Math.pow(t, 1.15)) * (0.88 + 0.12 * noseTaper);
    const fenderCrest = Math.exp(-Math.pow((z - 1.50) / 0.45, 2)) * 0.026;
    yCrown = yBelt + 0.024 * (1 - t) + fenderCrest;
  } else if (z >= -1.94) {
    // Cabin beltline ledge tucking seamlessly under side glass & C-pillar
    xInner = halfWMax * 0.775;
    yCrown = yBelt + 0.018;
  } else {
    // Rear trunk decklid & ducktail lip across x = 0
    xInner = 0.0;
    const t = (-1.94 - z) / 0.50;
    const ducktail = Math.exp(-Math.pow((z + 2.38) / 0.10, 2)) * 0.018;
    yCrown = 0.995 - 0.042 * t + ducktail;
  }

  const xLow = halfWMax * 0.87 + archOutFlare;
  const xMid = halfWMax + archOutFlare;
  const xHip = halfWMax * 0.962 + archOutFlare * 0.5;
  // Subtle Porsche/SU7 lower door sculptural undercut between axles
  const doorUndercut = smoothStepNum(1.16, 0.70, z) * smoothStepNum(-1.16, -0.70, z) * 0.014;

  const y0 = archCutY;
  const yB = yBelt;
  const pts = [];
  const N = 12; // 13 smooth cross-section points per station
  for (let k = 0; k <= N; k++) {
    const u = k / N;
    let x, y;
    if (u <= 0.12) {
      // Under-sill tuck
      const f = u / 0.12;
      x = (xLow - 0.045) + 0.045 * f;
      y = y0 + 0.012 * f;
    } else if (u <= 0.65) {
      // Smooth sculpted lower rocker -> convex mid-body flank
      const f = (u - 0.12) / 0.53;
      const swell = Math.sin(f * Math.PI * 0.5);
      const undercut = Math.sin(f * Math.PI) * doorUndercut;
      x = xLow + (xMid - xLow) * swell - undercut - (f > 0.7 ? (f - 0.7) * 0.08 * (xMid - xHip) : 0);
      y = (y0 + 0.012) + (yB - (y0 + 0.012)) * Math.pow(f, 0.92);
    } else {
      // Smooth rounded fender shoulder curving inward to crown edge
      const f = (u - 0.65) / 0.35;
      const xStart = xMid * 0.975 - (xMid * 0.975 - xHip) * 0.5;
      x = xStart + (xInner - xStart) * (1 - Math.cos(f * Math.PI * 0.5));
      y = yB + (yCrown - yB) * Math.sin(f * Math.PI * 0.5) + Math.sin(f * Math.PI) * 0.014;
    }
    pts.push([x, y]);
  }

  return { z, pts };
}

// Smoothly cap rounded shark-nose front bridge & sculpted rear tail fascia
function buildEndBumperFascia(stations, isFront) {
  const st = isFront ? stations[0] : stations[stations.length - 1];
  const zEnd = isFront ? st.z + 0.045 : st.z - 0.040;
  const s0 = { z: st.z, pts: st.pts.map(([x, y]) => [x, y]) };
  const sMid = {
    z: (st.z + zEnd) * 0.52,
    pts: st.pts.map(([x, y], j) => [
      x * 0.65,
      isFront ? y - (j >= 8 ? 0.025 : 0.005) : y - (j < 2 ? 0.01 : 0),
    ]),
  };
  const sTip = {
    z: zEnd,
    pts: st.pts.map(([, y], j) => [
      0,
      isFront ? y - (j >= 8 ? 0.055 : 0.012) : y - (j < 3 ? 0.02 : 0.005),
    ]),
  };
  const ordered = isFront ? [sTip, sMid, s0] : [s0, sMid, sTip];
  return buildSymmetricLoftGeometry(ordered, { mirror: true });
}

// Body-colored clamshell hood with optional twin deep sculpted aero ducts
function buildHoodGeometry(withDucts) {
  const zs = [];
  for (let z = 2.46; z >= 0.88; z -= 0.045) zs.push(Number(z.toFixed(4)));
  const stations = zs.map((z) => {
    const t = (z - 0.88) / (2.46 - 0.88);
    const bodySt = sampleSU7LowerBody(Math.min(2.49, z));
    const crownPt = bodySt.pts[bodySt.pts.length - 1];
    const edgeW = crownPt[0] + 0.012; // 1.2cm tucked under fender crest for seamless shut-line
    const yEdge = crownPt[1] - 0.005;
    // Lower sleek hood center between raised muscular front fenders
    const yCenter = yEdge + 0.018 * (1 - t * 0.45) - 0.012 * Math.sin(t * Math.PI);

    const pts = [];
    const steps = 14;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps; // 0 = outer edge, 1 = x=0
      const x = edgeW * (1 - f);
      let y = yEdge + (yCenter - yEdge) * Math.sin(f * Math.PI * 0.5);
      // Slight sculpted hood character dome in center
      y += 0.012 * Math.exp(-Math.pow(x / 0.14, 2)) * (1 - t * 0.35);
      if (withDucts) {
        // Twin sunken open-hood air extractor scoops (matching photo_07 & photo_08)
        const zDuct = Math.exp(-Math.pow((z - 1.74) / 0.25, 2));
        const xDuct = Math.exp(-Math.pow((x - 0.225) / 0.088, 2));
        y -= 0.056 * zDuct * xDuct;
      }
      pts.push([x, y]);
    }
    return { z, pts };
  });
  return buildSymmetricLoftGeometry(stations, { mirror: true });
}

// Authentic Coupe Greenhouse: Dark Panoramic Glass Roof + Body-Colored A-Pillars/Roof-Arch/Wide C-Pillars + Almond Side Windows
function buildCanopyParts(mats) {
  const group = new THREE.Group();
  group.name = 'CanopyGroup';
  group.userData.explodeOffset = new THREE.Vector3(0, 1.05, -0.05);
  group.userData.isExterior = true;

  const canopyZ = [];
  for (let z = 0.88; z >= -1.96; z -= 0.065) canopyZ.push(Number(z.toFixed(4)));

  function sampleRoofY(z) {
    if (z > 0.22) {
      const u = (0.88 - z) / 0.66;
      return 0.875 + 0.555 * Math.pow(u, 0.78);
    }
    if (z >= -0.45) {
      const u = (z + 0.11) / 0.34;
      return 1.458 - 0.032 * u * u;
    }
    const u = (-0.45 - z) / 1.51;
    return 1.428 - 0.433 * Math.pow(u, 1.30);
  }

  // Inner glass edge width (narrower than side DLO outer edge so painted roof arch & wide C-pillars sit cleanly!)
  function sampleGlassHalfW(z) {
    if (z > 0.22) {
      const u = (0.88 - z) / 0.66;
      return 0.65 - 0.13 * u;
    }
    if (z >= -0.55) {
      return 0.52 - 0.03 * Math.pow((z + 0.15) / 0.40, 2);
    }
    const u = (-0.55 - z) / 1.41;
    return 0.505 - 0.135 * Math.pow(u, 1.15);
  }

  // Outer edge of painted roof arch / C-pillar buttresses (smoothly hugs almond side window with zero gap!)
  function sampleArchOuterW(z) {
    const gw = sampleGlassHalfW(z);
    if (z > 0.22) return gw + 0.055; // sleek painted A-pillar
    if (z >= -0.80) return gw + 0.075; // side roof arch rail
    // Widens smoothly behind rear door into muscular C-pillar fastback buttress by z = -1.40
    const u = clampNum((-0.80 - z) / 0.62, 0, 1);
    const bodySt = sampleSU7LowerBody(z);
    const bodyShoulderX = bodySt.pts[bodySt.pts.length - 1][0] || 0.72;
    return gw + 0.075 + (Math.max(0.32, bodyShoulderX * 0.80 - gw)) * smoothStepNum(0, 1, u);
  }

  function sampleArchOuterY(z) {
    const ry = sampleRoofY(z);
    if (z >= -0.80) return ry - 0.032;
    const u = clampNum((-0.80 - z) / 0.62, 0, 1);
    const bodySt = sampleSU7LowerBody(z);
    const bodyShoulderY = bodySt.pts[9][1];
    return (ry - 0.032) * (1 - smoothStepNum(0, 1, u)) + (bodyShoulderY + 0.004) * smoothStepNum(0, 1, u);
  }

  // 1. Continuous Center Panoramic Dark Glass (Windshield + Glass Roof + Fastback Backlight)
  const glassStations = canopyZ.map((z) => {
    const yTop = sampleRoofY(z);
    const wGlass = sampleGlassHalfW(z);
    return {
      z,
      pts: [
        [wGlass, yTop - 0.018],
        [wGlass * 0.66, yTop - 0.005],
        [wGlass * 0.33, yTop - 0.001],
        [0, yTop],
      ],
    };
  });
  const glassCanopyMesh = new THREE.Mesh(buildSymmetricLoftGeometry(glassStations), mats.cabinGlass);
  glassCanopyMesh.name = 'PanoramicGlassCanopy';
  glassCanopyMesh.userData.isExterior = true;
  group.add(glassCanopyMesh);

  // 2. Painted Body-Colored A-Pillars, Roof Cantrail Arch & Wide Fastback C-Pillar Buttresses
  const archStations = canopyZ.map((z) => {
    const yTop = sampleRoofY(z);
    const wIn = sampleGlassHalfW(z) - 0.008; // 8mm overlap over glass edge
    const wOut = sampleArchOuterW(z);
    const yOut = sampleArchOuterY(z);
    return {
      z,
      pts: [
        [wOut, yOut],
        [(wOut + wIn) * 0.5, (yOut + yTop - 0.010) * 0.5 + 0.008],
        [wIn, yTop - 0.015],
      ],
    };
  });
  const paintedArchMesh = new THREE.Mesh(buildSymmetricLoftGeometry(archStations), mats.bodyPaint);
  paintedArchMesh.name = 'PaintedRoofArchAndCPillars';
  paintedArchMesh.castShadow = true;
  paintedArchMesh.receiveShadow = true;
  paintedArchMesh.userData.isExterior = true;
  group.add(paintedArchMesh);

  // 3. Almond / Teardrop Side Windows (DLO z = +0.76 to -1.36)
  const sideWinZ = [];
  for (let z = 0.76; z >= -1.36; z -= 0.06) sideWinZ.push(Number(z.toFixed(4)));
  const sideWinStations = sideWinZ.map((z) => {
    const bodySt = sampleSU7LowerBody(z);
    const beltPt = bodySt.pts[bodySt.pts.length - 1];
    const yBottom = beltPt[1] - 0.006;
    const xBottom = beltPt[0] - 0.012;
    const frontPinch = smoothStepNum(0.32, 0.76, z);
    const yArch = sampleArchOuterY(z) + 0.010;
    const yTop = Math.max(yBottom + 0.014, yArch * (1 - frontPinch * 0.45) + (yBottom + 0.018) * (frontPinch * 0.45));
    const xTop = sampleArchOuterW(z) - 0.006;
    return {
      z,
      pts: [
        [xBottom, yBottom],
        [(xBottom + xTop) * 0.53, (yBottom + yTop) * 0.5 + 0.012],
        [xTop, yTop],
      ],
    };
  });
  const sideWinMesh = new THREE.Mesh(buildSymmetricLoftGeometry(sideWinStations), mats.cabinGlass);
  sideWinMesh.name = 'AlmondSideWindows';
  sideWinMesh.userData.isExterior = true;
  group.add(sideWinMesh);

  // Gloss-Black DLO Window Perimeter Trim + B-Pillar + Rear Quarter Divider Bar
  for (const side of [1, -1]) {
    const upperPts = sideWinStations.map((st) => new THREE.Vector3(side * (st.pts[2][0] + 0.004), st.pts[2][1], st.z));
    const lowerPts = sideWinStations.slice().reverse().map((st) => new THREE.Vector3(side * (st.pts[0][0] + 0.006), st.pts[0][1] + 0.004, st.z));
    const dloLoop = new THREE.CatmullRomCurve3([...upperPts, ...lowerPts], true);
    const dloTrim = new THREE.Mesh(new THREE.TubeGeometry(dloLoop, 72, 0.013, 7, true), mats.glossBlack);
    dloTrim.userData.isExterior = true;
    group.add(dloTrim);

    // Gloss-Black B-Pillar
    const bGeo = new RoundedBoxGeometry(0.020, 0.44, 0.095, 2, 0.006);
    const bMesh = new THREE.Mesh(bGeo, mats.glossBlack);
    bMesh.position.set(side * 0.70, 1.155, -0.04);
    bMesh.rotation.z = side * 0.36;
    bMesh.userData.isExterior = true;
    group.add(bMesh);

    // Rear Quarter Window Divider Bar
    const qGeo = new RoundedBoxGeometry(0.018, 0.25, 0.035, 2, 0.005);
    const qMesh = new THREE.Mesh(qGeo, mats.glossBlack);
    qMesh.position.set(side * 0.72, 1.07, -0.88);
    qMesh.rotation.z = side * 0.42;
    qMesh.rotation.x = 0.28;
    qMesh.userData.isExterior = true;
    group.add(qMesh);

    // Windshield wiper blade at cowl base
    const wiper = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.014, 0.022, 1, 0.004), mats.glossBlack);
    wiper.position.set(side * 0.28, 0.875, 0.88);
    wiper.rotation.y = side * -0.14;
    wiper.userData.isExterior = true;
    group.add(wiper);
  }

  // Sculpted Roof LiDAR Pebble Pod above windshield header + Rear Roof Camera Fin
  const lidarPod = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.048, 0.145, 4, 0.020), mats.glossBlack);
  lidarPod.position.set(0, 1.448, 0.24);
  lidarPod.rotation.x = 0.09;
  lidarPod.castShadow = true;
  lidarPod.userData.isExterior = true;

  const lidarWindow = new THREE.Mesh(new RoundedBoxGeometry(0.185, 0.022, 0.032, 2, 0.008), mats.matteTrim);
  lidarWindow.position.set(0, 1.440, 0.305);
  lidarWindow.userData.isExterior = true;

  const rearCamFin = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.026, 0.075, 2, 0.010), mats.glossBlack);
  rearCamFin.position.set(0, 1.322, -0.96);
  rearCamFin.rotation.x = -0.25;
  rearCamFin.userData.isExterior = true;

  group.add(lidarPod, lidarWindow, rearCamFin);
  return group;
}

// Twin Center Racing Stripes (Nose -> Hood -> Trunk Decklid, skipping Glass Roof) + Side Door "Ultra" Decals
function buildRacingStripes(mats) {
  const group = new THREE.Group();
  group.name = 'RacingStripeGroup';

  const makeStripeStrip = (zFrom, zTo, halfIn, halfOut, ySampleFn) => {
    const stations = [];
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const z = zFrom + (zTo - zFrom) * (i / steps);
      const y = ySampleFn(z) + 0.0035;
      stations.push({
        z,
        pts: [
          [halfOut, y - 0.0015],
          [halfIn, y],
        ],
      });
    }
    const m = new THREE.Mesh(buildSymmetricLoftGeometry(stations, { mirror: true }), mats.stripeMat);
    m.userData.isExterior = true;
    return m;
  };

  const hoodStripeY = (z) => {
    if (z > 2.46) {
      // Front nose bridge curve
      const t = clampNum((z - 2.46) / 0.06, 0, 1);
      return 0.478 - t * 0.062;
    }
    const t = clampNum((z - 0.88) / (2.46 - 0.88), 0, 1);
    const bodySt = sampleSU7LowerBody(Math.min(2.49, z));
    const yEdge = bodySt.pts[bodySt.pts.length - 1][1] - 0.005;
    const yCenter = yEdge + 0.018 * (1 - t * 0.45) - 0.012 * Math.sin(t * Math.PI);
    return yCenter + 0.010 * (1 - t * 0.35);
  };

  const deckStripeY = (z) => {
    const t = clampNum((-1.94 - z) / 0.50, 0, 1);
    const ducktail = Math.exp(-Math.pow((z + 2.38) / 0.10, 2)) * 0.018;
    return 0.995 - 0.042 * t + ducktail;
  };

  // Twin thick stripes + thin center gap (runs on nose, hood, and rear trunk decklid — skips dark panoramic roof)
  group.add(
    makeStripeStrip(2.49, 0.92, 0.015, 0.095, hoodStripeY),
    makeStripeStrip(-1.94, -2.41, 0.015, 0.095, deckStripeY)
  );

  // Side lower-door conforming "Ultra" decal strips (+X left side and -X right side, un-mirrored!)
  const doorZs = [];
  for (let z = 0.92; z >= -0.98; z -= 0.095) doorZs.push(Number(z.toFixed(4)));
  const buildSideDecalGeo = (side) => {
    const stations = doorZs.map((z) => {
      const bodySt = sampleSU7LowerBody(z);
      // Sample side flank x around y = 0.24..0.37
      const xLow = bodySt.pts[2][0] + 0.005;
      const xHi = bodySt.pts[4][0] + 0.005;
      return {
        z,
        pts: [
          [xLow, 0.235],
          [xHi, 0.375],
        ],
      };
    });
    return buildSingleSideLoft(stations, side, (i, j, nZ) => {
      const u = side > 0 ? i / (nZ - 1) : 1 - i / (nZ - 1);
      return [u, j];
    });
  };

  const decalL = new THREE.Mesh(buildSideDecalGeo(1), mats.sideUltraDecalMat);
  decalL.userData.isExterior = true;
  const decalR = new THREE.Mesh(buildSideDecalGeo(-1), mats.sideUltraDecalRightMat);
  decalR.userData.isExterior = true;
  group.add(decalL, decalR);

  return group;
}

// Wide Contoured Teardrop "米" Matrix LED Headlights nestled flush & clearly visible on fender corners
function buildHeadlights(mats) {
  const group = new THREE.Group();
  group.name = 'HeadlightsGroup';
  group.userData.explodeOffset = new THREE.Vector3(0, 0.25, 0.42);

  for (const side of [1, -1]) {
    const unit = new THREE.Group();
    // Anchor right on outer sloped fender surface (spans x ~ 0.38..0.80, z ~ 1.98..2.35)
    unit.position.set(side * 0.585, 0.594, 2.185);
    unit.rotation.y = side * 0.43;
    unit.rotation.x = 0.29;
    unit.rotation.z = side * -0.10;

    // Teardrop footprint extruded along local Z (thick enough to sit cleanly proud of fender surface)
    const shape = new THREE.Shape();
    shape.moveTo(-0.21, -0.012); // pointed inner nose tip
    shape.quadraticCurveTo(-0.08, 0.052, 0.16, 0.060);
    shape.quadraticCurveTo(0.225, 0.060, 0.225, 0.0);
    shape.quadraticCurveTo(0.225, -0.056, 0.14, -0.056);
    shape.quadraticCurveTo(-0.06, -0.050, -0.21, -0.012);

    const bucketGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.085,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 2,
    });
    bucketGeo.translate(0, 0, -0.045);
    if (side < 0) bucketGeo.scale(-1, 1, 1);

    const bucket = new THREE.Mesh(bucketGeo, mats.glossBlack);
    bucket.userData.isExterior = true;
    unit.add(bucket);

    // Signature full-width glowing white horizontal "米" DRL light bar
    const drlBar = new THREE.Mesh(
      new RoundedBoxGeometry(0.36, 0.012, 0.018, 2, 0.004),
      mats.drlLed
    );
    drlBar.position.set(side * 0.01, -0.002, 0.044);
    drlBar.rotation.z = side * 0.04;
    drlBar.userData.isExterior = true;
    unit.add(drlBar);

    // Upper & Lower 2x2 Matrix LED Projector Lenses
    for (const py of [0.024, -0.024]) {
      for (const px of [0.01, 0.095]) {
        const pod = new THREE.Mesh(
          new RoundedBoxGeometry(0.058, 0.019, 0.016, 2, 0.005),
          mats.headlightBeam
        );
        pod.position.set(side * px, py, 0.041);
        pod.userData.isExterior = true;
        unit.add(pod);
      }
    }

    // Smoked-clear flush outer polycarbonate lens
    const lensGeo = bucketGeo.clone();
    lensGeo.scale(1.02, 1.02, 1.06);
    const lens = new THREE.Mesh(lensGeo, mats.headlightGlass);
    lens.position.z = 0.008;
    lens.userData.isExterior = true;
    unit.add(lens);

    group.add(unit);
  }
  return group;
}

// Signature SU7 Ultra 3-Bay Aero Front Bumper: Shovel Splitter, Twin Struts, Painted L-Fangs & Side Canards, Front Plate
function buildFrontAero(mats) {
  const group = new THREE.Group();
  group.name = 'FrontAeroGroup';
  group.userData.explodeOffset = new THREE.Vector3(0, -0.06, 0.62);

  // 1. Full-width gloss-black lower aero splitter tray (y = 0.112..0.132)
  const lipShape = new THREE.Shape();
  lipShape.moveTo(-0.88, 0);
  lipShape.lineTo(-0.87, 0.24);
  lipShape.quadraticCurveTo(-0.56, 0.44, 0, 0.46);
  lipShape.quadraticCurveTo(0.56, 0.44, 0.87, 0.24);
  lipShape.lineTo(0.88, 0);
  lipShape.closePath();

  const lipGeo = new THREE.ExtrudeGeometry(lipShape, {
    depth: 0.020,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  lipGeo.rotateX(Math.PI / 2);
  const lipMesh = new THREE.Mesh(lipGeo, mats.glossBlack);
  lipMesh.position.set(0, 0.128, 2.09);
  lipMesh.castShadow = true;
  lipMesh.receiveShadow = true;
  lipMesh.userData.isExterior = true;
  group.add(lipMesh);

  // 2. Central Satin-Gunmetal Forward Shovel Splitter & Twin Vertical Aero Struts
  const centerFloor = new THREE.Mesh(
    new RoundedBoxGeometry(0.72, 0.026, 0.34, 2, 0.008),
    mats.satinGunmetal
  );
  centerFloor.position.set(0, 0.146, 2.38);
  centerFloor.rotation.x = 0.05;
  centerFloor.castShadow = true;
  centerFloor.userData.isExterior = true;
  group.add(centerFloor);

  for (const side of [1, -1]) {
    const strut = new THREE.Mesh(
      new RoundedBoxGeometry(0.026, 0.205, 0.13, 2, 0.006),
      mats.satinGunmetal
    );
    strut.position.set(side * 0.115, 0.245, 2.44);
    strut.rotation.x = -0.24;
    strut.castShadow = true;
    strut.userData.isExterior = true;
    group.add(strut);
  }

  // Deep radiator hex grille mesh spanning behind the 3-bay intakes
  const radiatorGrille = new THREE.Mesh(
    new RoundedBoxGeometry(1.52, 0.22, 0.06, 2, 0.012),
    mats.hexMesh
  );
  radiatorGrille.position.set(0, 0.26, 2.30);
  radiatorGrille.userData.isExterior = true;
  group.add(radiatorGrille);

  // Gloss-black upper bumper mouth bridge lining
  const upperMouthTrim = new THREE.Mesh(
    new RoundedBoxGeometry(1.42, 0.055, 0.12, 2, 0.014),
    mats.glossBlack
  );
  upperMouthTrim.position.set(0, 0.365, 2.41);
  upperMouthTrim.userData.isExterior = true;
  group.add(upperMouthTrim);

  // 3. Body-Colored Sculpted Outer L-Wings, Inner Trapezoid Fangs & Side Vertical Canards
  for (const side of [1, -1]) {
    // Painted lower horizontal aero wing hugging outer intake bay
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0.35, 0);
    wingShape.lineTo(0.84, 0.14);
    wingShape.lineTo(0.86, 0.26);
    wingShape.lineTo(0.35, 0.14);
    wingShape.closePath();

    const lowerWingGeo = new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.036,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 2,
    });
    lowerWingGeo.rotateX(Math.PI / 2);
    if (side < 0) lowerWingGeo.scale(-1, 1, 1);
    const lowerWing = new THREE.Mesh(lowerWingGeo, mats.bodyPaint);
    lowerWing.position.set(0, 0.168, 2.26);
    lowerWing.castShadow = true;
    lowerWing.receiveShadow = true;
    lowerWing.userData.isExterior = true;
    group.add(lowerWing);

    // Signature body-colored inner trapezoidal fang (framing center vs outer bay)
    const fangShape = new THREE.Shape();
    fangShape.moveTo(0, 0);
    fangShape.lineTo(0.085, 0);
    fangShape.lineTo(0.042, 0.165);
    fangShape.lineTo(-0.025, 0.155);
    fangShape.closePath();
    const fangGeo = new THREE.ExtrudeGeometry(fangShape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 2,
    });
    fangGeo.translate(-0.02, 0, -0.04);
    if (side < 0) fangGeo.scale(-1, 1, 1);
    const fangMesh = new THREE.Mesh(fangGeo, mats.bodyPaint);
    fangMesh.position.set(side * 0.365, 0.155, 2.465);
    fangMesh.rotation.y = side * -0.18;
    fangMesh.rotation.x = -0.18;
    fangMesh.castShadow = true;
    fangMesh.userData.isExterior = true;
    group.add(fangMesh);

    // Tall swept body-colored vertical outer aero canard ahead of front wheel (photo_01 & photo_14)
    const canardShape = new THREE.Shape();
    canardShape.moveTo(0, 0);
    canardShape.lineTo(0.32, 0);
    canardShape.lineTo(0.33, 0.285);
    canardShape.quadraticCurveTo(0.14, 0.135, 0, 0.032);
    canardShape.closePath();
    const canardGeo = new THREE.ExtrudeGeometry(canardShape, {
      depth: 0.024,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 2,
    });
    canardGeo.translate(0, 0, -0.012);
    canardGeo.rotateY(Math.PI / 2); // profile spans along -Z/+Z! Wait: +X goes -> -Z
    const canardMesh = new THREE.Mesh(canardGeo, mats.bodyPaint);
    canardMesh.position.set(side * 0.862, 0.135, 2.28);
    canardMesh.rotation.y = side * -0.05;
    canardMesh.castShadow = true;
    canardMesh.receiveShadow = true;
    canardMesh.userData.isExterior = true;
    group.add(canardMesh);

    // Gloss-black side air-curtain recessed backing tucked deeply inside outer bumper bay (never protrudes)
    const sideIntakeBezel = new THREE.Mesh(
      new RoundedBoxGeometry(0.28, 0.12, 0.05, 2, 0.012),
      mats.glossBlack
    );
    sideIntakeBezel.position.set(side * 0.56, 0.255, 2.21);
    sideIntakeBezel.rotation.y = side * -0.46;
    sideIntakeBezel.userData.isExterior = true;
    group.add(sideIntakeBezel);
  }

  // 4. Centered "SU7 Ultra" Showroom Front Plate
  const plateHousing = new THREE.Mesh(
    new RoundedBoxGeometry(0.46, 0.115, 0.024, 2, 0.008),
    mats.glossBlack
  );
  plateHousing.position.set(0, 0.372, 2.525);
  plateHousing.rotation.x = 0.06;
  plateHousing.userData.isExterior = true;

  const plateFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.435, 0.095),
    mats.frontPlateMat
  );
  plateFace.position.set(0, 0.372, 2.538);
  plateFace.rotation.x = 0.06;
  plateFace.userData.isExterior = true;
  group.add(plateHousing, plateFace);

  return group;
}

// Smoked Clear-Lens 3D Halo Taillight + Trunk Badging + Rear Triangular Vents + Twin-Arch Body-Color/Gloss-Black Diffuser
function buildRearAero(mats) {
  const group = new THREE.Group();
  group.name = 'RearAeroGroup';
  group.userData.explodeOffset = new THREE.Vector3(0, 0.10, -0.62);

  // 1. Dark inner taillight chamber + sculpted smoked-clear outer wraparound lens (superellipse guaranteed proud of rear fascia!)
  const tailChamberPts = [];
  const haloUpperPts = [];
  const haloLowerPts = [];
  const nTail = 24;
  for (let i = 0; i <= nTail; i++) {
    const theta = -Math.PI * 0.5 + (i / nTail) * Math.PI;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const xC = 0.852 * s;
    const zC = -2.14 - 0.415 * Math.pow(Math.max(0.001, c), 0.38);
    const yC = 0.816 + 0.026 * c;
    tailChamberPts.push(new THREE.Vector3(xC, yC, zC));

    if (i >= 1 && i <= nTail - 1) {
      const xH = 0.862 * s;
      const zH = zC - 0.016;
      haloUpperPts.push(new THREE.Vector3(xH, yC + 0.024, zH));
      haloLowerPts.unshift(new THREE.Vector3(xH, yC - 0.024, zH));
    }
  }
  const chamberCurve = new THREE.CatmullRomCurve3(tailChamberPts);
  const chamber = new THREE.Mesh(new THREE.TubeGeometry(chamberCurve, 64, 0.044, 10, false), mats.glossBlack);
  chamber.scale.set(1, 0.56, 1);
  chamber.position.y = 0.834 * (1 - 0.56);
  chamber.userData.isExterior = true;
  group.add(chamber);

  const outerLens = new THREE.Mesh(new THREE.TubeGeometry(chamberCurve, 64, 0.048, 10, false), mats.taillightLens);
  outerLens.scale.set(1, 0.62, 1);
  outerLens.position.y = 0.834 * (1 - 0.62);
  outerLens.position.z = -0.008;
  outerLens.userData.isExterior = true;
  group.add(outerLens);

  // Continuous 360-degree Xiaomi Halo Red LED Ribbon along full width & wraparound tips
  const haloPts = [...haloUpperPts, ...haloLowerPts];
  const haloCurve = new THREE.CatmullRomCurve3(haloPts, true, 'catmullrom', 0.25);
  const haloLed = new THREE.Mesh(new THREE.TubeGeometry(haloCurve, 120, 0.0085, 8, true), mats.haloTailLed);
  haloLed.userData.isExterior = true;
  group.add(haloLed);

  // 2. Rear Trunk Emblems: "X I A O M I" centered above taillight, "小米" (+X left), "SU7 Ultra" (-X right)
  const xiaomiBadge = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.056), mats.rearXiaomiMat);
  xiaomiBadge.position.set(0, 0.918, -2.515);
  xiaomiBadge.rotation.y = Math.PI;
  xiaomiBadge.rotation.x = 0.14;
  xiaomiBadge.userData.isExterior = true;

  const cnBadge = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.042), mats.rearCnMat);
  cnBadge.position.set(0.45, 0.68, -2.505);
  cnBadge.rotation.y = Math.PI - 0.20;
  cnBadge.userData.isExterior = true;

  const ultraBadge = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.050), mats.rearSu7UltraMat);
  ultraBadge.position.set(-0.45, 0.68, -2.505);
  ultraBadge.rotation.y = Math.PI + 0.20;
  ultraBadge.userData.isExterior = true;
  group.add(xiaomiBadge, cnBadge, ultraBadge);

  // 3. Rear Quarter Triangular Recessed Air Vents (photo_00, photo_02, photo_13)
  for (const side of [1, -1]) {
    const triShape = new THREE.Shape();
    triShape.moveTo(0, 0);
    triShape.lineTo(0.14, -0.02);
    triShape.lineTo(0.11, 0.21);
    triShape.closePath();
    const triGeo = new THREE.ExtrudeGeometry(triShape, { depth: 0.032, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2 });
    if (side < 0) triGeo.scale(-1, 1, 1);
    const triVent = new THREE.Mesh(triGeo, mats.glossBlack);
    triVent.position.set(side * 0.745, 0.43, -2.28);
    triVent.rotation.y = side * 0.92;
    triVent.userData.isExterior = true;
    group.add(triVent);
  }

  // 4. Twin-Arch Gloss-Black + Body-Colored Rear Diffuser Assembly (photo_00, photo_02, photo_13)
  const lowerDiffuserBar = new THREE.Mesh(
    new RoundedBoxGeometry(1.54, 0.10, 0.34, 2, 0.014),
    mats.glossBlack
  );
  lowerDiffuserBar.position.set(0, 0.18, -2.36);
  lowerDiffuserBar.castShadow = true;
  lowerDiffuserBar.userData.isExterior = true;
  group.add(lowerDiffuserBar);

  // Recessed central license-plate bay
  const plateCove = new THREE.Mesh(
    new RoundedBoxGeometry(0.52, 0.21, 0.06, 2, 0.014),
    mats.matteTrim
  );
  plateCove.position.set(0, 0.31, -2.495);
  plateCove.userData.isExterior = true;
  group.add(plateCove);

  // Twin side arched gloss-black pods framing body-colored trapezoidal inserts
  for (const side of [1, -1]) {
    const archShell = new THREE.Mesh(
      new RoundedBoxGeometry(0.47, 0.30, 0.16, 3, 0.05),
      mats.glossBlack
    );
    archShell.position.set(side * 0.50, 0.29, -2.445);
    archShell.rotation.y = side * -0.22;
    archShell.castShadow = true;
    archShell.userData.isExterior = true;
    group.add(archShell);

    // Body-colored trapezoidal aero cutout inside gloss-black arch
    const paintInsert = new THREE.Mesh(
      new RoundedBoxGeometry(0.29, 0.125, 0.08, 2, 0.024),
      mats.bodyPaint
    );
    paintInsert.position.set(side * 0.50, 0.27, -2.500);
    paintInsert.rotation.y = side * -0.22;
    paintInsert.userData.isExterior = true;
    group.add(paintInsert);

    // Slim horizontal red rear reflector strip under arch
    const reflector = new THREE.Mesh(
      new RoundedBoxGeometry(0.26, 0.012, 0.02, 1, 0.004),
      mats.f1BrakeLed
    );
    reflector.position.set(side * 0.50, 0.168, -2.522);
    reflector.rotation.y = side * -0.22;
    reflector.userData.isExterior = true;
    group.add(reflector);
  }

  // Central lower carbon venturi strakes & F1 vertical brake lamp
  for (const fx of [-0.18, 0.18]) {
    const strake = new THREE.Mesh(new RoundedBoxGeometry(0.024, 0.15, 0.36, 2, 0.005), mats.carbon);
    strake.position.set(fx, 0.185, -2.38);
    strake.userData.isExterior = true;
    group.add(strake);
  }
  const f1Lamp = new THREE.Mesh(new RoundedBoxGeometry(0.036, 0.09, 0.03, 2, 0.006), mats.f1BrakeLed);
  f1Lamp.position.set(0, 0.18, -2.535);
  f1Lamp.userData.isExterior = true;
  group.add(f1Lamp);

  return group;
}

// Sleek Low-Slung Crescent Carbon GT Wing with Drooped Curved Wingtips (photo_00, photo_02, photo_13, photo_14)
function buildWingAssembly(mats) {
  const group = new THREE.Group();
  group.name = 'WingGroup';
  group.userData.explodeOffset = new THREE.Vector3(0, 0.92, -0.58);

  const gtWingGroup = new THREE.Group();
  gtWingGroup.name = 'GTWing';

  // Lofted crescent airfoil mainplane that curves rearward & droops cleanly into sculpted wingtips
  const stations = [];
  const halfSpan = 0.77;
  const nSpan = 28;
  for (let i = 0; i <= nSpan; i++) {
    const f = i / nSpan; // 0 = center, 1 = outer tip
    const x = f * halfSpan;
    // Droop downward sharply in outer 18% to form curved carbon wingtips!
    const tipDrop = Math.pow(smoothStepNum(0.78, 1.0, f), 1.6) * 0.068;
    const sweepBack = Math.pow(f, 1.8) * 0.085;
    const chord = 0.215 * (1 - Math.pow(f, 3) * 0.22);
    const yBase = 1.158 - tipDrop;
    const zCenter = -2.26 - sweepBack;
    const thick = 0.016 * (1 - Math.pow(f, 3) * 0.35);

    // Closed airfoil cross-section in YZ at station x (Note: we build custom mesh or use Tube/Extrude)
    stations.push({ x, yBase, zCenter, chord, thick });
  }

  // Build symmetric curved wing mesh cleanly via stations across x = -0.77..+0.77
  const fullStations = [];
  for (let i = nSpan; i >= 1; i--) {
    const s = stations[i];
    fullStations.push({ ...s, x: -s.x });
  }
  for (let i = 0; i <= nSpan; i++) {
    fullStations.push(stations[i]);
  }

  const profSegs = 12;
  const positions = new Float32Array(fullStations.length * profSegs * 3);
  const uvs = new Float32Array(fullStations.length * profSegs * 2);
  const indices = [];

  for (let i = 0; i < fullStations.length; i++) {
    const s = fullStations[i];
    for (let j = 0; j < profSegs; j++) {
      const a = (j / profSegs) * Math.PI * 2;
      // Airfoil loop around chord
      const zOff = Math.cos(a) * (s.chord * 0.5);
      const camber = -0.012 * (1 - Math.cos(a) * Math.cos(a));
      const yOff = Math.sin(a) * s.thick + camber + zOff * -0.11; // negative AoA downforce tilt!
      const idx = i * profSegs + j;
      positions[idx * 3] = s.x;
      positions[idx * 3 + 1] = s.yBase + yOff;
      positions[idx * 3 + 2] = s.zCenter + zOff;
      uvs[idx * 2] = (s.x + halfSpan) * 1.4;
      uvs[idx * 2 + 1] = j / profSegs;
    }
  }
  for (let i = 0; i < fullStations.length - 1; i++) {
    for (let j = 0; j < profSegs; j++) {
      const jNext = (j + 1) % profSegs;
      const a = i * profSegs + j;
      const b = (i + 1) * profSegs + j;
      const c = (i + 1) * profSegs + jNext;
      const d = i * profSegs + jNext;
      indices.push(a, b, d, b, c, d);
    }
  }

  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  wingGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  wingGeo.setIndex(indices);
  wingGeo.computeVertexNormals();

  const foilMesh = new THREE.Mesh(wingGeo, mats.carbon);
  foilMesh.castShadow = true;
  foilMesh.receiveShadow = true;
  foilMesh.userData.isExterior = true;
  gtWingGroup.add(foilMesh);

  // Twin compact angled black V-strut pedestals supporting underside of GT wing (photo_00 & photo_02)
  for (const side of [1, -1]) {
    const legF = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.18, 0.042, 2, 0.005), mats.glossBlack);
    legF.position.set(side * 0.25, 1.075, -2.19);
    legF.rotation.x = -0.34;
    legF.userData.isExterior = true;

    const legR = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.18, 0.042, 2, 0.005), mats.glossBlack);
    legR.position.set(side * 0.25, 1.075, -2.29);
    legR.rotation.x = 0.26;
    legR.userData.isExterior = true;
    gtWingGroup.add(legF, legR);
  }

  // Mode B: Sleek Active Street Spoiler
  const activeWingGroup = new THREE.Group();
  activeWingGroup.name = 'ActiveSpoiler';
  activeWingGroup.visible = false;
  const activeBlade = new THREE.Mesh(
    new RoundedBoxGeometry(1.36, 0.024, 0.16, 3, 0.008),
    mats.carbon
  );
  activeBlade.position.set(0, 0.975, -2.35);
  activeBlade.castShadow = true;
  activeBlade.userData.isExterior = true;
  activeWingGroup.add(activeBlade);

  group.add(gtWingGroup, activeWingGroup);
  return { group, gtWingGroup, activeWingGroup, activeBlade };
}

// Sculpted Gloss-Black Rocker Skirts, Fender Camera Blades + U Badge, Flush Pocket Handles, Mirrors
function buildDetailsAndSideSkirts(mats) {
  const skirtsGroup = new THREE.Group();
  skirtsGroup.name = 'SideSkirtsGroup';
  skirtsGroup.userData.explodeOffset = new THREE.Vector3(0, -0.10, 0);

  for (const side of [1, -1]) {
    // Full-length contoured gloss-black rocker side skirt (photo_14)
    const skirt = new THREE.Mesh(new RoundedBoxGeometry(0.115, 0.048, 2.08, 3, 0.012), mats.glossBlack);
    skirt.position.set(side * 0.835, 0.148, 0.0);
    skirt.castShadow = true;
    skirt.userData.isExterior = true;
    skirtsGroup.add(skirt);

    // Subtle upward kick on skirt ahead of rear wheel & behind front wheel
    const frontSpats = new THREE.Mesh(new RoundedBoxGeometry(0.038, 0.09, 0.16, 2, 0.008), mats.glossBlack);
    frontSpats.position.set(side * 0.875, 0.175, 1.01);
    frontSpats.rotation.x = -0.22;
    frontSpats.userData.isExterior = true;
    skirtsGroup.add(frontSpats);

    const rearSpats = new THREE.Mesh(new RoundedBoxGeometry(0.038, 0.105, 0.18, 2, 0.008), mats.glossBlack);
    rearSpats.position.set(side * 0.885, 0.185, -0.98);
    rearSpats.rotation.x = 0.24;
    rearSpats.userData.isExterior = true;
    skirtsGroup.add(rearSpats);

    // Horizontal Gloss-Black Side Camera / Fender Garnish Blade + Small "U" Emblem (photo_01, photo_14)
    const fenderBlade = new THREE.Mesh(new RoundedBoxGeometry(0.036, 0.056, 0.24, 2, 0.012), mats.glossBlack);
    fenderBlade.position.set(side * 0.912, 0.565, 0.96);
    fenderBlade.rotation.y = side * 0.06;
    fenderBlade.userData.isExterior = true;
    skirtsGroup.add(fenderBlade);

    const uBadge = new THREE.Mesh(new RoundedBoxGeometry(0.010, 0.028, 0.028, 1, 0.003), mats.goldBadge);
    uBadge.position.set(side * 0.922, 0.625, 0.98);
    uBadge.userData.isExterior = true;
    skirtsGroup.add(uBadge);

    // Flush Body-Colored Pocket Door Handles (photo_14)
    for (const hz of [0.22, -0.68]) {
      const pocket = new THREE.Mesh(new RoundedBoxGeometry(0.018, 0.028, 0.145, 2, 0.008), mats.matteTrim);
      pocket.position.set(side * 0.915, 0.775, hz);
      pocket.userData.isExterior = true;
      skirtsGroup.add(pocket);

      const handleBar = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.016, 0.125, 2, 0.006), mats.bodyPaint);
      handleBar.position.set(side * 0.918, 0.780, hz);
      handleBar.userData.isExterior = true;
      skirtsGroup.add(handleBar);
    }

    // Sculpted Gloss-Black / Carbon Side Mirrors (photo_01, photo_14)
    const stalk = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.024, 0.044, 2, 0.008), mats.glossBlack);
    stalk.position.set(side * 0.88, 0.935, 0.64);
    stalk.rotation.z = side * 0.28;
    stalk.userData.isExterior = true;
    skirtsGroup.add(stalk);

    const cap = new THREE.Mesh(new RoundedBoxGeometry(0.165, 0.084, 0.132, 4, 0.036), mats.carbon);
    cap.position.set(side * 0.985, 0.975, 0.60);
    cap.rotation.y = side * -0.22;
    cap.castShadow = true;
    cap.userData.isExterior = true;
    skirtsGroup.add(cap);
  }

  return skirtsGroup;
}

// Two-Tone Yellow/Black Track Cabin Interior (photo_01, photo_02, photo_14)
function buildInterior(mats) {
  const group = new THREE.Group();
  group.name = 'InteriorGroup';
  group.userData.explodeOffset = new THREE.Vector3(0, 0.22, 0);

  const dash = new THREE.Mesh(new RoundedBoxGeometry(1.48, 0.22, 0.42, 4, 0.06), mats.interiorAlcantara);
  dash.position.set(0, 0.78, 0.62);
  group.add(dash);

  // Central 16.1" infotainment screen
  const screenBezel = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.22, 0.024, 2, 0.008), mats.glossBlack);
  screenBezel.position.set(0, 0.86, 0.41);
  screenBezel.rotation.x = -0.18;
  group.add(screenBezel);

  const screenPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.19), mats.screenGlow);
  screenPanel.position.set(0, 0.86, 0.397);
  screenPanel.rotation.x = -0.18;
  screenPanel.rotation.y = Math.PI;
  group.add(screenPanel);

  // Center Console Tunnel
  const consoleBox = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.26, 1.35, 3, 0.05), mats.interiorAlcantara);
  consoleBox.position.set(0, 0.45, -0.06);
  group.add(consoleBox);

  // Flat-bottom carbon steering wheel with yellow 12-o'clock stripe
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(0.36, 0.81, 0.32);
  wheelGroup.rotation.x = -0.34;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.019, 12, 36), mats.carbon);
  const topMark = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.042, 0.042), mats.seatYellowAccent);
  topMark.position.set(0, 0.165, 0);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 20), mats.interiorAlcantara);
  hub.rotation.x = Math.PI / 2;
  wheelGroup.add(rim, topMark, hub);
  group.add(wheelGroup);

  // Twin Two-Tone Yellow/Black Sport Bucket Seats (photo_01, photo_02, photo_14)
  for (const sx of [0.36, -0.36]) {
    const seat = new THREE.Group();
    seat.position.set(sx, 0.34, -0.18);

    const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.11, 0.50, 3, 0.04), mats.interiorAlcantara);
    cushion.position.set(0, 0.06, 0.10);

    const backrest = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.68, 0.10, 3, 0.045), mats.seatYellowAccent);
    backrest.position.set(0, 0.42, -0.14);
    backrest.rotation.x = -0.24;

    const centerPad = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.52, 0.04, 2, 0.02), mats.interiorAlcantara);
    centerPad.position.set(0, 0.38, -0.10);
    centerPad.rotation.x = -0.24;

    const carbonShell = new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.66, 0.04, 3, 0.02), mats.carbon);
    carbonShell.position.set(0, 0.42, -0.185);
    carbonShell.rotation.x = -0.24;

    const headrest = new THREE.Mesh(new RoundedBoxGeometry(0.20, 0.14, 0.09, 2, 0.035), mats.seatYellowAccent);
    headrest.position.set(0, 0.72, -0.21);
    headrest.rotation.x = -0.24;

    seat.add(cushion, backrest, centerPad, carbonShell, headrest);
    group.add(seat);
  }

  return group;
}

function buildCarBody(mats) {
  const root = new THREE.Group();
  root.name = 'SU7_Exterior_Root';

  // 1. Main Lower Body + Fenders + Widebody Rear Haunches + Wheelhouse Tubs
  const bodyMainGroup = new THREE.Group();
  bodyMainGroup.name = 'BodyMainGroup';
  bodyMainGroup.userData.explodeOffset = new THREE.Vector3(0, 0.48, 0);

  const zList = buildBodyZStations();
  const bodyStations = zList.map((z) => sampleSU7LowerBody(z));
  const bodyMesh = new THREE.Mesh(buildSymmetricLoftGeometry(bodyStations), mats.bodyPaint);
  bodyMesh.name = 'LowerBodyShell';
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.userData.isExterior = true;

  const frontBumperMesh = new THREE.Mesh(buildEndBumperFascia(bodyStations, true), mats.bodyPaint);
  frontBumperMesh.name = 'FrontBumperFascia';
  frontBumperMesh.castShadow = true;
  frontBumperMesh.receiveShadow = true;
  frontBumperMesh.userData.isExterior = true;

  const rearBumperMesh = new THREE.Mesh(buildEndBumperFascia(bodyStations, false), mats.bodyPaint);
  rearBumperMesh.name = 'RearBumperFascia';
  rearBumperMesh.castShadow = true;
  rearBumperMesh.receiveShadow = true;
  rearBumperMesh.userData.isExterior = true;

  bodyMainGroup.add(bodyMesh, frontBumperMesh, rearBumperMesh);

  // Dark inner wheelhouse liner tubs (so wheel wells are deep & light-tight)
  const wheelSpots = [
    { x: 0.74, z: 1.50, r: 0.398 },
    { x: -0.74, z: 1.50, r: 0.398 },
    { x: 0.74, z: -1.50, r: 0.402 },
    { x: -0.74, z: -1.50, r: 0.402 },
  ];
  for (const ws of wheelSpots) {
    const archTub = new THREE.Mesh(
      new THREE.CylinderGeometry(ws.r, ws.r, 0.34, 28, 1, true, 0, Math.PI),
      mats.matteTrim
    );
    archTub.rotation.z = Math.PI / 2;
    archTub.rotation.x = Math.PI / 2;
    archTub.position.set(ws.x, 0.360, ws.z);
    archTub.userData.isExterior = true;
    bodyMainGroup.add(archTub);
  }

  // 2. Body-Colored Clamshell Hood + Sunken Dual-Duct Open Scoops
  const hoodGroup = new THREE.Group();
  hoodGroup.name = 'HoodGroup';
  hoodGroup.userData.explodeOffset = new THREE.Vector3(0, 0.72, 0.45);

  const hoodStdMesh = new THREE.Mesh(buildHoodGeometry(false), mats.bodyPaint);
  hoodStdMesh.name = 'HoodStandard';
  hoodStdMesh.castShadow = true;
  hoodStdMesh.receiveShadow = true;
  hoodStdMesh.userData.isExterior = true;
  hoodStdMesh.visible = false;

  const hoodCarbonGroup = new THREE.Group();
  hoodCarbonGroup.name = 'HoodDualDuctPainted';
  // Outer hood surface stays body-colored (matching photo_07 & photo_08), with dark carbon/mesh duct floors!
  const hoodDuctBodyMesh = new THREE.Mesh(buildHoodGeometry(true), mats.bodyPaint);
  hoodDuctBodyMesh.castShadow = true;
  hoodDuctBodyMesh.receiveShadow = true;
  hoodDuctBodyMesh.userData.isExterior = true;
  hoodCarbonGroup.add(hoodDuctBodyMesh);

  for (const side of [1, -1]) {
    const ductGrid = new THREE.Mesh(new RoundedBoxGeometry(0.145, 0.022, 0.34, 2, 0.008), mats.carbon);
    ductGrid.position.set(side * 0.225, 0.684, 1.74);
    ductGrid.rotation.x = 0.28;
    ductGrid.userData.isExterior = true;
    hoodCarbonGroup.add(ductGrid);

    const innerMesh = new THREE.Mesh(new RoundedBoxGeometry(0.125, 0.024, 0.28, 1, 0.005), mats.hexMesh);
    innerMesh.position.set(side * 0.225, 0.686, 1.74);
    innerMesh.rotation.x = 0.28;
    innerMesh.userData.isExterior = true;
    hoodCarbonGroup.add(innerMesh);
  }

  // Thin U-shaped clamshell hood shut-line trim + Carbon/Gold "MI" Nose Squircle Emblem
  const shutPts = [
    new THREE.Vector3(-0.56, 0.81, 1.10),
    new THREE.Vector3(-0.48, 0.69, 1.78),
    new THREE.Vector3(-0.34, 0.57, 2.26),
    new THREE.Vector3(0, 0.532, 2.33),
    new THREE.Vector3(0.34, 0.57, 2.26),
    new THREE.Vector3(0.48, 0.69, 1.78),
    new THREE.Vector3(0.56, 0.81, 1.10),
  ];
  const shutCurve = new THREE.CatmullRomCurve3(shutPts);
  const shutLine = new THREE.Mesh(new THREE.TubeGeometry(shutCurve, 48, 0.0035, 6, false), mats.matteTrim);
  shutLine.userData.isExterior = true;

  const noseBadge = new THREE.Mesh(new RoundedBoxGeometry(0.062, 0.010, 0.062, 3, 0.014), mats.miBadgeMat);
  noseBadge.position.set(0, 0.533, 2.355);
  noseBadge.rotation.x = 0.30;
  noseBadge.userData.isExterior = true;

  hoodGroup.add(hoodStdMesh, hoodCarbonGroup, shutLine, noseBadge);

  // 3. Canopy, Stripes, Aero, Lights, Side Skirts, Interior
  const canopyGroup = buildCanopyParts(mats);
  const racingStripeGroup = buildRacingStripes(mats);
  const frontAeroGroup = buildFrontAero(mats);
  const headlightsGroup = buildHeadlights(mats);
  const rearAeroGroup = buildRearAero(mats);
  const wingCtrl = buildWingAssembly(mats);
  const sideSkirtsGroup = buildDetailsAndSideSkirts(mats);
  const interiorGroup = buildInterior(mats);

  root.add(
    bodyMainGroup,
    hoodGroup,
    canopyGroup,
    racingStripeGroup,
    frontAeroGroup,
    headlightsGroup,
    rearAeroGroup,
    wingCtrl.group,
    sideSkirtsGroup,
    interiorGroup
  );

  // Collect all exterior meshes for clean X-Ray material swapping
  const exteriorMeshEntries = [];
  root.traverse((obj) => {
    if (obj.isMesh && obj.userData.isExterior) {
      exteriorMeshEntries.push({
        mesh: obj,
        origMat: obj.material,
        isGlass: obj.material === mats.cabinGlass || obj.material === mats.headlightGlass || obj.material === mats.taillightLens,
      });
    }
  });

  const explodeGroups = [
    bodyMainGroup,
    hoodGroup,
    canopyGroup,
    frontAeroGroup,
    headlightsGroup,
    rearAeroGroup,
    wingCtrl.group,
    sideSkirtsGroup,
    interiorGroup,
  ];
  for (const g of explodeGroups) {
    g.userData.basePos = g.position.clone();
  }

  return {
    root,
    explodeGroups,
    exteriorMeshEntries,
    setHoodCarbon(enabled) {
      hoodCarbonGroup.visible = enabled;
      hoodStdMesh.visible = !enabled;
    },
    setRacingStripe(enabled) {
      racingStripeGroup.visible = enabled;
    },
    setWingMode(isGT) {
      wingCtrl.gtWingGroup.visible = isGT;
      wingCtrl.activeWingGroup.visible = !isGT;
    },
    updateActiveSpoiler(speedKmh) {
      if (!wingCtrl.activeWingGroup.visible) return;
      const deploy = clampNum((speedKmh - 90) / 80, 0, 1);
      wingCtrl.activeBlade.position.y = 0.975 + deploy * 0.085;
      wingCtrl.activeBlade.rotation.x = -deploy * 0.22;
    },
    setLightsOn(on) {
      mats.drlLed.emissiveIntensity = on ? 3.2 : 0.08;
      mats.headlightBeam.emissiveIntensity = on ? 2.5 : 0.04;
      mats.haloTailLed.emissiveIntensity = on ? 3.6 : 0.1;
      mats.f1BrakeLed.emissiveIntensity = on ? 3.2 : 0.05;
    },
  };
}
