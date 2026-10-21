import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from './Button.tsx';

interface LinkBoxProps {
  label: string;
  url: string;
  copyLabel: string;
  onCopied: () => void;
  onCopyFailed: () => void;
}

/** "dishpatch.app/e/q8Zp2vN7…kT4w": host and path with the token's middle elided (design/screens/share.png). */
export function shortLink(url: string): string {
  const { host, pathname } = new URL(url);
  const slash = pathname.lastIndexOf('/');
  const token = pathname.slice(slash + 1);
  const short = token.length > 12 ? `${token.slice(0, 8)}…${token.slice(-4)}` : token;
  return `${host}${pathname.slice(0, slash + 1)}${short}`;
}

/**
 * A link in a dashed box with a Copy button. Copy always writes the full URL; if the clipboard is
 * denied the box swaps to the full URL and selects it for a manual copy.
 */
export function LinkBox({ label, url, copyLabel, onCopied, onCopyFailed }: LinkBoxProps) {
  const codeRef = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useLayoutEffect(() => {
    const code = codeRef.current;
    const selection = window.getSelection();
    if (revealed && code && selection) selection.selectAllChildren(code);
  }, [revealed]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      onCopied();
    } catch {
      setRevealed(true);
      const code = codeRef.current;
      const selection = window.getSelection();
      if (revealed && code && selection) selection.selectAllChildren(code);
      onCopyFailed();
    }
  }

  return (
    <fieldset className="min-w-0">
      <legend className="mb-s1 text-sm/[1.5] font-bold">{label}</legend>
      <div className="flex items-center gap-s2 rounded-md border-[1.5px] border-dashed border-border-ui bg-surface-2 p-s3">
        <code
          ref={codeRef}
          className={`min-w-0 flex-1 font-code text-sm/[1.5] ${revealed ? 'break-all' : 'truncate'}`}
        >
          {revealed ? url : shortLink(url)}
        </code>
        <Button variant="secondary" size="sm" aria-label={copyLabel} onClick={copy}>
          Copy
        </Button>
      </div>
    </fieldset>
  );
}
