import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { Command } from "commander";
import { build } from "esbuild";
import type { PreviewBootstrap } from "../src/preview/bootstrap";
import type { SlideshowConfig } from "../src/slideshow";
import { buildAutoConfig } from "../src/utils/randomize";
import { getRuntimeDurationFrames } from "../src/utils/runtime-config";
import { selectImagesForSlideshowDuration } from "../src/utils/slideshow-duration";
import {
  listInputImages,
  readImageDimensionsByPath,
  removePathIfExists,
  removeStagingDir,
  slugify,
  stageFilesToPublic,
  stageOptionalAudioToPublic,
} from "../src/utils/slideshow-files";
import { packagePublicRoot, packageRoot } from "./runtime-paths";

type CliOptions = {
  input: string;
  duration: string;
  crossFade: string;
  motion: string;
  zoom: string;
  slideshowDuration?: string;
  width: string;
  height: string;
  fps: string;
  backgroundColor: string;
  minImageDimensionPercent: string;
  port: string;
  audio?: string;
};

const program = new Command();

program
  .argument("[inputDir]", "directory of local images")
  .option("--input <dir>", "alias for the input directory")
  .option("--duration <seconds>", "per-image duration in seconds", "3.0")
  .option(
    "--cross-fade <seconds>",
    "cross-fade duration in seconds; overlaps adjacent images without shortening total runtime",
    "1.0",
  )
  .option(
    "--motion <percent>",
    "pan amount as a percent of the clip's available travel; 0 disables pan",
    "6",
  )
  .option("--zoom <percent>", "zoom amount as a percent scale change over the whole clip", "8")
  .option("--slideshow-duration <seconds>", "maximum total slideshow duration in seconds")
  .option("--width <pixels>", "output width", "1920")
  .option("--height <pixels>", "output height", "1080")
  .option("--fps <fps>", "frames per second", "25")
  .option("--background-color <color>", "background color for letterboxed slides", "#000000")
  .option(
    "--min-image-dimension-percent <percent>",
    "disable motion when either source dimension falls below this percent of the output size",
    "100",
  )
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
const slideshowDurationSeconds = options.slideshowDuration
  ? Number(options.slideshowDuration)
  : undefined;
const motionPercent = Number(options.motion);
const zoomPercent = Number(options.zoom);
const backgroundColor = options.backgroundColor;
const minImageDimensionPercent = Number(options.minImageDimensionPercent);
const port = Number(options.port);
const normalizedMotionPercent = Number.isFinite(motionPercent)
  ? Math.min(100, Math.max(0, motionPercent))
  : 6;
const normalizedZoomPercent = Number.isFinite(zoomPercent)
  ? Math.min(100, Math.max(0, zoomPercent))
  : 8;
const audioPath = options.audio ? path.resolve(cwd, options.audio) : undefined;

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

function killProcessListeningOnPort(targetPort: number): void {
  const probe = spawnSync("lsof", [`-tiTCP:${targetPort}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
  });

  if (probe.status !== 0) {
    return;
  }

  const pids = String(probe.stdout)
    .trim()
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (pids.length === 0) {
    return;
  }

  console.log(`Preview port ${targetPort} is already in use. Stopping ${pids.length} process(es).`);

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Ignore races where the process exits before we can signal it.
    }
  }
}

async function main() {
  ensurePositiveInteger(width, "Width");
  ensurePositiveInteger(height, "Height");
  ensurePositiveInteger(fps, "FPS");
  ensurePositiveInteger(port, "Port");
  killProcessListeningOnPort(port);

  const previewRoute = normalizePreviewRoute(rawInputDir);
  const files = await listInputImages(inputDir);
  if (files.length === 0) {
    throw new Error(`No images found in ${inputDir}`);
  }

  await Promise.all([removePathIfExists(path.join(packagePublicRoot, ".preview"))]);

  const slideshowSelection = selectImagesForSlideshowDuration({
    inputFiles: files,
    durationFrames: Math.round(durationSeconds * fps),
    crossfadeFrames: Math.round(crossfadeSeconds * fps),
    slideshowDurationSeconds,
    fps,
  });

  if (slideshowSelection.excludedFiles.length > 0) {
    console.log(
      [
        `Requested slideshow duration: ${slideshowDurationSeconds} seconds`,
        `Using ${slideshowSelection.includedFiles.length} of ${files.length} images to fit the requested length.`,
        `Excluding ${slideshowSelection.excludedFiles.length} image(s):`,
        ...slideshowSelection.excludedFiles.map(
          (file) => `  - ${path.relative(cwd, file) || file}`,
        ),
      ].join("\n"),
    );
  } else if (slideshowDurationSeconds !== undefined) {
    console.log(
      `Requested slideshow duration: ${slideshowDurationSeconds} seconds; all ${files.length} image(s) fit.`,
    );
  }

  const imageDimensionsByPath = await readImageDimensionsByPath(slideshowSelection.includedFiles);

  const outputName = path.join("renders", `${slugify(path.basename(inputDir))}.mov`);
  const config = buildAutoConfig({
    inputFiles: slideshowSelection.includedFiles,
    width,
    height,
    fps,
    durationSeconds,
    crossfadeSeconds,
    output: outputName,
    compositionId: `${slugify(path.basename(inputDir))}-slideshow`,
    backgroundColor,
    motionPercent: normalizedMotionPercent,
    zoomPercent: normalizedZoomPercent,
    minImageDimensionPercent: Number.isFinite(minImageDimensionPercent)
      ? minImageDimensionPercent
      : 100,
    imageDimensionsByPath,
    audio: audioPath
      ? {
          src: audioPath,
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

  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    await Promise.all([
      removeStagingDir(packagePublicRoot, stagingName),
      removePathIfExists(runtimeDir),
    ]);
  };

  const shutdown = (_signal: NodeJS.Signals) => {
    server.close(() => {
      void cleanup()
        .then(() => {
          process.exitCode = 0;
          process.exit(0);
        })
        .catch((error) => {
          console.error(error instanceof Error ? error.message : error);
          process.exitCode = 1;
          process.exit(1);
        });
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  server.listen(port, () => {
    console.log(`Preview running at http://localhost:${port}${previewRoute}`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
