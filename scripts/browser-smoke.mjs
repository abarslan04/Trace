// Browser-only test fixtures exercise UI states; the running app always uses its real API.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.TRACE_WEB_URL ?? 'http://localhost:8081';
const output = process.env.TRACE_SCREENSHOT_DIR ?? 'artifacts/browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.TRACE_BROWSER_CHANNEL ? { channel: process.env.TRACE_BROWSER_CHANNEL } : {}) });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 40.4237, longitude: -86.9212, accuracy: 8 }, permissions: ['geolocation'] });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  async function settleMap() {
    await page.waitForTimeout(600); // Allow responsive remount and the 450 ms camera transition.
    await page.locator('[data-map-idle="true"]').waitFor({ timeout: 45000 });
  }
  await page.goto(base);
  await page.getByText('Your starting point is set').waitFor();
  await page.getByText('Loading map…', { exact: true }).waitFor({ state: 'hidden', timeout: 45000 });
  assert.equal(await page.getByText('Map unavailable. Check your connection.').count(), 0, 'Real OpenFreeMap map failed');
  await settleMap();
  await page.screenshot({ path: `${output}/phone-initial.png` });
  await page.getByRole('button', { name: 'Enter a custom distance', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Distance in kilometers', exact: true });
  await field.fill('99'); await field.blur();
  assert.equal(await page.getByRole('button', { name: 'Generate routes', exact: true }).isDisabled(), true);
  await page.getByText('Enter a distance from 1 to 30 km, with up to 2 decimals.').waitFor();
  await page.getByRole('button', { name: '5 kilometers', exact: true }).click();
  let responseMode = 'configuration';
  let requests = 0;
  const origin = [-86.9212, 40.4237];
  const routes = [
    { id: 'route-1', type: 'out-and-back', distanceMeters: 5000, geometry: { type: 'LineString', coordinates: [origin, [-86.9212, 40.435], [-86.9212, 40.446183], [-86.9212, 40.435], origin] } },
    { id: 'route-2', type: 'out-and-back', distanceMeters: 5000, geometry: { type: 'LineString', coordinates: [origin, [-86.935, 40.4237], [-86.95073, 40.4237], [-86.935, 40.4237], origin] } },
  ];
  await page.route('**/api/v1/routes/generate', async route => {
    requests++;
    const payload = route.request().postDataJSON();
    assert.equal(payload.distanceMeters, 5000); assert.equal(payload.routeCount, 3);
    assert.ok(Math.abs(payload.latitude - origin[1]) < 0.001);
    if (responseMode === 'configuration') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVER_CONFIGURATION', message: 'not configured' } }) });
    if (responseMode === 'offline') return route.abort('failed');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ routes }) });
  });
  await page.getByRole('button', { name: 'Generate routes', exact: true }).click();
  await page.getByText('The routing service needs configuration. Check the Worker setup.').waitFor().catch(async error => {
    console.error('Route test diagnostics:', { requests, text: await page.locator('body').innerText() });
    throw error;
  });
  responseMode = 'success';
  await page.getByRole('button', { name: 'Generate routes', exact: true }).click();
  await page.getByRole('button', { name: 'Route 2, 5.00 kilometers, out and back', exact: true }).click();
  await page.getByRole('button', { name: 'Route 2, 5.00 kilometers, out and back, selected', exact: true }).waitFor();
  await settleMap();
  await page.screenshot({ path: `${output}/phone-routes.png` });
  await page.reload();
  await page.getByText('Your last routes', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Route 2, 5.00 kilometers, out and back, selected', exact: true }).waitFor();
  assert.equal(requests, 2, 'Restoring routes must not spend provider credits');
  for (const [name, width, height] of [['small-phone', 375, 667], ['landscape', 667, 375], ['desktop', 1280, 800]]) {
    await page.setViewportSize({ width, height });
    await settleMap();
    const button = page.getByRole('button', { name: 'Generate routes', exact: true });
    const box = await button.boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, `${name}: primary action clipped`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`);
    await page.screenshot({ path: `${output}/${name}.png` });
  }
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await settleMap();
  await page.screenshot({ path: `${output}/dark-reduced-motion.png` });
  responseMode = 'offline';
  await page.getByRole('button', { name: 'Generate routes', exact: true }).click();
  await page.getByText('Could not reach Trace. Check your internet connection and API address.').waitFor();
  assert.deepEqual(errors, [], 'Uncaught browser errors');
  await context.close();
  const denied = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const deniedPage = await denied.newPage();
  await deniedPage.goto(base);
  await deniedPage.getByText('Let’s find your starting point', { exact: true }).waitFor({ timeout: 30000 });
  await deniedPage.screenshot({ path: `${output}/location-denied.png` });
  await denied.close();
  console.log('PASS: real map loading; GPS granted/denied; custom validation; configuration/offline errors; fixture route generation/selection/restoration; small phone, landscape, desktop, dark/reduced motion; no uncaught errors.');
} finally { await browser.close(); }
