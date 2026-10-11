export const driveScope = "https://www.googleapis.com/auth/drive.appdata";
const scopes = `${driveScope} openid email profile`;
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}
interface GoogleOAuth {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    include_granted_scopes: boolean;
    callback: (response: TokenResponse) => void;
    error_callback: (error: { type: string }) => void;
  }): { requestAccessToken(options: { prompt: string }): void };
  revoke(
    token: string,
    callback: (response: { successful: boolean; error?: string }) => void,
  ): void;
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth } };
  }
}
export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
let loading: Promise<void> | undefined;
export function prepareGoogle(): Promise<void> {
  if (!googleClientId)
    return Promise.reject(
      new Error(
        "Google連携の設定がありません。READMEのGoogle Cloud設定手順をご確認ください。",
      ),
    );
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    const timer = window.setTimeout(() => {
      script.remove();
      loading = undefined;
      reject(
        new Error(
          "Google連携を読み込めませんでした。ネット接続をご確認ください。",
        ),
      );
    }, 20_000);
    script.onload = () => {
      clearTimeout(timer);
      if (window.google?.accounts.oauth2) resolve();
      else {
        loading = undefined;
        reject(new Error("Google連携を読み込めませんでした。"));
      }
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      loading = undefined;
      reject(
        new Error(
          "Google連携を読み込めませんでした。ネット接続をご確認ください。",
        ),
      );
    };
    document.head.append(script);
  });
  return loading;
}
// Call directly in a click handler after prepareGoogle has completed, preserving
// browser user activation for the OAuth popup. Credentials never enter storage.
export function authorizeGoogle(): Promise<{
  token: string;
  expiresAt: number;
}> {
  if (!window.google?.accounts.oauth2 || !googleClientId)
    return Promise.reject(
      new Error("Google連携の準備ができていません。もう一度お試しください。"),
    );
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () =>
        reject(
          new Error(
            "Google連携が完了しませんでした。もう一度連携してください。",
          ),
        ),
      120_000,
    );
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: scopes,
      include_granted_scopes: false,
      callback(response) {
        clearTimeout(timer);
        const expiresIn = Number(response.expires_in);
        if (
          response.error ||
          !response.access_token ||
          !response.scope?.split(" ").includes(driveScope) ||
          !Number.isFinite(expiresIn) ||
          expiresIn <= 0
        )
          reject(
            new Error(
              "Google Driveの利用が許可されませんでした。連携をやり直してください。",
            ),
          );
        else
          resolve({
            token: response.access_token,
            expiresAt: Date.now() + expiresIn * 1000,
          });
      },
      error_callback(error) {
        clearTimeout(timer);
        reject(
          new Error(
            error.type === "popup_closed"
              ? "連携画面が閉じられました。"
              : "Googleの連携画面を開けませんでした。ブラウザのポップアップ設定をご確認ください。",
          ),
        );
      },
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}
export async function googleAccount(token: string) {
  const response = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok)
    throw new Error(
      "Googleアカウントを確認できませんでした。もう一度連携してください。",
    );
  const account = (await response.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
  };
  if (!account.sub || !account.email || !account.email_verified)
    throw new Error("Googleアカウントを確認できませんでした。");
  return { id: account.sub, email: account.email };
}
export function revokeGoogle(token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts.oauth2) {
      reject(
        new Error("Google連携を読み込んでから、もう一度解除してください。"),
      );
      return;
    }
    const timer = window.setTimeout(
      () =>
        reject(
          new Error(
            "Google側の権限解除を確認できませんでした。Googleアカウントの接続設定でも解除できます。",
          ),
        ),
      20_000,
    );
    window.google.accounts.oauth2.revoke(token, (response) => {
      clearTimeout(timer);
      if (response.successful || response.error === "invalid_token") resolve();
      else
        reject(
          new Error(
            "Google側の権限解除を確認できませんでした。Googleアカウントの接続設定でも解除できます。",
          ),
        );
    });
  });
}
