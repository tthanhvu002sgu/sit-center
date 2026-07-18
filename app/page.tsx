"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SavedSettings = {
  shoulderHalf: number;
  shoulderY: number;
  eyeY: number;
  intensity: number;
  showEyeLine: boolean;
};

const DEFAULTS: SavedSettings = {
  shoulderHalf: 16,
  shoulderY: 57,
  eyeY: 31,
  intensity: 82,
  showEyeLine: true,
};

const STORAGE_KEY = "sit-center-settings";

export default function Home() {
  const [shoulderHalf, setShoulderHalf] = useState(DEFAULTS.shoulderHalf);
  const [shoulderY, setShoulderY] = useState(DEFAULTS.shoulderY);
  const [eyeY, setEyeY] = useState(DEFAULTS.eyeY);
  const [intensity, setIntensity] = useState(DEFAULTS.intensity);
  const [showEyeLine, setShowEyeLine] = useState(DEFAULTS.showEyeLine);
  const [panelOpen, setPanelOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<SavedSettings>;
      setShoulderHalf(parsed.shoulderHalf ?? DEFAULTS.shoulderHalf);
      setShoulderY(parsed.shoulderY ?? DEFAULTS.shoulderY);
      setEyeY(parsed.eyeY ?? DEFAULTS.eyeY);
      setIntensity(parsed.intensity ?? DEFAULTS.intensity);
      setShowEyeLine(parsed.showEyeLine ?? DEFAULTS.showEyeLine);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const settings: SavedSettings = {
      shoulderHalf,
      shoulderY,
      eyeY,
      intensity,
      showEyeLine,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [shoulderHalf, shoulderY, eyeY, intensity, showEyeLine]);

  useEffect(() => {
    const handleFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      stopCamera();
      return;
    }

    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setCameraError("Không mở được camera. Hãy kiểm tra quyền camera của trình duyệt.");
    }
  }, [cameraOn, stopCamera]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setCameraError("Trình duyệt không cho phép toàn màn hình ở cửa sổ này.");
    }
  }, []);

  const reset = useCallback(() => {
    setShoulderHalf(DEFAULTS.shoulderHalf);
    setShoulderY(DEFAULTS.shoulderY);
    setEyeY(DEFAULTS.eyeY);
    setIntensity(DEFAULTS.intensity);
    setShowEyeLine(DEFAULTS.showEyeLine);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.tagName === "INPUT") return;
      if (event.key.toLowerCase() === "f") void toggleFullscreen();
      if (event.key.toLowerCase() === "h") setPanelOpen((value) => !value);
      if (event.key.toLowerCase() === "c") void toggleCamera();
      if (event.key === "ArrowLeft") {
        setShoulderHalf((value) => Math.max(8, value - 0.5));
      }
      if (event.key === "ArrowRight") {
        setShoulderHalf((value) => Math.min(30, value + 0.5));
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleCamera, toggleFullscreen]);

  const guideStyle = {
    "--shoulder-half": `${shoulderHalf}%`,
    "--shoulder-y": `${shoulderY}%`,
    "--eye-y": `${eyeY}%`,
    "--guide-alpha": intensity / 100,
  } as React.CSSProperties;

  return (
    <main className="alignment-app" style={guideStyle}>
      <div className="ambient-grid" aria-hidden="true" />

      <video
        ref={videoRef}
        className={`camera-feed ${cameraOn ? "is-visible" : ""}`}
        muted
        playsInline
        aria-label="Hình ảnh camera được lật gương để căn tư thế"
      />
      {cameraOn && <div className="camera-shade" aria-hidden="true" />}

      <div className="guides" aria-hidden="true">
        <div className="center-axis">
          <span className="axis-label">TÂM</span>
        </div>

        {showEyeLine && (
          <div className="eye-line">
            <span>NGANG TẦM MẮT</span>
          </div>
        )}

        <div className="shoulder-level" />

        <div className="shoulder-guide shoulder-left">
          <span className="shoulder-cap" />
          <span className="shoulder-label">VAI TRÁI</span>
        </div>

        <div className="shoulder-guide shoulder-right">
          <span className="shoulder-cap" />
          <span className="shoulder-label">VAI PHẢI</span>
        </div>

        <div className="center-target">
          <span />
        </div>
      </div>

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <div>
            <strong>SIT CENTER</strong>
            <span>Căn giữa vị trí ngồi</span>
          </div>
        </div>

        <div className="top-actions">
          <button type="button" className="quiet-button" onClick={() => setPanelOpen((value) => !value)}>
            {panelOpen ? "Ẩn bảng" : "Hiện bảng"} <kbd>H</kbd>
          </button>
          <button type="button" className="primary-button" onClick={toggleFullscreen}>
            {isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"} <kbd>F</kbd>
          </button>
        </div>
      </header>

      <section className={`control-panel ${panelOpen ? "is-open" : ""}`} aria-label="Bảng căn chỉnh">
        <div className="panel-heading">
          <div>
            <p>CĂN NHANH</p>
            <h1>Đặt cơ thể vào đúng trục</h1>
          </div>
          <button type="button" className="close-panel" onClick={() => setPanelOpen(false)} aria-label="Ẩn bảng điều khiển">
            ×
          </button>
        </div>

        <ol className="steps">
          <li><span>1</span><p>Bật toàn màn hình và ngồi ở khoảng cách làm việc bình thường.</p></li>
          <li><span>2</span><p>Căn mũi và giữa ngực trùng với đường tâm.</p></li>
          <li><span>3</span><p>Chỉnh hai vạch đứng chạm mép ngoài hai vai.</p></li>
        </ol>

        <div className="camera-row">
          <div>
            <strong>Gương camera</strong>
            <span>Chính xác hơn, hình ảnh không được tải lên.</span>
          </div>
          <button type="button" className={cameraOn ? "toggle is-on" : "toggle"} onClick={toggleCamera} aria-pressed={cameraOn}>
            <span>{cameraOn ? "Bật" : "Tắt"}</span>
            <i />
          </button>
        </div>
        {cameraError && <p className="inline-error" role="alert">{cameraError}</p>}

        <div className="controls">
          <label>
            <span><b>Khoảng cách hai vai</b><output>{Math.round(shoulderHalf * 2)}% màn hình</output></span>
            <input
              type="range"
              min="8"
              max="30"
              step="0.5"
              value={shoulderHalf}
              onChange={(event) => setShoulderHalf(Number(event.target.value))}
            />
          </label>

          <label>
            <span><b>Độ cao vai</b><output>{shoulderY}%</output></span>
            <input
              type="range"
              min="38"
              max="76"
              step="1"
              value={shoulderY}
              onChange={(event) => setShoulderY(Number(event.target.value))}
            />
          </label>

          <label>
            <span><b>Độ cao tầm mắt</b><output>{eyeY}%</output></span>
            <input
              type="range"
              min="18"
              max="48"
              step="1"
              value={eyeY}
              disabled={!showEyeLine}
              onChange={(event) => setEyeY(Number(event.target.value))}
            />
          </label>

          <label>
            <span><b>Độ sáng vạch</b><output>{intensity}%</output></span>
            <input
              type="range"
              min="35"
              max="100"
              step="1"
              value={intensity}
              onChange={(event) => setIntensity(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="panel-footer">
          <label className="check-control">
            <input
              type="checkbox"
              checked={showEyeLine}
              onChange={(event) => setShowEyeLine(event.target.checked)}
            />
            <span>Hiện đường tầm mắt</span>
          </label>
          <button type="button" className="reset-button" onClick={reset}>Đặt lại</button>
        </div>
      </section>

      {!panelOpen && (
        <div className="focus-note">
          <span>Mũi ở đường tâm. Hai vai chạm hai vạch.</span>
          <button type="button" onClick={() => setPanelOpen(true)}>Chỉnh lại</button>
        </div>
      )}

      <footer className="shortcut-bar" aria-label="Phím tắt">
        <span><kbd>←</kbd><kbd>→</kbd> Khoảng vai</span>
        <span><kbd>C</kbd> Camera</span>
        <span><kbd>H</kbd> Ẩn bảng</span>
        <span><kbd>F</kbd> Toàn màn hình</span>
      </footer>
    </main>
  );
}
