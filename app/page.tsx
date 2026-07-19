"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

type SavedSettings = {
  shoulderHalf: number;
  shoulderY: number;
  eyeY: number;
  intensity: number;
  showEyeLine: boolean;
};

type CameraSession = {
  id: string;
  offer: RTCSessionDescriptionInit | null;
  answer: RTCSessionDescriptionInit | null;
  expiresAt: number;
};

type ConnectionStatus = "idle" | "creating" | "waiting" | "connecting" | "connected" | "error";

const DEFAULTS: SavedSettings = {
  shoulderHalf: 16,
  shoulderY: 57,
  eyeY: 31,
  intensity: 82,
  showEyeLine: true,
};

const STORAGE_KEY = "sit-center-settings";
const SESSION_POLL_MS = 1200;

async function waitForIceGathering(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 5000);
    const handleChange = () => {
      if (peer.iceGatheringState !== "complete") return;
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", handleChange);
      resolve();
    };
    peer.addEventListener("icegatheringstatechange", handleChange);
  });
}

async function readSession(id: string): Promise<CameraSession> {
  const response = await fetch(`/api/camera-sessions?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Phiên kết nối không tồn tại hoặc đã hết hạn.");
  return response.json() as Promise<CameraSession>;
}

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
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);
  const [remoteStatus, setRemoteStatus] = useState<ConnectionStatus>("idle");
  const [remoteSessionId, setRemoteSessionId] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [phoneSessionId, setPhoneSessionId] = useState<string | null>(null);
  const [phoneStatus, setPhoneStatus] = useState<ConnectionStatus>("idle");
  const [phoneFacingMode, setPhoneFacingMode] = useState<"user" | "environment">("user");
  const videoRef = useRef<HTMLVideoElement>(null);
  const phoneVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("camera");
    queueMicrotask(() => setPhoneSessionId(sessionId));
  }, []);

  useEffect(() => {
    let cancelled = false;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<SavedSettings>;
      queueMicrotask(() => {
        if (cancelled) return;
        setShoulderHalf(parsed.shoulderHalf ?? DEFAULTS.shoulderHalf);
        setShoulderY(parsed.shoulderY ?? DEFAULTS.shoulderY);
        setEyeY(parsed.eyeY ?? DEFAULTS.eyeY);
        setIntensity(parsed.intensity ?? DEFAULTS.intensity);
        setShowEyeLine(parsed.showEyeLine ?? DEFAULTS.showEyeLine);
      });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const settings: SavedSettings = { shoulderHalf, shoulderY, eyeY, intensity, showEyeLine };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [shoulderHalf, shoulderY, eyeY, intensity, showEyeLine]);

  useEffect(() => {
    const handleFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  const stopMedia = useCallback(() => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (phoneVideoRef.current) phoneVideoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopMedia, [stopMedia]);

  const stopRemoteCamera = useCallback(async () => {
    stopMedia();
    if (remoteSessionId) {
      void fetch(`/api/camera-sessions?id=${encodeURIComponent(remoteSessionId)}`, { method: "DELETE" });
    }
    setRemoteStatus("idle");
    setRemoteSessionId("");
    setRemoteUrl("");
    setQrCode("");
    setRemoteDialogOpen(false);
  }, [remoteSessionId, stopMedia]);

  const toggleLocalCamera = useCallback(async () => {
    if (cameraOn) {
      stopMedia();
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
  }, [cameraOn, stopMedia]);

  const startRemoteCamera = useCallback(async () => {
    stopMedia();
    setRemoteDialogOpen(true);
    setRemoteStatus("creating");
    setCameraError("");
    try {
      const createResponse = await fetch("/api/camera-sessions", { method: "POST" });
      if (!createResponse.ok) throw new Error("Không tạo được phiên kết nối.");
      const session = (await createResponse.json()) as CameraSession;
      const phoneUrl = new URL(window.location.href);
      phoneUrl.search = "";
      phoneUrl.searchParams.set("camera", session.id);
      const url = phoneUrl.toString();
      setRemoteSessionId(session.id);
      setRemoteUrl(url);
      setQrCode(await QRCode.toDataURL(url, {
        width: 240,
        margin: 1,
        color: { dark: "#0a0e0d", light: "#ffffff" },
      }));

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      peer.addTransceiver("video", { direction: "recvonly" });
      peer.ontrack = async (event) => {
        const [stream] = event.streams;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraOn(true);
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          setRemoteStatus("connected");
          setRemoteDialogOpen(false);
        } else if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
          setRemoteStatus("error");
          setCameraError("Mất kết nối với camera điện thoại. Hãy tạo lại phiên.");
        }
      };

      await peer.setLocalDescription(await peer.createOffer());
      await waitForIceGathering(peer);
      const offerResponse = await fetch("/api/camera-sessions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: session.id, offer: peer.localDescription }),
      });
      if (!offerResponse.ok) throw new Error("Không gửi được lời mời kết nối.");
      setRemoteStatus("waiting");

      pollRef.current = window.setInterval(async () => {
        try {
          const updated = await readSession(session.id);
          if (!updated.answer || peer.remoteDescription) return;
          setRemoteStatus("connecting");
          await peer.setRemoteDescription(updated.answer);
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
        } catch {
          setRemoteStatus("error");
        }
      }, SESSION_POLL_MS);
    } catch (error) {
      setRemoteStatus("error");
      setCameraError(error instanceof Error ? error.message : "Không thể kết nối camera điện thoại.");
    }
  }, [stopMedia]);

  const connectPhoneCamera = useCallback(async () => {
    if (!phoneSessionId) return;
    stopMedia();
    setPhoneStatus("connecting");
    setCameraError("");
    try {
      const session = await readSession(phoneSessionId);
      if (!session.offer) throw new Error("Máy tính chưa sẵn sàng. Hãy thử lại sau vài giây.");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: phoneFacingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (phoneVideoRef.current) {
        phoneVideoRef.current.srcObject = stream;
        await phoneVideoRef.current.play();
      }
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") setPhoneStatus("connected");
        if (["failed", "disconnected", "closed"].includes(peer.connectionState)) setPhoneStatus("error");
      };
      await peer.setRemoteDescription(session.offer);
      await peer.setLocalDescription(await peer.createAnswer());
      await waitForIceGathering(peer);
      const response = await fetch("/api/camera-sessions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: phoneSessionId, answer: peer.localDescription }),
      });
      if (!response.ok) throw new Error("Không gửi được hình ảnh đến máy tính.");
    } catch (error) {
      stopMedia();
      setPhoneStatus("error");
      setCameraError(error instanceof Error ? error.message : "Không thể mở camera điện thoại.");
    }
  }, [phoneFacingMode, phoneSessionId, stopMedia]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
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
      if (event.key.toLowerCase() === "c") void toggleLocalCamera();
      if (event.key === "ArrowLeft") setShoulderHalf((value) => Math.max(8, value - 0.5));
      if (event.key === "ArrowRight") setShoulderHalf((value) => Math.min(30, value + 0.5));
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleFullscreen, toggleLocalCamera]);

  if (phoneSessionId) {
    return (
      <main className="phone-camera-page">
        <video ref={phoneVideoRef} className={`phone-preview ${phoneStatus === "connected" ? "is-live" : ""}`} muted playsInline aria-label="Xem trước camera điện thoại" />
        <div className="phone-shade" aria-hidden="true" />
        <section className="phone-card">
          <div className="brand phone-brand">
            <span className="brand-mark" aria-hidden="true"><i /><i /></span>
            <div><strong>SIT CENTER</strong><span>Camera điện thoại</span></div>
          </div>
          <span className={`status-pill status-${phoneStatus}`}>
            {phoneStatus === "connected" ? "Đang truyền trực tiếp" : phoneStatus === "connecting" ? "Đang kết nối…" : "Sẵn sàng"}
          </span>
          <h1>{phoneStatus === "connected" ? "Camera đang được dùng trên máy tính" : "Dùng điện thoại làm camera"}</h1>
          <p>Video truyền trực tiếp đến máy tính bằng kết nối ngang hàng và không được lưu trên máy chủ.</p>
          {phoneStatus !== "connected" && (
            <>
              <div className="facing-choice" aria-label="Chọn camera">
                <button type="button" className={phoneFacingMode === "user" ? "is-selected" : ""} onClick={() => setPhoneFacingMode("user")}>Camera trước</button>
                <button type="button" className={phoneFacingMode === "environment" ? "is-selected" : ""} onClick={() => setPhoneFacingMode("environment")}>Camera sau</button>
              </div>
              <button type="button" className="phone-connect-button" onClick={connectPhoneCamera}>Cho phép và kết nối camera</button>
            </>
          )}
          {phoneStatus === "connected" && <button type="button" className="phone-stop-button" onClick={() => { stopMedia(); setPhoneStatus("idle"); }}>Dừng truyền camera</button>}
          {cameraError && <p className="phone-error" role="alert">{cameraError}</p>}
          <small>Giữ trang này mở và đặt điện thoại cùng mạng Wi‑Fi với máy tính để kết nối ổn định.</small>
        </section>
      </main>
    );
  }

  const guideStyle = {
    "--shoulder-half": `${shoulderHalf}%`,
    "--shoulder-y": `${shoulderY}%`,
    "--eye-y": `${eyeY}%`,
    "--guide-alpha": intensity / 100,
  } as React.CSSProperties;

  return (
    <main className="alignment-app" style={guideStyle}>
      <div className="ambient-grid" aria-hidden="true" />
      <video ref={videoRef} className={`camera-feed ${cameraOn ? "is-visible" : ""}`} muted playsInline aria-label="Hình ảnh camera được lật gương để căn tư thế" />
      {cameraOn && <div className="camera-shade" aria-hidden="true" />}
      <div className="guides" aria-hidden="true">
        <div className="center-axis"><span className="axis-label">TÂM</span></div>
        {showEyeLine && <div className="eye-line"><span>NGANG TẦM MẮT</span></div>}
        <div className="shoulder-level" />
        <div className="shoulder-guide shoulder-left"><span className="shoulder-cap" /><span className="shoulder-label">VAI TRÁI</span></div>
        <div className="shoulder-guide shoulder-right"><span className="shoulder-cap" /><span className="shoulder-label">VAI PHẢI</span></div>
        <div className="center-target"><span /></div>
      </div>
      <header className="topbar">
        <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /></span><div><strong>SIT CENTER</strong><span>Căn giữa vị trí ngồi</span></div></div>
        <div className="top-actions">
          {remoteStatus === "connected" && <button type="button" className="connected-badge" onClick={stopRemoteCamera}><i /> Camera điện thoại</button>}
          <button type="button" className="quiet-button" onClick={() => setPanelOpen((value) => !value)}>{panelOpen ? "Ẩn bảng" : "Hiện bảng"} <kbd>H</kbd></button>
          <button type="button" className="primary-button" onClick={toggleFullscreen}>{isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"} <kbd>F</kbd></button>
        </div>
      </header>
      <section className={`control-panel ${panelOpen ? "is-open" : ""}`} aria-label="Bảng căn chỉnh">
        <div className="panel-heading"><div><p>CĂN NHANH</p><h1>Đặt cơ thể vào đúng trục</h1></div><button type="button" className="close-panel" onClick={() => setPanelOpen(false)} aria-label="Ẩn bảng điều khiển">×</button></div>
        <ol className="steps">
          <li><span>1</span><p>Bật toàn màn hình và ngồi ở khoảng cách làm việc bình thường.</p></li>
          <li><span>2</span><p>Căn mũi và giữa ngực trùng với đường tâm.</p></li>
          <li><span>3</span><p>Chỉnh hai vạch đứng chạm mép ngoài hai vai.</p></li>
        </ol>
        <div className="camera-options">
          <div className="camera-row">
            <div><strong>Camera máy tính</strong><span>Dùng webcam trên thiết bị này.</span></div>
            <button type="button" className={cameraOn && remoteStatus !== "connected" ? "toggle is-on" : "toggle"} onClick={toggleLocalCamera} aria-pressed={cameraOn && remoteStatus !== "connected"}><span>{cameraOn && remoteStatus !== "connected" ? "Bật" : "Tắt"}</span><i /></button>
          </div>
          <button type="button" className="remote-camera-button" onClick={remoteStatus === "connected" ? stopRemoteCamera : startRemoteCamera}>
            <span className="phone-icon" aria-hidden="true" /><span><strong>{remoteStatus === "connected" ? "Ngắt camera điện thoại" : "Kết nối camera điện thoại"}</strong><small>Quét QR để kết nối không dây</small></span><b aria-hidden="true">→</b>
          </button>
          <p className="bluetooth-note">Bluetooth không hỗ trợ truyền video camera trong trình duyệt. Sit Center dùng QR để ghép nối và WebRTC qua Wi‑Fi cho hình ảnh mượt hơn.</p>
        </div>
        {cameraError && <p className="inline-error" role="alert">{cameraError}</p>}
        <div className="controls">
          <label><span><b>Khoảng cách hai vai</b><output>{Math.round(shoulderHalf * 2)}% màn hình</output></span><input type="range" min="8" max="30" step="0.5" value={shoulderHalf} onChange={(event) => setShoulderHalf(Number(event.target.value))} /></label>
          <label><span><b>Độ cao vai</b><output>{shoulderY}%</output></span><input type="range" min="38" max="76" step="1" value={shoulderY} onChange={(event) => setShoulderY(Number(event.target.value))} /></label>
          <label><span><b>Độ cao tầm mắt</b><output>{eyeY}%</output></span><input type="range" min="18" max="48" step="1" value={eyeY} disabled={!showEyeLine} onChange={(event) => setEyeY(Number(event.target.value))} /></label>
          <label><span><b>Độ sáng vạch</b><output>{intensity}%</output></span><input type="range" min="35" max="100" step="1" value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} /></label>
        </div>
        <div className="panel-footer"><label className="check-control"><input type="checkbox" checked={showEyeLine} onChange={(event) => setShowEyeLine(event.target.checked)} /><span>Hiện đường tầm mắt</span></label><button type="button" className="reset-button" onClick={reset}>Đặt lại</button></div>
      </section>
      {!panelOpen && <div className="focus-note"><span>Mũi ở đường tâm. Hai vai chạm hai vạch.</span><button type="button" onClick={() => setPanelOpen(true)}>Chỉnh lại</button></div>}
      {remoteDialogOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) void stopRemoteCamera(); }}>
          <section className="pairing-dialog" role="dialog" aria-modal="true" aria-labelledby="pairing-title">
            <button type="button" className="dialog-close" onClick={stopRemoteCamera} aria-label="Đóng">×</button>
            <span className={`status-pill status-${remoteStatus}`}>{remoteStatus === "creating" ? "Đang tạo phiên…" : remoteStatus === "waiting" ? "Chờ điện thoại" : remoteStatus === "connecting" ? "Đang kết nối…" : remoteStatus === "error" ? "Có lỗi kết nối" : "Sẵn sàng"}</span>
            <h2 id="pairing-title">Kết nối camera điện thoại</h2>
            <p>Mở camera trên điện thoại, quét mã QR rồi nhấn “Cho phép và kết nối camera”.</p>
            <div className="qr-frame">{qrCode ? (
              // The QR code is generated locally as a data URL, so image optimization is not applicable.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrCode} alt="Mã QR kết nối camera điện thoại" />
            ) : <div className="qr-loading" aria-label="Đang tạo mã QR" />}</div>
            {remoteSessionId && <code className="session-code">{remoteSessionId.slice(0, 4)} {remoteSessionId.slice(4, 8)}</code>}
            {remoteUrl && <button type="button" className="copy-link-button" onClick={() => void navigator.clipboard.writeText(remoteUrl)}>Sao chép liên kết</button>}
            <ol className="pairing-steps"><li><span>1</span>Cùng kết nối Wi‑Fi trên hai thiết bị</li><li><span>2</span>Quét QR bằng camera điện thoại</li><li><span>3</span>Cho phép truy cập camera</li></ol>
            {cameraError && <p className="phone-error" role="alert">{cameraError}</p>}
            <small>Phiên tự hết hạn sau 10 phút. Video không đi qua máy chủ.</small>
          </section>
        </div>
      )}
      <footer className="shortcut-bar" aria-label="Phím tắt"><span><kbd>←</kbd><kbd>→</kbd> Khoảng vai</span><span><kbd>C</kbd> Camera</span><span><kbd>H</kbd> Ẩn bảng</span><span><kbd>F</kbd> Toàn màn hình</span></footer>
    </main>
  );
}
