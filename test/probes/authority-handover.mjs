import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// Diagnostic only, outside the Vitest suite. No app launch or vault access.
// The methods run against delayed storage mocks, not against an Electron host.
const archivePath = process.env.OBSIDIAN_APP_ASAR;
assert.ok(
  archivePath,
  'Supply the explicitly inspected application archive path',
);
const archive = readFileSync(archivePath);
const header = JSON.parse(archive.subarray(16, 16 + archive.readUInt32LE(12)));
function entry(name) {
  const file = header.files[name];
  assert.ok(
    file && !file.unpacked && !file.files,
    `Missing archive entry ${name}`,
  );
  const start = 8 + archive.readUInt32LE(4) + Number(file.offset);
  return archive.subarray(start, start + Number(file.size)).toString();
}
const source = entry('app.js');
const application = JSON.parse(entry('package.json')).version;
const appJsSha256 = createHash('sha256').update(source).digest('hex');
console.log(JSON.stringify({ application, appJsSha256 }));
assert.equal(application, '1.14.5');
assert.equal(
  appJsSha256,
  '95b9fd3944625c3b88116878b03d655147fed8cdfe6ddf931f2064ead78ccd5b',
  'Different host build: inspect its source before adapting this probe',
);
const base = source.indexOf('Q4=function(e){');
assert.ok(base > 0);
function method(name, next) {
  const prefix = `t.prototype.${name}=`;
  const declaration = source.indexOf(prefix, base);
  assert.ok(declaration > base);
  const start = declaration + prefix.length;
  const end = source.indexOf(`,t.prototype.${next}=`, start);
  assert.ok(end > start && end - base < 10000);
  return source.slice(start, end);
}
const helperStart = source.indexOf('function y(e,t,n,i){');
const helperEnd = source.indexOf('Object.create;function w(e)', helperStart);
assert.ok(
  helperStart > 0 && helperEnd > helperStart && helperEnd - helperStart < 3000,
);
const context = {
  Promise,
  console,
  e: { prototype: { onUnloadFile: async () => undefined } },
  XT: async (promise) => {
    await promise;
  },
  zT: class {},
  db: { interface: { msgFailToSaveFile: () => 'save failed' } },
};
const methods = runInNewContext(
  `${source.slice(helperStart, helperEnd)}; ({ save: (${method('save', 'onModify')}), onUnloadFile: (${method('onUnloadFile', 'onLoadFile')}) })`,
  context,
);

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture() {
  let disk = 'Original';
  let buffer = 'Draft';
  const entered = deferred();
  const release = deferred();
  const file = { path: 'Synthetic.md', deleted: false };
  let calls = 0;
  const view = {
    ...methods,
    file,
    dirty: true,
    saving: false,
    saveAgain: false,
    lastSavedData: disk,
    data: disk,
    getViewData: () => buffer,
    clear: () => {
      buffer = '';
    },
    app: {
      vault: {
        adapter: { promise: Promise.resolve() },
        modify: async (target, text) => {
          assert.equal(target, file);
          calls++;
          entered.resolve();
          await release.promise;
          disk = text;
        },
      },
      fileManager: {
        storeTextFileBackup: () => assert.fail('unexpected save failure'),
      },
    },
  };
  return {
    view,
    file,
    entered,
    release,
    disk: () => disk,
    buffer: (value) => {
      buffer = value;
      view.dirty = true;
    },
    calls: () => calls,
  };
}

for (const value of ['Final', '']) {
  test(`control: uncontested save acknowledges ${JSON.stringify(value)}`, async () => {
    const f = fixture();
    f.buffer(value);
    const saving = f.view.save();
    await f.entered.promise;
    f.release.resolve();
    await saving;
    assert.equal(f.disk(), value);
    assert.equal(f.view.saving, false);
  });
}

test('control: uncontested unload writes its current buffer', async () => {
  const f = fixture();
  f.buffer('Final');
  const unloading = f.view.onUnloadFile(f.file);
  await f.entered.promise;
  f.release.resolve();
  await unloading;
  assert.equal(f.disk(), 'Final');
  assert.equal(f.view.saving, false);
});

test('candidate gate: awaited save acknowledges the latest pending buffer', async () => {
  const f = fixture();
  const first = f.view.save();
  await f.entered.promise;
  f.buffer('Final');
  await f.view.save();
  const acknowledged = {
    disk: f.disk(),
    saving: f.view.saving,
    saveAgain: f.view.saveAgain,
  };
  f.release.resolve();
  await first;
  await Promise.resolve();
  assert.deepEqual(acknowledged, {
    disk: 'Final',
    saving: false,
    saveAgain: false,
  });
});

test('candidate gate: awaited unload drains an already running save', async () => {
  const f = fixture();
  const first = f.view.save();
  await f.entered.promise;
  f.buffer('Final');
  await f.view.onUnloadFile(f.file);
  const activeAtUnload = f.view.saving;
  // This is a modeled caller releasing ownership, not a real WorkspaceLeaf.
  f.view.file = null;
  f.release.resolve();
  await first;
  assert.deepEqual(
    { activeAtUnload, disk: f.disk(), calls: f.calls() },
    { activeAtUnload: false, disk: 'Final', calls: 2 },
  );
});

test('candidate gate: save then unload acknowledges an empty pending buffer', async () => {
  const f = fixture();
  const first = f.view.save();
  await f.entered.promise;
  f.buffer('');
  await f.view.save();
  await f.view.onUnloadFile(f.file);
  f.view.file = null;
  f.release.resolve();
  await first;
  assert.equal(f.disk(), '');
});
