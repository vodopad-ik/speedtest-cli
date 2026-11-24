'use strict';

// Заголовки, чтобы замер был честным:
// - no-cache: просим прокси/CDN не отдавать ответ из своего кеша;
// - accept-encoding: identity: просим не сжимать ответ. fetch сам распаковывает gzip/br,
//   и тогда мы посчитали бы распакованные байты, а не реально скачанные по сети.
const REQUEST_HEADERS = {
  'cache-control': 'no-cache',
  pragma: 'no-cache',
  'accept-encoding': 'identity',
};

/**
 * Делает один запрос и дочитывает тело ответа до конца.
 * Время считается от отправки запроса до последнего байта тела.
 */
async function measureRequest(url, { timeoutMs = 30_000 } = {}) {
  const startedAt = process.hrtime.bigint();

  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    redirect: 'follow',
    // таймаут действует и на ожидание ответа, и на чтение тела
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    // тело не нужно, но его надо закрыть, иначе соединение повиснет
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }

  // Считаем байты по факту, а не по Content-Length:
  // заголовка может не быть (chunked) или он может не совпадать с реальным телом.
  let bytes = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
    }
  }

  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  return { status: response.status, bytes, durationMs };
}

/** Превращает ошибку fetch в короткое понятное сообщение. */
function describeError(err) {
  if (err?.name === 'TimeoutError') return 'таймаут';
  // fetch оборачивает сетевые ошибки в "fetch failed", настоящая причина лежит в cause
  const code = err?.cause?.code;
  if (code === 'ENOTFOUND') return 'домен не найден (ENOTFOUND)';
  if (code === 'EAI_AGAIN') return 'не удалось разрешить домен — нет сети или DNS (EAI_AGAIN)';
  if (code === 'ECONNREFUSED') return 'соединение отклонено (ECONNREFUSED)';
  if (code) return `сетевая ошибка (${code})`;
  return err?.message || String(err);
}

/** Итоги по успешным запросам. */
function summarize(results) {
  const ok = results.filter((r) => r.ok);
  const totalBytes = ok.reduce((sum, r) => sum + r.bytes, 0);
  const totalMs = ok.reduce((sum, r) => sum + r.durationMs, 0);

  return {
    total: results.length,
    succeeded: ok.length,
    failed: results.length - ok.length,
    totalBytes,
    totalMs,
    avgMs: ok.length > 0 ? totalMs / ok.length : 0,
    // Скорость = все байты / всё время, а не среднее из скоростей отдельных запросов:
    // так короткий "выброс" одного запроса не перекашивает итог.
    bitsPerSecond: totalMs > 0 ? (totalBytes * 8) / (totalMs / 1000) : 0,
  };
}

/**
 * Делает count запросов строго последовательно.
 * Упавший запрос не останавливает замер — он просто не попадает в итоговую статистику.
 */
async function runBenchmark(url, { count = 10, timeoutMs, onResult } = {}) {
  const results = [];

  for (let index = 1; index <= count; index++) {
    let result;
    try {
      const measured = await measureRequest(url, { timeoutMs });
      result = { index, ok: true, ...measured };
    } catch (err) {
      result = { index, ok: false, error: describeError(err) };
    }
    results.push(result);
    onResult?.(result);
  }

  return { results, summary: summarize(results) };
}

module.exports = { measureRequest, runBenchmark, summarize, describeError };
