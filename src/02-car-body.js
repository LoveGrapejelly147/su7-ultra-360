// Parametric surface lofting & exterior body assembly for Xiaomi SU7 Ultra
// Frame: Y-up, +Z = Front, -Z = Rear, floor at y = 0
// Dimensions: Length 5.115 m, Width 1.970 m, Height 1.465 m, Wheelbase 3.000 m

function clampNum(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function smoothStepNum(edge0, edge1, x) {
  const t = clampNum((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Build symmetric left (+X) & right (-X) lofted meshes from an array of stations:
// stations = [{ z, pts: [[x, y], ...] }] ordered FRONT (+Z) -> REAR (-Z)
// Each station's pts must be ordered from LOWER/OUTER edge -> UPPER/INNER centerline (x >= 0)
function buildSymmetricLoftGeometry(stations, { mirror = true } = {}) {
  const nZ = stations.length;
  const nP = stations[0].pts.length;
  const vertCountPerSide = nZ * nP;
  const sideCount = mirror ? 2 : 1;

  const positions = new Float32Array(vertCountPerSide * sideCount * 3);
  const uvs = new Float32Array(vertCountPerSide * sideCount * 2);
  const indices = [];

  // +X side vertices
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

  // +X triangles: stations front->rear (-Z), pts bottom->top (+Y/inward -X) => outward normal
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
    // Reversed winding for -X side so normals face outward
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

// Create dense z-sampling list concentrating around wheel arches (z = +1.50 & -1.50)
function buildBodyZStations() {
  const zs = [];
  const addRange = (zStart, zEnd, step) => {
    for (let z = zStart; z > zEnd + 1e-5; z -= step) {
      zs.push(Number(z.toFixed(4)));
    }
  };
  addRange(2.47, 1.94, 0.065);
  addRange(1.94, 1.06, 0.032); // Dense across front wheel arch
  addRange(1.06, -1.06, 0.12);
  addRange(-1.06, -1.94, 0.032); // Dense across rear wheel arch
  addRange(-1.94, -2.44, 0.065);
  zs.push(-2.46);
  return zs;
}

// Continuous SU7 Ultra body cross-section sampler (lower body + fenders + rear deck)
function sampleSU7LowerBody(z) {
  // Half-width profile along car length
  const noseTaper = smoothStepNum(2.48, 1.85, z); // 0 at tip, 1 by front wheel
  const tailTaper = smoothStepNum(-2.48, -1.78, z); // 0 at tail, 1 by rear haunch
  const frontFlare = Math.exp(-Math.pow((z - 1.50) / 0.36, 2)) * 0.028;
  const rearHaunch = Math.exp(-Math.pow((z + 1.44) / 0.56, 2)) * 0.052;
  const doorWaistPinch = Math.exp(-Math.pow((z - 0.05) / 0.68, 2)) * 0.022;

  const halfWMax =
    (0.66 + 0.285 * noseTaper) * (0.83 + 0.17 * tailTaper) +
    frontFlare +
    rearHaunch -
    doorWaistPinch;

  // Bottom sill height
  let ySill = 0.145;
  if (z > 2.05) ySill = 0.145 + smoothStepNum(2.05, 2.48, z) * 0.045;
  if (z < -1.95) ySill = 0.145 + smoothStepNum(-1.95, -2.46, z) * 0.165;

  // Beltline / shoulder height (SU7 rises toward rear wide haunch)
  let yBelt = 0.875;
  if (z >= 0.90) {
    // Sloping front fenders toward nose
    const t = (z - 0.90) / (2.47 - 0.90);
    yBelt = 0.875 - 0.375 * Math.pow(t, 1.35);
  } else if (z >= -1.10) {
    // Sleek rising waist line across doors
    const t = (0.90 - z) / 2.00;
    yBelt = 0.875 + 0.095 * smoothStepNum(0, 1, t);
  } else {
    // Muscular rear shoulder tapering slightly to rear halo tail
    const t = (-1.10 - z) / 1.36;
    yBelt = 0.970 + Math.sin(t * Math.PI * 0.5) * 0.032 - t * 0.035;
  }

  // Wheel-arch cutout calculation
  let archCutY = ySill;
  let archOutFlare = 0;
  const fDist = Math.abs(z - 1.50);
  if (fDist < 0.405) {
    const h = 0.360 + Math.sqrt(Math.max(0, 0.405 * 0.405 - fDist * fDist));
    archCutY = Math.max(archCutY, h);
    archOutFlare = 0.014 * (1 - fDist / 0.405);
  }
  const rDist = Math.abs(z + 1.50);
  if (rDist < 0.408) {
    const h = 0.360 + Math.sqrt(Math.max(0, 0.408 * 0.408 - rDist * rDist));
    archCutY = Math.max(archCutY, h);
    archOutFlare = 0.018 * (1 - rDist / 0.408);
  }

  // Crown inner edge where greenhouse or hood meets body flank
  let xInner = halfWMax * 0.68;
  let yCrown = yBelt + 0.03;
  if (z > 0.90) {
    // Front fenders frame the central clamshell hood at x ~ 0.56..0.44
    const t = (z - 0.90) / 1.57;
    xInner = (0.64 - 0.16 * t) * (0.88 + 0.12 * noseTaper);
    yCrown = yBelt + 0.025 * (1 - t);
  } else if (z >= -1.85) {
    // Cabin beltline shelf tucking under side glass
    xInner = halfWMax * 0.785;
    yCrown = yBelt + 0.02;
  } else {
    // Rear decklid spans all the way to x = 0
    xInner = 0.0;
    const t = (-1.85 - z) / 0.61;
    yCrown = 1.028 - 0.022 * t + Math.exp(-Math.pow((z + 2.34) / 0.12, 2)) * 0.015;
  }

  const xLow = halfWMax * 0.90 + archOutFlare;
  const xMid = halfWMax + archOutFlare;
  const xHip = halfWMax * 0.965 + archOutFlare * 0.5;

  const y1 = archCutY;
  const y2 = y1 + (yBelt - y1) * 0.30;
  const y3 = y1 + (yBelt - y1) * 0.68;
  const y4 = yBelt;

  return {
    z,
    pts: [
      [xLow - 0.035, y1],
      [xLow, y1 + 0.012],
      [xMid, y2],
      [xMid * 0.99, y3],
      [xHip, y4],
      [(xHip + xInner) * 0.5, (y4 + yCrown) * 0.5 + 0.012],
      [xInner, yCrown],
    ],
  };
}

// Build closed front & rear bumper caps smoothly tapering into sculpted fascia
function buildEndBumperFascia(zTip, stations, isFront) {
  const st = isFront ? stations[0] : stations[stations.length - 1];
  const zNose = isFront ? st.z + 0.045 : st.z - 0.035;
  const s0 = { z: st.z, pts: st.pts.map(([x, y]) => [x, y]) };
  const sMid = {
    z: (st.z + zNose) * 0.5,
    pts: st.pts.map(([x, y], j) => [
      x * 0.64,
      isFront ? (j >= 4 ? y - 0.025 : y + 0.01) : y,
    ]),
  };
  const sTip = {
    z: zNose,
    pts: st.pts.map(([, y], j) => [
      0,
      isFront ? (j >= 4 ? y - 0.055 : y + 0.02) : y - 0.01,
    ]),
  };
  const ordered = isFront ? [sTip, sMid, s0] : [s0, sMid, sTip];
  return buildSymmetricLoftGeometry(ordered, { mirror: true });
}

// Build smooth clamshell front hood anchored directly onto body fender crown edge
function buildHoodGeometry(withDucts) {
  const zs = [];
  for (let z = 2.46; z >= 0.90; z -= 0.06) zs.push(Number(z.toFixed(4)));
  const stations = zs.map((z) => {
    const t = (z - 0.90) / (2.46 - 0.90);
    const bodySt = sampleSU7LowerBody(Math.min(2.47, z));
    const crownPt = bodySt.pts[bodySt.pts.length - 1];
    const edgeW = crownPt[0] + 0.010; // overlap 1cm under fender lip for seamless fit
    const yEdge = crownPt[1] - 0.004;
    const yCenter = yEdge + 0.048 * (1 - t * 0.45);

    const pts = [];
    const steps = 10;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps; // 0 = outer edge, 1 = centerline x=0
      const x = edgeW * (1 - f);
      let y = yEdge + (yCenter - yEdge) * Math.sin(f * Math.PI * 0.5);
      y += 0.014 * Math.exp(-Math.pow((f - 0.28) / 0.14, 2)) * (1 - t * 0.4);
      if (withDucts) {
        const zDuct = Math.exp(-Math.pow((z - 1.78) / 0.24, 2));
        const xDuct = Math.exp(-Math.pow((x - 0.27) / 0.092, 2));
        y -= 0.042 * zDuct * xDuct;
      }
      pts.push([x, y]);
    }
    return { z, pts };
  });
  return buildSymmetricLoftGeometry(stations, { mirror: true });
}

// Build sleek fastback greenhouse (windshield, roof, rear fastback glass & side windows)
function buildCanopyParts(mats) {
  const group = new THREE.Group();
  group.name = 'CanopyGroup';
  group.userData.explodeOffset = new THREE.Vector3(0, 1.05, -0.05);
  group.userData.isExterior = true;

  // Profile curves along z from +0.94 (windshield base) to -1.92 (rear glass tail)
  const canopyZ = [];
  for (let z = 0.94; z >= -1.90; z -= 0.08) canopyZ.push(Number(z.toFixed(4)));

  function sampleRoofY(z) {
    if (z > 0.24) {
      // Windshield ramp up from (0.94, 0.89) to (0.24, 1.42)
      const u = (0.94 - z) / 0.70;
      return 0.89 + 0.53 * Math.pow(u, 0.76);
    }
    if (z >= -0.45) {
      // Gently arched roof apex at y = 1.465
      const u = (z + 0.10) / 0.35;
      return 1.465 - 0.042 * u * u;
    }
    // Fastback roofline sweeping smoothly to rear decklid (-1.90, 1.03)
    const u = (-0.45 - z) / 1.45;
    return 1.43 - 0.40 * Math.pow(u, 1.32);
  }

  function sampleRoofHalfW(z) {
    if (z > 0.24) {
      const u = (0.94 - z) / 0.70;
      return 0.72 - 0.14 * u;
    }
    if (z >= -0.55) {
      return 0.58 - 0.03 * Math.pow((z + 0.15) / 0.40, 2);
    }
    const u = (-0.55 - z) / 1.35;
    return 0.56 - 0.11 * u;
  }

  // 1. Center Greenhouse Glass + Roof Shell (from outer side rail up to x=0)
  const roofStations = canopyZ.map((z) => {
    const yTop = sampleRoofY(z);
    const wTop = sampleRoofHalfW(z);
    const yRail = yTop - 0.025;
    return {
      z,
      pts: [
        [wTop, yRail],
        [wTop * 0.66, yTop - 0.008],
        [wTop * 0.33, yTop - 0.002],
        [0, yTop],
      ],
    };
  });

  // Split glass (windshield + rear glass) vs carbon roof center
  const windStations = roofStations.filter((s) => s.z >= 0.20);
  const midRoofStations = roofStations.filter((s) => s.z <= 0.28 && s.z >= -0.68);
  const rearGlassStations = roofStations.filter((s) => s.z <= -0.60);

  const windMesh = new THREE.Mesh(buildSymmetricLoftGeometry(windStations), mats.cabinGlass);
  windMesh.name = 'WindshieldGlass';
  windMesh.userData.isExterior = true;

  const carbonRoofMesh = new THREE.Mesh(buildSymmetricLoftGeometry(midRoofStations), mats.carbon);
  carbonRoofMesh.name = 'CarbonRoof';
  carbonRoofMesh.userData.isExterior = true;
  carbonRoofMesh.castShadow = true;

  const rearGlassMesh = new THREE.Mesh(buildSymmetricLoftGeometry(rearGlassStations), mats.cabinGlass);
  rearGlassMesh.name = 'RearFastbackGlass';
  rearGlassMesh.userData.isExterior = true;

  // 2. Side Windows & Gloss-Black C/A Pillar Trim Frame
  const sideWinStations = canopyZ.map((z) => {
    const bodySt = sampleSU7LowerBody(z);
    const beltPt = bodySt.pts[bodySt.pts.length - 1];
    const yTop = sampleRoofY(z) - 0.022;
    const wTop = sampleRoofHalfW(z);
    return {
      z,
      pts: [
        [beltPt[0], beltPt[1] - 0.005],
        [(beltPt[0] + wTop) * 0.52, (beltPt[1] + yTop) * 0.5 + 0.015],
        [wTop, yTop],
      ],
    };
  });

  const sideWinMesh = new THREE.Mesh(buildSymmetricLoftGeometry(sideWinStations), mats.cabinGlass);
  sideWinMesh.name = 'SideWindows';
  sideWinMesh.userData.isExterior = true;

  // A-pillar, roof cantrail & C-pillar arch trim
  for (const side of [1, -1]) {
    const railPts = canopyZ.map((z) => {
      const yTop = sampleRoofY(z) - 0.020;
      const wTop = sampleRoofHalfW(z);
      return new THREE.Vector3(side * wTop, yTop, z);
    });
    const railCurve = new THREE.CatmullRomCurve3(railPts);
    const railGeo = new THREE.TubeGeometry(railCurve, 36, 0.022, 8, false);
    const railMesh = new THREE.Mesh(railGeo, mats.glossBlack);
    railMesh.userData.isExterior = true;
    railMesh.castShadow = true;
    group.add(railMesh);

    // B-pillar gloss black divider between front & rear side windows
    const bGeo = new RoundedBoxGeometry(0.024, 0.49, 0.085, 2, 0.008);
    const bMesh = new THREE.Mesh(bGeo, mats.glossBlack);
    bMesh.position.set(side * 0.695, 1.17, -0.05);
    bMesh.rotation.z = side * 0.34;
    bMesh.userData.isExterior = true;
    group.add(bMesh);
  }

  // Slim Roof LiDAR Pebble Pod above windshield header
  const lidarGeo = new RoundedBoxGeometry(0.24, 0.048, 0.14, 3, 0.020);
  const lidarMesh = new THREE.Mesh(lidarGeo, mats.glossBlack);
  lidarMesh.position.set(0, 1.448, 0.25);
  lidarMesh.rotation.x = 0.08;
  lidarMesh.userData.isExterior = true;
  lidarMesh.castShadow = true;

  const lidarVisor = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.022, 0.03, 2, 0.006), mats.matteTrim);
  lidarVisor.position.set(0, 1.442, 0.315);
  lidarVisor.userData.isExterior = true;

  group.add(windMesh, carbonRoofMesh, rearGlassMesh, sideWinMesh, lidarMesh, lidarVisor);
  return group;
}

// Conforming twin racing stripes along hood, roof & rear deck
function buildRacingStripes(mats) {
  const group = new THREE.Group();
  group.name = 'RacingStripeGroup';

  const makeStripeStrip = (zFrom, zTo, halfIn, halfOut, ySampleFn) => {
    const stations = [];
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const z = zFrom + (zTo - zFrom) * (i / steps);
      const y = ySampleFn(z) + 0.003;
      stations.push({
        z,
        pts: [
          [halfOut, y - 0.002],
          [halfIn, y],
        ],
      });
    }
    const m = new THREE.Mesh(buildSymmetricLoftGeometry(stations, { mirror: true }), mats.stripeMat);
    m.userData.isExterior = true;
    return m;
  };

  const hoodY = (z) => {
    const t = clampNum((z - 0.90) / 1.54, 0, 1);
    const yEdge = 0.875 - 0.375 * Math.pow(t, 1.35) + 0.025 * (1 - t);
    return yEdge + 0.045 * (1 - t * 0.55) - 0.003;
  };
  const roofY = (z) => {
    if (z > 0.24) return 0.89 + 0.53 * Math.pow((0.94 - z) / 0.70, 0.76);
    if (z >= -0.45) return 1.465 - 0.042 * Math.pow((z + 0.10) / 0.35, 2);
    return 1.43 - 0.40 * Math.pow((-0.45 - z) / 1.45, 1.32);
  };
  const deckY = (z) => {
    const t = clampNum((-1.85 - z) / 0.58, 0, 1);
    return 1.028 - 0.022 * t + Math.exp(-Math.pow((z + 2.34) / 0.12, 2)) * 0.015;
  };

  // Main dual thick stripes + fine outer pinstripes cleanly down center spine
  group.add(
    makeStripeStrip(2.38, 0.96, 0.028, 0.105, hoodY),
    makeStripeStrip(2.38, 0.96, 0.120, 0.135, hoodY),
    makeStripeStrip(0.18, -0.58, 0.028, 0.105, roofY),
    makeStripeStrip(0.18, -0.58, 0.120, 0.135, roofY),
    makeStripeStrip(-1.86, -2.38, 0.028, 0.105, deckY),
    makeStripeStrip(-1.86, -2.38, 0.120, 0.135, deckY)
  );

  return group;
}

// Sculpted Waterdrop Matrix LED Headlights (flush on sculpted fender crest)
function buildHeadlights(mats) {
  const group = new THREE.Group();
  group.name = 'HeadlightsGroup';
  group.userData.explodeOffset = new THREE.Vector3(0, 0.25, 0.42);

  for (const side of [1, -1]) {
    const unit = new THREE.Group();
    unit.position.set(side * 0.585, 0.578, 2.155);
    unit.rotation.y = side * 0.30;
    unit.rotation.x = 0.28;
    unit.rotation.z = side * -0.16;

    // Dark recessed waterdrop housing bucket sitting cleanly proud on fender surface
    const bucket = new THREE.Mesh(
      new RoundedBoxGeometry(0.24, 0.062, 0.17, 3, 0.022),
      mats.glossBlack
    );
    bucket.userData.isExterior = true;
    unit.add(bucket);

    // Signature SU7 Horizontal White DRL Light Blade ("米" horizontal bar)
    const drlBar = new THREE.Mesh(
      new RoundedBoxGeometry(0.21, 0.011, 0.042, 2, 0.004),
      mats.drlLed
    );
    drlBar.position.set(0, 0.008, 0.072);
    drlBar.userData.isExterior = true;
    unit.add(drlBar);

    // Upper & Lower Dual Matrix LED Projectors
    for (const py of [0.020, -0.008]) {
      for (const px of [-0.042, 0.042]) {
        const pod = new THREE.Mesh(
          new RoundedBoxGeometry(0.044, 0.016, 0.036, 2, 0.005),
          mats.headlightBeam
        );
        pod.position.set(px, py, 0.068);
        pod.userData.isExterior = true;
        unit.add(pod);
      }
    }

    // Flush slim smoked polycarbonate lens
    const lens = new THREE.Mesh(
      new RoundedBoxGeometry(0.25, 0.068, 0.178, 4, 0.025),
      mats.headlightGlass
    );
    lens.position.set(0, 0.003, 0.008);
    lens.userData.isExterior = true;
    unit.add(lens);

    group.add(unit);
  }
  return group;
}

// Front Carbon Splitter + Signature Dual U-Shaped Aero Air Curtains + Hex Grille
function buildFrontAero(mats) {
  const group = new THREE.Group();
  group.name = 'FrontAeroGroup';
  group.userData.explodeOffset = new THREE.Vector3(0, -0.06, 0.62);

  // Curved protruding carbon front splitter (max z = +2.5575)
  const splitterShape = new THREE.Shape();
  splitterShape.moveTo(-0.88, 0);
  splitterShape.lineTo(-0.86, 0.21);
  splitterShape.quadraticCurveTo(-0.56, 0.34, 0, 0.37);
  splitterShape.quadraticCurveTo(0.56, 0.34, 0.86, 0.21);
  splitterShape.lineTo(0.88, 0);
  splitterShape.closePath();

  const splitterGeo = new THREE.ExtrudeGeometry(splitterShape, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 2,
  });
  splitterGeo.rotateX(Math.PI / 2);
  const splitterMesh = new THREE.Mesh(splitterGeo, mats.carbon);
  splitterMesh.position.set(0, 0.130, 2.185);
  splitterMesh.castShadow = true;
  splitterMesh.receiveShadow = true;
  splitterMesh.userData.isExterior = true;
  group.add(splitterMesh);

  // Sleek low-profile endplate winglets + flush U-shaped aero curtains
  for (const side of [1, -1]) {
    const ep = new THREE.Mesh(new RoundedBoxGeometry(0.018, 0.068, 0.22, 2, 0.005), mats.carbon);
    ep.position.set(side * 0.875, 0.156, 2.26);
    ep.rotation.y = side * -0.14;
    ep.userData.isExterior = true;
    ep.castShadow = true;
    group.add(ep);

    // Recessed gloss-black side air curtain intake pocket + carbon U-knife trim
    const sidePocket = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.20, 0.06, 2, 0.015), mats.glossBlack);
    sidePocket.position.set(side * 0.56, 0.295, 2.435);
    sidePocket.rotation.y = side * 0.38;
    sidePocket.userData.isExterior = true;
    group.add(sidePocket);

    const uCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.44, 0.20, 2.49),
      new THREE.Vector3(side * 0.65, 0.21, 2.42),
      new THREE.Vector3(side * 0.69, 0.30, 2.38),
      new THREE.Vector3(side * 0.64, 0.39, 2.39),
      new THREE.Vector3(side * 0.48, 0.40, 2.45),
    ]);
    const uMesh = new THREE.Mesh(new THREE.TubeGeometry(uCurve, 24, 0.015, 8, false), mats.carbon);
    uMesh.userData.isExterior = true;
    uMesh.castShadow = true;
    group.add(uMesh);
  }

  // Wide lower front radiator hex grille insert proud of bumper nose + carbon aero cross-blade
  const grilleBezel = new THREE.Mesh(new RoundedBoxGeometry(0.92, 0.21, 0.075, 3, 0.018), mats.glossBlack);
  grilleBezel.position.set(0, 0.295, 2.485);
  grilleBezel.userData.isExterior = true;
  group.add(grilleBezel);

  const grille = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.175, 0.082, 2, 0.012), mats.hexMesh);
  grille.position.set(0, 0.295, 2.488);
  grille.userData.isExterior = true;
  group.add(grille);

  const crossBar = new THREE.Mesh(new RoundedBoxGeometry(1.06, 0.026, 0.095, 2, 0.008), mats.carbon);
  crossBar.position.set(0, 0.295, 2.495);
  crossBar.userData.isExterior = true;
  group.add(crossBar);

  return group;
}

