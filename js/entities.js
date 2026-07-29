// ============ DIABLOID: entities.js — combat, AI, skills engine ============
'use strict';

const Ent = {

  BOSS_ADD_CAP: 6,

  mercXpForLevel(level) { return 80 + level * level * 45; },
  mercDerived(state) {
    const def = MERCENARY_BY_ID[state.archetypeId], bonus = {};
    for (const item of Object.values(state.equipment || {})) if (item) {
      for (const [key, value] of Object.entries(item.stats || {})) bonus[key] = (bonus[key] || 0) + value;
      if (item.armor) bonus.armor = (bonus.armor || 0) + item.armor;
    }
    const weapon = state.equipment && state.equipment.weapon;
    return { maxHp: Math.floor(def.baseHp + def.hpLvl * (state.level - 1) + (bonus.hp || 0) + (bonus.vit || 0) * 3),
      dmgLo: (weapon && weapon.dmg ? weapon.dmg[0] : def.dmg[0] + def.dmgLvl * (state.level - 1)) + (bonus.dmgFlat || 0),
      dmgHi: (weapon && weapon.dmg ? weapon.dmg[1] : def.dmg[1] + def.dmgLvl * (state.level - 1)) + (bonus.dmgFlat || 0),
      armor: (bonus.armor || 0), resist: U.clamp((bonus.allRes || 0) / 100, 0, 0.65) };
  },
  syncMercenary() {
    const state = G.player && G.player.mercenary;
    if (!state || state.dead || G.monsters.some(m => m.mercenary && !m.dead)) return null;
    const def = MERCENARY_BY_ID[state.archetypeId], d = this.mercDerived(state);
    const m = { fam: state.archetypeId, def, name: def.name, x: G.player.x + 1, y: G.player.y + 1,
      size: 1, lvl: state.level, spd: def.spd, ai: def.ai, elem: def.elem, xpVal: 0, rank: 'normal', mods: [],
      ally: true, owner: G.player, mercenary: true, mercState: state, dir: 0, anim: 0, atkCd: .5, abilityCd: 1,
      stunT: 0, debuffs: {}, dead: false, deathT: 0, aggro: true, wanderT: 0, wanderA: 0, resist: d.resist, hitT: 0,
      maxHp: d.maxHp, hp: d.maxHp, dmgLo: d.dmgLo, dmgHi: d.dmgHi };
    G.monsters.push(m); return m;
  },
  awardMercXp(amount) {
    const s = G.player && G.player.mercenary;
    if (!s || s.dead) return;
    s.xp += Math.max(1, Math.floor(amount * .35));
    while (s.level < G.player.lvl && s.xp >= this.mercXpForLevel(s.level)) {
      s.xp -= this.mercXpForLevel(s.level); s.level++;
      UI.announce(`${MERCENARY_BY_ID[s.archetypeId].name} reached level ${s.level}`, '#8fc8ff');
    }
  },

  // ======================= derived stats =======================
  computeDerived(pl) {
    const cls = CLASSES.find(c => c.id === pl.cls);
    const g = {}; // aggregated gear + buff + passive stats
    const add = (k, v) => { g[k] = (g[k] || 0) + v; };

    // equipment
    for (const slot in pl.equip) {
      const it = pl.equip[slot];
      if (!it) continue;
      for (const k in it.stats) add(k, it.stats[k]);
      if (it.armor) add('armor', it.armor);
      if (it.spellPct) add('spellPct', it.spellPct);
      if (it.critBonus) add('critCh', it.critBonus);
    }
    // set bonuses
    const setCounts = {};
    for (const slot in pl.equip) { const it = pl.equip[slot]; if (it && it.setId) setCounts[it.setId] = (setCounts[it.setId] || 0) + 1; }
    for (const sid in setCounts) {
      const set = SETS.find(s => s.id === sid);
      for (const nStr in set.bonuses) if (setCounts[sid] >= +nStr)
        for (const k in set.bonuses[nStr]) add(k, set.bonuses[nStr][k]);
    }
    // passive skills
    for (const skId in pl.skills) {
      const sk = SKILL_BY_ID[skId];
      const lvl = pl.skills[skId];
      if (sk && sk.passive && lvl > 0) for (const k in sk.passive) add(k, sk.passive[k] * lvl);
    }
    // buffs
    for (const b of pl.buffs) for (const k in b.stats) add(k, b.stats[k]);

    const d = {};
    d.str = cls.base.str + (pl.stats.str || 0) + (g.str || 0);
    d.dex = cls.base.dex + (pl.stats.dex || 0) + (g.dex || 0);
    d.vit = cls.base.vit + (pl.stats.vit || 0) + (g.vit || 0);
    d.ene = cls.base.ene + (pl.stats.ene || 0) + (g.ene || 0);
    d.maxHp = Math.floor(50 + d.vit * 3.5 + pl.lvl * 6 + (g.hp || 0));
    d.maxMp = Math.floor(20 + d.ene * 2 + pl.lvl * 2 + (g.mp || 0));
    d.armor = Math.floor(((g.armor || 0)) * (1 + (g.armorPct || 0) / 100) + d.dex * 0.8);
    d.physMult = 1 + d[cls.dmgStat] * 0.013 + (g.dmgPct || 0) / 100;
    d.spellPower = 1 + d.ene * 0.011 + (g.spellPct || 0) / 100 + (g.dmgPct || 0) / 200;
    d.atkRate = 1.9 * (pl.equip.weapon ? pl.equip.weapon.spd : 1.1) * (1 + (g.atkSpd || 0) / 100);
    d.critCh = U.clamp(5 + d.dex * 0.05 + (g.critCh || 0), 0, 75);
    d.critDmg = 1.5 + (g.critDmg || 0) / 100;
    d.moveSpd = 4.6 * (1 + (g.moveSpd || 0) / 100);
    for (const r of ['fireRes', 'coldRes', 'liteRes', 'poisRes', 'arcRes'])
      d[r] = U.clamp((g[r] || 0) + (g.allRes || 0), -50, 75);
    d.leechHp = (g.leechHp || 0); d.leechMp = (g.leechMp || 0);
    d.mf = (g.mf || 0); d.goldFind = (g.goldFind || 0);
    d.lightRad = 7.6 + (g.lightRad || 0);
    d.allSkills = Math.floor(g.allSkills || 0);
    d.thorns = (g.thorns || 0);
    d.regenHp = 0.3 + (g.regenHp || 0); d.regenMp = 1.2 + d.ene * 0.015 + (g.regenMp || 0);
    d.minionDmg = (g.minionDmg || 0); d.minionHp = (g.minionHp || 0);
    d.xpGain = (g.xpGain || 0);
    d.stunOnHit = (g.stunOnHit || 0);
    d.pierce = Math.max(0, Math.floor(g.pierce || 0));
    d.flatElem = { fire: g.fireDmg || 0, cold: g.coldDmg || 0, lite: g.liteDmg || 0, pois: g.poisDmg || 0, arc: g.arcDmg || 0, holy: g.holyDmg || 0 };
    pl.derived = d;
    return d;
  },

  skillLvl(pl, skId) {
    const alloc = pl.skills[skId] || 0;
    if (alloc <= 0) return 0;
    return Math.min(SKILL_BY_ID[skId].maxLvl + 5, alloc + (pl.derived ? pl.derived.allSkills : 0));
  },

  weaponDmg(pl) {
    const w = pl.equip.weapon;
    return w && w.dmg ? w.dmg : [1, 3];
  },

  // physical/weapon-scaled skill damage roll
  rollWeaponDmg(pl, mult) {
    const [lo, hi] = this.weaponDmg(pl);
    const base = U.rf(U.rand, lo, hi) + (pl.equip.weapon && pl.equip.weapon.stats.dmgFlat || 0);
    return base * mult * pl.derived.physMult;
  },

  rollSpellDmg(pl, sk, lvl) {
    const growth = 1 + (sk.dmgLvl || 0.3) * (lvl - 1);
    return U.rf(U.rand, sk.dmg[0], sk.dmg[1]) * growth * pl.derived.spellPower;
  },

  manaCost(sk, lvl) { return Math.round(sk.mana * (1 + 0.06 * (lvl - 1))); },

  // Effective reach of an ability, in tiles. Self-centred archetypes report
  // their own radius (you must stand near the target); aimed ones report how
  // far from the caster the effect can be placed; projectiles derive it from
  // travel speed and lifetime. Passives and self-buffs are unlimited.
  PROJ_TTL: 2.2, CHAIN_TTL: 1.6,
  skillRange(sk, pl) {
    if (!sk) {                                    // plain weapon attack
      const w = pl && pl.equip ? pl.equip.weapon : null;
      const base = w ? Items.baseById(w.type) : null;
      return (base && (base.ranged || base.caster)) ? 8.5 : 2.0;
    }
    switch (sk.arch) {
      case 'strike': return sk.range || 1.9;
      case 'slam': case 'nova': return sk.radius || 2.5;
      case 'proj': return sk.range || (sk.speed || 10) * this.PROJ_TTL;
      case 'chain': return sk.range || (sk.speed || 10) * this.CHAIN_TTL;
      case 'beam': return sk.range || 9;
      case 'dash': return sk.range || 6;
      case 'trap': return sk.range || 6;
      case 'meteor': case 'storm': case 'curse': return sk.range || sk.castRange || 11;
      case 'summon': case 'buff': case 'passive': case 'heal': return Infinity;
      default: return sk.range || 9;
    }
  },

  // ======================= SKILL CASTING =======================
  // Returns true if cast happened.
  castSkill(pl, skId, tx, ty) {
    if (skId === 'atk') return this.basicAttack(pl, tx, ty);
    const sk = SKILL_BY_ID[skId];
    if (!sk || sk.arch === 'passive') return false;
    const lvl = this.skillLvl(pl, skId);
    if (lvl <= 0) return false;
    if (pl.gcd > 0) return false;
    if ((pl.cds[skId] || 0) > 0) { return false; }
    const cost = this.manaCost(sk, lvl);
    if (pl.mp < cost) { UI.flashMana(); return false; }

    pl.mp -= cost;
    this._src = sk.name; // damage-meter attribution
    const srcName = sk.name;
    pl.lastCastArch = sk.arch;
    if (sk.cd) pl.cds[skId] = sk.cd;
    pl.gcd = sk.wd ? 1 / pl.derived.atkRate : 0.38;
    pl.attackT = 0.32;
    pl.dir = U.angleTo(pl.x, pl.y, tx, ty);
    const d = pl.derived;
    const ang = pl.dir;
    const elemFlat = sk.wd ? (d.flatElem[sk.elem === 'phys' ? 'fire' : sk.elem] || 0) * 0 + this.totalFlat(d) : 0;

    switch (sk.arch) {
      case 'strike': {
        sfx('swing');
        const range = sk.range || 1.9, arcW = sk.arcW || 1.2, hits = sk.hits || 1;
        let any = false;
        for (const m of G.monsters) {
          if (m.ally || m.dead) continue;
          const dist = U.dist(pl.x, pl.y, m.x, m.y) - m.size * 0.3;
          if (dist > range) continue;
          if (Math.abs(U.angDiff(ang, U.angleTo(pl.x, pl.y, m.x, m.y))) > arcW / 2 + 0.2) continue;
          for (let hh = 0; hh < hits; hh++) {
            let dmg = this.rollWeaponDmg(pl, (sk.wd + (sk.wdLvl || 0) * (lvl - 1)) / 100) + elemFlat;
            if (sk.flat) dmg += U.rf(U.rand, sk.flat[0], sk.flat[1]) * (1 + 0.2 * (lvl - 1));
            const crit = U.chance(U.rand, d.critCh / 100);
            if (crit) dmg *= d.critDmg;
            this.damageMonster(m, dmg, sk.elem, { crit, from: pl, srcName });
            if (sk.wd) this.applyWeaponHitEffects(m, pl);
            if (sk.dot) this.applyDebuff(m, { dot: sk.dot * (1 + 0.2 * (lvl - 1)), dotElem: sk.elem === 'phys' ? 'pois' : sk.elem }, 4);
            if (sk.stun) m.stunT = Math.max(m.stunT, sk.stun);
            if (sk.slowHit) this.applyDebuff(m, { slow: sk.slowHit }, 2.5);
            if (sk.knock) { const ka = U.angleTo(pl.x, pl.y, m.x, m.y); this.tryMove(m, Math.cos(ka) * sk.knock, Math.sin(ka) * sk.knock); }
            if (sk.healPct) pl.hp = Math.min(d.maxHp, pl.hp + dmg * sk.healPct / 100);
          }
          any = true;
        }
        // slash fx
        FX.slash(pl.x, pl.y, ang, range, ELEM[sk.elem].color);
        if (any) sfx('hit');
        break;
      }
      case 'slam': {
        sfx('explode');
        const radius = sk.radius || 2.5;
        for (const m of G.monsters) {
          if (m.ally || m.dead) continue;
          if (U.dist(pl.x, pl.y, m.x, m.y) > radius + m.size * 0.3) continue;
          let dmg = sk.wd ? this.rollWeaponDmg(pl, (sk.wd + (sk.wdLvl || 0) * (lvl - 1)) / 100) + elemFlat : this.rollSpellDmg(pl, sk, lvl);
          const crit = U.chance(U.rand, d.critCh / 100);
          if (crit) dmg *= d.critDmg;
          this.damageMonster(m, dmg, sk.elem, { crit, from: pl, srcName });
          if (sk.wd) this.applyWeaponHitEffects(m, pl);
          if (sk.stun) m.stunT = Math.max(m.stunT, sk.stun);
        }
        FX.ring(pl.x, pl.y, radius, ELEM[sk.elem].color);
        G.shake += 5;
        break;
      }
      case 'proj': {
        sfx(sk.elem === 'fire' ? 'fire' : sk.elem === 'cold' ? 'ice' : sk.elem === 'lite' ? 'lightning' : 'shoot');
        const count = (sk.count || 1) + Math.floor((sk.countLvl || 0) * (lvl - 1));
        const spread = sk.spread || 0;
        const elems = sk.multiElem ? ['fire', 'cold', 'lite'] : null;
        for (let i = 0; i < count; i++) {
          const off = count > 1 ? (i / (count - 1) - 0.5) * spread : 0;
          const a = ang + off;
          const dmg = sk.wd
            ? this.rollWeaponDmg(pl, (sk.wd + (sk.wdLvl || 0) * (lvl - 1)) / 100) + elemFlat + (sk.flat ? U.rf(U.rand, sk.flat[0], sk.flat[1]) * (1 + 0.2 * (lvl - 1)) : 0)
            : this.rollSpellDmg(pl, sk, lvl);
          G.projs.push({
            x: pl.x, y: pl.y, vx: Math.cos(a) * sk.speed, vy: Math.sin(a) * sk.speed,
            dmg, elem: elems ? elems[i % 3] : sk.elem, ally: true, from: pl, r: 0.3,
            ttl: 2.2, pierce: (sk.pierce || 0) + (sk.wd ? d.pierce : 0), explodeR: sk.explodeR || 0,
            homing: sk.homing, wobble: sk.wobble, orb: sk.orb, orbT: 0, orbRate: sk.orbRate,
            slowHit: sk.slowHit, crit: U.chance(U.rand, d.critCh / 100), kind: sk.orb ? 'orb' : 'bolt', srcName,
            weaponHit: !!sk.wd,
          });
        }
        break;
      }
      case 'nova': {
        sfx(sk.elem === 'cold' ? 'ice' : sk.elem === 'fire' ? 'fire' : 'lightning');
        const count = sk.count || 12;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          let dmg = this.rollSpellDmg(pl, sk, lvl);
          if (sk.wd) dmg += this.rollWeaponDmg(pl, (sk.wd + (sk.wdLvl || 0) * (lvl - 1)) / 100);
          G.projs.push({
            x: pl.x, y: pl.y, vx: Math.cos(a) * sk.speed, vy: Math.sin(a) * sk.speed,
            dmg, elem: sk.elem, ally: true, from: pl, r: 0.3, ttl: 1.1,
            slowHit: sk.slowHit, crit: U.chance(U.rand, d.critCh / 100), kind: 'bolt', srcName,
            weaponHit: !!sk.wd, pierce: sk.wd ? d.pierce : 0,
          });
        }
        FX.ring(pl.x, pl.y, 1.2, ELEM[sk.elem].color);
        break;
      }
      case 'beam': {
        sfx(sk.elem === 'lite' ? 'lightning' : 'shoot');
        const range = sk.range || 9;
        const hitSet = new Set();
        for (let t = 0.5; t < range; t += 0.4) {
          const bx = pl.x + Math.cos(ang) * t, by = pl.y + Math.sin(ang) * t;
          if (Dungeon.isWall(G.map, Math.floor(bx), Math.floor(by))) break;
          FX.spark(bx, by, ELEM[sk.elem].color, 1);
          for (const m of G.monsters) {
            if (m.ally || m.dead || hitSet.has(m)) continue;
            if (U.dist(bx, by, m.x, m.y) < 0.75 + m.size * 0.25) {
              hitSet.add(m);
              let dmg = this.rollSpellDmg(pl, sk, lvl);
              const crit = U.chance(U.rand, d.critCh / 100);
              if (crit) dmg *= d.critDmg;
              this.damageMonster(m, dmg, sk.elem, { crit, from: pl, srcName });
              if (sk.slowHit) this.applyDebuff(m, { slow: sk.slowHit }, 2.5);
              if (sk.healPct) pl.hp = Math.min(d.maxHp, pl.hp + dmg * sk.healPct / 100);
            }
          }
        }
        break;
      }
      case 'meteor': {
        sfx('shoot');
        const dist = Math.min(U.dist(pl.x, pl.y, tx, ty), 9);
        const mx = pl.x + Math.cos(ang) * dist, my = pl.y + Math.sin(ang) * dist;
        G.pending.push({
          x: mx, y: my, t: sk.delay || 0.8, radius: sk.radius || 2.5,
          dmg: this.rollSpellDmg(pl, sk, lvl), elem: sk.elem, ally: true, from: pl,
          linger: sk.linger || 0, lingerDps: sk.linger ? this.rollSpellDmg(pl, sk, lvl) * 0.25 : 0, srcName,
        });
        break;
      }
      case 'chain': {
        sfx('lightning');
        const jumps = (sk.jumps || 3) + Math.floor((sk.jumpsLvl || 0) * (lvl - 1));
        G.projs.push({
          x: pl.x, y: pl.y, vx: Math.cos(ang) * sk.speed, vy: Math.sin(ang) * sk.speed,
          dmg: this.rollSpellDmg(pl, sk, lvl), elem: sk.elem, ally: true, from: pl,
          r: 0.35, ttl: 1.6, jumps, kind: 'bolt', crit: U.chance(U.rand, d.critCh / 100), srcName,
        });
        break;
      }
      case 'summon': {
        sfx('shrine');
        const maxN = (sk.maxN || 1) + Math.floor((sk.maxNLvl || 0) * lvl);
        const n = sk.count || 1;
        for (let i = 0; i < n; i++) {
          const mine = G.monsters.filter(m => m.ally && !m.dead && m.summonSkill === skId);
          if (mine.length >= maxN) { const oldest = mine[0]; oldest.dead = true; oldest.hp = 0; }
          const a = U.rand() * Math.PI * 2;
          this.makeMinion(sk.minion, pl.x + Math.cos(a) * 1.2, pl.y + Math.sin(a) * 1.2, pl, lvl, skId, sk.dur || 60);
        }
        break;
      }
      case 'trap': {
        sfx('trap');
        const maxN = sk.maxN || 3;
        const mine = G.monsters.filter(m => m.ally && !m.dead && m.summonSkill === skId);
        if (mine.length >= maxN) { mine[0].dead = true; mine[0].hp = 0; }
        const dist = Math.min(U.dist(pl.x, pl.y, tx, ty), 7);
        const mx = pl.x + Math.cos(ang) * dist, my = pl.y + Math.sin(ang) * dist;
        const trap = this.makeMinion(null, mx, my, pl, lvl, skId, sk.dur || 20);
        trap.trap = { def: sk, t: 0, lvl };
        trap.size = 0.7; trap.maxHp = trap.hp = 30 + lvl * 10;
        trap.spd = 0; trap.fam = 'trap'; trap.elem = sk.elem;
        break;
      }
      case 'storm': {
        sfx(sk.elem === 'fire' ? 'fire' : sk.elem === 'lite' ? 'lightning' : 'ice');
        const dist = Math.min(U.dist(pl.x, pl.y, tx, ty), 8);
        const sx2 = pl.x + Math.cos(ang) * dist, sy2 = pl.y + Math.sin(ang) * dist;
        G.storms.push({
          x: sx2, y: sy2, radius: sk.radius || 5, elem: sk.elem, ally: true, from: pl,
          strikes: sk.strikes || 10, interval: (sk.dur || 4) / (sk.strikes || 10), t: 0,
          dmg: this.rollSpellDmg(pl, sk, lvl), left: sk.strikes || 10, srcName,
        });
        break;
      }
      case 'buff': {
        sfx('potion');
        const scale = 1 + 0.14 * (lvl - 1);
        const stats = {};
        for (const k in sk.buff) stats[k] = Math.round(sk.buff[k] * scale * 10) / 10;
        const dur = (sk.dur || 10) + (sk.durLvl || 0) * lvl;
        pl.buffs = pl.buffs.filter(b => b.name !== sk.name);
        pl.buffs.push({ name: sk.name, stats, t: dur, maxT: dur, color: ELEM[sk.elem].color });
        FX.ring(pl.x, pl.y, 1.4, ELEM[sk.elem].color);
        break;
      }
      case 'curse': {
        sfx('poison');
        const dist = Math.min(U.dist(pl.x, pl.y, tx, ty), 9);
        const cx = pl.x + Math.cos(ang) * dist, cy = pl.y + Math.sin(ang) * dist;
        const scale = 1 + 0.1 * (lvl - 1);
        const dur = (sk.dur || 8) * (1 + 0.05 * (lvl - 1));
        for (const m of G.monsters) {
          if (m.ally || m.dead) continue;
          if (U.dist(cx, cy, m.x, m.y) > (sk.radius || 4)) continue;
          const deb = {};
          for (const k in sk.debuff) deb[k] = k === 'dotElem' ? sk.debuff[k] : sk.debuff[k] * (k === 'dot' ? scale * pl.derived.spellPower : Math.min(scale, 1.6));
          this.applyDebuff(m, deb, dur);
        }
        FX.ring(cx, cy, sk.radius || 4, ELEM[sk.elem].color);
        break;
      }
      case 'dash': {
        sfx('portal');
        const dist = Math.min(U.dist(pl.x, pl.y, tx, ty), sk.range || 6);
        let nx = pl.x, ny = pl.y;
        for (let t = 0.4; t <= dist; t += 0.4) {
          const px2 = pl.x + Math.cos(ang) * t, py2 = pl.y + Math.sin(ang) * t;
          if (Dungeon.isWall(G.map, Math.floor(px2), Math.floor(py2))) break;
          nx = px2; ny = py2;
          if (sk.blink) FX.spark(px2, py2, '#c07bff', 2);
        }
        FX.ring(pl.x, pl.y, 0.8, '#c07bff');
        pl.x = nx; pl.y = ny;
        if (sk.wd) { // damaging landing
          for (const m of G.monsters) {
            if (m.ally || m.dead) continue;
            if (U.dist(pl.x, pl.y, m.x, m.y) > (sk.radius || 2)) continue;
            let dmg = this.rollWeaponDmg(pl, (sk.wd + (sk.wdLvl || 0) * (lvl - 1)) / 100) + elemFlat;
            const crit = U.chance(U.rand, d.critCh / 100);
            if (crit) dmg *= d.critDmg;
            this.damageMonster(m, dmg, sk.elem, { crit, from: pl, srcName });
          }
          FX.ring(pl.x, pl.y, sk.radius || 2, ELEM[sk.elem].color);
          G.shake += 6;
        }
        break;
      }
      case 'heal': {
        sfx('potion');
        const amt = (sk.heal + (sk.healLvl || 0) * (lvl - 1)) * (1 + pl.derived.spellPower * 0.2);
        pl.hp = Math.min(d.maxHp, pl.hp + amt);
        UI.dmgNum(pl.x, pl.y, '+' + Math.floor(amt), '#6be26b');
        FX.ring(pl.x, pl.y, 1.3, '#6be26b');
        break;
      }
    }
    return true;
  },

  totalFlat(d) {
    return d.flatElem.fire + d.flatElem.cold + d.flatElem.lite + d.flatElem.pois + d.flatElem.arc + d.flatElem.holy;
  },

  // stunOnHit's value is the stun duration in seconds. A qualifying weapon hit
  // rolls this fixed chance once; multiple sources add duration, not chance.
  STUN_ON_HIT_CHANCE: 0.2,
  applyWeaponHitEffects(target, attacker) {
    const duration = attacker && attacker.derived ? attacker.derived.stunOnHit : 0;
    if (duration > 0 && U.chance(U.rand, this.STUN_ON_HIT_CHANCE))
      target.stunT = Math.max(target.stunT || 0, duration);
  },

  basicAttack(pl, tx, ty) {
    if (pl.gcd > 0) return false;
    this._src = 'Attack';
    pl.lastCastArch = 'strike';
    const d = pl.derived;
    pl.gcd = 1 / d.atkRate;
    pl.attackT = 0.3;
    pl.dir = U.angleTo(pl.x, pl.y, tx, ty);
    const w = pl.equip.weapon;
    const flat = this.totalFlat(d);
    if (w && (w.ranged || Items.baseById(w.type).caster)) {
      const caster = !!Items.baseById(w.type).caster;
      sfx('shoot');
      const dmg = this.rollWeaponDmg(pl, 1.35) + flat;
      G.projs.push({
        x: pl.x, y: pl.y, vx: Math.cos(pl.dir) * 14, vy: Math.sin(pl.dir) * 14,
        dmg, elem: caster ? 'arc' : 'phys', ally: true, from: pl, r: 0.28, ttl: 1.8,
        crit: U.chance(U.rand, d.critCh / 100), kind: caster ? 'orb' : 'arrow', srcName: 'Attack',
        weaponHit: true, pierce: d.pierce,
      });
    } else {
      sfx('swing');
      let any = false;
      for (const m of G.monsters) {
        if (m.ally || m.dead) continue;
        if (U.dist(pl.x, pl.y, m.x, m.y) - m.size * 0.3 > 1.9) continue;
        if (Math.abs(U.angDiff(pl.dir, U.angleTo(pl.x, pl.y, m.x, m.y))) > 1.05) continue;
        let dmg = this.rollWeaponDmg(pl, 1.35) + flat;
        const crit = U.chance(U.rand, d.critCh / 100);
        if (crit) dmg *= d.critDmg;
        this.damageMonster(m, dmg, 'phys', { crit, from: pl, srcName: 'Attack' });
        this.applyWeaponHitEffects(m, pl);
        any = true;
      }
      FX.slash(pl.x, pl.y, pl.dir, 1.7, '#cfcfcf');
      if (any) sfx('hit');
    }
    return true;
  },

  // ======================= MONSTERS =======================
  scaleHp(base, mlvl) { return Math.floor(base * (1 + mlvl * 0.26 + mlvl * mlvl * 0.012)); },
  scaleDmg(base, mlvl) { return base * (1 + mlvl * 0.13 + mlvl * mlvl * 0.0035); },

  makeMonster(fam, x, y, opts = {}) {
    const def = MONSTERS[fam];
    const mlvl = opts.mlvl || 1;
    const m = {
      fam, def, name: def.name, x, y, size: def.size, lvl: mlvl,
      hp: 0, maxHp: 0, dmgLo: 0, dmgHi: 0, spd: def.spd, ai: def.ai, elem: def.elem || 'phys',
      xpVal: Math.floor((8 + mlvl * 7) * def.xp), rank: 'normal', mods: [],
      dir: U.rand() * Math.PI * 2, anim: U.rand() * 4, atkCd: U.rf(U.rand, 0.5, 1.5), abilityCd: 2,
      stunT: 0, debuffs: {}, debuffT: 0, dead: false, deathT: 0, aggro: false,
      wanderT: 0, wanderA: 0, resist: 0, fly: def.fly, hitT: 0,
    };
    m.maxHp = m.hp = this.scaleHp(def.hp, mlvl);
    m.dmgLo = this.scaleDmg(def.dmg[0], mlvl); m.dmgHi = this.scaleDmg(def.dmg[1], mlvl);

    if (opts.rank === 'champion') {
      m.rank = 'champion'; m.maxHp = m.hp = Math.floor(m.maxHp * 1.9); m.dmgLo *= 1.25; m.dmgHi *= 1.25;
      m.xpVal *= 3; m.name = 'Champion ' + m.name; m.size *= 1.12; m.resist = 0.1;
    } else if (opts.rank === 'elite') {
      m.rank = 'elite';
      const modKeys = U.shuffle(makeRng((x * 31 + y * 17) | 0), Object.keys(ELITE_MODS)).slice(0, U.ri(U.rand, 2, 3));
      m.mods = modKeys;
      m.maxHp = m.hp = Math.floor(m.maxHp * 3.2); m.dmgLo *= 1.5; m.dmgHi *= 1.5;
      m.xpVal *= 7; m.size *= 1.22; m.resist = 0.15;
      m.eliteName = U.pick(U.rand, ELITE_NAME_A) + U.pick(U.rand, ELITE_NAME_B);
      m.name = m.eliteName + ' the ' + modKeys.map(k => ELITE_MODS[k].name)[0];
      for (const k of modKeys) {
        const mod = ELITE_MODS[k];
        if (mod.spd) m.spd *= mod.spd;
        if (mod.dmg) { m.dmgLo *= mod.dmg; m.dmgHi *= mod.dmg; }
        if (mod.hp) m.maxHp = m.hp = Math.floor(m.maxHp * mod.hp);
        if (mod.armor) m.resist += 0.2;
        if (mod.elem) m.elem = mod.elem;
      }
    }
    G.monsters.push(m);
    return m;
  },

  makeBoss(bossKey, x, y, mlvl) {
    const def = BOSSES[bossKey];
    const m = {
      fam: bossKey, def, name: def.name, x, y, size: def.size, lvl: mlvl,
      hp: 0, maxHp: 0, dmgLo: this.scaleDmg(def.dmg[0], mlvl), dmgHi: this.scaleDmg(def.dmg[1], mlvl),
      spd: def.spd, ai: 'boss', elem: def.elem || 'phys',
      xpVal: Math.floor((8 + mlvl * 7) * 30), rank: 'boss', mods: [], boss: true, bossKey,
      dir: 0, anim: 0, atkCd: 1.5, abilityCd: 2.5, abilities: def.abilities.slice(),
      stunT: 0, debuffs: {}, dead: false, deathT: 0, aggro: false, wanderT: 0, wanderA: 0,
      resist: 0.25, hitT: 0,
    };
    m.maxHp = m.hp = this.scaleHp(def.hp, Math.floor(mlvl * 0.72));
    G.monsters.push(m);
    return m;
  },

  makeMinion(kind, x, y, owner, lvl, skillId, dur) {
    const def = kind ? MONSTERS[kind] : MONSTERS.skelwarrior;
    const d = owner.derived;
    const m = {
      fam: kind || 'trap', def, name: def.name, x, y, size: def.size, lvl,
      spd: def.spd, ai: def.ai, elem: def.elem || 'phys', xpVal: 0,
      rank: 'normal', mods: [], ally: true, owner, summonSkill: skillId, ttl: dur,
      dir: 0, anim: U.rand() * 4, atkCd: 1, abilityCd: 3, stunT: 0, debuffs: {},
      dead: false, deathT: 0, aggro: true, wanderT: 0, wanderA: 0, resist: 0, hitT: 0, fly: def.fly,
    };
    const hpScale = (1 + 0.3 * lvl) * (1 + d.minionHp / 100);
    const dmgScale = (1 + 0.22 * lvl) * (1 + d.minionDmg / 100) * (1 + d.spellPower * 0.12);
    m.maxHp = m.hp = Math.floor(def.hp * 3 * hpScale);
    m.dmgLo = def.dmg[0] * dmgScale; m.dmgHi = def.dmg[1] * dmgScale;
    G.monsters.push(m);
    FX.ring(x, y, 0.8, '#8ef04a');
    return m;
  },

  spawnPack(pack, map) {
    const rng = makeRng(hashStr(pack.fam + pack.x + '_' + pack.y));
    for (let i = 0; i < pack.n; i++) {
      const a = rng() * Math.PI * 2, r = U.rf(rng, 0.5, 2.5);
      let x = pack.x + Math.cos(a) * r, y = pack.y + Math.sin(a) * r;
      if (Dungeon.isWall(map, Math.floor(x), Math.floor(y))) { x = pack.x; y = pack.y; }
      const rank = (i === 0 && pack.elite) ? 'elite' : (i === 0 && pack.champion) ? 'champion' : 'normal';
      this.makeMonster(pack.fam, x, y, { mlvl: map.mlvl, rank });
    }
  },

  // ======================= DAMAGE =======================
  applyDebuff(m, deb, dur) {
    for (const k in deb) {
      if (k === 'dotElem') { m.debuffs.dotElem = deb[k]; continue; }
      m.debuffs[k] = Math.max(m.debuffs[k] || 0, deb[k]);
    }
    m.debuffT = Math.max(m.debuffT || 0, dur);
    m.aggro = true;
  },

  damageMonster(m, amount, elem, opts = {}) {
    if (m.dead) return 0;
    let dmg = amount;
    // resist: rank resist + elem enchant
    let res = m.resist;
    for (const k of m.mods || []) { const mod = ELITE_MODS[k]; if (mod.elem === elem) res += 0.4; }
    dmg *= (1 - U.clamp(res, 0, 0.8));
    if (m.debuffs.dmgTaken && m.debuffT > 0) dmg *= 1 + m.debuffs.dmgTaken;
    dmg = Math.max(1, dmg);
    m.hp -= dmg;
    m.aggro = true;
    m.hitT = 0.12;
    UI.dmgNum(m.x, m.y - m.size * 0.8, Math.floor(dmg), opts.crit ? '#ffd94f' : ELEM[elem].color, opts.crit);
    FX.blood(m.x, m.y, ELEM[elem].color, opts.crit ? 8 : 4);
    // leech for the player
    if (opts.from === G.player) {
      const d = G.player.derived;
      if (d.leechHp) G.player.hp = Math.min(d.maxHp, G.player.hp + dmg * d.leechHp / 100);
      if (d.leechMp) G.player.mp = Math.min(d.maxMp, G.player.mp + dmg * d.leechMp / 100);
    }
    if (m.hp <= 0) this.killMonster(m, opts.from);
    return dmg;
  },

  killMonster(m, killer) {
    if (m.dead) return;
    m.dead = true; m.deathT = 0.9;
    // Boss adds exist only for the encounter that created them. Despawn them
    // directly so cleanup cannot award XP, loot, or trigger on-death effects.
    if (m.boss) {
      for (const add of G.monsters) {
        if (!add.dead && add.summonedBy === m) {
          add.dead = true;
          add.deathT = 0.4;
        }
      }
    }
    sfx(m.rank === 'boss' ? 'bigdie' : 'die');
    FX.deathBurst(m.x, m.y, m.def.pal.main, m.size);
    // corpses topple along the blow that felled them
    const kx = killer && killer.x !== undefined ? killer.x : m.x - 1;
    const ky = killer && killer.y !== undefined ? killer.y : m.y;
    Physics.ragdoll(m, U.angleTo(kx, ky, m.x, m.y), 1 + m.size * 0.6);
    Physics.burst(m.x, m.y, 'gore', Math.round(3 + m.size * 3), { speed: 2.6, size: 2.4 });
    // elite death nova
    for (const k of m.mods || []) {
      const mod = ELITE_MODS[k];
      if (mod.nova) this.hostileNova(m, mod.elem, 8, this.scaleDmg(6, m.lvl));
    }
    if (m.ai === 'exploder' && !m.ally) this.explode(m.x, m.y, 2.2, [m.dmgLo, m.dmgHi], m.elem, { hostile: true });
    if (!m.ally) {
      G.awardXp(m.xpVal);
      this.awardMercXp(m.xpVal);
      G.dropLoot(m);
      G.stats.kills++;
      if (m.boss) G.onBossKilled(m);
    }
  },

  damagePlayer(amount, elem, src) {
    const pl = G.player;
    if (pl.dead || G.map.town) return;
    const d = pl.derived;
    let dmg = amount;
    if (elem === 'phys' || !elem) {
      const red = d.armor / (d.armor + 60 + 12 * (src && src.lvl ? src.lvl : G.map.mlvl));
      dmg *= 1 - Math.min(0.8, red);
    } else {
      const resKey = ELEM[elem].res + 'Res';
      dmg *= 1 - (d[resKey] || 0) / 100;
    }
    dmg = Math.max(1, dmg);
    pl.hp -= dmg;
    // Being hit interrupts the attack pose. Previously attack had animation
    // priority over hurt, then resurfaced after the hurt window, which looked
    // like facing had snapped back even though `dir` itself never changed.
    // Facing is deliberately left alone: receiving damage is not an aiming
    // action and must not turn the hero toward or away from the attacker.
    pl.attackT = 0;
    pl.hurtT = 0.25;
    G.shake += Math.min(8, dmg * 0.15);
    sfx('hurt');
    // thorns
    if (d.thorns && src && !src.dead && src.x !== undefined && U.dist(pl.x, pl.y, src.x, src.y) < 3)
      this.damageMonster(src, d.thorns, 'phys', {});
    if (pl.hp <= 0) { pl.hp = 0; G.onPlayerDeath(src); }
  },

  hostileNova(m, elem, count, dmg) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      G.projs.push({ x: m.x, y: m.y, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, dmg, elem, ally: false, r: 0.3, ttl: 1.1, kind: 'bolt' });
    }
  },

  explode(x, y, r, dmgRange, elem, opts = {}) {
    sfx('explode');
    Physics.impulse(x, y, r * 1.4, 3.2);
    Physics.burst(x, y, 'stone', 6, { speed: 4.5, size: 2.6 });
    FX.explosion(x, y, r, ELEM[elem].color);
    G.shake += 6;
    const dmg = U.rf(U.rand, dmgRange[0], dmgRange[1]);
    if (opts.hostile || opts.both) {
      const pl = G.player;
      if (U.dist(x, y, pl.x, pl.y) < r) this.damagePlayer(dmg, elem, null);
      for (const m of G.monsters) if (m.ally && !m.dead && U.dist(x, y, m.x, m.y) < r + m.size * 0.3) this.minionDamage(m, dmg, elem);
    }
    if (!opts.hostile || opts.both) {
      for (const m of G.monsters) {
        if (m.ally || m.dead) continue;
        if (U.dist(x, y, m.x, m.y) < r + m.size * 0.3) this.damageMonster(m, dmg, elem, { from: opts.from, srcName: opts.srcName });
      }
    }
  },

  minionDamage(m, amount, elem) {
    if (m.dead) return;
    if (m.mercenary) {
      const d = this.mercDerived(m.mercState);
      amount *= elem === 'phys' ? 1 - Math.min(.75, d.armor / (d.armor + 80 + m.lvl * 10)) : 1 - d.resist;
    }
    m.hp -= Math.max(1, amount); m.hitT = 0.12;
    if (m.hp <= 0) {
      m.dead = true; m.deathT = 0.6; FX.deathBurst(m.x, m.y, m.def.pal.main, m.size);
      if (m.mercenary) { m.mercState.dead = true; Save.saveChar(G.player); UI.announce(`${m.name} has fallen`, '#ff6a5a'); }
    }
  },

  // ======================= MOVEMENT =======================
  tryMove(e, dx, dy) {
    const map = G.map;
    const r = 0.32 * (e.size || 1);
    let nx = e.x + dx, ny = e.y + dy;
    const can = (x, y) =>
      !Dungeon.isWall(map, Math.floor(x - r), Math.floor(y - r)) &&
      !Dungeon.isWall(map, Math.floor(x + r), Math.floor(y - r)) &&
      !Dungeon.isWall(map, Math.floor(x - r), Math.floor(y + r)) &&
      !Dungeon.isWall(map, Math.floor(x + r), Math.floor(y + r));
    if (can(nx, ny)) { e.x = nx; e.y = ny; return true; }
    if (can(nx, e.y)) { e.x = nx; return true; }
    if (can(e.x, ny)) { e.y = ny; return true; }
    return false;
  },

  los(x1, y1, x2, y2) {
    const dist = U.dist(x1, y1, x2, y2);
    const steps = Math.ceil(dist * 2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (Dungeon.isWall(G.map, Math.floor(U.lerp(x1, x2, t)), Math.floor(U.lerp(y1, y2, t)))) return false;
    }
    return true;
  },

  nearestEnemyOf(m, maxR = 99) {
    let best = null, bd = maxR * maxR;
    if (m.ally) {
      for (const o of G.monsters) {
        if (o.ally || o.dead) continue;
        const d2 = U.dist2(m.x, m.y, o.x, o.y);
        if (d2 < bd) { bd = d2; best = o; }
      }
    } else {
      const pl = G.player;
      if (!pl.dead) { best = pl; bd = U.dist2(m.x, m.y, pl.x, pl.y); }
      for (const o of G.monsters) {
        if (!o.ally || o.dead || o.trap) continue;
        const d2 = U.dist2(m.x, m.y, o.x, o.y);
        if (d2 < bd * 0.7) { bd = d2; best = o; }  // prefer the player slightly
      }
      if (best && bd > maxR * maxR) best = null;
    }
    return best;
  },

  hurtTarget(m, target, dmg) {
    if (target === G.player) this.damagePlayer(dmg, m.elem, m);
    else if (target.ally) this.minionDamage(target, dmg, m.elem);
    else this.damageMonster(target, dmg, m.elem, { from: m.owner, srcName: 'Minions' });
  },

  // ======================= AI UPDATE =======================
  updateMonster(m, dt) {
    if (m.dead) { m.deathT -= dt; return; }
    // minion lifetime
    if (m.ally && m.ttl !== undefined) {
      m.ttl -= dt;
      if (m.ttl <= 0) { m.dead = true; m.deathT = 0.4; FX.spark(m.x, m.y, '#8ef04a', 4); return; }
    }
    if (m.hitT > 0) m.hitT -= dt;
    // Retainers catch up instead of becoming stranded across the map. Unlike
    // summons this never consumes ttl and therefore cannot expire.
    if (m.mercenary && U.dist(m.x, m.y, G.player.x, G.player.y) > 14) {
      m.x = G.player.x + Math.cos(G.player.dir + Math.PI) * 1.5;
      m.y = G.player.y + Math.sin(G.player.dir + Math.PI) * 1.5;
    }
    // debuffs
    let slow = 0, weaken = 0;
    if (m.debuffT > 0) {
      m.debuffT -= dt;
      slow = m.debuffs.slow || 0; weaken = m.debuffs.weaken || 0;
      if (m.debuffs.dot) {
        m.dotAcc = (m.dotAcc || 0) + dt;
        if (m.dotAcc >= 0.5) {
          m.dotAcc -= 0.5;
          const delem = m.debuffs.dotElem || 'pois';
          const tick = m.debuffs.dot * 0.5;
          m.hp -= tick;
          UI.dmgNum(m.x, m.y - m.size * 0.7, Math.max(1, Math.floor(tick)), ELEM[delem].color);
          if (!m.ally) WUI.trackOut(tick, 'Damage over Time');
          if (m.hp <= 0) { this.killMonster(m, G.player); return; }
        }
      }
      if (m.debuffT <= 0) m.debuffs = {};
    }
    if (m.stunT > 0) { m.stunT -= dt; return; }

    const spd = m.spd * (1 - Math.min(0.9, slow));
    m.anim += dt * spd * 1.6;

    // traps: pulse or shoot
    if (m.trap) {
      const def = m.trap.def;
      m.trap.t -= dt;
      if (m.trap.t <= 0) {
        const target = this.nearestEnemyOf(m, def.shoot ? 8 : (def.radius || 2.4));
        if (target) {
          m.trap.t = def.rate;
          const dmg = U.rf(U.rand, def.dmg[0], def.dmg[1]) * (1 + (def.dmgLvl || 0.3) * (m.trap.lvl - 1))
            * m.owner.derived.spellPower * (1 + m.owner.derived.minionDmg / 100);
          if (def.shoot) {
            const a = U.angleTo(m.x, m.y, target.x, target.y);
            sfx('shoot');
            G.projs.push({ x: m.x, y: m.y, vx: Math.cos(a) * 11, vy: Math.sin(a) * 11, dmg, elem: def.elem, ally: true, from: m.owner, r: 0.28, ttl: 1.4, kind: 'bolt', jumps: def.chain ? 2 : 0, slowHit: def.slowHit, srcName: 'Minions' });
          } else {
            FX.ring(m.x, m.y, def.radius || 2.4, ELEM[def.elem].color);
            for (const o of G.monsters) {
              if (o.ally || o.dead) continue;
              if (U.dist(m.x, m.y, o.x, o.y) < (def.radius || 2.4) + o.size * 0.3) {
                this.damageMonster(o, dmg, def.elem, { from: m.owner, srcName: 'Minions' });
                if (def.slowHit) this.applyDebuff(o, { slow: def.slowHit }, 2);
              }
            }
          }
        } else m.trap.t = 0.2;
      }
      return;
    }

    const target = this.nearestEnemyOf(m, m.ally ? 9 : (m.aggro ? 40 : 9.5));
    m.atkCd -= dt; m.abilityCd -= dt;

    // idle wander / minion follow
    if (!target || (!m.ally && !m.aggro && !this.los(m.x, m.y, target.x, target.y))) {
      if (m.ally && m.owner) {
        const dToOwner = U.dist(m.x, m.y, m.owner.x, m.owner.y);
        if (dToOwner > 3) {
          const a = U.angleTo(m.x, m.y, m.owner.x, m.owner.y);
          m.dir = a;
          this.tryMove(m, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt);
        }
      } else {
        m.wanderT -= dt;
        if (m.wanderT <= 0) { m.wanderT = U.rf(U.rand, 1, 4); m.wanderA = U.rand() * Math.PI * 2; }
        if (m.wanderT > 0.6) { m.dir = m.wanderA; this.tryMove(m, Math.cos(m.wanderA) * spd * 0.25 * dt, Math.sin(m.wanderA) * spd * 0.25 * dt); }
      }
      return;
    }
    if (!m.ally) {
      if (!m.aggro && U.dist(m.x, m.y, target.x, target.y) < 9.5 && this.los(m.x, m.y, target.x, target.y)) m.aggro = true;
      if (!m.aggro) return;
    }

    const dist = U.dist(m.x, m.y, target.x, target.y);
    const meleeR = 0.7 + m.size * 0.35 + (target.size ? target.size * 0.3 : 0.3);
    const ang = U.angleTo(m.x, m.y, target.x, target.y);
    m.dir = ang;

    // elite warp
    if (m.mods && m.mods.includes('warp') && dist > 6 && m.abilityCd <= 0) {
      m.abilityCd = 4;
      FX.spark(m.x, m.y, '#c07bff', 6);
      m.x = target.x + Math.cos(ang + Math.PI) * 2.5; m.y = target.y + Math.sin(ang + Math.PI) * 2.5;
      FX.spark(m.x, m.y, '#c07bff', 6);
    }

    // charging state
    if (m.charging) {
      m.chargeT -= dt;
      const moved = this.tryMove(m, Math.cos(m.chargeA) * spd * 3.2 * dt, Math.sin(m.chargeA) * spd * 3.2 * dt);
      FX.spark(m.x, m.y, '#ffb04f', 1);
      if (U.dist(m.x, m.y, target.x, target.y) < meleeR) {
        this.hurtTarget(m, target, U.rf(U.rand, m.dmgLo, m.dmgHi) * 1.5 * (1 - weaken));
        m.charging = false;
      }
      if (m.chargeT <= 0 || !moved) m.charging = false;
      return;
    }
    if (m.windup) {
      m.windup -= dt;
      if (m.windup <= 0) { m.windup = 0; m.charging = true; m.chargeT = 0.8; m.chargeA = U.angleTo(m.x, m.y, target.x, target.y); }
      return;
    }

    const wantRange = (m.ai === 'ranged' || m.ai === 'caster' || m.ai === 'summoner') ? U.clamp(dist, 4.5, 6.5) : meleeR * 0.8;

    // approach / retreat
    if (m.ai === 'ranged' || m.ai === 'caster' || m.ai === 'summoner') {
      if (dist > 7 || !this.los(m.x, m.y, target.x, target.y)) this.tryMove(m, Math.cos(ang) * spd * dt, Math.sin(ang) * spd * dt);
      else if (dist < 3.5) this.tryMove(m, -Math.cos(ang) * spd * 0.8 * dt, -Math.sin(ang) * spd * 0.8 * dt);
    } else if (dist > meleeR * 0.85) {
      this.tryMove(m, Math.cos(ang) * spd * dt, Math.sin(ang) * spd * dt);
      // separation
      for (const o of G.monsters) {
        if (o === m || o.dead || o.ally !== m.ally) continue;
        const d2 = U.dist2(m.x, m.y, o.x, o.y);
        const rr = (m.size + o.size) * 0.3;
        if (d2 < rr * rr && d2 > 0.0001) {
          const push = U.angleTo(o.x, o.y, m.x, m.y);
          this.tryMove(m, Math.cos(push) * spd * 0.4 * dt, Math.sin(push) * spd * 0.4 * dt);
        }
      }
    }

    // act
    switch (m.ai) {
      case 'melee':
        if (dist < meleeR && m.atkCd <= 0) {
          m.atkCd = 1.1 / (m.spd * 0.45 + 0.6); m.attackT = 0.3;
          this.hurtTarget(m, target, U.rf(U.rand, m.dmgLo, m.dmgHi) * (1 - weaken));
          // vampiric elites
          if (m.mods && m.mods.includes('vamp')) m.hp = Math.min(m.maxHp, m.hp + m.dmgHi * 0.8);
        }
        break;
      case 'exploder':
        if (dist < 1.1 + m.size * 0.3) { this.killMonster(m, null); }
        break;
      case 'ranged':
        if (dist < 9 && m.atkCd <= 0 && this.los(m.x, m.y, target.x, target.y)) {
          m.atkCd = U.rf(U.rand, 1.4, 2.2); m.attackT = 0.3;
          const shots = (m.mods && m.mods.includes('multi')) ? 3 : 1;
          for (let i = 0; i < shots; i++) {
            const a2 = ang + (shots > 1 ? (i - 1) * 0.25 : 0);
            G.projs.push({
              x: m.x, y: m.y, vx: Math.cos(a2) * 9, vy: Math.sin(a2) * 9,
              dmg: U.rf(U.rand, m.dmgLo, m.dmgHi) * (1 - weaken), elem: m.elem, ally: m.ally || false, from: m.ally ? m.owner : null,
              r: 0.28, ttl: 1.6, kind: m.elem === 'phys' ? 'arrow' : 'orb',
            });
          }
          if (!m.ally) sfx('shoot');
        }
        break;
      case 'caster':
        if (m.abilityCd <= 0 && dist < 9 && Ent.los(m.x, m.y, target.x, target.y)) {
          m.abilityCd = U.rf(U.rand, 2.6, 4); m.attackT = 0.35;
          if (U.chance(U.rand, 0.5)) this.hostileNova(m, m.elem, 8, U.rf(U.rand, m.dmgLo, m.dmgHi) * 0.8);
          else for (let i = -1; i <= 1; i++) {
            const a2 = ang + i * 0.3;
            G.projs.push({ x: m.x, y: m.y, vx: Math.cos(a2) * 8, vy: Math.sin(a2) * 8, dmg: U.rf(U.rand, m.dmgLo, m.dmgHi), elem: m.elem, ally: false, r: 0.3, ttl: 1.6, kind: 'orb' });
          }
        }
        break;
      case 'summoner':
        if (m.abilityCd <= 0) {
          m.abilityCd = 6;
          const pets = G.monsters.filter(o => !o.dead && !o.ally && o.summonedBy === m).length;
          if (pets < 5) {
            m.attackT = 0.4;
            for (let i = 0; i < 2; i++) {
              const sm = this.makeMonster(U.pick(U.rand, ['skeleton', 'zombie']), m.x + U.rf(U.rand, -1, 1), m.y + U.rf(U.rand, -1, 1), { mlvl: m.lvl });
              sm.summonedBy = m; sm.aggro = true;
            }
            FX.ring(m.x, m.y, 1.5, '#c07bff');
          }
        }
        if (dist < 9 && m.atkCd <= 0 && Ent.los(m.x, m.y, target.x, target.y)) {
          m.atkCd = 2.4;
          G.projs.push({ x: m.x, y: m.y, vx: Math.cos(ang) * 8, vy: Math.sin(ang) * 8, dmg: U.rf(U.rand, m.dmgLo, m.dmgHi), elem: m.elem, ally: false, r: 0.3, ttl: 1.6, kind: 'orb' });
        }
        break;
      case 'charger':
        if (dist < meleeR && m.atkCd <= 0) {
          m.atkCd = 1.4; m.attackT = 0.3;
          this.hurtTarget(m, target, U.rf(U.rand, m.dmgLo, m.dmgHi) * (1 - weaken));
        } else if (dist > 3 && dist < 9 && m.abilityCd <= 0) {
          m.abilityCd = U.rf(U.rand, 4, 6); m.windup = 0.55; m.attackT = 0.5;
        }
        break;
      case 'boss': this.updateBoss(m, target, dist, ang, dt, weaken); break;
    }
  },

  updateBoss(m, target, dist, ang, dt, weaken) {
    const meleeR = 0.7 + m.size * 0.4;
    if (dist < meleeR && m.atkCd <= 0) {
      m.atkCd = 1.3; m.attackT = 0.3;
      this.hurtTarget(m, target, U.rf(U.rand, m.dmgLo, m.dmgHi) * (1 - weaken));
      G.shake += 4;
    }
    if (m.abilityCd > 0) return;
    m.abilityCd = U.rf(U.rand, 2.2, 3.6);
    const ab = U.pick(U.rand, m.abilities);
    m.attackT = 0.4;
    switch (ab) {
      case 'nova_arc': this.hostileNova(m, 'arc', 12, U.rf(U.rand, m.dmgLo, m.dmgHi) * 0.7); sfx('lightning'); break;
      case 'nova_fire': this.hostileNova(m, 'fire', 14, U.rf(U.rand, m.dmgLo, m.dmgHi) * 0.7); sfx('fire'); break;
      case 'volley_arc':
        for (let i = -2; i <= 2; i++) {
          const a2 = ang + i * 0.22;
          G.projs.push({ x: m.x, y: m.y, vx: Math.cos(a2) * 9, vy: Math.sin(a2) * 9, dmg: U.rf(U.rand, m.dmgLo, m.dmgHi) * 0.8, elem: 'arc', ally: false, r: 0.32, ttl: 1.8, kind: 'orb' });
        }
        break;
      case 'spit_pois':
        for (let i = -1; i <= 1; i++) {
          const a2 = ang + i * 0.3;
          G.projs.push({ x: m.x, y: m.y, vx: Math.cos(a2) * 8, vy: Math.sin(a2) * 8, dmg: U.rf(U.rand, m.dmgLo, m.dmgHi) * 0.85, elem: 'pois', ally: false, r: 0.34, ttl: 1.8, kind: 'orb' });
        }
        sfx('poison'); break;
      case 'meteor_fire':
        G.pending.push({ x: target.x, y: target.y, t: 1.1, radius: 2.6, dmg: U.rf(U.rand, m.dmgLo, m.dmgHi) * 1.6, elem: 'fire', ally: false });
        break;
      case 'storm_pois':
        G.storms.push({ x: target.x, y: target.y, radius: 4, elem: 'pois', ally: false, strikes: 7, interval: 0.5, t: 0, dmg: U.rf(U.rand, m.dmgLo, m.dmgHi) * 0.8, left: 7 });
        break;
      case 'charge': if (dist > 2.5) { m.windup = 0.6; } break;
      case 'summon_skeleton': case 'summon_spiderling': case 'summon_serpent': case 'summon_imp': {
        const kind = ab.split('_')[1] === 'skeleton' ? 'skeleton' : ab.split('_')[1] === 'spiderling' ? 'spiderling' : ab.split('_')[1] === 'serpent' ? 'serpent' : 'imp';
        const livingAdds = G.monsters.filter(o => !o.dead && o.summonedBy === m).length;
        const spawnCount = Math.min(3, Math.max(0, this.BOSS_ADD_CAP - livingAdds));
        for (let i = 0; i < spawnCount; i++) {
          const sm = this.makeMonster(kind, m.x + U.rf(U.rand, -1.5, 1.5), m.y + U.rf(U.rand, -1.5, 1.5), { mlvl: m.lvl });
          sm.summonedBy = m; sm.aggro = true;
        }
        if (spawnCount > 0) FX.ring(m.x, m.y, 2, '#c07bff');
        break;
      }
    }
  },

  // ======================= PROJECTILES / EFFECTS =======================
  updateProjectile(p, dt) {
    p.ttl -= dt;
    if (p.ttl <= 0) { p.dead = true; return; }
    // homing
    if (p.homing && p.ally) {
      let best = null, bd = 36;
      for (const m of G.monsters) {
        if (m.ally || m.dead) continue;
        const d2 = U.dist2(p.x, p.y, m.x, m.y);
        if (d2 < bd) { bd = d2; best = m; }
      }
      if (best) {
        const want = U.angleTo(p.x, p.y, best.x, best.y);
        const cur = Math.atan2(p.vy, p.vx);
        const diff = U.angDiff(cur, want);
        const spd = Math.hypot(p.vx, p.vy);
        const na = cur + U.clamp(diff, -4 * dt, 4 * dt);
        p.vx = Math.cos(na) * spd; p.vy = Math.sin(na) * spd;
      }
    }
    if (p.wobble) {
      const spd = Math.hypot(p.vx, p.vy);
      const a = Math.atan2(p.vy, p.vx) + Math.sin(p.ttl * 18) * 0.35 * dt * 30;
      p.vx = Math.cos(a) * spd; p.vy = Math.sin(a) * spd;
    }
    // frozen orb shard spray
    if (p.orb) {
      p.orbT -= dt;
      if (p.orbT <= 0) {
        p.orbT = p.orbRate || 0.09;
        const a = U.rand() * Math.PI * 2;
        G.projs.push({ x: p.x, y: p.y, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, dmg: p.dmg * 0.45, elem: p.elem, ally: p.ally, from: p.from, r: 0.22, ttl: 0.5, kind: 'bolt', slowHit: 0.3, srcName: p.srcName });
      }
    }
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    if (Dungeon.isWall(G.map, Math.floor(nx), Math.floor(ny))) {
      if (p.explodeR) this.explode(p.x, p.y, p.explodeR, [p.dmg * 0.9, p.dmg * 1.1], p.elem, { hostile: !p.ally, from: p.from, srcName: p.srcName });
      else FX.spark(p.x, p.y, ELEM[p.elem].color, 3);
      p.dead = true; return;
    }
    p.x = nx; p.y = ny;
    FX.trail(p);

    // collision
    if (p.ally) {
      for (const m of G.monsters) {
        if (m.ally || m.dead) continue;
        if (U.dist2(p.x, p.y, m.x, m.y) < Math.pow(p.r + m.size * 0.33, 2)) {
          let dmg = p.dmg;
          if (p.crit && p.from === G.player) dmg *= G.player.derived.critDmg;
          this.damageMonster(m, dmg, p.elem, { crit: p.crit, from: p.from, srcName: p.srcName });
          if (p.weaponHit) this.applyWeaponHitEffects(m, p.from);
          if (p.slowHit) this.applyDebuff(m, { slow: p.slowHit }, 2.5);
          if (p.jumps && p.jumps > 0) {
            let best = null, bd = 30;
            for (const o of G.monsters) {
              if (o.ally || o.dead || o === m) continue;
              const d2 = U.dist2(p.x, p.y, o.x, o.y);
              if (d2 < bd) { bd = d2; best = o; }
            }
            if (best) {
              const a = U.angleTo(p.x, p.y, best.x, best.y);
              const spd = Math.hypot(p.vx, p.vy);
              p.vx = Math.cos(a) * spd; p.vy = Math.sin(a) * spd;
              p.jumps--; p.ttl = Math.max(p.ttl, 0.8);
              FX.spark(p.x, p.y, ELEM[p.elem].color, 4);
              return; // keep flying to next target
            }
          }
          if (p.explodeR) this.explode(p.x, p.y, p.explodeR, [p.dmg * 0.8, p.dmg * 1.05], p.elem, { from: p.from, srcName: p.srcName });
          if (p.pierce && p.pierce > 0) { p.pierce--; return; }
          p.dead = true; return;
        }
      }
    } else {
      const pl = G.player;
      if (!pl.dead && U.dist2(p.x, p.y, pl.x, pl.y) < Math.pow(p.r + 0.35, 2)) {
        this.damagePlayer(p.dmg, p.elem, null);
        p.dead = true; return;
      }
      for (const m of G.monsters) {
        if (!m.ally || m.dead || m.trap) continue;
        if (U.dist2(p.x, p.y, m.x, m.y) < Math.pow(p.r + m.size * 0.33, 2)) {
          this.minionDamage(m, p.dmg, p.elem);
          p.dead = true; return;
        }
      }
    }
  },

  // ======================= WORLD TICK =======================
  updateWorld(dt) {
    const pl = G.player;

    // monsters (only near player, or bosses)
    for (const m of G.monsters) {
      if (!m.dead && !m.boss && U.dist2(m.x, m.y, pl.x, pl.y) > 1200) continue;
      this.updateMonster(m, dt);
      if (m.attackT > 0) m.attackT -= dt;
    }
    // sweep dead
    for (let i = G.monsters.length - 1; i >= 0; i--) {
      const m = G.monsters[i];
      if (m.dead && m.deathT <= 0) G.monsters.splice(i, 1);
    }
    // projectiles
    for (const p of G.projs) this.updateProjectile(p, dt);
    for (let i = G.projs.length - 1; i >= 0; i--) if (G.projs[i].dead) G.projs.splice(i, 1);

    // pending meteors
    for (let i = G.pending.length - 1; i >= 0; i--) {
      const pd = G.pending[i];
      pd.t -= dt;
      if (pd.t <= 0) {
        this.explode(pd.x, pd.y, pd.radius, [pd.dmg * 0.9, pd.dmg * 1.1], pd.elem, pd.ally ? { from: pd.from, srcName: pd.srcName } : { hostile: true });
        if (pd.linger) G.grounds.push({ x: pd.x, y: pd.y, r: pd.radius, dps: pd.lingerDps, elem: pd.elem, t: pd.linger, ally: pd.ally, from: pd.from, tick: 0, srcName: pd.srcName });
        G.pending.splice(i, 1);
      }
    }
    // storms
    for (let i = G.storms.length - 1; i >= 0; i--) {
      const s = G.storms[i];
      s.t -= dt;
      if (s.t <= 0 && s.left > 0) {
        s.t = s.interval; s.left--;
        const a = U.rand() * Math.PI * 2, r = Math.sqrt(U.rand()) * s.radius;
        const sx = s.x + Math.cos(a) * r, sy = s.y + Math.sin(a) * r;
        FX.strike(sx, sy, ELEM[s.elem].color);
        const dmgR = [s.dmg * 0.85, s.dmg * 1.15];
        if (s.ally) {
          for (const m of G.monsters) {
            if (m.ally || m.dead) continue;
            if (U.dist(sx, sy, m.x, m.y) < 1.4 + m.size * 0.3) this.damageMonster(m, U.rf(U.rand, dmgR[0], dmgR[1]), s.elem, { from: s.from, srcName: s.srcName });
          }
        } else {
          if (U.dist(sx, sy, pl.x, pl.y) < 1.5) this.damagePlayer(U.rf(U.rand, dmgR[0], dmgR[1]), s.elem, null);
        }
      }
      if (s.left <= 0) G.storms.splice(i, 1);
    }
    // lingering ground effects
    for (let i = G.grounds.length - 1; i >= 0; i--) {
      const gr = G.grounds[i];
      gr.t -= dt; gr.tick -= dt;
      if (gr.tick <= 0) {
        gr.tick = 0.4;
        FX.ring(gr.x, gr.y, gr.r * 0.8, ELEM[gr.elem].color, 0.25);
        if (gr.ally) {
          for (const m of G.monsters) {
            if (m.ally || m.dead) continue;
            if (U.dist(gr.x, gr.y, m.x, m.y) < gr.r + m.size * 0.3) this.damageMonster(m, gr.dps * 0.4, gr.elem, { from: gr.from, srcName: gr.srcName });
          }
        } else if (U.dist(gr.x, gr.y, pl.x, pl.y) < gr.r) this.damagePlayer(gr.dps * 0.4, gr.elem, null);
      }
      if (gr.t <= 0) G.grounds.splice(i, 1);
    }

    this.updateHazards(dt);
    this.updateDoors(dt);
  },

  // Doors swing open when anything alive stands near them and fall shut once
  // the room empties. They never block movement, so this is presentation and
  // a sound cue — no collision or pathfinding depends on the state.
  updateDoors(dt) {
    const map = G.map;
    if (!map.doors || !map.doors.length) return;
    const pl = G.player;
    for (const d of map.doors) {
      if (d.kind === 'arch') { d.open = 1; continue; }   // archways have no leaf
      let near = !pl.dead && U.dist2(pl.x, pl.y, d.x, d.y) < 5.6;
      if (!near) {
        for (const m of G.monsters) {
          if (m.dead) continue;
          if (U.dist2(m.x, m.y, d.x, d.y) < 4) { near = true; break; }
        }
      }
      const target = near ? 1 : 0;
      if (d.open !== target) {
        const was = d.open;
        d.open += (target - d.open) * Math.min(1, dt * 5.5);
        if (Math.abs(target - d.open) < 0.02) d.open = target;
        if (typeof Props3 !== 'undefined') Props3.refresh(d);
        if (was < 0.15 && d.open >= 0.15) sfx('door');
      }
    }
  },

  // environmental hazards affecting the player
  updateHazards(dt) {
    const pl = G.player, map = G.map;
    if (pl.dead || map.town) return;
    const tx = Math.floor(pl.x), ty = Math.floor(pl.y);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return;
    const i = ty * map.w + tx;
    const hz = map.haz[i];
    pl.hazAcc = (pl.hazAcc || 0) + dt;
    if (hz === HAZ.LAVA) {
      if (pl.hazAcc >= 0.5) {
        pl.hazAcc = 0;
        this.damagePlayer(pl.derived.maxHp * 0.045 + map.mlvl * 1.5, 'fire', null);
        FX.spark(pl.x, pl.y, '#ff6a2f', 5);
      }
    } else if (hz === HAZ.GAS) {
      if (pl.hazAcc >= 0.6) {
        pl.hazAcc = 0;
        this.damagePlayer(pl.derived.maxHp * 0.02 + map.mlvl, 'pois', null);
        FX.spark(pl.x, pl.y, '#8ef04a', 4);
      }
    } else if (hz === HAZ.SPIKES) {
      map.hazCd = map.hazCd || {};
      if (!map.hazCd[i] || map.hazCd[i] <= 0) {
        map.hazCd[i] = 2.2;
        sfx('trap');
        this.damagePlayer(pl.derived.maxHp * 0.07 + map.mlvl * 2, 'phys', null);
        FX.spikeBurst(tx + 0.5, ty + 0.5);
      }
    } else if (isVent(hz)) {
      // Only the jet burns. Standing on a dormant vent is safe, and the
      // telegraph gives you time to step off, so a hit is always earned.
      map.hazCd = map.hazCd || {};
      if (ventJetting(i, G.time)) {
        if (!map.hazCd[i] || map.hazCd[i] <= 0) {
          map.hazCd[i] = VENT_PERIOD * 0.75;
          sfx('trap');
          const vk = VENT_KINDS[hz];
          this.damagePlayer(pl.derived.maxHp * vk.dmg + map.mlvl * vk.mul, vk.elem, null);
          FX.spark(pl.x, pl.y, vk.hot, 7);
        }
      }
    } else if (hz === HAZ.WATER) {
      pl.hazAcc = 0;
      if (pl.moving && U.rand() < dt * 8) { FX.ripple(pl.x, pl.y); }
    } else pl.hazAcc = 0;
    if (map.hazCd) for (const k in map.hazCd) if (map.hazCd[k] > 0) map.hazCd[k] -= dt;
    // ambient hazard particles
    if (U.rand() < dt * 6) {
      const rx = pl.x + U.rf(U.rand, -9, 9), ry = pl.y + U.rf(U.rand, -9, 9);
      const rtx = Math.floor(rx), rty = Math.floor(ry);
      if (rtx >= 0 && rty >= 0 && rtx < map.w && rty < map.h) {
        const rh = map.haz[rty * map.w + rtx];
        if (rh === HAZ.LAVA) FX.ember(rx, ry);
        else if (rh === HAZ.GAS) FX.gasPuff(rx, ry);
        else if (rh === HAZ.WATER && U.rand() < 0.5) FX.ripple(rx, ry);
        else if (isVent(rh) && ventJetting(rty * map.w + rtx, G.time)) FX.ember(rx, ry);
      }
    }
  },
};
