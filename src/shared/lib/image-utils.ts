/**
 * 图像处理工具函数
 * 用于局部编辑功能：裁剪、合成、羽化
 */

/**
 * 裁剪图片指定区域
 * @param imageUrl 原始图片 URL
 * @param region 选区坐标（归一化 0-1）
 * @param imageWidth 图片宽度（像素）
 * @param imageHeight 图片高度（像素）
 * @returns Base64 编码的裁剪图片
 */
export async function cropImageRegion(
  imageUrl: string,
  region: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      // 🎯 使用代理 API 获取图片，避免 CORS 问题
      let finalImageUrl = imageUrl;

      const isSameDomain = imageUrl.startsWith('/') ||
                           imageUrl.startsWith(window.location.origin);

      if (!isSameDomain) {
        // 通过代理获取图片
        const proxyUrl = `/api/storage/proxy-image?url=${encodeURIComponent(imageUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch image through proxy: ${response.status}`);
        }
        const blob = await response.blob();
        finalImageUrl = URL.createObjectURL(blob);
      }

      const img = new Image();

      img.onload = () => {
        try {
        // 计算实际像素坐标
        const x = region.x * imageWidth;
        const y = region.y * imageHeight;
        const width = region.width * imageWidth;
        const height = region.height * imageHeight;

        // 创建 Canvas 用于裁剪
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // 裁剪图片
        ctx.drawImage(
          img,
          x,
          y,
          width,
          height,
          0,
          0,
          width,
          height
        );

        // 转换为 Base64
        const result = canvas.toDataURL('image/png');

        // 如果使用了 blob URL，在使用后释放
        if (finalImageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(finalImageUrl);
        }

        resolve(result);
      } catch (error) {
        console.error('[cropImageRegion] Canvas 操作失败:', error);
        if (finalImageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(finalImageUrl);
        }
        reject(error);
      }
    };

    img.onerror = (error) => {
      console.error('[cropImageRegion] 图片加载失败:', finalImageUrl, error);
      if (finalImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(finalImageUrl);
      }
      reject(new Error(`Failed to load image: ${imageUrl}`));
    };

    img.src = finalImageUrl;
    } catch (error) {
      console.error('[cropImageRegion] 代理获取失败:', error);
      reject(error);
    }
  });
}

/**
 * 将编辑后的区域合成回原图（带羽化效果）
 * @param originalImageUrl 原始图片 URL
 * @param editedRegionUrl 编辑后的区域图片 URL
 * @param region 选区坐标（归一化 0-1）
 * @param imageWidth 图片宽度（像素）
 * @param imageHeight 图片高度（像素）
 * @param featherRadius 羽化半径（像素，默认 15）
 * @returns Base64 编码的合成图片
 */
