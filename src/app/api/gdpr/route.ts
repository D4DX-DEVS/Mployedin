import { NextResponse } from "next/server";

/**
 * GET /api/gdpr
 * Returns available GDPR endpoints as an HTML page.
 */
export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GDPR API – Mployedin</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 60px auto; padding: 0 24px; color: #111; }
    h1 { font-size: 1.4rem; margin-bottom: 4px; }
    p  { color: #555; font-size: 0.9rem; margin-bottom: 32px; }
    .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; margin-bottom: 14px; }
    .method { display: inline-block; font-size: 0.72rem; font-weight: 700; letter-spacing: .05em;
              padding: 2px 8px; border-radius: 4px; margin-right: 8px; }
    .GET    { background: #d1fae5; color: #065f46; }
    .DELETE { background: #fee2e2; color: #991b1b; }
    code { font-size: 0.9rem; font-weight: 600; }
    .desc { font-size: 0.85rem; color: #555; margin-top: 6px; }
  </style>
</head>
<body>
  <h1>GDPR API Endpoints</h1>
  <p>These endpoints allow users to exercise their data rights under GDPR.</p>

  <div class="card">
    <span class="method GET">GET</span><code>/api/gdpr/export</code>
    <div class="desc">Export all personal data associated with your account. Limited to 3 requests per day.</div>
  </div>

  <div class="card">
    <span class="method DELETE">DELETE</span><code>/api/gdpr/export</code>
    <div class="desc">Right to erasure — anonymizes your account and permanently deletes personal data.</div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
