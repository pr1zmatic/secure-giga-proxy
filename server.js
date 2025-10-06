// server.js - ФИНАЛЬНАЯ ВЕРСИЯ, ОТКЛЮЧАЮЩАЯ ПРОВЕРКУ SSL

const express = require('express');
const axios = require('axios');
const https = require('https');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

// --- КОНФИГУРАЦИЯ ---
const GIGA_TOKEN_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const GIGA_API_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";
const GIGA_AUTH_CREDENTIALS = process.env.GIGA_AUTH_CREDENTIALS;
const PROXY_SECRET_KEY = process.env.PROXY_SECRET_KEY;
const GIGA_SCOPE = "GIGACHAT_API_PERS";

// --- КЛЮЧЕВАЯ ЧАСТЬ: СОЗДАЕМ AXIOS INSTANCE, КОТОРЫЙ ИГНОРИРУЕТ SSL ---
// Этот метод является стандартным и гарантированно работает в среде Node.js
const unsafeAxios = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false // <--- ОТКЛЮЧАЕМ ПРОВЕРКУ СЕРТИФИКАТА
  })
});

// --- УПРАВЛЕНИЕ ТОКЕНОМ ---
let accessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }
  console.log("Requesting new GigaChat access token (bypassing SSL verification)...");

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${GIGA_AUTH_CREDENTIALS}`,
    'RqUID': uuidv4(),
  };
  
  // Используем наш "небезопасный" axios
  const response = await unsafeAxios.post(GIGA_TOKEN_URL, `scope=${GIGA_SCOPE}`, { headers });

  accessToken = response.data.access_token;
  tokenExpiresAt = Date.now() + (response.data.expires_in * 1000) - 60000;
  console.log("Successfully received new access token.");
  return accessToken;
}

// --- ОСНОВНОЙ МАРШРУТ ---
app.post('/', async (req, res) => {
  // Проверка секретного ключа
  if (req.headers.authorization !== `Bearer ${PROXY_SECRET_KEY}`) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const token = await getAccessToken();
    
    // Используем "небезопасный" axios и для этого запроса
    const gigaResponse = await unsafeAxios.post(GIGA_API_URL, req.body, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    res.status(200).json(gigaResponse.data);
  } catch (error) {
    console.error("Proxy error:", error.response ? error.response.data : error.message);
    res.status(500).send(error.message);
  }
});

// --- ЗАПУСК СЕРВЕРА ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});