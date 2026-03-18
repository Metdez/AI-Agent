'use client';

import { useEffect, useRef } from 'react';
import type { ThinkingEvent } from '@/lib/types';
import { Brain } from 'lucide-react';

interface ThinkingPanelProps {
  thinkingEvents: ThinkingEvent[];
}

const AGENT_COLORS: Record<string, string> = {
  supervisor: 'text-purple-400',
  planner: 'text-blue-400',
  coder: 'text-green-400',
  tester: 'text-yellow-400',
  fixer: 'text-orange-400',
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function ThinkingPanel({
  thinkingEvents,
}: ThinkingPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [thinkingEvents]);

  if (thinkingEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        <div className="text-center space-y-2">
          <Brain className="w-8 h-8 mx-auto opacity-30" />
          <p>Agent thoughts will appear here</p>
          <p className="text-xs text-slate-700">
            See what the agents are reasoning about in real-time
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto p-4 space-y-3">
      {thinkingEvents.map((event, i) => (
        <div key={i} className="animate-fade-in">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wide ${
                AGENT_COLORS[event.agent] || 'text-slate-400'
              }`}
            >
              {event.agent}
            </span>
            <span className="text-[10px] text-slate-600 font-mono">
              {formatTime(event.timestamp)}
            </span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed border-l-2 border-white/[0.06] pl-3">
            {event.content}
          </p>
        </div>
      ))}
    </div>
  );
}
