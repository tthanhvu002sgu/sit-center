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

try { settings = { ...defaults, ...JSON.parse(localStorage.getItem("sit-center-settings") || "{}") }; } catch {}
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
$("fullscreen").addEventListener("click", async () => { try { document.fullscreenElement ? await document.exitFullscreen() : await document.documentElement.requestFullscreen(); } catch { error.hidden = false; error.textContent = "Trình duyệt không cho phép toàn màn hình ở cửa sổ này."; } });
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
