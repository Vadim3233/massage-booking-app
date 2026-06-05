import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const host = "127.0.0.1";
const port = 5173;
const root = path.resolve(process.cwd(), "dist");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  });
  response.end(body);
}

async function fileExists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

const indexPath = path.join(root, "index.html");

if (!(await fileExists(indexPath))) {
  console.error("The built app was not found in the dist folder.");
  console.error("Open the project in Codex and ask it to run: npm run build");
  process.exit(1);
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);
  const requestedPath = requestUrl.pathname === "/" ? "/index.html" : decodeURIComponent(requestUrl.pathname);
  const filePath = path.normalize(path.join(root, requestedPath));

  if (!filePath.startsWith(root)) {
    send(response, 403, "Forbidden");
    return;
  }

  const targetPath = await fileExists(filePath) ? filePath : indexPath;
  const extension = path.extname(targetPath).toLowerCase();
  const contentType = mimeTypes.get(extension) ?? "application/octet-stream";

  try {
    send(response, 200, await readFile(targetPath), contentType);
  } catch {
    send(response, 500, "Could not read the app file.");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log(`The app already seems to be running at http://${host}:${port}/`);
    return;
  }

  console.error(error.message);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Chain Scheduler is running at http://${host}:${port}/`);
  console.log("Leave this window open while using the project.");
  console.log("Press Ctrl+C to stop it.");
});
