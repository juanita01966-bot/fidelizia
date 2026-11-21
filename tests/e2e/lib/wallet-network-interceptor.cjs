'use strict';

const http = require('node:http');
const https = require('node:https');
const http2 = require('node:http2');

const GOOGLE_HOSTS = new Set([
  'walletobjects.googleapis.com',
  'oauth2.googleapis.com',
]);

const APPLE_HOSTS = new Set([
  'api.push.apple.com',
  'api.sandbox.push.apple.com',
]);

const GUARD_SYMBOL = Symbol.for('fidelizia.e2e.walletNetworkInterceptor');

function resolveGoogleMockUrl(hostname) {
  if (hostname === 'oauth2.googleapis.com') {
    return (
      process.env.FIDELIZIA_E2E_GOOGLE_OAUTH_MOCK_URL ||
      process.env.FIDELIZIA_E2E_GOOGLE_WALLET_MOCK_URL ||
      process.env.FIDELIZIA_MOCK_GOOGLE_WALLET_URL ||
      ''
    );
  }
  if (hostname === 'walletobjects.googleapis.com') {
    return (
      process.env.FIDELIZIA_E2E_GOOGLE_WALLET_MOCK_URL ||
      process.env.FIDELIZIA_MOCK_GOOGLE_WALLET_URL ||
      ''
    );
  }
  return '';
}

function resolveAppleMockUrl(hostname) {
  if (!APPLE_HOSTS.has(hostname)) return '';
  return (
    process.env.FIDELIZIA_E2E_APPLE_APNS_MOCK_URL ||
    process.env.FIDELIZIA_MOCK_APNS_URL ||
    ''
  );
}

function parseTargetUrl(input, options) {
  if (typeof input === 'string') {
    return new URL(input);
  }
  if (input && typeof input === 'object' && typeof input.href === 'string') {
    return new URL(input.href);
  }
  const opts = input && typeof input === 'object' ? input : options || {};
  const proto = opts.protocol || 'https:';
  const host = opts.hostname || opts.host || '';
  const port = opts.port ? `:${opts.port}` : '';
  const path = opts.path || '/';
  if (!host) return null;
  return new URL(`${proto}//${host}${port}${path}`);
}