// Full-Width Halo Taillight + 6-Fin Carbon Rear Diffuser + F1 Rain Lamp
function buildRearAero(mats) {
  const group = new THREE.Group();
  group.name = 'RearAeroGroup';
  group.userData.explodeOffset = new THREE.Vector3(0, 0.10, -0.62);

  // Smoked full-width taillight recessed bezel sitting cleanly outside rear fascia
  const housingCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.74, 0.855, -2.445),
    new THREE.Vector3(-0.46, 0.862, -2.495),
    new THREE.Vector3(0, 0.865, -2.518),
    new THREE.Vector3(0.46, 0.862, -2.495),
    new THREE.Vector3(0.74, 0.855, -2.445),
  ]);
  const housing = new THREE.Mesh(new THREE.TubeGeometry(housingCurve, 40, 0.044, 10, false), mats.glossBlack);
  housing.scale.set(1, 0.65, 1);
  housing.position.y = 0.86 * (1 - 0.65);
  housing.userData.isExterior = true;
  group.add(housing);

  // Signature Xiaomi Halo Taillight (continuous glowing red LED loop completely outside rear fascia)
  const haloPts = [
    new THREE.Vector3(-0.71, 0.890, -2.470),
    new THREE.Vector3(-0.44, 0.896, -2.514),
    new THREE.Vector3(0, 0.900, -2.536),
    new THREE.Vector3(0.44, 0.896, -2.514),
    new THREE.Vector3(0.71, 0.890, -2.470),
    new THREE.Vector3(0.76, 0.860, -2.448),
    new THREE.Vector3(0.70, 0.830, -2.472),
    new THREE.Vector3(0.44, 0.830, -2.514),
    new THREE.Vector3(0, 0.830, -2.536),
    new THREE.Vector3(-0.44, 0.830, -2.514),
    new THREE.Vector3(-0.70, 0.830, -2.472),
    new THREE.Vector3(-0.76, 0.860, -2.448),
  ];
  const haloCurve = new THREE.CatmullRomCurve3(haloPts, true, 'catmullrom', 0.22);
  const haloLed = new THREE.Mesh(new THREE.TubeGeometry(haloCurve, 96, 0.012, 8, true), mats.haloTailLed);
  haloLed.userData.isExterior = true;
  group.add(haloLed);

  // Rear Carbon Bumper Lower Diffuser Apron + 6 Sharp Venturi Fins
  const diffuserBase = new THREE.Mesh(
    new RoundedBoxGeometry(1.48, 0.15, 0.40, 3, 0.02),
    mats.carbon
  );
  diffuserBase.position.set(0, 0.22, -2.35);
  diffuserBase.rotation.x = -0.18;
  diffuserBase.userData.isExterior = true;
  diffuserBase.castShadow = true;
  group.add(diffuserBase);

  const finXs = [-0.62, -0.39, -0.15, 0.15, 0.39, 0.62];
  for (const fx of finXs) {
    const fin = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.18, 0.42, 2, 0.006), mats.carbon);
    fin.position.set(fx, 0.195, -2.36);
    fin.rotation.x = -0.14;
    fin.userData.isExterior = true;
    fin.castShadow = true;
    group.add(fin);
  }

  // Central F1-style vertical LED rain/brake light proud at rear diffuser center
  const f1Lamp = new THREE.Mesh(new RoundedBoxGeometry(0.042, 0.105, 0.045, 2, 0.008), mats.f1BrakeLed);
  f1Lamp.position.set(0, 0.22, -2.562);
  f1Lamp.userData.isExterior = true;
  group.add(f1Lamp);

  // Sculpted gloss-black lower rear valence apron transitioning into the 6-fin diffuser
  const rearValence = new THREE.Mesh(
    new RoundedBoxGeometry(1.52, 0.18, 0.06, 3, 0.018),
    mats.glossBlack
  );
  rearValence.position.set(0, 0.37, -2.482);
  rearValence.rotation.x = -0.10;
  rearValence.userData.isExterior = true;
  group.add(rearValence);

  // Recessed rear license-plate cove & crisp bezel framing
  const plateCove = new THREE.Mesh(
    new RoundedBoxGeometry(0.46, 0.12, 0.024, 2, 0.008),
    mats.matteTrim
  );
  plateCove.position.set(0, 0.56, -2.498);
  plateCove.userData.isExterior = true;
  group.add(plateCove);

  // Twin vertical rear-bumper side air-extraction vents
  for (const side of [1, -1]) {
    const rearSideVent = new THREE.Mesh(
      new RoundedBoxGeometry(0.045, 0.19, 0.075, 2, 0.010),
      mats.glossBlack
    );
    rearSideVent.position.set(side * 0.74, 0.54, -2.41);
    rearSideVent.rotation.y = side * -0.45;
    rearSideVent.userData.isExterior = true;
    group.add(rearSideVent);
  }

  return group;
}

