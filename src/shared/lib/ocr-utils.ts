/**
 * OCR 工具函数
 * 用于坐标转换和字体大小估算
 */

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NormalizedCoordinates {
  x: number; // 0-1
  y: number; // 0-1
  width: number; // 0-1
  height: number; // 0-1
}

interface SlideCoordinates {
  x: number; // inches
  y: number; // inches
  width?: number; // inches (用于其他函数)
  height?: number; // inches (用于其他函数)
  w?: number; // inches (用于 pptxgenjs)
  h?: number; // inches (用于 pptxgenjs)
}

/**
 * 将像素坐标转换为归一化坐标（0-1）
 * @param bbox 像素坐标的边界框
 * @param imageWidth 图片宽度（像素）
 * @param imageHeight 图片高度（像素）
 * @returns 归一化坐标（0-1）
 */
export function normalizeCoordinates(
  bbox: BoundingBox,
  imageWidth: number,
  imageHeight: number
): NormalizedCoordinates {
  return {
    x: bbox.x / imageWidth,
    y: bbox.y / imageHeight,
    width: bbox.width / imageWidth,
    height: bbox.height / imageHeight,
  };
}

/**
 * 将归一化坐标转换为幻灯片坐标（英寸）
 * @param normalized 归一化坐标（0-1）
 * @param slideWidth 幻灯片宽度（英寸）
 * @param slideHeight 幻灯片高度（英寸）
 * @returns 幻灯片坐标（英寸）
 */
export function convertToSlideCoordinates(
  normalized: NormalizedCoordinates,
  slideWidth: number,
  slideHeight: number
): SlideCoordinates {
  return {
    x: normalized.x * slideWidth,
    y: normalized.y * slideHeight,
    width: normalized.width * slideWidth,
    height: normalized.height * slideHeight,
  };
}

/**
 * 根据文本高度估算字体大小
 * @param textHeight 文本高度（英寸）
 * @param slideHeight 幻灯片高度（英寸）
 * @param fontSizeHint OCR 返回的字体大小提示
 * @returns 字体大小（磅）
 */
export function estimateFontSize(
  textHeight: number,
  slideHeight: number,
  fontSizeHint?: 'title' | 'large' | 'medium' | 'small'
): number {
  // 根据提示返回字体大小
  if (fontSizeHint) {
    const fontSizeMap: Record<string, number> = {
      title: 44,
      large: 32,
      medium: 24,
      small: 18,
    };
    return fontSizeMap[fontSizeHint] || 24;
  }

  // 根据文本高度占幻灯片高度的比例估算
  const heightRatio = textHeight / slideHeight;

  if (heightRatio > 0.15) return 44; // 标题
  if (heightRatio > 0.1) return 32; // 大字体
  if (heightRatio > 0.05) return 24; // 中等字体
  return 18; // 小字体
}

/**
 * 直接将像素坐标转换为幻灯片坐标（组合函数）
 * @param bbox 像素坐标的边界框
 * @param imageWidth 图片宽度（像素）
 * @param imageHeight 图片高度（像素）
 * @param slideWidth 幻灯片宽度（英寸）
 * @param slideHeight 幻灯片高度（英寸）
 * @returns 幻灯片坐标（英寸）
 */
export function pixelToSlideCoordinates(
  bbox: BoundingBox,
  imageWidth: number,
  imageHeight: number,
  slideWidth: number,
  slideHeight: number
): SlideCoordinates {
  const normalized = normalizeCoordinates(bbox, imageWidth, imageHeight);
  return convertToSlideCoordinates(normalized, slideWidth, slideHeight);
}

/**
 * 像素字号转 PowerPoint 点数
 * @param px 像素字号
 * @param basePPI 基准 PPI（默认 96）
 * @returns PowerPoint 点数
 */
export function pxToPoint(px: number, basePPI: number = 96): number {
  // 分段转换策略：
  // - 小字（< 20px）: 使用 0.55 比例（更小，避免小字过大）
  // - 中等字（20-40px）: 使用 0.6 比例
  // - 大字（> 40px）: 使用 0.65 比例（稍大）

  let ratio: number;
  if (px < 20) {
    ratio = 0.55;  // 小字更小
  } else if (px <= 40) {
    ratio = 0.6;   // 中等字
  } else {
    ratio = 0.65;  // 大字稍大
  }

  return Math.round(px * ratio);
}

