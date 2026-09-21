import { useState } from "react";
import { RefreshCw } from "lucide-react";

function waitForInstallation(worker: ServiceWorker) {
  if (worker.state === "installed") return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const handleStateChange = () => {
      if (worker.state === "installed") {
        worker.removeEventListener("statechange", handleStateChange);
        resolve();
      } else if (worker.state === "redundant") {
        worker.removeEventListener("statechange", handleStateChange);
        reject(new Error("更新のインストールに失敗しました。"));
      }
    };

    worker.addEventListener("statechange", handleStateChange);
  });
}

async function checkForUpdateAndReload() {
  if (!("serviceWorker" in navigator)) {
    window.location.reload();
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration(
    document.baseURI,
  );
  if (!registration) {
    window.location.reload();
    return;
  }

  await registration.update();
  const pendingWorker = registration.waiting ?? registration.installing;
  if (!pendingWorker) {
    window.location.reload();
    return;
  }

  if (pendingWorker.state !== "installed") {
    await waitForInstallation(pendingWorker);
  }

  let reloading = false;
  const reload = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", reload, {
    once: true,
  });
  (registration.waiting ?? pendingWorker).postMessage({ type: "SKIP_WAITING" });
  window.setTimeout(reload, 3000);
}

export function AppUpdateSettings() {
  const [checking, setChecking] = useState(false);

  const handleReload = async () => {
    setChecking(true);
    try {
      await checkForUpdateAndReload();
    } catch {
      window.location.reload();
    }
  };

  return (
    <section
      className="card app-update-settings"
      aria-labelledby="app-update-title"
    >
      <div className="section-heading">
        <h2 id="app-update-title">
          <RefreshCw size={24} aria-hidden="true" />
          アプリ情報
        </h2>
      </div>
      <p>最新版を確認して、アプリを再読み込みします。</p>
      <button
        type="button"
        className="secondary"
        disabled={checking}
        onClick={handleReload}
      >
        <RefreshCw size={18} aria-hidden="true" />
        {checking ? "更新を確認しています…" : "更新を確認して再読み込み"}
      </button>
    </section>
  );
}