// 1560mm Carbon Fiber Fixed GT Wing (and switchable Active Street Spoiler)
function buildWingAssembly(mats) {
  const group = new THREE.Group();
  group.name = 'WingGroup';
  group.userData.explodeOffset = new THREE.Vector3(0, 0.92, -0.58);

  // Mode A: 1560 mm Fixed Carbon GT Wing
  const gtWingGroup = new THREE.Group();
  gtWingGroup.name = 'GTWing';

  // Cambered inverted airfoil cross section
  const foil = new THREE.Shape();
  foil.moveTo(-0.125, 0.012);
  foil.quadraticCurveTo(-0.02, -0.026, 0.125, 0.016); // cambered bottom suction surface
  foil.quadraticCurveTo(0.0, 0.006, -0.125, 0.024);   // upper pressure surface
  foil.closePath();

  const span = 1.56;
  const foilGeo = new THREE.ExtrudeGeometry(foil, {
    depth: span,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  // Rotate so depth runs along X (-0.78..+0.78) and airfoil chord runs along Z
  foilGeo.translate(0, 0, -span / 2);
  foilGeo.rotateY(Math.PI / 2);
  const foilMesh = new THREE.Mesh(foilGeo, mats.carbon);
  foilMesh.position.set(0, 1.245, -2.31);
  foilMesh.rotation.x = -0.14; // angle of attack generating downforce
  foilMesh.castShadow = true;
  foilMesh.userData.isExterior = true;
  gtWingGroup.add(foilMesh);

  // Twin curved Swan-Neck Carbon Pylons + Sculpted Endplates
  for (const side of [1, -1]) {
    const pylonShape = new THREE.Shape();
    pylonShape.moveTo(0, 0);
    pylonShape.lineTo(0.16, 0);
    pylonShape.quadraticCurveTo(0.10, 0.16, -0.04, 0.27);
    pylonShape.lineTo(-0.11, 0.25);
    pylonShape.quadraticCurveTo(0.01, 0.15, 0, 0);

    const pylonGeo = new THREE.ExtrudeGeometry(pylonShape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 });
    pylonGeo.translate(0, 0, -0.011);
    pylonGeo.rotateY(Math.PI / 2);
    const pylonMesh = new THREE.Mesh(pylonGeo, mats.carbon);
    pylonMesh.position.set(side * 0.34, 1.01, -2.14);
    pylonMesh.castShadow = true;
    pylonMesh.userData.isExterior = true;
    gtWingGroup.add(pylonMesh);

    // Endplate
    const epShape = new THREE.Shape();
    epShape.moveTo(-0.15, -0.08);
    epShape.lineTo(0.15, -0.05);
    epShape.lineTo(0.17, 0.08);
    epShape.lineTo(-0.13, 0.06);
    epShape.closePath();
    const epGeo = new THREE.ExtrudeGeometry(epShape, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 });
    epGeo.translate(0, 0, -0.007);
    epGeo.rotateY(Math.PI / 2);
    const epMesh = new THREE.Mesh(epGeo, mats.carbon);
    epMesh.position.set(side * 0.785, 1.245, -2.31);
    epMesh.castShadow = true;
    epMesh.userData.isExterior = true;
    gtWingGroup.add(epMesh);
  }

  // Mode B: Sleek Active Street Spoiler
  const activeWingGroup = new THREE.Group();
  activeWingGroup.name = 'ActiveSpoiler';
  activeWingGroup.visible = false;
  const activeBlade = new THREE.Mesh(
    new RoundedBoxGeometry(1.36, 0.026, 0.17, 3, 0.009),
    mats.carbon
  );
  activeBlade.position.set(0, 1.022, -2.35);
  activeBlade.castShadow = true;
  activeBlade.userData.isExterior = true;
  activeWingGroup.add(activeBlade);

  group.add(gtWingGroup, activeWingGroup);
  return { group, gtWingGroup, activeWingGroup, activeBlade };
}

