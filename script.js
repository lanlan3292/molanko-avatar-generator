/**
 * script.js — 纹理区域拉伸处理脚本
 * 
 * 功能：
 *   从64×64的原图中裁剪 (56,8)-(63,15) 的 8×8 区域，
 *   使用最近邻插值（imageSmoothingEnabled=false）拉伸到
 *   32×32 结果画布的 (10,7)-(27,24) 的 18×18 区域。
 * 
 * 类似Blockbench的纹理缩放方式 —— 保持像素锐利边缘。
 */

// ============================================================
// 配置常量 —— 可根据需要修改
// ============================================================

/** 源裁剪区域（在原图64×64中的坐标，包含起点和终点） */
const SRC_X1 = 56;
const SRC_Y1 = 8;
const SRC_X2 = 63;
const SRC_Y2 = 15;
// 派生：裁剪区域宽高
const SRC_W = SRC_X2 - SRC_X1 + 1; // 8
const SRC_H = SRC_Y2 - SRC_Y1 + 1; // 8

/** 目标区域（在32×32结果画布中的坐标，包含起点和终点） */
const DST_X1 = 10;
const DST_Y1 = 7;
const DST_X2 = 27;
const DST_Y2 = 24;
// 派生：目标区域宽高
const DST_W = DST_X2 - DST_X1 + 1; // 18
const DST_H = DST_Y2 - DST_Y1 + 1; // 18

/** 结果画布尺寸 */
const RESULT_WIDTH = 32;
const RESULT_HEIGHT = 32;

/** 期望的原图尺寸（用于验证提示） */
const EXPECTED_SRC_WIDTH = 64;
const EXPECTED_SRC_HEIGHT = 64;

// ============================================================
// DOM元素引用
// ============================================================

const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const sourcePreviewCanvas = document.getElementById('sourcePreviewCanvas');
const sourcePreviewCtx = sourcePreviewCanvas.getContext('2d');
const resultCanvas = document.getElementById('resultCanvas');
const resultCtx = resultCanvas.getContext('2d');
const downloadBtn = document.getElementById('downloadBtn');
const targetOverlay = document.getElementById('targetOverlay');

// ============================================================
// 状态
// ============================================================

/** 存储处理后的干净结果画布（32×32），用于下载 */
let cleanResultCanvas = null;

/** 当前加载的原图Image对象 */
let loadedSourceImage = null;

// ============================================================
// 核心处理函数
// ============================================================

/**
 * 处理图片：裁剪 + 拉伸 + 放置到32×32画布
 * 类似Blockbench的纹理缩放方式（最近邻插值）
 * 
 * @param {HTMLImageElement} sourceImage - 已加载的原图
 * @returns {HTMLCanvasElement} 32×32的结果画布
 */
