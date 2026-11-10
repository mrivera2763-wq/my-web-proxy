import puppeteer from "@cloudflare/puppeteer";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
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
        }, { status: 500, headers: cors });

      } finally {
        if (browser) await browser.close();
      }
    }

    return new Response("My Web Proxy API is running!", {
      headers: cors
    });
  }
};
