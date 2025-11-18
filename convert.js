import fs from "fs";
import path from "path";
import sharp from "sharp";

// Optimization: Tell sharp to use 1 thread per image
// so that our parallel loop can manage the 4 cores efficiently.
sharp.concurrency(1);

const inputDir = "source";
const outputDir = "converted";
const CONCURRENCY_LIMIT = 4;

// Ensure output directory exists
fs.mkdirSync(outputDir, { recursive: true });

const files = fs
  .readdirSync(inputDir)
  .filter((f) => /\.(png|jpe?g|heic|heif)$/i.test(f));

if (files.length === 0) {
  console.log("❌ No PNG, JPG, or HEIC images found.");
  process.exit(1);
}

async function processImage(file) {
  const inputPath = path.join(inputDir, file);
  const baseName = path.parse(file).name;
  const baseOutputPath = path.join(outputDir, baseName);
  const image = sharp(inputPath);

  try {
    // Convert to JPG (using mozjpeg-like options)
    await image
      .clone()
      .jpeg({
        quality: 40,
        progressive: true,
        chromaSubsampling: "4:2:0",
        mozjpeg: true,
      })
      .toFile(`${baseOutputPath}.jpg`);

    // Convert to AVIF
    // await image
    //   .clone()
    //   .avif({
    //     quality: 75,       // Lower number = smaller file, still sharp
    //     effort: 4,         // Speed-size tradeoff
    //     chromaSubsampling: '4:2:0'
    //   })
    //   .toFile(`${baseOutputPath}.avif`);

    // Convert to WebP
    // await image
    //   .clone()
    //   .webp({
    //     quality: 80,
    //     effort: 5 // 4–6 is a sweet spot between speed and size
    //   })
    //   .toFile(`${baseOutputPath}.webp`);

    console.log(`✅ Converted: ${file}`);
  } catch (err) {
    console.error(`❌ Failed to process ${file}: ${err.message}`);
  }
}

// Parallel Processing Logic
async function run() {
  console.log(`🚀 Starting conversion of ${files.length} images...`);
  console.time("Total Processing Time"); // Start Timer

  const queue = [...files];
  const workers = Array(CONCURRENCY_LIMIT)
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        const file = queue.shift();
        await processImage(file);
      }
    });

  await Promise.all(workers);

  console.log("---");
  console.log("🏁 All tasks complete.");
  console.timeEnd("Total Processing Time"); // End Timer and log duration
}

run();
