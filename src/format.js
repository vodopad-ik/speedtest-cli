'use strict';

// Используем десятичные единицы (SI), как провайдеры и speedtest.net:
// 1 MB = 1 000 000 байт, 1 Mbit/s = 1 000 000 бит в секунду.

function formatBytes(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`;
  return `${bytes} B`;
}

function formatMbps(bitsPerSecond) {
  return `${(bitsPerSecond / 1e6).toFixed(2)} Mbit/s`;
}

function formatMBps(bitsPerSecond) {
  return `${(bitsPerSecond / 8 / 1e6).toFixed(2)} MB/s`;
}

function formatMs(ms) {
  return `${Math.round(ms)} ms`;
}

module.exports = { formatBytes, formatMbps, formatMBps, formatMs };
