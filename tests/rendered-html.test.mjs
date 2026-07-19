import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("builds the Sit Center application and phone-camera workflow", async () => {
  const [page, layout, css] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(layout, /Sit Center \| Căn giữa vị trí ngồi/);
  assert.match(page, /Kết nối camera điện thoại/);
  assert.match(page, /new RTCPeerConnection/);
  assert.match(page, /QRCode\.toDataURL/);
  assert.match(page, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(css, /\.pairing-dialog/);
  assert.match(css, /\.phone-camera-page/);
  assert.doesNotMatch(page, /codex-preview|Your site is taking shape|react-loading-skeleton/i);

  await access(new URL("dist/server/index.js", root));
});

test("uses short-lived D1 signaling without storing video", async () => {
  const [route, schema, migration, hosting] = await Promise.all([
    readFile(new URL("app/api/camera-sessions/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0000_giant_cannonball.sql", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
  ]);

  assert.match(route, /SESSION_TTL_SECONDS = 10 \* 60/);
  assert.match(route, /offer/);
  assert.match(route, /answer/);
  assert.doesNotMatch(route, /video|MediaStream|Blob/);
  assert.match(schema, /cameraSessions/);
  assert.match(migration, /CREATE TABLE `camera_sessions`/);
  assert.equal(JSON.parse(hosting).d1, "DB");
});

test("ships a static GitHub Pages build with phone-camera pairing", async () => {
  const [html, script, css, noJekyll] = await Promise.all([
    readFile(new URL("docs/index.html", root), "utf8"),
    readFile(new URL("docs/app.js", root), "utf8"),
    readFile(new URL("docs/style.css", root), "utf8"),
    access(new URL("docs/.nojekyll", root)),
  ]);

  assert.match(html, /peerjs@1\.5\.5/);
  assert.match(html, /qrcodejs@1\.0\.0/);
  assert.match(html, /id="remote-camera"/);
  assert.match(html, /id="phone-view"/);
  assert.match(script, /new window\.Peer/);
  assert.match(script, /peer\.call\(phoneTarget, phoneStream\)/);
  assert.match(script, /new window\.QRCode/);
  assert.match(css, /\.pairing-dialog/);
  assert.equal(noJekyll, undefined);
});
