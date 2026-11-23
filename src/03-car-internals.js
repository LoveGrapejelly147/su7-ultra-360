// Internal powertrain, CATL Qilin II battery, 897V harness, suspension, 21" forged wheels,
// 430mm/410mm carbon-ceramic brakes, Akebono calipers, and 3D aerodynamic streamlines

function buildHelicalSpring(radius, wireR, turns, height, mat) {
  const pts = [];
  const segs = turns * 18;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, (t - 0.5) * height, Math.sin(a) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segs, wireR, 7, false), mat);
}

// Build one corner assembly: wheel + tire + brake rotor (spinning) & knuckle + Akebono caliper (stationary)
function buildWheelCorner({ isFront, side, mats }) {
  const hubZ = isFront ? 1.500 : -1.500;
  const hubX = side * (isFront ? 0.835 : 0.825);
  const tireW = isFront ? 0.265 : 0.305;
  const rotorR = isFront ? 0.215 : 0.205; // 430 mm front, 410 mm rear
  const rotorThick = isFront ? 0.036 : 0.028;

  const cornerGroup = new THREE.Group();
  cornerGroup.name = `${isFront ? 'Front' : 'Rear'}_${side > 0 ? 'Left' : 'Right'}_Corner`;
  cornerGroup.position.set(hubX, 0.360, hubZ);
  cornerGroup.userData.basePos = cornerGroup.position.clone();
  cornerGroup.userData.explodeOffset = new THREE.Vector3(side * 0.62, 0, isFront ? 0.16 : -0.16);

  // 1. Stationary Hub Knuckle & Sculpted Yellow Akebono Monoblock Caliper
  const stationaryGroup = new THREE.Group();
  const caliperAngle = isFront ? Math.PI * 0.82 : Math.PI * 0.18; // 10 o'clock front, 2 o'clock rear
  const calR = rotorR - 0.025;

  const caliperGroup = new THREE.Group();
  caliperGroup.position.set(
    -side * 0.028,
    Math.sin(caliperAngle) * calR,
    Math.cos(caliperAngle) * calR
  );
  caliperGroup.rotation.x = -(caliperAngle - Math.PI / 2);

  const calLen = isFront ? 0.25 : 0.20;
  const calBody = new THREE.Mesh(
    new RoundedBoxGeometry(0.11, 0.09, calLen, 3, 0.022),
    mats.caliperYellow
  );
  calBody.castShadow = true;

  // Dark Akebono badge plate on outer face of caliper
  const calBadge = new THREE.Mesh(
    new RoundedBoxGeometry(0.012, 0.036, calLen * 0.56, 1, 0.004),
    mats.glossBlack
  );
  calBadge.position.set(side * 0.052, 0, 0);

  // Piston bridge ribs
  const calBridge = new THREE.Mesh(
    new RoundedBoxGeometry(0.118, 0.022, calLen * 0.72, 2, 0.005),
    mats.darkCastAlu
  );
  calBridge.position.set(0, 0.04, 0);

  caliperGroup.add(calBody, calBadge, calBridge);

  const knuckle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.068, 0.10, 16),
    mats.darkCastAlu
  );
  knuckle.rotation.z = Math.PI / 2;
  knuckle.position.set(-side * 0.09, 0, 0);

  // Dark inner brake dust shield backing disc so light never passes straight through spokes
  const dustShield = new THREE.Mesh(
    new THREE.CylinderGeometry(rotorR + 0.022, rotorR + 0.022, 0.010, 32),
    mats.matteTrim
  );
  dustShield.rotation.z = Math.PI / 2;
  dustShield.position.set(-side * 0.058, 0, 0);

  stationaryGroup.add(caliperGroup, knuckle, dustShield);
  cornerGroup.add(stationaryGroup);

  // 2. Rotating Wheel + Tire + Carbon-Ceramic Brake Rotor
  const spinGroup = new THREE.Group();

  // Tire Lathe Profile (revolved around Y, then rotated so axle is X)
  // Radius 0.360 outer, 0.267 rim bead (21" = 0.5334m diameter -> r = 0.2667)
  const hw = tireW * 0.5;
  const rRim = 0.266;
  const rOut = 0.360;
  const tirePts = [
    new THREE.Vector2(rRim, -hw * 0.86),
    new THREE.Vector2(rRim + 0.035, -hw * 0.99),
    new THREE.Vector2(rOut - 0.015, -hw * 0.96),
    new THREE.Vector2(rOut, -hw * 0.82),
    new THREE.Vector2(rOut, hw * 0.82),
    new THREE.Vector2(rOut - 0.015, hw * 0.96),
    new THREE.Vector2(rRim + 0.035, hw * 0.99),
    new THREE.Vector2(rRim, hw * 0.86),
  ];
  const tireGeo = new THREE.LatheGeometry(tirePts, 48);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMesh = new THREE.Mesh(tireGeo, mats.tireRubber);
  tireMesh.castShadow = true;
  tireMesh.receiveShadow = true;
  spinGroup.add(tireMesh);

  // Inner dark forged wheel barrel
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(rRim, rRim, tireW * 0.86, 40, 1, true),
    mats.forgedWheel
  );
  barrel.rotation.z = Math.PI / 2;
  spinGroup.add(barrel);

  // Machined bright outer rim flange lip
  const rimLip = new THREE.Mesh(
    new THREE.TorusGeometry(rRim - 0.004, 0.009, 10, 48),
    mats.machinedAlloy
  );
  rimLip.rotation.y = Math.PI / 2;
  rimLip.position.x = side * (hw * 0.82);
  spinGroup.add(rimLip);

  // 10-Spoke (5 twin U-shaped split spokes) 21" Forged Alloy Face
  const spokeOuterX = side * (hw * 0.72);
  const hubFaceX = side * (hw * 0.44);
  for (let i = 0; i < 5; i++) {
    const baseAngle = (i / 5) * Math.PI * 2;
    for (const delta of [-0.15, 0.15]) {
      const a = baseAngle + delta;
      const spoke = new THREE.Mesh(
        new RoundedBoxGeometry(0.022, 0.175, 0.024, 2, 0.005),
        mats.forgedWheel
      );
      const rMid = 0.176;
      spoke.position.set(
        (spokeOuterX + hubFaceX) * 0.5 + side * 0.01,
        Math.sin(a) * rMid,
        Math.cos(a) * rMid
      );
      spoke.rotation.x = -(a - Math.PI / 2);
      spoke.rotation.z = side * -0.18; // Concave forged dishing!
      spoke.castShadow = true;
      spinGroup.add(spoke);
    }
  }

  // Central Hub & 5 Metallic Lug Bolts + Gold Xiaomi Center Cap
  const wheelHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.094, 0.055, 24),
    mats.forgedWheel
  );
  wheelHub.rotation.z = Math.PI / 2;
  wheelHub.position.x = hubFaceX;
  spinGroup.add(wheelHub);

  const centerCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.038, 0.02, 20),
    mats.goldBadge
  );
  centerCap.rotation.z = Math.PI / 2;
  centerCap.position.x = hubFaceX + side * 0.024;
  spinGroup.add(centerCap);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const lug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.022, 8),
      mats.machinedAlloy
    );
    lug.rotation.z = Math.PI / 2;
    lug.position.set(hubFaceX + side * 0.022, Math.sin(a) * 0.062, Math.cos(a) * 0.062);
    spinGroup.add(lug);
  }

  // Cross-drilled Carbon-Ceramic Brake Disc + Central Anodized Hat
  const discX = -side * 0.028;
  const rotorGeo = new THREE.CylinderGeometry(rotorR, rotorR, rotorThick, 40);
  rotorGeo.rotateZ(Math.PI / 2);
  const rotorMesh = new THREE.Mesh(rotorGeo, mats.brakeRotor);
  rotorMesh.position.x = discX;
  spinGroup.add(rotorMesh);

  const discHat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.112, 0.118, rotorThick + 0.018, 24),
    mats.darkCastAlu
  );
  discHat.rotation.z = Math.PI / 2;
  discHat.position.x = discX;
  spinGroup.add(discHat);

  cornerGroup.add(spinGroup);

  return { cornerGroup, spinGroup, hubZ, hubX };
}

