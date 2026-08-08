const { createCanvas, loadImage } = require('canvas');

async function scaleTextureLikeBlockbench(buffer, newWidth, newHeight) {
  const img = await loadImage(buffer);
  const temp = createCanvas(img.width, img.height);
  const tempCtx = temp.getContext('2d');
  tempCtx.drawImage(img, 0, 0);

  const canvas = createCanvas(newWidth, newHeight);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(temp, 0, 0, newWidth, newHeight);

  return canvas.toBuffer('image/png');
}