function processTexture(sourceImage) {
    // 1. 按原有逻辑绘制到临时画布（裁剪 + 拉伸）
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = RESULT_WIDTH;
    tempCanvas.height = RESULT_HEIGHT;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.imageSmoothingEnabled = false;
    tempCtx.drawImage(
        sourceImage,
        SRC_X1, SRC_Y1, SRC_W, SRC_H,
        DST_X1, DST_Y1, DST_W, DST_H
    );

    // 2. 创建最终画布并对临时画布进行水平翻转
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = RESULT_WIDTH;
    finalCanvas.height = RESULT_HEIGHT;
    const ctx = finalCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.translate(RESULT_WIDTH, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(tempCanvas, 0, 0);

    return finalCanvas;
}

/**
 * 绘制原图预览（带裁剪区域标记）
 * @param {HTMLImageElement} sourceImage - 已加载的原图
 */
function drawSourcePreview(sourceImage) {
    const canvas = sourcePreviewCanvas;
    const ctx = sourcePreviewCtx;
    const w = sourceImage.width;
    const h = sourceImage.height;

    // 调整预览画布尺寸以匹配原图
    canvas.width = w;
    canvas.height = h;

    // 关闭平滑以保持像素清晰
    ctx.imageSmoothingEnabled = false;

    // 1. 绘制原图
    ctx.drawImage(sourceImage, 0, 0);

    // 2. 绘制半透明暗色覆盖（裁剪区域外变暗，突出裁剪区域）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    // 上方矩形
    ctx.fillRect(0, 0, w, SRC_Y1);
    // 下方矩形
    ctx.fillRect(0, SRC_Y1 + SRC_H, w, h - (SRC_Y1 + SRC_H));
    // 左方矩形（裁剪区域左侧）
    ctx.fillRect(0, SRC_Y1, SRC_X1, SRC_H);
    // 右方矩形（裁剪区域右侧）
    ctx.fillRect(SRC_X1 + SRC_W, SRC_Y1, w - (SRC_X1 + SRC_W), SRC_H);

    // 3. 绘制裁剪区域边框（亮色高亮）
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = Math.max(1, Math.floor(w / 64)); // 根据图片尺寸调整线宽
    ctx.strokeRect(SRC_X1, SRC_Y1, SRC_W, SRC_H);

    // 4. 在裁剪区域四角绘制小标记（增强可见性）
    const cornerLen = Math.max(3, Math.floor(w / 20));
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = Math.max(1, Math.floor(w / 48));
    // 左上角
    ctx.beginPath();
    ctx.moveTo(SRC_X1, SRC_Y1 + cornerLen);
    ctx.lineTo(SRC_X1, SRC_Y1);
    ctx.lineTo(SRC_X1 + cornerLen, SRC_Y1);
    ctx.stroke();
    // 右上角
    ctx.beginPath();
    ctx.moveTo(SRC_X1 + SRC_W - cornerLen, SRC_Y1);
    ctx.lineTo(SRC_X1 + SRC_W, SRC_Y1);
    ctx.lineTo(SRC_X1 + SRC_W, SRC_Y1 + cornerLen);
    ctx.stroke();
    // 左下角
    ctx.beginPath();
    ctx.moveTo(SRC_X1, SRC_Y1 + SRC_H - cornerLen);
    ctx.lineTo(SRC_X1, SRC_Y1 + SRC_H);
    ctx.lineTo(SRC_X1 + cornerLen, SRC_Y1 + SRC_H);
    ctx.stroke();
    // 右下角
    ctx.beginPath();
    ctx.moveTo(SRC_X1 + SRC_W - cornerLen, SRC_Y1 + SRC_H);
    ctx.lineTo(SRC_X1 + SRC_W, SRC_Y1 + SRC_H);
    ctx.lineTo(SRC_X1 + SRC_W, SRC_Y1 + SRC_H - cornerLen);
    ctx.stroke();
}

/**
 * 绘制结果预览（在结果画布上绘制处理后的内容）
 * @param {HTMLCanvasElement} processedCanvas - 处理后的32×32画布
 */
function drawResultPreview(processedCanvas) {
    const canvas = resultCanvas;
    const ctx = resultCtx;

    // 确保结果画布尺寸正确
    canvas.width = RESULT_WIDTH;
    canvas.height = RESULT_HEIGHT;

    // 关闭平滑
    ctx.imageSmoothingEnabled = false;

    // 清空并绘制
    ctx.clearRect(0, 0, RESULT_WIDTH, RESULT_HEIGHT);
    ctx.drawImage(processedCanvas, 0, 0);
}

/**
 * 完整流程：加载图片 → 预览 → 处理 → 显示结果
 * @param {HTMLImageElement} img - 已加载的原图
 */
function handleImage(img) {
    loadedSourceImage = img;

    // 验证图片尺寸是否足够包含裁剪区域
    if (img.width <= SRC_X2 || img.height <= SRC_Y2) {
        alert(
            `⚠️ 图片尺寸不足！\n\n` +
            `裁剪区域需要图片至少为 ${SRC_X2 + 1}×${SRC_Y2 + 1} 像素，\n` +
            `当前图片尺寸为 ${img.width}×${img.height} 像素。\n\n` +
            `请导入至少 ${SRC_X2 + 1}×${SRC_Y2 + 1} 的图片（推荐64×64）。`
        );
        return;
    }

    // 尺寸提醒（非64×64时）
    if (img.width !== EXPECTED_SRC_WIDTH || img.height !== EXPECTED_SRC_HEIGHT) {
        console.warn(
            `⚠️ 图片尺寸为 ${img.width}×${img.height}，非预期的64×64。` +
            `裁剪区域(${SRC_X1},${SRC_Y1})-(${SRC_X2},${SRC_Y2})仍在范围内，继续处理。`
        );
    }

    // 1. 绘制原图预览（带裁剪标记）
    drawSourcePreview(img);

    // 2. 处理纹理
    const processed = processTexture(img);
    cleanResultCanvas = processed;

    // 3. 绘制结果预览
    drawResultPreview(processed);

    // 4. 显示目标区域覆盖标记
    targetOverlay.style.display = 'block';

    // 5. 启用下载按钮
    downloadBtn.disabled = false;
    downloadBtn.textContent = '💾 下载结果PNG (32×32)';
}

// ============================================================
// 文件加载
// ============================================================

/**
 * 从File对象加载图片
 * @param {File} file - 图片文件
 */
function loadImageFromFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('请选择一个有效的图片文件。');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            handleImage(img);
        };
        img.onerror = function () {
            alert('无法加载图片，请确认文件格式是否正确。');
        };
        img.src = e.target.result;
    };
    reader.onerror = function () {
        alert('读取文件失败，请重试。');
    };
    reader.readAsDataURL(file);
}

