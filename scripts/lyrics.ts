import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { Command } from "commander";
import { build } from "esbuild";
import { DEFAULT_LYRICS_COMPOSITION_ID, type LyricsRuntimeConfig } from "../src/LyricsComposition";
import { buildLyricsConfig, getLyricsDurationFrames, readLyricsFile } from "../src/lyrics";
import type { LyricsPreviewBootstrap } from "../src/preview/lyrics-bootstrap";
import {
  buildFontFaceCss,
  deriveLyricsThemeMetrics,
  inferFontFormat,
  readLyricsTheme,
} from "../src/utils/lyrics-theme";
import {
  getOutputExtension,
  isTransparentTheme,
  parseRenderCodec,
  resolveCrf,
  resolveProResProfile,
} from "../src/utils/render-encoding";
import {
  removePathIfExists,
  removeStagingDir,
  slugify,
  stageFileToPublic,
  stageOptionalAudioToPublic,
} from "../src/utils/slideshow-files";
import { packagePublicRoot, packageRoot } from "./runtime-paths";

const defaultThemePath = path.join(packageRoot, "src", "lyrics", "default-theme.css");
const defaultFontFamily = "VidTools Custom Font";
const defaultPreviewPort = 3000;

type RenderOptions = {
  lyrics: string;
  audio?: string;
  background?: string;
  theme?: string;
  font?: string;
  fps: string;
  lyricsStartOffset: string;
  lyricsFadeIn: string;
  lyricsFadeOut: string;
  lyricsFadeOutOffset: string;
  output: string;
  codec: string;
  proresProfile?: string;
  crf?: string;
};

type PreviewOptions = Omit<RenderOptions, "output" | "codec"> & {
  output?: string;
};

type BackgroundKind = "image" | "video";

function getBackgroundKind(filePath: string): BackgroundKind {
  const ext = path.extname(filePath).toLowerCase();
  if (/\.(jpe?g|png|webp)$/i.test(filePath) || ext === ".jpg" || ext === ".jpeg") {
    return "image";
  }

  if (ext === ".mp4" || ext === ".mov" || ext === ".webm" || ext === ".m4v") {
    return "video";
  }

  throw new Error(
    `Unsupported background file "${filePath}". Expected an image (.jpg, .jpeg, .png, .webp) or video (.mp4, .mov, .webm, .m4v).`,
  );
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

function getMediaDurationFrames(filePath: string, fps: number): number {
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    {
      encoding: "utf8",
    },
  );

  if (probe.status !== 0) {
    throw new Error(`ffprobe failed for ${filePath}: ${probe.stderr || "unknown error"}`);
  }

  const durationSeconds = Number(String(probe.stdout).trim());
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`Could not read a valid duration from ${filePath}`);
  }

  return Math.max(1, Math.round(durationSeconds * fps));
}

function buildOutputLocation(
  cwd: string,
  output: string,
  codec: "h264" | "h265" | "prores",
): string {
  const outputPath = path.isAbsolute(output) ? output : path.resolve(cwd, output);
  return outputPath.match(/\.[^.]+$/)
    ? outputPath.replace(/\.[^.]+$/i, getOutputExtension(codec))
    : `${outputPath}${getOutputExtension(codec)}`;
}

