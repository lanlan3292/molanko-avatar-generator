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
    // 1. 创建中间画布（32×32），用于绘制所有内容（未翻转）
    const canvas = document.createElement('canvas');
    canvas.width = RESULT_WIDTH;
    canvas.height = RESULT_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const alpha = 76 / 255; // 半透明黑块透明度

    // 2. 第一个拉伸（原有）：裁剪 (56,8)-(63,15) → 目标 (10,7)-(27,24)（无黑块）
    ctx.drawImage(
        sourceImage,
        SRC_X1, SRC_Y1, SRC_W, SRC_H,
        DST_X1, DST_Y1, DST_W, DST_H
    );

    // 3. 第二个拉伸：裁剪 (48,8)-(55,15) → 目标 (4,7)-(9,24) + 黑块（隔离绘制）
    const SRC_X1_2 = 48, SRC_Y1_2 = 8, SRC_X2_2 = 55, SRC_Y2_2 = 15;
    const SRC_W_2 = SRC_X2_2 - SRC_X1_2 + 1; // 8
    const SRC_H_2 = SRC_Y2_2 - SRC_Y1_2 + 1; // 8
    const DST_X1_2 = 4, DST_Y1_2 = 7, DST_X2_2 = 9, DST_Y2_2 = 24;
    const DST_W_2 = DST_X2_2 - DST_X1_2 + 1; // 6
    const DST_H_2 = DST_Y2_2 - DST_Y1_2 + 1; // 18

    const tempCanvas2 = document.createElement('canvas');
    tempCanvas2.width = DST_W_2;
    tempCanvas2.height = DST_H_2;
    const tempCtx2 = tempCanvas2.getContext('2d');
    tempCtx2.imageSmoothingEnabled = false;
    tempCtx2.drawImage(
        sourceImage,
        SRC_X1_2, SRC_Y1_2, SRC_W_2, SRC_H_2,
        0, 0, DST_W_2, DST_H_2
    );
    tempCtx2.globalCompositeOperation = 'source-atop';
    tempCtx2.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    tempCtx2.fillRect(0, 0, DST_W_2, DST_H_2);
    tempCtx2.globalCompositeOperation = 'source-over';
    ctx.drawImage(tempCanvas2, DST_X1_2, DST_Y1_2);

    // 4. 第三个拉伸：裁剪 (24,8)-(31,15) → 目标 (11,8)-(26,23)（无黑块）
    const SRC_X1_3 = 24, SRC_Y1_3 = 8, SRC_X2_3 = 31, SRC_Y2_3 = 15;
    const SRC_W_3 = SRC_X2_3 - SRC_X1_3 + 1; // 8
    const SRC_H_3 = SRC_Y2_3 - SRC_Y1_3 + 1; // 8
    const DST_X1_3 = 11, DST_Y1_3 = 8, DST_X2_3 = 26, DST_Y2_3 = 23;
    const DST_W_3 = DST_X2_3 - DST_X1_3 + 1; // 16
    const DST_H_3 = DST_Y2_3 - DST_Y1_3 + 1; // 16
    ctx.drawImage(
        sourceImage,
        SRC_X1_3, SRC_Y1_3, SRC_W_3, SRC_H_3,
        DST_X1_3, DST_Y1_3, DST_W_3, DST_H_3
    );

    // 5. 第四个拉伸：裁剪 (16,8)-(23,15) → 目标 (5,8)-(10,23) + 黑块（隔离绘制）
    const SRC_X1_4 = 16, SRC_Y1_4 = 8, SRC_X2_4 = 23, SRC_Y2_4 = 15;
    const SRC_W_4 = SRC_X2_4 - SRC_X1_4 + 1; // 8
    const SRC_H_4 = SRC_Y2_4 - SRC_Y1_4 + 1; // 8
    const DST_X1_4 = 5, DST_Y1_4 = 8, DST_X2_4 = 10, DST_Y2_4 = 23;
    const DST_W_4 = DST_X2_4 - DST_X1_4 + 1; // 6
    const DST_H_4 = DST_Y2_4 - DST_Y1_4 + 1; // 16

    const tempCanvas4 = document.createElement('canvas');
    tempCanvas4.width = DST_W_4;
    tempCanvas4.height = DST_H_4;
    const tempCtx4 = tempCanvas4.getContext('2d');
    tempCtx4.imageSmoothingEnabled = false;
    tempCtx4.drawImage(
        sourceImage,
        SRC_X1_4, SRC_Y1_4, SRC_W_4, SRC_H_4,
        0, 0, DST_W_4, DST_H_4
    );
    tempCtx4.globalCompositeOperation = 'source-atop';
    tempCtx4.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    tempCtx4.fillRect(0, 0, DST_W_4, DST_H_4);
    tempCtx4.globalCompositeOperation = 'source-over';
    ctx.drawImage(tempCanvas4, DST_X1_4, DST_Y1_4);

    // 6. 整体左右翻转（水平镜像）
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = RESULT_WIDTH;
    finalCanvas.height = RESULT_HEIGHT;
    const finalCtx = finalCanvas.getContext('2d');
    finalCtx.imageSmoothingEnabled = false;
    finalCtx.translate(RESULT_WIDTH, 0);
    finalCtx.scale(-1, 1);
    finalCtx.drawImage(canvas, 0, 0);

    // --- 以下操作位于翻转之后，不受翻转影响 ---
    // 重置变换矩阵
    finalCtx.setTransform(1, 0, 0, 1, 0, 0);
    finalCtx.imageSmoothingEnabled = false;

    // 7. 翻转后拉伸：裁剪 (8,8)-(15,15) → 目标 (11,8)-(26,23)（无黑块）
    const SRC_X1_5 = 8, SRC_Y1_5 = 8, SRC_X2_5 = 15, SRC_Y2_5 = 15;
    const SRC_W_5 = SRC_X2_5 - SRC_X1_5 + 1; // 8
    const SRC_H_5 = SRC_Y2_5 - SRC_Y1_5 + 1; // 8
    const DST_X1_5 = 11, DST_Y1_5 = 8, DST_X2_5 = 26, DST_Y2_5 = 23;
    const DST_W_5 = DST_X2_5 - DST_X1_5 + 1; // 16
    const DST_H_5 = DST_Y2_5 - DST_Y1_5 + 1; // 16
    finalCtx.drawImage(
        sourceImage,
        SRC_X1_5, SRC_Y1_5, SRC_W_5, SRC_H_5,
        DST_X1_5, DST_Y1_5, DST_W_5, DST_H_5
    );

    // 8. 翻转后拉伸：裁剪 (0,8)-(7,15) → 目标 (5,8)-(10,23) + 黑块（隔离绘制）
    const SRC_X1_6 = 0, SRC_Y1_6 = 8, SRC_X2_6 = 7, SRC_Y2_6 = 15;
    const SRC_W_6 = SRC_X2_6 - SRC_X1_6 + 1; // 8
    const SRC_H_6 = SRC_Y2_6 - SRC_Y1_6 + 1; // 8
    const DST_X1_6 = 5, DST_Y1_6 = 8, DST_X2_6 = 10, DST_Y2_6 = 23;
    const DST_W_6 = DST_X2_6 - DST_X1_6 + 1; // 6
    const DST_H_6 = DST_Y2_6 - DST_Y1_6 + 1; // 16

    const tempCanvas6 = document.createElement('canvas');
    tempCanvas6.width = DST_W_6;
    tempCanvas6.height = DST_H_6;
    const tempCtx6 = tempCanvas6.getContext('2d');
    tempCtx6.imageSmoothingEnabled = false;
    tempCtx6.drawImage(
        sourceImage,
        SRC_X1_6, SRC_Y1_6, SRC_W_6, SRC_H_6,
        0, 0, DST_W_6, DST_H_6
    );
    tempCtx6.globalCompositeOperation = 'source-atop';
    tempCtx6.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    tempCtx6.fillRect(0, 0, DST_W_6, DST_H_6);
    tempCtx6.globalCompositeOperation = 'source-over';
    finalCtx.drawImage(tempCanvas6, DST_X1_6, DST_Y1_6);

    // 9. 翻转后拉伸：裁剪 (40,8)-(47,15) → 目标 (10,7)-(27,24)（无黑块）
    const SRC_X1_7 = 40, SRC_Y1_7 = 8, SRC_X2_7 = 47, SRC_Y2_7 = 15;
    const SRC_W_7 = SRC_X2_7 - SRC_X1_7 + 1; // 8
    const SRC_H_7 = SRC_Y2_7 - SRC_Y1_7 + 1; // 8
    const DST_X1_7 = 10, DST_Y1_7 = 7, DST_X2_7 = 27, DST_Y2_7 = 24;
    const DST_W_7 = DST_X2_7 - DST_X1_7 + 1; // 18
    const DST_H_7 = DST_Y2_7 - DST_Y1_7 + 1; // 18
    finalCtx.drawImage(
        sourceImage,
        SRC_X1_7, SRC_Y1_7, SRC_W_7, SRC_H_7,
        DST_X1_7, DST_Y1_7, DST_W_7, DST_H_7
    );

    // 10. 翻转后拉伸：裁剪 (32,8)-(39,15) → 目标 (4,7)-(9,24) + 黑块（隔离绘制）
    const SRC_X1_8 = 32, SRC_Y1_8 = 8, SRC_X2_8 = 39, SRC_Y2_8 = 15;
    const SRC_W_8 = SRC_X2_8 - SRC_X1_8 + 1; // 8
    const SRC_H_8 = SRC_Y2_8 - SRC_Y1_8 + 1; // 8
    const DST_X1_8 = 4, DST_Y1_8 = 7, DST_X2_8 = 9, DST_Y2_8 = 24;
    const DST_W_8 = DST_X2_8 - DST_X1_8 + 1; // 6
    const DST_H_8 = DST_Y2_8 - DST_Y1_8 + 1; // 18

    const tempCanvas8 = document.createElement('canvas');
    tempCanvas8.width = DST_W_8;
    tempCanvas8.height = DST_H_8;
    const tempCtx8 = tempCanvas8.getContext('2d');
    tempCtx8.imageSmoothingEnabled = false;
    tempCtx8.drawImage(
        sourceImage,
        SRC_X1_8, SRC_Y1_8, SRC_W_8, SRC_H_8,
        0, 0, DST_W_8, DST_H_8
    );
    tempCtx8.globalCompositeOperation = 'source-atop';
    tempCtx8.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    tempCtx8.fillRect(0, 0, DST_W_8, DST_H_8);
    tempCtx8.globalCompositeOperation = 'source-over';
    finalCtx.drawImage(tempCanvas8, DST_X1_8, DST_Y1_8);

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