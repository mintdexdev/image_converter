import fs from "fs";
import path from "path";
import sharp from "sharp";

sharp.concurrency(1);

const inputDir = "source";
const outputDir = "limitedSizeOutput";
const CONCURRENCY_LIMIT = 4;
const MAX_SIZE_BYTES = 900 * 1024; // 900 KB
const HIGHEST_QUALITY = 90;
const DECREMENT = 10;

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
    `\n--- Pass: Quality ${quality}% | Processing ${files.length} images ---`
  );

  const queue = [...files];
  const nextPassQueue = [];
  let completedInThisPass = 0;

  const workers = Array(CONCURRENCY_LIMIT)
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        const fileObj = queue.shift();
        if (!fileObj) continue;

        try {
          // PASS 1: Copy if already small enough
          if (quality === HIGHEST_QUALITY) {
            const sourceStats = fs.statSync(fileObj.inputPath);
            if (sourceStats.size < MAX_SIZE_BYTES) {
              fs.copyFileSync(fileObj.inputPath, fileObj.outputPath);
              completedInThisPass++;
              continue;
            }
          }

          await sharp(fileObj.inputPath)
            .jpeg({
              quality: quality,
              progressive: true,
              chromaSubsampling: "4:2:0",
              mozjpeg: true,
            })
            .toFile(fileObj.outputPath);

          const resultStats = fs.statSync(fileObj.outputPath);
          if (resultStats.size > MAX_SIZE_BYTES) {
            nextPassQueue.push(fileObj);
          } else {
            completedInThisPass++;
          }
        } catch (err) {
          console.error(`❌ Error ${fileObj.name}: ${err.message}`);
        }
      }
    });

  await Promise.all(workers);

  console.log(`Summary: ${completedInThisPass} files optimized below 900KB.`);
  return nextPassQueue;
}

async function run() {
  const totalFiles = pendingFiles.length;
  if (totalFiles === 0) {
    console.log("❌ No compatible images found.");
    return;
  }

  console.time("Total Processing Time");

  let currentQuality = HIGHEST_QUALITY;
  let currentQueue = pendingFiles;

  while (currentQueue.length > 0 && currentQuality >= 10) {
    currentQueue = await processBatch(currentQueue, currentQuality);

    if (currentQueue.length > 0) {
      const totalDone = totalFiles - currentQueue.length;
      console.log(
        `Progress: ${totalDone}/${totalFiles} total files are now within limits.`
      );

      currentQuality -= DECREMENT;
      if (currentQuality >= 10) {
        console.log(
          `Remaning ${currentQueue.length} files still too large. Retrying with ${currentQuality}% quality...`
        );
      }
    }
  }

  console.log("\n" + "=".repeat(40));
  if (currentQueue.length > 0) {
    console.log(
      `⚠️ Finished: ${currentQueue.length} images exceeded 900KB even at 10% quality.`
    );
    console.log(
      `✅ Success: ${
        totalFiles - currentQueue.length
      } images are ready in '${outputDir}'`
    );
  } else {
    console.log(`🏁 Success: All ${totalFiles} images are now under 900KB!`);
  }
  console.timeEnd("Total Processing Time");
}

run();
