import { describe, expect, it } from "vitest";
import {
  buildFfmpegArgs,
  outputPathFor,
  qualityCrf,
  savingsPercent,
} from "@/lib/ffmpeg";

describe("ffmpeg arguments", () => {
  it("maps all supported streams and only encodes the primary video", () => {
    const args = buildFfmpegArgs("/media/input.mp4", "/media/temp.mkv", "balanced");
    expect(args).toContain("0:v?");
    expect(args).toContain("0:a?");
    expect(args).toContain("0:s?");
    expect(args).toContain("0:t?");
    expect(args).toContain("libx265");
    expect(args).toContain(String(qualityCrf.balanced));
    expect(args.at(-1)).toBe("/media/temp.mkv");
  });

  it("uses an MKV output path and calculates savings", () => {
    expect(outputPathFor("/media/Movie.avi")).toBe("/media/Movie.mkv");
    expect(savingsPercent(1_000, 750)).toBe(25);
    expect(savingsPercent(0, 10)).toBe(0);
  });
});
