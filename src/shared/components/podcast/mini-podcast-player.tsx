'use client';

import { Pause, Play, RotateCcw, RotateCw, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import { useMemo } from 'react';

interface MiniPodcastPlayerProps {
  title: string;
  modeLabel?: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
  onPlayToggle: () => void;
  onSeek: (value: number) => void;
  onSkip: (delta: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  onClose?: () => void;
  className?: string;
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export function MiniPodcastPlayer({
  title,
  modeLabel,
  currentTime,
  duration,
  isPlaying,
  playbackRate,
  onPlayToggle,
  onSeek,
  onSkip,
  onPlaybackRateChange,
  onClose,
  className,
}: MiniPodcastPlayerProps) {
  const safeDuration = useMemo(() => (duration > 0 ? duration : 1), [duration]);
  const progress =
    safeDuration > 0 ? Math.min((currentTime / safeDuration) * 100, 100) : 0;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl bg-background/85 p-2 text-foreground backdrop-blur-xl md:gap-4',
        className
      )}
    >
      {/* Play button */}
      <Button
        variant="default"
        size="icon"
        className="shadow-primary/20 h-12 w-12 shrink-0 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
        onClick={onPlayToggle}
      >
        {isPlaying ? (
          <Pause className="h-5 w-5 fill-current" />
        ) : (
          <Play className="ml-0.5 h-5 w-5 fill-current" />
        )}
      </Button>

      {/* Middle info */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-1">
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <h4 className="truncate text-sm font-semibold leading-none">
              {title}
            </h4>
            {modeLabel && (
              <span className="bg-primary/10 text-primary shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium">
                {modeLabel}
              </span>
            )}
          </div>
          <div className="text-muted-foreground shrink-0 text-[10px] font-medium tabular-nums">
            <span className="text-foreground">{formatTime(currentTime)}</span>
            <span className="mx-1 text-muted-foreground/50">/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="group/slider relative flex h-3 w-full items-center">
          <div className="bg-secondary/50 dark:bg-muted/30 absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 rounded-full" />
          <input
            type="range"
            min={0}
            max={safeDuration}
            value={Math.min(currentTime, safeDuration)}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="relative z-10 h-1 w-full cursor-pointer appearance-none rounded-full bg-transparent focus:outline-none"
            style={{
              background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${progress}%, transparent ${progress}%, transparent 100%)`,
            }}
          />
        </div>
      </div>

      {/* Right controls */}
      <div className="flex shrink-0 items-center gap-1 pr-2">
        <div className="hidden items-center gap-1 sm:flex">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => onSkip(-10)}
            title="后退10秒"
          >
            <div className="flex flex-col items-center justify-center gap-0.5">
              <RotateCcw className="h-4 w-4" />
              <span className="text-[8px] font-bold leading-none">10</span>
            </div>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => onSkip(10)}
            title="前进10秒"
          >
            <div className="flex flex-col items-center justify-center gap-0.5">
              <RotateCw className="h-4 w-4" />
              <span className="text-[8px] font-bold leading-none">10</span>
            </div>
          </Button>

          <div className="mx-1 h-4 w-px bg-border/50" />

          <select
            value={playbackRate}
            onChange={(e) => onPlaybackRateChange(parseFloat(e.target.value))}
            className="h-7 cursor-pointer rounded-md bg-transparent px-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none"
          >
            {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </div>

        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground transition-colors hover:text-foreground sm:hidden"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

