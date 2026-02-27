'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { editImageRegionAction } from '@/app/actions/aippt';
import { InfographicHistoryEntry } from '@/app/actions/ai_task';
import {
  Check,
  Crop,
  Images,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { CreditsCost } from '@/shared/components/ai-elements/credits-display';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
} from '@/shared/components/ui/dialog';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/lib/utils';

/**
 * 选区定义
 */
interface RegionDefinition {
  id: string;
  label: string;
  x: number; // 归一化坐标 0-1
  y: number;
  width: number;
  height: number;
  note: string;
}

interface InfographicEditDialogProps {
  /** 是否打开对话框 */
  open: boolean;
  /** 关闭对话框回调 */
  onOpenChange: (open: boolean) => void;
  /** 要编辑的图片 URL */
  imageUrl: string;
  /** 图片的宽高比，如 "16:9" */
  aspectRatio: string;
  /** 分辨率，如 "2K" */
  resolution: string;
  /** 编辑完成后的回调，返回新的图片 URL 和编辑提示词 */
  onEditComplete: (newImageUrl: string, editPrompt?: string) => void;
  /** 历史记录列表（可选） */
  history?: InfographicHistoryEntry[];
  /** 切换历史版本的回调（可选），返回 Promise 以便等待完成 */
  onSwitchVersion?: (entry: InfographicHistoryEntry) => Promise<void>;
}

/**
 * 信息图编辑对话框组件
 *
 * 非程序员解释：
 * - 这个组件提供了一个全屏对话框，用于编辑信息图
 * - 用户可以在图片上框选区域进行局部编辑
 * - 如果不框选，则进行整体重新生成
 * - 🎯 关键优化：画布尺寸根据图片宽高比自适应，确保框选精确
 */
