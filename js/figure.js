// ============ DIABLOID: figure.js — jointed human figure & equipment ============
// A proper articulated body: pelvis, spine, neck, head, two arms (upper +
// fore) and two legs (thigh + shin), posed by an animation state machine.
// Equipment is drawn from attachment fixtures, so the gear you equip is the
// gear you see — helm, chest, gloves, boots, belt, cape, weapon and shield.
'use strict';

const Figure = {
  // ---------------- proportions (px, at scale 1) ----------------
  P: {
    pelvisY: -18, chestY: -30, neckY: -37, headY: -43, headR: 5.4,
    shoulderX: 6.2, hipX: 3.4,
    upperArm: 8.2, foreArm: 8.0,
    thigh: 9.5, shin: 9.2,
    chestW: 7.4, chestH: 8.4, waistW: 5.2,
  },

  // ---------------- animation ----------------
  // Returns a pose: joint angles in radians, all relative to straight-down.
  // st: { anim, phase (0..1), aim (-1..1 facing bias), lean }
  pose(st) {
    const p = { armL: 0, armLF: 0, armR: 0, armRF: 0, legL: 0, legLF: 0, legR: 0, legRF: 0,
                spine: 0, head: 0, bob: 0, twist: 0, pelvisTilt: 0 };
    const ph = st.phase * Math.PI * 2;
    switch (st.anim) {
      case 'walk': {
        // contralateral gait: opposite arm and leg swing together
        const sw = Math.sin(ph);
        p.legL = sw * 0.62; p.legR = -sw * 0.62;
        p.legLF = Math.max(0, -Math.sin(ph - 0.6)) * 0.85;
        p.legRF = Math.max(0, -Math.sin(ph + Math.PI - 0.6)) * 0.85;
        p.armL = -sw * 0.5; p.armR = sw * 0.5;
        p.armLF = 0.25 + Math.max(0, sw) * 0.3;
        p.armRF = 0.25 + Math.max(0, -sw) * 0.3;
        p.bob = Math.abs(Math.cos(ph)) * -1.6;
        p.twist = sw * 0.1;
        p.spine = 0.06;
        break;
      }
      case 'run': {
        const sw = Math.sin(ph);
        p.legL = sw * 0.95; p.legR = -sw * 0.95;
        p.legLF = Math.max(0, -Math.sin(ph - 0.5)) * 1.5;
        p.legRF = Math.max(0, -Math.sin(ph + Math.PI - 0.5)) * 1.5;
        p.armL = -sw * 0.85; p.armR = sw * 0.85;
        p.armLF = 1.0; p.armRF = 1.0;
        p.bob = Math.abs(Math.cos(ph)) * -3;
        p.twist = sw * 0.18;
        p.spine = 0.22;
        break;
      }
      case 'attack': {
        // windup -> strike -> recover, driven by phase 0..1
        const f = st.phase;
        const wind = U.clamp(f / 0.35, 0, 1);
        const strike = U.clamp((f - 0.35) / 0.3, 0, 1);
        const rec = U.clamp((f - 0.65) / 0.35, 0, 1);
        p.armR = -1.9 * wind + 3.4 * strike - 1.1 * rec;
        p.armRF = 1.5 * wind - 1.3 * strike + 0.3 * rec;
        p.armL = 0.5 - 0.4 * strike;
        p.armLF = 0.6;
        p.twist = -0.45 * wind + 0.9 * strike - 0.35 * rec;
        p.spine = 0.1 + 0.25 * strike;
        p.legL = 0.3 * strike; p.legR = -0.25 * strike;
        p.bob = -1 * strike;
        break;
      }
      case 'cast': {
        const f = st.phase;
        p.armR = -2.2 * U.clamp(f / 0.4, 0, 1) + 0.5 * U.clamp((f - 0.6) / 0.4, 0, 1);
        p.armRF = -0.7;
        p.armL = -1.1; p.armLF = -0.5;
        p.spine = -0.12;
        p.head = -0.15;
        p.bob = -1.5 * Math.sin(f * Math.PI);
        break;
      }
      case 'hurt': {
        p.spine = -0.35; p.head = -0.25;
        p.armL = -0.7; p.armR = -0.6; p.armLF = 1.0; p.armRF = 1.0;
        p.bob = 1.5;
        break;
      }
      case 'dead': {
        const f = U.clamp(st.phase, 0, 1);
        p.spine = 0.5 * f; p.head = 0.6 * f;
        p.armL = 1.5 * f; p.armR = -1.4 * f;
        p.legL = 0.7 * f; p.legR = -0.5 * f;
        p.bob = 4 * f;
        break;
      }
      case 'dance': {
        const sw = Math.sin(ph * 2);
        p.armL = -2.3 + sw * 0.5; p.armR = -2.3 - sw * 0.5;
        p.armLF = -0.9; p.armRF = -0.9;
        p.legL = sw * 0.4; p.legR = -sw * 0.4;
        p.bob = -Math.abs(sw) * 3.5;
        p.twist = sw * 0.35;
        p.spine = -0.1;
        break;
      }
      default: { // idle — subtle breathing and weight shift
        const br = Math.sin(st.phase * Math.PI * 2);
        p.armL = 0.13 + br * 0.05; p.armR = 0.13 - br * 0.05;
        p.armLF = 0.3; p.armRF = 0.3;
        p.spine = 0.03 + br * 0.02;
        p.bob = br * 0.5;
        p.head = br * 0.04;
      }
    }
    if (st.lean) p.spine += st.lean;
    return p;
  },

  // ---------------- drawing ----------------
  // ctx is pre-translated to the figure's ground point and scaled.
  // `dirIdx` 0..7 chooses the facing; `eq` supplies equipment appearance.
  draw(ctx, opts) {
    const build = opts.build || 'normal';
    const bw = build === 'brute' ? 1.42 : build === 'thin' ? 0.72 : 1;   // width factor
    const P0 = this.P;
    const P = {
      pelvisY: P0.pelvisY, chestY: P0.chestY, neckY: P0.neckY, headY: P0.headY,
      headR: P0.headR * (build === 'brute' ? 1.12 : build === 'thin' ? 0.9 : 1),
      shoulderX: P0.shoulderX * bw, hipX: P0.hipX * bw,
      upperArm: P0.upperArm, foreArm: P0.foreArm, thigh: P0.thigh, shin: P0.shin,
      chestW: P0.chestW * bw, chestH: P0.chestH, waistW: P0.waistW * bw,
    };
    const LW = build === 'brute' ? 1.4 : build === 'thin' ? 0.62 : 1;    // limb thickness
    const pose = opts.pose;
    const pal = opts.pal;
    const eq = opts.eq || {};
    const dirIdx = opts.dir | 0;
    // screen-space facing: 0 = toward camera-right, going clockwise
    const ang = dirIdx * Math.PI / 4;
    const fx = Math.cos(ang);              // lateral facing component
    const depth = Math.sin(ang);           // >0 = facing away from camera
    const back = depth > 0.35;             // seeing their back
    const side = Math.abs(fx);

    const skin = pal.skin || '#c99a6a';
    const cloth = pal.cloth || '#5a4a3a';
    const armorC = eq.chestCol || pal.armor || cloth;
    const trim = pal.trim || '#c9a44f';
    const bootC = eq.bootCol || U.shade(cloth, 0.65);
    const gloveC = eq.gloveCol || U.shade(cloth, 0.8);

    const bob = pose.bob;
    ctx.save();
    ctx.translate(0, bob);
    ctx.lineCap = 'round';

    // ---- helper: draw a two-segment limb from an origin ----
    const limb = (ox, oy, len1, len2, a1, a2, w1, w2, c1, c2) => {
      // angles measured from straight down, positive swings forward (screen +x)
      const x1 = ox + Math.sin(a1) * len1 * (fx >= 0 ? 1 : -1);
      const y1 = oy + Math.cos(a1) * len1;
      const x2 = x1 + Math.sin(a1 + a2) * len2 * (fx >= 0 ? 1 : -1);
      const y2 = y1 + Math.cos(a1 + a2) * len2;
      ctx.strokeStyle = c1; ctx.lineWidth = w1;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = c2; ctx.lineWidth = w2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      return [x2, y2, a1 + a2];
    };

    const hipL = -P.hipX * (0.4 + side * 0.6), hipR = P.hipX * (0.4 + side * 0.6);
    const shL = -P.shoulderX * (0.4 + side * 0.6), shR = P.shoulderX * (0.4 + side * 0.6);
    const legTop = P.pelvisY, armTop = P.chestY - 1;

    // ---- far leg & far arm first (painter order) ----
    const farLeg = back ? 'R' : 'L';
    const drawLeg = (which) => {
      const ox = which === 'L' ? hipL : hipR;
      const a1 = which === 'L' ? pose.legL : pose.legR;
      const a2 = which === 'L' ? pose.legLF : pose.legRF;
      const dim = (which === farLeg) ? 0.78 : 1;
      const [fx2, fy2] = limb(ox, legTop, P.thigh, P.shin, a1, a2,
        4.6 * LW, 3.8 * LW, U.shade(cloth, dim), U.shade(cloth, dim * 0.92));
      // boot fixture
      ctx.fillStyle = U.shade(bootC, dim);
      ctx.beginPath();
      ctx.ellipse(fx2 + (fx >= 0 ? 1.4 : -1.4), fy2 + 1.2, 3.6, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (eq.bootTrim) {
        ctx.strokeStyle = U.rgba(trim, 0.8); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(fx2 - 2.6, fy2 - 2.4); ctx.lineTo(fx2 + 2.6, fy2 - 2.4); ctx.stroke();
      }
    };
    const drawArm = (which) => {
      const ox = which === 'L' ? shL : shR;
      const a1 = which === 'L' ? pose.armL : pose.armR;
      const a2 = which === 'L' ? pose.armLF : pose.armRF;
      const dim = (which === (back ? 'R' : 'L')) ? 0.8 : 1;
      const [hx, hy, ha] = limb(ox, armTop, P.upperArm, P.foreArm, a1, a2,
        3.6 * LW, 3.0 * LW, U.shade(armorC, dim * 0.95), U.shade(skin, dim));
      // glove fixture
      ctx.fillStyle = U.shade(gloveC, dim);
      ctx.beginPath(); ctx.arc(hx, hy, 2.3, 0, Math.PI * 2); ctx.fill();
      return [hx, hy, ha];
    };

    drawLeg(farLeg === 'L' ? 'L' : 'R');
    const farArmHand = drawArm(back ? 'R' : 'L');

    // ---- cape fixture (behind the torso) ----
    if (eq.cape) {
      ctx.save();
      ctx.fillStyle = U.rgba(eq.capeCol || '#6a1420', 0.92);
      ctx.beginPath();
      ctx.moveTo(shL, armTop - 1);
      ctx.quadraticCurveTo(-P.chestW * 1.3, P.pelvisY + 6, -3 + pose.twist * 6, P.pelvisY + 13 - bob * 0.5);
      ctx.lineTo(3 + pose.twist * 6, P.pelvisY + 13 - bob * 0.5);
      ctx.quadraticCurveTo(P.chestW * 1.3, P.pelvisY + 6, shR, armTop - 1);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // ---- torso ----
    ctx.save();
    ctx.translate(0, 0);
    ctx.rotate(pose.spine * 0.35);
    const tg = ctx.createLinearGradient(-P.chestW, P.chestY - 6, P.chestW, P.pelvisY);
    tg.addColorStop(0, U.shade(armorC, 1.28));
    tg.addColorStop(0.55, armorC);
    tg.addColorStop(1, U.shade(armorC, 0.62));
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(-P.chestW * (0.55 + side * 0.45), P.chestY - P.chestH * 0.5);
    ctx.quadraticCurveTo(-P.chestW * (0.7 + side * 0.5), P.chestY + 3, -P.waistW * (0.5 + side * 0.5), P.pelvisY + 1);
    ctx.lineTo(P.waistW * (0.5 + side * 0.5), P.pelvisY + 1);
    ctx.quadraticCurveTo(P.chestW * (0.7 + side * 0.5), P.chestY + 3, P.chestW * (0.55 + side * 0.45), P.chestY - P.chestH * 0.5);
    ctx.closePath();
    ctx.fill();
    if (build === 'thin') {   // exposed ribs
      ctx.strokeStyle = U.shade(armorC, 0.72); ctx.lineWidth = 1.1;
      for (let i = 0; i < 3; i++) {
        const yy = P.chestY - 3 + i * 3.4;
        ctx.beginPath(); ctx.moveTo(-P.chestW * 0.55, yy); ctx.lineTo(P.chestW * 0.55, yy); ctx.stroke();
      }
    }
    // chest armor plating fixture
    if (eq.chestPlate) {
      ctx.strokeStyle = U.rgba(U.shade(armorC, 1.5), 0.7); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-P.chestW * 0.5, P.chestY + 1); ctx.lineTo(P.chestW * 0.5, P.chestY + 1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, P.chestY - 3); ctx.lineTo(0, P.pelvisY); ctx.stroke();
      // pauldrons
      ctx.fillStyle = U.shade(armorC, 0.85);
      if (!back || true) {
        ctx.beginPath(); ctx.ellipse(shL * 1.15, armTop - 1, 3.6, 3.0, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(shR * 1.15, armTop - 1, 3.6, 3.0, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    // belt fixture
    ctx.fillStyle = eq.beltCol || U.shade(cloth, 0.5);
    ctx.fillRect(-P.waistW * (0.55 + side * 0.55), P.pelvisY - 2.6, P.waistW * (1.1 + side * 1.1), 3.2);
    if (eq.beltBuckle) {
      ctx.fillStyle = trim;
      ctx.fillRect(-1.6, P.pelvisY - 2.4, 3.2, 2.8);
    }
    if (pal.trim) {
      ctx.strokeStyle = U.rgba(trim, 0.55); ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-P.chestW * 0.45, P.chestY - 2); ctx.lineTo(P.chestW * 0.45, P.chestY - 2);
      ctx.stroke();
    }
    ctx.restore();

    // ---- head + helm fixture ----
    const headX = fx * 1.6, headY = P.headY + pose.head * 3;
    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(pose.head * 0.5);
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, 0, P.headR, 0, Math.PI * 2); ctx.fill();
    // neck shading
    ctx.fillStyle = U.shade(skin, 0.75);
    ctx.fillRect(-1.8, P.headR * 0.7, 3.6, 2.4);
    if (!back) {
      // face
      if (!eq.helmFull) {
        ctx.fillStyle = pal.eye || '#2a1a10';
        ctx.fillRect(-2.4 + fx * 1.2, -1.2, 1.5, 1.5);
        ctx.fillRect(1.0 + fx * 1.2, -1.2, 1.5, 1.5);
      }
    }
    if (pal.hair && !eq.helm) {
      ctx.fillStyle = pal.hair;
      ctx.beginPath(); ctx.arc(0, -0.9, P.headR * 1.02, Math.PI * 0.92, Math.PI * 2.08); ctx.fill();
      if (back) { ctx.beginPath(); ctx.ellipse(0, 1.2, P.headR * 0.95, P.headR * 0.85, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    if (eq.helm) {
      const hc = eq.helmCol || U.shade(armorC, 1.05);
      const hg = ctx.createLinearGradient(-P.headR, -P.headR, P.headR, P.headR);
      hg.addColorStop(0, U.shade(hc, 1.3)); hg.addColorStop(1, U.shade(hc, 0.7));
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(0, -0.4, P.headR + 0.9, Math.PI, 0);
      ctx.lineTo(P.headR + 0.9, eq.helmFull ? 3.4 : 0.6);
      ctx.lineTo(-P.headR - 0.9, eq.helmFull ? 3.4 : 0.6);
      ctx.closePath(); ctx.fill();
      if (eq.helmFull && !back) {   // visor slit
        ctx.fillStyle = 'rgba(10,8,6,0.85)';
        ctx.fillRect(-P.headR * 0.7, -0.6, P.headR * 1.4, 1.5);
      }
      if (eq.helmCrest) {           // plume
        ctx.fillStyle = eq.crestCol || trim;
        ctx.beginPath();
        ctx.moveTo(-1.4, -P.headR - 0.6);
        ctx.quadraticCurveTo(0, -P.headR - 7, 2.6, -P.headR - 2.5);
        ctx.quadraticCurveTo(1.2, -P.headR - 1.6, 1.4, -P.headR - 0.6);
        ctx.closePath(); ctx.fill();
      }
      if (eq.helmHorns) {
        ctx.strokeStyle = '#d8d0bc'; ctx.lineWidth = 1.6;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * (P.headR - 0.4), -P.headR * 0.7);
          ctx.quadraticCurveTo(s * (P.headR + 3.4), -P.headR - 1.6, s * (P.headR + 1.4), -P.headR - 4.2);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // ---- near leg, near arm, and held gear ----
    drawLeg(farLeg === 'L' ? 'R' : 'L');
    const nearArm = back ? 'L' : 'R';
    const [hx, hy, ha] = drawArm(nearArm);

    // off-hand shield fixture on the far hand
    if (eq.shield) {
      const [ox, oy] = farArmHand;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(farArmHand[2] * 0.4);
      const sc = eq.shieldCol || '#8a8f98';
      const sg = ctx.createLinearGradient(-5, -6, 5, 6);
      sg.addColorStop(0, U.shade(sc, 1.3)); sg.addColorStop(1, U.shade(sc, 0.65));
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5.2, -4); ctx.lineTo(4.4, 4);
      ctx.quadraticCurveTo(0, 8, -4.4, 4); ctx.lineTo(-5.2, -4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = U.rgba(eq.shieldTrim || trim, 0.85); ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();
    }

    // main-hand weapon fixture
    if (eq.weapon) this.drawWeapon(ctx, eq, hx, hy, ha, fx, pose);

    ctx.restore();
  },

  // ---------------- weapon fixtures ----------------
  drawWeapon(ctx, eq, hx, hy, ha, fx, pose) {
    const w = eq.weapon;
    const metal = eq.wMetal || '#c8ccd4';
    const wood = eq.wWood || '#7a5a34';
    const glow = eq.wGlow;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ha * (fx >= 0 ? 1 : -1) + (fx >= 0 ? -Math.PI / 2 : Math.PI / 2));
    if (fx < 0) ctx.scale(-1, 1);
    const L = eq.wLen || 1;
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 7; }
    switch (w) {
      case 'sword':
        ctx.strokeStyle = '#5a4020'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(0, 0); ctx.stroke();
        ctx.strokeStyle = eq.wGuard || '#8a6b31'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, 3); ctx.stroke();
        ctx.fillStyle = metal;
        ctx.beginPath();
        ctx.moveTo(1, -1.5); ctx.lineTo(15 * L, -1.1); ctx.lineTo(18 * L, 0); ctx.lineTo(15 * L, 1.1); ctx.lineTo(1, 1.5);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = U.rgba('#ffffff', 0.32);
        ctx.fillRect(1, -1.2, 14 * L, 0.7);
        break;
      case 'axe':
        ctx.strokeStyle = wood; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(14 * L, 0); ctx.stroke();
        ctx.fillStyle = metal;
        ctx.beginPath();
        ctx.moveTo(9 * L, -1.5); ctx.lineTo(16 * L, -7); ctx.lineTo(19 * L, -1);
        ctx.lineTo(16 * L, 5); ctx.lineTo(9 * L, 1.5);
        ctx.closePath(); ctx.fill();
        break;
      case 'mace':
        ctx.strokeStyle = wood; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(12 * L, 0); ctx.stroke();
        ctx.fillStyle = metal;
        ctx.beginPath(); ctx.arc(15 * L, 0, 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = U.shade(metal, 0.7);
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3;
          ctx.beginPath(); ctx.arc(15 * L + Math.cos(a) * 4.6, Math.sin(a) * 4.6, 1.5, 0, Math.PI * 2); ctx.fill();
        }
        break;
      case 'dagger': case 'claw':
        ctx.strokeStyle = '#4a3420'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-2.5, 0); ctx.lineTo(0, 0); ctx.stroke();
        ctx.fillStyle = metal;
        ctx.beginPath();
        ctx.moveTo(0, -1.4); ctx.lineTo(8 * L, -0.8); ctx.lineTo(10 * L, 0); ctx.lineTo(8 * L, 0.8); ctx.lineTo(0, 1.4);
        ctx.closePath(); ctx.fill();
        break;
      case 'spear':
        ctx.strokeStyle = wood; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(17 * L, 0); ctx.stroke();
        ctx.fillStyle = metal;
        ctx.beginPath();
        ctx.moveTo(16 * L, -2.4); ctx.lineTo(23 * L, 0); ctx.lineTo(16 * L, 2.4);
        ctx.closePath(); ctx.fill();
        break;
      case 'staff': case 'wand': {
        ctx.strokeStyle = wood; ctx.lineWidth = w === 'staff' ? 2.6 : 2;
        const len = w === 'staff' ? 20 * L : 12 * L;
        ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(len, 0); ctx.stroke();
        const oc = eq.wOrb || '#c07bff';
        ctx.fillStyle = oc;
        ctx.shadowColor = oc; ctx.shadowBlur = 9;
        ctx.beginPath(); ctx.arc(len + 2.5, 0, w === 'staff' ? 3.4 : 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.arc(len + 1.6, -1, 1.1, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'bow': {
        ctx.strokeStyle = wood; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(3, 0, 10 * L, -1.35, 1.35); ctx.stroke();
        ctx.strokeStyle = '#d8d2be'; ctx.lineWidth = 0.8;
        const yy = 10 * L * Math.sin(1.35);
        ctx.beginPath();
        ctx.moveTo(3 + 10 * L * Math.cos(-1.35), -yy);
        ctx.lineTo(1, 0);
        ctx.lineTo(3 + 10 * L * Math.cos(1.35), yy);
        ctx.stroke();
        break;
      }
      case 'crossbow':
        ctx.fillStyle = wood;
        ctx.fillRect(-3, -1.4, 15 * L, 2.8);
        ctx.strokeStyle = metal; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(11 * L, 0, 7, -1.5, 1.5); ctx.stroke();
        break;
      case 'orb': {
        const oc = eq.wOrb || '#7bdcff';
        ctx.fillStyle = U.rgba(oc, 0.85);
        ctx.shadowColor = oc; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(4, 0, 4, 0, Math.PI * 2); ctx.fill();
        break;
      }
      default:
        ctx.strokeStyle = metal; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(13 * L, 0); ctx.stroke();
    }
    ctx.restore();
  },

  // ---------------- equipment description from real gear ----------------
  // Reads the player's actual equipped items into drawing fixtures.
  equipOf(pl) {
    const cls = CLASSES.find(c => c.id === pl.cls) || { pal: {} };
    const e = {};
    for (const [slot, item] of Object.entries(pl.equip || {}))
      e[slot] = (typeof ItemIdentification !== 'undefined' && ItemIdentification.needsIdentification(item)) ||
        (typeof InventoryCharms !== 'undefined' && InventoryCharms.isCharmRecord(item)) ? null : item;
    const rc = it => it ? Items.rarityColor(it.rarity) : null;
    const wep = e.weapon;
    const base = wep ? Items.baseById(wep.type) : null;
    const eq = {
      weapon: wep ? wep.type : (cls.weapon || 'sword'),
      wLen: wep && wep.tier ? 1 + wep.tier * 0.07 : 1,
      wMetal: wep && wep.rarity !== 'common' ? U.shade(rc(wep), 1.15) : '#c8ccd4',
      wGlow: wep && (wep.rarity === 'unique' || wep.rarity === 'set') ? rc(wep) : null,
      wOrb: wep ? (wep.rarity !== 'common' ? rc(wep) : (cls.pal ? cls.pal.trim : '#c07bff')) : '#c07bff',
      wGuard: wep && wep.rarity !== 'common' ? rc(wep) : '#8a6b31',
      shield: !!(e.offhand && e.offhand.slot === 'offhand'),
      shieldCol: e.offhand ? (e.offhand.rarity !== 'common' ? U.shade(rc(e.offhand), 0.9) : '#8a8f98') : '#8a8f98',
      shieldTrim: e.offhand ? rc(e.offhand) : null,
      helm: !!e.helm,
      helmCol: e.helm ? (e.helm.rarity !== 'common' ? U.shade(rc(e.helm), 0.85) : '#9098a4') : null,
      helmFull: !!(e.helm && (e.helm.tier || 0) >= 2),
      helmCrest: !!(e.helm && ['rare', 'set', 'unique'].includes(e.helm.rarity)),
      helmHorns: !!(e.helm && e.helm.rarity === 'unique'),
      crestCol: e.helm ? rc(e.helm) : null,
      chestCol: e.chest ? (e.chest.rarity !== 'common' ? U.shade(rc(e.chest), 0.72) : U.shade(cls.pal.armor || '#5a4a3a', 1)) : (cls.pal.armor || '#5a4a3a'),
      chestPlate: !!e.chest,
      gloveCol: e.gloves ? U.shade(rc(e.gloves), 0.72) : null,
      bootCol: e.boots ? U.shade(rc(e.boots), 0.72) : null,
      bootTrim: !!(e.boots && e.boots.rarity !== 'common'),
      beltCol: e.belt ? U.shade(rc(e.belt), 0.6) : null,
      beltBuckle: !!e.belt,
      cape: !!(e.chest && ['rare', 'set', 'unique'].includes(e.chest.rarity)),
      capeCol: e.chest ? U.shade(rc(e.chest), 0.55) : '#6a1420',
    };
    return eq;
  },
};
