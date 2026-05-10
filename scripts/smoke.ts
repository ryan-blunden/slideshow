import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildAutoConfig } from "../src/utils/randomize";
import { getRuntimeDurationFrames } from "../src/utils/runtime-config";
import { listInputImages, slugify } from "../src/utils/slideshow-files";
import { packageVidtoolsBin } from "./runtime-paths";

type Case = {
  name: string;
  motion: number;
  zoom: number;
  input: string;
};

const cwd = process.cwd();
const outputDir = path.join(cwd, "renders", "smoke-tests");
const cases: Case[] = [
  { name: "no-pan", motion: 0, zoom: 8, input: "assets/photos" },
  { name: "balanced", motion: 6, zoom: 8, input: "assets/photos" },
  { name: "subtle", motion: 3, zoom: 4, input: "assets/photos" },
  { name: "cinematic", motion: 8, zoom: 10, input: "assets/photos" },
  { name: "motion-heavy", motion: 9, zoom: 5, input: "assets/photos" },
  { name: "zoom-heavy", motion: 4, zoom: 10, input: "assets/photos" },
];

fs.mkdirSync(outputDir, { recursive: true });

let failures = 0;
let ffprobeAvailable = false;

const ffprobeCheck = spawnSync("ffprobe", ["-version"], {
  cwd,
  env: process.env,
  stdio: "ignore",
});

if (ffprobeCheck.status === 0) {
  ffprobeAvailable = true;
} else {
  console.warn("ffprobe was not found. Smoke runs will skip duration verification.");
}

async function getExpectedDurationSeconds(input: string, duration: number, crossFade: number) {
  const files = await listInputImages(path.resolve(cwd, input));
  const config = buildAutoConfig({
    inputFiles: files,
    width: 640,
    height: 360,
    fps: 12,
    durationSeconds: duration,
    crossfadeSeconds: crossFade,
    output: "renders/smoke.mp4",
    compositionId: `${slugify(path.basename(input))}-slideshow`,
    backgroundColor: "#000000",
    motionPercent: 0,
    zoomPercent: 0,
  });

  return getRuntimeDurationFrames(config) / config.fps;
}

function getRenderedDurationSeconds(filePath: string): number {
  const result = spawnSync(
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
      cwd,
      env: process.env,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    throw new Error(`ffprobe failed for ${filePath}: ${result.stderr || "unknown error"}`);
  }

  const duration = Number(String(result.stdout).trim());
  if (!Number.isFinite(duration)) {
    throw new Error(`Could not read duration from ${filePath}`);
  }

  return duration;
}

async function main() {
  for (const testCase of cases) {
    const output = path.join(outputDir, `${testCase.name}.mp4`);
    console.log(`Running smoke case: ${testCase.name}`);

    const result = spawnSync(
      packageVidtoolsBin,
      [
        "slides",
        "render",
        testCase.input,
        "--output",
        output,
        "--codec",
        "mp4",
        "--duration",
        "0.5",
        "--cross-fade",
        "0.1",
        "--motion",
        String(testCase.motion),
        "--zoom",
        String(testCase.zoom),
        "--width",
        "640",
        "--height",
        "360",
        "--fps",
        "12",
      ],
      {
        stdio: "inherit",
        cwd,
        env: process.env,
      },
    );

    if (result.status !== 0) {
      failures += 1;
      continue;
    }

    if (ffprobeAvailable) {
      const expectedSeconds = await getExpectedDurationSeconds(testCase.input, 0.5, 0.1);
      const actualSeconds = getRenderedDurationSeconds(output);
      const delta = Math.abs(actualSeconds - expectedSeconds);
      if (delta > 0.15) {
        console.error(
          `Duration mismatch for ${testCase.name}: expected about ${expectedSeconds.toFixed(3)}s, got ${actualSeconds.toFixed(3)}s`,
        );
        failures += 1;
      }
    }
  }

  if (failures > 0) {
    throw new Error(`${failures} smoke case(s) failed.`);
  }

  console.log(`Smoke renders completed in ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
