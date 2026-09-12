"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PhotoProfile } from "@/lib/media/photo-policy";
import { PHOTO_REFUSAL_MESSAGES } from "@/lib/media/photo-policy";
import { createPhotoConverter, type PhotoConverterHandle } from "@/lib/media/consumer-photo/photo-converter";
import { PhotoPreparationAborted, preparePhotos } from "@/lib/media/consumer-photo/prepare-photos";

/**
 * A file input's photo preparation (Engineering Phase D4.1). On change it prepares the picked photos for `profile` and
 * puts the prepared files back into the input, so the form's existing upload and submit code reads them unchanged.
 * Photos that cannot be prepared are dropped from the input and listed as problems; the rest stay. While preparing,
 * the form should not submit.
 */
export function usePhotoInput(profile: PhotoProfile, options: { onPrepared?: (files: File[]) => void } = {}) {
  const [preparing, setPreparing] = useState<{ done: number; total: number } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const runRef = useRef<AbortController | null>(null);
  const converterRef = useRef<PhotoConverterHandle | null>(null);
  const onPreparedRef = useRef(options.onPrepared);

  useEffect(() => {
    onPreparedRef.current = options.onPrepared;
  });

  useEffect(
    () => () => {
      runRef.current?.abort();
      converterRef.current?.dispose();
    },
    []
  );

  const onChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const picked = Array.from(input.files ?? []);
      runRef.current?.abort();
      setProblems([]);
      if (picked.length === 0) {
        runRef.current = null;
        setPreparing(null);
        onPreparedRef.current?.([]);
        return;
      }

      const run = new AbortController();
      runRef.current = run;
      converterRef.current ??= createPhotoConverter();
      setPreparing({ done: 0, total: picked.length });
      try {
        const results = await preparePhotos(picked, profile, {
          convert: converterRef.current.convert,
          signal: run.signal,
          onProgress: (done, total) => {
            if (runRef.current === run) setPreparing({ done, total });
          },
        });
        if (runRef.current !== run) return;
        const files = results.flatMap((result) => (result.ok ? [result.file] : []));
        replaceFiles(input, files);
        setProblems(results.flatMap((result) => (result.ok ? [] : [`${result.name}: ${result.message}`])));
        onPreparedRef.current?.(files);
      } catch (error) {
        if (runRef.current !== run) return;
        replaceFiles(input, []);
        if (!(error instanceof PhotoPreparationAborted)) setProblems([PHOTO_REFUSAL_MESSAGES.unsupported]);
        onPreparedRef.current?.([]);
      } finally {
        if (runRef.current === run) {
          runRef.current = null;
          setPreparing(null);
        }
      }
    },
    [profile]
  );

  const cancel = useCallback(() => runRef.current?.abort(), []);

  return { preparing, problems, onChange, cancel };
}

function replaceFiles(input: HTMLInputElement, files: File[]) {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
}