// ============================================================
// 下载功能
// ============================================================

/**
 * 下载处理后的32×32 PNG图片
 */
function downloadResult() {
    if (!cleanResultCanvas) {
        alert('请先导入图片进行处理。');
        return;
    }

    // 使用toBlob获取PNG格式的blob（保持透明通道）
    cleanResultCanvas.toBlob(
        function (blob) {
            if (!blob) {
                alert('生成图片失败，请重试。');
                return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'processed_texture_32x32.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        },
        'image/png',
        1.0 // 最高质量
    );
}

// ============================================================
// 初始化默认预览（空白画布 + 占位提示）
// ============================================================

function initPlaceholders() {
    // 原图预览 — 绘制虚线占位框
    const srcCanvas = sourcePreviewCanvas;
    srcCanvas.width = EXPECTED_SRC_WIDTH;
    srcCanvas.height = EXPECTED_SRC_HEIGHT;
    const srcCtx = sourcePreviewCtx;
    srcCtx.imageSmoothingEnabled = false;

    // 填充深色背景
    srcCtx.fillStyle = '#1a1a28';
    srcCtx.fillRect(0, 0, srcCanvas.width, srcCanvas.height);

    // 绘制虚线裁剪区域预览
    srcCtx.strokeStyle = 'rgba(255, 200, 60, 0.5)';
    srcCtx.lineWidth = 1;
    srcCtx.setLineDash([3, 3]);
    srcCtx.strokeRect(SRC_X1, SRC_Y1, SRC_W, SRC_H);
    srcCtx.setLineDash([]);

    // 中央文字
    srcCtx.fillStyle = 'rgba(200,200,220,0.7)';
    srcCtx.font = '10px "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
    srcCtx.textAlign = 'center';
    srcCtx.fillText('导入图片', srcCanvas.width / 2, srcCanvas.height / 2 - 4);
    srcCtx.fillText('64×64', srcCanvas.width / 2, srcCanvas.height / 2 + 12);

    // 结果预览 — 透明棋盘格已由CSS处理，绘制占位
    const rstCanvas = resultCanvas;
    rstCanvas.width = RESULT_WIDTH;
    rstCanvas.height = RESULT_HEIGHT;
    const rstCtx = resultCtx;
    rstCtx.imageSmoothingEnabled = false;
    rstCtx.clearRect(0, 0, rstCanvas.width, rstCanvas.height);

    // 在结果画布上绘制虚线目标区域
    rstCtx.strokeStyle = 'rgba(255, 220, 80, 0.45)';
    rstCtx.lineWidth = 1;
    rstCtx.setLineDash([2, 2]);
    rstCtx.strokeRect(DST_X1, DST_Y1, DST_W, DST_H);
    rstCtx.setLineDash([]);

    // 隐藏目标覆盖层（等有结果后再显示）
    targetOverlay.style.display = 'none';

    // 禁用下载按钮
    downloadBtn.disabled = true;
    downloadBtn.textContent = '💾 下载结果PNG（需先导入图片）';
}

// ============================================================
// 事件监听
// ============================================================

// 文件选择器
dropZone.addEventListener('click', function () {
    fileInput.click();
});

fileInput.addEventListener('change', function (e) {
    if (e.target.files && e.target.files.length > 0) {
        loadImageFromFile(e.target.files[0]);
    }
    // 重置input以允许重新选择同一文件
    fileInput.value = '';
});

// 拖放支持
dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
            loadImageFromFile(file);
        } else {
            alert('请拖放一个有效的图片文件。');
        }
    }
});

// 在整个页面上也支持拖放（方便操作）
document.addEventListener('dragover', function (e) {
    e.preventDefault();
});
document.addEventListener('drop', function (e) {
    e.preventDefault();
});

// 下载按钮
downloadBtn.addEventListener('click', downloadResult);

// ============================================================
// 初始化
// ============================================================

initPlaceholders();

console.log('✅ 纹理区域拉伸工具已就绪');
console.log(`   裁剪: (${SRC_X1},${SRC_Y1})-(${SRC_X2},${SRC_Y2}) → ${SRC_W}×${SRC_H} px`);
console.log(`   目标: (${DST_X1},${DST_Y1})-(${DST_X2},${DST_Y2}) → ${DST_W}×${DST_H} px`);
console.log(`   结果画布: ${RESULT_WIDTH}×${RESULT_HEIGHT} px`);
console.log('   插值模式: 最近邻（imageSmoothingEnabled = false）— Blockbench风格');