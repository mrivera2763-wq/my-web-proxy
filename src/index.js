
import puppeteer from "@cloudflare/puppeteer";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        project: "My Web Proxy",
        browserRun: "configured"
      }, { headers: cors });
    }

    // Protect API routes with the private access key.
    if (url.pathname.startsWith("/api/")) {
      const authorization = request.headers.get("Authorization");
      const expected = `Bearer ${env.PROXY_ACCESS_KEY}`;

      if (
        !env.PROXY_ACCESS_KEY ||
        authorization !== expected
      ) {
        return Response.json({
          ok: false,
          error: "Unauthorized"
        }, {
          status: 401,
          headers: cors
        });
      }
    }

    if (url.pathname === "/api/test-browser") {
      let browser;

      try {
        browser = await puppeteer.launch(env.MYBROWSER);
        const page = await browser.newPage();

        await page.goto("https://example.com");

        return Response.json({
          ok: true,
          title: await page.title()
        }, { headers: cors });

      } catch (error) {
        return Response.json({
          ok: false,
          error: String(error)
        }, {
          status: 500,
          headers: cors
        });

      } finally {
        if (browser) await browser.close();
      }
    }

    if (url.pathname === "/api/session") {
      return Response.json({
        ok: false,
        message: "Navigation endpoint not implemented yet."
      }, {
        status: 501,
        headers: cors
      });
    }

    return new Response("My Web Proxy API is running!", {
      headers: cors
    });
  }
};
