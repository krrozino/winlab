"use client";

import React from "react";
import { OperatingMode } from "@/lib/types";

export interface DemoBannerProps {
  mode: OperatingMode;
  computerName?: string;
  isWebView2Available: boolean;
  onToggleMode?: (targetMode: OperatingMode) => void;
  isScanning?: boolean;
}

export function DemoBanner({
  mode,
  computerName,
  isWebView2Available,
  onToggleMode,
  isScanning = false
}: DemoBannerProps) {
  if (mode === "Demo") {
    return (
      <div
        role="alert"
        aria-label="Demonstration Mode"
        style={{
          background: "rgba(255, 122, 24, 0.12)",
          border: "2px solid var(--accent)",
          borderRadius: 10,
          padding: "14px 18px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 260 }}>
          <span style={{ fontSize: 24, flexShrink: 0 }}>⚠️</span>
          <div>
            <strong
              style={{
                color: "var(--accent)",
                fontSize: 13,
                letterSpacing: "0.04em",
                display: "block",
                textTransform: "uppercase"
              }}
            >
              [MODO DEMONSTRAÇÃO — DADOS FICTÍCIOS / NENHUMA POLÍTICA APLICADA]
            </strong>
            <span style={{ color: "var(--muted)", fontSize: 12, display: "block", marginTop: 2 }}>
              Esta instância do WinLab Desktop está operando exclusivamente em modo de simulação e fundação.
              Nenhum dado real do computador está sendo lido e nenhuma alteração será gravada.
            </span>
          </div>
        </div>

        {onToggleMode && (
          <button
            type="button"
            onClick={() => onToggleMode("Real")}
            disabled={!isWebView2Available || isScanning}
            className="secondary"
            style={{
              fontSize: 12,
              padding: "6px 14px",
              cursor: isWebView2Available ? "pointer" : "not-allowed",
              opacity: isWebView2Available ? 1 : 0.6,
              whiteSpace: "nowrap"
            }}
            title={
              !isWebView2Available
                ? "Modo Computador Real requer o aplicativo nativo WinLab Desktop (WebView2) instalado no Windows."
                : "Alternar para leitura de hardware e contas reais desta estação"
            }
          >
            {isScanning ? "Conectando ao Windows..." : "Conectar ao Computador Real →"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Real Computer Mode"
      style={{
        background: "rgba(46, 204, 113, 0.12)",
        border: "2px solid var(--success)",
        borderRadius: 10,
        padding: "14px 18px",
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 16
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 260 }}>
        <span style={{ fontSize: 24, flexShrink: 0 }}>🟢</span>
        <div>
          <strong
            style={{
              color: "var(--success)",
              fontSize: 13,
              letterSpacing: "0.04em",
              display: "block",
              textTransform: "uppercase"
            }}
          >
            [MODO COMPUTADOR REAL — CONECTADO AO WINDOWS: {computerName ?? "ESTAÇÃO LOCAL"}]
          </strong>
          <span style={{ color: "var(--muted)", fontSize: 12, display: "block", marginTop: 2 }}>
            Dados de hardware, contas locais e aplicativos obtidos diretamente do sistema operacional via IPC nativo.
          </span>
        </div>
      </div>

      {onToggleMode && (
        <button
          type="button"
          onClick={() => onToggleMode("Demo")}
          className="secondary"
          style={{
            fontSize: 12,
            padding: "6px 14px",
            whiteSpace: "nowrap",
            cursor: "pointer"
          }}
          title="Retornar ao ambiente isolado de demonstração com dados fictícios"
        >
          Voltar para Modo Demo
        </button>
      )}
    </div>
  );
}
