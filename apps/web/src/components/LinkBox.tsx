import { useRef } from 'react';
import { Button } from './Button.tsx';

interface LinkBoxProps {
  label: string;
  url: string;
  copyLabel: string;
  onCopied: () => void;
  onCopyFailed: () => void;
}

/** A link in a dashed box with a Copy button; if the clipboard is denied the text gets selected. */
export function LinkBox({ label, url, copyLabel, onCopied, onCopyFailed }: LinkBoxProps) {
  const codeRef = useRef<HTMLElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      onCopied();
    } catch {
      const code = codeRef.current;
      const selection = window.getSelection();
      if (code && selection) selection.selectAllChildren(code);
      onCopyFailed();
    }
  }

  return (
    <fieldset className="min-w-0">
      <legend className="mb-s1 text-sm font-bold">{label}</legend>
      <div className="flex items-center gap-s2 rounded-md border-[1.5px] border-dashed border-border-ui bg-surface-2 p-s3">
        <code ref={codeRef} className="min-w-0 flex-1 truncate font-code text-sm">
          {url}
        </code>
        <Button variant="secondary" size="sm" aria-label={copyLabel} onClick={copy}>
          Copy
        </Button>
      </div>
    </fieldset>
  );
}
