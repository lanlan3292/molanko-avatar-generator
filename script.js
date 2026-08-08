/**
 * script.js — 纹理区域拉伸 + 描边 + 背景色 + 倍率缩放
 * 
 * 功能：
 *   1. 从64×64原图提取多块8×8区域，拼接、翻转生成32×32基础纹理
 *   2. 可选1px/2px向外描边（颜色自定义，默认基于纹理平均色变深）
 *   3. 背景色填充（默认基于纹理平均色变浅）
 *   4. 可提升至48×48（32×32居中）
 *   5. 倍率缩放：1x/5x/10x/20x/50x（最近邻放大）
 *   描边已修复：正确向外扩展，不遗漏，不覆盖实体像素。
 */

// ========== DOM引用 ==========
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const sourcePreviewCanvas = document.getElementById('sourcePreviewCanvas');
const sourcePreviewCtx = sourcePreviewCanvas.getContext('2d');
const resultCanvas = document.getElementById('resultCanvas');
const resultCtx = resultCanvas.getContext('2d');
const downloadBtn = document.getElementById('downloadBtn');

const outlineRadios = document.getElementsByName('outline');
const outlineColorInput = document.getElementById('outlineColor');
const bgColorInput = document.getElementById('bgColor');
const scaleSelect = document.getElementById('scaleSelect');
const upscale48Checkbox = document.getElementById('upscale48');

// ========== 状态 ==========
let base32Canvas = null;          // 原始32×32纹理
let currentResultCanvas = null;   // 当前最终画布（用于下载）

// ========== 工具函数 ==========
function drawStretch(ctx, srcImg, sx, sy, sw, sh, dx, dy, dw, dh, overlayAlpha = 0) {
    ctx.imageSmoothingEnabled = false;
    if (overlayAlpha <= 0) {
        ctx.drawImage(srcImg, sx, sy, sw, sh, dx, dy, dw, dh);
    } else {
        const temp = document.createElement('canvas');
        temp.width = dw; temp.height = dh;
        const tctx = temp.getContext('2d');
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(srcImg, sx, sy, sw, sh, 0, 0, dw, dh);
        tctx.globalCompositeOperation = 'source-atop';
        tctx.fillStyle = `rgba(0,0,0,${overlayAlpha})`;
        tctx.fillRect(0, 0, dw, dh);
        tctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(temp, dx, dy);
    }
}

// 生成基础32×32纹理（与之前一致）
function createBaseTexture(sourceImage) {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const alpha = 76 / 255;

    drawStretch(ctx, sourceImage, 56, 8, 8, 8, 10, 7, 18, 18);
    drawStretch(ctx, sourceImage, 48, 8, 8, 8, 4, 7, 6, 18, alpha);
    drawStretch(ctx, sourceImage, 24, 8, 8, 8, 11, 8, 16, 16);
    drawStretch(ctx, sourceImage, 16, 8, 8, 8, 5, 8, 6, 16, alpha);

    const flipped = document.createElement('canvas');
    flipped.width = 32; flipped.height = 32;
    const fctx = flipped.getContext('2d');
    fctx.imageSmoothingEnabled = false;
    fctx.translate(32, 0); fctx.scale(-1, 1);
    fctx.drawImage(canvas, 0, 0);
    fctx.setTransform(1, 0, 0, 1, 0, 0);

    drawStretch(fctx, sourceImage, 8, 8, 8, 8, 11, 8, 16, 16);
    drawStretch(fctx, sourceImage, 0, 8, 8, 8, 5, 8, 6, 16, alpha);
    drawStretch(fctx, sourceImage, 40, 8, 8, 8, 10, 7, 18, 18);
    drawStretch(fctx, sourceImage, 32, 8, 8, 8, 4, 7, 6, 18, alpha);

    return flipped;
}

// 计算画布非透明像素的平均颜色
function getAverageColor(canvas) {
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) {
            r += data[i]; g += data[i + 1]; b += data[i + 2];
            count++;
        }
    }
    if (count === 0) return { r: 128, g: 128, b: 128 };
    return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
}

// 变深/变浅辅助
function darken(rgb) {
    return { r: Math.round(rgb.r * 0.5), g: Math.round(rgb.g * 0.5), b: Math.round(rgb.b * 0.5) };
}
function lighten(rgb) {
    return { r: Math.min(255, Math.round(rgb.r * 1.5 + 20)), g: Math.min(255, Math.round(rgb.g * 1.5 + 20)), b: Math.min(255, Math.round(rgb.b * 1.5 + 20)) };
}
function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}