// Sculpted Carbon Side Skirts & Mirrors (tucked cleanly flush under lower body sill)
function buildDetailsAndSideSkirts(mats) {
  const skirtsGroup = new THREE.Group();
  skirtsGroup.name = 'SideSkirtsGroup';
  skirtsGroup.userData.explodeOffset = new THREE.Vector3(0, -0.10, 0);

  for (const side of [1, -1]) {
    // Carbon side skirt blade tucked cleanly under lower sill (xLow ~ 0.83..0.86)
    const skirt = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.032, 2.06, 3, 0.010), mats.carbon);
    skirt.position.set(side * 0.845, 0.140, 0.0);
    skirt.castShadow = true;
    skirt.userData.isExterior = true;
    skirtsGroup.add(skirt);

    // Subtle contoured rear aero flick smoothly meeting the rear wheel arch
    const flick = new THREE.Mesh(new RoundedBoxGeometry(0.036, 0.105, 0.18, 2, 0.008), mats.carbon);
    flick.position.set(side * 0.885, 0.182, -0.96);
    flick.rotation.x = 0.24;
    flick.userData.isExterior = true;
    flick.castShadow = true;
    skirtsGroup.add(flick);

    // Aerodynamic side mirror
    const stalk = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.026, 0.042, 2, 0.008), mats.glossBlack);
    stalk.position.set(side * 0.89, 0.945, 0.65);
    stalk.rotation.z = side * 0.28;
    stalk.userData.isExterior = true;
    skirtsGroup.add(stalk);

    const cap = new THREE.Mesh(new RoundedBoxGeometry(0.165, 0.082, 0.130, 3, 0.030), mats.carbon);
    cap.position.set(side * 0.995, 0.985, 0.61);
    cap.rotation.y = side * -0.22;
    cap.castShadow = true;
    cap.userData.isExterior = true;
    skirtsGroup.add(cap);
  }

  return skirtsGroup;
}

