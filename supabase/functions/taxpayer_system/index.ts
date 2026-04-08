// @ts-nocheck

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FUNCTION_BUILD = 'taxpayer-system-2026-04-09-11';
const DEFAULT_BASE_URL = 'https://tp.tax.gov.ir/req';

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify({ build: FUNCTION_BUILD, ...payload }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Kalam-Function-Build': FUNCTION_BUILD },
  });

const h = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const first = (value: any) => Array.isArray(value) ? value[0] : value;
const enc = (value: string) => encodeURIComponent(String(value || ''));
const fiscal = (value: string) => String(value || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
const parse = (raw: string) => { try { return raw ? JSON.parse(raw) : null; } catch { return raw || null; } };

const b64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const unb64 = (value: string) => {
  const binary = atob(String(value || ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

const hex = (bytes: Uint8Array) => Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
const sha256Hex = async (value: string) => { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || ''))); return hex(new Uint8Array(digest)); };
const requestMeta = () => ({ requestTraceId: crypto.randomUUID(), timestamp: String(Date.now()) });
const taxHeaders = (meta: { requestTraceId: string; timestamp: string }, token?: string) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    requestTraceId: meta.requestTraceId,
    timestamp: meta.timestamp,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};
const taxErrorMessage = (value: any) => {
  const payload = typeof value === 'string' ? parse(value) : value;
  const errors = Array.isArray(payload?.errors) ? payload.errors : Array.isArray(payload?.result?.errors) ? payload.result.errors : [];
  if (errors.length) {
    return errors
      .map((item: any) => `${item?.code ? `[${item.code}] ` : ''}${String(item?.message || '').trim()}`.trim())
      .filter(Boolean)
      .join(' | ');
  }
  const resultRow = Array.isArray(payload?.result) ? payload.result[0] : null;
  if (resultRow?.errorCode || resultRow?.errorMessage || resultRow?.errorDetail) {
    return [resultRow?.errorCode, resultRow?.errorMessage || resultRow?.errorDetail].filter(Boolean).join(' - ');
  }
  if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim();
  if (typeof value === 'string' && value.trim()) return value.trim();
  return payload ? JSON.stringify(payload) : 'Taxpayer system request failed.';
};
const readTaxResponse = async (response: Response) => {
  const raw = await response.text();
  const parsed = parse(raw);
  if (!response.ok) throw new Error(taxErrorMessage(parsed || raw) || `HTTP ${response.status}`);
  return parsed;
};

const secretKey = async () => {
  const secret = String(Deno.env.get('TAXPAYER_SECRET_ENCRYPTION_KEY') || '').trim();
  if (!secret) throw new Error('TAXPAYER_SECRET_ENCRYPTION_KEY is not configured.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

const encryptSecret = async (plain: string) => {
  if (!String(plain || '').trim()) return '';
  const key = await secretKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  return `v1:${b64(iv)}:${b64(cipher)}`;
};

const decryptSecret = async (encrypted: string) => {
  const [v, iv, cipher] = String(encrypted || '').split(':');
  if (v !== 'v1' || !iv || !cipher) throw new Error('Stored private key format is invalid.');
  const key = await secretKey();
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(cipher));
  return new TextDecoder().decode(plain);
};

const pemToDer = (pem: string, label: string) => {
  const raw = String(pem || '').replace(/\r/g, '').trim();
  const match = raw.match(new RegExp(`-----BEGIN ${label}-----([\\s\\S]+?)-----END ${label}-----`));
  return unb64((match?.[1] || raw).replace(/\s+/g, '')).buffer;
};

const signText = async (privateKeyPem: string, text: string) => {
  if (/BEGIN RSA PRIVATE KEY/i.test(privateKeyPem)) throw new Error('The private key must be PKCS#8. Raw/base64 or BEGIN PRIVATE KEY is accepted, BEGIN RSA PRIVATE KEY is not.');
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(privateKeyPem, 'PRIVATE KEY'), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(String(text || '')));
  return b64(new Uint8Array(sig));
};