/**
 * 计算 PPTX 坐标（英寸）- 简化版
 * @param bbox 像素坐标的边界框
 * @param imageSize 图片尺寸
 * @param slideWidth 幻灯片宽度（英寸，默认 10）
 * @param slideHeight 幻灯片高度（英寸，默认 5.625）
 * @param alignment 文本对齐方式（用于调整坐标）
 * @returns PPTX 坐标（英寸）
 */
export function calculatePPTXCoords(
  bbox: BoundingBox,
  imageSize: { width: number; height: number },
  slideWidth: number = 10,
  slideHeight: number = 5.625,
  alignment: 'left' | 'center' | 'right' = 'left'
): SlideCoordinates {
  const scaleX = slideWidth / imageSize.width;
  const scaleY = slideHeight / imageSize.height;

  let x = bbox.x * scaleX;
  let y = bbox.y * scaleY;
  const w = bbox.width * scaleX;
  const h = bbox.height * scaleY;

  // 根据对齐方式调整 x 坐标
  // OCR 返回的 bbox 是文本的实际边界，但 PowerPoint 的对齐是基于文本框的
  // 需要根据对齐方式调整文本框的起始位置
  if (alignment === 'center') {
    // 居中对齐时，OCR 的 bbox.x 是文本左边界
    // 文本框应该向左扩展半个宽度，使文本在框内居中
    x = x - w / 2;
  } else if (alignment === 'right') {
    // 右对齐时，OCR 的 bbox.x 是文本左边界
    // 文本框应该向左扩展整个宽度，使文本在框内右对齐
    x = x - w;
  }
  // left 对齐不需要调整，OCR 的 bbox.x 就是文本框的左边界

  return { x, y, w, h };
}

/**
 * 根据选区坐标生成 mask 图像（Canvas）
 * @param regions 选区定义数组（归一化坐标 0-1）
 * @param imageWidth 目标图片宽度（像素）
 * @param imageHeight 目标图片高度（像素）
 * @returns Base64 编码的 PNG mask 图像
 */
export async function generateMaskFromRegions(
  regions: Array<{ x: number; y: number; width: number; height: number }>,
  imageWidth: number,
  imageHeight: number
): Promise<string> {
  // 创建 Canvas
  const canvas = document.createElement('canvas');
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // 填充黑色背景（未选中区域）
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, imageWidth, imageHeight);

  // 绘制白色选区（要编辑的区域）
  ctx.fillStyle = '#FFFFFF';
  for (const region of regions) {
    const x = region.x * imageWidth;
    const y = region.y * imageHeight;
    const width = region.width * imageWidth;
    const height = region.height * imageHeight;
    ctx.fillRect(x, y, width, height);
  }

  // 转换为 Base64
  return canvas.toDataURL('image/png');
}

/**
 * 在原图上绘制选区标记（用于不支持 mask 的 API）
 * @param imageUrl 原始图片 URL
 * @param regions 选区定义数组（归一化坐标 0-1）
 * @param imageWidth 图片宽度（像素）
 * @param imageHeight 图片高度（像素）
 * @returns Base64 编码的标记后的图片
 */
export async function drawRegionMarkersOnImage(
  imageUrl: string,
  regions: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
  }>,
  imageWidth: number,
  imageHeight: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = imageWidth;
    canvas.height = imageHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // 绘制原图
      ctx.drawImage(img, 0, 0, imageWidth, imageHeight);

      // 绘制选区标记
      regions.forEach((region, index) => {
        const x = region.x * imageWidth;
        const y = region.y * imageHeight;
        const width = region.width * imageWidth;
        const height = region.height * imageHeight;

        // 绘制半透明红色填充
        ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
        ctx.fillRect(x, y, width, height);

        // 绘制红色边框（加粗）
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 8;
        ctx.strokeRect(x, y, width, height);

        // 绘制标签（左上角）
        const labelText = region.label || `区域${index + 1}`;
        const fontSize = Math.max(24, Math.min(48, imageHeight / 20));
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.fillStyle = '#FF0000';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;

        const textX = x + 10;
        const textY = y + fontSize + 10;

        // 白色描边（增强可读性）
        ctx.strokeText(labelText, textX, textY);
        // 红色文字
        ctx.fillText(labelText, textX, textY);
      });

      // 转换为 Base64
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = imageUrl;
  });
}
