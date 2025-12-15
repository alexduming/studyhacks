'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCompletion } from '@ai-sdk/react';
import {
  createKieTaskAction,
  parsePdfAction,
  queryKieTaskAction,
} from '@/app/actions/aippt';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  Eye,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
  Presentation,
} from 'lucide-react';
import { toast } from 'sonner';

import { PPT_RATIOS, PPT_SIZES, PPT_STYLES } from '@/config/aippt';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
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
import { cn } from '@/shared/lib/utils';

// Types
interface SlideData {
  id: string;
  title: string;
  content: string;
  visualDescription: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  imageUrl?: string;
  taskId?: string;
}

type Step = 'input' | 'outline' | 'style' | 'result';

export default function AIPPTPage() {
  const t = useTranslations('aippt');

  // --- State ---
  const [currentStep, setCurrentStep] = useState<Step>('input');
  
  // Input Step State
  const [inputMode, setInputMode] = useState('text');
  const [inputText, setInputText] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  // Remove manual isAnalyzing, useCompletion handles it
  
  // Outline Step State
  const [slides, setSlides] = useState<SlideData[]>([]);

  // Style Step State
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [customImages, setCustomImages] = useState<string[]>([]); // Base64 for preview
  const [customImageFiles, setCustomImageFiles] = useState<File[]>([]); // Actual files for upload
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('4K');
  const [isGenerating, setIsGenerating] = useState(false);

  // Result State
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // --- Streaming Hook ---
  const { complete, completion, isLoading: isAnalyzing, setCompletion } = useCompletion({
    api: '/api/ai/analyze-ppt',
    streamProtocol: 'text', // 使用文本流协议而不是数据流协议
    onFinish: (prompt, result) => {
        console.log('[Frontend] Stream finished, result length:', result.length);
        console.log('[Frontend] Raw result:', result.substring(0, 200));
        
        try {
            // Clean up code blocks if present
            let cleanJson = result.replace(/```json/g, '').replace(/```/g, '').trim();
            // Find array start/end if extra text exists
            const startIndex = cleanJson.indexOf('[');
            const endIndex = cleanJson.lastIndexOf(']');
            if (startIndex !== -1 && endIndex !== -1) {
                cleanJson = cleanJson.substring(startIndex, endIndex + 1);
            }

            console.log('[Frontend] Attempting to parse:', cleanJson.substring(0, 200));
            const parsed = JSON.parse(cleanJson);
            if (Array.isArray(parsed)) {
                const initialSlides: SlideData[] = parsed.map((item: any, idx: number) => ({
                    id: `slide-${Date.now()}-${idx}`,
                    title: item.title,
                    content: item.content,
                    visualDescription: item.visualDescription,
                    status: 'pending',
                }));
                setSlides(initialSlides);
                console.log('[Frontend] Successfully parsed', initialSlides.length, 'slides');
                // Auto advance to outline step on success
                setTimeout(() => setCurrentStep('outline'), 1000);
            } else {
                console.error('[Frontend] Parsed result is not an array:', parsed);
                toast.error(t('errors.invalid_outline'));
            }
        } catch (e: any) {
            console.error("[Frontend] Parse Error:", e);
            console.error("[Frontend] Failed content:", result);
            toast.error(t('errors.invalid_outline') + ': ' + e.message);
        }
    },
    onError: (err) => {
        console.error("[Frontend] Stream Error:", err);
        toast.error(t('errors.general_failed') + ': ' + err.message);
    }
  });

  // Effect to attempt parsing streaming partial JSON (optional visual candy)
  // slidedeck does this, showing the outline building up. 
  // For simplicity, we can just show the raw text stream for now, 
  // or implementing a robust partial parser (which is complex).
  // We'll stick to showing the raw stream "Matrix style" as requested.

  // --- Helpers ---
  const uploadImage = async (blob: Blob, filename: string) => {
    const formData = new FormData();
    formData.append('files', blob, filename);
    const res = await fetch('/api/storage/upload-image', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (data.code !== 0) throw new Error(data.message || 'Upload failed');
    return data.data.urls[0] as string;
  };

  const handleDownloadPPTX = async () => {
    try {
        // Dynamically import pptxgenjs to avoid SSR issues
        const PptxGenJS = (await import('pptxgenjs')).default;
        const pres = new PptxGenJS();

        // Sort slides by index (they are already sorted in array)
        for (const slide of slides) {
            const pptSlide = pres.addSlide();
            
            // Add Background Image if completed
            if (slide.status === 'completed' && slide.imageUrl) {
                pptSlide.background = { path: slide.imageUrl };
            } else {
                // Fallback background
                pptSlide.background = { color: 'FFFFFF' };
            }

            // We do NOT add text overlay if the image already "contains" it conceptually,
            // BUT the KIE generation is purely background/visual usually.
            // If the user wants the text on the slide, we should add it.
            // The prompt said "DO NOT include text in the image description", so the image is likely clean.
            // So we should add Title and Content as text boxes.
            
            // Title
            pptSlide.addText(slide.title, {
                x: 0.5, y: 0.5, w: '90%', h: 1,
                fontSize: 32, bold: true, color: 'FFFFFF',
                shadow: { type: 'outer', color: '000000', blur: 3, offset: 2 }
            });

            // Content
            pptSlide.addText(slide.content, {
                x: 0.5, y: 1.8, w: '90%', h: 3.5,
                fontSize: 18, color: 'FFFFFF',
                bullet: true,
                shadow: { type: 'outer', color: '000000', blur: 2, offset: 1 }
            });
        }

        pres.writeFile({ fileName: `Presentation-${Date.now()}.pptx` });
        toast.success("PPTX Downloaded!");
    } catch (e) {
        console.error("PPT Gen Error:", e);
        toast.error("Failed to generate PPTX");
    }
  };

  // --- Handlers ---

  // Step 1: Analyze Content
  const handleAnalyze = async () => {
    if (inputMode === 'text' && !inputText.trim()) {
      toast.error(t('errors.input_required'));
      return;
    }
    if (inputMode === 'pdf' && !uploadedFile) {
      toast.error(t('errors.input_required'));
      return;
    }

    try {
      let contentToAnalyze = inputText;

      if (inputMode === 'pdf' && uploadedFile) {
        // We still use server action for PDF parsing as it requires server-side libs
        const formData = new FormData();
        formData.append('file', uploadedFile);
        contentToAnalyze = await parsePdfAction(formData);
      }

      // Start Streaming
      complete(contentToAnalyze);
      
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || t('errors.general_failed'));
    }
  };

  // Step 2: Outline Actions
  const handleUpdateSlide = (id: string, field: 'title' | 'content', value: string) => {
    setSlides((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleAddSlide = () => {
    const newSlide: SlideData = {
      id: `slide-${Date.now()}-new`,
      title: 'New Slide',
      content: 'Add content points here...',
      visualDescription: 'A generic presentation background',
      status: 'pending',
    };
    setSlides([...slides, newSlide]);
  };

  const handleRemoveSlide = (id: string) => {
    setSlides(slides.filter((s) => s.id !== id));
  };

  const handleOutlineConfirm = () => {
    if (slides.length === 0) {
      toast.error(t('errors.input_required')); // Reuse error or add specific one
      return;
    }
    setCurrentStep('style');
  };

  // Step 3: Style Actions
  const handleStyleSelect = (id: string) => {
    if (selectedStyleId === id) {
      setSelectedStyleId(null);
    } else {
      setSelectedStyleId(id);
      setCustomImages([]); // Clear custom if preset selected
      setCustomImageFiles([]);
    }
  };

  const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedStyleId(null);
      const files = Array.from(e.target.files);
      if (customImages.length + files.length > 8) {
        toast.error(t('errors.upload_limit'));
        return;
      }

      // Store files for upload
      setCustomImageFiles(prev => [...prev, ...files]);

      // Generate previews
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
            setCustomImages((prev) => [...prev, ev.target!.result as string]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleStartGeneration = async () => {
    setIsGenerating(true);
    setCurrentStep('result');

    try {
        // Prepare Style Images (Upload to public URL)
        let styleImageUrls: string[] = [];

        if (selectedStyleId) {
            // Case 1: Preset Style
            const style = PPT_STYLES.find((s) => s.id === selectedStyleId);
            if (style && style.refs) {
                // Fetch preset images and upload them
                styleImageUrls = await Promise.all(
                    style.refs.map(async (url) => {
                        const res = await fetch(url);
                        const blob = await res.blob();
                        // Extract filename from URL
                        const filename = url.split('/').pop() || 'style-ref.png';
                        return await uploadImage(blob, filename);
                    })
                );
            }
        } else if (customImageFiles.length > 0) {
            // Case 2: Custom Uploads
            styleImageUrls = await Promise.all(
                customImageFiles.map(async (file) => {
                    return await uploadImage(file, file.name);
                })
            );
        }

        // Launch generation for all slides
        const promises = slides.map(async (slide, index) => {
            try {
                // Update status to generating
                setSlides(prev => prev.map(s => s.id === slide.id ? { ...s, status: 'generating' } : s));

                const taskData = await createKieTaskAction({
                    prompt: slide.visualDescription,
                    styleId: selectedStyleId || undefined,
                    aspectRatio,
                    imageSize: resolution,
                    customImages: styleImageUrls, // Pass Public URLs
                });

                if (!taskData.task_id) throw new Error(t('errors.no_task_id'));

                // Poll
                let resultUrl = '';
                let attempts = 0;
                while (attempts < 60) {
                    await new Promise((r) => setTimeout(r, 2000));
                    const statusRes = await queryKieTaskAction(taskData.task_id);
                    const status = statusRes.data?.status;

                    if (status === 'SUCCESS' || (statusRes.data?.results && statusRes.data.results.length > 0)) {
                       const imgs = statusRes.data?.results || [];
                       if (imgs.length > 0) {
                           resultUrl = imgs[0];
                           break;
                       }
                    } else if (status === 'FAILED') {
                        throw new Error(t('errors.generation_failed'));
                    }
                    attempts++;
                }

                if (resultUrl) {
                    setSlides(prev => prev.map(s => s.id === slide.id ? { ...s, status: 'completed', imageUrl: resultUrl } : s));
                } else {
                    throw new Error(t('errors.timeout'));
                }

            } catch (e) {
                console.error(`Slide ${index} error:`, e);
                setSlides(prev => prev.map(s => s.id === slide.id ? { ...s, status: 'failed' } : s));
            }
        });

        await Promise.all(promises);

    } catch (e: any) {
        console.error('Generation Prep Error:', e);
        toast.error(e.message || t('errors.general_failed'));
        // Mark all as failed if prep fails
        setSlides(prev => prev.map(s => s.status === 'pending' ? { ...s, status: 'failed' } : s));
    } finally {
        setIsGenerating(false);
    }
  };


  // --- Render Functions ---

  const renderStepsIndicator = () => {
    const steps: { id: Step; label: string }[] = [
      { id: 'input', label: t('steps.input') },
      { id: 'outline', label: t('steps.outline') },
      { id: 'style', label: t('steps.style') },
      { id: 'result', label: t('steps.result') },
    ];

    const currentIndex = steps.findIndex(s => s.id === currentStep);

    return (
      <div className="mb-12 flex justify-center">
        <div className="flex items-center space-x-4">
          {steps.map((step, idx) => (
            <div key={step.id} className="flex items-center">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors",
                  idx <= currentIndex
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {idx + 1}
              </div>
              <span
                className={cn(
                  "ml-2 text-sm font-medium hidden sm:block",
                  idx <= currentIndex ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
              {idx < steps.length - 1 && (
                <div className="mx-4 h-[1px] w-8 bg-border hidden sm:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Step 1: Input View
  const renderInputStep = () => (
    <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Input Column */}
      <Card className="bg-card/50 p-8 backdrop-blur shadow-lg">
        <h2 className="mb-2 text-center text-2xl font-bold">{t('input_step.title')}</h2>
        <div className="mb-8 text-center text-muted-foreground"></div>

        <Tabs value={inputMode} onValueChange={setInputMode} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="text">{t('input_step.tabs.text')}</TabsTrigger>
            <TabsTrigger value="pdf">{t('input_step.tabs.pdf')}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="text" className="mt-0">
            <Textarea
              placeholder={t('input_step.placeholder')}
              className="min-h-[300px] text-lg p-4 resize-y"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </TabsContent>
          
          <TabsContent value="pdf" className="mt-0">
            <div className="hover:bg-muted/50 rounded-lg border-2 border-dashed p-16 text-center transition-colors">
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                className="hidden"
                id="pdf-upload-step"
              />
              <label htmlFor="pdf-upload-step" className="cursor-pointer block">
                <Upload className="text-muted-foreground mx-auto mb-4 h-16 w-16" />
                <div className="text-xl font-medium mb-2">
                  {uploadedFile ? uploadedFile.name : t('input_step.upload_hint')}
                </div>
                <div className="text-muted-foreground">
                  {t('input_step.upload_subhint')}
                </div>
              </label>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-8 flex justify-center">
          <Button
            size="lg"
            className="w-full md:w-auto px-12 py-6 text-lg"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t('input_step.analyzing')}
              </>
            ) : (
              t('input_step.button_analyze')
            )}
          </Button>
        </div>
      </Card>

      {/* Streaming Output Column (Visible when analyzing or has content) */}
      {(isAnalyzing || completion) && (
          <div className="bg-black/90 p-6 rounded-lg border border-primary/20 overflow-hidden flex flex-col h-[500px] md:h-auto">
              <h3 className="text-primary/70 text-xs font-mono uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Loader2 className={cn("h-3 w-3", isAnalyzing ? "animate-spin" : "")} />
                  Live Inference Stream
              </h3>
              <div className="flex-1 overflow-y-auto font-mono text-xs text-green-500/80 whitespace-pre-wrap leading-relaxed">
                  {completion}
                  {isAnalyzing && <span className="animate-pulse inline-block w-2 h-4 bg-green-500/50 ml-1 align-middle"></span>}
              </div>
          </div>
      )}
    </div>
  );

  // Step 2: Outline View
  const renderOutlineStep = () => (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
           <h2 className="text-2xl font-bold">{t('outline_step.title')}</h2>
           <p className="text-muted-foreground">{t('outline_step.description')}</p>
        </div>
        <div className="flex gap-3">
             <Button variant="outline" onClick={() => {
                 setCompletion(''); // Clear previous completion
                 setCurrentStep('input');
             }}>
                 <ArrowLeft className="mr-2 h-4 w-4" /> Back
             </Button>
             <Button onClick={handleOutlineConfirm}>
                 {t('outline_step.button_next')} <ArrowRight className="ml-2 h-4 w-4" />
             </Button>
        </div>
      </div>

      <div className="space-y-4">
        {slides.map((slide, index) => (
          <Card key={slide.id} className="p-6 relative group hover:border-primary/50 transition-colors">
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleRemoveSlide(slide.id)}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
            
            <div className="flex gap-4">
               <div className="flex-shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-muted-foreground">
                   {index + 1}
               </div>
               <div className="flex-grow space-y-4">
                  <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">{t('outline_step.slide_title')}</label>
                      <Input 
                        value={slide.title} 
                        onChange={(e) => handleUpdateSlide(slide.id, 'title', e.target.value)}
                        className="font-semibold text-lg"
                      />
                  </div>
                  <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">{t('outline_step.slide_content')}</label>
                      <Textarea 
                        value={slide.content} 
                        onChange={(e) => handleUpdateSlide(slide.id, 'content', e.target.value)}
                        className="min-h-[100px]"
                      />
                  </div>
               </div>
            </div>
          </Card>
        ))}

        <Button variant="outline" className="w-full border-dashed py-8" onClick={handleAddSlide}>
            <Plus className="mr-2 h-4 w-4" /> {t('outline_step.add_slide')}
        </Button>
      </div>
      
      <div className="mt-8 flex justify-end">
          <Button size="lg" onClick={handleOutlineConfirm}>
             {t('outline_step.button_next')} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
      </div>
    </div>
  );

  // Step 3: Style View
  const renderStyleStep = () => (
    <div className="mx-auto max-w-6xl">
       <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
           <h2 className="text-2xl font-bold">{t('style_step.title')}</h2>
           <p className="text-muted-foreground">{t('style_step.subtitle')}</p>
        </div>
        <div className="flex gap-3">
             <Button variant="outline" onClick={() => setCurrentStep('outline')}>
                 <ArrowLeft className="mr-2 h-4 w-4" /> Back
             </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         {/* Settings Column */}
         <div className="lg:col-span-1 space-y-6">
             <Card className="p-6">
                 <h3 className="font-semibold mb-4">Presentation Settings</h3>
                 
                 <div className="space-y-4">
                     <div>
                        <label className="mb-2 block text-sm font-medium">{t('style_step.settings.ratio')}</label>
                        <Select value={aspectRatio} onValueChange={setAspectRatio}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {PPT_RATIOS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                     </div>
                     <div>
                        <label className="mb-2 block text-sm font-medium">{t('style_step.settings.resolution')}</label>
                        <Select value={resolution} onValueChange={setResolution}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {PPT_SIZES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                     </div>
                 </div>
             </Card>

             <Card className="p-6">
                <h3 className="font-semibold mb-4">{t('style_step.custom_upload')}</h3>
                <div
                    className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
                      customImages.length > 0 ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/50'
                    }`}
                  >
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleCustomImageUpload}
                      className="hidden"
                      id="custom-upload-step"
                    />
                    <label htmlFor="custom-upload-step" className="block cursor-pointer">
                      <Upload className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
                      <span className="text-muted-foreground text-sm">{t('style_step.subtitle')}</span>
                      <p className="text-xs text-muted-foreground mt-1">{t('style_step.upload_limit_hint')}</p>
                    </label>
                </div>
                 {customImages.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {customImages.map((img, i) => (
                        <div key={i} className="relative h-16 w-16 overflow-hidden rounded border">
                          <img src={img} className="h-full w-full object-cover" />
                          <button
                            onClick={() => {
                                setCustomImages((prev) => prev.filter((_, idx) => idx !== i));
                                setCustomImageFiles((prev) => prev.filter((_, idx) => idx !== i));
                            }}
                            className="absolute top-0 right-0 rounded-bl bg-black/70 p-0.5 text-white"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
             </Card>
             
             <Button className="w-full py-6 text-lg" size="lg" onClick={handleStartGeneration}>
                 {t('style_step.button_generate')}
             </Button>
         </div>

         {/* Style Grid */}
         <div className="lg:col-span-2">
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 {PPT_STYLES.map((style) => (
                    <div
                      key={style.id}
                      onClick={() => handleStyleSelect(style.id)}
                      className={cn(
                        "relative cursor-pointer overflow-hidden rounded-xl border-2 transition-all group",
                        selectedStyleId === style.id
                          ? "border-primary ring-2 ring-primary/20 scale-[1.02]"
                          : "border-transparent hover:border-primary/50"
                      )}
                    >
                      <div className="bg-muted relative aspect-video">
                        <Image
                          src={style.preview}
                          alt={style.title}
                          fill
                          className="object-cover transition-transform group-hover:scale-105"
                          unoptimized
                        />
                        {selectedStyleId === style.id && (
                            <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                                <Check className="h-4 w-4" />
                            </div>
                        )}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12">
                         <span className="text-white font-medium">{style.title}</span>
                      </div>
                    </div>
                  ))}
             </div>
         </div>
      </div>
    </div>
  );

  // Step 4: Result View
  const renderResultStep = () => (
      <div className="mx-auto max-w-7xl">
         <div className="mb-8 flex flex-col md:flex-row items-center justify-between">
             <h2 className="text-2xl font-bold">{t('result_step.title')}</h2>
             <div className="flex gap-4">
                 <Button variant="outline" onClick={() => setCurrentStep('input')}>
                     {t('result_step.back_home')}
                 </Button>
                 {slides.some(s => s.status === 'completed') && (
                     <Button variant="secondary" onClick={handleDownloadPPTX}>
                         <Presentation className="mr-2 h-4 w-4" /> Export PPTX
                     </Button>
                 )}
                 {slides.every(s => s.status === 'completed') && (
                     <Button onClick={() => slides.forEach(s => s.imageUrl && window.open(s.imageUrl, '_blank'))}>
                         <Download className="mr-2 h-4 w-4" /> {t('result_step.download_all')}
                     </Button>
                 )}
             </div>
         </div>

         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
             {slides.map((slide, index) => (
                 <Card key={slide.id} className="overflow-hidden group">
                     <div className="relative aspect-video bg-muted flex items-center justify-center">
                         {slide.status === 'completed' && slide.imageUrl ? (
                             <>
                                <Image 
                                    src={slide.imageUrl} 
                                    alt={slide.title} 
                                    fill 
                                    className="object-contain" 
                                    unoptimized
                                    onClick={() => setLightboxUrl(slide.imageUrl!)}
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                     <Button size="sm" variant="secondary" onClick={() => setLightboxUrl(slide.imageUrl!)}>
                                         <Eye className="mr-1 h-4 w-4" /> {t('result_step.preview')}
                                     </Button>
                                     <Button size="sm" variant="secondary" onClick={() => window.open(slide.imageUrl, '_blank')}>
                                         <Download className="mr-1 h-4 w-4" /> {t('result_step.download')}
                                     </Button>
                                </div>
                             </>
                         ) : (
                             <div className="text-center p-6">
                                 {slide.status === 'generating' || slide.status === 'pending' ? (
                                     <>
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
                                        <p className="text-sm text-muted-foreground">{t('result_step.status.generating')}</p>
                                     </>
                                 ) : (
                                     <div className="text-destructive">
                                         <X className="h-8 w-8 mx-auto mb-2" />
                                         <p className="text-sm">{t('result_step.status.failed')}</p>
                                     </div>
                                 )}
                             </div>
                         )}
                     </div>
                     <div className="p-4">
                         <h3 className="font-semibold truncate mb-1">{index + 1}. {slide.title}</h3>
                         <p className="text-xs text-muted-foreground line-clamp-2">{slide.content}</p>
                     </div>
                 </Card>
             ))}
         </div>
      </div>
  );

  return (
    <div className="container mx-auto min-h-screen px-4 pt-24 pb-8 lg:px-8 lg:pt-28">
      <div className="mb-8 text-center">
        <h1 className="via-primary/80 to-primary/60 mb-2 bg-gradient-to-r from-white bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
          {t('title')}
        </h1>
      </div>

      {renderStepsIndicator()}

      <div className="mt-8">
        {currentStep === 'input' && renderInputStep()}
        {currentStep === 'outline' && renderOutlineStep()}
        {currentStep === 'style' && renderStyleStep()}
        {currentStep === 'result' && renderResultStep()}
      </div>

       {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="hover:text-primary absolute top-4 right-4 text-white"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-8 w-8" />
          </button>
          <img
            src={lightboxUrl}
            className="max-h-full max-w-full object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-8 flex gap-4">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                window.open(lightboxUrl, '_blank');
              }}
            >
              <Download className="mr-2 h-4 w-4" />{' '}
              {t('result_step.download')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
