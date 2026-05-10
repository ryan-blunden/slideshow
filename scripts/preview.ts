import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { Command } from "commander";
import { build } from "esbuild";
import { buildAutoConfig } from "../src/utils/randomize";
import { listInputImages, slugify, stageFilesToPublic, stageOptionalAudioToPublic } from "../src/utils/slideshow-files";
import type { SlideshowConfig } from "../src/slideshow";
import { getRuntimeDurationFrames } from "../src/utils/runtime-config";
import type { PreviewBootstrap } from "../src/preview/bootstrap";
import { packagePublicRoot, packageRoot } from "./runtime-paths";

type CliOptions = {
  input: string;
  duration: string;
  crossFade: string;
  motion: string;
  zoom: string;
  width: string;
  height: string;
  fps: string;
  port: string;
  audio?: string;
};

const program = new Command();

program
  .argument("[inputDir]", "directory of local images")
  .option("--input <dir>", "alias for the input directory")
  .option("--duration <seconds>", "per-image duration in seconds", "3.0")
  .option("--cross-fade <seconds>", "cross-fade duration in seconds", "1.0")
  .option("--motion <percent>", "pan amount as a percent of the clip's available travel; 0 disables pan", "6")
  .option("--zoom <percent>", "zoom amount as a percent scale change over the whole clip", "8")
  .option("--width <pixels>", "output width", "3840")
  .option("--height <pixels>", "output height", "2160")
  .option("--fps <fps>", "frames per second", "25")
  .option("--port <port>", "preview server port", "3000")
  .option("--audio <path>", "optional guide audio file")
  .parse(process.argv);

const options = program.opts<CliOptions>();
const cwd = process.cwd();
const rawInputDir = program.args[0] ?? options.input;
if (!rawInputDir) {
  throw new Error("Missing input directory. Pass it as an argument or with --input.");
}
const inputDir = path.resolve(cwd, rawInputDir);
const width = Number(options.width);
const height = Number(options.height);
const fps = Number(options.fps);
const durationSeconds = Number(options.duration);
const crossfadeSeconds = Number(options.crossFade);
const motionPercent = Number(options.motion);
const zoomPercent = Number(options.zoom);
const port = Number(options.port);
const normalizedMotionPercent = Number.isFinite(motionPercent) ? Math.min(100, Math.max(0, motionPercent)) : 6;
const normalizedZoomPercent = Number.isFinite(zoomPercent) ? Math.min(100, Math.max(0, zoomPercent)) : 8;

function normalizePreviewRoute(inputPath: string): string {
  const asPosix = inputPath.replace(/\\/g, "/");
  const prefixed = asPosix.startsWith("/") ? asPosix : `/${asPosix}`;
  const normalized = path.posix.normalize(prefixed).replace(/\/+$/, "");
  return normalized === "/" || normalized.length === 0 ? "/preview" : normalized;
}

function encodeRoutePath(routePath: string): string {
  return routePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join(path.sep);
}

function ensurePositiveInteger(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

async function main() {
  ensurePositiveInteger(width, "Width");
  ensurePositiveInteger(height, "Height");
  ensurePositiveInteger(fps, "FPS");
  ensurePositiveInteger(port, "Port");

  const previewRoute = normalizePreviewRoute(rawInputDir);
  const files = await listInputImages(inputDir);
  if (files.length === 0) {
    throw new Error(`No images found in ${inputDir}`);
  }

  const outputName = path.join("renders", `${slugify(path.basename(inputDir))}.mov`);
  const config = buildAutoConfig({
    inputFiles: files,
    width,
    height,
    fps,
    durationSeconds,
    crossfadeSeconds,
    output: outputName,
    compositionId: `${slugify(path.basename(inputDir))}-slideshow`,
    backgroundColor: "#000000",
    motionPercent: normalizedMotionPercent,
    zoomPercent: normalizedZoomPercent,
    audio: options.audio
      ? {
          src: options.audio,
          volume: 0.8,
          enabled: true,
        }
      : undefined,
  });

  const stagingName = `${slugify(config.compositionId)}-${crypto.randomUUID().slice(0, 8)}`;
  const sourceFiles = config.segments.map((segment) => path.resolve(cwd, segment.src));
  const stagedMap = await stageFilesToPublic(sourceFiles, stagingName, packagePublicRoot);
  const stagedAudio =
    config.audio?.enabled && config.audio.src
      ? await stageOptionalAudioToPublic(config.audio.src, stagingName, packagePublicRoot)
      : undefined;

  const runtimeConfig: SlideshowConfig = {
    ...config,
    audio: config.audio
      ? {
          ...config.audio,
          src: stagedAudio ?? config.audio.src,
          enabled: config.audio.enabled ?? true,
        }
      : undefined,
    segments: config.segments.map((segment) => ({
      ...segment,
      src: stagedMap[path.resolve(cwd, segment.src)],
    })),
  };

  const runtimeDir = path.join(packagePublicRoot, ".preview", encodeRoutePath(previewRoute));
  await fsp.mkdir(runtimeDir, { recursive: true });

  const bootstrap: PreviewBootstrap = {
    config: runtimeConfig,
    durationInFrames: getRuntimeDurationFrames(runtimeConfig),
  };

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ken Burns Preview</title>
    <base href="${previewRoute === "/" ? "/" : `${previewRoute}/`}" />
    <script>window.__SLIDESHOW_PREVIEW__=${JSON.stringify(bootstrap)};</script>
    <script type="module" src="./bundle.js"></script>
  </head>
  <body style="margin:0">
    <div id="root"></div>
  </body>
</html>`;

  await fsp.writeFile(path.join(runtimeDir, "index.html"), html, "utf8");

  await build({
    entryPoints: [path.join(packageRoot, "src", "preview", "index.tsx")],
    bundle: true,
    platform: "browser",
    format: "esm",
    target: ["es2020"],
    outfile: path.join(runtimeDir, "bundle.js"),
    jsx: "automatic",
    sourcemap: true,
    loader: {
      ".png": "file",
      ".jpg": "file",
      ".jpeg": "file",
      ".webp": "file",
    },
  });

  const publicRoot = packagePublicRoot;
  const previewRoutePrefix = `${previewRoute === "/" ? "" : previewRoute}/`;
  const server = http.createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    const normalizedUrlPath = path.posix.normalize(urlPath);
    const isPreviewRoute =
      normalizedUrlPath === previewRoute || normalizedUrlPath.startsWith(previewRoutePrefix);
    const previewRelativePath = normalizedUrlPath.slice(previewRoute.length).replace(/^\/+/, "");
    const filePath = isPreviewRoute
      ? path.join(runtimeDir, previewRelativePath || "index.html")
      : normalizedUrlPath === "/"
        ? path.join(runtimeDir, "index.html")
        : path.join(publicRoot, normalizedUrlPath.replace(/^\/+/, ""));

    try {
      const stat = await fsp.stat(filePath);
      if (stat.isDirectory()) {
        const indexPath = path.join(filePath, "index.html");
        const html = await fsp.readFile(indexPath);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType =
        ext === ".html"
          ? "text/html; charset=utf-8"
          : ext === ".js"
            ? "application/javascript; charset=utf-8"
            : ext === ".json"
              ? "application/json; charset=utf-8"
              : ext === ".css"
                ? "text/css; charset=utf-8"
                : ext === ".mp4"
                  ? "video/mp4"
                  : ext === ".mov"
                    ? "video/quicktime"
                    : "application/octet-stream";

      res.writeHead(200, { "Content-Type": contentType });
      fs.createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  });

  server.listen(port, () => {
    console.log(`Preview running at http://localhost:${port}${previewRoute}`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