async function buildRuntimeBundle(
  cwd: string,
  options: {
    lyrics: string;
    audio?: string;
    background?: string;
    theme?: string;
    font?: string;
    fps: string;
    lyricsStartOffset: string;
    lyricsFadeIn: string;
    lyricsFadeOut: string;
    lyricsFadeOutOffset: string;
    output?: string;
    codec?: string;
  },
): Promise<{
  config: LyricsRuntimeConfig;
  outputLocation: string;
  previewRoute: string;
  stagingName: string;
  themeIsTransparent: boolean;
  codecSelection: ReturnType<typeof parseRenderCodec>;
}> {
  const fps = Number(options.fps);
  ensurePositiveInteger(fps, "FPS");

  const lyricsPath = path.resolve(cwd, options.lyrics);
  const themePath = options.theme ? path.resolve(cwd, options.theme) : defaultThemePath;
  const rawThemeCss = await readLyricsTheme(themePath, defaultThemePath);
  const parsedLyrics = await readLyricsFile(lyricsPath);
  const lyrics = buildLyricsConfig(parsedLyrics, fps, {
    startOffsetSeconds: Number(options.lyricsStartOffset),
    fadeInSeconds: Number(options.lyricsFadeIn),
    fadeOutSeconds: Number(options.lyricsFadeOut),
    fadeOutOffsetSeconds: Number(options.lyricsFadeOutOffset),
  });
  const themeMetrics = deriveLyricsThemeMetrics(rawThemeCss, parsedLyrics);
  const durationInFrames = options.audio
    ? getMediaDurationFrames(path.resolve(cwd, options.audio), fps)
    : getLyricsDurationFrames(lyrics);
  const previewSlug = slugify(path.basename(lyricsPath, path.extname(lyricsPath))) || "preview";
  const previewRoute = `/${previewSlug}`;
  const fallbackOutput = path.join(
    "renders",
    `${slugify(path.basename(lyricsPath, path.extname(lyricsPath)))}.mov`,
  );
  const stagingName = `${slugify(path.basename(lyricsPath, path.extname(lyricsPath)))}-${crypto
    .randomUUID()
    .slice(0, 8)}`;

  let fontConfig:
    | {
        src: string;
        family: string;
      }
    | undefined;

  let fontFaceCss: string | undefined;

  try {
    let backgroundConfig:
      | {
          src: string;
          kind: BackgroundKind;
        }
      | undefined;

    if (options.background) {
      const backgroundPath = path.resolve(cwd, options.background);
      const stagedBackground = await stageFileToPublic(
        backgroundPath,
        stagingName,
        packagePublicRoot,
      );
      backgroundConfig = {
        src: stagedBackground,
        kind: getBackgroundKind(backgroundPath),
      };
    }

    const themeIsTransparent = isTransparentTheme(rawThemeCss) && !backgroundConfig;
    const codecSelection: ReturnType<typeof parseRenderCodec> = options.codec
      ? parseRenderCodec(options.codec)
      : {
          codec: "prores" as const,
          proResProfile: themeIsTransparent ? "4444" : "hq",
        };
    const outputLocation = buildOutputLocation(
      cwd,
      options.output ?? fallbackOutput,
      codecSelection.codec,
    );

    const stagedAudio = options.audio
      ? await stageOptionalAudioToPublic(
          path.resolve(cwd, options.audio),
          stagingName,
          packagePublicRoot,
        )
      : undefined;

    if (options.font) {
      const fontPath = path.resolve(cwd, options.font);
      const stagedFont = await stageFileToPublic(fontPath, stagingName, packagePublicRoot);
      fontConfig = {
        src: stagedFont,
        family: defaultFontFamily,
      };
      fontFaceCss = buildFontFaceCss(
        defaultFontFamily,
        `/${stagedFont}`,
        inferFontFormat(fontPath),
      );
    }

    const themeCss = [
      rawThemeCss,
      fontConfig ? `.lyrics { --lyrics-font-family: ${JSON.stringify(fontConfig.family)}; }` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      config: {
        compositionId: DEFAULT_LYRICS_COMPOSITION_ID,
        width: themeMetrics.frameWidth,
        height: themeMetrics.frameHeight,
        fps,
        durationInFrames,
        output: outputLocation,
        backgroundColor: "transparent",
        lyrics,
        themeCss,
        fontFaceCss,
        background: backgroundConfig,
        audio: stagedAudio
          ? {
              src: stagedAudio,
              volume: 0.8,
              enabled: true,
            }
          : undefined,
        font: fontConfig,
      },
      outputLocation,
      previewRoute,
      stagingName,
      themeIsTransparent,
      codecSelection,
    };
  } catch (error) {
    await removeStagingDir(packagePublicRoot, stagingName);
    throw error;
  }
}

async function copyDefaultTheme(outputPath: string) {
  const resolved = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(process.cwd(), outputPath);
  await fsp.mkdir(path.dirname(resolved), { recursive: true });
  await fsp.copyFile(defaultThemePath, resolved);
  console.log(`Copied default lyric theme to ${resolved}`);
}

