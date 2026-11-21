import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { E2E_ENV_DEFAULTS, createSeedState } from './fixtures.mjs';

const PUBLIC_ANON_READ_TABLES = new Set(['merchants', 'locations']);

const TABLE_NAMES = [
  'merchants',
  'locations',
  'employees',
  'customers',
  'wallet_passes',
  'apple_device_registrations',
  'transactions',
  'redemptions',
  'reviews_feedback',
  'reservations',
  'fraud_alerts',
];

const UNIQUE_CONSTRAINTS = {
  merchants: [['slug']],
  customers: [['merchant_id', 'phone']],
  wallet_passes: [['pass_serial_number'], ['customer_id', 'pass_type']],
  apple_device_registrations: [['device_library_identifier', 'serial_number']],
  transactions: [['merchant_id', 'ticket_number']],
};

const FOREIGN_KEYS = {
  locations: [{ col: 'merchant_id', refTable: 'merchants', refCol: 'id' }],
  employees: [
    { col: 'merchant_id', refTable: 'merchants', refCol: 'id' },
    { col: 'location_id', refTable: 'locations', refCol: 'id', nullable: true },
  ],
  customers: [{ col: 'merchant_id', refTable: 'merchants', refCol: 'id' }],
  wallet_passes: [
    { col: 'customer_id', refTable: 'customers', refCol: 'id' },
    { col: 'merchant_id', refTable: 'merchants', refCol: 'id' },
  ],
  apple_device_registrations: [
    { col: 'serial_number', refTable: 'wallet_passes', refCol: 'pass_serial_number' },
  ],
  transactions: [
    { col: 'merchant_id', refTable: 'merchants', refCol: 'id' },
    { col: 'location_id', refTable: 'locations', refCol: 'id', nullable: true },
    { col: 'employee_id', refTable: 'employees', refCol: 'id' },
    { col: 'customer_id', refTable: 'customers', refCol: 'id' },
    { col: 'pass_id', refTable: 'wallet_passes', refCol: 'id' },
  ],
  redemptions: [
    { col: 'merchant_id', refTable: 'merchants', refCol: 'id' },
    { col: 'customer_id', refTable: 'customers', refCol: 'id' },
    { col: 'employee_id', refTable: 'employees', refCol: 'id' },
    { col: 'pass_id', refTable: 'wallet_passes', refCol: 'id' },
    { col: 'authorized_by_manager_id', refTable: 'employees', refCol: 'id', nullable: true },
  ],
  reviews_feedback: [
    { col: 'merchant_id', refTable: 'merchants', refCol: 'id' },
    { col: 'customer_id', refTable: 'customers', refCol: 'id' },
    { col: 'transaction_id', refTable: 'transactions', refCol: 'id', nullable: true },
  ],
  reservations: [
    { col: 'merchant_id', refTable: 'merchants', refCol: 'id' },
    { col: 'customer_id', refTable: 'customers', refCol: 'id' },
    { col: 'location_id', refTable: 'locations', refCol: 'id', nullable: true },
  ],
  fraud_alerts: [
    { col: 'merchant_id', refTable: 'merchants', refCol: 'id' },
    { col: 'employee_id', refTable: 'employees', refCol: 'id', nullable: true },
    { col: 'customer_id', refTable: 'customers', refCol: 'id', nullable: true },
  ],
};

// Relation map for embedded FK selects: sourceTable -> relationName -> config
const RELATIONS = {
  merchants: {
    locations: { type: 'many', target: 'locations', localCol: 'id', foreignCol: 'merchant_id' },
    employees: { type: 'many', target: 'employees', localCol: 'id', foreignCol: 'merchant_id' },
    customers: { type: 'many', target: 'customers', localCol: 'id', foreignCol: 'merchant_id' },
    wallet_passes: { type: 'many', target: 'wallet_passes', localCol: 'id', foreignCol: 'merchant_id' },
    transactions: { type: 'many', target: 'transactions', localCol: 'id', foreignCol: 'merchant_id' },
    redemptions: { type: 'many', target: 'redemptions', localCol: 'id', foreignCol: 'merchant_id' },
    reservations: { type: 'many', target: 'reservations', localCol: 'id', foreignCol: 'merchant_id' },
    fraud_alerts: { type: 'many', target: 'fraud_alerts', localCol: 'id', foreignCol: 'merchant_id' },
  },
  locations: {
    merchants: { type: 'one', target: 'merchants', localCol: 'merchant_id', foreignCol: 'id' },
    employees: { type: 'many', target: 'employees', localCol: 'id', foreignCol: 'location_id' },
    reservations: { type: 'many', target: 'reservations', localCol: 'id', foreignCol: 'location_id' },
    transactions: { type: 'many', target: 'transactions', localCol: 'id', foreignCol: 'location_id' },
  },
  employees: {
    merchants: { type: 'one', target: 'merchants', localCol: 'merchant_id', foreignCol: 'id' },
    locations: { type: 'one', target: 'locations', localCol: 'location_id', foreignCol: 'id' },
    transactions: { type: 'many', target: 'transactions', localCol: 'id', foreignCol: 'employee_id' },
    fraud_alerts: { type: 'many', target: 'fraud_alerts', localCol: 'id', foreignCol: 'employee_id' },
  },
  customers: {
    merchants: { type: 'one', target: 'merchants', localCol: 'merchant_id', foreignCol: 'id' },
    wallet_passes: { type: 'many', target: 'wallet_passes', localCol: 'id', foreignCol: 'customer_id' },
    transactions: { type: 'many', target: 'transactions', localCol: 'id', foreignCol: 'customer_id' },
    redemptions: { type: 'many', target: 'redemptions', localCol: 'id', foreignCol: 'customer_id' },
    reviews_feedback: { type: 'many', target: 'reviews_feedback', localCol: 'id', foreignCol: 'customer_id' },
    reservations: { type: 'many', target: 'reservations', localCol: 'id', foreignCol: 'customer_id' },
    fraud_alerts: { type: 'many', target: 'fraud_alerts', localCol: 'id', foreignCol: 'customer_id' },
  },
  wallet_passes: {
    customers: { type: 'one', target: 'customers', localCol: 'customer_id', foreignCol: 'id' },
    merchants: { type: 'one', target: 'merchants', localCol: 'merchant_id', foreignCol: 'id' },
    apple_device_registrations: {
      type: 'many',
      target: 'apple_device_registrations',
      localCol: 'pass_serial_number',
      foreignCol: 'serial_number',
    },
    transactions: { type: 'many', target: 'transactions', localCol: 'id', foreignCol: 'pass_id' },
    redemptions: { type: 'many', target: 'redemptions', localCol: 'id', foreignCol: 'pass_id' },
  },
  apple_device_registrations: {
    wallet_passes: {
      type: 'one',
      target: 'wallet_passes',
      localCol: 'serial_number',
      foreignCol: 'pass_serial_number',
    },
  },
  transactions: {
    merchants: { type: 'one', target: 'merchants', localCol: 'merchant_id', foreignCol: 'id' },
    locations: { type: 'one', target: 'locations', localCol: 'location_id', foreignCol: 'id' },
    employees: { type: 'one', target: 'employees', localCol: 'employee_id', foreignCol: 'id' },
    customers: { type: 'one', target: 'customers', localCol: 'customer_id', foreignCol: 'id' },
    wallet_passes: { type: 'one', target: 'wallet_passes', localCol: 'pass_id', foreignCol: 'id' },
  },
  redemptions: {
    merchants: { type: 'one', target: 'merchants', localCol: 'merchant_id', foreignCol: 'id' },
    customers: { type: 'one', target: 'customers', localCol: 'customer_id', foreignCol: 'id' },
    employees: { type: 'one', target: 'employees', localCol: 'employee_id', foreignCol: 'id' },
    wallet_passes: { type: 'one', target: 'wallet_passes', localCol: 'pass_id', foreignCol: 'id' },
  },
  reviews_feedback: {
    merchants: { type: 'one', target: 'merchants', localCol: 'merchant_id', foreignCol: 'id' },
    customers: { type: 'one', target: 'customers', localCol: 'customer_id', foreignCol: 'id' },
    transactions: { type: 'one', target: 'transactions', localCol: 'transaction_id', foreignCol: 'id' },
  },
  reservations: {
    merchants: { type: 'one', target: 'merchants', localCol: 'merchant_id', foreignCol: 'id' },
    customers: { type: 'one', target: 'customers', localCol: 'customer_id', foreignCol: 'id' },
    locations: { type: 'one', target: 'locations', localCol: 'location_id', foreignCol: 'id' },
  },
  fraud_alerts: {
    merchants: { type: 'one', target: 'merchants', localCol: 'merchant_id', foreignCol: 'id' },
    employees: { type: 'one', target: 'employees', localCol: 'employee_id', foreignCol: 'id' },
    customers: { type: 'one', target: 'customers', localCol: 'customer_id', foreignCol: 'id' },
  },
};

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function splitTopLevel(str, delimiter = ',') {
  const out = [];
  let depth = 0;
  let inQuotes = false;
  let current = '';
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (ch === '"' && str[i - 1] !== '\\') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (!inQuotes) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === delimiter && depth === 0) {
        if (current.trim() !== '') out.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim() !== '') out.push(current.trim());
  return out;
}

