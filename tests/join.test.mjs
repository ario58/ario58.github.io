// Runs join/index.html's real inline script (plus apk.js) in a vm sandbox.
// node --test tests/
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const dir = new URL('../', import.meta.url);
const html = readFileSync(new URL('join/index.html', dir), 'utf8');
const apkJs = readFileSync(new URL('apk.js', dir), 'utf8');
const pageJs = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const API = 'https://api.github.com/repos/ario58/ArioSecretSantaReleases/releases/latest';
const APK = 'https://github.com/ario58/ArioSecretSantaReleases/releases/download/v9/SecretSanta-v9.apk';
const RELEASE = { assets: [{ name: 'SecretSanta-v9.apk', browser_download_url: APK }] };

// Stub only what the page touches, but take the element inventory from the real HTML.
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const apkCount = (html.match(/class="[^"]*js-apk/g) || []).length;

const el = () => ({
  textContent: '', href: '', hidden: true,
  addEventListener() {}, setAttribute() {}, removeAttribute() {},
});

async function load(search) {
  const els = Object.fromEntries(ids.map((i) => [i, el()]));
  const apks = Array.from({ length: apkCount }, el);
  const fetches = [];
  const ctx = vm.createContext({
    location: { search, href: null },
    URLSearchParams,
    console,
    fetch(url, opts) {
      fetches.push({ url, opts });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(RELEASE) });
    },
    document: {
      getElementById: (id) => els[id],
      querySelectorAll: (sel) => (sel === '.js-apk' ? apks : []),
    },
  });
  vm.runInContext(apkJs, ctx);
  vm.runInContext(pageJs, ctx);
  await new Promise((r) => setTimeout(r, 0)); // let the release lookup settle
  return { els, apks, fetches };
}

const CANON = 'ABCD1234EFGH5678';

for (const input of [CANON, 'abcd1234efgh5678', 'ABCD-1234-EFGH-5678', 'abcd-1234-efgh-5678', '  ABCD-1234-EFGH-5678  ']) {
  test(`valid: ${JSON.stringify(input)}`, async () => {
    const { els } = await load('?code=' + encodeURIComponent(input));
    assert.equal(els.valid.hidden, false);
    assert.equal(els.invalid.hidden, true);
    assert.equal(els.code.textContent, CANON);
    assert.equal(els.open.href, 'secretsanta://join?code=' + CANON);
  });
}

const INVALID = {
  'too short': 'ABCD1234EFGH567',
  'too long': 'ABCD1234EFGH56789',
  empty: '',
  missing: null,
  'contains I': 'IBCD1234EFGH5678',
  'contains L': 'LBCD1234EFGH5678',
  'contains O': 'OBCD1234EFGH5678',
  'contains U': 'UBCD1234EFGH5678',
  'lowercase l': 'abcd1234efgl5678',
  'internal spaces': 'ABCD 1234 EFGH 5678',
  'script input': '<script>alert(1)</script>',
  'html input': '"><img src=x onerror=alert(1)>',
  punctuation: 'ABCD.1234_EFGH+567',
  'hyphens only': '----------------',
  'url injection': 'ABCD1234EFGH5678&x=1',
  'path traversal': '../../ABCD1234EFGH',
};

for (const [name, input] of Object.entries(INVALID)) {
  test(`invalid: ${name}`, async () => {
    const { els } = await load(input === null ? '' : '?code=' + encodeURIComponent(input));
    assert.equal(els.invalid.hidden, false);
    assert.equal(els.valid.hidden, true);
    assert.equal(els.code.textContent, '');
    assert.equal(els.open.href, '');
  });
}

test('both pages resolve the direct APK download', async () => {
  for (const search of ['?code=' + CANON, '?code=nope']) {
    const { apks, fetches } = await load(search);
    assert.equal(apks.length, 2);
    for (const a of apks) assert.equal(a.href, APK);
    assert.equal(fetches.length, 1, 'one shared release lookup per page load');
    assert.equal(fetches[0].url, API);
  }
});

test('the invite code never reaches the GitHub API request', async () => {
  const { fetches } = await load('?code=ABCD-1234-EFGH-5678');
  const sent = fetches.map((f) => f.url + JSON.stringify(f.opts)).join('\n');
  assert.equal(sent.includes('ABCD'), false);
  assert.equal(sent.includes('code'), false);
});

test('no analytics, storage or tokens', () => {
  const bad = /localStorage|sessionStorage|indexedDB|document\.cookie|\btokens?\b|Authorization|analytics|gtag|sendBeacon/i;
  for (const [name, src] of [['join/index.html', html], ['apk.js', apkJs]]) {
    assert.equal(bad.test(src), false, name);
  }
  assert.equal(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(html), false);
});
