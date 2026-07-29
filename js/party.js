// ============ DIABLOID: party.js — persistent multiplayer party model ============
'use strict';

// Party members are player records, deliberately independent of summoned
// combat entities in G.monsters.
const Party = {
  KEY: 'party_v1', members: [], leaderId: 'player',
  init() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) {}
    if (saved && Array.isArray(saved.members)) {
      this.leaderId = saved.leaderId || 'player';
      this.members = saved.members.map(m => this.make(m)); return;
    }
    this.members = Social.sims.slice(0, 3).map((s, i) => this.make({
      id: 'sim:' + s.name, name: s.name, cls: s.cls, lvl: s.lvl,
      role: ['tank', 'healer', 'damage'][i], online: Social.online.has(s.name),
      hp: [100, 84, 72][i], resource: [68, 91, 54][i], range: 7 + i * 5,
      effects: i === 1 ? [{ name: 'Blessing', icon: '✦', color: '#ffd94f', t: 48 }] : [],
    }));
    this.save();
  },
  make(data) {
    return Object.assign({ partyMember: true, id: '', name: 'Unknown', cls: 'warrior', lvl: 1,
      role: 'damage', online: true, dead: false, hp: 100, maxHp: 100,
      resource: 100, maxResource: 100, range: 0, effects: [], assistant: false }, data, { partyMember: true });
  },
  all() {
    const pl = G.player;
    if (!pl) return this.members;
    return [this.make({ id: 'player', name: pl.name, cls: pl.cls, lvl: pl.lvl,
      online: true, dead: pl.hp <= 0, hp: pl.hp, maxHp: pl.derived.maxHp,
      resource: pl.mp, maxResource: pl.derived.maxMp,
      effects: (pl.buffs || []).map(b => ({ name: b.name, icon: b.icon || '✦', color: b.color || '#8fc8ff', t: b.t })) }), ...this.members];
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify({ leaderId: this.leaderId, members: this.members })); } catch (e) {} },
  target(m) { Target.set(m); },
  whisper(m) { if (m.id !== 'player') { WUI.openChat(); document.querySelector('#wui-chat input').value = '/w ' + m.name + ' '; } },
  promote(m) { if (m.id !== 'player') { this.leaderId = m.id; this.save(); } },
  toggleAssistant(m) { m.assistant = !m.assistant; this.save(); },
  remove(m) { if (m.id !== 'player') { this.members = this.members.filter(x => x.id !== m.id); this.save(); if (Target.current === m) Target.clear(); } },
};