function unquoteVal(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  return trimmed;
}

function coerceValue(rowVal, rawStr) {
  const str = unquoteVal(rawStr);
  if (typeof rowVal === 'boolean') {
    if (str === 'true') return true;
    if (str === 'false') return false;
  }
  if (typeof rowVal === 'number') {
    const num = Number(str);
    if (!Number.isNaN(num) && str !== '') return num;
  }
  if (rowVal === null || rowVal === undefined) {
    if (str === 'null') return null;
    if (str === 'true') return true;
    if (str === 'false') return false;
  }
  return str;
}

function compareValues(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const isoRegex = /^\d{4}-\d{2}-\d{2}(T|\s)/;
  if (typeof a === 'string' && typeof b === 'string' && isoRegex.test(a) && isoRegex.test(b)) {
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
  }
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function matchLike(value, pattern, caseInsensitive) {
  if (value === null || value === undefined) return false;
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/\*/g, '.*')
    .replace(/_/g, '.');
  const flags = caseInsensitive ? 'is' : 's';
  return new RegExp(`^${escaped}$`, flags).test(String(value));
}

function parseInList(raw) {
  const inner = raw.startsWith('(') && raw.endsWith(')') ? raw.slice(1, -1) : raw;
  if (!inner.trim()) return [];
  return splitTopLevel(inner, ',').map(unquoteVal);
}

function evaluateOperator(rowVal, op, operandRaw) {
  if (op === 'is') {
    const t = operandRaw.trim().toLowerCase();
    if (t === 'null') return rowVal === null || rowVal === undefined;
    if (t === 'true') return rowVal === true;
    if (t === 'false') return rowVal === false;
    return false;
  }
  if (op === 'in') {
    const list = parseInList(operandRaw);
    return list.some((item) => {
      const coerced = coerceValue(rowVal, item);
      return rowVal === coerced || String(rowVal) === String(coerced);
    });
  }
  if (op === 'like') return matchLike(rowVal, unquoteVal(operandRaw), false);
  if (op === 'ilike') return matchLike(rowVal, unquoteVal(operandRaw), true);

  if (rowVal === null || rowVal === undefined) {
    if (op === 'neq') return operandRaw !== 'null';
    return false;
  }

  const target = coerceValue(rowVal, operandRaw);
  const cmp = compareValues(rowVal, target);
  switch (op) {
    case 'eq':
      return cmp === 0;
    case 'neq':
      return cmp !== 0;
    case 'gt':
      return cmp > 0;
    case 'gte':
      return cmp >= 0;
    case 'lt':
      return cmp < 0;
    case 'lte':
      return cmp <= 0;
    default:
      return false;
  }
}

function evaluateConditionExpr(row, expr) {
  const trimmed = expr.trim();
  if (trimmed.startsWith('and(') && trimmed.endsWith(')')) {
    const parts = splitTopLevel(trimmed.slice(4, -1), ',');
    return parts.every((p) => evaluateConditionExpr(row, p));
  }
  if (trimmed.startsWith('or(') && trimmed.endsWith(')')) {
    const parts = splitTopLevel(trimmed.slice(3, -1), ',');
    return parts.some((p) => evaluateConditionExpr(row, p));
  }

  const firstDot = trimmed.indexOf('.');
  if (firstDot === -1) return false;
  const col = trimmed.slice(0, firstDot);
  const rest = trimmed.slice(firstDot + 1);
  return evaluateFilterValue(row[col], rest);
}

function evaluateFilterValue(rowVal, expr) {
  if (expr.startsWith('not.')) {
    return !evaluateFilterValue(rowVal, expr.slice(4));
  }
  const dotIdx = expr.indexOf('.');
  if (dotIdx === -1) return false;
  const op = expr.slice(0, dotIdx);
  const operand = expr.slice(dotIdx + 1);
  return evaluateOperator(rowVal, op, operand);
}