function encodeRoutePath(routePath: string): string {
  return routePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join(path.sep);
}

function createLyricsPreviewHtml(bootstrap: LyricsPreviewBootstrap, previewRoute: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lyrics Preview</title>
    <base href="${previewRoute === "/" ? "/" : `${previewRoute}/`}" />
    <script>window.__VIDTOOLS_LYRICS_PREVIEW__=${JSON.stringify(bootstrap)};</script>
    <script type="module" src="./bundle.js"></script>
  </head>
  <body style="margin:0">
    <div id="root"></div>
  </body>
</html>`;
}

function createServer(runtimeDir: string, publicRoot: string, previewRoute: string) {
  const previewRoutePrefix = `${previewRoute === "/" ? "" : previewRoute}/`;
  return http.createServer(async (req, res) => {
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
        const html = await fsp.readFile(path.join(filePath, "index.html"));
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
                    : ext === ".woff2"
                      ? "font/woff2"
                      : ext === ".woff"
                        ? "font/woff"
                        : ext === ".otf"
                          ? "font/otf"
                          : ext === ".ttf"
                            ? "font/ttf"
                            : "application/octet-stream";

      res.writeHead(200, { "Content-Type": contentType });
      fs.createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  });
}

function buildRenderProgram() {
  const program = new Command();
  program
    .name("render")
    .requiredOption("--lyrics <path>", "path to an LRC lyric file")
    .option("--audio <path>", "path to an audio file")
    .option("--background <path>", "path to an image or video background file")
    .option("--theme <path>", "path to a CSS theme file")
    .option("--font <path>", "path to a local font file to embed")
    .option("--fps <fps>", "frames per second", "25")
    .option(
      "--lyrics-start-offset <seconds>",
      "shift all lyric timestamps by this many seconds",
      "0",
    )
    .option("--lyrics-fade-in <seconds>", "fade-in duration for each lyric line", "0.4")
    .option("--lyrics-fade-out <seconds>", "fade-out duration for each lyric line", "0.4")
    .option(
      "--lyrics-fade-out-offset <seconds>",
      "start fading the current line this many seconds before the next line starts",
      "0.5",
    )
    .requiredOption("--output <path>", "output file path")
    .option("--codec <codec>", "render codec: h264, h265, or prores-<profile>")
    .option(
      "--prores-profile <profile>",
      "ProRes profile: 4444-xq, 4444, hq, standard, light, or proxy",
    )
    .option("--crf <crf>", "quality setting for h264/h265; lower is better")
    .action(async function (this: Command) {
      const options = this.opts<RenderOptions>();
      const cwd = process.cwd();
      const runtime = await buildRuntimeBundle(cwd, options);
      let cleanedUp = false;
      const cleanup = async () => {
        if (cleanedUp) {
          return;
        }

        cleanedUp = true;
        try {
          await removeStagingDir(packagePublicRoot, runtime.stagingName);
        } catch (error) {
          console.warn(error instanceof Error ? error.message : error);
        }
      };

      try {
        const entryPoint = path.join(packageRoot, "src", "LyricsRoot.tsx");
        const serveUrl = await bundle({
          entryPoint,
          onProgress: () => undefined,
        });

        const composition = await selectComposition({
          serveUrl,
          id: DEFAULT_LYRICS_COMPOSITION_ID,
          inputProps: runtime.config,
        });

        await renderMedia({
          serveUrl,
          codec: runtime.codecSelection.codec,
          composition,
          inputProps: runtime.config,
          outputLocation: runtime.outputLocation,
          overwrite: true,
          imageFormat:
            runtime.themeIsTransparent && runtime.codecSelection.codec === "prores"
              ? "png"
              : undefined,
          proResProfile: resolveProResProfile(
            runtime.codecSelection,
            runtime.themeIsTransparent,
            options.proresProfile,
          ),
          crf: resolveCrf(runtime.codecSelection.codec, options.crf),
          x264Preset: runtime.codecSelection.codec === "h264" ? "slow" : undefined,
          pixelFormat:
            runtime.themeIsTransparent && runtime.codecSelection.codec === "prores"
              ? "yuva444p10le"
              : undefined,
          onProgress: ({ progress }) => {
            process.stdout.write(`\rRendering ${(progress * 100).toFixed(1)}%`);
          },
        });

        process.stdout.write(`\nRendered ${runtime.outputLocation}\n`);
      } finally {
        await cleanup();
      }
    });

  return program;
}

function buildPreviewProgram() {
  const program = new Command();
  program
    .name("preview")
    .requiredOption("--lyrics <path>", "path to an LRC lyric file")
    .option("--audio <path>", "path to an audio file")
    .option("--background <path>", "path to an image or video background file")
    .option("--theme <path>", "path to a CSS theme file")
    .option("--font <path>", "path to a local font file to embed")
    .option("--fps <fps>", "frames per second", "25")
    .option(
      "--lyrics-start-offset <seconds>",
      "shift all lyric timestamps by this many seconds",
      "0",
    )
    .option("--lyrics-fade-in <seconds>", "fade-in duration for each lyric line", "0.4")
    .option("--lyrics-fade-out <seconds>", "fade-out duration for each lyric line", "0.4")
    .option(
      "--lyrics-fade-out-offset <seconds>",
      "start fading the current line this many seconds before the next line starts",
      "0.5",
    )
    .option("--output <path>", "output file path")
    .action(async function (this: Command) {
      const options = this.opts<PreviewOptions>();
      const cwd = process.cwd();
      const port = defaultPreviewPort;
      ensurePositiveInteger(port, "Port");
      killProcessListeningOnPort(port);

      await Promise.all([removePathIfExists(path.join(packagePublicRoot, ".preview"))]);

      const runtime = await buildRuntimeBundle(cwd, options);
      const previewRoute = runtime.previewRoute;
      const runtimeDir = path.join(packagePublicRoot, ".preview", encodeRoutePath(previewRoute));
      await fsp.mkdir(runtimeDir, { recursive: true });

      const bootstrap: LyricsPreviewBootstrap = {
        config: runtime.config,
      };

      const html = createLyricsPreviewHtml(bootstrap, previewRoute);
      await fsp.writeFile(path.join(runtimeDir, "index.html"), html, "utf8");

      await build({
        entryPoints: [path.join(packageRoot, "src", "preview", "lyrics-index.tsx")],
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

      const server = createServer(runtimeDir, packagePublicRoot, previewRoute);
      let cleanedUp = false;
      const cleanup = async () => {
        if (cleanedUp) {
          return;
        }

        cleanedUp = true;
        await Promise.all([
          removeStagingDir(packagePublicRoot, runtime.stagingName),
          removePathIfExists(runtimeDir),
        ]);
      };

      const shutdown = () => {
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
    });

  return program;
}

function buildThemeProgram() {
  const program = new Command();
  program
    .name("theme")
    .command("init")
    .argument("<cssPath>", "where to save the default theme CSS")
    .action(async (cssPath: string) => {
      await copyDefaultTheme(cssPath);
    });

  return program;
}

async function main() {
  const program = new Command();
  program.addCommand(buildRenderProgram());
  program.addCommand(buildPreviewProgram());
  program.addCommand(buildThemeProgram());

  const [command = "help"] = process.argv.slice(2);
  if (command === "-h" || command === "--help" || command === "help") {
    console.log(
      `
Usage:
  vidtools lyrics render --lyrics path/to/file.lrc --output path/to/output.mov [--audio path/to/file.wav] [options]
  vidtools lyrics preview --lyrics path/to/file.lrc [--output path/to/output.mov] [--audio path/to/file.wav] [options]
  vidtools lyrics theme init <cssPath>

Examples:
  vidtools lyrics render --lyrics path/to/song.lrc --output renders/song-lyrics.mov --audio path/to/song.wav
  vidtools lyrics render --lyrics path/to/song.lrc --output renders/song-lyrics.mov
  vidtools lyrics preview --lyrics path/to/song.lrc [--output renders/song-lyrics.mov] --audio path/to/song.wav
  vidtools lyrics preview --lyrics path/to/song.lrc [--output renders/song-lyrics.mov]
  vidtools lyrics theme init themes/default.css

Run "vidtools lyrics <command> --help" for the command-specific options.
`.trim(),
    );
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
