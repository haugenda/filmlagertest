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

const BASE_URL = "https://api.tradera.com/v4";

const ALLOWED = [
  { method: "GET", pattern: /^\/reference-data\/time$/, needsUser: false },
  { method: "GET", pattern: /^\/orders$/, needsUser: true },
  { method: "GET", pattern: /^\/orders\/[\d,]+$/, needsUser: true },
  { method: "GET", pattern: /^\/listings\/seller-items$/, needsUser: true },
  { method: "GET", pattern: /^\/listings\/updated-seller-items$/, needsUser: true },

  // --- Publicera annons ---
  { method: "GET", pattern: /^\/categories\/\d+\/attribute-definitions$/, needsUser: false },
  { method: "GET", pattern: /^\/reference-data\/shipping-options(\?.*)?$/, needsUser: false },
  { method: "POST", pattern: /^\/listings\/items$/, needsUser: true },
  { method: "POST", pattern: /^\/listings\/items\/\d+\/images$/, needsUser: true },
  { method: "POST", pattern: /^\/listings\/items\/\d+\/commit$/, needsUser: true },

  // --- Mina annonser / prisändring ---
  { method: "GET", pattern: /^\/items\/\d+\/restarts$/, needsUser: true },
  { method: "POST", pattern: /^\/listings\/items\/\d+\/restart$/, needsUser: true },
  { method: "PUT", pattern: /^\/listings\/items\/\d+\/price$/, needsUser: true },
  { method: "GET", pattern: /^\/listings\/items\/\d+$/, needsUser: true },
  { method: "GET", pattern: /^\/orders\/[\d,]+\/freight-labels$/, needsUser: true },
  { method: "GET", pattern: /^\/orders\/[\d,]+\/shipping-codes$/, needsUser: true },
  { method: "POST", pattern: /^\/search\/advanced$/, needsUser: false },
];

exports.handler = async (event) => {
  try {
    const path = event.queryStringParameters?.path;
    if (!path) {
      return json(400, { error: "Saknar 'path'-parameter, t.ex. ?path=/orders" });
    }

    const pathWithoutQuery = path.split("?")[0];

    const rule = ALLOWED.find((r) => {
      if (r.method !== event.httpMethod) return false;
      return r.pattern.test(path) || r.pattern.test(pathWithoutQuery);
    });
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

    const fetchOptions = { method: event.httpMethod, headers };

    if (event.httpMethod === "POST" || event.httpMethod === "PUT") {
      headers["Content-Type"] = "application/json";
      if (event.body) {
        fetchOptions.body = event.isBase64Encoded
          ? Buffer.from(event.body, "base64").toString("utf-8")
          : event.body;
      }
    }

    const traderaRes = await fetch(`${BASE_URL}${path}`, fetchOptions);
    const body = await traderaRes.text();
    return {
      statusCode: traderaRes.status,
      headers: { "Content-Type": "application/json" },
      body: body || "{}",
    };
  } catch (err) {
    return json(500, { error: String(err) });
  }
};

function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}