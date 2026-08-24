// netlify/functions/tradera.js
//
// Säker proxy mot Tradera API v4. AppId/AppKey/User-Token lever bara här på
// servern - de skickas ALDRIG till klienten (index.html).
//
// Miljövariabler (sätts i Netlify: Site settings -> Environment variables,
// INTE i koden och INTE i git):
//   TRADERA_APP_ID
//   TRADERA_APP_KEY
//   TRADERA_USER_ID       (krävs bara för User/User+Seller-endpoints)
//   TRADERA_USER_TOKEN    (krävs bara för User/User+Seller-endpoints)
//
// Frontend-exempel:
//   const res = await fetch('/.netlify/functions/tradera?path=/orders');
//   const orders = await res.json();

const BASE_URL = "https://api.tradera.com/v4";

// Vitlista: bara dessa metod+väg-kombinationer får gå igenom proxyn.
// Lägg till fler rader allteftersom du bygger ut integrationen - hellre en
// extra rad än att öppna upp proxyn generellt.
const ALLOWED = [
  { method: "GET", pattern: /^\/reference-data\/time$/, needsUser: false },
  { method: "GET", pattern: /^\/orders$/, needsUser: true },
  { method: "GET", pattern: /^\/orders\/[\d,]+$/, needsUser: true },
  { method: "GET", pattern: /^\/listings\/seller-items$/, needsUser: true },
  { method: "GET", pattern: /^\/listings\/updated-seller-items$/, needsUser: true },
];

exports.handler = async (event) => {
  try {
    const path = event.queryStringParameters?.path;
    if (!path) {
      return json(400, { error: "Saknar 'path'-parameter, t.ex. ?path=/orders" });
    }

    const rule = ALLOWED.find(
      (r) => r.method === event.httpMethod && r.pattern.test(path)
    );
    if (!rule) {
      return json(403, { error: `${event.httpMethod} ${path} är inte tillåten i proxyn` });
    }

    const headers = {
      "X-App-Id": process.env.TRADERA_APP_ID,
      "X-App-Key": process.env.TRADERA_APP_KEY,
    };

    if (rule.needsUser) {
      if (!process.env.TRADERA_USER_ID || !process.env.TRADERA_USER_TOKEN) {
        return json(500, { error: "Saknar TRADERA_USER_ID/TRADERA_USER_TOKEN på servern" });
      }
      headers["X-User-Id"] = process.env.TRADERA_USER_ID;
      headers["X-User-Token"] = process.env.TRADERA_USER_TOKEN;
    }

    const traderaRes = await fetch(`${BASE_URL}${path}`, {
      method: event.httpMethod,
      headers,
    });

    const body = await traderaRes.text();
    return {
      statusCode: traderaRes.status,
      headers: { "Content-Type": "application/json" },
      body,
    };
  } catch (err) {
    return json(500, { error: String(err) });
  }
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}