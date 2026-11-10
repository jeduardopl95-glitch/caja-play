import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

export default function EscanerCodigo({ onDetected, onClose }: {
  onDetected: (codigo: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const detected = useRef(onDetected);
  const [status, setStatus] = useState("Abriendo cámara…");

  useEffect(() => { detected.current = onDetected; }, [onDetected]);
  useEffect(() => {
    const panel = dialog.current!;
    const preview = video.current!;
    let active = true;
    let stream: MediaStream | undefined;
    let controls: IScannerControls | undefined;
    const stop = () => {
      active = false;
      stream?.getTracks().forEach(track => {
        track.removeEventListener("ended", onEnded);
        track.stop();
      });
      stream = undefined;
      controls?.stop();
      controls = undefined;
      preview.srcObject = null;
    };
    const onEnded = () => {
      if (!active) return;
      stop();
      setStatus("La cámara se interrumpió. Cierra el lector para volver a intentar o escribe el código manualmente.");
    };
    panel.showModal();
    void (async () => {
      try {
        const { BrowserMultiFormatOneDReader } = await import("@zxing/browser");
        if (!active) return;
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
        const camera = await navigator.mediaDevices.getUserMedia({
          audio: false, video: { facingMode: { ideal: "environment" } },
        });
        if (!active) {
          camera.getTracks().forEach(track => track.stop());
          return;
        }
        stream = camera;
        const tracks = camera.getTracks();
        tracks.forEach(track => track.addEventListener("ended", onEnded));
        if (tracks.some(track => track.readyState === "ended")) {
          onEnded();
          return;
        }
        setStatus("Apunta al código de barras.");
        const reader = new BrowserMultiFormatOneDReader();
        const scanner = await reader.decodeFromStream(camera, preview, (result, error) => {
          if (!active) return;
          if (error) {
            const kind = (error as Error & { getKind?: () => string }).getKind?.();
            if (kind === "NotFoundException" || kind === "ChecksumException" || kind === "FormatException") return;
            stop();
            setStatus("No se pudo leer el código. Puedes escribirlo manualmente.");
            return;
          }
          const code = result?.getText().trim();
          if (!code || code.length > 200) return;
          stop();
          detected.current(code);
        });
        if (active) controls = scanner;
        else scanner.stop();
      } catch {
        if (!active) return;
        stop();
        setStatus("No se pudo abrir el lector. Puedes escribir el código manualmente.");
      }
    })();
    return () => {
      stop();
      panel.close();
    };
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby="scanner-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-neutral-300 bg-white p-5 text-[#141418] backdrop:bg-black/60">
      <h2 id="scanner-title" className="text-lg font-bold">Escanear código</h2>
      <video ref={video} playsInline muted className="my-3 aspect-video w-full rounded-lg bg-black object-contain" />
      <p role="status" className="mb-4 text-sm">{status}</p>
      <button type="button" className="pricing-reset min-h-11" onClick={onClose}>Cancelar</button>
    </dialog>
  );
}
