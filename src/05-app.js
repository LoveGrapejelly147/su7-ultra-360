// Main 3D studio scene, lighting themes, modes, hotspots, camera presets, GLB loader & UI bindings

function buildStudioEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color('#090b10');

  const panelMat = (color, intensity = 1) => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const softTex = new THREE.CanvasTexture(c);
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      map: softTex,
      transparent: true,
      side: THREE.DoubleSide,
    });
  };

  // Overhead primary longitudinal softbox strips (feathered studio diffusers)
  const mainStrip = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 16), panelMat('#ffffff', 1.25));
  mainStrip.position.set(0, 7.8, 0);
  mainStrip.rotation.x = Math.PI / 2;
  envScene.add(mainStrip);

  const sideStripL = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 15), panelMat('#e8f1ff', 0.88));
  sideStripL.position.set(5.6, 4.4, 0);
  sideStripL.rotation.z = -Math.PI / 3;
  sideStripL.rotation.y = -Math.PI / 2;
  envScene.add(sideStripL);

  const sideStripR = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 15), panelMat('#fff3dc', 0.80));
  sideStripR.position.set(-5.6, 4.4, 0);
  sideStripR.rotation.z = Math.PI / 3;
  sideStripR.rotation.y = Math.PI / 2;
  envScene.add(sideStripR);

  // Low horizon accent strips to carve crisp shoulder reflections along doors & fenders
  const horizonL = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.65), panelMat('#9cc2ff', 0.72));
  horizonL.position.set(6.8, 1.35, 0);
  horizonL.rotation.y = -Math.PI / 2;
  envScene.add(horizonL);

  const horizonR = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.65), panelMat('#ffdca8', 0.68));
  horizonR.position.set(-6.8, 1.35, 0);
  horizonR.rotation.y = Math.PI / 2;
  envScene.add(horizonR);

  const rt = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return rt.texture;
}

function buildContactShadowPlane() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Broad underbody ambient occlusion shadow
  const bodyGrad = ctx.createRadialGradient(256, 256, 30, 256, 256, 225);
  bodyGrad.addColorStop(0, 'rgba(0,0,0,0.82)');
  bodyGrad.addColorStop(0.55, 'rgba(0,0,0,0.48)');
  bodyGrad.addColorStop(1, 'rgba(0,0,0,0.0)');
  ctx.save();
  ctx.translate(256, 256);
  ctx.scale(0.56, 1.0);
  ctx.translate(-256, -256);
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(0, 0, 512, 512);
  ctx.restore();

  // Four tight tire contact puddles
  const drawWheelPuddle = (nx, nz) => {
    const px = 256 + nx * 165;
    const py = 256 + nz * 150;
    const g = ctx.createRadialGradient(px, py, 4, px, py, 34);
    g.addColorStop(0, 'rgba(0,0,0,0.95)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, 34, 0, Math.PI * 2);
    ctx.fill();
  };
  drawWheelPuddle(0.84, 1.0);
  drawWheelPuddle(-0.84, 1.0);
  drawWheelPuddle(0.84, -1.0);
  drawWheelPuddle(-0.84, -1.0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5.8), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  return mesh;
}

function createXRayEdgeOverlay(exteriorEntries) {
  const edgeGroup = new THREE.Group();
  edgeGroup.name = 'XRayWireframeEdges';
  edgeGroup.visible = false;
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x74e3ff,
    transparent: true,
    opacity: 0.38,
  });

  for (const entry of exteriorEntries) {
    // Only trace body panels & wing (skip tiny lights/badges)
    const box = new THREE.Box3().setFromObject(entry.mesh);
    const size = box.getSize(new THREE.Vector3());
    if (size.length() < 0.35) continue;
    const edges = new THREE.EdgesGeometry(entry.mesh.geometry, 26);
    const line = new THREE.LineSegments(edges, edgeMat);
    line.position.copy(entry.mesh.position);
    line.rotation.copy(entry.mesh.rotation);
    line.scale.copy(entry.mesh.scale);
    entry.mesh.parent.add(line);
    line.visible = false;
    entry.edgeLine = line;
  }
  return edgeGroup;
}

