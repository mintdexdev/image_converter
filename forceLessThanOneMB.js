import fs from "fs";
import path from "path";
import sharp from "sharp";

// Use 1 thread per image so the 4 concurrent workers don't fight for resources
sharp.concurrency(1);

const inputDir = "source";
const outputDir = "oneMbImages";
const CONCURRENCY_LIMIT = 4;
const MAX_SIZE_BYTES = 900 * 1024; // 900 KB
const HIGHEST_QUALITY = 80;
const DECREMENT = 5; //decrement of

fs.mkdirSync(outputDir, { recursive: true });

let pendingFiles = fs
  .readdirSync(inputDir)
  .filter((f) => /\.(png|jpe?g|heic|heif)$/i.test(f))
  .map((f) => ({
    name: f,
    inputPath: path.join(inputDir, f),
    outputPath: path.join(outputDir, `${path.parse(f).name}.jpg`),
  }));

async function processBatch(files, quality) {
  console.log(
    `\n--- 🏁 Starting Pass: Quality ${quality}% (${files.length} images) ---`
  );

  const queue = [...files];
  const nextPassQueue = [];

  const workers = Array(CONCURRENCY_LIMIT)
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        const fileObj = queue.shift();
        if (!fileObj) continue;

        try {
          // PASS 1 ONLY: If original is already < 900KB, just copy it
          if (quality === HIGHEST_QUALITY) {
            const sourceStats = fs.statSync(fileObj.inputPath);
            if (sourceStats.size < MAX_SIZE_BYTES) {
              // Copy instead of skip, so the output folder is complete
              fs.copyFileSync(fileObj.inputPath, fileObj.outputPath);
              console.log(`⏩ Copying (Already small): ${fileObj.name}`);
              continue;
            }
          }

          // Convert/Compress
          await sharp(fileObj.inputPath)
            .jpeg({
              quality: quality,
              progressive: true,
              chromaSubsampling: "4:2:0",
              mozjpeg: true,
            })
            .toFile(fileObj.outputPath);

          // Validation
          const resultStats = fs.statSync(fileObj.outputPath);
          if (resultStats.size > MAX_SIZE_BYTES) {
            nextPassQueue.push(fileObj); // Push to next pass
          } else {
            console.log(
              `✅ Success: ${fileObj.name} (${(resultStats.size / 1024).toFixed(
                1
              )} KB)`
            );
          }
        } catch (err) {
          console.error(`❌ Error ${fileObj.name}: ${err.message}`);
        }
      }
    });

  await Promise.all(workers);
  return nextPassQueue;
}

async function run() {
  if (pendingFiles.length === 0) {
    console.log("❌ No compatible images found.");
    return;
  }

  console.time("Total Processing Time");

  let currentQuality = HIGHEST_QUALITY;
  let currentQueue = pendingFiles;

  // Pass-by-pass loop
  while (currentQueue.length > 0 && currentQuality >= DECREMENT) {
    currentQueue = await processBatch(currentQueue, currentQuality);

    if (currentQueue.length > 0) {
      currentQuality -= DECREMENT;
      if (currentQuality >= DECREMENT) {
        console.log(
          `\n⚠️ ${currentQueue.length} files still over 900KB. Next pass at ${currentQuality}% quality.`
        );
      }
    }
  }

  console.log("\n" + "=".repeat(30));
  // if an image is still > 900KB even at least DECREMENT quality
  if (currentQueue.length > 0) {
    console.log(
      `⚠️ Completed: ${currentQueue.length} images are still > 900KB (reached 10% quality limit).`
    );
  } else {
    console.log("🏁 All tasks complete! All images are now under 900KB.");
  }
  console.timeEnd("Total Processing Time");
}

run();
