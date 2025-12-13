'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { generatePPTAction } from '@/app/actions/aippt';
import { parseDocumentAction } from '@/app/actions/document';
import {
  Download,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { PPT_RATIOS, PPT_SIZES, PPT_STYLES } from '@/config/aippt';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { Checkbox } from '@/shared/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs';
import { Textarea } from '@/shared/components/ui/textarea';

// const PUBLIC_R2_DOMAIN = 'https://cdn.gordensun.com/bananaproimage';
// const ENDPOINT = 'https://hk-api.gptbest.vip/v1/images/generations';
// const MODEL = 'nano-banana-2';
// const STORE_KEY = 'nb_ppt_v3:key';

export default function AIPPTPage() {
  const [prompt, setPrompt] = useState('');
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [activeCustomImages, setActiveCustomImages] = useState<string[]>([]); // Base64 strings
  const [activeStyleImages, setActiveStyleImages] = useState<string[]>([]); // Base64 strings
  const [isEnhancementEnabled, setIsEnhancementEnabled] = useState(true);
  const [ratio, setRatio] = useState('16:9');
  const [size, setSize] = useState('4K');
  const [pageCount, setPageCount] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<
    { url: string; prompt: string; timestamp: string }[]
  >([]);
  const [isStyleLoading, setIsStyleLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Only check if user has custom local key if we really want to support it still.
    // But requirement says "hide API key", so we should primarily rely on server env.
    // However, if we want to allow user to override (maybe for debugging?), we can keep it hidden.
    // Let's remove the visual input but keep the state if we want to support 'params' passing.
    // For now, let's remove the UI input and the state initialization from local storage.
  }, []);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const urlToBase64 = async (url: string): Promise<string> => {
    const res = await fetch(url);
    const blob = await res.blob();
    // Convert Blob to File to satisfy fileToBase64 signature, or adjust fileToBase64 to accept Blob
    const file = new File([blob], 'image.png', { type: blob.type });
    return await fileToBase64(file);
  };

  const handleStyleSelect = async (id: string) => {
    if (selectedStyleId === id) {
      setSelectedStyleId(null);
      setActiveStyleImages([]);
      return;
    }

    // Mutually exclusive: clear custom images
    setActiveCustomImages([]);
    setSelectedStyleId(id);
    setIsStyleLoading(true);

    const style = PPT_STYLES.find((s) => s.id === id);
    if (!style) return;

    try {
      const promises = style.refs.map((url) => urlToBase64(url));
      const images = await Promise.all(promises);
      setActiveStyleImages(images);
      toast.success(`风格 [${style.title}] 已加载`);
    } catch (error) {
      console.error(error);
      toast.error('加载风格参考图失败');
      setActiveStyleImages([]);
    } finally {
      setIsStyleLoading(false);
    }
  };

  const handleCustomImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Mutually exclusive: clear selected style
    setSelectedStyleId(null);
    setActiveStyleImages([]);

    if (activeCustomImages.length + files.length > 8) {
      toast.error('最多上传 8 张参考图');
      return;
    }

    const newImages: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        newImages.push(await fileToBase64(file));
      }
    }
    setActiveCustomImages([...activeCustomImages, ...newImages]);
    toast.success(`已添加 ${newImages.length} 张自定义参考图`);
  };

  const removeCustomImage = (index: number) => {
    const newImages = [...activeCustomImages];
    newImages.splice(index, 1);
    setActiveCustomImages(newImages);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading('正在解析文件...');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await parseDocumentAction(formData);
      // Append text to prompt or replace? Appending seems safer.
      setPrompt((prev) =>
        (prev ? prev + '\n\n' + result.text : result.text).slice(0, 10000)
      ); // Limit length just in case
      toast.success('文件解析成功，内容已添加到输入框', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('文件解析失败', { id: toastId });
    }
  };

  //   const fixR2Url = (url: string) => {
  //     if (!url) return '';
  //     if (!PUBLIC_R2_DOMAIN) return url;
  //     try {
  //       const u = new URL(url);
  //       if (u.hostname.includes('r2.cloudflarestorage.com')) {
  //         return (
  //           PUBLIC_R2_DOMAIN.replace(/\/$/, '') +
  //           u.pathname.replace('/bananaproimage/', '/')
  //         );
  //       }
  //     } catch (e) {}
  //     return url;
  //   };

  const handleGenerate = async () => {
    // if (!apiKey) {
    //   toast.error('请先填写 API Key');
    //   return;
    // }

    if (!selectedStyleId && activeCustomImages.length === 0) {
      toast.error('请选择风格或上传参考图');
      return;
    }

    if (!prompt.trim()) {
      toast.error('请输入内容提示词');
      return;
    }

    setIsLoading(true);

    // Prepare images
    const imagesToSend = selectedStyleId
      ? activeStyleImages
      : activeCustomImages;
    const style = PPT_STYLES.find((s) => s.id === selectedStyleId);

    // Prepare prompt
    let finalPrompt = prompt.trim();
    const genericSuffix =
      '。---以上是用户输入的提示词，根据用户输入的提示词生成单页PPT。';

    if (isEnhancementEnabled) {
      if (style) {
        finalPrompt += style.suffix;
      }
    } else {
      finalPrompt += genericSuffix;
    }

    // Loop for page count
    // Note: The API generates one image per request. If pageCount > 1, we need multiple requests.
    // However, usually "nano banana" generates one image. If user wants multiple pages, they usually mean multiple slides.
    // Since the prompt is single, generating multiple pages with SAME prompt might result in similar images.
    // But let's support the loop as requested "选定页数".

    const totalPages = Math.max(1, Math.min(10, pageCount));
    let successCount = 0;

    for (let i = 0; i < totalPages; i++) {
      try {
        const payload: any = {
          model: 'google/gemini-3-pro-image-preview',
          prompt: finalPrompt,
          aspect_ratio: ratio,
          image_size: size,
        };

        if (imagesToSend.length > 0) {
          payload.image = imagesToSend;
        }

        const validUrls = await generatePPTAction(undefined, payload);

        if (validUrls && validUrls.length > 0) {
          // 每次API调用只取第一张图片（API有时会返回多张相似的图）
          const firstUrl = validUrls[0];
          const newResult = {
            url: firstUrl,
            prompt: prompt, // Save original user prompt
            timestamp: new Date().toLocaleTimeString(),
          };
          setResults((prev) => [newResult, ...prev]);
          successCount++;
        }
      } catch (error: any) {
        console.error(error);
        toast.error(`第 ${i + 1} 页生成失败: ${error.message}`);
      }
    }

    if (successCount > 0) {
      toast.success(`生成完成，成功 ${successCount} 张`);
    }
    setIsLoading(false);
  };

  const downloadImage = async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ppt-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="flex h-screen w-full flex-col gap-4 overflow-hidden p-4 pt-20 lg:flex-row">
      {/* Left Column: Style Selection */}
      <Card className="flex h-[500px] w-full shrink-0 flex-col overflow-hidden lg:h-full lg:w-[360px]">
        <CardHeader className="bg-muted/30 py-4">
          <CardTitle className="text-sm font-semibold">
            1. 选择 PPT 风格
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 space-y-6 overflow-y-auto p-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-primary font-bold">预设风格</Label>
              <span className="text-muted-foreground text-xs">点击选择</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {PPT_STYLES.map((style) => (
                <div
                  key={style.id}
                  onClick={() => handleStyleSelect(style.id)}
                  className={`group relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all duration-200 ${
                    selectedStyleId === style.id
                      ? 'border-primary shadow-[0_0_0_2px_rgba(var(--primary),0.2)]'
                      : 'hover:border-muted-foreground/50 border-transparent'
                  }`}
                >
                  <div className="bg-muted relative aspect-[16/9]">
                    <Image
                      src={style.preview}
                      alt={style.title}
                      fill
                      className={`object-cover transition-opacity duration-300 ${
                        selectedStyleId === style.id ||
                        (isStyleLoading && selectedStyleId === style.id)
                          ? 'opacity-100'
                          : 'opacity-70 group-hover:opacity-100'
                      }`}
                    />
                    {selectedStyleId === style.id && isStyleLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                  <div className="absolute right-0 bottom-0 left-0 truncate bg-black/70 p-1 text-center text-[10px] text-white">
                    {style.title}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background text-muted-foreground px-2">
                或者
              </span>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-primary font-bold">自定义参考图</Label>
              <span className="text-muted-foreground text-xs">最多 8 张</span>
            </div>

            <div
              className={`cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
                activeCustomImages.length > 0
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={handleCustomImageUpload}
              />
              <Plus className="text-muted-foreground mx-auto mb-2 h-6 w-6" />
              <p className="text-muted-foreground text-xs">
                点击上传风格参考图
              </p>
            </div>

            {activeCustomImages.length > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {activeCustomImages.map((img, idx) => (
                  <div
                    key={idx}
                    className="bg-muted group relative aspect-square overflow-hidden rounded border"
                  >
                    <img
                      src={img}
                      alt="custom ref"
                      className="h-full w-full object-cover"
                    />
                    <div
                      className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCustomImage(idx);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-white" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Center Column: Content Input */}
      <Card className="flex h-full min-w-[300px] flex-1 flex-col overflow-hidden">
        <CardHeader className="bg-muted/30 py-4">
          <CardTitle className="text-sm font-semibold">
            2. 输入内容与设置
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col overflow-y-auto p-4">
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex flex-1 flex-col">
              <div className="mb-2 flex items-center justify-between">
                <Label>输入 PPT 内容</Label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="enhancement"
                      checked={isEnhancementEnabled}
                      onCheckedChange={(c) => setIsEnhancementEnabled(!!c)}
                    />
                    <Label
                      htmlFor="enhancement"
                      className="text-muted-foreground cursor-pointer text-xs font-normal"
                    >
                      提示词增强
                    </Label>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => pdfInputRef.current?.click()}
                  >
                    <Upload className="mr-1 h-3 w-3" />
                    上传文档
                  </Button>
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf,.txt,.md"
                    hidden
                    onChange={handlePdfUpload}
                  />
                </div>
              </div>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="输入 PPT 的内容和风格要求。内容可以非常详实。如果选择了风格或参考图，这里主要描述内容即可。"
                className="flex-1 resize-none text-sm leading-relaxed"
              />
            </div>

            <div className="grid shrink-0 grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>画幅比例</Label>
                <Select value={ratio} onValueChange={setRatio}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PPT_RATIOS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>分辨率</Label>
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PPT_SIZES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>生成页数</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={pageCount}
                  onChange={(e) => setPageCount(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            {/* <div className="bg-muted/50 shrink-0 space-y-2 rounded-lg p-3">
              <Label className="text-muted-foreground text-xs">
                API Key (联系管理员或自行配置)
              </Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="h-8 text-sm"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8"
                  onClick={handleSaveKey}
                >
                  保存
                </Button>
              </div>
            </div> */}
          </div>

          <div className="mt-4 shrink-0 border-t pt-4">
            <Button
              className="h-12 w-full text-lg font-semibold"
              onClick={handleGenerate}
              disabled={isLoading || isStyleLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  AI 设计中...
                </>
              ) : (
                '立即生成'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Right Column: Results */}
      <Card className="flex h-[500px] w-full shrink-0 flex-col overflow-hidden lg:h-full lg:w-[380px]">
        <CardHeader className="bg-muted/30 py-4">
          <CardTitle className="text-sm font-semibold">3. 生成结果</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-4">
          {results.length === 0 ? (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center opacity-50">
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed">
                <ImageIcon className="h-8 w-8" />
              </div>
              <p className="text-sm">暂无生成记录</p>
            </div>
          ) : (
            <div className="space-y-6">
              {results.map((res, idx) => (
                <div
                  key={idx}
                  className="group relative overflow-hidden rounded-lg border bg-black/5"
                >
                  <div className="relative aspect-[16/9] cursor-zoom-in">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Image
                          src={res.url}
                          alt="Result"
                          fill
                          className="object-contain"
                          unoptimized
                        />
                      </DialogTrigger>
                      <DialogContent className="flex h-full max-h-[80vh] w-full max-w-[80vw] items-center justify-center border-none bg-black/90 p-4">
                        <div
                          className="relative flex h-full w-full items-center justify-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <img
                            src={res.url}
                            className="max-h-full max-w-full object-contain shadow-2xl"
                            alt="Preview"
                          />
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Button
                      className="absolute right-2 bottom-2 opacity-0 transition-opacity group-hover:opacity-100"
                      size="sm"
                      onClick={() => downloadImage(res.url)}
                    >
                      <Download className="mr-1 h-4 w-4" />
                      下载
                    </Button>
                  </div>
                  <div className="text-muted-foreground bg-background flex items-center justify-between border-t p-2 text-[10px]">
                    <span>{res.timestamp}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-2 text-[10px]"
                      onClick={() => {
                        navigator.clipboard.writeText(res.prompt);
                        toast.success('Prompt 已复制');
                      }}
                    >
                      复制 Prompt
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
