export function splitTextIntoChunks(text: string, maxCharsPerChunk: number = 80000): string[] {
  if (!text) return [];
  
  const chunks: string[] = [];
  let currentIndex = 0;
  
  while (currentIndex < text.length) {
    let endIndex = Math.min(currentIndex + maxCharsPerChunk, text.length);
    
    // 如果不是最后一部分，尝试在段落结尾或句号处截断，避免切断句子
    if (endIndex < text.length) {
      // 优先在段落结尾截断
      const lastParagraphEnd = text.lastIndexOf('\n', endIndex);
      if (lastParagraphEnd > currentIndex + maxCharsPerChunk * 0.8) {
        endIndex = lastParagraphEnd;
      } else {
        // 其次在句号处截断 (中文或英文句号)
        const lastPeriod = Math.max(
          text.lastIndexOf('.', endIndex),
          text.lastIndexOf('。', endIndex)
        );
        if (lastPeriod > currentIndex + maxCharsPerChunk * 0.8) {
          endIndex = lastPeriod + 1;
        }
      }
    }
    
    chunks.push(text.slice(currentIndex, endIndex));
    currentIndex = endIndex;
  }
  
  return chunks;
}