function applyDefaults(table, row) {
  const now = new Date().toISOString();
  const base = { ...row };
  if (!base.id) base.id = crypto.randomUUID();
  if (table !== 'redemptions' && !base.created_at) base.created_at = now;
  if (['merchants', 'customers', 'wallet_passes', 'reservations'].includes(table) && !base.updated_at) {
    base.updated_at = now;
  }
  if (table === 'merchants') {
    if (base.is_active === undefined) base.is_active = true;
    if (base.stamps_needed === undefined) base.stamps_needed = 10;
    if (base.cooldown_hours === undefined) base.cooldown_hours = 3;
    if (base.scanner_geofence_meters === undefined) base.scanner_geofence_meters = 150;
  }
  if (table === 'locations' && base.is_active === undefined) base.is_active = true;
  if (table === 'employees' && base.is_active === undefined) base.is_active = true;
  if (table === 'customers') {
    if (!base.rfm_segment) base.rfm_segment = 'new';
    if (!base.terms_accepted_at) base.terms_accepted_at = now;
  }
  if (table === 'wallet_passes') {
    if (base.current_stamps === undefined) base.current_stamps = 0;
    if (base.total_visits === undefined) base.total_visits = 0;
    if (base.total_rewards_redeemed === undefined) base.total_rewards_redeemed = 0;
    if (!base.status) base.status = 'active';
    if (!base.authentication_token && base.pass_serial_number) {
      base.authentication_token = `${E2E_ENV_DEFAULTS.APPLE_WEB_SERVICE_SECRET}_${base.pass_serial_number}`;
    }
  }
  if (table === 'redemptions' && !base.redeemed_at) base.redeemed_at = now;
  if (table === 'reviews_feedback') {
    if (base.is_public_redirect === undefined) base.is_public_redirect = false;
    if (base.manager_contacted === undefined) base.manager_contacted = false;
  }
  if (table === 'reservations') {
    if (base.guests_count === undefined) base.guests_count = 2;
    if (!base.status) base.status = 'confirmed';
  }
  if (table === 'fraud_alerts') {
    if (!base.severity) base.severity = 'medium';
    if (!base.details) base.details = {};
    if (base.is_resolved === undefined) base.is_resolved = false;
  }
  return base;
}

function parseSelectSpec(selectStr) {
  const raw = (selectStr || '*').trim();
  const tokens = splitTopLevel(raw, ',');
  const fields = [];
  const embeds = [];
  let includeAll = false;

  for (const token of tokens) {
    if (token === '*') {
      includeAll = true;
      continue;
    }
    const parenIdx = token.indexOf('(');
    if (parenIdx !== -1 && token.endsWith(')')) {
      const head = token.slice(0, parenIdx).trim();
      const innerSelect = token.slice(parenIdx + 1, -1).trim();
      let alias = null;
      let relPart = head;
      const colonIdx = head.indexOf(':');
      if (colonIdx !== -1) {
        alias = head.slice(0, colonIdx).trim();
        relPart = head.slice(colonIdx + 1).trim();
      }
      const parts = relPart.split('!');
      const relationName = parts[0];
      const modifiers = parts.slice(1);
      const isInner = modifiers.includes('inner');
      embeds.push({
        alias: alias || relationName,
        relationName,
        isInner,
        fkHint: modifiers.find((m) => m !== 'inner' && m !== 'left') || null,
        innerSelect: innerSelect || '*',
      });
      continue;
    }

    const colonIdx = token.indexOf(':');
    if (colonIdx !== -1) {
      fields.push({ alias: token.slice(0, colonIdx).trim(), col: token.slice(colonIdx + 1).trim() });
    } else {
      fields.push({ alias: token, col: token });
    }
  }

  return { includeAll, fields, embeds };
}

function parseOrderSpec(orderStr) {
  if (!orderStr) return [];
  return orderStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const parts = item.split('.');
      const col = parts[0];
      const dir = parts[1] === 'desc' ? 'desc' : 'asc';
      const nulls = parts[2] || (dir === 'asc' ? 'nullslast' : 'nullsfirst');
      return { col, dir, nulls };
    });
}

