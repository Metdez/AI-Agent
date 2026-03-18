'use client';

import { useEffect, useRef } from 'react';
import type { TerminalLine } from '@/lib/types';
import { Terminal } from 'lucide-react';

interface TerminalOutputProps {
  lines: TerminalLine[];
  isRunning: boolean;
}

export default function TerminalOutput({
  lines,
  isRunning,
}: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  if (lines.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        <div className="text-center space-y-2">
          <Terminal className="w-8 h-8 mx-auto opacity-30" />
          <p>Waiting for agent to start...</p>
          <p className="text-xs text-slate-700">
            Command output will stream here in real-time
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto bg-[#0c0c12] p-4 font-mono text-xs leading-relaxed"
    >
      {lines.map((line, i) => (
        <div
          key={i}
          className={`animate-fade-in whitespace-pre-wrap break-all ${
            line.stream === 'stderr' ? 'text-error/90' : 'text-green-300/80'
          }`}
        >
          {line.output}
        </div>
      ))}

      {isRunning && (
        <span className="terminal-cursor text-green-400/80 text-xs">
          {' '}
        </span>
      )}
    </div>
  );
}
