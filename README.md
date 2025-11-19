# 📸 High-Performance Image Processor

A high-speed Node.js utility designed for batch image conversion (PNG, JPG, HEIC). This script is specifically tuned for the **Intel Core 5 210H** (Series 1) architecture, balancing aggressive parallel encoding with system stability.

 
| Setting             | Value   | Purpose                                                              |
| :------------------ | :------ | :------------------------------------------------------------------- |
| `CONCURRENCY_LIMIT` | `4`     | Launches 4 images simultaneously to match the 4 P-cores.             |
| `sharp.concurrency` | `2`     | Allows each image task to use 2 threads for hyper-threaded encoding. |
| `chromaSubsampling` | `4:2:0` | Standard web compression that reduces file size by ~50%.             |

---

## 🛠 Setup & Installation

1.  **Initialize Project**:

    ```bash
    npm init -y
    npm install sharp
    ```

2.  **Directory Setup**:
    Create a folder named `source/` in the root directory and place your raw images inside.

3.  **Run the Script**:
    ```bash
    node convert.js
    ```

---

## 📄 The Script (`convert.js`)

```javascript
import fs from "fs";
import path from "path";
import sharp from "sharp";
import os from "os";

/**
 * OPTIMIZATION: Core 5 210H Tuning
 * Total Threads: 12 (4P + 4E)
 * We use 4 workers (P-cores) with 2 threads each.
 */
sharp.concurrency(2);
const CONCURRENCY_LIMIT = 4;

const inputDir = "source";
const outputDir = "converted";

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Filter for PNG, JPG, and HEIC
const files = fs
  .readdirSync(inputDir)
  .filter((f) => /\.(png|jpe?g|heic|heif)$/i.test(f));

if (files.length === 0) {
  console.log('❌ No compatible images found in "source" folder.');
  process.exit(1);
}

async function processImage(file) {
  const inputPath = path.join(inputDir, file);
  const baseName = path.parse(file).name;
  const baseOutputPath = path.join(outputDir, baseName);
  const image = sharp(inputPath);

  try {
    // 1. JPG Conversion (Active)
    await image
      .clone()
      .jpeg({
        quality: 40,
        progressive: true,
        chromaSubsampling: "4:2:0",
        mozjpeg: true,
      })
      .toFile(`${baseOutputPath}.jpg`);

    // 2. AVIF Conversion (Commented)
    /*
    await image
      .clone()
      .avif({
        quality: 75,
        effort: 4,
        chromaSubsampling: '4:2:0'
      })
      .toFile(`${baseOutputPath}.avif`);
    */

    // 3. WebP Conversion (Commented)
    /*
    await image
      .clone()
      .webp({
        quality: 80,
        effort: 5
      })
      .toFile(`${baseOutputPath}.webp`);
    */

    console.log(`✅ Converted: ${file}`);
  } catch (err) {
    console.error(`❌ Error processing ${file}: ${err.message}`);
  }
}

async function run() {
  console.log(
    `🚀 CPU: Intel Core 5 210H (${os.cpus().length} threads detected)`
  );
  console.log(`📸 Processing ${files.length} images...`);
  console.time("Total Processing Time");

  const queue = [...files];

  // Create a pool of workers to handle the queue
  const workers = Array(CONCURRENCY_LIMIT)
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        const file = queue.shift();
        if (file) await processImage(file);
      }
    });

  await Promise.all(workers);

  console.log("---");
  console.timeEnd("Total Processing Time");
  console.log("🏁 Task complete.");
}

run();
```
