import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import sharp from "sharp";
import os from "os";

/**
 * GLOBAL CONFIGURATION
 */
const CONFIG = {
  inputDir: "source",
  outputDir: "limitedSizeOutput",
  maxSizeBytes: 900 * 1024, // 900 KB

  concurrencyLimit: Math.max(2, Math.floor(os.cpus().length * 0.75)),

  maxQuality: 90,
  minQuality: 10,
  stepGap: 5,

  probeQuality: 80,

  mozjpeg: true,
  trellis: true,
  progressive: true,
  chromaSubsampling: "4:2:0",

  debug: true,
};

/**
 * SHARP HARDWARE SETUP
 */
sharp.concurrency(1); // one thread per image
sharp.simd(true);
sharp.cache(false);

/**
 * IMAGE PROCESSOR
 */
async function processImage(file) {
  const inputPath = path.join(CONFIG.inputDir, file);
  const outputPath = path.join(
    CONFIG.outputDir,
    `${path.parse(file).name}.jpg`
  );

  try {
    const stats = await fs.stat(inputPath);

    // Fast-path: already small JPG
    if (
      stats.size <= CONFIG.maxSizeBytes &&
      path.extname(file).toLowerCase() === ".jpg"
    ) {
      await fs.copyFile(inputPath, outputPath);
      return "copied";
    }

    // Load once
    const inputBuffer = await fs.readFile(inputPath);

    // Normalize once (orientation, metadata)
    const base = sharp(inputBuffer).rotate();

    /**
     * PROBE PASS (skip binary search if possible)
     */
    const probeBuffer = await base
      .clone()
      .jpeg({
        quality: CONFIG.probeQuality,
        progressive: CONFIG.progressive,
        mozjpeg: CONFIG.mozjpeg,
        trellisQuantisation: CONFIG.trellis,
        overshootDequantisation: true,
        chromaSubsampling: CONFIG.chromaSubsampling,
      })
      .toBuffer();

    if (probeBuffer.length <= CONFIG.maxSizeBytes) {
      await fs.writeFile(outputPath, probeBuffer);
      return "compressed";
    }

    /**
     * BINARY SEARCH
     */
    let low = CONFIG.minQuality;
    let high = CONFIG.maxQuality;

    let bestUnder = null;
    let bestOver = null;
    let finalQuality = low;

    while (low <= high) {
      if (high - low < CONFIG.stepGap) break;

      const mid = Math.floor((low + high) / 2);

      const buffer = await base
        .clone()
        .jpeg({
          quality: mid,
          progressive: CONFIG.progressive,
          mozjpeg: CONFIG.mozjpeg,
          trellisQuantisation: CONFIG.trellis,
          overshootDequantisation: true,
          chromaSubsampling: CONFIG.chromaSubsampling,
        })
        .toBuffer();

      if (buffer.length <= CONFIG.maxSizeBytes) {
        bestUnder = buffer;
        finalQuality = mid;
        low = mid + 1;
      } else {
        if (!bestOver || buffer.length < bestOver.length) {
          bestOver = buffer;
          finalQuality = mid;
        }
        high = mid - 1;
      }
    }

    const finalBuffer = bestUnder ?? bestOver;

    if (!finalBuffer) {
      throw new Error("Compression failed");
    }

    if (CONFIG.debug) {
      console.log(
        `DEBUG: ${file} → ${(finalBuffer.length / 1024).toFixed(
          2
        )} KB @ ${finalQuality}%`
      );
    }

    await fs.writeFile(outputPath, finalBuffer);
    return "compressed";
  } catch (err) {
    console.error(`❌ Error [${file}]: ${err.message}`);
    return "error";
  }
}

/**
 * WORKER POOL RUNNER
 */
async function run() {
  if (!existsSync(CONFIG.outputDir)) {
    await fs.mkdir(CONFIG.outputDir, { recursive: true });
  }

  const allFiles = await fs.readdir(CONFIG.inputDir);
  const files = allFiles.filter((f) =>
    /\.(png|jpe?g|heic|heif|webp)$/i.test(f)
  );

  if (!files.length) {
    console.log("❌ No images found.");
    return;
  }

  console.log(
    `🚀 Processing ${files.length} images with ${CONFIG.concurrencyLimit} workers`
  );
  console.time("Total Processing Time");

  const results = { copied: 0, compressed: 0, error: 0 };

  const worker = async () => {
    while (files.length) {
      const file = files.shift();
      if (!file) continue;
      const status = await processImage(file);
      results[status]++;
    }
  };

  await Promise.all(Array.from({ length: CONFIG.concurrencyLimit }, worker));

  console.timeEnd("Total Processing Time");
  console.log(
    `🏁 Done → Success: ${results.compressed + results.copied}, Errors: ${
      results.error
    }`
  );
}

run();
