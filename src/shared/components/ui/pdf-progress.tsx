'use client';

import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

type ProgressStatus = 'uploading' | 'processing' | 'analyzing' | 'completed' | 'error';

interface PdfProgressProps {
  status: ProgressStatus;
  progress?: number;
  message?: string;
  className?: string;
}

const statusConfig = {
  uploading: {
    icon: Loader2,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    defaultMessage: 'Uploading PDF file...'
  },
  processing: {
    icon: Loader2,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20',
    defaultMessage: 'Processing PDF content...'
  },
  analyzing: {
    icon: Loader2,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    defaultMessage: 'Analyzing content with AI...'
  },
  completed: {
    icon: CheckCircle,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    defaultMessage: 'Analysis completed!'
  },
  error: {
    icon: AlertCircle,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    defaultMessage: 'An error occurred'
  }
};

export function PdfProgress({
  status,
  progress = 0,
  message,
  className
}: PdfProgressProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const displayMessage = message || config.defaultMessage;
  const isLoading = status === 'uploading' || status === 'processing' || status === 'analyzing';

  return (
    <div className={cn(
      'w-full max-w-md mx-auto p-4 rounded-lg border backdrop-blur-sm',
      config.bgColor,
      config.borderColor,
      className
    )}>
      <div className="flex items-center space-x-3">
        <Icon className={cn(
          'w-5 h-5 flex-shrink-0',
          config.color,
          isLoading && 'animate-spin'
        )} />

        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-sm font-medium',
            status === 'error' ? 'text-red-200' : 'text-gray-200'
          )}>
            {displayMessage}
          </p>

          {isLoading && progress > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}