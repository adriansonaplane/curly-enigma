#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { discoverEntries } = require('../../tools/compile-models');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diabloid-model-discovery-'));
try {
  const payload = slug => ({ slug, html: '<script></script>', spec: { pivot: 'floor' } });
  fs.writeFileSync(path.join(dir, 'indexed.json'), JSON.stringify(payload('indexed')));
  fs.writeFileSync(path.join(dir, 'local-pack.json'), JSON.stringify(payload('local-pack')));
  fs.writeFileSync(path.join(dir, 'notes.json'), JSON.stringify({ kind: 'not-a-model' }));
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ entries: [
    { slug: 'indexed', meta: 'indexed.json', html: 'indexed.html' },
    { slug: 'missing', meta: 'missing.json', html: 'missing.html' },
  ] }));

  const found = discoverEntries(dir);
  assert.strictEqual(found.indexed, 2);
  assert.deepStrictEqual(found.entries.map(entry => entry.slug).sort(), ['indexed', 'local-pack']);
  assert.strictEqual(found.entries.find(entry => entry.slug === 'local-pack').meta, 'local-pack.json');
  console.log('model discovery includes valid payloads omitted by index.json');
  console.log('model discovery ignores missing index entries and unrelated JSON');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
