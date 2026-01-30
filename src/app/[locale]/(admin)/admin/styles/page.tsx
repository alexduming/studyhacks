'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  analyzeStyleAction,
  deleteStyleFromConfigAction,
  generateAdminStylePreviewAction,
  queryKieTaskStatusAction,
  saveStyleToConfigAction,
} from '@/app/actions/admin-style';
import {
  CheckCircle2,
  ChevronRight,
  Edit3,
  Eye,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  PPT_STYLES,
  PPTStyle,
  VisualSpecification,
} from '@/config/aippt-slides2';
import { Header, Main, MainHeader } from '@/shared/blocks/dashboard';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/lib/utils';

export default function AdminStylesPage() {
  const router = useRouter();
  const [localStyles, setLocalStyles] = useState<PPTStyle[]>(PPT_STYLES);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [step, setStep] = useState(1);

  // Form State
  const [images, setImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tempFolder, setTempFolder] = useState<string>(
    () => `studyhacks-ppt/styles/temp-${Date.now()}`
  );

  const [analysisResult, setAnalysisResult] = useState<{
    prompt: string;
    visualSpec: VisualSpecification;
  } | null>(null);

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewTheme, setPreviewTheme] =
    useState<string>('Studyhacks产品介绍');
  const [styleInfo, setStyleInfo] = useState({
    id: '',
    title: '',
    tagline: '',
  });

  // Handle Image Upload
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('path', tempFolder);
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const res = await fetch('/api/storage/upload-image', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.code === 0) {
        setImages((prev) => [...prev, ...data.data.urls]);
        toast.success('图片上传成功');
      } else {
        toast.error(data.message || '上传失败');
      }
    } catch (error) {
      toast.error('上传过程中出错');
    } finally {
      setIsUploading(false);
    }
  };

  // 1. 分析风格
  const handleAnalyze = async () => {
    if (images.length === 0) {
      toast.error('请先上传参考图');
      return;
    }
    setIsAnalyzing(true);
    try {
      const result = await analyzeStyleAction(images);
      setAnalysisResult(result);
      setStep(2);
      toast.success('风格分析完成');
    } catch (error: any) {
      toast.error(error.message || '分析失败');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 2. 生成预览图
  const handleGeneratePreview = async () => {
    if (!analysisResult) return;
    setIsGenerating(true);
    try {
      const task = await generateAdminStylePreviewAction({
        prompt: analysisResult.prompt,
        visualSpec: analysisResult.visualSpec,
        imageUrls: images,
        previewTheme: previewTheme,
      });

      // 这里简化处理，如果是 KIE 可能需要轮询，但我们假设调用的是带轮询的 Action 或者直接返回 URL
      // 实际上 createKieTaskAction 返回的是 task_id，需要轮询。
      // 为了管理员体验，我们在这里可以加一个简单的轮询逻辑
      if (task.task_id) {
        toast.info('正在生成预览图，请稍候...');
        pollKieTask(task.task_id);
      }
    } catch (error: any) {
      toast.error(error.message || '预览生成失败');
      setIsGenerating(false);
    }
  };

  const pollKieTask = async (taskId: string) => {
    try {
      const data = await queryKieTaskStatusAction(taskId);
      if (data.status === 'completed' && data.imageUrl) {
        setPreviewImageUrl(data.imageUrl);
        setIsGenerating(false);
        toast.success('预览图已生成');
      } else if (data.status === 'failed') {
        toast.error('生成预览图失败');
        setIsGenerating(false);
      } else {
        // 继续轮询
        setTimeout(() => pollKieTask(taskId), 3000);
      }
    } catch (error) {
      setIsGenerating(false);
    }
  };

  // 3. 保存风格
  const handleSave = async () => {
    if (
      !styleInfo.id ||
      !styleInfo.title ||
      !analysisResult ||
      !previewImageUrl
    ) {
      toast.error('请填写完整信息，并确保已生成预览图');
      return;
    }

    setIsSaving(true);
    try {
      const newStyle: PPTStyle = {
        ...styleInfo,
        preview: previewImageUrl,
        // 🎯 关键：将生成的预览图也加入参考图列表，确保未来生成时 AI 能参考到
        refs: [previewImageUrl, ...images],
        prompt: analysisResult.prompt,
        visualSpec: analysisResult.visualSpec,
      };
      await saveStyleToConfigAction(newStyle);
      setLocalStyles((prev) => {
        const idx = prev.findIndex((s) => s.id === newStyle.id);
        if (idx > -1) {
          const next = [...prev];
          next[idx] = newStyle;
          return next;
        }
        return [...prev, newStyle];
      });
      toast.success('风格已添加到风格库');
      setIsAddModalOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (style: PPTStyle) => {
    setStyleInfo({
      id: style.id,
      title: style.title,
      tagline: style.tagline,
    });
    // 过滤掉 preview 图，避免 refs 列表重复堆叠
    const originalRefs =
      style.refs?.filter((url) => url !== style.preview) || [];
    setImages(originalRefs);
    setAnalysisResult({
      prompt: style.prompt,
      visualSpec: style.visualSpec || {},
    });
    setPreviewImageUrl(style.preview);
    setStep(4); // 直接跳到最后一步，用户可以按需返回
    setIsAddModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个风格吗？此操作不可撤销且会修改配置文件。'))
      return;
    try {
      await deleteStyleFromConfigAction(id);
      setLocalStyles((prev) => prev.filter((s) => s.id !== id));
      toast.success('风格已删除');
    } catch (error: any) {
      toast.error(error.message || '删除失败');
    }
  };

  const resetForm = () => {
    setStep(1);
    setImages([]);
    setAnalysisResult(null);
    setPreviewImageUrl(null);
    setPreviewTheme('Studyhacks产品介绍');
    setTempFolder(`studyhacks-ppt/styles/temp-${Date.now()}`);
    setStyleInfo({ id: '', title: '', tagline: '' });
  };

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Header
        crumbs={[
          { title: 'Admin', url: '/admin' },
          { title: 'Styles', is_active: true },
        ]}
      />
      <Main>
        <MainHeader
          title="风格库管理"
          extraActions={
            <Button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-primary hover:bg-primary/90"
            >
              <Plus className="mr-2 h-4 w-4" />
              添加新风格
            </Button>
          }
        />

        <div className="mx-auto w-full max-w-7xl px-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {localStyles.map((style) => (
              <Card
                key={style.id}
                className="group hover:border-primary/50 relative overflow-hidden border-border bg-card shadow-xl transition-all duration-300"
              >
                <div className="aspect-[16/10] overflow-hidden">
                  <img
                    src={style.preview}
                    alt={style.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-foreground">
                      {style.title}
                    </h3>
                    <Badge
                      variant="outline"
                      className="border-border text-[10px] text-muted-foreground"
                    >
                      {style.id}
                    </Badge>
                  </div>
                  <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">
                    {style.tagline}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] tracking-widest text-muted-foreground/60 uppercase">
                      {style.refs?.length || 0} REFS
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handleEdit(style)}
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                        onClick={() => handleDelete(style.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Add Style Modal */}
        <Dialog
          open={isAddModalOpen}
          onOpenChange={(open) => {
            if (!open && !isSaving) setIsAddModalOpen(false);
          }}
        >
          <DialogContent
            size="full"
            className="flex h-[80vh] w-[80vw] max-w-none flex-col overflow-hidden border-border bg-background p-0 text-foreground"
          >
            <DialogHeader className="border-b border-border px-6 pt-6 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="flex items-center gap-2 text-2xl font-bold">
                    <Sparkles className="text-primary h-6 w-6" />
                    {styleInfo.id ? '编辑风格' : '添加新风格到库'}
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-muted-foreground">
                    通过 AI 分析图片并自动生成提示词与视觉规范
                  </DialogDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    resetForm();
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* 简化的步骤指示器 */}
              <div className="mt-6 flex items-center gap-2">
                {[1, 2, 3, 4].map((s) => (
                  <React.Fragment key={s}>
                    <div
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all',
                        step === s
                          ? 'bg-primary text-white'
                          : step > s
                            ? 'bg-primary/30 text-primary'
                            : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
                    </div>
                    {s < 4 && (
                      <div
                        className={cn(
                          'h-0.5 flex-1',
                          step > s ? 'bg-primary' : 'bg-muted'
                        )}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </DialogHeader>

            {/* 内容区域 - 可滚动 */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {/* Step 1: Upload & Analyze */}
              {step === 1 && (
                <div className="grid h-full grid-cols-3 gap-6">
                  <div className="col-span-2 space-y-4">
                    <Label className="text-base font-medium text-foreground/80">
                      上传参考图片
                    </Label>
                    <div className="grid grid-cols-3 gap-4">
                      {images.map((url, i) => (
                        <div
                          key={i}
                          className="group hover:border-primary/50 relative aspect-video overflow-hidden rounded-lg border border-border transition-all"
                        >
                          <img
                            src={url}
                            className="h-full w-full object-cover"
                          />
                          <button
                            onClick={() =>
                              setImages((prev) =>
                                prev.filter((_, idx) => idx !== i)
                              )
                            }
                            className="absolute top-2 right-2 rounded-full bg-black/70 p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <X className="h-4 w-4 text-white" />
                          </button>
                        </div>
                      ))}
                      <label className="hover:border-primary/50 hover:bg-primary/5 flex aspect-video cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border transition-all">
                        {isUploading ? (
                          <Loader2 className="text-primary h-8 w-8 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-8 w-8 text-muted-foreground/40" />
                            <span className="mt-2 text-xs text-muted-foreground/40">
                              上传图片
                            </span>
                          </>
                        )}
                        <input
                          type="file"
                          multiple
                          hidden
                          onChange={handleUpload}
                          accept="image/*"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <Button
                      onClick={handleAnalyze}
                      disabled={images.length === 0 || isAnalyzing}
                      className="bg-primary hover:bg-primary/90 h-12 text-base font-medium"
                      size="lg"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          分析中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-5 w-5" />
                          分析风格
                        </>
                      )}
                    </Button>
                    {images.length > 0 && (
                      <p className="mt-3 text-center text-sm text-muted-foreground/50">
                        已上传 {images.length} 张图片
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Review Analysis */}
              {step === 2 && (
                <div className="grid h-full grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <Label className="text-base font-medium text-foreground/80">
                      提示词
                    </Label>
                    <Textarea
                      value={analysisResult?.prompt}
                      onChange={(e) =>
                        setAnalysisResult((prev) =>
                          prev ? { ...prev, prompt: e.target.value } : null
                        )
                      }
                      className="min-h-[200px] resize-none border-border bg-muted/30 text-sm leading-relaxed"
                      placeholder="AI 生成的提示词..."
                    />
                  </div>
                  <div className="flex flex-col space-y-4">
                    <Label className="text-base font-medium text-foreground/80">
                      视觉规范
                    </Label>
                    <ScrollArea className="flex-1 rounded-lg border border-border bg-muted/50 p-4 font-mono text-xs">
                      <pre className="text-primary">
                        {JSON.stringify(analysisResult?.visualSpec, null, 2)}
                      </pre>
                    </ScrollArea>
                    <Button
                      onClick={() => setStep(3)}
                      className="bg-primary hover:bg-primary/90 mt-auto h-11"
                    >
                      下一步：生成预览
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Generate Preview */}
              {step === 3 && (
                <div className="flex h-full flex-col items-center justify-center">
                  {previewImageUrl ? (
                    <div className="w-full space-y-6">
                      <div className="border-primary/30 mx-auto aspect-video max-w-2xl overflow-hidden rounded-xl border-2 shadow-2xl">
                        <img
                          src={previewImageUrl}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex justify-center gap-4">
                        <Button
                          onClick={() => setPreviewImageUrl(null)}
                          variant="outline"
                          className="h-11 border-border hover:bg-muted"
                        >
                          重新生成
                        </Button>
                        <Button
                          onClick={() => setStep(4)}
                          className="bg-primary hover:bg-primary/90 h-11"
                        >
                          满意，继续
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full max-w-2xl space-y-6">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-base font-medium text-foreground/80">
                            预览主题
                          </Label>
                          <Input
                            value={previewTheme}
                            onChange={(e) => setPreviewTheme(e.target.value)}
                            placeholder="例如：Studyhacks产品介绍"
                            className="h-11 border-border bg-muted/30"
                          />
                          <p className="text-xs text-muted-foreground/50">
                            这将作为生成预览图的主题内容，参考图仅作为视觉风格参考
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-center space-y-6 text-center">
                        <div className="bg-primary/10 inline-flex rounded-full p-6">
                          <ImageIcon className="text-primary h-16 w-16" />
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-2xl font-bold">生成预览图</h4>
                          <p className="mx-auto max-w-md text-sm text-muted-foreground/50">
                            使用 KIE 引擎生成"{previewTheme}
                            "封面，验证风格还原度
                          </p>
                        </div>
                        <Button
                          onClick={handleGeneratePreview}
                          disabled={isGenerating || !previewTheme.trim()}
                          className="bg-primary hover:bg-primary/90 h-12 px-8 text-base"
                        >
                          {isGenerating ? (
                            <>
                              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                              生成中...
                            </>
                          ) : (
                            <>
                              <ImageIcon className="mr-2 h-5 w-5" />
                              生成预览图
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 4: Final Info & Save */}
              {step === 4 && (
                <div className="grid h-full grid-cols-2 gap-6">
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label className="text-base font-medium text-foreground/80">
                        风格 ID
                      </Label>
                      <Input
                        value={styleInfo.id}
                        disabled={!!styleInfo.id}
                        onChange={(e) =>
                          setStyleInfo((prev) => ({
                            ...prev,
                            id: e.target.value,
                          }))
                        }
                        placeholder="如：minimal_blue"
                        className="h-11 border-border bg-muted/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-medium text-foreground/80">
                        风格标题
                      </Label>
                      <Input
                        value={styleInfo.title}
                        onChange={(e) =>
                          setStyleInfo((prev) => ({
                            ...prev,
                            title: e.target.value,
                          }))
                        }
                        placeholder="如：科技简约"
                        className="h-11 border-border bg-muted/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-medium text-foreground/80">
                        副标题 / 描述
                      </Label>
                      <Input
                        value={styleInfo.tagline}
                        onChange={(e) =>
                          setStyleInfo((prev) => ({
                            ...prev,
                            tagline: e.target.value,
                          }))
                        }
                        placeholder="一句话概括核心特征"
                        className="h-11 border-border bg-muted/30"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col justify-center space-y-4">
                    <div className="bg-primary/5 border-primary/20 rounded-xl border p-6">
                      <div className="mb-3 flex items-center gap-2">
                        <CheckCircle2 className="text-primary h-5 w-5" />
                        <h4 className="text-lg font-bold text-foreground">
                          准备就绪
                        </h4>
                      </div>
                      <p className="text-sm text-muted-foreground/50">
                        点击下方按钮保存到风格库，配置将立即生效
                      </p>
                    </div>
                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="bg-primary hover:bg-primary/90 h-12 text-base font-medium"
                      size="lg"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          保存中...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-5 w-5" />
                          添加到风格库
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* 底部操作栏 */}
            <div className="flex items-center justify-between border-t border-border bg-muted/50 px-6 py-4">
              <Button
                variant="ghost"
                onClick={() => {
                  setIsAddModalOpen(false);
                  resetForm();
                }}
                className="text-muted-foreground/50 hover:bg-muted hover:text-foreground"
              >
                取消
              </Button>
              <div className="flex gap-3">
                {step > 1 && (
                  <Button
                    variant="outline"
                    onClick={() => setStep((prev) => prev - 1)}
                    className="border-border hover:bg-muted"
                  >
                    上一步
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </Main>
    </div>
  );
}
