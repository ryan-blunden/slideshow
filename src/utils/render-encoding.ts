import type { NoReactInternals } from "remotion/no-react";

export type RenderCodec = "h264" | "h265" | "prores";
export type ProResProfile = (typeof NoReactInternals.proResProfileOptions)[number];

export type RenderCodecSelection = {
  codec: RenderCodec;
  proResProfile?: ProResProfile;
};

const proResProfileAliases: Record<string, ProResProfile> = {
  "4444-xq": "4444-xq",
  "4444": "4444",
  hq: "hq",
  standard: "standard",
  light: "light",
  lt: "light",
  proxy: "proxy",
};

const defaultCrfMap: Record<RenderCodec, number | null> = {
  h264: 18,
  h265: 23,
  prores: null,
};

const crfRanges: Record<RenderCodec, [number, number]> = {
  h264: [1, 51],
  h265: [0, 51],
  prores: [0, 0],
};

function normalizeCodecLabel(rawCodec: string): string {
  return rawCodec.trim().toLowerCase();
}

function isTransparentColorValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (normalized === "transparent" || normalized === "none") {
    return true;
  }

  const hexMatch = normalized.match(/^#([0-9a-f]{4}|[0-9a-f]{8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    return hex.length === 4 ? hex[3] === "0" : hex.slice(6) === "00";
  }

  const rgbaMatch = normalized.match(/^(rgba?|hsla?)\((.*)\)$/i);
  if (!rgbaMatch) {
    return false;
  }

  const inner = rgbaMatch[2].trim();
  if (inner.includes("/")) {
    const alpha = inner.split("/").at(-1)?.trim();
    return alpha === "0" || alpha === "0%" || alpha === "0.0";
  }

  const parts = inner.split(",").map((part) => part.trim());
  if (parts.length === 4) {
    const alpha = Number(parts[3]);
    return Number.isFinite(alpha) && alpha === 0;
  }

  return false;
}

function isTransparentBackgroundDeclaration(value: string): boolean {
  return isTransparentColorValue(value);
}

export function parseRenderCodec(rawCodec: string): RenderCodecSelection {
  const normalized = normalizeCodecLabel(rawCodec);
  const supportedBaseCodecs = new Set<RenderCodec>(["h264", "h265", "prores"]);

  if (normalized === "mp4") {
    return { codec: "h264" };
  }

  if (normalized === "prores") {
    throw new Error(
      `Unsupported codec "${rawCodec}". Choose a specific ProRes profile such as prores-hq, prores-light, or prores-4444.`,
    );
  }

  if (normalized === "h264" || normalized === "h265") {
    return { codec: normalized };
  }

  if (normalized.startsWith("prores-")) {
    const profile = normalized.slice("prores-".length);
    const resolvedProfile = proResProfileAliases[profile];

    if (!resolvedProfile) {
      throw new Error(
        `Invalid ProRes profile "${rawCodec}". Expected one of: prores, prores-4444-xq, prores-4444, prores-hq, prores-standard, prores-light, prores-proxy.`,
      );
    }

    return { codec: "prores", proResProfile: resolvedProfile };
  }

  if (!supportedBaseCodecs.has(normalized as RenderCodec)) {
    throw new Error(
      `Unsupported codec "${rawCodec}". Expected one of: h264, h265, prores, or prores-<profile>.`,
    );
  }

  return { codec: normalized as RenderCodec };
}

export function isTransparentTheme(themeCss: string): boolean {
  const backgroundDeclarations = [...themeCss.matchAll(/\bbackground(?:-color)?\s*:\s*([^;]+);/gi)];
  if (backgroundDeclarations.length === 0) {
    return true;
  }

  return backgroundDeclarations.every(([, value]) => isTransparentBackgroundDeclaration(value));
}

export function resolveProResProfile(
  selection: RenderCodecSelection,
  themeIsTransparent: boolean,
  explicitProfile?: string,
): ProResProfile | undefined {
  if (themeIsTransparent && selection.codec !== "prores") {
    throw new Error(
      `Transparent lyric themes require a ProRes codec with alpha support. Use prores-4444 or prores-4444-xq.`,
    );
  }

  if (selection.codec !== "prores") {
    return undefined;
  }

  if (explicitProfile) {
    const resolved = proResProfileAliases[explicitProfile.trim().toLowerCase()];
    if (!resolved) {
      throw new Error(
        `Invalid ProRes profile "${explicitProfile}". Expected one of: 4444-xq, 4444, hq, standard, light, proxy.`,
      );
    }

    if (themeIsTransparent && resolved !== "4444" && resolved !== "4444-xq") {
      throw new Error(
        `Transparent lyric themes require a ProRes profile with alpha support. Use prores-4444 or prores-4444-xq.`,
      );
    }

    return resolved;
  }

  if (selection.proResProfile) {
    if (
      themeIsTransparent &&
      selection.proResProfile !== "4444" &&
      selection.proResProfile !== "4444-xq"
    ) {
      throw new Error(
        `Transparent lyric themes require a ProRes profile with alpha support. Use prores-4444 or prores-4444-xq.`,
      );
    }

    return selection.proResProfile;
  }

  return themeIsTransparent ? "4444" : "hq";
}

export function resolveCrf(codec: RenderCodec, rawCrf?: string): number | undefined {
  if (typeof rawCrf === "undefined") {
    const defaultCrf = defaultCrfMap[codec];
    return defaultCrf === null ? undefined : defaultCrf;
  }

  if (codec === "prores") {
    throw new Error('"crf" is not supported for ProRes. Use --prores-profile instead.');
  }

  const crf = Number(rawCrf);
  if (!Number.isFinite(crf)) {
    throw new Error(`CRF must be a number. Got "${rawCrf}".`);
  }

  const [minCrf, maxCrf] = crfRanges[codec];
  if (crf < minCrf || crf > maxCrf) {
    throw new Error(`CRF must be between ${minCrf} and ${maxCrf} for codec ${codec}.`);
  }

  return crf;
}

export function getOutputExtension(codec: RenderCodec): string {
  return codec === "prores" ? ".mov" : ".mp4";
}
