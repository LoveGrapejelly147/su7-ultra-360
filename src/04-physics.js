// Real-time longitudinal, aerodynamic, powertrain & thermal solver for Xiaomi SU7 Ultra

function createPhysicsEngine() {
  const MASS = 2360; // kg curb weight
  const RHO = 1.225; // kg/m^3 air density
  const AREA = 2.38; // m^2 frontal area
  const WHEEL_R = 0.360; // m tire outer radius
  const G = 9.80665;
  const GEAR_V8S = 10.55; // rear dual motors -> 27,200 rpm at 350 km/h
  const GEAR_V6S = 8.14;  // front motor -> ~21,000 rpm at 350 km/h

  const DRIVE_MODES = {
    novice:     { label: '新手模式', maxKw: 662,  maxPs: 900,  topKmh: 140, maxTorque: 1080 },
    sport:      { label: '运动模式', maxKw: 846,  maxPs: 1150, topKmh: 260, maxTorque: 1380 },
    track:      { label: '赛道模式', maxKw: 1030, maxPs: 1400, topKmh: 318, maxTorque: 1620 },
    qualifying: { label: '排位模式', maxKw: 1138, maxPs: 1548, topKmh: 350, maxTorque: 1770 },
  };

  const state = {
    driveMode: 'qualifying',
    gtWing: true,
    targetSpeedKmh: 0,
    speedMps: 0,
    speedKmh: 0,
    powerKw: 0,
    powerPs: 0,
    torqueNm: 0,
    v8sRpm: 0,
    v6sRpm: 0,
    downforceKgf: 0,
    dragN: 0,
    accelG: 0,
    pitchRad: 0,
    brakeTempC: 42,
    batteryTempC: 28,
    statorTempC: 38,
    launchActive: false,
    launchTimer: 0,
    split0to100: null,
    split0to200: null,
    brakeTestActive: false,
    derateActive: false,
    statusText: '展厅待机 · 897V 就绪',
    isWarning: false,
  };

  function setDriveMode(modeKey) {
    if (DRIVE_MODES[modeKey]) {
      state.driveMode = modeKey;
      const cap = DRIVE_MODES[modeKey].topKmh;
      if (state.targetSpeedKmh > cap) state.targetSpeedKmh = cap;
    }
  }

  function startLaunch() {
    state.brakeTestActive = false;
    state.derateActive = false;
    state.launchActive = true;
    state.launchTimer = 0;
    state.split0to100 = null;
    state.split0to200 = null;
    state.speedMps = 0;
    state.speedKmh = 0;
    state.targetSpeedKmh = DRIVE_MODES[state.driveMode].topKmh;
  }

  function startBrakeTest() {
    state.launchActive = false;
    state.derateActive = false;
    state.brakeTestActive = true;
    state.speedKmh = 350;
    state.speedMps = 350 / 3.6;
    state.targetSpeedKmh = 0;
  }

  function toggleDerateStress() {
    state.derateActive = !state.derateActive;
    state.brakeTestActive = false;
    state.launchActive = false;
    if (state.derateActive) {
      state.targetSpeedKmh = Math.min(295, DRIVE_MODES[state.driveMode].topKmh);
    }
  }

  function step(dtRaw) {
    const dt = Math.min(0.05, Math.max(0.001, dtRaw));
    const mode = DRIVE_MODES[state.driveMode];

    // Aerodynamic coefficients
    const cd = state.gtWing ? 0.255 : 0.215;
    const cla = state.gtWing ? 0.483 : 0.210; // m^2 (C_L * A)

    // Thermal dynamics
    const batTarget = state.derateActive
      ? 64.5
      : 28 + (state.powerKw / 1138) * 18 + (state.speedKmh / 350) * 6;
    state.batteryTempC += (batTarget - state.batteryTempC) * (1 - Math.exp(-dt / (state.derateActive ? 1.8 : 6.0)));

    const statorTarget = state.derateActive
      ? 174
      : 38 + (state.powerKw / 1138) * 85;
    state.statorTempC += (statorTarget - state.statorTempC) * (1 - Math.exp(-dt / (state.derateActive ? 1.6 : 5.0)));

    // Power derating factor when battery > 52 C or stator > 155 C
    const batDerate = 1 - 0.32 * Math.min(1, Math.max(0, (state.batteryTempC - 52) / 12));
    const motorDerate = 1 - 0.25 * Math.min(1, Math.max(0, (state.statorTempC - 155) / 22));
    const thermalMult = Math.max(0.65, Math.min(batDerate, motorDerate));
    const availKw = mode.maxKw * thermalMult;

    // Aerodynamic forces at current velocity
    const v = state.speedMps;
    const q = 0.5 * RHO * v * v;
    const downforceN = q * cla;
    state.downforceKgf = downforceN / G;
    state.dragN = q * cd * AREA;
    const rollingN = 0.011 * (MASS * G + downforceN);

    let netForceN = 0;
    let wheelPowerW = 0;

    if (state.brakeTestActive) {
      // High-load 350 -> 0 carbon-ceramic braking (~1.85g aided by aero downforce)
      const brakeGrip = 1.68 * (MASS * G + downforceN * 0.72);
      netForceN = -(brakeGrip + state.dragN + rollingN);
      const decel = netForceN / MASS;
      const nextV = Math.max(0, v + decel * dt);
      const dKE = 0.5 * MASS * (v * v - nextV * nextV);
      // Surface flash heat into 4 carbon-ceramic discs (~62% thermal share, 14.2 kg effective surface thermal mass)
      const dTemp = (dKE * 0.62) / (14.2 * 760);
      state.brakeTempC = Math.min(1140, state.brakeTempC + dTemp * 1.48);
      state.speedMps = nextV;
      wheelPowerW = 0;
      if (nextV <= 0.1) {
        state.speedMps = 0;
        state.brakeTestActive = false;
      }
    } else {
      const targetV = Math.min(mode.topKmh, state.targetSpeedKmh) / 3.6;
      const vErr = targetV - v;

      if (state.launchActive || vErr > 0.35) {
        const throttle = state.launchActive ? 1.0 : Math.min(1.0, Math.max(0.15, vErr / 14));
        const pWatts = availKw * 1000 * throttle;
        const maxTractionN = 1.48 * (MASS * G + downforceN * 0.55);
        const motorTorqueForce = (mode.maxTorque * throttle * thermalMult * 10.55) / WHEEL_R;
        const driveForce = v > 1.0
          ? Math.min(maxTractionN, motorTorqueForce, pWatts / v)
          : Math.min(maxTractionN, motorTorqueForce);

        netForceN = driveForce - state.dragN - rollingN;
        const nextV = Math.max(0, Math.min(mode.topKmh / 3.6, v + (netForceN / MASS) * dt));
        state.speedMps = nextV;
        wheelPowerW = driveForce * Math.max(v, 1.0);

        if (state.launchActive) {
          state.launchTimer += dt;
          const kmh = nextV * 3.6;
          if (state.split0to100 === null && kmh >= 100) {
            state.split0to100 = state.launchTimer;
          }
          if (state.split0to200 === null && kmh >= 200) {
            state.split0to200 = state.launchTimer;
          }
          if (kmh >= mode.topKmh - 0.5) {
            state.launchActive = false;
          }
        }
      } else if (vErr < -0.5) {
        // Regenerative + light brake deceleration toward target
        const decelForce = Math.min(0.65 * MASS * G, Math.abs(vErr) * 1400);
        netForceN = -decelForce - state.dragN - rollingN;
        state.speedMps = Math.max(targetV, v + (netForceN / MASS) * dt);
        wheelPowerW = 0;
      } else {
        // Steady cruise equilibrium
        const steadyForce = state.dragN + rollingN;
        netForceN = 0;
        state.speedMps = targetV;
        wheelPowerW = steadyForce * targetV;
      }

      // Convective cooling of carbon-ceramic discs
      const coolTau = Math.max(4.5, 16 - (state.speedKmh / 350) * 10.5);
      state.brakeTempC += (42 - state.brakeTempC) * (1 - Math.exp(-dt / coolTau));
    }

    state.speedKmh = state.speedMps * 3.6;
    state.accelG = (netForceN / MASS) / G;
    state.pitchRad += ((state.accelG * 0.014) - state.pitchRad) * (1 - Math.exp(-dt / 0.14));

    const targetKw = state.speedKmh < 0.2 && !state.launchActive ? 0 : Math.min(availKw, wheelPowerW / 1000);
    state.powerKw += (targetKw - state.powerKw) * (1 - Math.exp(-dt / 0.08));
    state.powerPs = state.powerKw * 1.35962;

    const wheelRpm = (state.speedMps / WHEEL_R) * (60 / (Math.PI * 2));
    state.v8sRpm = wheelRpm * GEAR_V8S;
    state.v6sRpm = wheelRpm * GEAR_V6S;

    // Status message & warning flag
    state.isWarning = thermalMult < 0.94 || state.brakeTempC > 680;
    if (state.brakeTestActive || state.brakeTempC > 720) {
      state.statusText = `碳陶盘高热 · ${Math.round(state.brakeTempC)} °C`;
    } else if (thermalMult < 0.94) {
      state.statusText = `热衰限功率 · ${Math.round(thermalMult * 100)}% 输出`;
    } else if (state.launchActive) {
      const s100 = state.split0to100 ? ` · 0-100: ${state.split0to100.toFixed(2)}s` : '';
      state.statusText = `全力弹射加速中${s100}`;
    } else if (state.speedKmh > 280) {
      state.statusText = `${mode.label} · 极速空气动力学压载`;
    } else if (state.speedKmh > 1) {
      state.statusText = `${mode.label} · 三电机扭矩矢量驱动`;
    } else {
      state.statusText = `展厅待机 · ${mode.label}就绪`;
    }

    return state;
  }

  return {
    state,
    DRIVE_MODES,
    setDriveMode,
    startLaunch,
    startBrakeTest,
    toggleDerateStress,
    step,
  };
}
