// Exercises the exported web app with browser-generated IDs unrelated to Expo's IDs.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, channel: process.env.TRACE_BROWSER_CHANNEL ?? 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    geolocation: { latitude: 40.4237, longitude: -86.9212, accuracy: 8 }, permissions: ['geolocation'] });
  await context.addInitScript(() => {
    const geo = navigator.geolocation;
    const originalWatch = geo.watchPosition.bind(geo);
    const originalClear = geo.clearWatch.bind(geo);
    const ids = new Map();
    window.traceGeo = { received: 0, cleared: [], active: 0 };
    geo.watchPosition = (success, failure, options) => {
      const nativeId = originalWatch(position => { window.traceGeo.received++; success(position); }, failure, options);
      const id = nativeId + 73921;
      ids.set(id, nativeId);
      window.traceGeo.active = ids.size;
      return id;
    };
    geo.clearWatch = id => {
      window.traceGeo.cleared.push(id);
      if (ids.has(id)) { originalClear(ids.get(id)); ids.delete(id); }
      window.traceGeo.active = ids.size;
    };
  });
  const page = await context.newPage();
  await page.goto(process.env.TRACE_WEB_URL ?? 'http://localhost:8091');
  try {
    await page.getByText('Your starting point is set', { exact: true }).waitFor({ timeout: 8000 });
  } catch (error) {
    console.log('Browser GPS callback diagnostics:', await page.evaluate(() => window.traceGeo));
    throw error;
  }
  assert.equal(await page.getByRole('button', { name: 'Generate routes', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: 'Refresh current location', exact: true }).click();
  await page.getByText('Your starting point is set', { exact: true }).waitFor();
  const diagnostics = await page.evaluate(() => window.traceGeo);
  assert.ok(diagnostics.received >= 2);
  assert.equal(diagnostics.active, 0, 'GPS watches must be cleared using their browser IDs');
  assert.ok(diagnostics.cleared.every(id => id >= 73921));
  // Browsers without the Permissions API must still request GPS normally.
  await context.addInitScript(() => { Object.defineProperty(navigator, 'permissions', { value: undefined }); });
  await page.reload();
  await page.getByText('Your starting point is set', { exact: true }).waitFor();
  console.log('PASS: exported app receives GPS with arbitrary browser watch IDs; refresh works; watches are cleared; Permissions API is optional.');
  await context.close();
} finally { await browser.close(); }
