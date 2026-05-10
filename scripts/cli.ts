import { spawnSync } from "node:child_process";
import path from "node:path";
import { packageRoot, packageTsxBin } from "./runtime-paths";

type SlideCommandName = "render" | "preview" | "smoke" | "analyze" | "smart-crop";
type LyricCommandName = "render" | "preview" | "theme";

const scriptDir = path.join(packageRoot, "scripts");
const legacySlideCommands = new Set<SlideCommandName>([
  "render",
  "preview",
  "smoke",
  "analyze",
  "smart-crop",
]);
const lyricCommands = new Set<LyricCommandName>(["render", "preview", "theme"]);

const slideCommandScripts: Record<SlideCommandName, string> = {
  render: "render.ts",
  preview: "preview.ts",
  smoke: "smoke.ts",
  analyze: "analyze.ts",
  "smart-crop": "smart-crop.ts",
};

const lyricCommandScripts: Record<LyricCommandName, string> = {
  render: "lyrics.ts",
  preview: "lyrics.ts",
  theme: "lyrics.ts",
};

function printHelp() {
  console.log(
    `
Usage:
  vidtools slides render [inputDir] [options]
  vidtools slides preview [inputDir] [options]
  vidtools slides smoke [options]
  vidtools slides analyze [inputDir]
  vidtools slides smart-crop [inputDir] [options]
  vidtools lyrics render --lyrics path/to/file.lrc --output path/to/output.mov [--audio path/to/file.wav] [--background path/to/image-or-video] [options]
  vidtools lyrics preview --lyrics path/to/file.lrc [--output path/to/output.mov] [--audio path/to/file.wav] [--background path/to/image-or-video] [options]
  vidtools lyrics theme init <outputPath>

Examples:
  vidtools slides render --input public/assets/photos --output renders/demo.mov
  vidtools slides preview --input /media/test --port 3000
  vidtools slides smoke
  vidtools slides analyze --input public/assets/photos
  vidtools slides smart-crop --input public/assets/photos
  vidtools slides smart-crop --input public/assets/photos --variant top
  vidtools lyrics render --lyrics path/to/lyrics.lrc --output renders/lyrics.mov --audio path/to/song.wav --background path/to/background.jpg
  vidtools lyrics render --lyrics path/to/lyrics.lrc --output renders/lyrics.mov
  vidtools lyrics preview --lyrics path/to/lyrics.lrc [--output renders/lyrics.mov] --audio path/to/song.wav --background path/to/background.mp4
  vidtools lyrics preview --lyrics path/to/lyrics.lrc [--output renders/lyrics.mov]
  vidtools lyrics theme init themes/default.css

Run "vidtools slides render --help" or "vidtools lyrics render --help" for the command-specific options.
`.trim(),
  );
}

function runScript(scriptName: string, args: string[]) {
  const result = spawnSync(packageTsxBin, [path.join(scriptDir, scriptName), ...args], {
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

function runSlidesCommand(command: SlideCommandName, args: string[]) {
  runScript(slideCommandScripts[command], args);
}

function runLyricsCommand(command: LyricCommandName, args: string[]) {
  runScript(lyricCommandScripts[command], [command, ...args]);
}

const [command = "help", ...args] = process.argv.slice(2);

if (command === "-h" || command === "--help" || command === "help") {
  printHelp();
} else if (command === "slides") {
  const [slideCommand = "help", ...slideArgs] = args;
  if (slideCommand === "-h" || slideCommand === "--help" || slideCommand === "help") {
    printHelp();
  } else if (legacySlideCommands.has(slideCommand as SlideCommandName)) {
    runSlidesCommand(slideCommand as SlideCommandName, slideArgs);
  } else {
    console.error(`Unknown slides command: ${slideCommand}`);
    printHelp();
    process.exit(1);
  }
} else if (command === "lyrics") {
  const [lyricCommand = "help", ...lyricArgs] = args;
  if (lyricCommand === "-h" || lyricCommand === "--help" || lyricCommand === "help") {
    runScript("lyrics.ts", ["--help"]);
  } else if (lyricCommands.has(lyricCommand as LyricCommandName)) {
    runLyricsCommand(lyricCommand as LyricCommandName, lyricArgs);
  } else {
    console.error(`Unknown lyrics command: ${lyricCommand}`);
    printHelp();
    process.exit(1);
  }
} else if (legacySlideCommands.has(command as SlideCommandName)) {
  runSlidesCommand(command as SlideCommandName, args);
} else {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}
