'use client';

import { useState, useEffect, useRef } from 'react';
import type { CodeChange } from '@/lib/types';
import {
  File,
  FolderOpen,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';

interface CodeViewerProps {
  codeChanges: CodeChange[];
}

// Basic syntax highlighting — no external libraries
function highlightSyntax(code: string): string {
  // Escape HTML first
  let html = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Comments (single line # and //)
  html = html.replace(
    /(#.*$|\/\/.*$)/gm,
    '<span class="syntax-comment">$1</span>',
  );

  // Strings (double and single quoted)
  html = html.replace(
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
    '<span class="syntax-string">$1</span>',
  );

  // Keywords
  const keywords =
    /\b(import|from|export|default|const|let|var|function|class|return|if|else|for|while|try|catch|async|await|def|self|None|True|False|yield|with|as|in|not|and|or|is|raise|except|finally|pass|break|continue|lambda|type|interface|extends|implements)\b/g;
  html = html.replace(keywords, '<span class="syntax-keyword">$1</span>');

  // Numbers
  html = html.replace(
    /\b(\d+\.?\d*)\b/g,
    '<span class="syntax-number">$1</span>',
  );

  return html;
}

function actionBadge(action: string) {
  switch (action) {
    case 'create':
      return (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-success/15 text-success uppercase tracking-wide">
          Create
        </span>
      );
    case 'modify':
      return (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning/15 text-warning uppercase tracking-wide">
          Modify
        </span>
      );
    case 'delete':
      return (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-error/15 text-error uppercase tracking-wide">
          Delete
        </span>
      );
    default:
      return null;
  }
}

interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: FileTreeNode[];
  change?: CodeChange;
}

function buildFileTree(changes: CodeChange[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const seen = new Set<string>();

  // Deduplicate: keep the latest change per file
  const latestByFile = new Map<string, CodeChange>();
  for (const c of changes) {
    latestByFile.set(c.file, c);
  }

  const entries = Array.from(latestByFile.entries());
  for (const [filePath, change] of entries) {
    const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const partPath = parts.slice(0, i + 1).join('/');
      const isFile = i === parts.length - 1;

      if (!seen.has(partPath)) {
        seen.add(partPath);
        const node: FileTreeNode = {
          name: parts[i],
          path: partPath,
          isDir: !isFile,
          children: [],
          change: isFile ? change : undefined,
        };
        current.push(node);
      }

      const existing = current.find((n) => n.path === partPath);
      if (existing) {
        current = existing.children;
      }
    }
  }

  return root;
}

function FileTreeItem({
  node,
  depth,
  selectedFile,
  onSelect,
}: {
  node: FileTreeNode;
  depth: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isSelected = selectedFile === node.path;

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 w-full px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-panel-hover rounded transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 flex-shrink-0" />
          )}
          <FolderOpen className="w-3 h-3 flex-shrink-0 text-accent/60" />
          <span className="truncate">{node.name}</span>
        </button>
        {expanded &&
          node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelect={onSelect}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`flex items-center gap-1.5 w-full px-2 py-1 text-xs rounded transition-colors ${
        isSelected
          ? 'bg-accent/10 text-accent-glow'
          : 'text-slate-400 hover:text-slate-200 hover:bg-panel-hover'
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <File className="w-3 h-3 flex-shrink-0" />
      <span className="truncate flex-1 text-left">{node.name}</span>
      {node.change && actionBadge(node.change.action)}
    </button>
  );
}

export default function CodeViewer({ codeChanges }: CodeViewerProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tree = buildFileTree(codeChanges);

  // Auto-select latest file
  useEffect(() => {
    if (codeChanges.length > 0) {
      const latest = codeChanges[codeChanges.length - 1];
      setSelectedFile(latest.file.replace(/\\/g, '/').replace(/^\//, ''));
    }
  }, [codeChanges]);

  // Find the selected change (latest version)
  const selectedChange = selectedFile
    ? [...codeChanges]
        .reverse()
        .find(
          (c) =>
            c.file.replace(/\\/g, '/').replace(/^\//, '') === selectedFile,
        )
    : null;

  if (codeChanges.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        <div className="text-center space-y-2">
          <Code2Icon className="w-8 h-8 mx-auto opacity-30" />
          <p>No code changes yet</p>
          <p className="text-xs text-slate-700">
            Files will appear here as the coder agent works
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* File tree sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-white/[0.06] overflow-y-auto py-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 px-3 mb-1">
          Modified Files
        </h4>
        {tree.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            selectedFile={selectedFile}
            onSelect={setSelectedFile}
          />
        ))}
      </div>

      {/* Code content */}
      <div className="flex-1 min-w-0 overflow-auto" ref={contentRef}>
        {selectedChange ? (
          <div>
            {/* File header */}
            <div className="sticky top-0 flex items-center justify-between px-4 py-2 bg-panel border-b border-white/[0.06] z-10">
              <span className="text-xs font-mono text-slate-400 truncate">
                {selectedChange.file}
              </span>
              {actionBadge(selectedChange.action)}
            </div>

            {/* Code */}
            <div className="p-4">
              <pre className="text-xs leading-relaxed font-mono">
                {selectedChange.content.split('\n').map((line, i) => (
                  <div key={i} className="flex hover:bg-white/[0.02]">
                    <span className="w-10 flex-shrink-0 text-right pr-4 text-slate-600 select-none">
                      {i + 1}
                    </span>
                    <code
                      dangerouslySetInnerHTML={{
                        __html: highlightSyntax(line),
                      }}
                    />
                  </div>
                ))}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm">
            Select a file to view
          </div>
        )}
      </div>
    </div>
  );
}

// Small inline icon to avoid import issues in the empty state
function Code2Icon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m18 16 4-4-4-4" />
      <path d="m6 8-4 4 4 4" />
      <path d="m14.5 4-5 16" />
    </svg>
  );
}
