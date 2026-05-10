import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { isSupportedImageFile, sortPathsNaturally } from "./randomize";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "slideshow";
}

export async function listInputImages(dir: string): Promise<string[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listInputImages(fullPath)));
      continue;
    }

    if (entry.isFile() && isSupportedImageFile(fullPath) && fs.statSync(fullPath).isFile()) {
      files.push(fullPath);
    }
  }

  return sortPathsNaturally(files);
}

export async function stageFilesToPublic(
  sourceFiles: string[],
  stagingName: string,
  publicRoot: string,
): Promise<Record<string, string>> {
  const stagingRoot = path.join(publicRoot, "generated", stagingName);
  await fsp.mkdir(stagingRoot, { recursive: true });

  const map: Record<string, string> = {};

  for (const [index, sourceFile] of sourceFiles.entries()) {
    const fileName = `${String(index + 1).padStart(3, "0")}-${path.basename(sourceFile)}`;
    const publicRelative = path.posix.join("generated", stagingName, fileName);
    const publicAbsolute = path.join(publicRoot, publicRelative);
    await fsp.copyFile(sourceFile, publicAbsolute);
    map[sourceFile] = publicRelative;
  }

  return map;
}

export async function stageOptionalAudioToPublic(
  audioPath: string,
  stagingName: string,
  publicRoot: string,
): Promise<string> {
  const resolvedAudio = path.isAbsolute(audioPath) ? audioPath : path.resolve(process.cwd(), audioPath);
  const fileName = `${stagingName}-audio${path.extname(resolvedAudio) || ".wav"}`;
  const publicRelative = path.posix.join("generated", stagingName, fileName);
  const publicAbsolute = path.join(publicRoot, publicRelative);
  await fsp.copyFile(resolvedAudio, publicAbsolute);
  return publicRelative;
}
