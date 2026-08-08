/**
 * script.js — 纹理区域拉伸 + 描边 + 背景色 + 倍率缩放 + 多自动颜色预设
 * 更新：描边不扩展画布，32×32画布足够；背景填充与画布尺寸解耦
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
const outlinePresetSelect = document.getElementById('outlinePreset');
const bgColorInput = document.getElementById('bgColor');
const bgPresetSelect = document.getElementById('bgPreset');
const scaleSelect = document.getElementById('scaleSelect');
const upscale48Checkbox = document.getElementById('upscale48');
const fillBackgroundCheckbox = document.getElementById('fillBackground');

// ========== 状态 ==========
let base32Canvas = null;
let currentResultCanvas = null;

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

function createBaseTexture(sourceImage) {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const alpha = 76/255;

    drawStretch(ctx, sourceImage, 56,8,8,8, 10,7,18,18);
    drawStretch(ctx, sourceImage, 48,8,8,8, 4,7,6,18, alpha);
    drawStretch(ctx, sourceImage, 24,8,8,8, 11,8,16,16);
    drawStretch(ctx, sourceImage, 16,8,8,8, 5,8,6,16, alpha);

    const flipped = document.createElement('canvas');
    flipped.width = 32; flipped.height = 32;
    const fctx = flipped.getContext('2d');
    fctx.imageSmoothingEnabled = false;
    fctx.translate(32, 0); fctx.scale(-1, 1);
    fctx.drawImage(canvas, 0, 0);
    fctx.setTransform(1,0,0,1,0,0);

    drawStretch(fctx, sourceImage, 8,8,8,8, 11,8,16,16);
    drawStretch(fctx, sourceImage, 0,8,8,8, 5,8,6,16, alpha);
    drawStretch(fctx, sourceImage, 40,8,8,8, 10,7,18,18);
    drawStretch(fctx, sourceImage, 32,8,8,8, 4,7,6,18, alpha);

    return flipped;
}

function getAverageColor(canvas) {
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let r=0,g=0,b=0,count=0;
    for (let i=0; i<data.length; i+=4) {
        if (data[i+3] > 0) {
            r += data[i]; g += data[i+1]; b += data[i+2];
            count++;
        }
    }
    if (count===0) return {r:128,g:128,b:128};
    return {r: Math.round(r/count), g: Math.round(g/count), b: Math.round(b/count)};
}

// 描边自动颜色生成器
const outlineGenerators = {
    auto_dark: (avg) => ({
        r: Math.min(80, Math.round(avg.r * 0.25)),
        g: Math.min(80, Math.round(avg.g * 0.25)),
        b: Math.min(80, Math.round(avg.b * 0.25))
    }),
    auto_darker: (avg) => ({
        r: Math.min(50, Math.round(avg.r * 0.15)),
        g: Math.min(50, Math.round(avg.g * 0.15)),
        b: Math.min(50, Math.round(avg.b * 0.15))
    }),
    auto_medium_dark: (avg) => ({
        r: Math.min(120, Math.round(avg.r * 0.4)),
        g: Math.min(120, Math.round(avg.g * 0.4)),
        b: Math.min(120, Math.round(avg.b * 0.4))
    })
};

// 背景自动颜色生成器
const bgGenerators = {
    auto_light: (avg) => ({
        r: Math.min(230, Math.round(avg.r * 1.2 + 10)),
        g: Math.min(230, Math.round(avg.g * 1.2 + 10)),
        b: Math.min(230, Math.round(avg.b * 1.2 + 10))
    }),
    auto_lighter: (avg) => ({
        r: Math.min(250, Math.round(avg.r * 1.5 + 30)),
        g: Math.min(250, Math.round(avg.g * 1.5 + 30)),
        b: Math.min(250, Math.round(avg.b * 1.5 + 30))
    }),
    auto_medium_light: (avg) => ({
        r: Math.min(200, Math.round(avg.r * 0.9 + 30)),
        g: Math.min(200, Math.round(avg.g * 0.9 + 30)),
        b: Math.min(200, Math.round(avg.b * 0.9 + 30))
    })
};

function rgbToHex(r,g,b) {
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}
function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : [0,0,0];
}

function getCurrentAverage() {
    if (!base32Canvas) return {r:128, g:128, b:128};
    return getAverageColor(base32Canvas);
}

function getOutlineColorFromPreset(presetValue) {
    if (presetValue.startsWith('auto_')) {
        const gen = outlineGenerators[presetValue];
        if (gen) {
            const avg = getCurrentAverage();
            const c = gen(avg);
            return rgbToHex(c.r, c.g, c.b);
        }
        return '#000000';
    }
    return presetValue;
}

function getBgColorFromPreset(presetValue) {
    if (presetValue.startsWith('auto_')) {
        const gen = bgGenerators[presetValue];
        if (gen) {
            const avg = getCurrentAverage();
            const c = gen(avg);
            return rgbToHex(c.r, c.g, c.b);
        }
        return '#ffffff';
    }
    return presetValue;
}

function applyOutlinePreset(value) {
    outlineColorInput.value = getOutlineColorFromPreset(value);
}

function applyBgPreset(value) {
    bgColorInput.value = getBgColorFromPreset(value);
}

function applyOutline(destCtx, contentCanvas, offsetX, offsetY, outlineRadius, outlineColorHex) {
    const dw = destCtx.canvas.width, dh = destCtx.canvas.height;
    const imgData = destCtx.getImageData(0, 0, dw, dh);
    const pixels = imgData.data;

    const solidSet = new Set();
    const srcCtx = contentCanvas.getContext('2d');
    const srcData = srcCtx.getImageData(0, 0, contentCanvas.width, contentCanvas.height).data;
    const cw = contentCanvas.width, ch = contentCanvas.height;
    for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
            if (srcData[(y*cw + x)*4 + 3] > 0) {
                const gx = x + offsetX, gy = y + offsetY;
                if (gx >=0 && gx < dw && gy >=0 && gy < dh) solidSet.add(gy * dw + gx);
            }
        }
    }

    const outlineSet = new Set();
    const minX = Math.max(0, offsetX - outlineRadius);
    const maxX = Math.min(dw - 1, offsetX + cw - 1 + outlineRadius);
    const minY = Math.max(0, offsetY - outlineRadius);
    const maxY = Math.min(dh - 1, offsetY + ch - 1 + outlineRadius);

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const idx = y * dw + x;
            if (solidSet.has(idx)) continue;
            let found = false;
            for (let dy = -outlineRadius; dy <= outlineRadius && !found; dy++) {
                for (let dx = -outlineRadius; dx <= outlineRadius; dx++) {
                    if (dx===0 && dy===0) continue;
                    const nx = x+dx, ny = y+dy;
                    if (nx<0 || nx>=dw || ny<0 || ny>=dh) continue;
                    if (solidSet.has(ny*dw + nx)) { found = true; break; }
                }
            }
            if (found) outlineSet.add(idx);
        }
    }

    const [r,g,b] = hexToRgb(outlineColorHex);
    for (const idx of outlineSet) {
        const pi = idx * 4;
        pixels[pi]=r; pixels[pi+1]=g; pixels[pi+2]=b; pixels[pi+3]=255;
    }
    destCtx.putImageData(imgData, 0, 0);
}

// ★ 核心修改：画布尺寸逻辑
function buildFinalCanvas() {
    if (!base32Canvas) return null;
    const outlineMode = parseInt(document.querySelector('input[name="outline"]:checked').value);
    const outlineColor = outlineColorInput.value;
    const bgColor = bgColorInput.value;
    const upscale48 = upscale48Checkbox.checked;
    const fillBg = fillBackgroundCheckbox.checked;

    let finalWidth, finalHeight, offsetX, offsetY;
    if (upscale48) {
        finalWidth = 48; finalHeight = 48;
        offsetX = 8; offsetY = 8;
    } else {
        // 不提升时，画布固定为32×32，描边直接画在画布上，不扩展分辨率
        finalWidth = 32; finalHeight = 32;
        offsetX = 0; offsetY = 0;
    }

    const canvas = document.createElement('canvas');
    canvas.width = finalWidth;
    canvas.height = finalHeight;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // 仅在画布大于32×32 且 启用了填充背景 时才铺底色
    if (fillBg) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, finalWidth, finalHeight);
    }

    ctx.drawImage(base32Canvas, offsetX, offsetY);
    if (outlineMode > 0) {
        applyOutline(ctx, base32Canvas, offsetX, offsetY, outlineMode, outlineColor);
    }
    return canvas;
}

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

function renderFinal() {
    if (!base32Canvas) return;
    const baseFinal = buildFinalCanvas();
    if (!baseFinal) return;
    const scale = parseInt(scaleSelect.value, 10);
    const scaled = applyScale(baseFinal, scale);
    currentResultCanvas = scaled;

    resultCanvas.width = scaled.width;
    resultCanvas.height = scaled.height;
    resultCtx.imageSmoothingEnabled = false;
    resultCtx.clearRect(0, 0, scaled.width, scaled.height);
    resultCtx.drawImage(scaled, 0, 0);

    downloadBtn.disabled = false;
    downloadBtn.textContent = `💾 下载 PNG (${scaled.width}×${scaled.height})`;
}

// ========== 预设与颜色交互 ==========
outlinePresetSelect.addEventListener('change', (e) => {
    applyOutlinePreset(e.target.value);
    renderFinal();
});
bgPresetSelect.addEventListener('change', (e) => {
    applyBgPreset(e.target.value);
    renderFinal();
});

outlineColorInput.addEventListener('input', renderFinal);
bgColorInput.addEventListener('input', renderFinal);

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

    applyOutlinePreset(outlinePresetSelect.value);
    applyBgPreset(bgPresetSelect.value);
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

// ========== 初始化 ==========
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

    // 初始预览画布尺寸根据默认设置（默认勾选提升至48×48，所以初始为48×48）
    resultCanvas.width = 48;
    resultCanvas.height = 48;
    resultCtx.clearRect(0, 0, 48, 48);
    downloadBtn.disabled = true;
    downloadBtn.textContent = '💾 下载结果PNG（需先导入图片）';
}

// 事件绑定
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
for (const radio of outlineRadios) radio.addEventListener('change', renderFinal);
scaleSelect.addEventListener('change', renderFinal);
upscale48Checkbox.addEventListener('change', renderFinal);
fillBackgroundCheckbox.addEventListener('change', renderFinal);

// 启动
initPlaceholders();
console.log('✅ 纹理工具已就绪（描边不扩展画布，32×32足矣）');