function sortRows(rows, orderSpecs) {
  if (!orderSpecs.length) return rows;
  return [...rows].sort((a, b) => {
    for (const spec of orderSpecs) {
      const va = a[spec.col];
      const vb = b[spec.col];
      const aNull = va === null || va === undefined;
      const bNull = vb === null || vb === undefined;
      if (aNull && bNull) continue;
      if (aNull) return spec.nulls === 'nullsfirst' ? -1 : 1;
      if (bNull) return spec.nulls === 'nullsfirst' ? 1 : -1;
      const cmp = compareValues(va, vb);
      if (cmp !== 0) return spec.dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

function parsePreferHeader(req) {
  const raw = req.headers.prefer;
  const list = Array.isArray(raw) ? raw.join(',') : raw || '';
  const tokens = list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out = {
    returnRepresentation: false,
    count: null,
    resolution: null,
  };
  for (const tok of tokens) {
    if (tok === 'return=representation') out.returnRepresentation = true;
    else if (tok.startsWith('count=')) out.count = tok.slice('count='.length);
    else if (tok.startsWith('resolution=')) out.resolution = tok.slice('resolution='.length);
  }
  return out;
}

function pgrstError(res, status, code, message, details = null, hint = null) {
  const payload = JSON.stringify({ code, message, details, hint });
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function jsonResponse(res, status, body, extraHeaders = {}) {
  if (body === null || body === undefined) {
    res.writeHead(status, extraHeaders);
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Starts a local PostgREST + RPC HTTP test double compatible with @supabase/supabase-js v2.118.0.
 */
export async function startSupabaseMock(options = {}) {
  const host = options.host || '127.0.0.1';
  const port = options.port ?? 0;
  const anonKey = options.anonKey || E2E_ENV_DEFAULTS.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = options.serviceRoleKey || E2E_ENV_DEFAULTS.SUPABASE_SERVICE_ROLE_KEY;
  const stateFile = options.stateFile || null;
  const rlsMode = options.rlsMode || 'strict_42501';
  const strictAuth = options.strictAuth !== false;

  let state;
  let requestLog = [];
  let reqSeq = 0;
  let activeFault = null;

  function normalizeState(raw) {
    const out = {};
    for (const t of TABLE_NAMES) {
      out[t] = Array.isArray(raw?.[t]) ? structuredClone(raw[t]) : [];
    }
    return out;
  }

  function saveToDisk() {
    if (!stateFile) return;
    const dir = path.dirname(stateFile);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${stateFile}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, stateFile);
  }

  function reloadFromDisk() {
    if (!stateFile || !fs.existsSync(stateFile)) return;
    const loaded = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    state = normalizeState(loaded);
  }

  if (stateFile && fs.existsSync(stateFile)) {
    reloadFromDisk();
  } else {
    state = normalizeState(options.seedState || createSeedState());
    if (stateFile) saveToDisk();
  }

  function resolveRole(req) {
    const authHeader = String(req.headers.authorization || '');
    const apiKey = String(req.headers.apikey || '');
    const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    const token = bearer || apiKey;
    if (!token) return strictAuth ? null : 'anon';
    if (token === serviceRoleKey) return 'service_role';
    if (token === anonKey) return 'anon';
    return strictAuth ? null : 'anon';
  }

  function validateConstraintsForRow(table, candidate, ignoreId = null) {
    const uniques = UNIQUE_CONSTRAINTS[table] || [];
    for (const cols of uniques) {
      const hasAll = cols.every((c) => candidate[c] !== undefined && candidate[c] !== null);
      if (!hasAll) continue;
      const conflict = state[table].find(
        (r) => r.id !== ignoreId && cols.every((c) => r[c] === candidate[c])
      );
      if (conflict) {
        return {
          code: '23505',
          message: `duplicate key value violates unique constraint "${table}_${cols.join('_')}_key"`,
          details: `Key (${cols.join(', ')})=(${cols.map((c) => candidate[c]).join(', ')}) already exists.`,
          hint: null,
        };
      }
    }

    const fks = FOREIGN_KEYS[table] || [];
    for (const fk of fks) {
      const val = candidate[fk.col];
      if ((val === null || val === undefined) && fk.nullable) continue;
      const exists = state[fk.refTable].some((r) => r[fk.refCol] === val);
      if (!exists) {
        return {
          code: '23503',
          message: `insert or update on table "${table}" violates foreign key constraint "${table}_${fk.col}_fkey"`,
          details: `Key (${fk.col})=(${val}) is not present in table "${fk.refTable}".`,
          hint: null,
        };
      }
    }
    return null;
  }

  function cascadeDeleteRow(table, deletedRow) {
    if (table === 'merchants') {
      const mid = deletedRow.id;
      for (const childTable of [
        'locations',
        'employees',
        'customers',
        'wallet_passes',
        'transactions',
        'redemptions',
        'reviews_feedback',
        'reservations',
        'fraud_alerts',
      ]) {
        const toDelete = state[childTable].filter((r) => r.merchant_id === mid);
        state[childTable] = state[childTable].filter((r) => r.merchant_id !== mid);
        for (const r of toDelete) cascadeDeleteRow(childTable, r);
      }
    } else if (table === 'customers') {
      const cid = deletedRow.id;
      for (const childTable of ['wallet_passes', 'transactions', 'redemptions', 'reviews_feedback', 'reservations']) {
        const toDelete = state[childTable].filter((r) => r.customer_id === cid);
        state[childTable] = state[childTable].filter((r) => r.customer_id !== cid);
        for (const r of toDelete) cascadeDeleteRow(childTable, r);
      }
      for (const fa of state.fraud_alerts) {
        if (fa.customer_id === cid) fa.customer_id = null;
      }
    } else if (table === 'wallet_passes') {
      const pid = deletedRow.id;
      const serial = deletedRow.pass_serial_number;
      state.apple_device_registrations = state.apple_device_registrations.filter(
        (r) => r.serial_number !== serial
      );
      state.transactions = state.transactions.filter((r) => r.pass_id !== pid);
      state.redemptions = state.redemptions.filter((r) => r.pass_id !== pid);
    } else if (table === 'locations') {
      const lid = deletedRow.id;
      for (const t of ['employees', 'transactions', 'reservations']) {
        for (const r of state[t]) {
          if (r.location_id === lid) r.location_id = null;
        }
      }
    } else if (table === 'employees') {
      const eid = deletedRow.id;
      for (const fa of state.fraud_alerts) {
        if (fa.employee_id === eid) fa.employee_id = null;
      }
    } else if (table === 'transactions') {
      const tid = deletedRow.id;
      for (const rev of state.reviews_feedback) {
        if (rev.transaction_id === tid) rev.transaction_id = null;
      }
    }
  }

  function projectAndEmbedRow(table, row, selectSpec, nestedParams, role) {
    const out = {};
    if (selectSpec.includeAll) {
      Object.assign(out, structuredClone(row));
    } else {
      for (const f of selectSpec.fields) {
        out[f.alias] = row[f.col] !== undefined ? structuredClone(row[f.col]) : null;
      }
    }

    for (const embed of selectSpec.embeds) {
      const relMap = RELATIONS[table] || {};
      const rel = relMap[embed.relationName];
      if (!rel) {
        throw {
          code: 'PGRST200',
          message: `Could not find a relationship between '${table}' and '${embed.relationName}' in the schema cache`,
          details: null,
          hint: null,
        };
      }

      const localCol =
        embed.fkHint && embed.fkHint.includes('authorized_by_manager_id')
          ? 'authorized_by_manager_id'
          : rel.localCol;

      let childRows = state[rel.target].filter((cr) => cr[rel.foreignCol] === row[localCol]);
      if (role === 'anon' && PUBLIC_ANON_READ_TABLES.has(rel.target)) {
        childRows = childRows.filter((cr) => cr.is_active === true);
      }

      // Apply nested filters/order/limit for referenced table
      const nFilters = nestedParams.filters[embed.relationName] || nestedParams.filters[embed.alias] || [];
      for (const nf of nFilters) {
        childRows = childRows.filter((cr) => evaluateFilterValue(cr[nf.col], nf.expr));
      }
      const nOrs = nestedParams.ors[embed.relationName] || nestedParams.ors[embed.alias] || [];
      for (const orExpr of nOrs) {
        const inner = orExpr.startsWith('(') && orExpr.endsWith(')') ? orExpr.slice(1, -1) : orExpr;
        const branches = splitTopLevel(inner, ',');
        childRows = childRows.filter((cr) => branches.some((b) => evaluateConditionExpr(cr, b)));
      }
      const nOrder = nestedParams.orders[embed.relationName] || nestedParams.orders[embed.alias];
      if (nOrder) childRows = sortRows(childRows, parseOrderSpec(nOrder));
      const nLimit = nestedParams.limits[embed.relationName] ?? nestedParams.limits[embed.alias];
      if (nLimit !== undefined) childRows = childRows.slice(0, nLimit);

      if (embed.innerSelect === 'count') {
        if (embed.isInner && childRows.length === 0) return null;
        out[embed.alias] = [{ count: childRows.length }];
        continue;
      }

      const childSpec = parseSelectSpec(embed.innerSelect);
      if (rel.type === 'one') {
        if (childRows.length === 0) {
          if (embed.isInner) return null;
          out[embed.alias] = null;
        } else {
          const projected = projectAndEmbedRow(rel.target, childRows[0], childSpec, { filters: {}, ors: {}, orders: {}, limits: {} }, role);
          if (projected === null && embed.isInner) return null;
          out[embed.alias] = projected;
        }
      } else {
        const projectedList = childRows
          .map((cr) => projectAndEmbedRow(rel.target, cr, childSpec, { filters: {}, ors: {}, orders: {}, limits: {} }, role))
          .filter((x) => x !== null);
        if (embed.isInner && projectedList.length === 0) return null;
        out[embed.alias] = projectedList;
      }
    }

    return out;
  }

  function parseQueryFilters(table, searchParams) {
    const directFilters = [];
    const relationDotFilters = [];
    const orFilters = [];
    const nestedParams = { filters: {}, ors: {}, orders: {}, limits: {} };
    let select = '*';
    let order = '';
    let limit = null;
    let offset = 0;
    let onConflict = null;

    for (const [key, value] of searchParams.entries()) {
      if (key === 'select') {
        select = value;
      } else if (key === 'order') {
        order = value;
      } else if (key === 'limit') {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isNaN(parsed)) limit = parsed;
      } else if (key === 'offset') {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isNaN(parsed)) offset = Math.max(0, parsed);
      } else if (key === 'on_conflict') {
        onConflict = value;
      } else if (key === 'or') {
        orFilters.push(value);
      } else if (key.includes('.')) {
        const [rel, subKey] = key.split('.', 2);
        if (subKey === 'order') nestedParams.orders[rel] = value;
        else if (subKey === 'limit') {
          const parsed = Number.parseInt(value, 10);
          if (!Number.isNaN(parsed)) nestedParams.limits[rel] = parsed;
        } else if (subKey === 'or') {
          nestedParams.ors[rel] = nestedParams.ors[rel] || [];
          nestedParams.ors[rel].push(value);
        } else {
          nestedParams.filters[rel] = nestedParams.filters[rel] || [];
          nestedParams.filters[rel].push({ col: subKey, expr: value });
          relationDotFilters.push({ rel, col: subKey, expr: value });
        }
      } else {
        directFilters.push({ col: key, expr: value });
      }
    }

    return {
      select,
      order,
      limit,
      offset,
      onConflict,
      directFilters,
      relationDotFilters,
      orFilters,
      nestedParams,
    };
  }

  function filterTableRows(table, rows, parsed, role) {
    let result = [...rows];
    if (role === 'anon' && PUBLIC_ANON_READ_TABLES.has(table)) {
      result = result.filter((r) => r.is_active === true);
    }
    for (const f of parsed.directFilters) {
      result = result.filter((r) => evaluateFilterValue(r[f.col], f.expr));
    }
    for (const orExpr of parsed.orFilters) {
      const inner = orExpr.startsWith('(') && orExpr.endsWith(')') ? orExpr.slice(1, -1) : orExpr;
      const branches = splitTopLevel(inner, ',');
      result = result.filter((r) => branches.some((b) => evaluateConditionExpr(r, b)));
    }
    if (parsed.relationDotFilters.length > 0) {
      const relMap = RELATIONS[table] || {};
      for (const rf of parsed.relationDotFilters) {
        const rel = relMap[rf.rel];
        if (!rel) continue;
        result = result.filter((parentRow) => {
          const matches = state[rel.target].filter(
            (cr) => cr[rel.foreignCol] === parentRow[rel.localCol]
          );
          return matches.some((cr) => evaluateFilterValue(cr[rf.col], rf.expr));
        });
      }
    }
    return result;
  }

  function executeRpc(fnName, args) {
    if (fnName === 'process_pos_scan') {
      const {
        p_merchant_id,
        p_employee_id,
        p_pass_serial_number,
        p_ticket_number,
        p_amount = 0,
        p_scanner_lat = null,
        p_scanner_lng = null,
        p_stamps_to_award = 1,
      } = args || {};

      const merchant = state.merchants.find((m) => m.id === p_merchant_id && m.is_active === true);
      if (!merchant) {
        return { error: { code: 'P0001', message: 'MERCHANT_INACTIVE_OR_NOT_FOUND', details: null, hint: null } };
      }

      const pass = state.wallet_passes.find(
        (p) => p.pass_serial_number === p_pass_serial_number && p.merchant_id === p_merchant_id
      );
      if (!pass) {
        return { error: { code: 'P0001', message: 'PASS_NOT_FOUND', details: null, hint: null } };
      }
      if (pass.status !== 'active') {
        return { error: { code: 'P0001', message: 'PASS_SUSPENDED_OR_REVOKED', details: null, hint: null } };
      }

      const customer = state.customers.find((c) => c.id === pass.customer_id);
      if (!customer) {
        return { error: { code: 'P0001', message: 'CUSTOMER_NOT_FOUND', details: null, hint: null } };
      }

      // 1. Cooldown check
      const cooldownHours = Number(merchant.cooldown_hours ?? 3);
      const cooldownMs = cooldownHours * 60 * 60 * 1000;
      const customerTxs = state.transactions
        .filter((t) => t.customer_id === customer.id && t.merchant_id === p_merchant_id)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      const lastTx = customerTxs[0];
      if (lastTx && Date.now() - Date.parse(lastTx.created_at) < cooldownMs) {
        state.fraud_alerts.push(
          applyDefaults('fraud_alerts', {
            merchant_id: p_merchant_id,
            employee_id: p_employee_id || null,
            customer_id: customer.id,
            alert_type: 'cooldown_violation',
            severity: 'medium',
            details: {
              ticket_number: p_ticket_number,
              last_tx_time: lastTx.created_at,
              attempt_time: new Date().toISOString(),
              required_cooldown_hours: cooldownHours,
            },
          })
        );
        saveToDisk();
        return {
          error: {
            code: 'P0001',
            message: `COOLDOWN_ACTIVE: Espera ${cooldownHours} horas entre visitas`,
            details: null,
            hint: null,
          },
        };
      }

      // 2. Ticket deduplication check
      const dupTicket = state.transactions.find(
        (t) => t.merchant_id === p_merchant_id && t.ticket_number === p_ticket_number
      );
      if (dupTicket) {
        state.fraud_alerts.push(
          applyDefaults('fraud_alerts', {
            merchant_id: p_merchant_id,
            employee_id: p_employee_id || null,
            customer_id: customer.id,
            alert_type: 'ticket_reused',
            severity: 'high',
            details: {
              ticket_number: p_ticket_number,
              attempted_by_employee: p_employee_id || null,
            },
          })
        );
        saveToDisk();
        return {
          error: {
            code: 'P0001',
            message: `TICKET_ALREADY_USED: El ticket ${p_ticket_number} ya fue canjeado previamente`,
            details: null,
            hint: null,
          },
        };
      }

      // 3. Geofence check
      let nearestLoc = null;
      if (p_scanner_lat !== null && p_scanner_lat !== undefined && p_scanner_lng !== null && p_scanner_lng !== undefined) {
        const activeLocs = state.locations.filter((l) => l.merchant_id === p_merchant_id && l.is_active === true);
        let bestDist = Infinity;
        for (const loc of activeLocs) {
          const d = haversineMeters(Number(p_scanner_lat), Number(p_scanner_lng), loc.latitude, loc.longitude);
          if (d < bestDist) {
            bestDist = d;
            nearestLoc = loc;
          }
        }
        const allowedMeters = Number(merchant.scanner_geofence_meters ?? 150);
        if (nearestLoc && bestDist > allowedMeters) {
          state.fraud_alerts.push(
            applyDefaults('fraud_alerts', {
              merchant_id: p_merchant_id,
              employee_id: p_employee_id || null,
              customer_id: customer.id,
              alert_type: 'geofence_breach',
              severity: 'high',
              details: {
                distance_meters: bestDist,
                allowed_meters: allowedMeters,
                scanner_lat: Number(p_scanner_lat),
                scanner_lng: Number(p_scanner_lng),
              },
            })
          );
          saveToDisk();
          return {
            error: {
              code: 'P0001',
              message: `GEOFENCE_BREACH: El escáner está a ${Math.round(bestDist)}m del local (límite ${allowedMeters}m)`,
              details: null,
              hint: null,
            },
          };
        }
      }

      const stampsAwarded = Math.max(1, Number(p_stamps_to_award || 1));
      const newStamps = pass.current_stamps + stampsAwarded;
      const newVisits = pass.total_visits + 1;
      const rewardReady = newStamps >= merchant.stamps_needed;
      const nowIso = new Date().toISOString();

      const txRow = applyDefaults('transactions', {
        merchant_id: p_merchant_id,
        location_id: nearestLoc ? nearestLoc.id : null,
        employee_id: p_employee_id,
        customer_id: customer.id,
        pass_id: pass.id,
        ticket_number: p_ticket_number,
        amount: Number(p_amount || 0),
        stamps_awarded: stampsAwarded,
        balance_after: newStamps,
        client_latitude: p_scanner_lat ?? null,
        client_longitude: p_scanner_lng ?? null,
        created_at: nowIso,
      });
      state.transactions.push(txRow);

      for (const wp of state.wallet_passes) {
        if (wp.customer_id === customer.id && wp.merchant_id === p_merchant_id) {
          wp.current_stamps = newStamps;
          wp.total_visits = newVisits;
          wp.last_visit_at = nowIso;
          wp.updated_at = nowIso;
        }
      }
      saveToDisk();

      return {
        data: {
          success: true,
          transaction_id: txRow.id,
          customer_name: customer.full_name,
          stamps_current: newStamps,
          stamps_needed: merchant.stamps_needed,
          reward_ready: rewardReady,
          reward_description: merchant.reward_description,
          ticket_number: p_ticket_number,
        },
      };
    }

    if (fnName === 'redeem_reward') {
      const {
        p_merchant_id,
        p_pass_serial_number,
        p_employee_id,
        p_manager_id,
        p_stamps_to_deduct,
        p_reward_name,
      } = args || {};
      const actorId = p_employee_id || p_manager_id;

      const merchant = state.merchants.find((m) => m.id === p_merchant_id && m.is_active === true);
      if (!merchant) {
        return { error: { code: 'P0001', message: 'MERCHANT_INACTIVE_OR_NOT_FOUND', details: null, hint: null } };
      }

      const manager = state.employees.find(
        (e) =>
          e.id === actorId &&
          e.merchant_id === p_merchant_id &&
          e.is_active === true &&
          (e.role === 'manager' || e.role === 'admin')
      );
      if (!manager) {
        return { error: { code: 'P0001', message: 'UNAUTHORIZED_MANAGER', details: null, hint: null } };
      }

      const pass = state.wallet_passes.find(
        (p) => p.pass_serial_number === p_pass_serial_number && p.merchant_id === p_merchant_id
      );
      if (!pass) {
        return { error: { code: 'P0001', message: 'PASS_NOT_FOUND', details: null, hint: null } };
      }
      if (pass.status !== 'active') {
        return { error: { code: 'P0001', message: 'PASS_SUSPENDED_OR_REVOKED', details: null, hint: null } };
      }

      const stampsToDeduct = Number(p_stamps_to_deduct ?? merchant.stamps_needed);
      if (!Number.isFinite(stampsToDeduct) || stampsToDeduct <= 0 || pass.current_stamps < stampsToDeduct) {
        return { error: { code: 'P0001', message: 'INSUFFICIENT_STAMPS', details: null, hint: null } };
      }

      const customer = state.customers.find((c) => c.id === pass.customer_id);
      const stampsRemaining = pass.current_stamps - stampsToDeduct;
      const newTotalRedeemed = (pass.total_rewards_redeemed || 0) + 1;
      const rewardName = p_reward_name || merchant.reward_description;
      const nowIso = new Date().toISOString();

      for (const wp of state.wallet_passes) {
        if (wp.customer_id === pass.customer_id && wp.merchant_id === p_merchant_id) {
          wp.current_stamps = stampsRemaining;
          wp.total_rewards_redeemed = newTotalRedeemed;
          wp.updated_at = nowIso;
        }
      }

      const redemptionRow = applyDefaults('redemptions', {
        merchant_id: p_merchant_id,
        customer_id: pass.customer_id,
        employee_id: manager.id,
        pass_id: pass.id,
        stamps_deducted: stampsToDeduct,
        reward_name: rewardName,
        authorized_by_manager_id: manager.id,
        redeemed_at: nowIso,
      });
      state.redemptions.push(redemptionRow);
      saveToDisk();

      return {
        data: {
          success: true,
          redemption_id: redemptionRow.id,
          customer_name: customer ? customer.full_name : '',
          reward_name: rewardName,
          stamps_remaining: stampsRemaining,
          total_rewards_redeemed: newTotalRedeemed,
        },
      };
    }

    return null;
  }

  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', `http://${host}`);
    const pathname = urlObj.pathname;
    const method = (req.method || 'GET').toUpperCase();

    // Optional internal admin routes for cross-process test runner control
    if (pathname.startsWith('/__admin/')) {
      const body = method === 'POST' || method === 'PUT' ? await readJsonBody(req).catch(() => null) : null;
      if (pathname === '/__admin/requests' && method === 'GET') {
        jsonResponse(res, 200, requestLog);
        return;
      }
      if (pathname === '/__admin/requests/clear' && method === 'POST') {
        requestLog = [];
        jsonResponse(res, 200, { cleared: true });
        return;
      }
      if (pathname === '/__admin/reset' && method === 'POST') {
        state = normalizeState(body?.seedState || createSeedState());
        saveToDisk();
        jsonResponse(res, 200, { reset: true });
        return;
      }
      if (pathname === '/__admin/snapshot' && method === 'GET') {
        jsonResponse(res, 200, structuredClone(state));
        return;
      }
      if (pathname === '/__admin/restore' && method === 'POST') {
        state = normalizeState(body);
        saveToDisk();
        jsonResponse(res, 200, { restored: true });
        return;
      }
      if (pathname.startsWith('/__admin/table/') && method === 'GET') {
        const t = pathname.slice('/__admin/table/'.length);
        jsonResponse(res, 200, structuredClone(state[t] || []));
        return;
      }
      jsonResponse(res, 404, { error: 'Unknown admin endpoint' });
      return;
    }

    const role = resolveRole(req);
    const parsedBody = method === 'POST' || method === 'PATCH' || method === 'PUT'
      ? await readJsonBody(req).catch(() => '__INVALID_JSON__')
      : null;

    if (parsedBody === '__INVALID_JSON__') {
      pgrstError(res, 400, 'PGRST102', 'Empty or invalid json');
      return;
    }

    const logEntry = {
      id: ++reqSeq,
      timestamp: new Date().toISOString(),
      method,
      path: pathname,
      query: urlObj.search,
      role: role || 'unauthenticated',
      tableOrRpc: pathname.replace(/^\/rest\/v1\/(rpc\/)?/, ''),
      headers: { ...req.headers },
      body: parsedBody,
      status: 200,
    };

    const recordAndSendError = (status, code, message, details = null, hint = null) => {
      logEntry.status = status;
      requestLog.push(logEntry);
      pgrstError(res, status, code, message, details, hint);
    };

    if (!role) {
      recordAndSendError(401, 'PGRST301', 'Invalid authentication credentials');
      return;
    }

    if (activeFault && (!activeFault.match || activeFault.match({ method, path: pathname, query: urlObj.search, role, headers: req.headers, body: parsedBody }))) {
      const fault = activeFault;
      if (fault.once) activeFault = null;
      const err = fault.error || { code: 'PGRST000', message: 'Injected fault' };
      recordAndSendError(fault.status || 500, err.code, err.message, err.details ?? null, err.hint ?? null);
      return;
    }

    // RPC routes
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fnName = pathname.slice('/rest/v1/rpc/'.length);
      if (role === 'anon') {
        recordAndSendError(403, '42501', `permission denied for function ${fnName}`);
        return;
      }
      const args = method === 'GET' ? Object.fromEntries(urlObj.searchParams.entries()) : parsedBody;
      const result = executeRpc(fnName, args);
      if (!result) {
        recordAndSendError(404, 'PGRST202', `Could not find the function public.${fnName} in the schema cache`);
        return;
      }
      if (result.error) {
        recordAndSendError(400, result.error.code, result.error.message, result.error.details, result.error.hint);
        return;
      }
      logEntry.status = 200;
      requestLog.push(logEntry);
      jsonResponse(res, 200, result.data);
      return;
    }

    // Table routes
    if (!pathname.startsWith('/rest/v1/')) {
      recordAndSendError(404, 'PGRST205', `Unknown route ${pathname}`);
      return;
    }

    const table = pathname.slice('/rest/v1/'.length).replace(/\/+$/, '');
    if (!TABLE_NAMES.includes(table)) {
      recordAndSendError(404, 'PGRST205', `Could not find the table 'public.${table}' in the schema cache`);
      return;
    }

    const prefer = parsePreferHeader(req);
    const accept = String(req.headers.accept || '');
    const wantsSingleObject = accept.includes('application/vnd.pgrst.object+json');
    const parsedQuery = parseQueryFilters(table, urlObj.searchParams);

    // RLS enforcement for anon
    if (role === 'anon') {
      const isRead = method === 'GET' || method === 'HEAD';
      if (!isRead) {
        recordAndSendError(403, '42501', `new row violates row-level security policy for table "${table}"`);
        return;
      }
      if (!PUBLIC_ANON_READ_TABLES.has(table) && rlsMode === 'strict_42501') {
        recordAndSendError(403, '42501', `permission denied for table ${table}`);
        return;
      }
    }

    if (method === 'GET' || method === 'HEAD') {
      let matched =
        role === 'anon' && !PUBLIC_ANON_READ_TABLES.has(table)
          ? []
          : filterTableRows(table, state[table], parsedQuery, role);

      const selectSpec = parseSelectSpec(parsedQuery.select);
      let projected = [];
      try {
        for (const r of matched) {
          const item = projectAndEmbedRow(table, r, selectSpec, parsedQuery.nestedParams, role);
          if (item !== null) projected.push(item);
        }
      } catch (relErr) {
        recordAndSendError(400, relErr.code || 'PGRST200', relErr.message || 'Relationship error');
        return;
      }

      if (parsedQuery.order) {
        projected = sortRows(projected, parseOrderSpec(parsedQuery.order));
      }

      const totalCount = projected.length;
      const sliced =
        parsedQuery.limit !== null
          ? projected.slice(parsedQuery.offset, parsedQuery.offset + parsedQuery.limit)
          : parsedQuery.offset > 0
            ? projected.slice(parsedQuery.offset)
            : projected;

      const headers = {};
      if (prefer.count) {
        headers['content-range'] =
          sliced.length > 0
            ? `${parsedQuery.offset}-${parsedQuery.offset + sliced.length - 1}/${totalCount}`
            : `*/${totalCount}`;
      }

      if (wantsSingleObject) {
        if (sliced.length === 0) {
          recordAndSendError(
            406,
            'PGRST116',
            'JSON object requested, multiple (or no) rows returned',
            'The result contains 0 rows'
          );
          return;
        }
        if (sliced.length > 1) {
          recordAndSendError(
            406,
            'PGRST116',
            'JSON object requested, multiple (or no) rows returned',
            `Results contain ${sliced.length} rows, application/vnd.pgrst.object+json requires 1 row`
          );
          return;
        }
        logEntry.status = 200;
        requestLog.push(logEntry);
        jsonResponse(res, 200, method === 'HEAD' ? null : sliced[0], headers);
        return;
      }

      logEntry.status = 200;
      requestLog.push(logEntry);
      jsonResponse(res, 200, method === 'HEAD' ? null : sliced, headers);
      return;
    }

    if (method === 'POST') {
      const items = Array.isArray(parsedBody) ? parsedBody : parsedBody ? [parsedBody] : [];
      const conflictCols = parsedQuery.onConflict
        ? parsedQuery.onConflict.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const isUpsert =
        prefer.resolution === 'merge-duplicates' || prefer.resolution === 'ignore-duplicates';

      const affected = [];
      const snapshotBefore = structuredClone(state[table]);

      for (const rawItem of items) {
        if (isUpsert && conflictCols.length > 0) {
          const existingIdx = state[table].findIndex((r) =>
            conflictCols.every((c) => rawItem[c] !== undefined && r[c] === rawItem[c])
          );
          if (existingIdx !== -1) {
            if (prefer.resolution === 'ignore-duplicates') {
              continue;
            }
            const existing = state[table][existingIdx];
            const merged = {
              ...existing,
              ...rawItem,
              id: existing.id,
              created_at: existing.created_at,
            };
            if ('updated_at' in existing || rawItem.updated_at !== undefined) {
              merged.updated_at = rawItem.updated_at || new Date().toISOString();
            }
            const err = validateConstraintsForRow(table, merged, existing.id);
            if (err) {
              state[table] = snapshotBefore;
              recordAndSendError(409, err.code, err.message, err.details, err.hint);
              return;
            }
            state[table][existingIdx] = merged;
            affected.push(merged);
            continue;
          }
        }

        const newRow = applyDefaults(table, rawItem);
        const err = validateConstraintsForRow(table, newRow, null);
        if (err) {
          state[table] = snapshotBefore;
          recordAndSendError(409, err.code, err.message, err.details, err.hint);
          return;
        }
        state[table].push(newRow);
        affected.push(newRow);
      }

      saveToDisk();

      const headers = {};
      if (prefer.count) {
        headers['content-range'] = `0-${Math.max(0, affected.length - 1)}/${affected.length}`;
      }

      if (!prefer.returnRepresentation) {
        logEntry.status = 201;
        requestLog.push(logEntry);
        jsonResponse(res, 201, null, headers);
        return;
      }

      const selectSpec = parseSelectSpec(parsedQuery.select);
      const projected = affected.map((r) =>
        projectAndEmbedRow(table, r, selectSpec, parsedQuery.nestedParams, role)
      );

      if (wantsSingleObject) {
        if (projected.length !== 1) {
          recordAndSendError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
          return;
        }
        logEntry.status = 201;
        requestLog.push(logEntry);
        jsonResponse(res, 201, projected[0], headers);
        return;
      }

      logEntry.status = 201;
      requestLog.push(logEntry);
      jsonResponse(res, 201, projected, headers);
      return;
    }

    if (method === 'PATCH') {
      const matched = filterTableRows(table, state[table], parsedQuery, role);
      const snapshotBefore = structuredClone(state[table]);
      const updated = [];
      const nowIso = new Date().toISOString();

      for (const row of matched) {
        const candidate = { ...row, ...(parsedBody || {}) };
        if ('updated_at' in row && (!parsedBody || parsedBody.updated_at === undefined)) {
          candidate.updated_at = nowIso;
        }
        const err = validateConstraintsForRow(table, candidate, row.id);
        if (err) {
          state[table] = snapshotBefore;
          recordAndSendError(409, err.code, err.message, err.details, err.hint);
          return;
        }
        Object.assign(row, candidate);
        updated.push(row);
      }

      saveToDisk();

      const headers = {};
      if (prefer.count) {
        headers['content-range'] =
          updated.length > 0 ? `0-${updated.length - 1}/${updated.length}` : '*/0';
      }

      if (!prefer.returnRepresentation) {
        logEntry.status = 204;
        requestLog.push(logEntry);
        jsonResponse(res, 204, null, headers);
        return;
      }

      const selectSpec = parseSelectSpec(parsedQuery.select);
      const projected = updated.map((r) =>
        projectAndEmbedRow(table, r, selectSpec, parsedQuery.nestedParams, role)
      );

      if (wantsSingleObject) {
        if (projected.length !== 1) {
          recordAndSendError(
            406,
            'PGRST116',
            'JSON object requested, multiple (or no) rows returned',
            `Results contain ${projected.length} rows`
          );
          return;
        }
        logEntry.status = 200;
        requestLog.push(logEntry);
        jsonResponse(res, 200, projected[0], headers);
        return;
      }

      logEntry.status = 200;
      requestLog.push(logEntry);
      jsonResponse(res, 200, projected, headers);
      return;
    }

    if (method === 'DELETE') {
      const matched = filterTableRows(table, state[table], parsedQuery, role);
      const matchedIds = new Set(matched.map((r) => r.id));
      const deletedCopy = structuredClone(matched);
      state[table] = state[table].filter((r) => !matchedIds.has(r.id));
      for (const delRow of deletedCopy) {
        cascadeDeleteRow(table, delRow);
      }
      saveToDisk();

      const headers = {};
      if (prefer.count) {
        headers['content-range'] =
          deletedCopy.length > 0 ? `0-${deletedCopy.length - 1}/${deletedCopy.length}` : '*/0';
      }

      if (!prefer.returnRepresentation) {
        logEntry.status = 204;
        requestLog.push(logEntry);
        jsonResponse(res, 204, null, headers);
        return;
      }

      const selectSpec = parseSelectSpec(parsedQuery.select);
      const projected = deletedCopy.map((r) =>
        projectAndEmbedRow(table, r, selectSpec, parsedQuery.nestedParams, role)
      );

      if (wantsSingleObject) {
        if (projected.length !== 1) {
          recordAndSendError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
          return;
        }
        logEntry.status = 200;
        requestLog.push(logEntry);
        jsonResponse(res, 200, projected[0], headers);
        return;
      }

      logEntry.status = 200;
      requestLog.push(logEntry);
      jsonResponse(res, 200, projected, headers);
      return;
    }

    recordAndSendError(405, 'PGRST105', `Method ${method} not allowed`);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  const url = `http://${host}:${actualPort}`;

  return {
    url,
    port: actualPort,
    anonKey,
    serviceRoleKey,
    snapshot() {
      return structuredClone(state);
    },
    restore(snap) {
      state = normalizeState(snap);
      saveToDisk();
    },
    reset(newSeed) {
      state = normalizeState(newSeed || createSeedState());
      saveToDisk();
    },
    saveToDisk,
    reloadFromDisk,
    getTable(tableName) {
      return structuredClone(state[tableName] || []);
    },
    findRows(tableName, predicate) {
      return structuredClone((state[tableName] || []).filter(predicate));
    },
    insertRow(tableName, row) {
      const inserted = applyDefaults(tableName, row);
      state[tableName].push(inserted);
      saveToDisk();
      return structuredClone(inserted);
    },
    updateRows(tableName, predicate, patch) {
      let count = 0;
      for (const r of state[tableName] || []) {
        if (predicate(r)) {
          Object.assign(r, patch);
          count += 1;
        }
      }
      if (count > 0) saveToDisk();
      return count;
    },
    getRequestLog() {
      return structuredClone(requestLog);
    },
    clearRequestLog() {
      requestLog = [];
    },
    setFault(rule) {
      activeFault = rule || null;
    },
    async close() {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