function installWalletNetworkInterceptor() {
  if (globalThis[GUARD_SYMBOL]) {
    return globalThis[GUARD_SYMBOL];
  }

  const origHttpRequest = http.request;
  const origHttpsRequest = https.request;
  const origFetch = globalThis.fetch;
  const origHttp2Connect = http2.connect;

  function makeWrappedRequest(defaultProtocol, fallbackOrig) {
    return function wrappedNodeRequest(input, options, cb) {
      let urlArg = null;
      let optsArg = {};
      let cbArg = undefined;

      if (typeof input === 'string' || (input && typeof input === 'object' && typeof input.href === 'string')) {
        urlArg = input;
        if (typeof options === 'function') {
          cbArg = options;
        } else {
          optsArg = options || {};
          cbArg = cb;
        }
      } else {
        optsArg = input || {};
        cbArg = typeof options === 'function' ? options : cb;
      }

      let parsed = null;
      try {
        parsed = parseTargetUrl(urlArg || { protocol: defaultProtocol, ...optsArg }, optsArg);
      } catch {
        parsed = null;
      }

      if (parsed && GOOGLE_HOSTS.has(parsed.hostname)) {
        const mockBase = resolveGoogleMockUrl(parsed.hostname);
        if (mockBase) {
          const mockUrl = new URL(mockBase);
          const headers = { ...(optsArg.headers || {}) };
          headers['x-mock-target-host'] = parsed.hostname;
          if (!headers.host && !headers.Host) {
            headers.host = parsed.hostname;
          }

          const nextOpts = {
            ...optsArg,
            protocol: mockUrl.protocol,
            hostname: mockUrl.hostname,
            port: mockUrl.port ? Number(mockUrl.port) : mockUrl.protocol === 'https:' ? 443 : 80,
            path: `${parsed.pathname}${parsed.search}`,
            headers,
          };
          delete nextOpts.host;
          delete nextOpts.agent;
          delete nextOpts.servername;

          const transport = mockUrl.protocol === 'https:' ? origHttpsRequest : origHttpRequest;
          if (mockUrl.protocol === 'https:') {
            nextOpts.rejectUnauthorized = false;
          }
          return cbArg ? transport.call(this, nextOpts, cbArg) : transport.call(this, nextOpts);
        }
      }

      if (urlArg !== null) {
        if (typeof options === 'function') return fallbackOrig.call(this, urlArg, options);
        return cbArg ? fallbackOrig.call(this, urlArg, optsArg, cbArg) : fallbackOrig.call(this, urlArg, optsArg);
      }
      return cbArg ? fallbackOrig.call(this, optsArg, cbArg) : fallbackOrig.call(this, optsArg);
    };
  }

  const wrappedHttpRequest = makeWrappedRequest('http:', origHttpRequest);
  const wrappedHttpsRequest = makeWrappedRequest('https:', origHttpsRequest);

  http.request = wrappedHttpRequest;
  https.request = wrappedHttpsRequest;

  http.get = function wrappedHttpGet(input, options, cb) {
    const req = wrappedHttpRequest.call(this, input, options, cb);
    req.end();
    return req;
  };

  https.get = function wrappedHttpsGet(input, options, cb) {
    const req = wrappedHttpsRequest.call(this, input, options, cb);
    req.end();
    return req;
  };

  if (typeof origFetch === 'function') {
    globalThis.fetch = async function wrappedFetch(input, init) {
      let rawUrl = '';
      if (typeof input === 'string') rawUrl = input;
      else if (input instanceof URL) rawUrl = input.href;
      else if (input && typeof input.url === 'string') rawUrl = input.url;

      let parsed = null;
      try {
        parsed = rawUrl ? new URL(rawUrl) : null;
      } catch {
        parsed = null;
      }

      if (parsed && GOOGLE_HOSTS.has(parsed.hostname)) {
        const mockBase = resolveGoogleMockUrl(parsed.hostname);
        if (mockBase) {
          const mockUrl = new URL(mockBase);
          const rewritten = new URL(`${parsed.pathname}${parsed.search}`, mockUrl.origin).toString();

          const headers = new Headers(
            input && typeof input === 'object' && input.headers ? input.headers : undefined
          );
          if (init?.headers) {
            const extra = new Headers(init.headers);
            extra.forEach((v, k) => headers.set(k, v));
          }
          headers.set('x-mock-target-host', parsed.hostname);

          if (typeof Request !== 'undefined' && input instanceof Request) {
            const nextInit = {
              method: init?.method || input.method,
              headers,
              signal: init?.signal || input.signal,
            };
            if (init && 'body' in init) {
              nextInit.body = init.body;
            } else if (input.body !== null && nextInit.method !== 'GET' && nextInit.method !== 'HEAD') {
              nextInit.body = input.body;
              nextInit.duplex = 'half';
            }
            if (nextInit.body !== undefined && nextInit.body !== null && !nextInit.duplex) {
              nextInit.duplex = 'half';
            }
            return origFetch.call(globalThis, rewritten, nextInit);
          }

          const nextInit = {
            ...(init || {}),
            headers,
          };
          return origFetch.call(globalThis, rewritten, nextInit);
        }
      }

      return origFetch.call(globalThis, input, init);
    };
  }

  http2.connect = function wrappedHttp2Connect(authority, options, listener) {
    let opts = options;
    let cb = listener;
    if (typeof options === 'function') {
      cb = options;
      opts = undefined;
    }

    let parsed = null;
    try {
      parsed = typeof authority === 'string'
        ? new URL(authority)
        : authority && typeof authority.href === 'string'
          ? new URL(authority.href)
          : null;
    } catch {
      parsed = null;
    }

    if (parsed && APPLE_HOSTS.has(parsed.hostname)) {
      const mockBase = resolveAppleMockUrl(parsed.hostname);
      if (mockBase) {
        const nextOpts = { ...(opts || {}), rejectUnauthorized: false };
        delete nextOpts.servername;
        return cb
          ? origHttp2Connect.call(http2, mockBase, nextOpts, cb)
          : origHttp2Connect.call(http2, mockBase, nextOpts);
      }
    }

    return cb
      ? origHttp2Connect.call(http2, authority, opts, cb)
      : origHttp2Connect.call(http2, authority, opts);
  };

  const state = {
    installed: true,
    GOOGLE_HOSTS,
    APPLE_HOSTS,
  };
  globalThis[GUARD_SYMBOL] = state;
  return state;
}

if (process.env.FIDELIZIA_E2E_DISABLE_AUTO_INTERCEPT !== '1') {
  installWalletNetworkInterceptor();
}

module.exports = {
  installWalletNetworkInterceptor,
  GOOGLE_HOSTS,
  APPLE_HOSTS,
};
