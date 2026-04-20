import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { ensureDir } from "./utils.js";

const config = loadConfig();
const publicDir = path.join(config.rootDir, "public");
await ensureDir(publicDir);
await writeFile(
  path.join(publicDir, "index.html"),
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Prospecting Mockups</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; color: #14221a; background: #f6f8f7; }
    main { min-height: 100vh; display: grid; align-content: center; gap: 18px; padding: 32px; max-width: 760px; }
    h1 { font-size: 44px; line-height: 1.05; margin: 0; letter-spacing: 0; }
    p { font-size: 18px; line-height: 1.6; }
    a { color: #1f6b47; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>Prospecting mockup previews</h1>
    <p>Generated lead-specific previews live under <a href="/mockups/">/mockups/</a> after the daily workflow creates them.</p>
  </main>
</body>
</html>
`,
  "utf8"
);
console.log(`Static site ready at ${publicDir}`);
