"use client";

import { useRef, useState } from "react";

export function PhotoPicker({ name, maxFiles }: { name: string; maxFiles: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);

  function syncInput(files: File[]) {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    if (inputRef.current) inputRef.current.files = dt.files;
  }

  function applyFiles(files: File[]) {
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    syncInput(files);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const combined = [...previews.map((p) => p.file), ...picked].slice(0, maxFiles);
    applyFiles(combined);
  }

  function removeAt(idx: number) {
    applyFiles(previews.filter((_, i) => i !== idx).map((p) => p.file));
  }

  if (maxFiles <= 0) return null;

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleChange}
        className="block text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-hover file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
      />
      <p className="text-xs text-muted-2">
        {previews.length}/{maxFiles} fotos seleccionadas. JPEG, PNG o WebP, máximo 5MB cada una.
      </p>
      {previews.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {previews.map((p, i) => (
            <div
              key={p.url}
              className="relative h-24 w-24 overflow-hidden rounded-lg border border-border"
            >
              {/* Preview de un blob: URL local — next/image no aplica acá. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label="Quitar foto"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
