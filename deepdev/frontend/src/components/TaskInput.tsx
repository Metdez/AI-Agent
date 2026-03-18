'use client';

import { useState } from 'react';
import { Rocket, XCircle, FolderOpen } from 'lucide-react';

interface TaskInputProps {
  isRunning: boolean;
  connected: boolean;
  onStart: (task: string, repoPath: string) => void;
  onCancel: () => void;
}

export default function TaskInput({
  isRunning,
  connected,
  onStart,
  onCancel,
}: TaskInputProps) {
  const [task, setTask] = useState('');
  const [repoPath, setRepoPath] = useState('');

  const handleStart = () => {
    if (!task.trim() || !repoPath.trim()) return;
    onStart(task.trim(), repoPath.trim());
  };

  const canLaunch = connected && !isRunning && task.trim() && repoPath.trim();

  return (
    <div className="border border-white/[0.06] bg-panel rounded-xl p-5 space-y-4">
      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder="Describe what you want to build..."
        rows={3}
        disabled={isRunning}
        className="w-full bg-deepdev border border-white/[0.08] rounded-lg px-4 py-3 text-sm
          text-slate-200 placeholder-slate-500 resize-none
          focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50
          disabled:opacity-50 transition-all"
      />

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="/path/to/repository"
            disabled={isRunning}
            className="w-full bg-deepdev border border-white/[0.08] rounded-lg pl-10 pr-4 py-2.5 text-sm
              text-slate-200 placeholder-slate-500 font-mono
              focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50
              disabled:opacity-50 transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              onClick={onCancel}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                bg-error/10 text-error border border-error/20
                hover:bg-error/20 transition-all"
            >
              <XCircle className="w-4 h-4" />
              Cancel
            </button>
          )}

          <button
            onClick={handleStart}
            disabled={!canLaunch}
            className="btn-glow flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium
              bg-accent text-white
              hover:bg-accent/90 transition-all
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent
              shadow-lg shadow-accent/20"
          >
            <Rocket className="w-4 h-4" />
            Launch Agent
          </button>
        </div>
      </div>
    </div>
  );
}