export async function compositeEditedRegion(
  originalImageUrl: string,
  editedRegionUrl: string,
  region: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
  featherRadius: number = 15
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      // 🎯 使用代理 API 获取图片，避免 CORS 问题
      let finalOriginalUrl = originalImageUrl;
      let finalEditedUrl = editedRegionUrl;

      const isOriginalSameDomain = originalImageUrl.startsWith('/') ||
                                    originalImageUrl.startsWith(window.location.origin);
      const isEditedSameDomain = editedRegionUrl.startsWith('/') ||
                                  editedRegionUrl.startsWith(window.location.origin);

      // 通过代理获取原图
      if (!isOriginalSameDomain) {
        const proxyUrl = `/api/storage/proxy-image?url=${encodeURIComponent(originalImageUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch original image through proxy: ${response.status}`);
        }
        const blob = await response.blob();
        finalOriginalUrl = URL.createObjectURL(blob);
      }

      // 通过代理获取编辑后的图片
      if (!isEditedSameDomain) {
        const proxyUrl = `/api/storage/proxy-image?url=${encodeURIComponent(editedRegionUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch edited image through proxy: ${response.status}`);
        }
        const blob = await response.blob();
        finalEditedUrl = URL.createObjectURL(blob);
      }

      const originalImg = new Image();
      const editedImg = new Image();

      let originalLoaded = false;
      let editedLoaded = false;

    const tryComposite = () => {
      if (!originalLoaded || !editedLoaded) return;

      try {
        // 计算实际像素坐标
        const x = region.x * imageWidth;
        const y = region.y * imageHeight;
        const width = region.width * imageWidth;
        const height = region.height * imageHeight;

        // 创建主 Canvas
        const canvas = document.createElement('canvas');
        canvas.width = imageWidth;
        canvas.height = imageHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // 1. 绘制原图
        ctx.drawImage(originalImg, 0, 0, imageWidth, imageHeight);

        // 2. 创建羽化 mask
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = width;
        maskCanvas.height = height;
        const maskCtx = maskCanvas.getContext('2d');

        if (!maskCtx) {
          reject(new Error('Failed to get mask context'));
          return;
        }

        // 创建径向渐变实现羽化效果
        const gradient = maskCtx.createRadialGradient(
          width / 2,
          height / 2,
          Math.min(width, height) / 2 - featherRadius,
          width / 2,
          height / 2,
          Math.min(width, height) / 2
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        // 绘制羽化 mask
        maskCtx.fillStyle = gradient;
        maskCtx.fillRect(0, 0, width, height);

        // 3. 使用 globalCompositeOperation 实现羽化合成
        ctx.save();

        // 创建临时 Canvas 用于编辑区域
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');

        if (!tempCtx) {
          reject(new Error('Failed to get temp context'));
          return;
        }

        // 绘制编辑后的图片
        tempCtx.drawImage(editedImg, 0, 0, width, height);

        // 应用 mask（羽化效果）
        tempCtx.globalCompositeOperation = 'destination-in';
        tempCtx.drawImage(maskCanvas, 0, 0);

        // 将羽化后的编辑区域合成到主 Canvas
        ctx.drawImage(tempCanvas, x, y);

        ctx.restore();

        // 转换为 Base64
        const result = canvas.toDataURL('image/png');

        // 释放 blob URLs
        if (finalOriginalUrl.startsWith('blob:')) {
          URL.revokeObjectURL(finalOriginalUrl);
        }
        if (finalEditedUrl.startsWith('blob:')) {
          URL.revokeObjectURL(finalEditedUrl);
        }

        resolve(result);
      } catch (error) {
        console.error('[compositeEditedRegion] 合成失败:', error);
        // 释放 blob URLs
        if (finalOriginalUrl.startsWith('blob:')) {
          URL.revokeObjectURL(finalOriginalUrl);
        }
        if (finalEditedUrl.startsWith('blob:')) {
          URL.revokeObjectURL(finalEditedUrl);
        }
        reject(error);
      }
    };

    originalImg.onload = () => {
      originalLoaded = true;
      tryComposite();
    };

    editedImg.onload = () => {
      editedLoaded = true;
      tryComposite();
    };

    originalImg.onerror = (error) => {
      console.error('[compositeEditedRegion] 原图加载失败:', finalOriginalUrl, error);
      // 释放 blob URLs
      if (finalOriginalUrl.startsWith('blob:')) {
        URL.revokeObjectURL(finalOriginalUrl);
      }
      if (finalEditedUrl.startsWith('blob:')) {
        URL.revokeObjectURL(finalEditedUrl);
      }
      reject(new Error(`Failed to load original image: ${originalImageUrl}`));
    };

    editedImg.onerror = (error) => {
      console.error('[compositeEditedRegion] 编辑图加载失败:', finalEditedUrl, error);
      // 释放 blob URLs
      if (finalOriginalUrl.startsWith('blob:')) {
        URL.revokeObjectURL(finalOriginalUrl);
      }
      if (finalEditedUrl.startsWith('blob:')) {
        URL.revokeObjectURL(finalEditedUrl);
      }
      reject(new Error(`Failed to load edited region image: ${editedRegionUrl}`));
    };

    originalImg.src = finalOriginalUrl;
    editedImg.src = finalEditedUrl;
    } catch (error) {
      console.error('[compositeEditedRegion] 代理获取失败:', error);
      reject(error);
    }
  });
}

/**
 * 简单合成（无羽化，用于调试）
 */
export async function compositeEditedRegionSimple(
  originalImageUrl: string,
  editedRegionUrl: string,
  region: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const originalImg = new Image();
    const editedImg = new Image();

    // 智能设置 crossOrigin
    const isOriginalSameDomain = originalImageUrl.startsWith('/') ||
                                  originalImageUrl.startsWith(window.location.origin);
    const isEditedSameDomain = editedRegionUrl.startsWith('/') ||
                                editedRegionUrl.startsWith(window.location.origin);

    if (!isOriginalSameDomain) {
      originalImg.crossOrigin = 'anonymous';
    }
    if (!isEditedSameDomain) {
      editedImg.crossOrigin = 'anonymous';
    }

    let originalLoaded = false;
    let editedLoaded = false;

    const tryComposite = () => {
      if (!originalLoaded || !editedLoaded) return;

      try {
        const x = region.x * imageWidth;
        const y = region.y * imageHeight;
        const width = region.width * imageWidth;
        const height = region.height * imageHeight;

        const canvas = document.createElement('canvas');
        canvas.width = imageWidth;
        canvas.height = imageHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // 绘制原图
        ctx.drawImage(originalImg, 0, 0, imageWidth, imageHeight);

        // 直接覆盖编辑区域
        ctx.drawImage(editedImg, x, y, width, height);

        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        console.error('[compositeEditedRegionSimple] 合成失败:', error);
        reject(error);
      }
    };

    originalImg.onload = () => {
      originalLoaded = true;
      tryComposite();
    };

    editedImg.onload = () => {
      editedLoaded = true;
      tryComposite();
    };

    originalImg.onerror = (error) => {
      console.error('[compositeEditedRegionSimple] 原图加载失败:', originalImageUrl, error);
      reject(new Error(`Failed to load original image: ${originalImageUrl}`));
    };

    editedImg.onerror = (error) => {
      console.error('[compositeEditedRegionSimple] 编辑图加载失败:', editedRegionUrl, error);
      reject(new Error(`Failed to load edited region image: ${editedRegionUrl}`));
    };

    originalImg.src = originalImageUrl;
    editedImg.src = editedRegionUrl;
  });
}
