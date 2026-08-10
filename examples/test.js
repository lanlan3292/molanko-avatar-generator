import fs from "node:fs";
import path from "node:path";
import {
    processTextureFile
} from "molanko-avatar-generator/node";

// 读取图片 Buffer 传给函数
const imageBuffer = fs.readFileSync(path.resolve("./examples/example.png"));

const canvas = await processTextureFile(
    imageBuffer,
    {
        scale: 10,
        outlineMode: 2,
        outlineColor: "auto_dark",
        bgColor: "auto_light",
        fillBackground: true,
        upscale48: true
    }
);

fs.writeFileSync(
    "./examples/example_output.png",
    canvas.toBuffer("image/png")
);

console.log("生成完成");