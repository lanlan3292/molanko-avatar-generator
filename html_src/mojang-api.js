/**
 * mojang-api.js – 独立的 Minecraft 皮肤获取模块
 * 使用 mc-heads.net 避免 CORS 限制
 */
(function() {
    'use strict';

    // 判断字符串是否为 UUID 格式（带不带连字符均可）
    function isUuid(str) {
        return /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(str);
    }

    // 加载图片（返回 Promise<HTMLImageElement>）
    function loadImageFromUrl(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous'; // 启用跨域
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('请检查网络或图片服务是否可用'));
            img.src = url;
        });
    }

    /**
     * 主函数：根据玩家名或 UUID 获取皮肤图片
     * @param {string} nameOrUuid - 玩家名 或 UUID (带不带连字符均可)
     * @returns {Promise<HTMLImageElement>}
     */
    window.getMinecraftSkin = async function(nameOrUuid) {
        if (!nameOrUuid || nameOrUuid.trim() === '') {
            throw new Error('请输入玩家名或 UUID');
        }
        const input = nameOrUuid.trim();

        let skinUrl;
        if (isUuid(input)) {
            // 是 UUID → 使用 crafatar.com（官方皮肤镜像）
            const cleanUuid = input.replace(/-/g, '');
            skinUrl = `https://mc-heads.net/skin/${cleanUuid}`;
        } else {
            // 是玩家名 → 使用 mc-heads.net（支持 CORS）
            skinUrl = `https://mc-heads.net/skin/${encodeURIComponent(input)}`;
        }

        try {
            const img = await loadImageFromUrl(skinUrl);
            return img;
        } catch (err) {
            throw new Error(`获取皮肤失败: ${err.message}`);
        }
    };

})();