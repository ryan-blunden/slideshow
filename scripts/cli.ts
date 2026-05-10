import path from "node:path";
import { spawnSync } from "node:child_process";
import { packageRoot, packageTsxBin } from "./runtime-paths";

type SlideCommandName = "render" | "preview" | "smoke";

const cwd = process.cwd();
const scriptDir = path.join(packageRoot, "scripts");
const legacySlideCommands = new Set<SlideCommandName>(["render", "preview", "smoke"]);

const slideCommandScripts: Record<SlideCommandName, string> = {
  render: "render.ts",
  preview: "preview.ts",
  smoke: "smoke.ts",
};

function printHelp() {
  console.log(`
Usage:
  vidtools slides render [inputDir] [options]
  vidtools slides preview [inputDir] [options]
  vidtools slides smoke [options]
  vidtools lyrics

Examples:
  vidtools slides render --input assets/photos --output renders/demo.mov
  vidtools slides preview --input /media/test --port 3000
  vidtools slides smoke
  vidtools lyrics

Legacy aliases:
  slideshow render ...
  slideshow preview ...
  slideshow smoke ...
  slideshow lyrics

Run "vidtools <command> --help" for the command-specific options.
`.trim());
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
  console.log("hello world");
} else if (legacySlideCommands.has(command as SlideCommandName)) {
  runSlidesCommand(command as SlideCommandName, args);
} else {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}
