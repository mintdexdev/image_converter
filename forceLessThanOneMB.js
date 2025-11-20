import fs from "fs";
import path from "path";
import sharp from "sharp";

sharp.concurrency(1);

const inputDir = "source";
const outputDir = "oneMbImages";
const CONCURRENCY_LIMIT = 4;
const MAX_SIZE_BYTES = 900 * 1024; // 900 KB

fs.mkdirSync(outputDir, { recursive: true });

let pendingFiles = fs
  .readdirSync(inputDir)
  .filter((f) => /\.(png|jpe?g|heic|heif)$/i.test(f))
  .map(f => ({
    name: f,
    inputPath: path.join(inputDir, f),
    outputPath: path.join(outputDir, `${path.parse(f).name}.jpg`)
  }));

async function processBatch(files, quality) {
  console.log(`\n--- 🏁 Starting Pass: Quality ${quality}% ---`);
  
  const queue = [...files];
  const nextPassQueue = [];

  const workers = Array(CONCURRENCY_LIMIT).fill(null).map(async () => {
    while (queue.length > 0) {
      const fileObj = queue.shift();
      
      try {
        // Initial check: if source is already small, skip entirely
        const sourceStats = fs.statSync(fileObj.inputPath);
        if (sourceStats.size < MAX_SIZE_BYTES && quality === 100) {
          console.log(`⏩ Skip (Under 900KB): ${fileObj.name}`);
          continue;
        }

        // Perform compression
        await sharp(fileObj.inputPath)
          .jpeg({
            quality: quality,
            progressive: true,
            chromaSubsampling: "4:2:0",
            mozjpeg: true,
          })
          .toFile(fileObj.outputPath);

        // Check result
        const resultStats = fs.statSync(fileObj.outputPath);
        if (resultStats.size > MAX_SIZE_BYTES) {
          nextPassQueue.push(fileObj); // Still too big, send to next pass
        } else {
          console.log(`✅ Success: ${fileObj.name} (${(resultStats.size / 1024).toFixed(1)} KB)`);
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
  
  let currentQuality = 100;
  let currentQueue = pendingFiles;

  // Loop pass by pass
  while (currentQueue.length > 0 && currentQuality >= 10) {
    currentQueue = await processBatch(currentQueue, currentQuality);
    
    if (currentQueue.length > 0) {
      currentQuality -= 10;
      console.log(`\n⚠️ ${currentQueue.length} images still over 900KB. Dropping quality to ${currentQuality}%...`);
    }
  }

  console.log("\n---");
  if (currentQueue.length > 0) {
    console.log(`⚠️ Completed, but ${currentQueue.length} images remained over 900KB at minimum quality.`);
  } else {
    console.log("🏁 All tasks complete. All images under 900KB.");
  }
  console.timeEnd("Total Processing Time");
}

run();