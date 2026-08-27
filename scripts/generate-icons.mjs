import sharp from "sharp";

const src = "public/icons/icon.svg";
await sharp(src).resize(192, 192).png().toFile("public/icons/icon-192.png");
await sharp(src).resize(512, 512).png().toFile("public/icons/icon-512.png");
await sharp(src).resize(512, 512).png().toFile("public/icons/icon-maskable-512.png");
console.log("icons generated");