/**
 * 描边算法（重写，解决之前的问题）
 * @param {CanvasRenderingContext2D} destCtx - 目标画布上下文（已绘制背景和内容）
 * @param {HTMLCanvasElement} contentCanvas - 基础32×32纹理画布
 * @param {number} offsetX - 内容在目标画布上的起始X
 * @param {number} offsetY - 内容在目标画布上的起始Y
 * @param {number} outlineRadius - 描边扩展像素数
 * @param {string} outlineColorHex - 描边颜色 hex
 */
function applyOutline(destCtx, contentCanvas, offsetX, offsetY, outlineRadius, outlineColorHex) {
    const dw = destCtx.canvas.width, dh = destCtx.canvas.height;
    // 1. 读取当前目标画布像素
    const imgData = destCtx.getImageData(0, 0, dw, dh);
    const pixels = imgData.data;

    // 2. 构建实体像素集合（内容区域内的非透明像素）
    const solidSet = new Set();
    const srcCtx = contentCanvas.getContext('2d');
    const srcData = srcCtx.getImageData(0, 0, contentCanvas.width, contentCanvas.height).data;
    const cw = contentCanvas.width, ch = contentCanvas.height;
    for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
            const alpha = srcData[(y * cw + x) * 4 + 3];
            if (alpha > 0) {
                const gx = x + offsetX;
                const gy = y + offsetY;
                if (gx >= 0 && gx < dw && gy >= 0 && gy < dh) {
                    solidSet.add(gy * dw + gx);
                }
            }
        }
    }

    // 3. 计算描边像素集（距离实体像素切比雪夫距离 <= outlineRadius 且不在 solidSet 中）
    const outlineSet = new Set();
    // 需要检查的范围：实体区域向外扩展 outlineRadius
    const minX = Math.max(0, offsetX - outlineRadius);
    const maxX = Math.min(dw - 1, offsetX + cw - 1 + outlineRadius);
    const minY = Math.max(0, offsetY - outlineRadius);
    const maxY = Math.min(dh - 1, offsetY + ch - 1 + outlineRadius);

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const idx = y * dw + x;
            if (solidSet.has(idx)) continue; // 跳过实体
            // 检查是否存在实体像素距离 <= outlineRadius
            let found = false;
            // 优化：只检查附近的实体（可提前终止）
            for (let dy = -outlineRadius; dy <= outlineRadius && !found; dy++) {
                for (let dx = -outlineRadius; dx <= outlineRadius; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || nx >= dw || ny < 0 || ny >= dh) continue;
                    if (solidSet.has(ny * dw + nx)) {
                        found = true;
                        break;
                    }
                }
            }
            if (found) {
                outlineSet.add(idx);
            }
        }
    }

    // 4. 将描边颜色写入像素（不覆盖实体）
    const [r, g, b] = hexToRgb(outlineColorHex);
    for (const idx of outlineSet) {
        const pixelIdx = idx * 4;
        pixels[pixelIdx] = r;
        pixels[pixelIdx + 1] = g;
        pixels[pixelIdx + 2] = b;
        pixels[pixelIdx + 3] = 255;
    }

    destCtx.putImageData(imgData, 0, 0);
}

/**
 * 构建最终输出画布（不含缩放）
 */
function buildFinalCanvas() {
    if (!base32Canvas) return null;

    const outlineMode = parseInt(document.querySelector('input[name="outline"]:checked').value);
    const outlineColor = outlineColorInput.value;
    const bgColor = bgColorInput.value;
    const upscale48 = upscale48Checkbox.checked;

    let finalWidth, finalHeight, offsetX, offsetY;
    if (upscale48) {
        finalWidth = 48; finalHeight = 48;
        offsetX = 8; offsetY = 8;
    } else {
        const expand = outlineMode * 2;
        finalWidth = 32 + expand;
        finalHeight = 32 + expand;
        offsetX = outlineMode;
        offsetY = outlineMode;
    }

    const canvas = document.createElement('canvas');
    canvas.width = finalWidth;
    canvas.height = finalHeight;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // 填充背景色（如果画布大于内容区域）
    if (finalWidth > 32 || finalHeight > 32) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, finalWidth, finalHeight);
    }

    // 绘制基础32×32纹理
    ctx.drawImage(base32Canvas, offsetX, offsetY);

    // 描边（如果有）
    if (outlineMode > 0) {
        applyOutline(ctx, base32Canvas, offsetX, offsetY, outlineMode, outlineColor);
    }

    return canvas;
}

/**
 * 应用倍率缩放
 */