const stable = (value: any): any => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc: any, key) => {
      const next = stable(value[key]);
      if (next !== undefined) acc[key] = next;
      return acc;
    }, {});
  }
  return value === undefined ? undefined : value;
};
const stableStringify = (value: any) => JSON.stringify(stable(value)).replace(/#/g, '\\u0023');

const d = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const p = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
const inv = [0,4,3,2,1,5,6,7,8,9];
const check = (input: string) => { let c = 0; String(input).split('').reverse().forEach((ch, i) => { c = d[c][p[(i + 1) % 8][Number(ch)]]; }); return inv[c]; };
const epochDays = (date: string) => { const [y,m,day] = String(date || '').slice(0,10).split('-').map(Number); if (!y || !m || !day) throw new Error('Invoice date is invalid.'); return Math.floor((Date.UTC(y,m-1,day)-Date.UTC(1970,0,1))/86400000); };
const taxId = (fid: string, date: string, serial: bigint) => {
  const f = fiscal(fid); if (f.length !== 6) throw new Error('Fiscal memory id must be exactly 6 characters.');
  const days = epochDays(date);
  const fInput = f.split('').map((ch) => /^\d$/.test(ch) ? ch : String(ch.charCodeAt(0))).join('');
  const input = `${fInput}${String(days).padStart(6,'0')}${String(serial).padStart(12,'0')}`;
  return `${f}${days.toString(16).toUpperCase().padStart(5,'0')}${serial.toString(16).toUpperCase().padStart(10,'0')}${check(input)}`;
};

const rial = (value: any, currency: string) => {
  const n = Number(value || 0); if (!Number.isFinite(n)) return 0;
  const c = String(currency || 'IRT').toUpperCase();
  if (c === 'IRT') return Math.round(n * 10);
  if (c === 'IRR') return Math.round(n);
  throw new Error('Only IRR and IRT are supported for taxpayer-system invoices.');
};
const setm = (value: string) => value === 'cash' ? 1 : value === 'credit' ? 2 : value === 'mixed' ? 3 : (() => { throw new Error('Settlement method is required for taxpayer-system invoices.'); })();
const rowAmounts = (row: any) => { const q = Number(row?.quantity || 0), price = Number(row?.unit_price || 0), base = q * price, di = Number(row?.discount || 0), vi = Number(row?.vat || 0); const dis = String(row?.discount_type || 'amount') === 'percent' ? base * di / 100 : di; const after = Math.max(0, base - dis); const vat = String(row?.vat_type || 'percent') === 'percent' ? after * vi / 100 : vi; return { base, dis, after, vat, total: after + vat, vatRate: String(row?.vat_type || 'percent') === 'percent' ? vi : 0 }; };
const parseLegacySerial = (value: any) => { const input = String(value || '').trim().toUpperCase(); if (!input) return 0; if (/^[0-9]+$/.test(input)) return Number(input); const normalized = input.replace(/[^0-9A-Z]/g, ''); const serialHex = normalized.length === 22 ? normalized.slice(11, 21) : normalized; if (/^[0-9A-F]{1,10}$/.test(serialHex)) return Number.parseInt(serialHex, 16); throw new Error('Legacy serial must be decimal, the 10-digit hex serial, or a full 22-character tax id.'); };

const select = async (urlBase: string, key: string, table: string, params: Record<string,string>) => { const url = new URL(`${urlBase.replace(/\/+$/,'')}/rest/v1/${table}`); Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v)); const res = await fetch(url, { headers: h(key) }); const raw = await res.text(); if (!res.ok) throw new Error(raw || `select ${table} failed`); return raw ? JSON.parse(raw) : []; };
const insert = async (urlBase: string, key: string, table: string, rows: any[]) => { const res = await fetch(`${urlBase.replace(/\/+$/,'')}/rest/v1/${table}`, { method: 'POST', headers: { ...h(key), Prefer: 'return=representation' }, body: JSON.stringify(rows) }); const raw = await res.text(); if (!res.ok) throw new Error(raw || `insert ${table} failed`); return raw ? JSON.parse(raw) : []; };
const patch = async (urlBase: string, key: string, table: string, id: string, body: any) => { const url = new URL(`${urlBase.replace(/\/+$/,'')}/rest/v1/${table}`); url.searchParams.set('id', `eq.${id}`); const res = await fetch(url, { method: 'PATCH', headers: { ...h(key), Prefer: 'return=representation' }, body: JSON.stringify(body) }); const raw = await res.text(); if (!res.ok) throw new Error(raw || `patch ${table} failed`); return raw ? JSON.parse(raw) : []; };
const rpc = async (urlBase: string, key: string, fn: string, body: any) => { const res = await fetch(`${urlBase.replace(/\/+$/,'')}/rest/v1/rpc/${fn}`, { method: 'POST', headers: h(key), body: JSON.stringify(body) }); const raw = await res.text(); if (!res.ok) throw new Error(raw || `rpc ${fn} failed`); return raw ? JSON.parse(raw) : null; };
const upsertSettings = async (urlBase: string, key: string, row: any) => { const res = await fetch(`${urlBase.replace(/\/+$/,'')}/rest/v1/taxpayer_settings?on_conflict=org_id`, { method: 'POST', headers: { ...h(key), Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify([row]) }); const raw = await res.text(); if (!res.ok) throw new Error(raw || 'Saving taxpayer settings failed.'); return first(raw ? JSON.parse(raw) : null); };

const verifyUser = async (urlBase: string, key: string, token: string) => { const res = await fetch(`${urlBase.replace(/\/+$/,'')}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } }); if (!res.ok) throw new Error('Unauthorized'); const user = await res.json(); const profile = first(await select(urlBase, key, 'profiles', { id: `eq.${user.id}`, select: 'id,org_id', limit: '1' })); return { ...user, org_id: profile?.org_id || null }; };
const settingsRow = async (urlBase: string, key: string, orgId: string) => first(await select(urlBase, key, 'taxpayer_settings', { org_id: `eq.${orgId}`, select: '*', limit: '1' })) || null;
const companyRow = async (urlBase: string, key: string, orgId: string) => first(await select(urlBase, key, 'company_settings', { org_id: `eq.${orgId}`, select: '*', order: 'updated_at.desc', limit: '1' })) || null;
const sanitized = (s: any, c: any) => ({ provider: s?.provider || 'self_tsp', fiscal_id: s?.fiscal_id || '', company_economic_code: c?.economic_code || c?.national_id || '', legacy_last_serial: Number(s?.legacy_last_serial || 0) || 0, server_information: s?.server_information || {}, is_active: s?.is_active === true, has_private_key: !!s?.private_key_encrypted, has_certificate: !!String(s?.certificate_pem || '').trim() });

const flattenSignatureEntries = (target: Record<string, any>, value: any, prefix = '') => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenSignatureEntries(target, item, prefix ? `${prefix}.E${index}` : `E${index}`));
    return;
  }
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => flattenSignatureEntries(target, value[key], prefix ? `${prefix}.${key}` : key));
    return;
  }
  if (!prefix) return;
  target[prefix] = value;
};
const normalizeSignatureValue = (value: any): string => {
  const flattened: Record<string, any> = {};
  flattenSignatureEntries(flattened, value);
  const keys = Object.keys(flattened).sort();
  if (!keys.length) return '';
  return keys.map((key) => {
    const current = flattened[key];
    let textValue: string;
    if (current !== null && current !== undefined) {
      if (current === true || current === false || current === 'False' || current === 'True') textValue = String(current).toLowerCase();
      else textValue = String(current);
      textValue = textValue === '' ? '#' : textValue.replace(/#/g, '##');
    } else {
      textValue = '#';
    }
    return `${textValue}#`;
  }).join('').slice(0, -1);
};
const normalizePacketsSignatureValue = (packets: any[], header: Record<string, any>) =>
  normalizeSignatureValue({ packets, ...header });
