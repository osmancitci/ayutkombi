
const WebSocket = require('ws');
const axios = require('axios');
const crypto = require('crypto');

const CLIENT_ID = '899';
const SECRET_KEY = '0ad';
const DEVICE_ID = 'ebfl';
const BASE_URL = 'https://openapi.tuyaus.com/';

let access_token = null;

const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

wss.on('connection', ws => {
  console.log('Yeni WebSocket bağlantısı geldi.');

  const interval = setInterval(async () => {
    if (!access_token) return;
    const data = await getDeviceProperties(DEVICE_ID, access_token);
    if (data) {
      ws.send(JSON.stringify(data, null, 2));
    }
  }, 1000);

  ws.on('close', () => clearInterval(interval));
});

console.log(`WebSocket sunucu çalışıyor: ws://localhost:${process.env.PORT || 3000}`);

async function getToken() {
  const t = Date.now();
  const url = BASE_URL + 'v1.0/token?grant_type=1';
  const sign = buildSign('GET', url, {}, {}, '', t);

  const headers = {
    'client_id': CLIENT_ID,
    'sign': sign,
    'sign_method': 'HMAC-SHA256',
    't': t,
    'Content-Type': 'application/json'
  };

  const res = await axios.get(url, { headers });
  access_token = res.data.result.access_token;
}

async function getDeviceProperties(device_id, token) {
  const t = Date.now();
  const url = `${BASE_URL}v2.0/cloud/thing/${device_id}/shadow/properties`;
  const sign = buildSign('GET', url, {}, {}, token, t);

  const headers = {
    'client_id': CLIENT_ID,
    'sign': sign,
    'sign_method': 'HMAC-SHA256',
    't': t,
    'Content-Type': 'application/json',
    'access_token': token
  };

  try {
    const res = await axios.get(url, { headers });
    const props = res.data.result.properties || [];

    let relay = null, mode = null, temp_set = null, temp_current = null;

    props.forEach(p => {
      if (p.code === 'relay_status') relay = p.value;
      if (p.code === 'mode') mode = p.value;
      if (p.code === 'temp_set') temp_set = p.value;
      if (p.code === 'temp_current') temp_current = p.value;
    });

    const mode_names = {
      eco: 'Ekonomi',
      manual: 'El ile Ayar',
      holiday: 'Tatil',
      comfort: 'Konfor',
      rf_thermostat: 'Termostat'
    };

    const relay_text = relay ? 'Açık' : 'Kapalı';
    const relay_data = relay ? 1 : 0;
    const mode_text = mode_names[mode] || (mode ? mode[0].toUpperCase() + mode.slice(1) : null);

    return {
      timestamp: new Date().toISOString(),
      relay_status: relay_text,
      relay_data,
      mode: mode_text,
      temp_set: temp_set / 10,
      temp_current: temp_current / 10
    };
  } catch (err) {
    console.error('Tuya API hatası:', err.message);
    return null;
  }
}

function buildSign(method, url, payload = {}, headers = {}, token = '', t = Date.now()) {
  const payloadStr = Object.keys(payload).length ? JSON.stringify(payload) : '';
  const headersStr = Object.keys(headers).length ? Object.values(headers).join('\n') : '';
  const contentSHA256 = crypto.createHash('sha256').update(payloadStr).digest('hex');

  const parsedUrl = new URL(url);
  const path = parsedUrl.pathname + (parsedUrl.search || '');

  const stringToSign = `${method}\n${contentSHA256}\n${headersStr}\n${path}`;
  const signStr = CLIENT_ID + token + t + stringToSign;

  return crypto.createHmac('sha256', SECRET_KEY).update(signStr).digest('hex').toUpperCase();
}

(async () => {
  await getToken();
  setInterval(getToken, 3500 * 1000);
})();
