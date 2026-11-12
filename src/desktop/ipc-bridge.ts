import {
  DesktopIpcTransport,
  IpcEnvelope,
  IpcResponse
} from "./contracts";
import { MockDesktopAgent } from "./mock-agent";

/**
 * Verifica se a interface está em execução dentro do runtime Microsoft Edge WebView2
 * com a ponte nativa C# disponível.
 */
export function isWebView2Available(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return typeof window.chrome?.webview?.postMessage === "function";
}

interface PendingRequest<T> {
  resolve: (value: IpcResponse<T>) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Cliente IPC bidirecional tipado para comunicação com o host C# (WinLab.Desktop / WPF).
 * Utiliza o canal window.chrome.webview com correlação de id/replyToId e timeout resiliente.
 */
export class WebViewIpcBridge implements DesktopIpcTransport {
  public readonly isRunning = true;
  public readonly mode = "Native C# Host (WebView2 IPC)";

  private readonly timeoutMs: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly pendingRequests = new Map<string, PendingRequest<any>>();
  private isDisposed = false;

  constructor(timeoutMs = 10000) {
    this.timeoutMs = timeoutMs;

    if (typeof window !== "undefined" && window.chrome?.webview?.addEventListener) {
      window.chrome.webview.addEventListener("message", this.handleIncomingMessage);
    }
  }

  /**
   * Envia uma mensagem estruturada ao host C# e aguarda a resposta correlacionada.
   */
  public async handleRequest<T = unknown>(envelope: IpcEnvelope): Promise<IpcResponse<T>> {
    if (this.isDisposed) {
      return {
        id: crypto.randomUUID(),
        replyToId: envelope.id || "",
        success: false,
        error: "O canal IPC já foi encerrado.",
        errorCode: "IPC_BRIDGE_DISPOSED"
      };
    }

    if (!isWebView2Available()) {
      return {
        id: crypto.randomUUID(),
        replyToId: envelope.id || "",
        success: false,
        error: "Ambiente WebView2 nativo não detectado. A ponte postMessage está indisponível.",
        errorCode: "WEBVIEW2_NOT_AVAILABLE"
      };
    }

    const messageId = envelope.id || crypto.randomUUID();
    const finalEnvelope: IpcEnvelope = {
      ...envelope,
      id: messageId
    };

    return new Promise<IpcResponse<T>>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(messageId)) {
          this.pendingRequests.delete(messageId);
          resolve({
            id: crypto.randomUUID(),
            replyToId: messageId,
            success: false,
            error: `Tempo limite esgotado (${this.timeoutMs}ms) aguardando resposta da ação '${envelope.action}' do host C#.`,
            errorCode: "IPC_TIMEOUT"
          });
        }
      }, this.timeoutMs);

      this.pendingRequests.set(messageId, { resolve, reject, timer });

      try {
        const rawJson = JSON.stringify(finalEnvelope);
        window.chrome!.webview!.postMessage(rawJson);
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(messageId);
        resolve({
          id: crypto.randomUUID(),
          replyToId: messageId,
          success: false,
          error: `Falha ao transmitir mensagem para o WebView2: ${(err as Error).message}`,
          errorCode: "POST_MESSAGE_FAILED"
        });
      }
    });
  }

  /**
   * Processa mensagens assíncronas enviadas pelo C# via PostWebMessageAsString.
   */
  private handleIncomingMessage = (event: MessageEvent): void => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let response: IpcResponse<any>;

      if (typeof event.data === "string") {
        response = JSON.parse(event.data);
      } else {
        response = event.data;
      }

      if (!response) {
        return;
      }

      const correlationId = response.replyToId || response.id;
      if (correlationId && this.pendingRequests.has(correlationId)) {
        const pending = this.pendingRequests.get(correlationId)!;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(correlationId);
        pending.resolve(response);
      }
    } catch {
      // Ignora mensagens malformadas que não sejam JSON estruturado do WinLab
    }
  };

  /**
   * Libera recursos e listeners do canal IPC.
   */
  public dispose(): void {
    this.isDisposed = true;
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.resolve({
        id: crypto.randomUUID(),
        replyToId: id,
        success: false,
        error: "Canal IPC encerrado durante a requisição.",
        errorCode: "IPC_BRIDGE_DISPOSED"
      });
    }
    this.pendingRequests.clear();

    if (typeof window !== "undefined" && window.chrome?.webview?.removeEventListener) {
      window.chrome.webview.removeEventListener("message", this.handleIncomingMessage);
    }
  }
}

/**
 * Cria a instância adequada de transporte IPC:
 * Utiliza WebViewIpcBridge nativo se o WebView2 estiver disponível;
 * Caso contrário, utiliza MockDesktopAgent em memória como fallback para desenvolvimento web.
 */
export function createDesktopTransport(): DesktopIpcTransport {
  if (isWebView2Available()) {
    // A autorização UAC pode levar até 45s: o IPC não deve expirar antes do Windows.
    return new WebViewIpcBridge(70000);
  }
  return new MockDesktopAgent();
}