const xorWithSymmetricKey = (payload: Uint8Array, key: Uint8Array) => {
  const result = new Uint8Array(payload.length);
  for (let index = 0; index < payload.length; index += 1) result[index] = payload[index] ^ key[index % key.length];
  return result;
};
const importServerPublicKey = async (value: string) => {
  const keyData = /BEGIN PUBLIC KEY/i.test(value) ? pemToDer(value, 'PUBLIC KEY') : unb64(value).buffer;
  return crypto.subtle.importKey('spki', keyData, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
};
const buildPacket = (args: { packetType: string; data?: any; uid?: string | null; retry?: boolean; encryptionKeyId?: string; symmetricKey?: string; iv?: string; fiscalId?: string; dataSignature?: string; }) => ({ uid: args.uid ?? null, packetType: args.packetType, retry: args.retry === true, data: args.data ?? null, encryptionKeyId: args.encryptionKeyId || '', symmetricKey: args.symmetricKey || '', iv: args.iv || '', fiscalId: args.fiscalId || '', dataSignature: args.dataSignature || '' });
const requestSignatureInput = (meta: { requestTraceId: string; timestamp: string }, body: Record<string, any>) => ({ ...body, requestTraceId: meta.requestTraceId, timestamp: meta.timestamp });
const postTax = async (settings: any, path: string, body: any, token?: string, meta = requestMeta()) => readTaxResponse(await fetch(`${String(settings?.base_url || DEFAULT_BASE_URL).replace(/\/+$/,'')}${path}`, { method: 'POST', headers: taxHeaders(meta, token), body: JSON.stringify(body) }));
const invokeTax = async (settings: any, segment: 'sync' | 'async', command: string, body: any, token?: string) => { if (segment === 'sync' && command === 'GET_SERVER_INFORMATION') return invokeGetServerInformation(settings); return postTax(settings, '/api/self-tsp/' + segment + '/' + command, body || {}, token, requestMeta()); };
const invokeGetServerInformation = async (settings: any) => { const meta = requestMeta(); const packet = buildPacket({ packetType: 'GET_SERVER_INFORMATION' }); return postTax(settings, '/api/self-tsp/sync/GET_SERVER_INFORMATION', { time: 1, packet }, undefined, meta); };
const invokeSignedSync = async (settings: any, privateKey: string, packetType: string, data: any, token?: string, options: { uid?: string | null; retry?: boolean; encryptionKeyId?: string; symmetricKey?: string; iv?: string; fiscalId?: string; dataSignature?: string; signatureKeyId?: string; } = {}) => { const meta = requestMeta(); const signatureKeyId = String(options.signatureKeyId || settings?.signature_key_id || '').trim(); const packet = buildPacket({ packetType, data, uid: options.uid ?? null, retry: options.retry === true, encryptionKeyId: options.encryptionKeyId, symmetricKey: options.symmetricKey, iv: options.iv, fiscalId: options.fiscalId || '', dataSignature: options.dataSignature }); const requestBody = { time: 1, packet, ...(signatureKeyId ? { signatureKeyId } : {}) }; const signature = await signText(privateKey, normalizeSignatureValue(requestSignatureInput(meta, requestBody))); return postTax(settings, `/api/self-tsp/sync/${packetType}`, { ...requestBody, signature }, token, meta); };
const serverKeyInfo = (info: any) => { const keys = info?.result?.data?.publicKeys || info?.data?.publicKeys || info?.publicKeys || []; if (Array.isArray(keys) && keys.length) { const selected = keys.find((item: any) => Number(item?.purpose || 0) === 1) || keys.find((item: any) => String(item?.algorithm || '').toUpperCase().includes('RSA')) || keys[0]; return { id: String(selected?.id || selected?.keyId || '').trim(), key: String(selected?.key || selected?.publicKey || '').trim() }; } return { id: String(info?.result?.data?.encryptionKeyId || info?.encryptionKeyId || '').trim(), key: String(info?.publicKey || info?.public_key || info?.serverPublicKey || info?.data?.publicKey || info?.result?.publicKey || info?.result?.data?.publicKey || '').trim() }; };
const serverKey = (info: any) => serverKeyInfo(info).key;
const getToken = async (settings: any, privateKey: string) => { const tokenRes = await invokeSignedSync(settings, privateKey, 'GET_TOKEN', { username: settings.fiscal_id }, undefined, { fiscalId: '' }); const token = String(tokenRes?.result?.data?.token || tokenRes?.data?.token || tokenRes?.result?.token || tokenRes?.token || tokenRes?.access_token || '').trim(); if (!token) throw new Error('GET_TOKEN succeeded but no access token was returned.'); return { token }; };
const buildEncryptedInvoicePacket = async (settings: any, privateKey: string, payload: any, uid: string) => { const keyInfo = serverKeyInfo(settings.server_information || {}); if (!keyInfo.key) throw new Error('Server public key is missing in GET_SERVER_INFORMATION response.'); const canonicalData = stableStringify(payload.data); const normalizedData = JSON.parse(canonicalData); const dataSignatureInput = normalizeSignatureValue(normalizedData); const dataSignature = await signText(privateKey, dataSignatureInput); const rawKey = crypto.getRandomValues(new Uint8Array(32)); const aesKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt']); const iv = crypto.getRandomValues(new Uint8Array(16)); const plainBytes = new TextEncoder().encode(canonicalData); const xorBytes = xorWithSymmetricKey(plainBytes, rawKey); const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, aesKey, xorBytes)); const publicKey = await importServerPublicKey(keyInfo.key); const encryptedKey = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawKey)); const packet = buildPacket({ uid, packetType: payload.packetType, data: b64(cipher), encryptionKeyId: keyInfo.id, symmetricKey: b64(encryptedKey), iv: hex(iv), fiscalId: settings.fiscal_id, dataSignature }); return { packet, debug: { canonical_data_sha256: await sha256Hex(canonicalData), canonical_data_length: canonicalData.length, canonical_data_preview: canonicalData.slice(0, 500), data_signature_input_sha256: await sha256Hex(dataSignatureInput), data_signature_input_length: dataSignatureInput.length, data_signature_input_preview: dataSignatureInput.slice(0, 500), encryption_key_id: keyInfo.id, packet_uid: uid, iv_hex_length: hex(iv).length } }; };
const invokeAsyncEnqueue = async (settings: any, privateKey: string, packet: any, token: string, meta = requestMeta()) => { const signatureKeyId = String(settings?.signature_key_id || '').trim(); const packets = [{ ...packet, uid: packet?.uid || meta.requestTraceId }]; const requestBody = { packets, ...(signatureKeyId ? { signatureKeyId } : {}) }; const signatureHeader = { requestTraceId: meta.requestTraceId, timestamp: meta.timestamp, ...(signatureKeyId ? { signatureKeyId } : {}) }; const signatureInput = normalizePacketsSignatureValue(packets, signatureHeader); const signature = await signText(privateKey, signatureInput); const debug = { async_signature_input_sha256: await sha256Hex(signatureInput), async_signature_input_length: signatureInput.length, async_signature_input_preview: signatureInput.slice(0, 500), request_trace_id: meta.requestTraceId, timestamp: meta.timestamp, packet_uid: packets[0]?.uid || null, signature_key_id: signatureKeyId || null }; try { const response = await postTax(settings, '/api/self-tsp/async/normal-enqueue', { ...requestBody, signature }, token, meta); return { response, debug }; } catch (error) { if (error && typeof error === 'object') error.kalamDebug = debug; throw error; } };
const asyncResultRow = (response: any) => Array.isArray(response?.result) ? response.result[0] : Array.isArray(response?.data) ? response.data[0] : response?.result || response?.data || null;

const requireSettings = async (urlBase: string, key: string, orgId: string) => { const [s, c] = await Promise.all([settingsRow(urlBase, key, orgId), companyRow(urlBase, key, orgId)]); if (!s?.is_active) throw new Error('Taxpayer-system connection is not active.'); const seller = String(c?.economic_code || c?.national_id || '').trim(); if (!seller) throw new Error('Seller economic code is missing in company settings.'); if (!s?.private_key_encrypted) throw new Error('Private key has not been saved.'); return { settings: { ...s, fiscal_id: fiscal(s.fiscal_id), seller_economic_code: seller, base_url: s.base_url || DEFAULT_BASE_URL, legacy_last_serial: Number(s?.legacy_last_serial || 0) || 0 }, company: c, privateKey: await decryptSecret(s.private_key_encrypted) }; };

const invoiceBundle = async (urlBase: string, key: string, orgId: string, invoiceId: string) => { const invoice = first(await select(urlBase, key, 'invoices', { id: `eq.${invoiceId}`, org_id: `eq.${orgId}`, select: '*', limit: '1' })); if (!invoice?.id) throw new Error('Sales invoice was not found.'); const customer = invoice.customer_id ? first(await select(urlBase, key, 'customers', { id: `eq.${invoice.customer_id}`, select: '*', limit: '1' })) : null; const ids = Array.from(new Set((Array.isArray(invoice.invoiceItems) ? invoice.invoiceItems : []).map((x: any) => String(x?.product_id || '').trim()).filter(Boolean))); let products: Record<string,any> = {}; if (ids.length) { const rows = await select(urlBase, key, 'products', { id: `in.(${ids.map(enc).join(',')})`, select: 'id,name,product_identifier,main_unit,vat_percentage,is_vat_exempt' }); products = rows.reduce((acc: any, p: any) => ({ ...acc, [String(p.id)]: p }), {}); } return { invoice, customer, products }; };

const invoicePayload = (args: any) => { const { invoice, customer, products, company, settings, txid, serial, settlement } = args; const invDate = String(invoice.invoice_date || '').slice(0,10); const items = Array.isArray(invoice.invoiceItems) ? invoice.invoiceItems : []; if (!items.length) throw new Error('Invoice has no rows to send.'); const currency = String(company?.currency_code || 'IRT'); const settlementCode = setm(settlement); const buyerType = String(customer?.person_type || 'real') === 'legal' ? 2 : 1; const buyerId = buyerType === 2 ? String(customer?.national_id || '').trim() : String(customer?.national_code || '').trim(); if (!customer?.id || !buyerId) throw new Error('Customer identity data is incomplete.'); let tprdis=0, tdis=0, tadis=0, tvam=0, tbill=0; const body = items.map((item: any, i: number) => { const product = products[String(item?.product_id || '')] || {}; const sstid = String(item?.product_identifier || product?.product_identifier || '').trim(); if (!sstid) throw new Error(`Product/service identifier is missing for row ${i + 1}.`); const qty = Number(item?.quantity || 0); if (!(qty > 0)) throw new Error(`Quantity is invalid for row ${i + 1}.`); const a = rowAmounts(item); const base = rial(a.base,currency), dis = rial(a.dis,currency), after = rial(a.after,currency), vat = rial(a.vat,currency), total = rial(a.total,currency); tprdis += base; tdis += dis; tadis += after; tvam += vat; tbill += total; return { sstid, sstt: String(item?.description || product?.name || 'Product/Service'), mu: String(item?.main_unit || product?.main_unit || '') || undefined, am: qty, fee: rial(item?.unit_price || 0,currency), prdis: base, dis, adis: after, vra: Number(a.vatRate || 0), vam: vat, tsstam: total }; }); const received = rial(invoice.total_received_amount || 0, currency); const cap = settlementCode === 1 ? tbill : settlementCode === 2 ? 0 : Math.min(Math.max(received, 0), tbill); const insp = settlementCode === 2 ? tbill : settlementCode === 1 ? 0 : Math.max(tbill - cap, 0); return { packetType: 'INVOICE.V01', data: { header: { taxid: txid, inno: BigInt(serial).toString(16).toUpperCase().padStart(10,'0'), indatim: new Date(`${invDate}T00:00:00Z`).getTime(), inty: Number(invoice.taxpayer_invoice_type || 1), inp: Number(invoice.taxpayer_invoice_pattern || 1), ins: Number(invoice.taxpayer_invoice_subject || 1), tins: settings.seller_economic_code, tob: buyerType, bid: buyerId, tinb: String(customer?.economic_code || buyerId), bpc: String(customer?.postal_code || '') || undefined, setm: settlementCode, tprdis, tdis, tadis, tvam, tbill, cap, insp, tvop: 0 }, body, payments: [] } }; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { success: false, message: 'Method Not Allowed' });
  const urlBase = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!urlBase || !key) return json(500, { success: false, message: 'Missing Supabase environment variables' });
  try {
    const auth = req.headers.get('Authorization') || ''; if (!auth.startsWith('Bearer ')) return json(401, { success: false, message: 'Missing bearer token' });
    const user = await verifyUser(urlBase, key, auth.replace(/^Bearer\s+/i, '').trim()); const orgId = String(user.org_id || '').trim(); if (!orgId) return json(403, { success: false, message: 'User organization is missing.' });
    const body = await req.json(); const action = String(body?.action || '').trim();
    if (action === 'get_settings') { const [s,c] = await Promise.all([settingsRow(urlBase,key,orgId), companyRow(urlBase,key,orgId)]); return json(200, { success: true, settings: sanitized(s,c), company: c }); }
    if (action === 'save_settings') { const input = body?.settings || {}; const current = await settingsRow(urlBase,key,orgId); const privateKey = String(input.private_key || '').trim(); const certificatePem = String(input.certificate_pem || '').trim(); const saved = await upsertSettings(urlBase,key,{ id: current?.id || undefined, org_id: orgId, provider: 'self_tsp', base_url: String(current?.base_url || input.base_url || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL, fiscal_id: fiscal(input.fiscal_id || ''), public_key: current?.public_key || null, certificate_pem: certificatePem || current?.certificate_pem || null, signature_key_id: current?.signature_key_id || null, legacy_last_serial: parseLegacySerial(input.legacy_last_serial), server_information: current?.server_information || {}, is_active: input.is_active === true, updated_by: user.id, updated_at: new Date().toISOString(), ...(current?.id ? {} : { created_by: user.id }), ...(privateKey ? { private_key_encrypted: await encryptSecret(privateKey) } : {}) }); const c = await companyRow(urlBase,key,orgId); return json(200, { success: true, settings: sanitized(saved,c) }); }
    if (action === 'test_connection' || action === 'sync_server_information') { const { settings } = await requireSettings(urlBase,key,orgId); const info = await invokeGetServerInformation(settings); await upsertSettings(urlBase,key,{ id: settings.id, org_id: orgId, server_information: info || {}, updated_by: user.id, updated_at: new Date().toISOString() }); return json(200, { success: true, message: 'Server information received.', server_information: info }); }
    if (action === 'send_invoice') { const invoiceId = String(body?.invoice_id || '').trim(); if (!invoiceId) return json(400, { success: false, message: 'invoice_id is required.' }); const { settings, company, privateKey } = await requireSettings(urlBase,key,orgId); let currentSettings = settings; if (!serverKey(currentSettings.server_information || {})) { const info = await invokeGetServerInformation(settings); await upsertSettings(urlBase,key,{ id: settings.id, org_id: orgId, server_information: info || {}, updated_by: user.id, updated_at: new Date().toISOString() }); currentSettings = { ...settings, server_information: info }; } const bundle = await invoiceBundle(urlBase,key,orgId,invoiceId); const settlement = String(body?.settlement_method || bundle.invoice.taxpayer_settlement_method || '').trim(); const serial = BigInt(await rpc(urlBase,key,'reserve_taxpayer_invoice_serial',{ p_org_id: orgId, p_fiscal_id: currentSettings.fiscal_id, p_min_last_serial: String(currentSettings.legacy_last_serial || 0) })); const txid = taxId(currentSettings.fiscal_id, String(bundle.invoice.invoice_date || ''), serial); const payload = invoicePayload({ ...bundle, company, settings: currentSettings, txid, serial, settlement }); const enqueueMeta = requestMeta(); const builtPacket = await buildEncryptedInvoicePacket(currentSettings, privateKey, payload, enqueueMeta.requestTraceId); const packet = builtPacket.packet; const debugPayload = { build: FUNCTION_BUILD, taxpayer_settings: { fiscal_id: currentSettings.fiscal_id, base_url: currentSettings.base_url }, packet_debug: builtPacket.debug }; let sub = first(await insert(urlBase,key,'taxpayer_invoice_submissions',[{ org_id: orgId, invoice_id: invoiceId, fiscal_id: currentSettings.fiscal_id, internal_serial: Number(serial), taxid: txid, status: 'sending', invoice_type: String(bundle.invoice.taxpayer_invoice_type || '1'), invoice_pattern: String(bundle.invoice.taxpayer_invoice_pattern || '1'), invoice_subject: String(bundle.invoice.taxpayer_invoice_subject || '1'), settlement_method: settlement, request_payload: { ...payload, _kalam_debug: debugPayload }, created_by: user.id }])); try { let token; try { ({ token } = await getToken(currentSettings, privateKey)); } catch (e: any) { const message = `GET_TOKEN: ${String(e?.message || e)}`; const failureDebug = { ...debugPayload, stage: 'GET_TOKEN' }; await patch(urlBase,key,'taxpayer_invoice_submissions',sub.id,{ status: 'failed', error_message: message, response_payload: { _kalam_debug: failureDebug }, updated_at: new Date().toISOString() }); throw new Error(message); } let enqueueResult; try { enqueueResult = await invokeAsyncEnqueue(currentSettings, privateKey, packet, token, enqueueMeta); } catch (e: any) { const failureDebug = e?.kalamDebug ? { ...debugPayload, stage: 'normal-enqueue', enqueue_debug: e.kalamDebug } : { ...debugPayload, stage: 'normal-enqueue' }; const message = `normal-enqueue: ${String(e?.message || e)}`; await patch(urlBase,key,'taxpayer_invoice_submissions',sub.id,{ status: 'failed', error_message: message, response_payload: { _kalam_debug: failureDebug }, updated_at: new Date().toISOString() }); throw new Error(message); } const res = enqueueResult.response; const debugResult = { ...debugPayload, stage: 'normal-enqueue', enqueue_debug: enqueueResult.debug }; const row = asyncResultRow(res); if (row?.errorCode || row?.errorMessage || row?.errorDetail) throw new Error([row?.errorCode, row?.errorMessage || row?.errorDetail].filter(Boolean).join(' - ')); sub = first(await patch(urlBase,key,'taxpayer_invoice_submissions',sub.id,{ uid: String(row?.uid || packet.uid || '').trim() || null, reference_number: String(row?.referenceNumber || row?.reference_number || '').trim() || null, status: 'sent', response_payload: { ...(res || {}), _kalam_debug: debugResult }, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })) || sub; return json(200, { success: true, message: 'Invoice was sent to taxpayer system.', submission: sub }); } catch (e: any) { if (!String(e?.message || '').startsWith('GET_TOKEN:') && !String(e?.message || '').startsWith('normal-enqueue:')) { const failureDebug = e?.kalamDebug ? { ...debugPayload, enqueue_debug: e.kalamDebug } : debugPayload; await patch(urlBase,key,'taxpayer_invoice_submissions',sub.id,{ status: 'failed', error_message: String(e?.message || e), response_payload: { _kalam_debug: failureDebug }, updated_at: new Date().toISOString() }); } throw e; } }
    if (action === 'inquire_submission') { const id = String(body?.submission_id || '').trim(); const sub = first(await select(urlBase,key,'taxpayer_invoice_submissions',{ id: 'eq.' + id, org_id: 'eq.' + orgId, select: '*', limit: '1' })); if (!sub?.uid) throw new Error('Submission uid is missing.'); const { settings, privateKey } = await requireSettings(urlBase,key,orgId); const { token } = await getToken(settings, privateKey); const res = await invokeSignedSync(settings, privateKey, 'INQUIRY_BY_UID', [{ uid: sub.uid, fiscalId: settings.fiscal_id }], token, { fiscalId: '' }); const row = first(res?.result?.data) || first(res?.data) || first(res?.result) || res; const status = String(row?.status || row?.invoiceStatus || row?.processingStatus || 'inquired'); const updated = first(await patch(urlBase,key,'taxpayer_invoice_submissions',sub.id,{ status, inquiry_payload: res || {}, last_inquiry_at: new Date().toISOString(), updated_at: new Date().toISOString() })); return json(200, { success: true, message: 'Submission inquiry completed.', submission: updated || sub }); }
    return json(400, { success: false, message: 'Unsupported action.' });
  } catch (error: any) { console.error('[taxpayer-system]', String(error?.message || error)); return json(400, { success: false, message: String(error?.message || 'Taxpayer system error') }); }
});







