import { describe, it, expect } from "vitest";
import { computeRmsEnergy, mergeFloat32, mixToMono, resampleLinear } from "./audio";

// ---------- mixToMono ----------

describe("mixToMono", () => {
  it("returns the same samples for a single-channel buffer", () => {
    const samples = new Float32Array([0.1, 0.2, 0.3]);
    const ctx = {
      numberOfChannels: 1,
      length: 3,
      getChannelData: () => samples
    } as unknown as AudioBuffer;

    const result = mixToMono(ctx);
    expect(result[0]).toBeCloseTo(0.1);
    expect(result[1]).toBeCloseTo(0.2);
    expect(result[2]).toBeCloseTo(0.3);
  });

  it("averages two channels", () => {
    const ch0 = new Float32Array([1.0, 0.0]);
    const ch1 = new Float32Array([0.0, 1.0]);
    const ctx = {
      numberOfChannels: 2,
      length: 2,
      getChannelData: (i: number) => (i === 0 ? ch0 : ch1)
    } as unknown as AudioBuffer;

    const result = mixToMono(ctx);
    expect(result[0]).toBeCloseTo(0.5);
    expect(result[1]).toBeCloseTo(0.5);
  });
});

// ---------- resampleLinear ----------

describe("resampleLinear", () => {
  it("returns input unchanged when rates are equal", () => {
    const input = new Float32Array([1, 2, 3, 4]);
    const output = resampleLinear(input, 16000, 16000);
    expect(output).toBe(input);
  });

  it("downsamples by 2x correctly", () => {
    // 4 samples at 32 kHz → 2 samples at 16 kHz
    const input = new Float32Array([0, 1, 0, 1]);
    const output = resampleLinear(input, 32000, 16000);
    expect(output.length).toBe(2);
  });

  it("upsamples by 2x and interpolates", () => {
    const input = new Float32Array([0.0, 1.0]);
    const output = resampleLinear(input, 8000, 16000);
    expect(output.length).toBe(4);
    // index=0: sourceIndex=0.0 → 0.0
    expect(output[0]).toBeCloseTo(0.0);
    // index=1: sourceIndex=0.5 → lerp(0,1,0.5) = 0.5
    expect(output[1]).toBeCloseTo(0.5, 1);
    // index=2: sourceIndex=1.0 → left=right=1 → 1.0
    expect(output[2]).toBeCloseTo(1.0);
  });
});

// ---------- computeRmsEnergy ----------

describe("computeRmsEnergy", () => {
  it("returns 0 for empty input", () => {
    expect(computeRmsEnergy(new Float32Array(0))).toBe(0);
  });

  it("returns 0 for all-zero input (silence)", () => {
    expect(computeRmsEnergy(new Float32Array([0, 0, 0, 0]))).toBe(0);
  });

  it("returns 1 for constant +1 signal", () => {
    expect(computeRmsEnergy(new Float32Array([1, 1, 1, 1]))).toBeCloseTo(1.0);
  });

  it("computes RMS correctly for known values", () => {
    // [3, 4] → sqrt((9+16)/2) = sqrt(12.5) ≈ 3.536
    expect(computeRmsEnergy(new Float32Array([3, 4]))).toBeCloseTo(3.536, 2);
  });

  it("returns a low value for near-silence", () => {
    const silence = new Float32Array(1000).fill(0.001);
    expect(computeRmsEnergy(silence)).toBeLessThan(0.003);
  });
});

// ---------- mergeFloat32 ----------

describe("mergeFloat32", () => {
  it("concatenates two arrays", () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([3, 4, 5]);
    const result = mergeFloat32(a, b);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles empty first array", () => {
    const a = new Float32Array([]);
    const b = new Float32Array([1, 2]);
    expect(Array.from(mergeFloat32(a, b))).toEqual([1, 2]);
  });

  it("handles empty second array", () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([]);
    expect(Array.from(mergeFloat32(a, b))).toEqual([1, 2]);
  });
});
