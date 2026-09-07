const LOGIN_URL =
  'https://eoffice.vietsov.com.vn/api/Auth/exec?_=usersbusiness_loginasync';
const LOGIN_PAGE_URL = 'https://eoffice.vietsov.com.vn/default/auth/login';
const AES_KEY_BASE64 = 'IWVybUBsYWN2aWV0LnZuIQ==';

const bytesToBase64 = (bytes) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export const encryptLoginValue = async (value) => {
  const keyBytes = base64ToBytes(AES_KEY_BASE64);
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt'],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: keyBytes },
    key,
    new TextEncoder().encode(String(value)),
  );
  return bytesToBase64(new Uint8Array(encrypted));
};

const deviceIdFromHeader = (hdType) => {
  const compact = hdType.split('|').at(-1)?.replace(/-/g, '') ?? '';
  if (!/^[0-9a-f]{32}$/i.test(compact)) return compact;
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
};

export const buildLoginPayload = async ({ username, password, hdType, deviceJson }) => ({
  isJson: true,
  service: 'Auth',
  assemblyName: 'ERM.Business.AD',
  className: 'UsersBusiness',
  methodName: 'LoginAsync',
  msgBodyData: [
    await encryptLoginValue(username.trim()),
    await encryptLoginValue(password),
    '',
    '',
    '',
    deviceJson || JSON.stringify({
      name: 'Chrome',
      os: 'Windows 10',
      id: deviceIdFromHeader(hdType),
    }),
  ],
  saas: 0,
  tenant: 'default',
  functionID: 'WP',
  localTz: 'Asia/Saigon',
  localRegion: 'en-US',
});

const setCookieValues = (headers) => {
  const values = headers.getSetCookie?.();
  if (values?.length) return values;
  const combined = headers.get('set-cookie');
  return combined ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/) : [];
};

export const updateCookieJar = (jar, headers) => {
  for (const header of setCookieValues(headers)) {
    const pair = header.split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!value) jar.delete(name);
    else jar.set(name, value);
  }
};

export const cookieHeader = (jar) =>
  [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');

const jsonObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const extractLoginToken = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.haveBusinessError === true || payload.haveServerError === true || payload.error) return null;
  const user = jsonObject(Array.isArray(payload.msgBodyData) ? payload.msgBodyData[0] : null);
  return typeof user?.token === 'string' && user.token ? user.token : null;
};

const commonHeaders = (hdType) => ({
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7',
  'Cache-Control': 'no-cache',
  'Content-Type': 'application/json',
  Origin: 'https://eoffice.vietsov.com.vn',
  Pragma: 'no-cache',
  Referer: LOGIN_PAGE_URL,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
  'X-HP': '',
  'X-Hd-Req': String(Date.now()),
  'X-Hd-Type': hdType,
});

export const loginToEoffice = async ({ username, password, hdType, deviceJson, signal }) => {
  const jar = new Map();
  const bootstrap = await fetch(LOGIN_PAGE_URL, {
    method: 'GET',
    headers: { Accept: 'text/html', 'User-Agent': commonHeaders(hdType)['User-Agent'] },
    redirect: 'follow',
    signal,
  });
  updateCookieJar(jar, bootstrap.headers);
  if (!bootstrap.ok) throw new Error(`VSP eOffice login page returned HTTP ${bootstrap.status}.`);

  const headers = commonHeaders(hdType);
  const bootstrapCookie = cookieHeader(jar);
  if (bootstrapCookie) headers.Cookie = bootstrapCookie;
  const loginResponse = await fetch(LOGIN_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(await buildLoginPayload({ username, password, hdType, deviceJson })),
    signal,
  });
  updateCookieJar(jar, loginResponse.headers);
  if (!loginResponse.ok) throw new Error(`VSP eOffice login returned HTTP ${loginResponse.status}.`);

  let payload;
  try {
    payload = await loginResponse.json();
  } catch {
    throw new Error('VSP eOffice login returned invalid JSON.');
  }
  const token = extractLoginToken(payload);
  if (!token) throw new Error('VSP eOffice rejected the login or returned an unsupported login response.');
  const cookie = cookieHeader(jar);
  if (!cookie) throw new Error('VSP eOffice login did not establish a session cookie.');
  return { cookie, token };
};
