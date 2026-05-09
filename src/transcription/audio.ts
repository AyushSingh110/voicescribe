export async function blobToMonoFloat32(blob: Blob, targetSampleRate = 16000): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
  const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  const mono = mixToMono(decoded);
  const resampled = resampleLinear(mono, decoded.sampleRate, targetSampleRate);
  await audioContext.close();
  return resampled;
}

export function mixToMono(audioBuffer: AudioBuffer): Float32Array {
  const channels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mono = new Float32Array(length);

  for (let channel = 0; channel < channels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      mono[index] += data[index] / channels;
    }
  }

  return mono;
}

export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) {
    return input;
  }

  const ratio = fromRate / toRate;
  const length = Math.round(input.length / ratio);
  const output = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    const sourceIndex = index * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, input.length - 1);
    const weight = sourceIndex - left;
    output[index] = input[left] * (1 - weight) + input[right] * weight;
  }

  return output;
}

/** Root-mean-square energy of an audio buffer. Returns 0 for empty input. */
export function computeRmsEnergy(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

/** Concatenate two Float32Arrays into one. */
export function mergeFloat32(a: Float32Array, b: Float32Array): Float32Array {
  const merged = new Float32Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
}