// Build HyperEngine V8s or V6s drive unit with exposed copper stator & spinning rotor
function buildElectricDriveUnit({ name, width, outerR, mats, withWindow = true }) {
  const unit = new THREE.Group();
  unit.name = name;

  // Outer ribbed cast-aluminum casing (open ends or cutaway inspection window)
  const casing = new THREE.Mesh(
    new THREE.CylinderGeometry(outerR, outerR, width, 28, 1, false),
    mats.castAlu
  );
  casing.rotation.z = Math.PI / 2;
  casing.castShadow = true;
  unit.add(casing);

  // Cooling fins around motor housing
  for (let i = -3; i <= 3; i++) {
    const fin = new THREE.Mesh(
      new THREE.TorusGeometry(outerR + 0.006, 0.006, 6, 28),
      mats.darkCastAlu
    );
    fin.rotation.y = Math.PI / 2;
    fin.position.x = i * (width / 8);
    unit.add(fin);
  }

  // Exposed Copper Hairpin Stator Winding Rings at both ends
  for (const s of [-1, 1]) {
    const copperRing = new THREE.Mesh(
      new THREE.TorusGeometry(outerR * 0.78, 0.022, 10, 28),
      mats.copperWinding
    );
    copperRing.rotation.y = Math.PI / 2;
    copperRing.position.x = s * (width * 0.44);
    unit.add(copperRing);
  }

  // Spinning Rotor Core visible through central cutaway inspection window & ends
  const rotorGroup = new THREE.Group();
  const rotorShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.036, width * 1.18, 16),
    mats.siliconSteel
  );
  rotorShaft.rotation.z = Math.PI / 2;
  rotorGroup.add(rotorShaft);

  const rotorCore = new THREE.Mesh(
    new THREE.CylinderGeometry(outerR * 0.64, outerR * 0.64, width * 0.74, 16),
    mats.siliconSteel
  );
  rotorCore.rotation.z = Math.PI / 2;
  rotorGroup.add(rotorCore);

  // Rotor cooling/pole indicator stripes so rotation is crystal clear
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const bar = new THREE.Mesh(
      new RoundedBoxGeometry(width * 0.76, 0.018, 0.024, 1, 0.004),
      mats.copperWinding
    );
    bar.position.set(0, Math.sin(a) * (outerR * 0.65), Math.cos(a) * (outerR * 0.65));
    rotorGroup.add(bar);
  }
  unit.add(rotorGroup);

  if (withWindow) {
    // Top SiC Silicon-Carbide Inverter Module with cooling ribs
    const inverter = new THREE.Mesh(
      new RoundedBoxGeometry(width * 0.82, 0.082, outerR * 1.45, 2, 0.014),
      mats.darkCastAlu
    );
    inverter.position.set(0, outerR + 0.045, 0);
    inverter.castShadow = true;
    unit.add(inverter);

    const hvConnector = new THREE.Mesh(
      new RoundedBoxGeometry(0.055, 0.042, 0.055, 2, 0.008),
      mats.hvOrange
    );
    hvConnector.position.set(0, outerR + 0.088, 0.06);
    unit.add(hvConnector);
  }

  return { unit, rotorGroup };
}

