#!/usr/bin/env node
'use strict';

const { parseArgs } = require('node:util');
const { runBenchmark } = require('../src/measure');
const { formatBytes, formatMbps, formatMBps, formatMs } = require('../src/format');

const HELP = `
Замер скорости скачивания по HTTP(S).

Использование:
  node bin/speedtest.js <url> [опции]

Опции:
  -n, --count <число>     сколько запросов сделать (по умолчанию 10)
  -t, --timeout <сек>     таймаут одного запроса в секундах (по умолчанию 30)
  -h, --help              показать эту справку

Пример:
  node bin/speedtest.js https://proof.ovh.net/files/10Mb.dat -n 5
`;

class UsageError extends Error {}

function parseCli(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        count: { type: 'string', short: 'n', default: '10' },
        timeout: { type: 'string', short: 't', default: '30' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (err) {
    throw new UsageError(err.message);
  }

  const { values, positionals } = parsed;
  if (values.help) return { help: true };

  if (positionals.length !== 1) {
    throw new UsageError('нужно передать ровно один адрес');
  }

  let url;
  try {
    url = new URL(positionals[0]);
  } catch {
    throw new UsageError(`некорректный адрес: ${positionals[0]}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UsageError('поддерживаются только http:// и https://');
  }

  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1) {
    throw new UsageError('--count должен быть целым числом больше 0');
  }

  const timeoutSec = Number(values.timeout);
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
    throw new UsageError('--timeout должен быть положительным числом');
  }

  return { url: url.href, count, timeoutMs: timeoutSec * 1000 };
}

function printResult(result, count) {
  const num = `#${result.index}`.padStart(String(count).length + 1);
  if (!result.ok) {
    console.log(`${num}  ошибка: ${result.error}`);
    return;
  }
  const speed = result.durationMs > 0 ? (result.bytes * 8) / (result.durationMs / 1000) : 0;
  console.log(
    `${num}  ${result.status}  ${formatBytes(result.bytes).padStart(10)}  ` +
      `${formatMs(result.durationMs).padStart(9)}  ${formatMbps(speed).padStart(15)}`,
  );
}

function printSummary(summary) {
  console.log('\nИтого');
  console.log(`  Успешных запросов:  ${summary.succeeded} из ${summary.total}`);
  if (summary.succeeded === 0) return;
  console.log(`  Скачано всего:      ${formatBytes(summary.totalBytes)}`);
  console.log(`  Среднее время:      ${formatMs(summary.avgMs)}`);
  console.log(
    `  Скорость:           ${formatMbps(summary.bitsPerSecond)} (${formatMBps(summary.bitsPerSecond)})`,
  );
}

async function main() {
  let options;
  try {
    options = parseCli(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(`Ошибка: ${err.message}`);
    console.error(HELP);
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(HELP);
    return;
  }

  console.log(`Замер скорости: ${options.url}`);
  console.log(
    `Запросов: ${options.count} (последовательно), таймаут: ${options.timeoutMs / 1000} с\n`,
  );

  const { summary } = await runBenchmark(options.url, {
    count: options.count,
    timeoutMs: options.timeoutMs,
    onResult: (r) => printResult(r, options.count),
  });

  printSummary(summary);

  // 1 — если не прошёл ни один запрос, чтобы скрипт можно было использовать в CI/кроне
  if (summary.succeeded === 0) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = { parseCli, UsageError };
