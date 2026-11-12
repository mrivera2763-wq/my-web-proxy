
import puppeteer from "@cloudflare/puppeteer";

const COOKIE_NAME = "__Host-myproxy";
const SESSION_SECONDS = 8 * 60 * 60;

function encode(data) {
  return btoa(String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return encode(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payload)
    )
  );
}

async function createSession(secret) {
  const payload = encode(
    new TextEncoder().encode(JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS
    }))
  );

  return payload + "." + await sign(payload, secret);
}

async function verifySession(request, secret) {
  try {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(
      new RegExp("(?:^|;\\s*)" + COOKIE_NAME + "=([^;]+)")
    );

    if (!match) return false;

    const [payload, signature] = match[1].split(".");
    if (!payload || !signature) return false;

    const expected = await sign(payload, secret);

    if (signature !== expected) return false;

    const data = JSON.parse(
      new TextDecoder().decode(decode(payload))
    );

    return data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, project: "My Web Proxy" });
    }

    if (url.pathname.startsWith("/api/")) {
      if (!env.LOGIN_PASSWORD || !env.SESSION_SECRET) {
        return json({ ok: false, error: "Server configuration missing" }, 500);
      }

      if (request.method === "POST") {
        if (request.headers.get("Origin") !== url.origin) {
          return json({ ok: false, error: "Invalid origin" }, 403);
        }
      }

      if (url.pathname === "/api/login" && request.method === "POST") {
        try {
          const body = await request.json();

          if (
            typeof body.password !== "string" ||
            body.password.length > 256 ||
            body.password !== env.LOGIN_PASSWORD
          ) {
            return json({ ok: false, error: "Incorrect password" }, 401);
          }

          const token = await createSession(env.SESSION_SECRET);

          return json(
            { ok: true },
            200,
            {
              "Set-Cookie":
                `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`
            }
          );
        } catch {
          return json({ ok: false, error: "Invalid request" }, 400);
        }
      }

      if (url.pathname === "/api/logout" && request.method === "POST") {
        return json(
          { ok: true },
          200,
          {
            "Set-Cookie":
              `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
          }
        );
      }

      const authenticated = await verifySession(
        request,
        env.SESSION_SECRET
      );

      if (url.pathname === "/api/me" && request.method === "GET") {
        return json({ authenticated });
      }

      if (!authenticated) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }

      if (url.pathname === "/api/test-browser") {
        let browser;

        try {
          browser = await puppeteer.launch(env.MYBROWSER);
          const page = await browser.newPage();
          await page.goto("https://example.com");

          return json({
            ok: true,
            title: await page.title()
          });
        } catch {
          return json({ ok: false, error: "Browser test failed" }, 500);
        } finally {
          if (browser) await browser.close();
        }
      }

      if (url.pathname === "/api/session") {
        return json({
          ok: false,
          message: "Remote navigation is not implemented yet."
        }, 501);
      }

      return json({ ok: false, error: "Not found" }, 404);
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};
