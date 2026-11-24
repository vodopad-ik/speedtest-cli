'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { runBenchmark, summarize } = require('../src/measure');
const { parseCli, UsageError } = require('../bin/speedtest');
const { formatBytes, formatMbps } = require('../src/format');

const PAYLOAD_SIZE = 1_000_000;
const payload = Buffer.alloc(PAYLOAD_SIZE, 'a');

let server;
let baseUrl;
let requestCount = 0;

before(async () => {
  server = http.createServer((req, res) => {
    requestCount++;
    if (req.url === '/file') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(payload);
    } else if (req.url === '/chunked') {
      // без Content-Length — проверяем, что байты считаются по факту
      res.writeHead(200);
      res.write(payload.subarray(0, 300_000));
      setTimeout(() => res.end(payload.subarray(300_000)), 20);
    } else if (req.url === '/slow') {
      setTimeout(() => res.end('late'), 500);
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

test('делает ровно count запросов и считает все байты', async () => {
  requestCount = 0;
  const { results, summary } = await runBenchmark(`${baseUrl}/file`, { count: 10 });

  assert.equal(requestCount, 10);
  assert.equal(results.length, 10);
  assert.equal(summary.succeeded, 10);
  assert.equal(summary.totalBytes, PAYLOAD_SIZE * 10);
  assert.ok(summary.avgMs > 0);
  assert.ok(summary.bitsPerSecond > 0);
});

test('считает байты без Content-Length (chunked)', async () => {
  const { summary } = await runBenchmark(`${baseUrl}/chunked`, { count: 2 });
  assert.equal(summary.totalBytes, PAYLOAD_SIZE * 2);
});

test('HTTP-ошибка не роняет замер, а попадает в failed', async () => {
  const { results, summary } = await runBenchmark(`${baseUrl}/missing`, { count: 3 });
  assert.equal(summary.failed, 3);
  assert.equal(summary.succeeded, 0);
  assert.match(results[0].error, /HTTP 404/);
});

test('срабатывает таймаут', async () => {
  const { results } = await runBenchmark(`${baseUrl}/slow`, { count: 1, timeoutMs: 100 });
  assert.equal(results[0].ok, false);
  assert.equal(results[0].error, 'таймаут');
});

test('скорость = все байты / всё время, а не среднее скоростей', () => {
  const summary = summarize([
    { ok: true, bytes: 1_000_000, durationMs: 1000 },
    { ok: true, bytes: 1_000_000, durationMs: 3000 },
    { ok: false, error: 'таймаут' },
  ]);
  assert.equal(summary.totalBytes, 2_000_000);
  assert.equal(summary.avgMs, 2000);
  // 2 MB за 4 секунды = 4 Mbit/s (среднее скоростей дало бы 5.33)
  assert.equal(summary.bitsPerSecond, 4_000_000);
  assert.equal(summary.failed, 1);
});

test('валидация аргументов CLI', () => {
  assert.deepEqual(parseCli(['https://example.com/a.jpg']), {
    url: 'https://example.com/a.jpg',
    count: 10,
    timeoutMs: 30_000,
  });
  assert.equal(parseCli(['https://example.com', '-n', '3']).count, 3);
  assert.throws(() => parseCli([]), UsageError);
  assert.throws(() => parseCli(['not-a-url']), UsageError);
  assert.throws(() => parseCli(['ftp://example.com']), UsageError);
  assert.throws(() => parseCli(['https://example.com', '-n', '0']), UsageError);
});

test('форматирование единиц', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1_500_000), '1.50 MB');
  assert.equal(formatMbps(52_400_000), '52.40 Mbit/s');
});
