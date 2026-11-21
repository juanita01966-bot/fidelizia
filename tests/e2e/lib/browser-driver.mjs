import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

export const VIEWPORT_DESKTOP = Object.freeze({
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

export const VIEWPORT_MOBILE = Object.freeze({
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});

/**
 * Resolves cached Chromium or Chrome Headless Shell executable path.
 * @returns {string}
 */
export function resolveChromiumExecutable() {
  const envCandidates = [
    process.env.FIDELIZIA_CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  ].filter(Boolean);

  for (const candidate of envCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const msPlaywrightDirs = [
    path.join(localAppData, 'ms-playwright'),
    path.join(os.homedir(), '.cache', 'ms-playwright'),
  ];

  const exactCandidates = [
    path.join(
      localAppData,
      'ms-playwright',
      'chromium_headless_shell-1255',
      'chrome-headless-shell-win64',
      'chrome-headless-shell.exe'
    ),
    path.join(
      localAppData,
      'ms-playwright',
      'chromium-1255',
      'chrome-win64',
      'chrome.exe'
    ),
  ];

  for (const candidate of exactCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  for (const baseDir of msPlaywrightDirs) {
    if (!fs.existsSync(baseDir)) continue;
    const entries = fs.readdirSync(baseDir).sort().reverse();
    for (const entry of entries) {
      if (entry.startsWith('chromium_headless_shell-')) {
        const winPath = path.join(baseDir, entry, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
        if (fs.existsSync(winPath)) return winPath;
        const linuxPath = path.join(baseDir, entry, 'chrome-headless-shell-linux', 'chrome-headless-shell');
        if (fs.existsSync(linuxPath)) return linuxPath;
      }
      if (entry.startsWith('chromium-')) {
        const winPath = path.join(baseDir, entry, 'chrome-win64', 'chrome.exe');
        if (fs.existsSync(winPath)) return winPath;
        const linuxPath = path.join(baseDir, entry, 'chrome-linux', 'chrome');
        if (fs.existsSync(linuxPath)) return linuxPath;
      }
    }
  }

  throw new Error(
    'Unable to locate Chromium executable. Set FIDELIZIA_CHROME_PATH or ensure Playwright chromium is cached in %LOCALAPPDATA%\\ms-playwright.'
  );
}

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
  }

  async connect(timeoutMs = 10000) {
    this.ws = new globalThis.WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`CDP WebSocket timeout: ${this.wsUrl}`)), timeoutMs);
      this.ws.addEventListener(
        'open',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
      this.ws.addEventListener(
        'error',
        (ev) => {
          clearTimeout(timer);
          reject(new Error(`CDP WebSocket error: ${ev?.message || 'connection failed'}`));
        },
        { once: true }
      );
    });

    this.ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
      } catch {
        return;
      }
      if (msg.id !== undefined) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          if (msg.error) {
            entry.reject(new Error(`CDP ${entry.method} failed: ${msg.error.message} (${msg.error.code})`));
          } else {
            entry.resolve(msg.result || {});
          }
        }
        return;
      }
      if (msg.method) {
        const handlers = this.listeners.get(msg.method);
        if (handlers) {
          for (const h of handlers) {
            try {
              h(msg.params || {});
            } catch {
              // ignore listener exceptions
            }
          }
        }
      }
    });

    this.ws.addEventListener('close', () => {
      this.closed = true;
      for (const [, entry] of this.pending.entries()) {
        entry.reject(new Error(`CDP connection closed before ${entry.method} completed`));
      }
      this.pending.clear();
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(handler);
    return () => this.listeners.get(method)?.delete(handler);
  }

  send(method, params = {}, timeoutMs = 15000) {
    if (!this.ws || this.closed || this.ws.readyState !== globalThis.WebSocket.OPEN) {
      return Promise.reject(new Error(`CDP WebSocket is not open for ${method}`));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, {
        method,
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async close() {
    if (!this.ws || this.closed) return;
    this.closed = true;
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

function isHydrationWarning(text) {
  return /hydration|did not match|text content does not match|there was an error while hydrating/i.test(
    text
  );
}

/**
 * Launches headless Chromium and returns a BrowserSession.
 * @param {{ executablePath?: string, headless?: boolean, args?: string[], timeoutMs?: number }} [options]
 */
export async function launchBrowser(options = {}) {
  const executablePath = options.executablePath || resolveChromiumExecutable();
  const timeoutMs = options.timeoutMs ?? 15000;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelizia-e2e-chrome-'));
  const isShell = path.basename(executablePath).toLowerCase().includes('headless');

  const baseArgs = [
    isShell ? '--headless' : '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    ...(options.args || []),
    'about:blank',
  ];

  const child = spawn(executablePath, baseArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const wsUrl = await new Promise((resolve, reject) => {
    let stderrBuf = '';
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for Chromium DevTools URL. stderr: ${stderrBuf}`));
    }, timeoutMs);

    const onData = (chunk) => {
      stderrBuf += chunk.toString('utf8');
      const match = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        child.stderr.off('data', onData);
        resolve(match[1]);
      }
    };

    child.stderr.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chromium exited prematurely with code ${code}. stderr: ${stderrBuf}`));
    });
  });

  const browserUrlObj = new URL(wsUrl);
  const httpBase = `http://${browserUrlObj.host}`;
  const browserCdp = new CdpConnection(wsUrl);
  await browserCdp.connect(timeoutMs);

  const openPages = new Set();

  async function setPermission(origin, permissionName, setting) {
    const params = {
      permission: { name: permissionName },
      setting,
    };
    if (origin) params.origin = origin;
    await browserCdp.send('Browser.setPermission', params);
  }

  async function newPage(pageOpts = {}) {
    const { targetId } = await browserCdp.send('Target.createTarget', { url: 'about:blank' });
    const listRes = await fetch(`${httpBase}/json/list`);
    const targets = await listRes.json();
    const target = targets.find((t) => t.id === targetId);
    if (!target || !target.webSocketDebuggerUrl) {
      throw new Error(`Could not find webSocketDebuggerUrl for target ${targetId}`);
    }

    const pageCdp = new CdpConnection(target.webSocketDebuggerUrl);
    await pageCdp.connect(timeoutMs);
    await pageCdp.send('Page.enable');
    await pageCdp.send('Runtime.enable');
    await pageCdp.send('Network.enable');

    let currentUrl = 'about:blank';
    let currentViewport = null;
    let inflightNetwork = 0;
    const inflightRequestIds = new Set();
    let telemetry = {
      consoleErrors: [],
      hydrationWarnings: [],
      pageErrors: [],
      failedRequests: [],
      httpErrors: [],
    };

    pageCdp.on('Runtime.consoleAPICalled', (params) => {
      const text = (params.args || [])
        .map((a) => (a.value !== undefined ? String(a.value) : a.description || ''))
        .join(' ')
        .trim();
      if (params.type === 'error') {
        telemetry.consoleErrors.push({ text, timestamp: Date.now() });
      }
      if ((params.type === 'error' || params.type === 'warning') && isHydrationWarning(text)) {
        telemetry.hydrationWarnings.push({ text, type: params.type, timestamp: Date.now() });
      }
    });

    pageCdp.on('Runtime.exceptionThrown', (params) => {
      const details = params.exceptionDetails || {};
      const msg =
        details.exception?.description ||
        details.exception?.value ||
        details.text ||
        'Uncaught page exception';
      telemetry.pageErrors.push({ text: String(msg), timestamp: Date.now() });
    });

    pageCdp.on('Network.requestWillBeSent', (params) => {
      if (params.requestId) {
        inflightRequestIds.add(params.requestId);
        inflightNetwork = inflightRequestIds.size;
      }
    });

    pageCdp.on('Network.loadingFinished', (params) => {
      if (params.requestId) {
        inflightRequestIds.delete(params.requestId);
        inflightNetwork = inflightRequestIds.size;
      }
    });

    pageCdp.on('Network.loadingFailed', (params) => {
      if (params.requestId) {
        inflightRequestIds.delete(params.requestId);
        inflightNetwork = inflightRequestIds.size;
      }
      telemetry.failedRequests.push({
        url: params.blockedReason || params.requestId,
        errorText: params.errorText || 'Loading failed',
        type: params.type || 'Other',
        canceled: Boolean(params.canceled),
      });
    });

    pageCdp.on('Network.responseReceived', (params) => {
      const r = params.response;
      if (r && r.status >= 400) {
        telemetry.httpErrors.push({
          url: r.url,
          status: r.status,
          statusText: r.statusText || '',
          type: params.type || 'Other',
        });
      }
    });

    async function setViewport(viewport) {
      currentViewport = { ...viewport };
      const width = viewport.width;
      const height = viewport.height;
      await pageCdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
        mobile: Boolean(viewport.mobile),
        screenWidth: width,
        screenHeight: height,
      });
    }

    async function setUserAgent(userAgent) {
      await pageCdp.send('Emulation.setUserAgentOverride', { userAgent });
    }

    async function setGeolocation(coords, origin) {
      const resolvedOrigin =
        origin ||
        (currentUrl && currentUrl !== 'about:blank' ? new URL(currentUrl).origin : undefined);

      if (coords === null) {
        await setPermission(resolvedOrigin, 'geolocation', 'denied');
        await pageCdp.send('Emulation.clearGeolocationOverride');
        return;
      }

      await setPermission(resolvedOrigin, 'geolocation', 'granted');
      await pageCdp.send('Emulation.setGeolocationOverride', {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy ?? 10,
      });
    }

    async function evaluate(fnOrExpr, ...args) {
      let expression;
      if (typeof fnOrExpr === 'function') {
        expression = `(${fnOrExpr.toString()})(...${JSON.stringify(args)})`;
      } else {
        expression = String(fnOrExpr);
      }
      const res = await pageCdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (res.exceptionDetails) {
        const desc =
          res.exceptionDetails.exception?.description ||
          res.exceptionDetails.text ||
          'Evaluation threw an exception';
        throw new Error(desc);
      }
      return res.result ? res.result.value : undefined;
    }

    async function goto(url, navOpts = {}) {
      const navTimeout = navOpts.timeoutMs ?? 20000;
      const waitUntil = navOpts.waitUntil || 'load';
      currentUrl = url;

      let loaded = false;
      const loadPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          off();
          reject(new Error(`Page.navigate(${url}) timed out waiting for load after ${navTimeout}ms`));
        }, navTimeout);
        const off = pageCdp.on('Page.loadEventFired', () => {
          loaded = true;
          clearTimeout(timer);
          off();
          resolve();
        });
      });

      const navRes = await pageCdp.send('Page.navigate', { url }, navTimeout);
      if (navRes.errorText) {
        throw new Error(`Navigation to ${url} failed: ${navRes.errorText}`);
      }
      if (!loaded) {
        await loadPromise;
      }

      if (waitUntil === 'networkidle') {
        const deadline = Date.now() + Math.min(5000, navTimeout);
        while (Date.now() < deadline) {
          if (inflightNetwork === 0) {
            await new Promise((r) => setTimeout(r, 150));
            if (inflightNetwork === 0) break;
          }
          await new Promise((r) => setTimeout(r, 50));
        }
      } else {
        await new Promise((r) => setTimeout(r, 50));
      }

      return { url: currentUrl };
    }

    async function waitForSelector(selector, waitOpts = {}) {
      const waitTimeout = waitOpts.timeoutMs ?? 8000;
      const visible = Boolean(waitOpts.visible);
      const deadline = Date.now() + waitTimeout;

      while (Date.now() < deadline) {
        const found = await evaluate(
          (sel, requireVisible) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            if (!requireVisible) return true;
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden'
            );
          },
          selector,
          visible
        );
        if (found) return true;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error(`Timed out after ${waitTimeout}ms waiting for selector "${selector}"`);
    }

    async function boundingBox(selector) {
      return evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, selector);
    }

    async function click(selector) {
      const pt = await evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return { empty: true };
        const vv = window.visualViewport;
        const scale = vv && vv.scale ? vv.scale : 1;
        const offX = vv ? vv.offsetLeft : 0;
        const offY = vv ? vv.offsetTop : 0;
        return {
          x: (r.left + r.width / 2 - offX) * scale,
          y: (r.top + r.height / 2 - offY) * scale,
        };
      }, selector);
      if (!pt || pt.empty) {
        throw new Error(`Cannot click selector "${selector}": element missing or zero-sized`);
      }
      const { x, y } = pt;
      await pageCdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await pageCdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
      await pageCdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
    }

    async function fill(selector, text) {
      const box = await boundingBox(selector);
      if (!box) {
        throw new Error(`Cannot fill selector "${selector}": element not found`);
      }
      await click(selector);
      await evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return;
        el.focus();
        if (typeof el.select === 'function') {
          el.select();
        }
        const proto =
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, '');
        else el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, selector);

      const str = String(text);
      if (str.length > 0) {
        await pageCdp.send('Input.insertText', { text: str });
      }

      await evaluate((sel, expected) => {
        const el = document.querySelector(sel);
        if (!el) return;
        if (el.value !== expected) {
          const proto =
            el instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) setter.call(el, expected);
          else el.value = expected;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, selector, str);
    }

    async function textContent(selector) {
      return evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? el.textContent : null;
      }, selector);
    }

    async function exists(selector) {
      return evaluate((sel) => Boolean(document.querySelector(sel)), selector);
    }

    async function getComputedStyles(selector, props = []) {
      return evaluate((sel, propList) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const out = {};
        for (const p of propList) {
          out[p] = cs.getPropertyValue(p) || cs[p] || '';
        }
        return out;
      }, selector, props);
    }

    async function auditPageGeometry() {
      const expectedWidth = currentViewport?.width ?? null;
      return evaluate(async (expW) => {
        if (document.fonts?.ready) {
          try {
            await document.fonts.ready;
          } catch {
            // ignore
          }
        }
        const docEl = document.documentElement;
        const bodyStyle = document.body ? getComputedStyle(document.body) : null;
        const maxScrollWidth = Math.max(docEl.scrollWidth, document.body ? document.body.scrollWidth : 0);
        const overflowVsInner = maxScrollWidth > window.innerWidth;
        const overflowVsClient = maxScrollWidth > docEl.clientWidth;
        const overflowVsViewport = expW ? maxScrollWidth > expW : false;
        return {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          clientWidth: docEl.clientWidth,
          scrollWidth: maxScrollWidth,
          scrollHeight: docEl.scrollHeight,
          hasHorizontalOverflow: overflowVsInner || overflowVsClient || overflowVsViewport,
          bodyBg: bodyStyle ? bodyStyle.backgroundColor : '',
          fontsLoaded: document.fonts ? document.fonts.size : 0,
        };
      }, expectedWidth);
    }

    async function captureQrElements(selector = 'svg, canvas, img[alt*="QR" i], img[src^="data:image/"]') {
      return evaluate((sel) => {
        const els = Array.from(document.querySelectorAll(sel));
        return els.map((el) => {
          const tag = el.tagName.toLowerCase();
          const rect = el.getBoundingClientRect();
          let dataUrl = null;
          if (tag === 'canvas' && typeof el.toDataURL === 'function') {
            try {
              dataUrl = el.toDataURL('image/png');
            } catch {
              dataUrl = null;
            }
          } else if (tag === 'img') {
            dataUrl = el.getAttribute('src');
          }
          return {
            tagName: tag,
            outerHTML: el.outerHTML,
            dataUrl,
            alt: el.getAttribute('alt') || '',
            width: rect.width,
            height: rect.height,
          };
        });
      }, selector);
    }

    async function screenshot() {
      const { data } = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
      return Buffer.from(data, 'base64');
    }

    function getTelemetry() {
      return structuredClone(telemetry);
    }

    function resetTelemetry() {
      telemetry = {
        consoleErrors: [],
        hydrationWarnings: [],
        pageErrors: [],
        failedRequests: [],
        httpErrors: [],
      };
    }

    async function close() {
      openPages.delete(pageSession);
      await pageCdp.close();
      try {
        await browserCdp.send('Target.closeTarget', { targetId }, 3000);
      } catch {
        // ignore if already closed
      }
    }

    if (pageOpts.viewport) {
      await setViewport(pageOpts.viewport);
    }
    if (pageOpts.userAgent) {
      await setUserAgent(pageOpts.userAgent);
    }
    if (Array.isArray(pageOpts.permissions)) {
      for (const perm of pageOpts.permissions) {
        await setPermission(perm.origin, perm.name, perm.setting);
      }
    }
    if (pageOpts.geolocation !== undefined) {
      await setGeolocation(pageOpts.geolocation);
    }

    const pageSession = {
      targetId,
      goto,
      setViewport,
      setUserAgent,
      setGeolocation,
      evaluate,
      waitForSelector,
      click,
      fill,
      textContent,
      exists,
      getComputedStyles,
      boundingBox,
      auditPageGeometry,
      captureQrElements,
      screenshot,
      getTelemetry,
      resetTelemetry,
      close,
    };

    openPages.add(pageSession);
    return pageSession;
  }

  async function close() {
    for (const page of Array.from(openPages)) {
      await page.close().catch(() => {});
    }
    try {
      await browserCdp.send('Browser.close', {}, 2000);
    } catch {
      // ignore
    }
    await browserCdp.close();

    if (child.exitCode === null) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1500);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }

    if (child.exitCode === null) {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      if (process.platform === 'win32' && child.pid) {
        spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
      }
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  return {
    executablePath,
    wsUrl,
    newPage,
    setPermission,
    close,
  };
}