// Build 3D Aerodynamic Streamlines wrapping smoothly over the SU7 Ultra silhouette
function buildAeroStreamlines() {
  const aeroGroup = new THREE.Group();
  aeroGroup.name = 'AeroStreamlinesGroup';
  aeroGroup.visible = false;

  const laneXs = [-0.68, -0.44, -0.22, 0, 0.22, 0.44, 0.68];
  const streamEntries = [];

  for (const x of laneXs) {
    const absX = Math.abs(x);
    const roofDrop = absX * 0.09;

    // Upper airflow over splitter, hood, windshield, carbon roof, and deflected up by 1560mm GT wing
    const upperPts = [
      new THREE.Vector3(x, 0.22, 3.05),
      new THREE.Vector3(x, 0.34, 2.52),
      new THREE.Vector3(x * 0.96, 0.66 - absX * 0.04, 1.92),
      new THREE.Vector3(x * 0.94, 0.90 - absX * 0.03, 1.10),
      new THREE.Vector3(x * 0.85, 1.49 - roofDrop, 0.10),
      new THREE.Vector3(x * 0.84, 1.46 - roofDrop, -0.60),
      new THREE.Vector3(x * 0.88, 1.24 - roofDrop * 0.5, -1.55),
      new THREE.Vector3(x * 0.95, 1.32, -2.28), // hits GT wing
      new THREE.Vector3(x * 0.98, 1.48, -2.95), // upward downforce wash!
      new THREE.Vector3(x * 1.02, 1.56, -3.45),
    ];

    const curve = new THREE.CatmullRomCurve3(upperPts);
    const linePts = curve.getPoints(72);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
    });
    const guideLine = new THREE.Line(lineGeo, lineMat);
    aeroGroup.add(guideLine);

    // 3 glowing aerodynamic flow streaks traveling along each streamline
    const beads = [];
    for (let b = 0; b < 3; b++) {
      const beadGeo = new THREE.SphereGeometry(0.018, 8, 8);
      beadGeo.scale(1, 0.8, 4.2);
      const beadMat = new THREE.MeshBasicMaterial({
        color: 0x56e0ff,
        transparent: true,
        opacity: 0.9,
      });
      const bead = new THREE.Mesh(beadGeo, beadMat);
      aeroGroup.add(bead);
      beads.push({ mesh: bead, phase: b / 3 });
    }
    streamEntries.push({ curve, lineMat, beads });
  }

  // 4 Underbody Venturi Diffuser Outwash Streams
  for (const x of [-0.52, -0.18, 0.18, 0.52]) {
    const lowPts = [
      new THREE.Vector3(x, 0.11, 2.70),
      new THREE.Vector3(x, 0.10, 1.20),
      new THREE.Vector3(x, 0.10, -0.60),
      new THREE.Vector3(x, 0.12, -1.85),
      new THREE.Vector3(x, 0.24, -2.52),
      new THREE.Vector3(x * 1.05, 0.36, -3.35),
    ];
    const curve = new THREE.CatmullRomCurve3(lowPts);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.28 });
    aeroGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(56)), lineMat));

    const beads = [];
    for (let b = 0; b < 2; b++) {
      const beadGeo = new THREE.SphereGeometry(0.016, 8, 8);
      beadGeo.scale(1, 0.8, 3.8);
      const beadMat = new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.88 });
      const bead = new THREE.Mesh(beadGeo, beadMat);
      aeroGroup.add(bead);
      beads.push({ mesh: bead, phase: b / 2 });
    }
    streamEntries.push({ curve, lineMat, beads });
  }

  function update(dt, speedKmh, elapsed) {
    if (!aeroGroup.visible) return;
    const speedFactor = Math.max(0.25, speedKmh / 140);
    // Color transitions from cool cyan (<120) -> lightning yellow (240) -> track orange-red (350)
    const tNorm = Math.min(1, speedKmh / 340);
    const streamColor = new THREE.Color().setHSL(0.55 - tNorm * 0.48, 0.92, 0.60);

    for (const entry of streamEntries) {
      entry.lineMat.color.copy(streamColor);
      entry.lineMat.opacity = 0.18 + tNorm * 0.32;
      for (const b of entry.beads) {
        const u = (elapsed * 0.42 * speedFactor + b.phase) % 1;
        const pos = entry.curve.getPointAt(u);
        const tan = entry.curve.getTangentAt(u);
        b.mesh.position.copy(pos);
        b.mesh.lookAt(pos.clone().add(tan));
        b.mesh.material.color.copy(streamColor);
      }
    }
  }

  return { aeroGroup, update };
}