// Track Cockpit Interior (remains solid in X-Ray & Cutaway)
function buildInterior(mats) {
  const group = new THREE.Group();
  group.name = 'InteriorGroup';
  group.userData.explodeOffset = new THREE.Vector3(0, 0.22, 0);

  // Dashboard
  const dash = new THREE.Mesh(new RoundedBoxGeometry(1.48, 0.24, 0.44, 4, 0.06), mats.interiorAlcantara);
  dash.position.set(0, 0.79, 0.65);
  group.add(dash);

  // Central 16.1" infotainment screen
  const screenBezel = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.22, 0.024, 2, 0.008), mats.glossBlack);
  screenBezel.position.set(0, 0.87, 0.43);
  screenBezel.rotation.x = -0.18;
  group.add(screenBezel);

  const screenPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.19), mats.screenGlow);
  screenPanel.position.set(0, 0.87, 0.417);
  screenPanel.rotation.x = -0.18;
  screenPanel.rotation.y = Math.PI;
  group.add(screenPanel);

  // Center Console Tunnel
  const consoleBox = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.26, 1.35, 3, 0.05), mats.interiorAlcantara);
  consoleBox.position.set(0, 0.46, -0.05);
  group.add(consoleBox);

  // Flat-bottom carbon/Alcantara steering wheel (Driver on +X or -X? Left-hand drive China spec: driver at +X in +Z forward view!)
  // Wait: looking from front (+Z) back toward -Z, driver's left is +X! Check: standing inside car facing +Z (forward), right hand is -X, left hand is +X!
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(0.36, 0.82, 0.34);
  wheelGroup.rotation.x = -0.34;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.019, 12, 36), mats.carbon);
  const topMark = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.042, 0.042), mats.seatYellowAccent);
  topMark.position.set(0, 0.165, 0);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 20), mats.interiorAlcantara);
  hub.rotation.x = Math.PI / 2;
  wheelGroup.add(rim, topMark, hub);
  group.add(wheelGroup);

  // Twin Sport Carbon-Shell Bucket Seats
  for (const sx of [0.36, -0.36]) {
    const seat = new THREE.Group();
    seat.position.set(sx, 0.35, -0.16);

    const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.11, 0.50, 3, 0.04), mats.interiorAlcantara);
    cushion.position.set(0, 0.06, 0.10);

    const backrest = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.68, 0.11, 3, 0.045), mats.interiorAlcantara);
    backrest.position.set(0, 0.42, -0.14);
    backrest.rotation.x = -0.24;

    const carbonShell = new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.66, 0.04, 3, 0.02), mats.carbon);
    carbonShell.position.set(0, 0.42, -0.185);
    carbonShell.rotation.x = -0.24;

    const headrestAccent = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.12, 0.09, 2, 0.03), mats.seatYellowAccent);
    headrestAccent.position.set(0, 0.72, -0.21);
    headrestAccent.rotation.x = -0.24;

    seat.add(cushion, backrest, carbonShell, headrestAccent);
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

  const frontBumperMesh = new THREE.Mesh(buildEndBumperFascia(2.47, bodyStations, true), mats.bodyPaint);
  frontBumperMesh.name = 'FrontBumperFascia';
  frontBumperMesh.castShadow = true;
  frontBumperMesh.receiveShadow = true;
  frontBumperMesh.userData.isExterior = true;

  const rearBumperMesh = new THREE.Mesh(buildEndBumperFascia(-2.46, bodyStations, false), mats.bodyPaint);
  rearBumperMesh.name = 'RearBumperFascia';
  rearBumperMesh.castShadow = true;
  rearBumperMesh.receiveShadow = true;
  rearBumperMesh.userData.isExterior = true;

  bodyMainGroup.add(bodyMesh, frontBumperMesh, rearBumperMesh);

  // Dark inner wheelhouse liner tubs (so wheel arches are deep & light-tight)
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

  // Side fender extractor vents behind front wheels + semi-flush door handles
  for (const side of [1, -1]) {
    const fenderVent = new THREE.Mesh(new RoundedBoxGeometry(0.032, 0.21, 0.11, 2, 0.008), mats.glossBlack);
    fenderVent.position.set(side * 0.892, 0.45, 0.98);
    fenderVent.rotation.x = -0.22;
    fenderVent.rotation.z = side * 0.08;
    fenderVent.userData.isExterior = true;
    bodyMainGroup.add(fenderVent);

    const ventBlade = new THREE.Mesh(new RoundedBoxGeometry(0.036, 0.13, 0.018, 1, 0.004), mats.goldBadge);
    ventBlade.position.set(side * 0.896, 0.45, 0.98);
    ventBlade.rotation.x = -0.22;
    ventBlade.rotation.z = side * 0.08;
    ventBlade.userData.isExterior = true;
    bodyMainGroup.add(ventBlade);

    // Flush semi-hidden front & rear door handles
    for (const hz of [0.22, -0.68]) {
      const handle = new THREE.Mesh(new RoundedBoxGeometry(0.025, 0.026, 0.155, 2, 0.008), mats.glossBlack);
      handle.position.set(side * 0.922, 0.77, hz);
      handle.userData.isExterior = true;
      bodyMainGroup.add(handle);
    }
  }

  // 2. Hood Group (Switchable Standard Painted Hood vs Carbon Dual-Duct Hood)
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
  hoodCarbonGroup.name = 'HoodCarbonDualDuct';
  const hoodCarbonMesh = new THREE.Mesh(buildHoodGeometry(true), mats.carbon);
  hoodCarbonMesh.castShadow = true;
  hoodCarbonMesh.receiveShadow = true;
  hoodCarbonMesh.userData.isExterior = true;
  hoodCarbonGroup.add(hoodCarbonMesh);

  for (const side of [1, -1]) {
    const ductGrid = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.025, 0.28, 2, 0.006), mats.hexMesh);
    ductGrid.position.set(side * 0.27, 0.662, 1.78);
    ductGrid.rotation.x = 0.22;
    ductGrid.userData.isExterior = true;
    hoodCarbonGroup.add(ductGrid);
  }

  // 24K Gold Xiaomi Nose Emblem
  const noseEmblem = new THREE.Mesh(new RoundedBoxGeometry(0.068, 0.012, 0.068, 3, 0.014), mats.goldBadge);
  noseEmblem.position.set(0, 0.565, 2.34);
  noseEmblem.rotation.x = 0.24;
  noseEmblem.userData.isExterior = true;

  // 24K Gold Rear Badge bar (proud of rear fascia above Halo taillight)
  const rearBadge = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.016, 0.014, 2, 0.003), mats.goldBadge);
  rearBadge.position.set(0, 0.962, -2.495);
  rearBadge.userData.isExterior = true;

  hoodGroup.add(hoodStdMesh, hoodCarbonGroup, noseEmblem);
  bodyMainGroup.add(rearBadge);

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

  // Collect explodeable top-level groups
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
      wingCtrl.activeBlade.position.y = 1.022 + deploy * 0.085;
      wingCtrl.activeBlade.rotation.x = -deploy * 0.22;
    },
    setLightsOn(on) {
      mats.drlLed.emissiveIntensity = on ? 3.2 : 0.08;
      mats.headlightBeam.emissiveIntensity = on ? 2.5 : 0.04;
      mats.haloTailLed.emissiveIntensity = on ? 3.2 : 0.1;
      mats.f1BrakeLed.emissiveIntensity = on ? 2.6 : 0.05;
    },
  };
}
