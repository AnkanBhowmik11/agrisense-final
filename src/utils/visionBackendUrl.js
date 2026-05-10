/** Vision / YOLO backend URL builder — avoids double :5050 when localStorage has host:port or full URL. */

export const VISION_BACKEND_PORT = '5050';

/**
 * @param {string | null | undefined} savedRaw — from input or localStorage
 * @param {string} defaultHost — IPv4/hostname only (no port)
 */
export function visionBackendEndpoints(savedRaw, defaultHost = '192.168.29.35') {
  let s = (savedRaw ?? '').trim();
  if (!s) s = defaultHost;

  if (/onrender\.com/i.test(s)) {
    const host = s.replace(/^https?:\/\//i, '').split('/')[0];
    return {
      httpBase: `https://${host}`,
      wsUrl: `wss://${host}/ws`,
      hostOnly: host,
      isRender: true,
    };
  }

  let rest = s.replace(/^https?:\/\//i, '');
  const slash = rest.indexOf('/');
  if (slash !== -1) rest = rest.slice(0, slash);

  let host = rest;
  let port = VISION_BACKEND_PORT;
  if (host.includes(':')) {
    const idx = host.lastIndexOf(':');
    const maybePort = host.slice(idx + 1);
    if (/^\d+$/.test(maybePort)) {
      port = maybePort;
      host = host.slice(0, idx);
    }
  }

  return {
    httpBase: `http://${host}:${port}`,
    wsUrl: `ws://${host}:${port}/ws`,
    hostOnly: host,
    isRender: false,
  };
}

/** Persist host only (or host:port if non-default) — strips accidental http:// */
export function normalizeBackendInputForStorage(raw) {
  const t = (raw ?? '').trim();
  if (!t) return '';
  if (/onrender\.com/i.test(t)) return t.replace(/^https?:\/\//i, '').split('/')[0];
  let rest = t.replace(/^https?:\/\//i, '');
  const slash = rest.indexOf('/');
  if (slash !== -1) rest = rest.slice(0, slash);
  let host = rest;
  let port = VISION_BACKEND_PORT;
  if (host.includes(':')) {
    const idx = host.lastIndexOf(':');
    const maybePort = host.slice(idx + 1);
    if (/^\d+$/.test(maybePort)) {
      port = maybePort;
      host = host.slice(0, idx);
    }
  }
  return port === VISION_BACKEND_PORT ? host : `${host}:${port}`;
}