function applyScale(sourceCanvas, scale) {
    if (scale <= 1) return sourceCanvas;
    const scaled = document.createElement('canvas');
    scaled.width = sourceCanvas.width * scale;
    scaled.height = sourceCanvas.height * scale;
    const sctx = scaled.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(sourceCanvas, 0, 0, scaled.width, scaled.height);
    return scaled;
}

/**
 * 完整渲染：生成最终画布并更新预览
 */
function renderFinal() {
    if (!base32Canvas) return;
    const baseFinal = buildFinalCanvas();
    if (!baseFinal) return;

    const scale = parseInt(scaleSelect.value, 10);
    const scaled = applyScale(baseFinal, scale);
    currentResultCanvas = scaled;

    // 更新预览 canvas 尺寸及内容
    resultCanvas.width = scaled.width;
    resultCanvas.height = scaled.height;
    resultCtx.imageSmoothingEnabled = false;
    resultCtx.clearRect(0, 0, scaled.width, scaled.height);
    resultCtx.drawImage(scaled, 0, 0);

    downloadBtn.disabled = false;
    downloadBtn.textContent = `💾 下载 PNG (${scaled.width}×${scaled.height})`;
}

/**
 * 更新默认颜色（基于基础纹理平均色）
 */
function updateDefaultColors() {
    if (!base32Canvas) return;
    const avg = getAverageColor(base32Canvas);
    const d = darken(avg);
    const l = lighten(avg);
    outlineColorInput.value = rgbToHex(d.r, d.g, d.b);
    bgColorInput.value = rgbToHex(l.r, l.g, l.b);
}

// ========== 预览与主流程 ==========
function drawSourcePreview(sourceImage) {
    sourcePreviewCanvas.width = sourceImage.width;
    sourcePreviewCanvas.height = sourceImage.height;
    sourcePreviewCtx.imageSmoothingEnabled = false;
    sourcePreviewCtx.drawImage(sourceImage, 0, 0);
}

function handleImage(img) {
    if (img.width <= 63 || img.height <= 15) {
        alert(`图片尺寸不足！当前：${img.width}×${img.height}，至少需要64×16`);
        return;
    }
    drawSourcePreview(img);
    base32Canvas = createBaseTexture(img);
    updateDefaultColors();
    renderFinal();
}

// ========== 文件加载与下载 ==========
function loadImageFromFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('请选择一个有效的图片文件。');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => handleImage(img);
        img.onerror = () => alert('无法加载图片，请确认文件格式是否正确。');
        img.src = e.target.result;
    };
    reader.onerror = () => alert('读取文件失败，请重试。');
    reader.readAsDataURL(file);
}

function downloadResult() {
    if (!currentResultCanvas) {
        alert('请先导入图片进行处理。');
        return;
    }
    currentResultCanvas.toBlob((blob) => {
        if (!blob) { alert('生成图片失败。'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `texture_${currentResultCanvas.width}x${currentResultCanvas.height}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 'image/png', 1.0);
}

// ========== 初始化占位 ==========
function initPlaceholders() {
    sourcePreviewCanvas.width = 64;
    sourcePreviewCanvas.height = 64;
    const sctx = sourcePreviewCtx;
    sctx.fillStyle = '#1a1a28';
    sctx.fillRect(0, 0, 64, 64);
    sctx.fillStyle = 'rgba(200,200,220,0.7)';
    sctx.font = '10px sans-serif';
    sctx.textAlign = 'center';
    sctx.fillText('导入图片', 32, 28);
    sctx.fillText('64×64', 32, 42);

    resultCanvas.width = 48;
    resultCanvas.height = 48;
    resultCtx.clearRect(0, 0, 48, 48);
    downloadBtn.disabled = true;
    downloadBtn.textContent = '💾 下载结果PNG（需先导入图片）';
}

// ========== 事件绑定 ==========
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    if (e.target.files?.length) {
        loadImageFromFile(e.target.files[0]);
        fileInput.value = '';
    }
});

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith('image/')) loadImageFromFile(file);
    else alert('请拖放一个有效的图片文件。');
});
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

downloadBtn.addEventListener('click', downloadResult);

// 设置变更监听
for (const radio of outlineRadios) radio.addEventListener('change', renderFinal);
outlineColorInput.addEventListener('input', renderFinal);
bgColorInput.addEventListener('input', renderFinal);
scaleSelect.addEventListener('change', renderFinal);
upscale48Checkbox.addEventListener('change', renderFinal);

// 启动
initPlaceholders();
console.log('✅ 纹理工具已就绪 (描边修复 + 倍率缩放)');