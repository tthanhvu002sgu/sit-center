const $ = (id) => document.getElementById(id);
const app = $("app"), video = $("camera"), error = $("error");
const defaults = { width: 16, shoulder: 57, eye: 31, brightness: 82, eyeVisible: true };
let settings = { ...defaults }, stream = null;

function update() {
  app.style.setProperty("--half", `${settings.width}%`);
  app.style.setProperty("--shoulder-y", `${settings.shoulder}%`);
  app.style.setProperty("--eye-y", `${settings.eye}%`);
  app.style.setProperty("--alpha", settings.brightness / 100);
  $("width-out").value = `${Math.round(settings.width * 2)}% màn hình`;
  $("shoulder-out").value = `${settings.shoulder}%`;
  $("eye-out").value = `${settings.eye}%`;
  $("brightness-out").value = `${settings.brightness}%`;
  $("eye-y").disabled = !settings.eyeVisible;
  document.querySelector(".eye").hidden = !settings.eyeVisible;
  localStorage.setItem("sit-center-settings", JSON.stringify(settings));
}

try { settings = { ...defaults, ...JSON.parse(localStorage.getItem("sit-center-settings") || "{}") }; } catch { settings = { ...defaults }; }
for (const [name, id] of Object.entries({ width: "width", shoulder: "shoulder-y", eye: "eye-y", brightness: "brightness" })) {
  $(id).value = settings[name];
  $(id).addEventListener("input", (event) => { settings[name] = Number(event.target.value); update(); });
}
$("eye-visible").checked = settings.eyeVisible;
$("eye-visible").addEventListener("change", (event) => { settings.eyeVisible = event.target.checked; update(); });
$("reset").addEventListener("click", () => { settings = { ...defaults }; $("eye-visible").checked = true; for (const [name, id] of Object.entries({ width: "width", shoulder: "shoulder-y", eye: "eye-y", brightness: "brightness" })) $(id).value = settings[name]; update(); });

function panel(open) { $("panel").classList.toggle("hidden", !open); $("focus-note").hidden = open; }
$("hide").addEventListener("click", () => panel($("panel").classList.contains("hidden")));
$("close").addEventListener("click", () => panel(false));
$("show").addEventListener("click", () => panel(true));
$("fullscreen").addEventListener("click", async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { error.hidden = false; error.textContent = "Trình duyệt không cho phép toàn màn hình ở cửa sổ này."; } });
document.addEventListener("fullscreenchange", () => { $("fullscreen").innerHTML = `${document.fullscreenElement ? "Thoát toàn màn hình" : "Toàn màn hình"} <kbd>F</kbd>`; });

async function toggleCamera() {
  const button = $("camera-toggle");
  if (stream) { stream.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null; video.classList.remove("on"); $("camera-shade").hidden = true; button.classList.remove("on"); button.querySelector("span").textContent = "Tắt"; button.setAttribute("aria-pressed", "false"); return; }
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); video.srcObject = stream; await video.play(); video.classList.add("on"); $("camera-shade").hidden = false; button.classList.add("on"); button.querySelector("span").textContent = "Bật"; button.setAttribute("aria-pressed", "true"); error.hidden = true; } catch { error.hidden = false; error.textContent = "Không mở được camera. Hãy kiểm tra quyền camera của trình duyệt."; }
}
$("camera-toggle").addEventListener("click", toggleCamera);
window.addEventListener("beforeunload", () => stream?.getTracks().forEach((track) => track.stop()));
document.addEventListener("keydown", (event) => { if (event.target.tagName === "INPUT") return; if (event.key.toLowerCase() === "f") $("fullscreen").click(); if (event.key.toLowerCase() === "h") panel($("panel").classList.contains("hidden")); if (event.key.toLowerCase() === "c") toggleCamera(); if (event.key === "ArrowLeft") { settings.width = Math.max(8, settings.width - .5); $("width").value = settings.width; update(); } if (event.key === "ArrowRight") { settings.width = Math.min(30, settings.width + .5); $("width").value = settings.width; update(); } });
update();

const pairingBackdrop = $("pairing-backdrop");
const pairingStatus = $("pairing-status");
const remoteButton = $("remote-camera");
const phoneTarget = new URLSearchParams(location.search).get("camera");
let peer = null, mediaCall = null, phoneStream = null, phoneFacing = "user";

function destroyPeer() {
  const activeCall = mediaCall;
  mediaCall = null;
  activeCall?.close();
  peer?.destroy();
  peer = null;
}

function showRemoteStream(remoteStream) {
  stream?.getTracks().forEach((track) => track.stop());
  stream = remoteStream;
  video.srcObject = stream;
  video.play();
  video.classList.add("on");
  $("camera-shade").hidden = false;
  pairingBackdrop.hidden = true;
  remoteButton.classList.add("connected");
  remoteButton.querySelector("strong").textContent = "Ngắt camera điện thoại";
  remoteButton.querySelector("small").textContent = "Đang truyền trực tiếp";
}

