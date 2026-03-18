'use client';

import type { CompletionResult } from '@/lib/types';
import { CheckCircle, GitBranch, GitCommit } from 'lucide-react';

interface CompletionBannerProps {
  result: CompletionResult;
}

export default function CompletionBanner({ result }: CompletionBannerProps) {
  return (
    <div className="border border-success/20 bg-success/[0.05] rounded-xl p-4 animate-slide-up">
      <div className="flex items-start gap-3">
        <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-success mb-1">
            Task Complete
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            {result.summary}
          </p>
          <div className="flex items-center gap-4 mt-2.5">
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <GitBranch className="w-3 h-3" />
              <span className="font-mono">{result.branch}</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <GitCommit className="w-3 h-3" />
              {result.commits} commit{result.commits !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