function buildCarInternals(mats) {
  const root = new THREE.Group();
  root.name = 'SU7_Internals_Root';

  const spinningRotors = [];
  const rotatingWheels = [];

  // 1. Structural Chassis Underbody, Front Crash Rails, Radiator & 9100t Rear Gigacasting
  const chassisGroup = new THREE.Group();
  chassisGroup.name = 'ChassisGroup';
  chassisGroup.userData.basePos = new THREE.Vector3(0, 0, 0);
  chassisGroup.userData.explodeOffset = new THREE.Vector3(0, -0.14, 0);

  // Flat carbon-composite aero undertray (y = 0.135 m, cleanly above ground)
  const undertray = new THREE.Mesh(new RoundedBoxGeometry(1.56, 0.024, 3.65, 2, 0.008), mats.carbonMatte);
  undertray.position.set(0, 0.142, 0.0);
  undertray.receiveShadow = true;
  chassisGroup.add(undertray);

  // Front extruded aluminum longitudinal crash rails + crossbeam
  for (const side of [1, -1]) {
    const fRail = new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.11, 1.05, 2, 0.012), mats.castAlu);
    fRail.position.set(side * 0.44, 0.38, 1.56);
    chassisGroup.add(fRail);
  }
  const fCrashBeam = new THREE.Mesh(new RoundedBoxGeometry(1.24, 0.10, 0.09, 2, 0.015), mats.castAlu);
  fCrashBeam.position.set(0, 0.36, 2.16);
  chassisGroup.add(fCrashBeam);

  // Front Angled Cooling Radiator Stack
  const radiator = new THREE.Mesh(new RoundedBoxGeometry(0.96, 0.34, 0.065, 2, 0.01), mats.darkCastAlu);
  radiator.position.set(0, 0.34, 2.04);
  radiator.rotation.x = -0.32;
  chassisGroup.add(radiator);

  // Rear 9100t Die-Cast Aluminum Gigacasting Floor Structure
  const gigaBase = new THREE.Mesh(new RoundedBoxGeometry(1.16, 0.065, 0.92, 2, 0.012), mats.castAlu);
  gigaBase.position.set(0, 0.25, -1.54);
  chassisGroup.add(gigaBase);

  for (const side of [1, -1]) {
    const rRail = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.11, 0.98, 2, 0.014), mats.castAlu);
    rRail.position.set(side * 0.48, 0.40, -1.52);
    chassisGroup.add(rRail);
  }

  // 2. CATL Qilin II 93.7 kWh Track Battery Pack (CTB)
  const batteryGroup = new THREE.Group();
  batteryGroup.name = 'QilinBatteryGroup';
  batteryGroup.userData.basePos = new THREE.Vector3(0, 0, 0);
  batteryGroup.userData.explodeOffset = new THREE.Vector3(0, -0.46, 0);

  // Perimeter anodized aluminum housing tray
  const batTray = new THREE.Mesh(new RoundedBoxGeometry(1.44, 0.095, 2.02, 3, 0.018), mats.batteryShell);
  batTray.position.set(0, 0.215, -0.02);
  batTray.castShadow = true;
  batteryGroup.add(batTray);

  // 16 distinct prismatic Qilin II cell rows + cooling ribbons sitting visibly on top deck
  for (let i = 0; i < 16; i++) {
    const zPos = -0.88 + i * 0.114;
    const cellRow = new THREE.Mesh(new RoundedBoxGeometry(1.26, 0.065, 0.088, 2, 0.008), mats.batteryCell);
    cellRow.position.set(0, 0.248, zPos);
    batteryGroup.add(cellRow);

    const coolPlate = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.068, 0.010), mats.coolantPipe);
    coolPlate.position.set(0, 0.248, zPos + 0.052);
    batteryGroup.add(coolPlate);
  }

  // Central longitudinal structural beam + Front BMS High-Voltage PDU
  const batSpine = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.082, 1.94, 2, 0.01), mats.darkCastAlu);
  batSpine.position.set(0, 0.258, -0.02);
  batteryGroup.add(batSpine);

  const bmsBox = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.095, 0.24, 2, 0.015), mats.darkCastAlu);
  bmsBox.position.set(0, 0.295, 0.92);
  batteryGroup.add(bmsBox);

  // 3. Front HyperEngine V6s Drive Unit + Double Wishbone Suspension
  const frontMotorGroup = new THREE.Group();
  frontMotorGroup.name = 'FrontMotorV6sGroup';
  frontMotorGroup.userData.basePos = new THREE.Vector3(0, 0, 0);
  frontMotorGroup.userData.explodeOffset = new THREE.Vector3(0, 0.18, 0.42);

  const v6s = buildElectricDriveUnit({ name: 'HyperEngine_V6s', width: 0.42, outerR: 0.145, mats });
  v6s.unit.position.set(0, 0.360, 1.500);
  frontMotorGroup.add(v6s.unit);
  spinningRotors.push({ group: v6s.rotorGroup, ratio: 8.14 });

  // Front half-shafts, double-wishbone arms & Bilstein yellow coilovers
  for (const side of [1, -1]) {
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.56, 12), mats.siliconSteel);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(side * 0.48, 0.360, 1.500);
    frontMotorGroup.add(axle);

    const lowArm = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.028, 0.12, 2, 0.008), mats.castAlu);
    lowArm.position.set(side * 0.50, 0.26, 1.500);
    frontMotorGroup.add(lowArm);

    const upArm = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.024, 0.09, 2, 0.006), mats.castAlu);
    upArm.position.set(side * 0.52, 0.49, 1.500);
    frontMotorGroup.add(upArm);

    // Bilstein Coilover damper + yellow helical spring
    const strut = new THREE.Group();
    strut.position.set(side * 0.56, 0.52, 1.500);
    strut.rotation.z = side * 0.22;
    const damper = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.42, 12), mats.darkCastAlu);
    const spring = buildHelicalSpring(0.044, 0.009, 6, 0.24, mats.suspensionSpring);
    strut.add(damper, spring);
    frontMotorGroup.add(strut);
  }

  // 4. Rear Dual Independent HyperEngine V8s Drive Units + 5-Link Suspension
  const rearMotorsGroup = new THREE.Group();
  rearMotorsGroup.name = 'RearMotorsV8sGroup';
  rearMotorsGroup.userData.basePos = new THREE.Vector3(0, 0, 0);
  rearMotorsGroup.userData.explodeOffset = new THREE.Vector3(0, 0.18, -0.45);

  for (const side of [1, -1]) {
    const v8s = buildElectricDriveUnit({
      name: `HyperEngine_V8s_${side > 0 ? 'L' : 'R'}`,
      width: 0.36,
      outerR: 0.162,
      mats,
    });
    v8s.unit.position.set(side * 0.245, 0.360, -1.500);
    rearMotorsGroup.add(v8s.unit);
    spinningRotors.push({ group: v8s.rotorGroup, ratio: 10.62 });

    // Rear half-shaft + 5-link arms + coilover
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.40, 12), mats.siliconSteel);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(side * 0.58, 0.360, -1.500);
    rearMotorsGroup.add(axle);

    const lowLink = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.030, 0.14, 2, 0.008), mats.castAlu);
    lowLink.position.set(side * 0.54, 0.26, -1.500);
    rearMotorsGroup.add(lowLink);

    const strut = new THREE.Group();
    strut.position.set(side * 0.56, 0.53, -1.500);
    strut.rotation.z = side * 0.18;
    const damper = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.44, 12), mats.darkCastAlu);
    const spring = buildHelicalSpring(0.044, 0.009, 6, 0.25, mats.suspensionSpring);
    strut.add(damper, spring);
    rearMotorsGroup.add(strut);
  }

  // 5. 897V High-Voltage Orange Wiring Harness & Coolant Piping
  const harnessGroup = new THREE.Group();
  harnessGroup.name = 'HVHarnessGroup';
  harnessGroup.userData.basePos = new THREE.Vector3(0, 0, 0);
  harnessGroup.userData.explodeOffset = new THREE.Vector3(0, 0.08, 0);

  const hvRoutes = [
    // Forward HV bus from battery BMS to Front V6s inverter
    [
      new THREE.Vector3(0.06, 0.30, 0.94),
      new THREE.Vector3(0.06, 0.34, 1.25),
      new THREE.Vector3(0.04, 0.56, 1.48),
    ],
    [
      new THREE.Vector3(-0.06, 0.30, 0.94),
      new THREE.Vector3(-0.06, 0.34, 1.25),
      new THREE.Vector3(-0.04, 0.56, 1.48),
    ],
    // Rear HV bus splitting into Dual V8s inverters
    [
      new THREE.Vector3(0.08, 0.29, -0.96),
      new THREE.Vector3(0.18, 0.36, -1.25),
      new THREE.Vector3(0.24, 0.58, -1.48),
    ],
    [
      new THREE.Vector3(-0.08, 0.29, -0.96),
      new THREE.Vector3(-0.18, 0.36, -1.25),
      new THREE.Vector3(-0.24, 0.58, -1.48),
    ],
  ];
  for (const pts of hvRoutes) {
    const cable = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.015, 8, false),
      mats.hvOrange
    );
    harnessGroup.add(cable);
  }

  // Brushed stainless thermal coolant pipes from front radiator to battery
  for (const side of [1, -1]) {
    const pipePts = [
      new THREE.Vector3(side * 0.34, 0.32, 1.98),
      new THREE.Vector3(side * 0.34, 0.24, 1.45),
      new THREE.Vector3(side * 0.30, 0.24, 0.98),
    ];
    const pipe = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pipePts), 20, 0.013, 8, false),
      mats.coolantPipe
    );
    harnessGroup.add(pipe);
  }

  // 6. Four 21" Forged Wheels + Pirelli Tires + 430mm/410mm Carbon-Ceramic Brakes
  const cornersSpec = [
    { isFront: true, side: 1 },
    { isFront: true, side: -1 },
    { isFront: false, side: 1 },
    { isFront: false, side: -1 },
  ];
  const cornerGroups = [];
  for (const spec of cornersSpec) {
    const c = buildWheelCorner({ ...spec, mats });
    root.add(c.cornerGroup);
    cornerGroups.push(c.cornerGroup);
    rotatingWheels.push(c.spinGroup);
  }

  // 7. Aerodynamic Airflow Streamlines
  const aeroCtrl = buildAeroStreamlines();

  root.add(chassisGroup, batteryGroup, frontMotorGroup, rearMotorsGroup, harnessGroup, aeroCtrl.aeroGroup);

  const explodeGroups = [
    chassisGroup,
    batteryGroup,
    frontMotorGroup,
    rearMotorsGroup,
    harnessGroup,
    ...cornerGroups,
  ];

  return {
    root,
    explodeGroups,
    aeroCtrl,
    // Advance rotating wheels (at true angular velocity) and motor rotors (scaled 1:60 for visual clarity)
    stepKinematics(dt, speedMps) {
      const wheelOmega = speedMps / 0.360;
      const dWheel = wheelOmega * dt;
      for (const w of rotatingWheels) {
        w.rotation.x += dWheel;
      }
      for (const r of spinningRotors) {
        r.group.rotation.x += (dWheel * r.ratio) / 60;
      }
    },
  };
}