function initSU7Showroom() {
  const wrap = document.getElementById('canvas-wrap');
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  wrap.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0B0D12');
  scene.fog = new THREE.Fog('#0B0D12', 14, 34);
  scene.environment = buildStudioEnvironment(renderer);

  const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.08, 100);
  camera.position.set(5.15, 1.76, 5.75);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(-0.24, 0.46, 0.22);
  controls.minDistance = 1.85;
  controls.maxDistance = 14.0;
  controls.maxPolarAngle = Math.PI * 0.492;
  controls.autoRotateSpeed = 0.75;

  // Post-processing pipeline (Bloom triggers only on true emissive LEDs/hot brakes >= 2.25)
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.26,
    0.36,
    2.25
  );
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  // Studio Floor & Lighting Rig
  const floorMat = new THREE.MeshStandardMaterial({
    color: '#12151d',
    metalness: 0.22,
    roughness: 0.36,
    envMapIntensity: 0.85,
  });
  const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(28, 72), floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  // Subtle floor turntable spotlight ring
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#EBBF00',
    transparent: true,
    opacity: 0.18,
  });
  const studioRing = new THREE.Mesh(new THREE.RingGeometry(2.85, 2.885, 96), ringMat);
  studioRing.rotation.x = -Math.PI / 2;
  studioRing.position.y = 0.003;
  scene.add(studioRing);

  const contactShadow = buildContactShadowPlane();
  scene.add(contactShadow);

  const hemiLight = new THREE.HemisphereLight('#dfeaff', '#1c1f28', 0.90);
  const keyLight = new THREE.DirectionalLight('#ffffff', 1.90);
  keyLight.position.set(4.5, 7.2, 4.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 20;
  keyLight.shadow.camera.left = -4.2;
  keyLight.shadow.camera.right = 4.2;
  keyLight.shadow.camera.top = 4.2;
  keyLight.shadow.camera.bottom = -4.2;
  keyLight.shadow.bias = -0.0005;

  const rimCool = new THREE.DirectionalLight('#8ac7ff', 0.92);
  rimCool.position.set(-6.5, 4.8, 2.2);

  const rimWarm = new THREE.DirectionalLight('#ffd296', 0.72);
  rimWarm.position.set(4.5, 2.2, -5.0);

  scene.add(hemiLight, keyLight, rimCool, rimWarm);

  // Build SU7 Ultra Procedural Car + Internals + Physics
  const mats = createMaterialsLibrary();
  const bodyCtrl = buildCarBody(mats);
  const internalCtrl = buildCarInternals(mats);
  createXRayEdgeOverlay(bodyCtrl.exteriorMeshEntries);

  const carPitchGroup = new THREE.Group();
  carPitchGroup.name = 'SU7_Vehicle_Pitch_Rig';
  carPitchGroup.add(bodyCtrl.root, internalCtrl.root);
  scene.add(carPitchGroup);

  // Custom GLB Container
  const customGlbGroup = new THREE.Group();
  customGlbGroup.visible = false;
  scene.add(customGlbGroup);

  const physics = createPhysicsEngine();

  // Application State
  const appState = {
    mode: 'showroom', // showroom | xray | explode | cutaway
    theme: 'dark',    // dark | light | track
    paint: 'yellow',
    explodeTarget: 0,
    explodeCurrent: 0,
    cutawayTarget: 0.52,
    cutawayCurrent: 0.52,
    labelsEnabled: false,
    aeroEnabled: false,
    lightsOn: true,
    stripeOn: true,
    carbonHood: true,
    gtWing: true,
    autoRotate: false,
    usingCustomGlb: false,
  };

  // Camera Presets (framed cleanly inside unobstructed center viewport, clear of left/right HUD cards)
  const CAMERA_PRESETS = {
    hero:       { pos: [5.15, 1.76, 5.75],   target: [-0.24, 0.46, 0.22] },
    front:      { pos: [0.20, 1.04, 6.55],   target: [0.22, 0.46, 0.20] },
    side:       { pos: [7.20, 1.24, 0.0],    target: [0.0, 0.50, -0.15] },
    rear:       { pos: [-5.10, 1.82, -5.65], target: [0.34, 0.44, -0.32] },
    top:        { pos: [0.0,  7.40, 0.95],   target: [0.0, 0.45, 0.0] },
    wheel:      { pos: [2.45, 0.66, 2.02],   target: [0.80, 0.36, 1.48] },
    powertrain: { pos: [-4.15, 2.30, -3.90], target: [0.15, 0.36, -0.15] },
  };

  let camTween = null;
  function setPreset(key) {
    const p = CAMERA_PRESETS[key];
    if (!p) return;
    const startTarget = controls.target.clone();
    const endTarget = new THREE.Vector3(...p.target);
    const startOff = camera.position.clone().sub(startTarget);
    const endOff = new THREE.Vector3(...p.pos).sub(endTarget);
    const sSph = new THREE.Spherical().setFromVector3(startOff);
    const eSph = new THREE.Spherical().setFromVector3(endOff);
    // Shortest angular wrap for theta
    let dTheta = eSph.theta - sSph.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    camTween = {
      startTarget,
      endTarget,
      sSph,
      eSph,
      dTheta,
      t: 0,
      dur: 0.72,
    };
    document.querySelectorAll('#cam-presets .cam-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.preset === key);
    });
  }

  // Lighting Themes
  const THEMES = {
    dark: {
      label: '环境：暗调展厅',
      bodyClass: 'theme-dark',
      bg: '#0B0D12',
      floor: '#12151d',
      floorMetal: 0.24,
      floorRough: 0.35,
      hemiSky: '#dfeaff',
      hemiGnd: '#1c1f28',
      hemiInt: 0.90,
      keyInt: 1.90,
      rimCoolInt: 0.92,
      rimWarmInt: 0.72,
      ringOpacity: 0.18,
      bloomStrength: 0.26,
    },
    light: {
      label: '环境：白棚工程',
      bodyClass: 'theme-light',
      bg: '#EAECE8',
      floor: '#E1E3DE',
      floorMetal: 0.02,
      floorRough: 0.78,
      hemiSky: '#ffffff',
      hemiGnd: '#d4d6d1',
      hemiInt: 1.35,
      keyInt: 2.25,
      rimCoolInt: 0.75,
      rimWarmInt: 0.65,
      ringOpacity: 0.14,
      bloomStrength: 0.16,
    },
    track: {
      label: '环境：夜赛维修',
      bodyClass: 'theme-dark',
      bg: '#050810',
      floor: '#0b0e16',
      floorMetal: 0.42,
      floorRough: 0.22,
      hemiSky: '#7ab2ff',
      hemiGnd: '#0d1018',
      hemiInt: 0.55,
      keyInt: 1.85,
      rimCoolInt: 2.10,
      rimWarmInt: 1.45,
      ringOpacity: 0.28,
      bloomStrength: 0.52,
    },
  };

  function setTheme(themeKey) {
    const t = THEMES[themeKey];
    if (!t) return;
    appState.theme = themeKey;
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(t.bodyClass);
    scene.background.set(t.bg);
    scene.fog.color.set(t.bg);
    floorMat.color.set(t.floor);
    floorMat.metalness = t.floorMetal;
    floorMat.roughness = t.floorRough;
    hemiLight.color.set(t.hemiSky);
    hemiLight.groundColor.set(t.hemiGnd);
    hemiLight.intensity = t.hemiInt;
    keyLight.intensity = t.keyInt;
    rimCool.intensity = t.rimCoolInt;
    rimWarm.intensity = t.rimWarmInt;
    ringMat.opacity = t.ringOpacity;
    bloomPass.strength = t.bloomStrength;
    document.getElementById('btn-theme').textContent = t.label;
  }

  function setPaint(paintKey) {
    const p = SU7_PAINTS[paintKey];
    if (!p) return;
    appState.paint = paintKey;
    mats.bodyPaint.color.set(p.color);
    mats.bodyPaint.metalness = p.metalness;
    mats.bodyPaint.roughness = p.roughness;
    mats.bodyPaintSecondary.color.set(p.color);
    mats.stripeMat.color.set(p.stripeColor);
    mats.updateSideDecalColor(p.stripeColor);
    document.getElementById('paint-label').textContent = p.label;
    document.querySelectorAll('#paint-swatches .swatch').forEach((el) => {
      el.classList.toggle('active', el.dataset.paint === paintKey);
    });
  }

  function setMode(mode) {
    appState.mode = mode;
    document.querySelectorAll('#mode-tabs .seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });

    const sliderWrap = document.getElementById('mode-slider-wrap');
    const sliderLabel = document.getElementById('mode-slider-label');
    const slider = document.getElementById('mode-slider');
    const sliderVal = document.getElementById('mode-slider-val');

    // X-Ray toggle
    const isXray = mode === 'xray';
    for (const entry of bodyCtrl.exteriorMeshEntries) {
      entry.mesh.material = isXray
        ? (entry.isGlass ? mats.xrayGlassMat : mats.xrayShellMat)
        : entry.origMat;
      if (entry.edgeLine) entry.edgeLine.visible = isXray;
    }

    // Explode & Cutaway slider visibility
    if (mode === 'explode') {
      sliderWrap.classList.add('visible');
      sliderLabel.textContent = '拆解程度';
      if (appState.explodeTarget < 0.05) appState.explodeTarget = 0.85;
      const pct = Math.round(appState.explodeTarget * 100);
      slider.value = pct;
      sliderVal.textContent = `${pct}%`;
      mats.setCutawayActive(false, 10);
    } else if (mode === 'cutaway') {
      sliderWrap.classList.add('visible');
      sliderLabel.textContent = '剖切深度';
      appState.explodeTarget = 0;
      const pct = Math.round(appState.cutawayTarget * 100);
      slider.value = pct;
      sliderVal.textContent = `${pct}%`;
      const cutX = 1.15 - appState.cutawayTarget * 1.48;
      mats.setCutawayActive(true, cutX);
    } else {
      sliderWrap.classList.remove('visible');
      appState.explodeTarget = 0;
      mats.setCutawayActive(false, 10);
    }

    // Auto-show 3D hotspots in engineering modes, clean look in showroom
    const shouldShowLabels = mode !== 'showroom';
    appState.labelsEnabled = shouldShowLabels;
    document.getElementById('btn-labels').classList.toggle('active', shouldShowLabels);
  }

  // 3D Hotspot Annotations
  const hotspotLayer = document.getElementById('hotspot-layer');
  const HOTSPOTS = [
    {
      id: 'v8s',
      title: 'HyperEngine V8s 双后电机',
      pos: new THREE.Vector3(0.28, 0.48, -1.52),
      explode: new THREE.Vector3(0, 0.18, -0.45),
      preset: 'powertrain',
      valueFn: (s) => `${Math.round(s.v8sRpm).toLocaleString()} rpm`,
    },
    {
      id: 'v6s',
      title: 'HyperEngine V6s 前电机',
      pos: new THREE.Vector3(0, 0.56, 1.52),
      explode: new THREE.Vector3(0, 0.18, 0.42),
      preset: 'powertrain',
      valueFn: (s) => `${Math.round(s.v6sRpm).toLocaleString()} rpm`,
    },
    {
      id: 'battery',
      title: '麒麟 II 93.7kWh 电池包',
      pos: new THREE.Vector3(0.22, 0.25, -0.32),
      explode: new THREE.Vector3(0, -0.46, 0),
      preset: 'powertrain',
      valueFn: (s) => `${s.batteryTempC.toFixed(0)} °C`,
    },
    {
      id: 'brakes',
      title: '430mm 碳陶盘 & Akebono',
      pos: new THREE.Vector3(0.92, 0.42, 1.50),
      explode: new THREE.Vector3(0.62, 0, 0.16),
      preset: 'wheel',
      valueFn: (s) => `${Math.round(s.brakeTempC)} °C`,
    },
    {
      id: 'wing',
      title: '1560mm 碳纤维 GT 尾翼',
      pos: new THREE.Vector3(0, 1.29, -2.32),
      explode: new THREE.Vector3(0, 0.92, -0.58),
      preset: 'rear',
      valueFn: (s) => `${Math.round(s.downforceKgf)} kgf`,
    },
    {
      id: 'halo',
      title: '光环尾灯 & 6鳍扩散器',
      pos: new THREE.Vector3(0, 0.88, -2.50),
      explode: new THREE.Vector3(0, 0.10, -0.62),
      preset: 'rear',
      valueFn: () => '897 V',
    },
  ];

  const hotspotEls = HOTSPOTS.map((h) => {
    const el = document.createElement('div');
    el.className = 'hotspot';
    el.innerHTML = `<span class="hotspot-dot"></span><span class="hotspot-title">${h.title}</span><span class="hotspot-val"></span>`;
    el.addEventListener('click', () => {
      if ((h.id === 'v8s' || h.id === 'v6s' || h.id === 'battery') && appState.mode === 'showroom') {
        setMode('xray');
      }
      setPreset(h.preset);
    });
    hotspotLayer.appendChild(el);
    return { ...h, el, valSpan: el.querySelector('.hotspot-val') };
  });

  const telemetryRectEl = document.querySelector('.telemetry-panel');
  const configRectEl = document.getElementById('config-panel');

  function updateHotspots(solverState) {
    const show = appState.labelsEnabled && !appState.usingCustomGlb;
    hotspotLayer.style.display = show ? 'block' : 'none';
    if (!show) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const tRect = telemetryRectEl ? telemetryRectEl.getBoundingClientRect() : null;
    const cRect = configRectEl && !configRectEl.classList.contains('collapsed')
      ? configRectEl.getBoundingClientRect()
      : null;
    const tmp = new THREE.Vector3();

    const placed = [];
    for (const item of hotspotEls) {
      tmp.copy(item.pos);
      if (item.explode && appState.explodeCurrent > 0.001) {
        tmp.addScaledVector(item.explode, appState.explodeCurrent);
      }
      carPitchGroup.localToWorld(tmp);
      tmp.project(camera);

      const sx = (tmp.x * 0.5 + 0.5) * w;
      let sy = (-tmp.y * 0.5 + 0.5) * h;
      let visible = tmp.z < 1 && sx > 36 && sx < w - 36 && sy > 76 && sy < h - 36;

      // Avoid occluding behind floating left/right HUD cards
      if (visible && tRect && sx < tRect.right + 50 && sy > tRect.top - 24) visible = false;
      if (visible && cRect && sx > cRect.left - 50 && sy > cRect.top - 20 && sy < cRect.bottom + 20) visible = false;

      if (!visible) {
        item.el.style.opacity = '0';
        item.el.style.pointerEvents = 'none';
        continue;
      }

      // 2D de-overlap against previously placed hotspot pills
      for (const prev of placed) {
        if (Math.abs(sx - prev.x) < 190 && Math.abs(sy - prev.y) < 32) {
          sy = prev.y + (sy >= prev.y ? 34 : -34);
        }
      }
      placed.push({ x: sx, y: sy });

      item.el.style.opacity = '1';
      item.el.style.pointerEvents = 'auto';
      item.el.style.left = `${sx}px`;
      item.el.style.top = `${sy}px`;
      item.valSpan.textContent = item.valueFn(solverState);
    }
  }

  // Custom GLB Loader
  const gltfLoader = new GLTFLoader();
  function loadCustomGlbFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    gltfLoader.load(
      url,
      (gltf) => {
        URL.revokeObjectURL(url);
        while (customGlbGroup.children.length) {
          customGlbGroup.remove(customGlbGroup.children[0]);
        }
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxHoriz = Math.max(size.x, size.z, 0.01);
        const scale = 5.115 / maxHoriz;
        model.scale.setScalar(scale);

        // Recompute bounds after scaling and seat cleanly on y = 0 at x=0, z=0
        model.updateMatrixWorld(true);
        const scaledBox = new THREE.Box3().setFromObject(model);
        const center = scaledBox.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -scaledBox.min.y, -center.z);

        model.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });

        customGlbGroup.add(model);
        customGlbGroup.visible = true;
        carPitchGroup.visible = false;
        appState.usingCustomGlb = true;
        document.getElementById('btn-reset-glb').classList.add('visible');
        setPreset('hero');
      },
      undefined,
      (err) => {
        URL.revokeObjectURL(url);
        console.error('Failed to load GLB:', err);
        alert('加载 GLB/GLTF 失败，请确认文件格式完整无损。');
      }
    );
  }

  function resetToBuiltInModel() {
    customGlbGroup.visible = false;
    while (customGlbGroup.children.length) {
      customGlbGroup.remove(customGlbGroup.children[0]);
    }
    carPitchGroup.visible = true;
    appState.usingCustomGlb = false;
    document.getElementById('btn-reset-glb').classList.remove('visible');
  }

  // Bind UI Controls
  document.querySelectorAll('#mode-tabs .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  document.getElementById('mode-slider').addEventListener('input', (e) => {
    const frac = Number(e.target.value) / 100;
    document.getElementById('mode-slider-val').textContent = `${e.target.value}%`;
    if (appState.mode === 'explode') {
      appState.explodeTarget = frac;
    } else if (appState.mode === 'cutaway') {
      appState.cutawayTarget = frac;
      const cutX = 1.15 - frac * 1.48;
      mats.setCutawayActive(true, cutX);
    }
  });

  const themeOrder = ['dark', 'light', 'track'];
  document.getElementById('btn-theme').addEventListener('click', () => {
    const next = themeOrder[(themeOrder.indexOf(appState.theme) + 1) % themeOrder.length];
    setTheme(next);
  });

  document.getElementById('btn-labels').addEventListener('click', (e) => {
    appState.labelsEnabled = !appState.labelsEnabled;
    e.currentTarget.classList.toggle('active', appState.labelsEnabled);
  });

  document.getElementById('btn-aero').addEventListener('click', (e) => {
    appState.aeroEnabled = !appState.aeroEnabled;
    internalCtrl.aeroCtrl.aeroGroup.visible = appState.aeroEnabled;
    e.currentTarget.classList.toggle('active', appState.aeroEnabled);
    if (appState.aeroEnabled && physics.state.targetSpeedKmh < 120) {
      physics.state.targetSpeedKmh = 240;
      document.getElementById('speed-slider').value = 240;
      document.getElementById('target-speed-val').textContent = '240 km/h';
    }
  });

  const modal = document.getElementById('physics-modal');
  document.getElementById('btn-equations').addEventListener('click', () => modal.classList.add('visible'));
  document.getElementById('btn-close-modal').addEventListener('click', () => modal.classList.remove('visible'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('visible'); });

  const toggleHudHidden = () => document.body.classList.toggle('hud-hidden');
  document.getElementById('btn-hud-hide').addEventListener('click', toggleHudHidden);
  document.getElementById('restore-hud-btn').addEventListener('click', toggleHudHidden);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') toggleHudHidden();
  });

  // Paint & Exterior Toggles
  document.querySelectorAll('#paint-swatches .swatch').forEach((el) => {
    el.addEventListener('click', () => setPaint(el.dataset.paint));
  });

  const bindToggle = (id, initial, onToggle) => {
    const row = document.getElementById(id);
    let val = initial;
    row.addEventListener('click', () => {
      val = !val;
      row.classList.toggle('on', val);
      onToggle(val);
    });
  };

  bindToggle('tog-lights', true, (v) => { appState.lightsOn = v; bodyCtrl.setLightsOn(v); });
  bindToggle('tog-stripe', true, (v) => { appState.stripeOn = v; bodyCtrl.setRacingStripe(v); });
  bindToggle('tog-hood', true, (v) => { appState.carbonHood = v; bodyCtrl.setHoodCarbon(v); });
  bindToggle('tog-wing', true, (v) => {
    appState.gtWing = v;
    bodyCtrl.setWingMode(v);
    physics.state.gtWing = v;
  });
  bindToggle('tog-autorotate', false, (v) => {
    appState.autoRotate = v;
    controls.autoRotate = v;
  });

  document.querySelectorAll('#cam-presets .cam-btn').forEach((btn) => {
    btn.addEventListener('click', () => setPreset(btn.dataset.preset));
  });

  // Right Panel Collapse
  const configPanel = document.getElementById('config-panel');
  const openConfigBtn = document.getElementById('btn-open-config');
  if (window.innerWidth <= 768) {
    configPanel.classList.add('collapsed');
    openConfigBtn.classList.add('visible');
  }
  document.getElementById('btn-close-config').addEventListener('click', () => {
    configPanel.classList.add('collapsed');
    openConfigBtn.classList.add('visible');
  });
  openConfigBtn.addEventListener('click', () => {
    configPanel.classList.remove('collapsed');
    openConfigBtn.classList.remove('visible');
  });

  // Drive Modes & Telemetry Controls
  document.querySelectorAll('#drive-modes .dm-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dm = btn.dataset.dmode;
      physics.setDriveMode(dm);
      document.querySelectorAll('#drive-modes .dm-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.dmode === dm);
      });
      const cap = physics.DRIVE_MODES[dm].topKmh;
      const slider = document.getElementById('speed-slider');
      slider.max = cap;
      if (Number(slider.value) > cap) {
        slider.value = cap;
        document.getElementById('target-speed-val').textContent = `${cap} km/h`;
      }
    });
  });

  const speedSlider = document.getElementById('speed-slider');
  speedSlider.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    physics.state.launchActive = false;
    physics.state.brakeTestActive = false;
    physics.state.targetSpeedKmh = val;
    document.getElementById('target-speed-val').textContent = `${val} km/h`;
  });

  document.getElementById('btn-launch').addEventListener('click', () => {
    physics.startLaunch();
    speedSlider.value = physics.state.targetSpeedKmh;
    document.getElementById('target-speed-val').textContent = `${Math.round(physics.state.targetSpeedKmh)} km/h`;
  });

  document.getElementById('btn-brake-test').addEventListener('click', () => {
    physics.startBrakeTest();
    speedSlider.value = 0;
    document.getElementById('target-speed-val').textContent = '0 km/h';
  });

  document.getElementById('btn-derate').addEventListener('click', (e) => {
    physics.toggleDerateStress();
    e.currentTarget.classList.toggle('running', physics.state.derateActive);
    speedSlider.value = Math.round(physics.state.targetSpeedKmh);
    document.getElementById('target-speed-val').textContent = `${Math.round(physics.state.targetSpeedKmh)} km/h`;
  });

  // GLB Upload & Drag-Drop
  const glbInput = document.getElementById('glb-file-input');
  document.getElementById('btn-upload-glb').addEventListener('click', () => glbInput.click());
  glbInput.addEventListener('change', (e) => loadCustomGlbFile(e.target.files[0]));
  document.getElementById('btn-reset-glb').addEventListener('click', resetToBuiltInModel);

  const dropOverlay = document.getElementById('drop-overlay');
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropOverlay.classList.add('visible');
  });
  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) dropOverlay.classList.remove('visible');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dropOverlay.classList.remove('visible');
    const file = e.dataTransfer?.files?.[0];
    if (file && /\.(glb|gltf)$/i.test(file.name)) {
      loadCustomGlbFile(file);
    }
  });

  // Resize Handler
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  });

  // DOM References for Telemetry Update
  const elHeroPower = document.getElementById('hero-power');
  const elHeroBar = document.getElementById('hero-bar');
  const elHeroStatus = document.getElementById('hero-status');
  const elValSpeed = document.getElementById('val-speed');
  const elValRpm = document.getElementById('val-rpm');
  const elValDown = document.getElementById('val-downforce');
  const elValBrake = document.getElementById('val-brake-temp');
  const elValG = document.getElementById('val-g');
  const elValKw = document.getElementById('val-kw');
  const elFps = document.getElementById('fps-badge');
  const btnLaunch = document.getElementById('btn-launch');
  const btnBrake = document.getElementById('btn-brake-test');

  // Animation Loop
  let lastTime = performance.now();
  let fpsCount = 0;
  let fpsTimer = 0;
  let elapsed = 0;

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    elapsed += dt;

    // FPS counter
    fpsCount++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      elFps.textContent = `${Math.round(fpsCount / fpsTimer)} fps`;
      fpsCount = 0;
      fpsTimer = 0;
    }

    // Camera preset smooth spherical orbit tween (orbits around car rather than cutting through cabin!)
    if (camTween) {
      camTween.t += dt / camTween.dur;
      const u = Math.min(1, camTween.t);
      const easeU = 1 - Math.pow(1 - u, 3);
      controls.target.lerpVectors(camTween.startTarget, camTween.endTarget, easeU);
      const sph = new THREE.Spherical(
        camTween.sSph.radius + (camTween.eSph.radius - camTween.sSph.radius) * easeU,
        camTween.sSph.phi + (camTween.eSph.phi - camTween.sSph.phi) * easeU,
        camTween.sSph.theta + camTween.dTheta * easeU
      );
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
      if (u >= 1) camTween = null;
    }

    controls.update();

    // Physics Step
    const st = physics.step(dt);

    // Kinematic wheel rotation, motor rotor spin & suspension pitch squat/dive
    internalCtrl.stepKinematics(dt, st.speedMps);
    bodyCtrl.updateActiveSpoiler(st.speedKmh);
    carPitchGroup.rotation.x = st.pitchRad;

    // Blackbody thermal glow on carbon-ceramic brake rotors
    const rotorKelvin = st.brakeTempC + 273.15;
    mats.brakeRotor.emissive.copy(blackbodyColor(rotorKelvin));

    // Smooth Explode animation
    appState.explodeCurrent += (appState.explodeTarget - appState.explodeCurrent) * (1 - Math.exp(-dt * 8));
    if (appState.explodeCurrent > 0.001 || appState.explodeTarget > 0) {
      const allExplode = [...bodyCtrl.explodeGroups, ...internalCtrl.explodeGroups];
      for (const g of allExplode) {
        if (g.userData.basePos && g.userData.explodeOffset) {
          g.position.copy(g.userData.basePos).addScaledVector(g.userData.explodeOffset, appState.explodeCurrent);
        }
      }
    }

    // Update 3D aero streamlines
    internalCtrl.aeroCtrl.update(dt, st.speedKmh, elapsed);

    // Update HUD telemetry
    elHeroPower.textContent = Math.round(st.powerPs).toLocaleString('en-US');
    elHeroBar.style.width = `${Math.min(100, (st.powerPs / 1548) * 100)}%`;
    elHeroBar.classList.toggle('warning', st.isWarning);
    elHeroStatus.textContent = st.statusText;
    elHeroStatus.classList.toggle('warning', st.isWarning);

    elValSpeed.textContent = `${Math.round(st.speedKmh)} km/h`;
    elValRpm.textContent = `${Math.round(st.v8sRpm).toLocaleString('en-US')} rpm`;
    elValDown.textContent = `${Math.round(st.downforceKgf)} kgf`;
    elValBrake.textContent = `${Math.round(st.brakeTempC)} °C`;
    elValG.textContent = `${st.accelG >= 0 ? '+' : ''}${st.accelG.toFixed(2)} g`;
    elValKw.textContent = `${Math.round(st.powerKw)} kW`;

    btnLaunch.classList.toggle('running', st.launchActive);
    btnBrake.classList.toggle('running', st.brakeTestActive);

    updateHotspots(st);
    composer.render();
  }

  requestAnimationFrame(animate);

  // Expose automation/debug hook for deterministic verification
  window.__su7 = {
    setMode,
    setPaint,
    setTheme,
    setPreset,
    setExplode: (frac) => {
      setMode('explode');
      appState.explodeTarget = frac;
      appState.explodeCurrent = frac;
      document.getElementById('mode-slider').value = Math.round(frac * 100);
      document.getElementById('mode-slider-val').textContent = `${Math.round(frac * 100)}%`;
    },
    setCutaway: (frac) => {
      setMode('cutaway');
      appState.cutawayTarget = frac;
      const cutX = 1.15 - frac * 1.48;
      mats.setCutawayActive(true, cutX);
      document.getElementById('mode-slider').value = Math.round(frac * 100);
      document.getElementById('mode-slider-val').textContent = `${Math.round(frac * 100)}%`;
    },
    setTargetSpeed: (kmh) => {
      physics.state.launchActive = false;
      physics.state.brakeTestActive = false;
      physics.state.targetSpeedKmh = kmh;
      physics.state.speedKmh = kmh;
      physics.state.speedMps = kmh / 3.6;
      speedSlider.value = kmh;
      document.getElementById('target-speed-val').textContent = `${kmh} km/h`;
    },
    triggerBrakeTest: () => {
      physics.startBrakeTest();
    },
    triggerLaunch: () => {
      physics.startLaunch();
    },
    toggleAero: (on) => {
      appState.aeroEnabled = on;
      internalCtrl.aeroCtrl.aeroGroup.visible = on;
      document.getElementById('btn-aero').classList.toggle('active', on);
    },
    toggleLabels: (on) => {
      appState.labelsEnabled = on;
      document.getElementById('btn-labels').classList.toggle('active', on);
    },
    getStats: () => ({
      state: { ...physics.state },
      appState: { ...appState },
      renderInfo: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      },
    }),
  };
}

initSU7Showroom();
