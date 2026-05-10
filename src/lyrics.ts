import fs from "node:fs/promises";

export type ParsedLyricLine = {
  startMs: number;
  text: string;
};

export type RuntimeLyricLine = {
  startFrame: number;
  text: string;
  nextStartFrame?: number;
};

export type LyricsConfig = {
  lines: RuntimeLyricLine[];
  startOffsetFrames: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  fadeOutOffsetFrames: number;
};

export function getLyricsDurationFrames(config: LyricsConfig): number {
  if (config.lines.length === 0) {
    return 0;
  }

  const lastLine = config.lines[config.lines.length - 1];
  return Math.max(lastLine.startFrame + config.fadeOutFrames, lastLine.startFrame + 1);
}

function parseTimestampToMs(minutePart: string, secondPart: string, fractionPart?: string): number {
  const minutes = Number(minutePart);
  const seconds = Number(secondPart);
  const fraction = fractionPart ?? "";
  const millis = fraction.length === 0 ? 0 : Number(fraction.padEnd(3, "0").slice(0, 3));

  if (
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    !Number.isFinite(millis) ||
    seconds >= 60
  ) {
    throw new Error(
      `Invalid LRC timestamp: [${minutePart}:${secondPart}${fraction ? `.${fraction}` : ""}]`,
    );
  }

  return minutes * 60_000 + seconds * 1_000 + millis;
}

function msToFrames(milliseconds: number, fps: number): number {
  return Math.round((milliseconds * fps) / 1_000);
}

function parseTimestampPrefix(line: string): { timestamps: number[]; rest: string } {
  const timestamps: number[] = [];
  let rest = line;

  while (true) {
    const match = rest.match(/^\[(\d+):(\d{2})(?:\.(\d{1,3}))?\]/);
    if (!match) {
      break;
    }

    timestamps.push(parseTimestampToMs(match[1], match[2], match[3]));
    rest = rest.slice(match[0].length);
  }

  return { timestamps, rest };
}

export async function readLyricsFile(filePath: string): Promise<ParsedLyricLine[]> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed: ParsedLyricLine[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    const { timestamps, rest } = parseTimestampPrefix(line);
    const text = rest.trim();
    if (timestamps.length === 0 || text.length === 0) {
      continue;
    }

    for (const startMs of timestamps) {
      parsed.push({
        startMs,
        text,
      });
    }
  }

  parsed.sort((left, right) => left.startMs - right.startMs);

  if (parsed.length === 0) {
    throw new Error(`No lyric timestamps were found in ${filePath}`);
  }

  return parsed;
}

export function buildLyricsConfig(
  lines: ParsedLyricLine[],
  fps: number,
  options: {
    startOffsetSeconds?: number;
    fadeInSeconds?: number;
    fadeOutSeconds?: number;
    fadeOutOffsetSeconds?: number;
  } = {},
): LyricsConfig {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error("FPS must be a positive number.");
  }

  const startOffsetMs = Math.round((options.startOffsetSeconds ?? 0) * 1_000);
  const fadeInFrames = Math.max(0, Math.round((options.fadeInSeconds ?? 0.4) * fps));
  const fadeOutFrames = Math.max(0, Math.round((options.fadeOutSeconds ?? 0.4) * fps));
  const fadeOutOffsetFrames = Math.max(0, Math.round((options.fadeOutOffsetSeconds ?? 0.5) * fps));

  const runtimeLines = lines
    .map((line) => ({
      startFrame: Math.max(0, msToFrames(line.startMs + startOffsetMs, fps)),
      text: line.text,
    }))
    .sort((left, right) => left.startFrame - right.startFrame);

  const linkedLines: RuntimeLyricLine[] = runtimeLines.map((line, index) => ({
    ...line,
    nextStartFrame: runtimeLines[index + 1]?.startFrame,
  }));

  return {
    lines: linkedLines,
    startOffsetFrames: Math.max(0, msToFrames(startOffsetMs, fps)),
    fadeInFrames,
    fadeOutFrames,
    fadeOutOffsetFrames,
  };
}
