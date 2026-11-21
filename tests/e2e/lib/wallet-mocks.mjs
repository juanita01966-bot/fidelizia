import http from 'node:http';
import http2 from 'node:http2';
import crypto from 'node:crypto';
import forge from 'node-forge';
import jwt from 'jsonwebtoken';

function createSelfSignedApnsCert() {
  const pair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const priv = forge.pki.privateKeyFromPem(pair.privateKey);
  const pub = forge.pki.publicKeyFromPem(pair.publicKey);
  const cert = forge.pki.createCertificate();
  cert.publicKey = pub;
  const serialBytes = crypto.randomBytes(8);
  serialBytes[0] = (serialBytes[0] & 0x7f) | 0x01;
  cert.serialNumber = serialBytes.toString('hex');
  cert.validity.notBefore = new Date(Date.now() - 86400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400_000);
  const attrs = [{ name: 'commonName', value: 'api.push.apple.com' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'api.push.apple.com' },
        { type: 2, value: 'api.sandbox.push.apple.com' },
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
      ],
    },
  ]);
  cert.sign(priv, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: pair.privateKey,
  };
}

function readRawStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

function parseBodySafely(raw, contentType = '') {
  if (!raw) return null;
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function matchesPattern(value, pattern) {
  if (!pattern) return true;
  if (pattern instanceof RegExp) return pattern.test(value);
  return value.includes(String(pattern));
}

export async function startWalletMocks(options = {}) {
  const host = options.host || '127.0.0.1';
  const googlePort = options.googlePort ?? 0;
  const apnsPort = options.apnsPort ?? 0;
  const requireBearerAuth = options.requireBearerAuth === true;
  const googlePublicKeyPem = options.googlePublicKeyPem || null;

  let googleRequests = [];
  let apnsRequests = [];
  let loyaltyClasses = new Map();
  let loyaltyObjects = new Map();
  let unregisteredTokens = new Set();
  let googleFaults = [];
  let apnsFaults = [];
  let reqSeq = 0;
  const pendingTimers = new Set();
  const h2Sessions = new Set();

  function waitWithTimer(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        pendingTimers.delete(t);
        resolve();
      }, ms);
      pendingTimers.add(t);
    });
  }

  function sendGoogleJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  function consumeMatchingRule(rules, predicate) {
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      if (!predicate(rule)) continue;
      if (rule.remaining !== undefined) {
        rule.remaining -= 1;
        if (rule.remaining <= 0) rules.splice(i, 1);
      }
      return rule;
    }
    return null;
  }

  const googleServer = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', `http://${host}`);
    const pathname = urlObj.pathname;
    const method = (req.method || 'GET').toUpperCase();
    const rawBody = await readRawStream(req);
    const contentType = String(req.headers['content-type'] || '');
    const parsedBody = parseBodySafely(rawBody, contentType);
    const targetHost = String(req.headers['x-mock-target-host'] || (pathname === '/token' ? 'oauth2.googleapis.com' : 'walletobjects.googleapis.com'));

    // Internal admin endpoints for cross-process E2E inspection/faults
    if (pathname.startsWith('/__admin/')) {
      if (pathname === '/__admin/google-requests' && method === 'GET') {
        sendGoogleJson(res, 200, googleRequests);
        return;
      }
      if (pathname === '/__admin/apns-requests' && method === 'GET') {
        sendGoogleJson(res, 200, apnsRequests);
        return;
      }
      if (pathname === '/__admin/reset' && method === 'POST') {
        googleRequests = [];
        apnsRequests = [];
        loyaltyClasses.clear();
        loyaltyObjects.clear();
        unregisteredTokens.clear();
        googleFaults = [];
        apnsFaults = [];
        sendGoogleJson(res, 200, { reset: true });
        return;
      }
      if (pathname === '/__admin/clear-faults' && method === 'POST') {
        googleFaults = [];
        apnsFaults = [];
        sendGoogleJson(res, 200, { cleared: true });
        return;
      }
      if (pathname === '/__admin/fault/google' && method === 'POST' && parsedBody) {
        googleFaults.push({ ...parsedBody, remaining: parsedBody.times ?? Infinity });
        sendGoogleJson(res, 200, { ok: true });
        return;
      }
      if (pathname === '/__admin/fault/apns' && method === 'POST' && parsedBody) {
        apnsFaults.push({ ...parsedBody, remaining: parsedBody.times ?? Infinity });
        sendGoogleJson(res, 200, { ok: true });
        return;
      }
      if (pathname === '/__admin/apns/unregister' && method === 'POST' && parsedBody?.pushToken) {
        unregisteredTokens.add(String(parsedBody.pushToken));
        sendGoogleJson(res, 200, { ok: true });
        return;
      }
      sendGoogleJson(res, 404, { error: 'Unknown wallet mock admin route' });
      return;
    }

    const record = {
      id: ++reqSeq,
      timestamp: new Date().toISOString(),
      targetHost,
      method,
      path: pathname,
      query: Object.fromEntries(urlObj.searchParams.entries()),
      headers: { ...req.headers },
      body: parsedBody,
      rawBody,
      responseStatus: 200,
    };

    const fault = consumeMatchingRule(
      googleFaults,
      (r) => (!r.method || r.method.toUpperCase() === method) && matchesPattern(pathname, r.pathPattern)
    );

    if (fault) {
      if (fault.hang) {
        googleRequests.push({ ...record, responseStatus: 0 });
        return; // Intentionally leave socket hanging until caller times out or server closes
      }
      if (fault.delayMs > 0) {
        await waitWithTimer(fault.delayMs);
        if (res.destroyed || res.writableEnded) return;
      }
      const status = fault.status ?? 500;
      record.responseStatus = status;
      googleRequests.push(record);
      sendGoogleJson(
        res,
        status,
        fault.body || {
          error: {
            code: status,
            message: `Injected Google mock fault (${status})`,
            status: status === 429 ? 'RESOURCE_EXHAUSTED' : 'INTERNAL',
          },
        }
      );
      return;
    }

    // OAuth2 Token Endpoint
    if (pathname === '/token' && method === 'POST') {
      const form = typeof parsedBody === 'object' && parsedBody ? parsedBody : parseBodySafely(rawBody, 'application/x-www-form-urlencoded');
      if (!form?.grant_type || !form?.assertion) {
        record.responseStatus = 400;
        googleRequests.push(record);
        sendGoogleJson(res, 400, { error: 'invalid_request', error_description: 'Missing grant_type or assertion' });
        return;
      }
      if (googlePublicKeyPem) {
        try {
          jwt.verify(String(form.assertion), googlePublicKeyPem, { algorithms: ['RS256'] });
        } catch (err) {
          record.responseStatus = 401;
          googleRequests.push(record);
          sendGoogleJson(res, 401, { error: 'invalid_grant', error_description: err.message });
          return;
        }
      }
      record.responseStatus = 200;
      googleRequests.push(record);
      sendGoogleJson(res, 200, {
        access_token: `e2e-mock-google-token-${record.id}`,
        token_type: 'Bearer',
        expires_in: 3600,
      });
      return;
    }

    // Optional Bearer auth enforcement for Wallet API routes
    if (requireBearerAuth) {
      const auth = String(req.headers.authorization || '');
      if (!auth.startsWith('Bearer ')) {
        record.responseStatus = 401;
        googleRequests.push(record);
        sendGoogleJson(res, 401, { error: { code: 401, message: 'Missing Bearer token' } });
        return;
      }
    }

    // LoyaltyClass routes
    if (pathname === '/walletobjects/v1/loyaltyClass' && method === 'POST') {
      const id = parsedBody?.id;
      if (!id) {
        record.responseStatus = 400;
        googleRequests.push(record);
        sendGoogleJson(res, 400, { error: { code: 400, message: 'Missing loyaltyClass id' } });
        return;
      }
      loyaltyClasses.set(id, structuredClone(parsedBody));
      record.responseStatus = 200;
      googleRequests.push(record);
      sendGoogleJson(res, 200, loyaltyClasses.get(id));
      return;
    }

    if (pathname.startsWith('/walletobjects/v1/loyaltyClass/')) {
      const classId = decodeURIComponent(pathname.slice('/walletobjects/v1/loyaltyClass/'.length));
      if (method === 'GET') {
        const existing = loyaltyClasses.get(classId);
        if (!existing) {
          record.responseStatus = 404;
          googleRequests.push(record);
          sendGoogleJson(res, 404, { error: { code: 404, message: `Class ${classId} not found`, status: 'NOT_FOUND' } });
          return;
        }
        record.responseStatus = 200;
        googleRequests.push(record);
        sendGoogleJson(res, 200, existing);
        return;
      }
      if (method === 'PATCH' || method === 'PUT') {
        const current = loyaltyClasses.get(classId) || { id: classId };
        const updated = { ...current, ...(typeof parsedBody === 'object' && parsedBody ? parsedBody : {}), id: classId };
        loyaltyClasses.set(classId, updated);
        record.responseStatus = 200;
        googleRequests.push(record);
        sendGoogleJson(res, 200, updated);
        return;
      }
    }

    // LoyaltyObject addMessage route
    const addMsgMatch = pathname.match(/^\/walletobjects\/v1\/loyaltyObject\/([^/]+)\/addMessage$/);
    if (addMsgMatch && method === 'POST') {
      const objectId = decodeURIComponent(addMsgMatch[1]);
      const current = loyaltyObjects.get(objectId) || { id: objectId, messages: [] };
      const nextMessages = Array.isArray(current.messages) ? [...current.messages] : [];
      if (parsedBody?.message) {
        nextMessages.push(structuredClone(parsedBody.message));
      }
      const updated = { ...current, messages: nextMessages };
      loyaltyObjects.set(objectId, updated);
      record.responseStatus = 200;
      googleRequests.push(record);
      sendGoogleJson(res, 200, { resource: updated });
      return;
    }

    // LoyaltyObject CRUD routes
    if (pathname === '/walletobjects/v1/loyaltyObject' && method === 'POST') {
      const id = parsedBody?.id;
      if (!id) {
        record.responseStatus = 400;
        googleRequests.push(record);
        sendGoogleJson(res, 400, { error: { code: 400, message: 'Missing loyaltyObject id' } });
        return;
      }
      loyaltyObjects.set(id, structuredClone(parsedBody));
      record.responseStatus = 200;
      googleRequests.push(record);
      sendGoogleJson(res, 200, loyaltyObjects.get(id));
      return;
    }

    if (pathname.startsWith('/walletobjects/v1/loyaltyObject/')) {
      const objectId = decodeURIComponent(pathname.slice('/walletobjects/v1/loyaltyObject/'.length));
      if (method === 'GET') {
        const existing = loyaltyObjects.get(objectId);
        if (!existing) {
          record.responseStatus = 404;
          googleRequests.push(record);
          sendGoogleJson(res, 404, { error: { code: 404, message: `Object ${objectId} not found`, status: 'NOT_FOUND' } });
          return;
        }
        record.responseStatus = 200;
        googleRequests.push(record);
        sendGoogleJson(res, 200, existing);
        return;
      }
      if (method === 'PATCH' || method === 'PUT') {
        const current = loyaltyObjects.get(objectId) || { id: objectId };
        const updated = { ...current, ...(typeof parsedBody === 'object' && parsedBody ? parsedBody : {}), id: objectId };
        loyaltyObjects.set(objectId, updated);
        record.responseStatus = 200;
        googleRequests.push(record);
        sendGoogleJson(res, 200, updated);
        return;
      }
    }

    record.responseStatus = 404;
    googleRequests.push(record);
    sendGoogleJson(res, 404, { error: { code: 404, message: `Unhandled route ${method} ${pathname}` } });
  });

  // Apple APNs HTTP/2 TLS Server
  const apnsCert = createSelfSignedApnsCert();
  const apnsServer = http2.createSecureServer({
    cert: apnsCert.certPem,
    key: apnsCert.keyPem,
    allowHTTP1: false,
  });

  apnsServer.on('session', (session) => {
    h2Sessions.add(session);
    session.on('close', () => h2Sessions.delete(session));
  });

  apnsServer.on('stream', async (stream, headers) => {
    const method = String(headers[':method'] || 'POST').toUpperCase();
    const reqPath = String(headers[':path'] || '/');
    const targetHost = String(headers[':authority'] || 'api.push.apple.com');

    const chunks = [];
    await new Promise((resolve) => {
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', resolve);
      stream.on('error', resolve);
    });
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const parsedBody = parseBodySafely(rawBody, 'application/json');

    const match = reqPath.match(/^\/3\/device\/(.+)$/);
    const pushToken = match ? decodeURIComponent(match[1]) : '';

    const record = {
      id: ++reqSeq,
      timestamp: new Date().toISOString(),
      targetHost,
      method,
      path: reqPath,
      pushToken,
      headers: { ...headers },
      apnsTopic: headers['apns-topic'] || null,
      apnsPushType: headers['apns-push-type'] || null,
      apnsPriority: headers['apns-priority'] || null,
      rawBody,
      parsedBody,
      responseStatus: 200,
      responseBody: null,
    };

    const fault = consumeMatchingRule(
      apnsFaults,
      (r) =>
        (!r.pushToken || r.pushToken === pushToken) &&
        matchesPattern(reqPath, r.pathPattern)
    );

    if (fault) {
      if (fault.hang) {
        record.responseStatus = 0;
        apnsRequests.push(record);
        return;
      }
      if (fault.delayMs > 0) {
        await waitWithTimer(fault.delayMs);
        if (stream.destroyed || stream.closed) return;
      }
      const status = fault.status ?? 500;
      const errBody = {
        reason: fault.reason || (status === 410 ? 'Unregistered' : 'InternalServerError'),
        timestamp: Date.now(),
      };
      record.responseStatus = status;
      record.responseBody = errBody;
      apnsRequests.push(record);
      const json = JSON.stringify(errBody);
      stream.respond({
        ':status': status,
        'content-type': 'application/json',
        'apns-id': crypto.randomUUID(),
      });
      stream.end(json);
      return;
    }

    if (method !== 'POST' || !pushToken) {
      const errBody = { reason: 'BadDeviceToken' };
      record.responseStatus = 400;
      record.responseBody = errBody;
      apnsRequests.push(record);
      stream.respond({ ':status': 400, 'content-type': 'application/json' });
      stream.end(JSON.stringify(errBody));
      return;
    }

    if (unregisteredTokens.has(pushToken)) {
      const errBody = { reason: 'Unregistered', timestamp: Date.now() };
      record.responseStatus = 410;
      record.responseBody = errBody;
      apnsRequests.push(record);
      stream.respond({
        ':status': 410,
        'content-type': 'application/json',
        'apns-id': crypto.randomUUID(),
      });
      stream.end(JSON.stringify(errBody));
      return;
    }

    record.responseStatus = 200;
    apnsRequests.push(record);
    stream.respond({
      ':status': 200,
      'apns-id': crypto.randomUUID(),
    });
    stream.end();
  });

  await Promise.all([
    new Promise((resolve, reject) => {
      googleServer.once('error', reject);
      googleServer.listen(googlePort, host, () => resolve());
    }),
    new Promise((resolve, reject) => {
      apnsServer.once('error', reject);
      apnsServer.listen(apnsPort, host, () => resolve());
    }),
  ]);

  const gAddr = googleServer.address();
  const aAddr = apnsServer.address();
  const googleUrl = `http://${host}:${typeof gAddr === 'object' && gAddr ? gAddr.port : googlePort}`;
  const apnsUrl = `https://${host}:${typeof aAddr === 'object' && aAddr ? aAddr.port : apnsPort}`;

  return {
    googleUrl,
    apnsUrl,
    getGoogleRequests() {
      return structuredClone(googleRequests);
    },
    getOAuthTokenRequests() {
      return structuredClone(
        googleRequests.filter((r) => r.targetHost === 'oauth2.googleapis.com' && r.path === '/token')
      );
    },
    getWalletApiRequests() {
      return structuredClone(googleRequests.filter((r) => r.targetHost === 'walletobjects.googleapis.com'));
    },
    getApnsRequests() {
      return structuredClone(apnsRequests);
    },
    seedLoyaltyClass(classObj) {
      loyaltyClasses.set(classObj.id, structuredClone(classObj));
    },
    seedLoyaltyObject(objectObj) {
      loyaltyObjects.set(objectObj.id, structuredClone(objectObj));
    },
    getLoyaltyClass(classId) {
      const found = loyaltyClasses.get(classId);
      return found ? structuredClone(found) : undefined;
    },
    getLoyaltyObject(objectId) {
      const found = loyaltyObjects.get(objectId);
      return found ? structuredClone(found) : undefined;
    },
    injectGoogleFault(rule) {
      googleFaults.push({ ...rule, remaining: rule.times ?? Infinity });
    },
    injectApnsFault(rule) {
      apnsFaults.push({ ...rule, remaining: rule.times ?? Infinity });
    },
    markAppleTokenUnregistered(pushToken) {
      unregisteredTokens.add(String(pushToken));
    },
    clearFaults() {
      googleFaults = [];
      apnsFaults = [];
    },
    reset() {
      googleRequests = [];
      apnsRequests = [];
      loyaltyClasses.clear();
      loyaltyObjects.clear();
      unregisteredTokens.clear();
      googleFaults = [];
      apnsFaults = [];
    },
    async close() {
      for (const t of pendingTimers) clearTimeout(t);
      pendingTimers.clear();
      for (const s of h2Sessions) {
        try {
          s.destroy();
        } catch {
          // ignore
        }
      }
      h2Sessions.clear();
      if (typeof googleServer.closeAllConnections === 'function') {
        googleServer.closeAllConnections();
      }
      await Promise.all([
        new Promise((resolve) => googleServer.close(() => resolve())),
        new Promise((resolve) => apnsServer.close(() => resolve())),
      ]);
    },
  };
}