export function InfographicEditDialog({
  open,
  onOpenChange,
  imageUrl,
  aspectRatio,
  resolution,
  onEditComplete,
  history = [],
  onSwitchVersion,
}: InfographicEditDialogProps) {
  const t = useTranslations('infographic');

  // 编辑状态
  const [editRegions, setEditRegions] = useState<RegionDefinition[]>([]);
  const [draftRegion, setDraftRegion] = useState<RegionDefinition | null>(null);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🎯 当前编辑的图片 URL（可通过历史版本切换）
  const [currentEditImageUrl, setCurrentEditImageUrl] = useState(imageUrl);

  // 🎯 新增：追踪是否切换了历史版本（用于"应用修改"确认）
  const [pendingVersionSwitch, setPendingVersionSwitch] = useState<InfographicHistoryEntry | null>(null);

  // 拖拽状态
  const editCanvasRef = useRef<HTMLDivElement>(null);
  const drawingStartRef = useRef<{ x: number; y: number } | null>(null);
  const [draggedRegionId, setDraggedRegionId] = useState<string | null>(null);
  const [resizeCorner, setResizeCorner] = useState<string | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // 🎯 新增：计算画布的实际尺寸和对话框宽度
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [dialogWidth, setDialogWidth] = useState('90vw');

  // 右侧面板固定宽度
  const PANEL_WIDTH = 360;
  // 左侧内边距
  const LEFT_PADDING = 32; // p-4 = 16px * 2

  /**
   * 🎯 解析宽高比字符串为数值
   * 例如 "16:9" -> { w: 16, h: 9 }
   */
  const parseAspectRatio = (ratio: string) => {
    const [w, h] = ratio.split(':').map(Number);
    if (!w || !h) return { w: 1, h: 1 };
    return { w, h };
  };

  /**
   * 🎯 计算对话框和画布的最佳尺寸
   * 核心逻辑：
   * 1. 对话框高度固定为 90vh
   * 2. 根据图片比例计算图片区域的最佳宽度
   * 3. 对话框宽度 = 图片宽度 + 右侧面板 + 内边距
   */
  useEffect(() => {
    if (!open) return;

    const updateSizes = () => {
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      // 对话框高度固定为 90vh
      const dialogHeight = viewportHeight * 0.9;
      // 图片区域可用高度（减去整体修改输入区的高度约 120px 和内边距）
      const availableHeight = dialogHeight - 120 - LEFT_PADDING;

      const { w, h } = parseAspectRatio(aspectRatio);
      const imageAspect = w / h;

      // 根据可用高度和图片比例计算图片宽度
      let imageWidth = availableHeight * imageAspect;
      let imageHeight = availableHeight;

      // 计算对话框总宽度
      let totalWidth = imageWidth + PANEL_WIDTH + LEFT_PADDING;

      // 限制最大宽度为 95vw，最小宽度为 600px
      const maxWidth = viewportWidth * 0.95;
      const minWidth = Math.min(600, viewportWidth * 0.9);

      if (totalWidth > maxWidth) {
        // 如果超出最大宽度，需要缩小图片
        const availableImageWidth = maxWidth - PANEL_WIDTH - LEFT_PADDING;
        imageWidth = availableImageWidth;
        imageHeight = imageWidth / imageAspect;
        totalWidth = maxWidth;
      }

      if (totalWidth < minWidth) {
        totalWidth = minWidth;
        // 重新计算图片尺寸
        const availableImageWidth = totalWidth - PANEL_WIDTH - LEFT_PADDING;
        if (availableImageWidth > 0) {
          imageWidth = availableImageWidth;
          imageHeight = Math.min(availableHeight, imageWidth / imageAspect);
          imageWidth = imageHeight * imageAspect;
        }
      }

      setCanvasSize({ width: imageWidth, height: imageHeight });
      setDialogWidth(`${totalWidth}px`);
    };

    // 延迟执行以确保 DOM 已渲染
    const timer = setTimeout(updateSizes, 50);

    // 监听窗口大小变化
    window.addEventListener('resize', updateSizes);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateSizes);
    };
  }, [open, aspectRatio]);

  /**
   * 生成选区标签（A, B, C...）
   */
  const getRegionLabel = (index: number) => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let i = index;
    let label = '';
    do {
      label = alphabet[i % 26] + label;
      i = Math.floor(i / 26) - 1;
    } while (i >= 0);
    return label;
  };

  /**
   * 根据 aspectRatio 计算图片尺寸（用于 API 调用）
   */
  const getImageDimensions = (ratio: string, res: string) => {
    const baseWidth = res === '4K' ? 3840 : 1920;
    const [w, h] = ratio.split(':').map(Number);
    if (!w || !h) {
      return { width: baseWidth, height: res === '4K' ? 2160 : 1080 };
    }
    if (w >= h) {
      const height = Math.round(baseWidth * h / w);
      return { width: baseWidth, height };
    } else {
      const height = baseWidth;
      const width = Math.round(height * w / h);
      return { width, height };
    }
  };

  /**
   * 处理画布上的鼠标按下事件 - 开始绘制选区
   */
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggedRegionId || resizeCorner) return;

    const rect = editCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // 检查是否点击了现有选区
    const clickedRegion = editRegions.find(
      (r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
    );

    if (clickedRegion) {
      setActiveRegionId(clickedRegion.id);
      return;
    }

    // 开始绘制新选区
    drawingStartRef.current = { x, y };
    setDraftRegion({
      id: `region-${Date.now()}`,
      label: getRegionLabel(editRegions.length),
      x,
      y,
      width: 0,
      height: 0,
      note: '',
    });
    setActiveRegionId(null);
  };

  /**
   * 处理画布上的鼠标移动事件 - 更新选区大小
   */
  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = editCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const currentX = (e.clientX - rect.left) / rect.width;
    const currentY = (e.clientY - rect.top) / rect.height;

    // 处理拖拽移动选区
    if (draggedRegionId && dragStartPosRef.current) {
      const deltaX = currentX - dragStartPosRef.current.x;
      const deltaY = currentY - dragStartPosRef.current.y;

      setEditRegions((prev) =>
        prev.map((r) => {
          if (r.id !== draggedRegionId) return r;
          let newX = Math.max(0, Math.min(1 - r.width, r.x + deltaX));
          let newY = Math.max(0, Math.min(1 - r.height, r.y + deltaY));
          return { ...r, x: newX, y: newY };
        })
      );
      dragStartPosRef.current = { x: currentX, y: currentY };
      return;
    }

    // 处理调整选区大小
    if (resizeCorner && activeRegionId && dragStartPosRef.current) {
      setEditRegions((prev) =>
        prev.map((r) => {
          if (r.id !== activeRegionId) return r;

          let newX = r.x;
          let newY = r.y;
          let newWidth = r.width;
          let newHeight = r.height;

          if (resizeCorner.includes('w')) {
            newWidth = Math.max(0.05, r.x + r.width - currentX);
            newX = Math.min(r.x + r.width - 0.05, currentX);
          }
          if (resizeCorner.includes('e')) {
            newWidth = Math.max(0.05, currentX - r.x);
          }
          if (resizeCorner.includes('n')) {
            newHeight = Math.max(0.05, r.y + r.height - currentY);
            newY = Math.min(r.y + r.height - 0.05, currentY);
          }
          if (resizeCorner.includes('s')) {
            newHeight = Math.max(0.05, currentY - r.y);
          }

          // 边界检查
          newX = Math.max(0, newX);
          newY = Math.max(0, newY);
          newWidth = Math.min(1 - newX, newWidth);
          newHeight = Math.min(1 - newY, newHeight);

          return { ...r, x: newX, y: newY, width: newWidth, height: newHeight };
        })
      );
      return;
    }

    // 处理绘制新选区
    if (!drawingStartRef.current || !draftRegion) return;

    const startX = drawingStartRef.current.x;
    const startY = drawingStartRef.current.y;

    const x = Math.max(0, Math.min(startX, currentX));
    const y = Math.max(0, Math.min(startY, currentY));
    const width = Math.min(1 - x, Math.abs(currentX - startX));
    const height = Math.min(1 - y, Math.abs(currentY - startY));

    setDraftRegion((prev) =>
      prev ? { ...prev, x, y, width, height } : null
    );
  };

  /**
   * 完成选区绘制
   */
  const finalizeRegion = () => {
    // 结束拖拽
    if (draggedRegionId) {
      setDraggedRegionId(null);
      dragStartPosRef.current = null;
      return;
    }

    // 结束调整大小
    if (resizeCorner) {
      setResizeCorner(null);
      dragStartPosRef.current = null;
      return;
    }

    // 完成新选区绘制
    if (draftRegion && draftRegion.width > 0.02 && draftRegion.height > 0.02) {
      setEditRegions((prev) => [...prev, draftRegion]);
      setActiveRegionId(draftRegion.id);
    }
    setDraftRegion(null);
    drawingStartRef.current = null;
  };

  /**
   * 删除选区
   */
  const removeRegion = (id: string) => {
    setEditRegions((prev) => {
      const filtered = prev.filter((r) => r.id !== id);
      // 重新分配标签
      return filtered.map((r, idx) => ({
        ...r,
        label: getRegionLabel(idx),
      }));
    });
    if (activeRegionId === id) {
      setActiveRegionId(null);
    }
  };

  /**
   * 更新选区备注
   */
  const updateRegionNote = (id: string, note: string) => {
    setEditRegions((prev) =>
      prev.map((r) => (r.id === id ? { ...r, note } : r))
    );
  };

  /**
   * 🎯 获取图片的实际尺寸
   *
   * @param imageUrl 图片 URL
   * @returns 图片的实际宽高
   */
  const getActualImageDimensions = (imageUrl: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      // 添加 10 秒超时
      const timeout = setTimeout(() => {
        console.error('[Edit] 获取图片尺寸超时');
        reject(new Error('获取图片尺寸超时'));
      }, 10000);

      const img = new window.Image();
      // 🎯 不设置 crossOrigin，避免 CORS 问题（我们只需要获取尺寸，不需要读取像素）
      img.onload = () => {
        clearTimeout(timeout);
        console.log('[Edit] 图片加载成功:', img.naturalWidth, 'x', img.naturalHeight);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = (e) => {
        clearTimeout(timeout);
        console.error('[Edit] 图片加载失败:', e);
        reject(new Error('无法加载图片获取尺寸'));
      };
      img.src = imageUrl;
    });
  };

  /**
   * 🎯 根据宽高比估算图片尺寸（备用方案）
   */
  const estimateDimensionsFromAspectRatio = (ratio: string, baseSize: number = 1920): { width: number; height: number } => {
    const [w, h] = ratio.split(':').map(Number);
    if (!w || !h) return { width: baseSize, height: baseSize };
    if (w >= h) {
      return { width: baseSize, height: Math.round(baseSize * h / w) };
    } else {
      return { width: Math.round(baseSize * w / h), height: baseSize };
    }
  };

  /**
   * 提交编辑
   * 🎯 使用坐标定位模式，通过提示词描述要修改的区域
   */
  const handleSubmit = async () => {
    if (isSubmitting) return;

    // 检查是否有内容
    if (editRegions.length === 0 && !editingPrompt.trim()) {
      toast.error(t('edit.no_content'));
      return;
    }

    setIsSubmitting(true);
    toast.loading(t('edit.processing'), { id: 'edit' });

    try {
      // 🎯 获取原图的实际尺寸
      console.log('[Edit] 获取原图实际尺寸...', currentEditImageUrl);
      let imageWidth: number;
      let imageHeight: number;

      try {
        const dimensions = await getActualImageDimensions(currentEditImageUrl);
        imageWidth = dimensions.width;
        imageHeight = dimensions.height;
        console.log('[Edit] 原图实际尺寸:', imageWidth, 'x', imageHeight);
      } catch (dimError: any) {
        console.warn('[Edit] 获取尺寸失败，使用备用方案:', dimError.message);
        // 🎯 备用方案：根据 aspectRatio 估算尺寸
        const estimated = estimateDimensionsFromAspectRatio(aspectRatio);
        imageWidth = estimated.width;
        imageHeight = estimated.height;
        console.log('[Edit] 使用估算尺寸:', imageWidth, 'x', imageHeight);
      }

      if (editRegions.length > 0) {
        // 🎯 局部编辑模式 - 使用坐标定位（不需要 mask）
        // 构建编辑提示词，合并所有选区的修改说明
        const editDescription = editRegions
          .map((r) => r.note || editingPrompt)
          .filter(Boolean)
          .join('; ') || editingPrompt || '根据选区进行局部修改';

        console.log('[Edit] 调用局部编辑 API（坐标定位模式）...');
        console.log('[Edit] 参数:', {
          imageUrl: currentEditImageUrl.substring(0, 50) + '...',
          regionsCount: editRegions.length,
          imageWidth,
          imageHeight,
          resolution,
          aspectRatio,
        });

        const result = await editImageRegionAction({
          imageUrl: currentEditImageUrl,
          regions: editRegions.map((r) => ({
            label: r.label,
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            note: r.note || editingPrompt || '',
          })),
          imageWidth,
          imageHeight,
          resolution,
          aspectRatio,
        });

        console.log('[Edit] API 返回结果:', result);
        toast.success(t('edit.success'), { id: 'edit' });
        onEditComplete(result.imageUrl, editDescription);
        onOpenChange(false);
      } else {
        // 整体编辑模式 - 使用原来的方案（重新生成整张图片）
        console.log('[Edit] 调用整体编辑 API...');
        const result = await editImageRegionAction({
          imageUrl: currentEditImageUrl,
          regions: [{
            label: 'A',
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            note: editingPrompt,
          }],
          imageWidth,
          imageHeight,
          resolution,
          aspectRatio,
        });

        console.log('[Edit] API 返回结果:', result);
        toast.success(t('edit.success'), { id: 'edit' });
        onEditComplete(result.imageUrl, editingPrompt || '整体编辑');
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error('[Edit] ❌ 编辑失败:', error);
      console.error('[Edit] 错误消息:', error.message);
      console.error('[Edit] 错误堆栈:', error.stack);
      console.error('[Edit] 完整错误对象:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      toast.error(t('edit.failed'), { id: 'edit' });
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * 渲染选区覆盖层
   */
  const renderRegionsOverlay = () => {
    const allRegions = draftRegion
      ? [...editRegions, draftRegion]
      : editRegions;

    return allRegions.map((region) => {
      const isActive = region.id === activeRegionId;
      const isDraft = region.id === draftRegion?.id;

      return (
        <div
          key={region.id}
          className={cn(
            'absolute border-2 transition-all',
            isDraft
              ? 'border-primary/60 bg-primary/10'
              : isActive
                ? 'border-primary bg-primary/20'
                : 'border-primary/40 bg-primary/10 hover:border-primary/60'
          )}
          style={{
            left: `${region.x * 100}%`,
            top: `${region.y * 100}%`,
            width: `${region.width * 100}%`,
            height: `${region.height * 100}%`,
          }}
          onClick={(e) => {
            e.stopPropagation();
            setActiveRegionId(region.id);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (isDraft) return;
            setDraggedRegionId(region.id);
            const rect = editCanvasRef.current?.getBoundingClientRect();
            if (rect) {
              dragStartPosRef.current = {
                x: (e.clientX - rect.left) / rect.width,
                y: (e.clientY - rect.top) / rect.height,
              };
            }
          }}
        >
          {/* 选区标签 */}
          <div className="bg-primary text-primary-foreground absolute -top-6 left-0 rounded px-1.5 py-0.5 text-xs font-medium">
            {region.label}
          </div>

          {/* 调整大小的角落手柄 */}
          {isActive && !isDraft && (
            <>
              {['nw', 'ne', 'sw', 'se'].map((corner) => (
                <div
                  key={corner}
                  className={cn(
                    'bg-primary absolute h-3 w-3 rounded-full border-2 border-white',
                    corner.includes('n') ? '-top-1.5' : '-bottom-1.5',
                    corner.includes('w') ? '-left-1.5' : '-right-1.5',
                    corner === 'nw' || corner === 'se'
                      ? 'cursor-nwse-resize'
                      : 'cursor-nesw-resize'
                  )}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setResizeCorner(corner);
                    const rect = editCanvasRef.current?.getBoundingClientRect();
                    if (rect) {
                      dragStartPosRef.current = {
                        x: (e.clientX - rect.left) / rect.width,
                        y: (e.clientY - rect.top) / rect.height,
                      };
                    }
                  }}
                />
              ))}
            </>
          )}
        </div>
      );
    });
  };

  /**
   * 渲染选区列表
   */
  const renderRegionList = () => {
    return (
      <div className="space-y-3">
        {editRegions.map((region) => (
          <div
            key={region.id}
            className={cn(
              'border-border bg-muted/30 rounded-xl border p-3 transition-all dark:bg-white/[0.02]',
              activeRegionId === region.id && 'border-primary ring-primary/20 ring-2'
            )}
            onClick={() => setActiveRegionId(region.id)}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="bg-primary text-primary-foreground rounded px-1.5 py-0.5 text-xs font-medium">
                  {region.label}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t('edit.region')}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  removeRegion(region.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              value={region.note}
              onChange={(e) => updateRegionNote(region.id, e.target.value)}
              placeholder={t('edit.region_placeholder')}
              rows={2}
              className="border-border bg-background/50 text-sm"
            />
          </div>
        ))}
      </div>
    );
  };

  // 重置状态当对话框关闭时
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setEditRegions([]);
      setDraftRegion(null);
      setActiveRegionId(null);
      setEditingPrompt('');
      setCurrentEditImageUrl(imageUrl);
      setPendingVersionSwitch(null); // 🎯 重置待确认的版本切换
    }
    onOpenChange(newOpen);
  };

  // 🎯 同步外部 imageUrl 变化
  useEffect(() => {
    setCurrentEditImageUrl(imageUrl);
  }, [imageUrl]);

  // 🎯 切换历史版本（仅预览，不立即保存）
  const handleSwitchToVersion = (entry: InfographicHistoryEntry) => {
    setCurrentEditImageUrl(entry.imageUrl);
    // 清空当前的编辑区域，因为切换了图片
    setEditRegions([]);
    setDraftRegion(null);
    setActiveRegionId(null);
    // 🎯 记录待确认的版本切换（不立即通知父组件）
    // 只有当切换到的版本不是当前显示的版本时才标记为待确认
    if (entry.imageUrl !== imageUrl) {
      setPendingVersionSwitch(entry);
    } else {
      setPendingVersionSwitch(null);
    }
  };

  // 🎯 新增：应用历史版本切换
  const handleApplyVersionSwitch = async () => {
    if (!pendingVersionSwitch) return;

    try {
      // 🎯 通知父组件保存版本切换（父组件会立即更新本地状态，后台保存数据库）
      await onSwitchVersion?.(pendingVersionSwitch);
      setPendingVersionSwitch(null);
      toast.success(t('edit.version_applied'));
      // 关闭对话框
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to apply version switch:', error);
      toast.error(t('edit.version_apply_failed'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="border-border bg-background/98 h-[90vh] gap-0 overflow-hidden p-0 shadow-[0_0_100px_rgba(0,0,0,0.8)] backdrop-blur-3xl dark:bg-[#0E1424]/98"
        style={{ width: dialogWidth, maxWidth: '95vw' }}
      >
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex h-0 min-h-full overflow-hidden">
            {/* 左侧：图片编辑区域 - 宽度自适应 */}
            <div className="bg-muted/30 flex flex-1 flex-col overflow-hidden p-4 dark:bg-black/40">
              <div className="flex flex-1 flex-col gap-3 overflow-hidden">
                {/* 🎯 优化：图片画布容器 - 使用 flex 居中 */}
                <div className="relative flex flex-1 items-center justify-center overflow-hidden">
                  {/* 🎯 关键：画布尺寸根据图片宽高比自适应 */}
                  <div
                    ref={editCanvasRef}
                    className="group border-border bg-muted/50 relative cursor-crosshair overflow-hidden rounded-xl border shadow-lg transition-all select-none dark:bg-black/60"
                    style={{
                      width: canvasSize.width > 0 ? `${canvasSize.width}px` : '100%',
                      height: canvasSize.height > 0 ? `${canvasSize.height}px` : '100%',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                    }}
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={finalizeRegion}
                    onPointerLeave={finalizeRegion}
                    onDragStart={(e) => e.preventDefault()}
                  >
                    {currentEditImageUrl ? (
                      <>
                        {/* 🎯 图片完全填充画布，禁止选中和拖拽 */}
                        <Image
                          src={currentEditImageUrl}
                          alt={t('edit.image_alt')}
                          fill
                          className="pointer-events-none select-none"
                          style={{
                            objectFit: 'fill',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                          } as React.CSSProperties}
                          unoptimized
                          draggable={false}
                        />
                      </>
                    ) : (
                      <div className="text-muted-foreground/50 flex h-full flex-col items-center justify-center space-y-4">
                        <Images className="h-16 w-16 opacity-10" />
                      </div>
                    )}
                    {renderRegionsOverlay()}
                  </div>
                </div>

                {/* 整体修改输入区 */}
                <div className="border-border bg-card/50 shrink-0 space-y-2 rounded-xl border p-3 dark:bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <Label className="text-foreground text-sm font-medium">
                      {t('edit.global_edit_title')}
                    </Label>
                    <span className="bg-primary/10 text-primary rounded-md px-2 py-0.5 text-[10px] font-medium">
                      {t('edit.optional')}
                    </span>
                  </div>
                  <Textarea
                    value={editingPrompt}
                    onChange={(e) => setEditingPrompt(e.target.value)}
                    rows={2}
                    className="border-border bg-background/50 text-foreground min-h-[50px] w-full resize-none rounded-lg border p-2 text-sm"
                    placeholder={t('edit.global_placeholder')}
                  />
                </div>
              </div>
            </div>

            {/* 右侧：编辑控制面板 - 固定宽度 */}
            <div
              className="border-border bg-muted/20 flex h-full flex-col border-l dark:bg-[#0A0D18]/50"
              style={{ width: `${PANEL_WIDTH}px`, minWidth: `${PANEL_WIDTH}px` }}
            >
              {/* 顶部标题 */}
              <div className="border-border/50 flex-none border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <Crop className="text-primary h-4 w-4" />
                  <Label className="text-foreground text-sm font-medium">
                    {t('edit.dialog_title')}
                  </Label>
                </div>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {t('edit.dialog_desc')}
                </p>
              </div>

              {/* 中间可滚动区域 */}
              <div className="flex-1 overflow-y-auto overscroll-contain">
                <div className="space-y-4 p-4">
                  {/* 🎯 历史版本区域 - 只在有历史记录时显示 */}
                  {history.length > 0 && (
                    <div className="border-border bg-muted/30 rounded-xl border p-3 dark:bg-white/[0.02]">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">
                          {t('edit.history_title')}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {history.length} {t('edit.history_count')}
                        </span>
                      </div>
                      <div className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/20 flex gap-2 overflow-x-auto pb-1">
                        {history.map((entry, index) => (
                          <button
                            key={entry.id}
                            className={cn(
                              'group/thumb hover:border-primary relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all',
                              currentEditImageUrl === entry.imageUrl
                                ? 'border-primary shadow-[0_0_0_2px_rgba(139,108,255,0.3)]'
                                : 'border-border/50 hover:border-primary/60'
                            )}
                            onClick={() => handleSwitchToVersion(entry)}
                            title={`${t('edit.history_version')} ${history.length - index} - ${new Date(entry.createdAt).toLocaleString()}`}
                          >
                            <img
                              src={entry.imageUrl}
                              alt={`${t('edit.history_version')} ${history.length - index}`}
                              className="h-full w-full object-cover transition-transform group-hover/thumb:scale-105"
                            />
                            {/* 版本标记 */}
                            <div className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-0.5">
                              <span className="text-[8px] font-medium text-white">
                                v{history.length - index}
                              </span>
                            </div>
                            {/* 当前选中标记 */}
                            {currentEditImageUrl === entry.imageUrl && (
                              <div className="absolute top-0.5 right-0.5">
                                <Check className="text-primary h-3 w-3 drop-shadow-md" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 选区列表或空状态提示 */}
                  {editRegions.length === 0 ? (
                    <div className="border-border bg-muted/30 flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center dark:bg-white/[0.01]">
                      <Crop className="text-muted-foreground/30 mb-3 h-8 w-8 dark:text-white/20" />
                      <p className="text-muted-foreground text-xs dark:text-white/40">
                        {t('edit.drag_hint')}
                      </p>
                      <p className="text-muted-foreground/60 mt-1 text-[10px]">
                        {t('edit.drag_hint_sub')}
                      </p>
                    </div>
                  ) : (
                    renderRegionList()
                  )}
                </div>
              </div>

              {/* 底部按钮区域 */}
              <div className="border-border bg-muted/30 flex-none border-t px-4 py-3 dark:bg-[#080A12]">
                {/* 🎯 如果有待确认的版本切换，显示"应用修改"按钮 */}
                {pendingVersionSwitch ? (
                  <>
                    <Button
                      className="bg-primary hover:bg-primary/90 text-primary-foreground h-11 w-full rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
                      onClick={handleApplyVersionSwitch}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      {t('edit.apply_version')}
                    </Button>
                    <p className="text-muted-foreground mt-2 text-center text-[10px]">
                      {t('edit.version_switch_hint')}
                    </p>
                  </>
                ) : (
                  <>
                    <Button
                      className="bg-primary hover:bg-primary/90 text-primary-foreground h-11 w-full rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
                      disabled={isSubmitting || (editRegions.length === 0 && !editingPrompt.trim())}
                      onClick={handleSubmit}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('edit.processing')}
                        </>
                      ) : (
                        <>
                          <CreditsCost credits={6} />
                          {editRegions.length > 0
                            ? t('edit.apply_regional')
                            : t('edit.apply_global')}
                        </>
                      )}
                    </Button>
                    <p className="text-muted-foreground mt-2 text-center text-[10px]">
                      {editRegions.length > 0
                        ? t('edit.regional_hint')
                        : t('edit.global_hint')}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
