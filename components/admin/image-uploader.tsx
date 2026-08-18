"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, GripVertical, ImagePlus, Plus, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/src/lib/logger";
import { buildCloudinaryUrl } from "@/src/lib/cloudinary";

type UploadStatus = "uploading" | "done" | "error";
type ErrorKey = "uploadFailed" | "tooLarge" | "notAnImage";

type UploadItem = {
  id: string;
  file?: File;
  previewUrl: string;
  publicId?: string;
  status: UploadStatus;
  progress: number;
  errorKey?: ErrorKey;
};

type SignResponse = {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function ImageUploader({
  initialPublicIds = [],
  onChange,
  maxFiles = 8,
  disabled = false,
}: {
  /** Existing Cloudinary public_ids, in order — e.g. when editing a saved product. */
  initialPublicIds?: string[];
  /** Fires with the ordered list of successfully uploaded public_ids. */
  onChange: (publicIds: string[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}) {
  const t = useTranslations("admin.imageUploader");
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRefs = useRef(new Map<string, XMLHttpRequest>());
  const lastEmitted = useRef<string | null>(null);

  const [items, setItems] = useState<UploadItem[]>(() =>
    initialPublicIds.map((publicId) => ({
      id: publicId,
      publicId,
      previewUrl: buildCloudinaryUrl(publicId, "thumbnail"),
      status: "done" as const,
      progress: 100,
    })),
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Derives the ordered public_id list as a side effect (not from inside a
  // setItems updater, which React may invoke outside a commit and which
  // would otherwise trigger "cannot update a component while rendering
  // a different component").
  useEffect(() => {
    const ids = items
      .filter((item): item is UploadItem & { publicId: string } => item.status === "done" && !!item.publicId)
      .map((item) => item.publicId);
    const key = ids.join(",");
    if (key !== lastEmitted.current) {
      lastEmitted.current = key;
      onChange(ids);
    }
  }, [items, onChange]);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const startUpload = useCallback(
    async (id: string, file: File) => {
      try {
        const signRes = await fetch("/api/cloudinary/sign", { method: "POST" });
        if (!signRes.ok) throw new Error(`sign_${signRes.status}`);
        const sign = (await signRes.json()) as SignResponse;

        const form = new FormData();
        form.append("file", file);
        form.append("api_key", sign.apiKey);
        form.append("timestamp", String(sign.timestamp));
        form.append("signature", sign.signature);
        form.append("folder", sign.folder);

        const publicId = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRefs.current.set(id, xhr);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              updateItem(id, { progress: Math.round((event.loaded / event.total) * 100) });
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve((JSON.parse(xhr.responseText) as { public_id: string }).public_id);
              } catch {
                reject(new Error("parse_failed"));
              }
            } else {
              reject(new Error(`upload_${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error("network_error"));
          xhr.onabort = () => reject(new Error("aborted"));
          xhr.open("POST", `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`);
          xhr.send(form);
        });

        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "done" as const,
                  progress: 100,
                  publicId,
                  previewUrl: buildCloudinaryUrl(publicId, "thumbnail"),
                }
              : item,
          ),
        );
      } catch (error) {
        if (error instanceof Error && error.message === "aborted") return;
        updateItem(id, { status: "error", errorKey: "uploadFailed" });
      } finally {
        xhrRefs.current.delete(id);
      }
    },
    [updateItem],
  );

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const room = Math.max(maxFiles - items.length, 0);
      const files = Array.from(fileList).slice(0, room);

      const newItems: UploadItem[] = files.map((file) => {
        const id = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(file);

        if (!file.type.startsWith("image/")) {
          return { id, file, previewUrl, status: "error", progress: 0, errorKey: "notAnImage" };
        }
        if (file.size > MAX_FILE_BYTES) {
          return { id, file, previewUrl, status: "error", progress: 0, errorKey: "tooLarge" };
        }
        return { id, file, previewUrl, status: "uploading", progress: 0 };
      });

      setItems((prev) => [...prev, ...newItems]);

      for (const item of newItems) {
        if (item.status === "uploading" && item.file) {
          void startUpload(item.id, item.file);
        }
      }
    },
    [items.length, maxFiles, startUpload],
  );

  function retry(item: UploadItem) {
    if (!item.file) return;
    updateItem(item.id, { status: "uploading", progress: 0, errorKey: undefined });
    void startUpload(item.id, item.file);
  }

  async function remove(item: UploadItem) {
    xhrRefs.current.get(item.id)?.abort();

    setItems((prev) => prev.filter((i) => i.id !== item.id));
    if (item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);

    if (item.publicId) {
      try {
        await fetch("/api/cloudinary/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicId: item.publicId }),
        });
      } catch (error) {
        // Best-effort cleanup: the image is already gone from this form, so a
        // failed remote delete just orphans a Cloudinary asset, it doesn't
        // block the admin's flow.
        logger.warn("Cloudinary delete failed after image removal", {
          publicId: item.publicId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  function moveBy(id: string, delta: number) {
    setItems((prev) => {
      const from = prev.findIndex((item) => item.id === id);
      const to = from + delta;
      if (from === -1 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  // Pointer-based reordering (not native HTML5 drag/drop) so it works with
  // touch — admin/POS runs on a tablet, per PRODUCT.md.
  useEffect(() => {
    if (!draggedId) return;

    function handlePointerMove(event: PointerEvent) {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const cell = target?.closest<HTMLElement>("[data-uploader-item-id]");
      const overId = cell?.dataset.uploaderItemId;
      if (!overId || overId === draggedId) return;

      setItems((prev) => {
        const from = prev.findIndex((item) => item.id === draggedId);
        const to = prev.findIndex((item) => item.id === overId);
        if (from === -1 || to === -1 || from === to) return prev;
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
    }

    function handlePointerUp() {
      setDraggedId(null);
    }

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [draggedId]);

  useEffect(() => {
    const xhrs = xhrRefs.current;
    return () => {
      for (const xhr of xhrs.values()) xhr.abort();
    };
  }, []);

  const canAddMore = items.length < maxFiles && !disabled;

  return (
    <div className={cn("flex flex-col gap-3", disabled && "pointer-events-none opacity-60")}>
      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          if (event.target.files?.length) addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {items.length === 0 ? (
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragOver(false);
            if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border px-6 py-10 text-center transition-colors",
            isDragOver && "border-gold bg-gold-soft/40",
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-gold-soft text-gold-strong">
            <ImagePlus className="size-5" aria-hidden="true" />
          </span>
          <span className="font-medium text-ink">{t("dropzoneTitle")}</span>
          <span className="text-sm text-ink-soft">{t("dropzoneHint", { max: maxFiles })}</span>
        </label>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {items.map((item, index) => (
            <div
              key={item.id}
              data-uploader-item-id={item.id}
              className={cn(
                "group relative aspect-square touch-none overflow-hidden rounded-sm border border-border bg-paper select-none",
                draggedId === item.id && "opacity-60",
              )}
              tabIndex={item.status === "done" ? 0 : -1}
              aria-label={item.status === "done" ? `${t("position", { position: index + 1 })} — ${t("reorderHandle")}` : undefined}
              onPointerDown={(event) => {
                if (item.status !== "done" || disabled) return;
                event.preventDefault();
                setDraggedId(item.id);
              }}
              onKeyDown={(event) => {
                if (item.status !== "done") return;
                if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  moveBy(item.id, -1);
                } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                  event.preventDefault();
                  moveBy(item.id, 1);
                }
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- dynamic blob:/Cloudinary URLs, not a static asset */}
              <img
                src={item.previewUrl}
                alt=""
                className="size-full object-cover"
                draggable={false}
                onError={(event) => {
                  event.currentTarget.style.visibility = "hidden";
                }}
              />

              {item.status === "done" ? (
                <>
                  <span className="absolute start-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-ink/80 text-[0.8125rem] font-semibold text-paper">
                    {index + 1}
                  </span>
                  <span className="pointer-events-none absolute bottom-1.5 start-1/2 flex -translate-x-1/2 items-center justify-center rounded-full bg-ink/60 p-1 text-paper/90">
                    <GripVertical className="size-3.5" aria-hidden="true" />
                  </span>
                  <button
                    type="button"
                    aria-label={t("remove")}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      void remove(item);
                    }}
                    className="absolute end-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-ink/70 text-paper transition-colors hover:bg-red-strong"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </>
              ) : null}

              {item.status === "uploading" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-ink/45">
                  <span className="text-sm font-semibold text-paper">{item.progress}%</span>
                  <div className="h-1.5 w-4/5 overflow-hidden rounded-full bg-paper/30">
                    <div
                      className="h-full rounded-full bg-gold transition-[width] duration-150 ease-out"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {item.status === "error" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-red-bg/95 p-2 text-center">
                  <AlertTriangle className="size-5 text-red-text" aria-hidden="true" />
                  <p className="text-xs font-medium text-red-text">
                    {item.errorKey ? t(item.errorKey) : t("uploadFailed")}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => retry(item)}
                      disabled={!item.file}
                      className="inline-flex h-7 items-center gap-1 rounded-full bg-ink px-2.5 text-xs font-medium text-paper transition-all duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
                    >
                      <RotateCw className="size-3" aria-hidden="true" />
                      {t("retry")}
                    </button>
                    <button
                      type="button"
                      aria-label={t("remove")}
                      onClick={() => void remove(item)}
                      className="flex size-7 items-center justify-center rounded-full text-red-text transition-colors hover:bg-red-strong hover:text-paper"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}

          {canAddMore ? (
            <label
              htmlFor={inputId}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragOver(false);
                if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
              }}
              className={cn(
                "flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed border-border text-ink-soft transition-colors hover:border-gold hover:text-gold-strong",
                isDragOver && "border-gold bg-gold-soft/40 text-gold-strong",
              )}
            >
              <Plus className="size-5" aria-hidden="true" />
              <span className="text-xs font-medium">{t("addMore")}</span>
            </label>
          ) : null}
        </div>
      )}

      {items.length >= maxFiles ? (
        <p className="text-xs text-ink-soft">{t("maxFilesReached", { max: maxFiles })}</p>
      ) : null}
    </div>
  );
}
