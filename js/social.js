// ============ DIABLOID: social.js — simulated multiplayer social layer ============
// Friends, guilds, local chat / whispers / guild chat, mute & block, emotes,
// dances, chat & emote bubbles, and simulated players who walk Haven's Rest.
// HONEST NOTE: this is a fully client-side game — the "other players" are the
// same deterministic simulation that powers the season ladder, not live people.
'use strict';

const Social = {
  KEY: 'social_v1',
  state: null,          // { friends:[], muted:[], blocked:[], guild:{...}|null }
  sims: [],             // full simulated population (subset of ladder rivals)
  online: new Set(),    // names currently "online"
  townSims: [],         // avatars currently walking the town
  _map: null, _chatT: 6, _flipT: 20, _whT: 90, _lastLvl: 0,
  replyQueue: [],       // pending whisper replies [{at, from, text}]
  lastWhisperFrom: null,

  ROLES: { gm: { c: '#ffd94f', tag: '★GM' }, mvp: { c: '#c07bff', tag: 'MVP' }, vet: { c: '#5affc8', tag: 'VET' }, none: { c: '#a8c8e8', tag: '' } },

  GUILDS: [
    { name: 'The Ashen Covenant', tag: 'ASH', motd: 'Abyss pushes nightly. Bring potions.' },
    { name: 'Crimson Vigil', tag: 'CRV', motd: 'We die in hardcore so you don\'t have to.' },
    { name: 'Iron Wardens', tag: 'IRON', motd: 'Recruiting all classes. Be nice or be gone.' },
    { name: 'Void Pact', tag: 'VOID', motd: 'The Abyss stares back. We wave at it.' },
    { name: 'Sons of the Gnashling', tag: 'GNSH', motd: 'It was one boar. Let it go.' },
  ],

  EMOTES: {
    wave: ['You wave.', '%s waves.'], bow: ['You bow deeply.', '%s bows deeply.'],
    cheer: ['You cheer!', '%s cheers!'], laugh: ['You laugh heartily.', '%s laughs heartily.'],
    cry: ['You weep bitterly.', '%s weeps.'], point: ['You point ahead.', '%s points.'],
    flex: ['You flex your muscles.', '%s flexes.'], sit: ['You sit down to rest.', '%s sits down.'],
    roar: ['You let out a mighty roar!', '%s roars!'], taunt: ['You taunt everyone nearby.', '%s taunts you.'],
    salute: ['You salute smartly.', '%s salutes.'], shrug: ['You shrug.', '%s shrugs.'],
    dance: ['You burst into dance!', '%s bursts into dance!'],
  },

  // ---------------- persistence ----------------
  load() {
    try { this.state = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { this.state = null; }
    if (!this.state) this.state = { friends: [], muted: [], blocked: [], guild: null };
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch (e) {} },

  // ---------------- population ----------------
  init() {
    this.load();
    const rivals = UI.genRivals(SEASON.current().num).slice(0, 64);
    this.sims = rivals.map(r => {
      const h = hashStr(r.name);
      const role = h % 100 < 2 ? 'gm' : h % 100 < 8 ? 'mvp' : h % 100 < 20 ? 'vet' : 'none';
      const pers = ['trader', 'helper', 'memer', 'grinder', 'recruiter', 'lore'][h % 6];
      const guild = (h >> 3) % 100 < 55 ? this.GUILDS[(h >> 5) % this.GUILDS.length] : null;
      return { name: r.name, cls: r.cls, lvl: r.lvl, role, pers, guild, dead: r.dead };
    }).filter(s => !s.dead);
    // deterministic starting online set (~60%)
    for (const s of this.sims) if (hashStr(s.name + 'on') % 10 < 6) this.online.add(s.name);
    this.wrapEngine();
    this._lastLvl = 0;
  },

  sim(name) {
    const n = name.toLowerCase();
    return this.sims.find(s => s.name.toLowerCase() === n || s.name.toLowerCase().startsWith(n));
  },
  roleOf(s) { return this.ROLES[s.role || 'none']; },
  nameHtml(s) {
    const r = this.roleOf(s);
    const tag = s.guild ? ` <span style="color:#8a7444">⟨${s.guild.tag}⟩</span>` : '';
    const star = s.role === 'gm' ? '★' : '';
    return `<span style="color:${r.c}">${star}${U.esc(s.name)}</span>${tag}`;
  },

  isMuted(name) { return this.state.muted.includes(name) || this.state.blocked.includes(name); },
  isBlocked(name) { return this.state.blocked.includes(name); },

  // ---------------- town avatars ----------------
  populateTown() {
    this.townSims = [];
    const map = G.town;
    if (!map) return;
    const candidates = this.sims.filter(s => this.online.has(s.name));
    U.shuffle(U.rand, candidates);
    const n = Math.min(7, candidates.length);
    for (let i = 0; i < n; i++) {
      const s = candidates[i];
      const spot = this.freeSpot(map);
      this.townSims.push({
        ...s, x: spot.x, y: spot.y, tx: spot.x, ty: spot.y,
        dir: U.rand() * Math.PI * 2, moving: false, pauseT: U.rf(U.rand, 1, 6),
        bubble: null, danceT: 0, emoteT: 0, sim: true,
      });
    }
  },

  freeSpot(map) {
    for (let tries = 0; tries < 60; tries++) {
      const x = 8.5 + U.rf(U.rand, 0, 12), y = 8.5 + U.rf(U.rand, 0, 12);
      const i = Math.floor(y) * map.w + Math.floor(x);
      if (map.t[i] !== TILE.WALL && !map.haz[i]) return { x, y };
    }
    return { x: 14.5, y: 14.5 };
  },

  // ---------------- per-frame ----------------
  update(dt) {
    const pl = G.player;
    if (!pl || !this.state) return;

    // map change: (re)populate town
    if (G.map !== this._map) {
      this._map = G.map;
      if (G.map && G.map.town) this.populateTown();
      else this.townSims = [];
    }

    // town avatar wandering + bubbles
    for (const sp of this.townSims) {
      if (sp.bubble) { sp.bubble.t -= dt; if (sp.bubble.t <= 0) sp.bubble = null; }
      if (sp.danceT > 0) { sp.danceT -= dt; sp.dir += dt * 6; sp.moving = false; continue; }
      if (sp.pauseT > 0) { sp.pauseT -= dt; sp.moving = false; continue; }
      const d = U.dist(sp.x, sp.y, sp.tx, sp.ty);
      if (d < 0.15) {
        if (U.rand() < 0.6) { const t = this.freeSpot(G.map); sp.tx = t.x; sp.ty = t.y; }
        sp.pauseT = U.rf(U.rand, 2, 9);
      } else {
        const a = U.angleTo(sp.x, sp.y, sp.tx, sp.ty);
        sp.dir = a; sp.moving = true;
        sp.x += Math.cos(a) * 1.5 * dt; sp.y += Math.sin(a) * 1.5 * dt;
      }
    }

    // player bubble/dance ticks
    if (pl.bubble) { pl.bubble.t -= dt; if (pl.bubble.t <= 0) pl.bubble = null; }
    if (pl.danceT > 0) {
      pl.danceT -= dt;
      pl.dir += dt * 6;
      if (pl.moving) pl.danceT = 0;
      if (U.rand() < dt * 2.5) UI.dmgNum(pl.x + U.rf(U.rand, -0.5, 0.5), pl.y, '♪', '#c07bff');
    }

    // ambient chatter
    this._chatT -= dt;
    if (this._chatT <= 0) {
      this._chatT = U.rf(U.rand, 7, 18) * (G.map && G.map.town ? 0.6 : 1.4);
      this.ambientLine();
    }

    // online/offline churn
    this._flipT -= dt;
    if (this._flipT <= 0) {
      this._flipT = U.rf(U.rand, 30, 75);
      this.flipOne();
    }

    // rare incoming whisper
    this._whT -= dt;
    if (this._whT <= 0) {
      this._whT = U.rf(U.rand, 150, 420);
      this.incomingWhisper();
    }

    // queued whisper replies
    for (let i = this.replyQueue.length - 1; i >= 0; i--) {
      const r = this.replyQueue[i];
      r.at -= dt;
      if (r.at <= 0) {
        this.replyQueue.splice(i, 1);
        if (!this.isBlocked(r.from.name)) this.deliverWhisper(r.from, r.text);
      }
    }

    // level-up reactions
    if (pl.lvl !== this._lastLvl) {
      if (this._lastLvl > 0 && U.rand() < 0.85) {
        const s = this.randOnline();
        if (s) setTimeout(() => this.say(s, U.pick(U.rand, ['grats!', 'gz ' + pl.name, 'gratz!!', 'big grats', 'gz!'])), U.ri(U.rand, 900, 3200));
      }
      this._lastLvl = pl.lvl;
    }
  },

  randOnline() {
    const on = this.sims.filter(s => this.online.has(s.name) && !this.isMuted(s.name));
    return on.length ? U.pick(U.rand, on) : null;
  },

  flipOne() {
    const s = U.pick(U.rand, this.sims);
    if (!s) return;
    if (this.online.has(s.name)) {
      this.online.delete(s.name);
      if (this.state.friends.includes(s.name))
        WUI.chat('sys', `${this.nameHtml(s)} has gone offline.`, '#8a8a72');
      const i = this.townSims.findIndex(t => t.name === s.name);
      if (i >= 0) this.townSims.splice(i, 1);
    } else {
      this.online.add(s.name);
      if (this.state.friends.includes(s.name))
        WUI.chat('sys', `${this.nameHtml(s)} has come online.`, '#8fc8a0');
      if (G.map && G.map.town && this.townSims.length < 8 && U.rand() < 0.6) {
        const spot = { x: G.town.entry.x, y: G.town.entry.y };
        this.townSims.push({ ...s, x: spot.x, y: spot.y, tx: 14.5, ty: 14.5, dir: 0, moving: true, pauseT: 0, bubble: null, danceT: 0, emoteT: 0, sim: true });
      }
    }
    WUI.refreshSocialFrames && WUI.refreshSocialFrames();
  },

  // ---------------- chat generation ----------------
  LINES: {
    trader: ['WTS ⟨{item}⟩ — whisper me', 'WTB any {slot} with magic find, paying well', 'prices in this town are a crime', 'selling potions cheaper than the healer, just saying', 'WTS rare boots, practically new, only died once'],
    helper: ['anyone need a hand with {boss}? happy to help', 'tip: shrines stack with potions, use both', 'new players: the gambler is a trap. a fun trap', 'if you\'re stuck on Act II, level in the catacombs first', 'don\'t stand in the lava. that\'s it, that\'s the tip'],
    memer: ['the gnashling looked at me funny so now we fight', 'petition to rename the abyss to "the hole"', 'my build is bad but my vibes are immaculate', 'tank the boss they said. it will be fun they said', 'me? dying to spike traps? more likely than you think'],
    grinder: ['floor {fl} abyss done, who\'s next', 'day 3 of farming {boss}. still no unique', '2 levels to 99. do not talk to me', 'efficiency is a personality trait', 'sleep is a debuff'],
    recruiter: ['⟨{gtag}⟩ is recruiting! all levels welcome, whisper me', '{gname} runs abyss groups nightly — join up', 'looking for chill players for our guild, no drama', 'guild {gname} needs a healer... or three'],
    lore: ['they say the parish bells still ring at depth 3', 'the elder knows more than he tells. ask him about the throne', 'the water in the fane... it reflects someone else\'s face', 'I read every lore line so you don\'t have to. you should though'],
  },

  fillLine(tpl, s) {
    const acts = ['Bishop Malvor', 'Vashta', 'Karghul', 'Ythalla', 'Maltherion'];
    return tpl
      .replace('{item}', U.pick(U.rand, ['Doomlight Edge', 'Gaze of the Abyss', 'Sage\'s War Gauntlets', 'Irongrip Orb', 'Falcon\'s Gold Ring']))
      .replace('{slot}', U.pick(U.rand, ['helm', 'ring', 'amulet', 'boots']))
      .replace('{boss}', U.pick(U.rand, acts))
      .replace('{fl}', U.ri(U.rand, 3, 40))
      .replace('{gtag}', (s.guild || this.GUILDS[0]).tag)
      .replace('{gname}', (s.guild || this.GUILDS[0]).name);
  },

  ambientLine() {
    const s = this.randOnline();
    if (!s) return;
    const line = this.fillLine(U.pick(U.rand, this.LINES[s.pers]), s);
    this.say(s, line);
    // guild chat from your guildmates now and then
    const g = this.state.guild;
    if (g && U.rand() < 0.35) {
      const mate = this.sims.find(x => this.online.has(x.name) && g.members.includes(x.name) && !this.isMuted(x.name));
      if (mate) WUI.chat('guild', `<span style="color:#5fd88a">[Guild]</span> ${this.nameHtml(mate)}: <span style="color:#8fe8a8">${U.esc(this.fillLine(U.pick(U.rand, this.LINES[mate.pers]), mate))}</span>`);
    }
  },

  // a sim says something in local chat (+ bubble if they're in town with you)
  say(s, text) {
    if (this.isMuted(s.name)) return;
    WUI.chat('local', `<span style="color:#9a9a86">[Local]</span> ${this.nameHtml(s)}: <span style="color:#d8d2be">${U.esc(text)}</span>`);
    const av = this.townSims.find(t => t.name === s.name);
    if (av && G.map && G.map.town) av.bubble = { text, t: 4.5, maxT: 4.5, kind: 'chat' };
  },

  // ---------------- whispers ----------------
  whisperTo(name, text) {
    const s = this.sim(name);
    if (!s) { WUI.chat('sys', `No player named "${U.esc(name)}" is online.`, '#ff6a5a'); return; }
    if (!this.online.has(s.name)) { WUI.chat('sys', `${U.esc(s.name)} is offline.`, '#8a8a72'); return; }
    if (this.isBlocked(s.name)) { WUI.chat('sys', `You have blocked ${U.esc(s.name)}. Unblock them first.`, '#ff6a5a'); return; }
    WUI.chat('local', `<span style="color:#ff7ad0">To ${U.esc(s.name)}:</span> <span style="color:#ffb8e8">${U.esc(text)}</span>`);
    // queue a personality reply
    const lower = text.toLowerCase();
    let reply;
    if (/^(hi|hey|hello|yo|o\/)/.test(lower)) reply = U.pick(U.rand, ['hey!', 'o/', 'yo', 'hail!', 'well met']);
    else if (lower.includes('guild')) reply = s.guild ? `⟨${s.guild.tag}⟩ is great, want an invite? (use the Guild panel!)` : 'not in a guild yet, you?';
    else if (lower.includes('?')) reply = U.pick(U.rand, ['hmm, good question', 'no idea honestly', 'ask in local, someone will know', 'yes. probably. maybe.']);
    else if (lower.includes('wts') || lower.includes('wtb')) reply = 'gold only, no trades... wait, we can\'t trade. cruel world';
    else reply = U.pick(U.rand, ['nice', 'haha yeah', 'true', 'same tbh', 'lol', 'gl out there', 'the abyss calls, gtg']);
    this.replyQueue.push({ at: U.rf(U.rand, 1.5, 5), from: s, text: reply });
  },

  deliverWhisper(s, text) {
    this.lastWhisperFrom = s.name;
    WUI.chat('local', `<span style="color:#ff7ad0">${U.esc(s.name)} whispers:</span> <span style="color:#ffb8e8">${U.esc(text)}</span>`);
    sfx('ui');
  },

  incomingWhisper() {
    const s = this.randOnline();
    if (!s || this.isBlocked(s.name)) return;
    const openers = {
      trader: 'hey, still selling that orb if you want it',
      helper: 'saw you die back there — need a hand?',
      memer: 'psst. the gnashling fears you',
      grinder: 'you\'re on the ladder! what floor are you pushing?',
      recruiter: `we\'d love to have you in ${(s.guild || this.GUILDS[0]).name} — check the Guild panel`,
      lore: 'you\'ve seen the water in the fane too, haven\'t you?',
    };
    this.deliverWhisper(s, openers[s.pers]);
  },

  // ---------------- friends ----------------
  addFriend(name) {
    const s = this.sim(name);
    if (!s) { WUI.chat('sys', `No player named "${U.esc(name)}" found.`, '#ff6a5a'); return; }
    if (this.state.friends.includes(s.name)) { WUI.chat('sys', `${U.esc(s.name)} is already your friend.`); return; }
    this.state.friends.push(s.name);
    this.save();
    WUI.chat('sys', `${this.nameHtml(s)} added to friends.`, '#8fc8a0');
    WUI.refreshSocialFrames && WUI.refreshSocialFrames();
  },
  removeFriend(name) {
    const i = this.state.friends.findIndex(f => f.toLowerCase() === name.toLowerCase() || f.toLowerCase().startsWith(name.toLowerCase()));
    if (i < 0) { WUI.chat('sys', 'Not on your friends list.', '#ff6a5a'); return; }
    const gone = this.state.friends.splice(i, 1)[0];
    this.save();
    WUI.chat('sys', `${U.esc(gone)} removed from friends.`);
    WUI.refreshSocialFrames && WUI.refreshSocialFrames();
  },

  // ---------------- mute / block ----------------
  mute(name, on) {
    const s = this.sim(name);
    if (!s) { WUI.chat('sys', `No player named "${U.esc(name)}".`, '#ff6a5a'); return; }
    const list = this.state.muted;
    const has = list.includes(s.name);
    if (on && !has) list.push(s.name);
    if (!on && has) list.splice(list.indexOf(s.name), 1);
    this.save();
    WUI.chat('sys', on ? `${U.esc(s.name)} muted. Their chat is hidden.` : `${U.esc(s.name)} unmuted.`);
    WUI.refreshSocialFrames && WUI.refreshSocialFrames();
  },
  block(name, on) {
    const s = this.sim(name);
    if (!s) { WUI.chat('sys', `No player named "${U.esc(name)}".`, '#ff6a5a'); return; }
    const list = this.state.blocked;
    const has = list.includes(s.name);
    if (on && !has) { list.push(s.name); this.replyQueue = this.replyQueue.filter(r => r.from.name !== s.name); }
    if (!on && has) list.splice(list.indexOf(s.name), 1);
    this.save();
    WUI.chat('sys', on ? `${U.esc(s.name)} blocked. Chat hidden and whispers rejected.` : `${U.esc(s.name)} unblocked.`);
    WUI.refreshSocialFrames && WUI.refreshSocialFrames();
  },

  // ---------------- guild ----------------
  joinGuild(gi) {
    const g = this.GUILDS[gi];
    if (!g) return;
    const members = this.sims.filter(s => s.guild && s.guild.tag === g.tag).map(s => s.name);
    this.state.guild = { name: g.name, tag: g.tag, motd: g.motd, rank: 'Initiate', members, own: false };
    this.save();
    WUI.chat('guild', `<span style="color:#5fd88a">[Guild]</span> Welcome to <b>${U.esc(g.name)}</b> ⟨${g.tag}⟩! MOTD: ${U.esc(g.motd)}`, '#8fe8a8');
    UI.announce(`You have joined ${g.name}`, '#5fd88a');
    WUI.refreshSocialFrames && WUI.refreshSocialFrames();
  },
  createGuild(name, tag) {
    const pl = G.player;
    const COST = 2500;
    if (pl.gold < COST) { WUI.chat('sys', `Founding a guild costs ${U.fmt(COST)} gold.`, '#ff6a5a'); return false; }
    pl.gold -= COST;
    const members = this.sims.filter(s => !s.guild && hashStr(s.name + tag) % 3 === 0).slice(0, 8).map(s => s.name);
    this.state.guild = { name, tag: tag.toUpperCase().slice(0, 4), motd: 'Welcome to ' + name + '!', rank: 'Guild Master', members, own: true };
    this.save();
    UI.announce(`Guild founded: ${name}`, '#5fd88a');
    WUI.chat('guild', `<span style="color:#5fd88a">[Guild]</span> <b>${U.esc(name)}</b> founded! ${members.length} adventurers joined your banner.`, '#8fe8a8');
    WUI.refreshSocialFrames && WUI.refreshSocialFrames();
    return true;
  },
  leaveGuild() {
    if (!this.state.guild) return;
    WUI.chat('sys', `You have left ${U.esc(this.state.guild.name)}.`);
    this.state.guild = null;
    this.save();
    WUI.refreshSocialFrames && WUI.refreshSocialFrames();
  },
  guildSay(text) {
    const g = this.state.guild;
    if (!g) { WUI.chat('sys', 'You are not in a guild. Open the Guild panel (G).', '#ff6a5a'); return; }
    WUI.chat('guild', `<span style="color:#5fd88a">[Guild]</span> <span style="color:#8fc8ff">${U.esc(G.player.name)}</span>: <span style="color:#8fe8a8">${U.esc(text)}</span>`);
    // a guildmate responds
    const mate = this.sims.find(s => this.online.has(s.name) && g.members.includes(s.name) && !this.isMuted(s.name));
    if (mate && U.rand() < 0.7)
      setTimeout(() => WUI.chat('guild', `<span style="color:#5fd88a">[Guild]</span> ${this.nameHtml(mate)}: <span style="color:#8fe8a8">${U.esc(U.pick(U.rand, ['aye', 'agreed', 'haha', 'on my way', 'nice', 'o7', 'this. exactly this.']))}</span>`), U.ri(U.rand, 1200, 4000));
  },
  setMotd(text) {
    const g = this.state.guild;
    if (!g) { WUI.chat('sys', 'You are not in a guild.', '#ff6a5a'); return; }
    if (g.rank !== 'Guild Master') { WUI.chat('sys', 'Only the Guild Master can set the MOTD.', '#ff6a5a'); return; }
    g.motd = text;
    this.save();
    WUI.chat('guild', `<span style="color:#5fd88a">[Guild]</span> MOTD set: ${U.esc(text)}`, '#8fe8a8');
    WUI.refreshSocialFrames && WUI.refreshSocialFrames();
  },

  // ---------------- emotes ----------------
  emote(kind) {
    const pl = G.player;
    const e = this.EMOTES[kind];
    if (!e) {
      WUI.chat('sys', 'Emotes: ' + Object.keys(this.EMOTES).map(k => '/' + k).join(' '), '#ffd94f');
      return;
    }
    WUI.chat('local', `<span style="color:#ff9a3f">${U.esc(e[0])}</span>`);
    pl.bubble = { text: e[0], t: 3, maxT: 3, kind: 'emote' };
    if (kind === 'dance') {
      pl.danceT = 5;
      sfx('shrine');
      // nearby sims may join in
      for (const sp of this.townSims) {
        if (U.dist(sp.x, sp.y, pl.x, pl.y) < 7 && U.rand() < 0.45) {
          setTimeout(() => {
            sp.danceT = 4.5;
            sp.bubble = { text: e[1].replace('%s', sp.name), t: 3, maxT: 3, kind: 'emote' };
          }, U.ri(U.rand, 600, 2400));
        }
      }
    } else if (U.rand() < 0.4) {
      // someone responds with an emote of their own
      const sp = this.townSims.length ? U.pick(U.rand, this.townSims) : null;
      if (sp && !this.isMuted(sp.name)) {
        const keys = Object.keys(this.EMOTES);
        const rk = U.pick(U.rand, keys);
        setTimeout(() => {
          sp.bubble = { text: this.EMOTES[rk][1].replace('%s', sp.name), t: 3, maxT: 3, kind: 'emote' };
          WUI.chat('local', `<span style="color:#ff9a3f">${U.esc(this.EMOTES[rk][1].replace('%s', sp.name))}</span>`);
        }, U.ri(U.rand, 800, 2600));
      }
    }
  },

  // player speaks in local chat (with bubble)
  localSay(text) {
    const pl = G.player;
    WUI.chat('local', `<span style="color:#9a9a86">[Local]</span> <span style="color:#8fc8ff">${U.esc(pl.name)}</span>: <span style="color:#d8d2be">${U.esc(text)}</span>`);
    pl.bubble = { text, t: 4.5, maxT: 4.5, kind: 'chat' };
    // someone might answer
    if (U.rand() < 0.5) {
      const s = this.randOnline();
      if (s) setTimeout(() => this.say(s, U.pick(U.rand, ['ha, true', 'agreed', 'lol', 'this guy gets it', 'preach', 'fair enough', '^'])), U.ri(U.rand, 1500, 5000));
    }
  },

  // ---------------- commands (called from WUI.chatCommand) ----------------
  // returns true when handled
  command(cmd, rest) {
    switch (cmd) {
      case 'w': case 'whisper': case 'tell': {
        const [name, ...msg] = rest;
        if (!name || !msg.length) { WUI.chat('sys', 'Usage: /w <player> <message>', '#ffd94f'); return true; }
        this.whisperTo(name, msg.join(' '));
        return true;
      }
      case 'r': case 'reply': {
        if (!this.lastWhisperFrom) { WUI.chat('sys', 'Nobody has whispered you yet.', '#8a8a72'); return true; }
        this.whisperTo(this.lastWhisperFrom, rest.join(' ') || '...');
        return true;
      }
      case 'g': case 'guild': {
        if (!rest.length) { UI.open('guild'); return true; }
        this.guildSay(rest.join(' '));
        return true;
      }
      case 'gquit': this.leaveGuild(); return true;
      case 'gmotd': this.setMotd(rest.join(' ')); return true;
      case 'friend': this.addFriend(rest.join(' ')); return true;
      case 'unfriend': this.removeFriend(rest.join(' ')); return true;
      case 'mute': this.mute(rest.join(' '), true); return true;
      case 'unmute': this.mute(rest.join(' '), false); return true;
      case 'block': case 'ignore': this.block(rest.join(' '), true); return true;
      case 'unblock': case 'unignore': this.block(rest.join(' '), false); return true;
      case 'who': {
        const zone = G.map ? G.map.name : '?';
        const here = G.map && G.map.town ? this.townSims.map(s => s.name)
          : this.sims.filter(s => this.online.has(s.name)).slice(0, U.ri(U.rand, 3, 6)).map(s => s.name);
        WUI.chat('sys', `Players in <b>${U.esc(zone)}</b>: ${here.map(n => U.esc(n)).join(', ') || 'just you'} (${this.online.size} online in Sanctuary)`, '#8fc8ff');
        return true;
      }
      case 'emotes': this.emote('__list'); return true;
      case 'social': case 'friends': UI.open('social'); return true;
      case 'say': case 's': this.localSay(rest.join(' ')); return true;
      default:
        if (this.EMOTES[cmd]) { this.emote(cmd); return true; }
        return false;
    }
  },

  // ---------------- panels ----------------
  renderSocialPanel() {
    const p = UI.panel('social');
    UI.head(p, 'SOCIAL — FRIENDS & IGNORED');
    const st = this.state;
    let h = '<div class="npc-line">Friends see login alerts. Muted players\' chat is hidden; blocked players can\'t whisper you either.<br>Commands: <b>/friend /unfriend /mute /block /w /r /who</b></div>';
    h += '<h2 style="font-size:14px">FRIENDS</h2>';
    if (!st.friends.length) h += '<div class="q-desc">No friends yet. Meet people in town, then /friend them.</div>';
    for (const name of st.friends) {
      const s = this.sim(name);
      if (!s) continue;
      const on = this.online.has(s.name);
      h += `<div class="soc-row"><span class="soc-dot" style="background:${on ? '#6be26b' : '#555'}"></span>
        ${this.nameHtml(s)} <span class="soc-sub">Lv ${s.lvl} ${(CLASSES.find(c => c.id === s.cls) || {}).name || ''} · ${on ? 'Online' : 'Offline'}</span>
        <span class="soc-actions"><button data-act="w" data-n="${U.esc(s.name)}">Whisper</button><button data-act="unfriend" data-n="${U.esc(s.name)}">Remove</button></span></div>`;
    }
    h += '<h2 style="font-size:14px;margin-top:12px">MUTED / BLOCKED</h2>';
    if (!st.muted.length && !st.blocked.length) h += '<div class="q-desc">Nobody. The realm is at peace.</div>';
    for (const name of st.muted) h += `<div class="soc-row"><span class="soc-dot" style="background:#c8a03a"></span>${U.esc(name)} <span class="soc-sub">muted</span><span class="soc-actions"><button data-act="unmute" data-n="${U.esc(name)}">Unmute</button></span></div>`;
    for (const name of st.blocked) h += `<div class="soc-row"><span class="soc-dot" style="background:#c0392b"></span>${U.esc(name)} <span class="soc-sub">blocked</span><span class="soc-actions"><button data-act="unblock" data-n="${U.esc(name)}">Unblock</button></span></div>`;
    h += '<h2 style="font-size:14px;margin-top:12px">PLAYERS ONLINE</h2><div class="soc-grid">';
    for (const s of this.sims.filter(x => this.online.has(x.name)).slice(0, 18))
      h += `<div class="soc-row">${this.nameHtml(s)}<span class="soc-actions"><button data-act="friend" data-n="${U.esc(s.name)}">＋Friend</button><button data-act="mute" data-n="${U.esc(s.name)}">Mute</button><button data-act="block" data-n="${U.esc(s.name)}">Block</button></span></div>`;
    h += '</div>';
    p.insertAdjacentHTML('beforeend', h);
    p.querySelectorAll('button[data-act]').forEach(b => b.addEventListener('click', () => {
      const n = b.dataset.n;
      switch (b.dataset.act) {
        case 'w': UI.closeAll(); WUI.openChat(); document.querySelector('#wui-chat input').value = '/w ' + n + ' '; break;
        case 'friend': this.addFriend(n); this.renderSocialPanel(); break;
        case 'unfriend': this.removeFriend(n); this.renderSocialPanel(); break;
        case 'mute': this.mute(n, true); this.renderSocialPanel(); break;
        case 'unmute': this.mute(n, false); this.renderSocialPanel(); break;
        case 'block': this.block(n, true); this.renderSocialPanel(); break;
        case 'unblock': this.block(n, false); this.renderSocialPanel(); break;
      }
    }));
  },

  renderGuildPanel() {
    const p = UI.panel('guild');
    UI.head(p, 'GUILD');
    const g = this.state.guild;
    if (g) {
      let h = `<div style="text-align:center;font-size:17px;color:#5fd88a">${U.esc(g.name)} <span style="color:#8a7444">⟨${g.tag}⟩</span></div>
        <div style="text-align:center;color:#8a7444;font-size:12px;margin-bottom:8px">Your rank: ${g.rank}</div>
        <div class="npc-line">MOTD: ${U.esc(g.motd)}${g.rank === 'Guild Master' ? ' <span style="color:#5f5237">(/gmotd to change)</span>' : ''}</div>
        <h2 style="font-size:14px">ROSTER — ${g.members.length + 1} members</h2>`;
      h += `<div class="soc-row"><span class="soc-dot" style="background:#6be26b"></span><span style="color:#8fc8ff">${U.esc(G.player.name)}</span> <span class="soc-sub">${g.rank} (you)</span></div>`;
      g.members.forEach((name, i) => {
        const s = this.sim(name);
        if (!s) return;
        const on = this.online.has(s.name);
        const rank = g.own ? (i < 2 ? 'Officer' : 'Member') : (i === 0 ? 'Guild Master' : i < 3 ? 'Officer' : 'Member');
        h += `<div class="soc-row"><span class="soc-dot" style="background:${on ? '#6be26b' : '#555'}"></span>${this.nameHtml(s)} <span class="soc-sub">Lv ${s.lvl} · ${rank} · ${on ? 'Online' : 'Offline'}</span></div>`;
      });
      p.insertAdjacentHTML('beforeend', h);
      const btn = document.createElement('button');
      btn.className = 'ws-btn danger';
      btn.style.marginTop = '10px';
      btn.textContent = 'Leave guild';
      btn.addEventListener('click', () => { this.leaveGuild(); this.renderGuildPanel(); });
      p.appendChild(btn);
    } else {
      let h = '<div class="npc-line">A guild gives you a tag, a roster, and a green chat channel of your very own.</div><h2 style="font-size:14px">GUILDS RECRUITING</h2>';
      this.GUILDS.forEach((g2, i) => {
        const n = this.sims.filter(s => s.guild && s.guild.tag === g2.tag).length;
        h += `<div class="soc-row"><span style="color:#5fd88a">${U.esc(g2.name)}</span> <span style="color:#8a7444">⟨${g2.tag}⟩</span>
          <span class="soc-sub">${n} members · "${U.esc(g2.motd)}"</span>
          <span class="soc-actions"><button data-join="${i}">Join</button></span></div>`;
      });
      h += `<h2 style="font-size:14px;margin-top:12px">FOUND YOUR OWN — 2,500 gold</h2>
        <div class="soc-found"><input id="soc-gname" maxlength="24" placeholder="Guild name"><input id="soc-gtag" maxlength="4" placeholder="TAG" style="width:64px"><button class="ws-btn" id="soc-gcreate">Found guild</button></div>`;
      p.insertAdjacentHTML('beforeend', h);
      p.querySelectorAll('button[data-join]').forEach(b => b.addEventListener('click', () => { this.joinGuild(+b.dataset.join); this.renderGuildPanel(); }));
      p.querySelector('#soc-gcreate').addEventListener('click', () => {
        const name = p.querySelector('#soc-gname').value.trim();
        const tag = p.querySelector('#soc-gtag').value.trim();
        if (!name || !tag) return;
        if (this.createGuild(name, tag)) this.renderGuildPanel();
      });
    }
  },

  // ---------------- engine hooks ----------------
  wrapEngine() {
    const self = this;
    // reactions to notable drops and boss kills
    const _dl = G.dropLoot.bind(G);
    G.dropLoot = function (m) {
      const before = G.groundItems.length;
      _dl(m);
      for (let i = before; i < G.groundItems.length; i++) {
        const gi = G.groundItems[i];
        if (gi.item && (gi.item.rarity === 'unique' || gi.item.rarity === 'set') && U.rand() < 0.7) {
          const s = self.randOnline();
          if (s) setTimeout(() => self.say(s, U.pick(U.rand, ['nice drop!!', 'oh grats on the drop', 'that item is BiS, congrats', 'sell it to me. please.'])), U.ri(U.rand, 1500, 4500));
        }
      }
    };
    const _ob = G.onBossKilled.bind(G);
    G.onBossKilled = function (m) {
      _ob(m);
      const s = self.randOnline();
      if (s) setTimeout(() => self.say(s, U.pick(U.rand, ['gg on the boss', 'heard that roar from town, gg', 'boss down! grats'])), U.ri(U.rand, 2000, 5000));
    };
    // panels
    const _open = UI.open.bind(UI);
    UI.open = function (name) {
      _open(name);
      if (name === 'social') self.renderSocialPanel();
      if (name === 'guild') self.renderGuildPanel();
    };
  },
};