function stopRemoteCamera() {
  destroyPeer();
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    video.classList.remove("on");
    $("camera-shade").hidden = true;
  }
  remoteButton.classList.remove("connected");
  remoteButton.querySelector("strong").textContent = "Kết nối camera điện thoại";
  remoteButton.querySelector("small").textContent = "Quét QR để kết nối không dây";
}

function openPairing() {
  if (remoteButton.classList.contains("connected")) {
    stopRemoteCamera();
    return;
  }

  destroyPeer();
  pairingBackdrop.hidden = false;
  pairingStatus.textContent = "Đang tạo phiên…";
  pairingStatus.className = "status-pill";
  $("qr-code").replaceChildren();
  $("copy-link").hidden = true;

  if (!window.Peer || !window.QRCode) {
    pairingStatus.textContent = "Không tải được kết nối";
    pairingStatus.classList.add("error");
    return;
  }

  peer = new window.Peer();
  peer.on("open", (id) => {
    const phoneUrl = new URL(location.href);
    phoneUrl.search = "";
    phoneUrl.searchParams.set("camera", id);
    new window.QRCode($("qr-code"), {
      text: phoneUrl.toString(),
      width: 198,
      height: 198,
      colorDark: "#0a0e0d",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.M,
    });
    pairingStatus.textContent = "Chờ điện thoại";
    pairingStatus.classList.add("waiting");
    $("copy-link").hidden = false;
    $("copy-link").onclick = async () => {
      await navigator.clipboard.writeText(phoneUrl.toString());
      $("copy-link").textContent = "Đã sao chép";
    };
  });
  peer.on("call", (incomingCall) => {
    mediaCall = incomingCall;
    pairingStatus.textContent = "Đang kết nối…";
    incomingCall.answer();
    incomingCall.on("stream", showRemoteStream);
    incomingCall.on("close", stopRemoteCamera);
    incomingCall.on("error", () => {
      pairingStatus.textContent = "Kết nối thất bại";
      pairingStatus.classList.add("error");
    });
  });
  peer.on("error", () => {
    pairingStatus.textContent = "Không thể kết nối";
    pairingStatus.classList.add("error");
  });
}

remoteButton.addEventListener("click", openPairing);
$("pairing-close").addEventListener("click", () => {
  pairingBackdrop.hidden = true;
  if (!remoteButton.classList.contains("connected")) destroyPeer();
});
pairingBackdrop.addEventListener("click", (event) => {
  if (event.target === pairingBackdrop) $("pairing-close").click();
});

function stopPhoneCamera() {
  destroyPeer();
  phoneStream?.getTracks().forEach((track) => track.stop());
  phoneStream = null;
  $("phone-preview").srcObject = null;
  $("phone-preview").classList.remove("live");
  $("phone-connect").hidden = false;
  $("phone-stop").hidden = true;
  $("phone-status").textContent = "Sẵn sàng";
  $("phone-status").className = "status-pill";
}

async function connectPhone() {
  const phoneError = $("phone-error");
  phoneError.hidden = true;
  $("phone-status").textContent = "Đang kết nối…";
  try {
    if (!window.Peer || !phoneTarget || !/^[a-zA-Z0-9_-]{1,80}$/.test(phoneTarget)) {
      throw new Error("Liên kết kết nối không hợp lệ.");
    }
    phoneStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: phoneFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    $("phone-preview").srcObject = phoneStream;
    await $("phone-preview").play();
    $("phone-preview").classList.add("live");
    peer = new window.Peer();
    peer.on("open", () => {
      mediaCall = peer.call(phoneTarget, phoneStream);
      $("phone-status").textContent = "Đang truyền trực tiếp";
      $("phone-status").classList.add("connected");
      $("phone-connect").hidden = true;
      $("phone-stop").hidden = false;
      mediaCall.on("close", stopPhoneCamera);
      mediaCall.on("error", () => {
        phoneError.textContent = "Kết nối camera bị gián đoạn. Hãy quét lại mã QR.";
        phoneError.hidden = false;
        stopPhoneCamera();
      });
    });
    peer.on("error", () => {
      stopPhoneCamera();
      phoneError.textContent = "Không tìm thấy máy tính. Mã QR có thể đã hết hạn.";
      phoneError.hidden = false;
    });
  } catch (connectionError) {
    stopPhoneCamera();
    phoneError.textContent = connectionError instanceof Error ? connectionError.message : "Không thể mở camera điện thoại.";
    phoneError.hidden = false;
  }
}

if (phoneTarget) {
  $("app").hidden = true;
  $("phone-view").hidden = false;
  document.querySelectorAll("[data-facing]").forEach((button) => {
    button.addEventListener("click", () => {
      phoneFacing = button.dataset.facing;
      document.querySelectorAll("[data-facing]").forEach((item) => item.classList.toggle("selected", item === button));
    });
  });
  $("phone-connect").addEventListener("click", connectPhone);
  $("phone-stop").addEventListener("click", stopPhoneCamera);
}

window.addEventListener("beforeunload", () => {
  destroyPeer();
  phoneStream?.getTracks().forEach((track) => track.stop());
});
