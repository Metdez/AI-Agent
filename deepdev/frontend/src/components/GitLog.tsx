'use client';

import type { GitEvent } from '@/lib/types';
import { GitBranch, GitCommit } from 'lucide-react';

interface GitLogProps {
  gitEvents: GitEvent[];
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function GitLog({ gitEvents }: GitLogProps) {
  if (gitEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        <div className="text-center space-y-2">
          <GitBranch className="w-8 h-8 mx-auto opacity-30" />
          <p>No git activity yet</p>
          <p className="text-xs text-slate-700">
            Branches and commits will appear here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-1 overflow-y-auto h-full">
      {gitEvents.map((event, i) => (
        <div
          key={i}
          className="flex items-start gap-3 py-2.5 animate-fade-in"
        >
          {/* Timeline dot and line */}
          <div className="flex flex-col items-center pt-0.5">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                event.action === 'branch'
                  ? 'bg-accent/15 text-accent-glow'
                  : 'bg-success/10 text-success'
              }`}
            >
              {event.action === 'branch' ? (
                <GitBranch className="w-3.5 h-3.5" />
              ) : (
                <GitCommit className="w-3.5 h-3.5" />
              )}
            </div>
            {i < gitEvents.length - 1 && (
              <div className="w-px h-full min-h-[16px] bg-white/[0.06] mt-1" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-200 font-medium">
                {event.action === 'branch'
                  ? 'Branch created'
                  : 'Commit'}
              </span>
              <span className="text-[10px] text-slate-600 font-mono">
                {formatTime(event.timestamp)}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {event.message}
            </p>
            {event.branch && (
              <span className="inline-flex items-center gap-1 mt-1 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-glow font-mono">
                <GitBranch className="w-2.5 h-2.5" />
                {event.branch}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
