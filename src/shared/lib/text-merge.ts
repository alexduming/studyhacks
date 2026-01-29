/**
 * 🎯 智能合并 OCR 文本块 (将碎行合并为段落)
 */
export function mergeTextBlocks(blocks: any[]): any[] {
  if (!blocks || blocks.length === 0) return [];

  // 1. 按垂直坐标排序 (从上到下)
  // 如果 y 坐标非常接近(同一行)，按 x 坐标排序
  const sorted = [...blocks].sort((a, b) => {
    if (Math.abs(a.bbox.y - b.bbox.y) < 10) {
      return a.bbox.x - b.bbox.x;
    }
    return a.bbox.y - b.bbox.y;
  });
  
  const merged: any[] = [];
  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    
    // 计算特征
    const verticalGap = next.bbox.y - (current.bbox.y + current.bbox.height);
    const fontSizeRatio = Math.min(current.fontSizePx, next.fontSizePx) / Math.max(current.fontSizePx, next.fontSizePx);
    const xDiff = Math.abs(current.bbox.x - next.bbox.x);
    const colorMatch = current.color === next.color;
    
    // 🎯 合并条件：
    // 1. 垂直间距很小 (小于 1.0 倍字号)，说明是紧挨着的下一行
    // 2. 左对齐 (X 坐标相差不大，允许一定的缩进差异)
    // 3. 字体大小相近 (差异 < 20%)
    // 4. 颜色相同
    const isSameParagraph = 
      verticalGap < current.fontSizePx * 1.5 && 
      verticalGap > -10 && // 排除重叠太多的
      xDiff < current.fontSizePx * 3 && // 允许一定的缩进或对齐误差
      fontSizeRatio > 0.8 &&
      colorMatch;

    if (isSameParagraph) {
      // 执行合并
      const newWidth = Math.max(
        current.bbox.width,
        next.bbox.width
      );
      // 累加高度 (包含间距)
      const newHeight = (next.bbox.y + next.bbox.height) - current.bbox.y;
      
      current = {
        ...current,
        text: current.text + '\n' + next.text, // 用换行符合并
        bbox: {
          x: Math.min(current.bbox.x, next.bbox.x), // 取最左边
          y: current.bbox.y, // 保持起始 y
          width: newWidth,
          height: newHeight
        },
        // 保持 current 的样式属性
      };
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);
  
  return merged;
}
