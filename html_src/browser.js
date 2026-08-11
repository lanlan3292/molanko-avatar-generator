/**
 * browser-ui.js
 * 浏览器前端胶水层 —— 只负责 DOM / 事件 / 文件加载 / 预览 / 下载
 * 核心处理逻辑全部委托给动态导入的 main.js 或 main_old.js
 */

(function () {
  'use strict';

  // ========== 浏览器 createCanvas ==========
  function createCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // ========== DOM 引用 ==========
  const fileInput          = document.getElementById('fileInput');
  const dropZone           = document.getElementById('dropZone');
  const sourcePreviewCanvas = document.getElementById('sourcePreviewCanvas');
  const sourcePreviewCtx   = sourcePreviewCanvas.getContext('2d');
  const resultCanvas       = document.getElementById('resultCanvas');
  const resultCtx          = resultCanvas.getContext('2d');
  const downloadBtn        = document.getElementById('downloadBtn');

  const outlineRadios      = document.getElementsByName('outline');
  const outlineColorInput  = document.getElementById('outlineColor');
  const outlinePresetSelect = document.getElementById('outlinePreset');
  const bgColorInput       = document.getElementById('bgColor');
  const bgPresetSelect     = document.getElementById('bgPreset');
  const scaleSelect        = document.getElementById('scaleSelect');
  const upscale48Checkbox  = document.getElementById('upscale48');
  const fillBackgroundCheckbox = document.getElementById('fillBackground');

  // Minecraft 相关
  const playerInput  = document.getElementById('playerInput');
  const fetchSkinBtn = document.getElementById('fetchSkinBtn');
  const fetchStatus  = document.getElementById('fetchStatus');

  // ========== 引擎选择 ==========
  const engineSelect = document.getElementById('engineSelect');
  const savedEngine = localStorage.getItem('engineChoice') || 'new';
  engineSelect.value = savedEngine;
  engineSelect.addEventListener('change', (e) => {
    localStorage.setItem('engineChoice', e.target.value);
    location.reload(); // 刷新页面以加载新引擎
  });

  // ========== 动态导入核心引擎 ==========
  (async function init() {
    // 根据选择决定导入路径
    const enginePath = savedEngine === 'old'
      ? '../molanko-avatar-generator/src/main_old.js'
      : '../molanko-avatar-generator/src/main.js';

    let engine;
    try {
      engine = await import(enginePath);
    } catch (err) {
      console.error('加载引擎失败:', err);
      alert(`无法加载 ${savedEngine === 'old' ? '旧版' : '新版'} 引擎，请确认文件存在。`);
      return;
    }

    // 解构所需函数
    const {
      processTexture,
      resolveOutlineColor,
      resolveBgColor,
      getAverageColor
    } = engine;

    // ========== 状态 ==========
    let currentSourceImage = null;
    let currentResultCanvas = null;

    // ========== 读取当前 UI 选项 ==========
    function getOptions() {
      return {
        createCanvas,
        outlineMode: parseInt(document.querySelector('input[name="outline"]:checked')?.value || '0', 10),
        outlineColor: outlineColorInput.value,
        bgColor: bgColorInput.value,
        upscale48: upscale48Checkbox.checked,
        fillBackground: fillBackgroundCheckbox.checked,
        scale: parseInt(scaleSelect.value, 10) || 1
      };
    }

    // ========== 渲染最终结果 ==========
    function renderFinal() {
      if (!currentSourceImage) return;

      try {
        const options = getOptions();
        const result = processTexture(currentSourceImage, options);

        currentResultCanvas = result;
        resultCanvas.width  = result.width;
        resultCanvas.height = result.height;
        resultCtx.imageSmoothingEnabled = false;
        resultCtx.clearRect(0, 0, result.width, result.height);
        resultCtx.drawImage(result, 0, 0);

        downloadBtn.disabled = false;
        downloadBtn.textContent = `💾 下载 PNG (${result.width}×${result.height})`;
      } catch (err) {
        console.error(err);
        alert(err.message || '处理失败');
      }
    }

    // ========== 源图预览 ==========
    function drawSourcePreview(img) {
      sourcePreviewCanvas.width  = img.width;
      sourcePreviewCanvas.height = img.height;
      sourcePreviewCtx.imageSmoothingEnabled = false;
      sourcePreviewCtx.drawImage(img, 0, 0);
    }

    // ========== 处理图片入口 ==========
    function handleImage(img) {
      if (img.width <= 63 || img.height <= 31) {
        alert(`图片尺寸不足！当前：${img.width}×${img.height}，至少需要 64×64`);
        return;
      }

      currentSourceImage = img;
      drawSourcePreview(img);

      // 根据当前预设刷新颜色输入框
      applyOutlinePreset(outlinePresetSelect.value);
      applyBgPreset(bgPresetSelect.value);

      renderFinal();
    }

    // ========== 预设颜色同步 ==========
    function applyOutlinePreset(value) {
      if (value.startsWith('auto_') && currentSourceImage) {
        const tmp = createCanvas(currentSourceImage.width, currentSourceImage.height);
        const tctx = tmp.getContext('2d');
        tctx.drawImage(currentSourceImage, 0, 0);
        const avg = getAverageColor(tmp);
        outlineColorInput.value = resolveOutlineColor(value, avg);
      } else {
        outlineColorInput.value = value;
      }
    }

    function applyBgPreset(value) {
      if (value.startsWith('auto_') && currentSourceImage) {
        const tmp = createCanvas(currentSourceImage.width, currentSourceImage.height);
        const tctx = tmp.getContext('2d');
        tctx.drawImage(currentSourceImage, 0, 0);
        const avg = getAverageColor(tmp);
        bgColorInput.value = resolveBgColor(value, avg);
      } else {
        bgColorInput.value = value;
      }
    }

    // ========== 文件加载 ==========
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

    // ========== 下载 ==========
    function downloadResult() {
      if (!currentResultCanvas) {
        alert('请先导入图片进行处理。');
        return;
      }
      currentResultCanvas.toBlob((blob) => {
        if (!blob) {
          alert('生成图片失败。');
          return;
        }
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

    // ========== Minecraft 皮肤获取 ==========
    async function handleFetchSkin() {
      const input = playerInput.value.trim();
      if (!input) {
        fetchStatus.textContent = '⚠️ 请输入玩家名或 UUID';
        return;
      }

      if (typeof window.getMinecraftSkin !== 'function') {
        fetchStatus.textContent = '❌ 未找到 getMinecraftSkin，请确认已加载 mojang-api.js';
        fetchStatus.style.color = 'var(--warning)';
        return;
      }

      fetchSkinBtn.disabled = true;
      fetchStatus.textContent = '⏳ 正在获取皮肤...';
      fetchStatus.style.color = 'var(--text2)';

      try {
        const img = await window.getMinecraftSkin(input);
        handleImage(img);
        fetchStatus.textContent = '✅ 皮肤加载成功！';
        fetchStatus.style.color = 'var(--success)';
        playerInput.value = '';
      } catch (err) {
        fetchStatus.textContent = `❌ ${err.message}`;
        fetchStatus.style.color = 'var(--warning)';
        console.error('获取皮肤失败:', err);
      } finally {
        fetchSkinBtn.disabled = false;
      }
    }

    // ========== 初始化占位 ==========
    function initPlaceholders() {
      sourcePreviewCanvas.width  = 64;
      sourcePreviewCanvas.height = 64;

      resultCanvas.width  = 48;
      resultCanvas.height = 48;
      resultCtx.clearRect(0, 0, 48, 48);

      downloadBtn.disabled = true;
      downloadBtn.textContent = '💾 下载结果PNG（需先导入图片）';
    }

    // ========== 事件绑定 ==========
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

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files?.length) {
        loadImageFromFile(e.target.files[0]);
        fileInput.value = '';
      }
    });

    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
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

    for (const radio of outlineRadios) {
      radio.addEventListener('change', renderFinal);
    }
    scaleSelect.addEventListener('change', renderFinal);
    upscale48Checkbox.addEventListener('change', renderFinal);
    fillBackgroundCheckbox.addEventListener('change', renderFinal);

    fetchSkinBtn.addEventListener('click', handleFetchSkin);
    playerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleFetchSkin();
      }
    });

    // ========== 启动 ==========
    initPlaceholders();
    console.log(`[browser-ui] 已就绪，使用引擎: ${savedEngine === 'old' ? '旧版 (main_old.js)' : '新版 (main.js)'}`);
  })();
})();