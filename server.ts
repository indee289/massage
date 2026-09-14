import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

/*
|--------------------------------------------------------------------------
| EXISTING SUPABASE EDGE FUNCTION
|--------------------------------------------------------------------------
|
| This React/AI Studio app must use the existing Supabase backend.
|
| IMPORTANT:
| - Do NOT put Telegram bot token here.
| - Do NOT put TELEGRAM_ADMIN_ID here.
| - Do NOT put Supabase service-role/secret key here.
| - Those secrets belong on the Supabase Edge Function server.
|
*/

const SUPABASE_API =
  (
    process.env.SUPABASE_FUNCTION_URL ||
    "https://emqseukhovnzgrmsvlag.supabase.co/functions/v1/api"
  ).replace(/\/+$/, "");

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

app.use(
  cors({
    origin: true,
    credentials: false,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Telegram-Init-Data",
      "x-telegram-init-data",
    ],
  })
);

app.options("*", (_req: Request, res: Response) => {
  res.status(204).end();
});

/*
|--------------------------------------------------------------------------
| BODY PARSING
|--------------------------------------------------------------------------
*/

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/*
|--------------------------------------------------------------------------
| STATIC FRONTEND
|--------------------------------------------------------------------------
*/

const frontendPath = path.join(__dirname, "frontend");

app.use(
  express.static(frontendPath, {
    index: "index.html",
  })
);

/*
|--------------------------------------------------------------------------
| API PATHS
|--------------------------------------------------------------------------
|
| The frontend can call either:
|
|   /api/me
|   /me
|
| Both are forwarded to:
|
|   Supabase Edge Function /api
|
*/

const API_ROUTES = new Set([
  "/me",
  "/messages",
  "/profile",
  "/create-invoice",

  "/conversations",
  "/admin-messages",
  "/admin-users",
  "/admin-stats",
  "/admin-grant",
  "/admin-ban",
  "/admin-unban",
]);

function isApiRoute(pathname: string): boolean {
  if (API_ROUTES.has(pathname)) {
    return true;
  }

  if (/^\/messages\/[^/]+$/.test(pathname)) {
    return true;
  }

  if (/^\/messages\/[^/]+\/unsend$/.test(pathname)) {
    return true;
  }

  if (/^\/admin-messages\/[^/]+$/.test(pathname)) {
    return true;
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| REQUEST BODY HELPER
|--------------------------------------------------------------------------
*/

function buildRequestBody(req: Request): string | undefined {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }

  if (req.body === undefined || req.body === null) {
    return undefined;
  }

  const contentType = String(req.headers["content-type"] || "");

  if (contentType.includes("application/json")) {
    return JSON.stringify(req.body);
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(req.body)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          params.append(key, String(item));
        }
      } else if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }

    return params.toString();
  }

  if (typeof req.body === "string") {
    return req.body;
  }

  return JSON.stringify(req.body);
}

/*
|--------------------------------------------------------------------------
| FORWARD HEADERS
|--------------------------------------------------------------------------
*/

function buildForwardHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};

  const contentType = req.headers["content-type"];

  if (contentType) {
    headers["content-type"] = String(contentType);
  }

  const telegramInitData =
    req.headers["x-telegram-init-data"] ||
    req.headers["X-Telegram-Init-Data"];

  if (telegramInitData) {
    headers["x-telegram-init-data"] = String(telegramInitData);
  }

  const authorization = req.headers.authorization;

  if (authorization) {
    headers["authorization"] = authorization;
  }

  headers["accept"] = "application/json";

  return headers;
}

/*
|--------------------------------------------------------------------------
| SUPABASE PROXY
|--------------------------------------------------------------------------
*/

async function proxyToSupabase(req: Request, res: Response) {
  /*
   * Remove the optional /api prefix.
   *
   * Example:
   *
   * /api/me
   *     ↓
   * /me
   *
   * /me
   *     ↓
   * /me
   */

  let pathname = req.path;

  if (pathname.startsWith("/api/")) {
    pathname = pathname.slice(4);
  } else if (pathname === "/api") {
    pathname = "/";
  }

  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  const queryString = req.originalUrl.includes("?")
    ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
    : "";

  const targetUrl = `${SUPABASE_API}${pathname}${queryString}`;

  const headers = buildForwardHeaders(req);
  const body = buildRequestBody(req);

  try {
    console.log(
      `[Supabase Proxy] ${req.method} ${pathname}${queryString}`
    );

    const upstreamResponse = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });

    const responseContentType =
      upstreamResponse.headers.get("content-type") ||
      "application/json; charset=utf-8";

    const responseText = await upstreamResponse.text();

    res.status(upstreamResponse.status);
    res.setHeader("content-type", responseContentType);

    /*
     * Preserve useful headers from Supabase.
     */

    const cacheControl = upstreamResponse.headers.get("cache-control");

    if (cacheControl) {
      res.setHeader("cache-control", cacheControl);
    }

    const location = upstreamResponse.headers.get("location");

    if (location) {
      res.setHeader("location", location);
    }

    /*
     * Return the actual Supabase response.
     *
     * Do NOT convert errors into fake success responses.
     */

    return res.send(responseText);
  } catch (error) {
    console.error("[Supabase Proxy] Request failed:", error);

    return res.status(502).json({
      ok: false,
      error: "Supabase backend unavailable",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    });
  }
}

/*
|--------------------------------------------------------------------------
| API ROUTES
|--------------------------------------------------------------------------
|
| Support both:
|
|   /api/me
|   /me
|
| and all existing nested API endpoints.
|
*/

app.use((req: Request, res: Response, next: NextFunction) => {
  const pathname = req.path;

  /*
   * /api/... is always an API request.
   */

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return proxyToSupabase(req, res);
  }

  /*
   * Direct API routes without /api.
   */

  if (isApiRoute(pathname)) {
    return proxyToSupabase(req, res);
  }

  return next();
});

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "sanya-messenger",
    backend: "supabase-edge-function",
    api: SUPABASE_API,
  });
});

/*
|--------------------------------------------------------------------------
| FRONTEND FALLBACK
|--------------------------------------------------------------------------
|
| React client-side routes should receive index.html.
|
| API requests are handled above and never reach this fallback.
|
*/

app.get("*", (req: Request, res: Response) => {
  /*
   * If a request looks like an API request but was not recognized,
   * return JSON instead of accidentally returning index.html.
   */

  if (
    req.path.startsWith("/api/") ||
    req.path === "/api" ||
    isApiRoute(req.path)
  ) {
    return res.status(404).json({
      ok: false,
      error: "API route not found",
    });
  }

  return res.sendFile(path.join(frontendPath, "index.html"));
});

/*
|--------------------------------------------------------------------------
| GLOBAL ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error("[Server Error]", error);

    if (res.headersSent) {
      return;
    }

    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    });
  }
);

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

app.listen(PORT, HOST, () => {
  console.log("==============================================");
  console.log(" Sanya Messenger");
  console.log("==============================================");
  console.log(` Server: http://${HOST}:${PORT}`);
  console.log(` Supabase API: ${SUPABASE_API}`);
  console.log(" Backend mode: Supabase Edge Function");
  console.log(" Database mode: Supabase");
  console.log(" Payment mode: Telegram Stars via Supabase");
  console.log("==============================================");
});
