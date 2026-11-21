"use client";

import { downloadBlob } from "@/lib/web-download";
import { generateRollbackScript, generateSetupScript, generateVerifyScript } from "@/lib/generator";
import type { Config } from "@/lib/types";

const scripts = [
  ["setup.ps1", (config: Config) => generateSetupScript(config, { confirmApply: true })],
  ["verify.ps1", generateVerifyScript],
  ["rollback.ps1", (config: Config) => generateRollbackScript(config, { confirmApply: true })]
] as const;

export function StandalonePowerShell({ config, disabled }: { config: Config; disabled: boolean }) {
  return (
    <section className="web-option-stack web-download-card" aria-label="Scripts PowerShell avulsos">
      <h3>Scripts PowerShell avulsos</h3>
      <p className="muted">
        Use em uma máquina piloto. Os arquivos avulsos não incluem manifesto SHA-256.
        Para conferir a integridade dos arquivos durante a execução, use o ZIP completo.
      </p>
      <div className="web-actions">
        {scripts.map(([name, generate]) => (
          <button
            key={name}
            type="button"
            className="secondary"
            disabled={disabled}
            onClick={() => downloadBlob(name, new Blob([generate(config)], { type: "text/plain;charset=utf-8" }))}
          >
            Baixar {name}
          </button>
        ))}
      </div>
      <details>
        <summary>Como executar com segurança</summary>
        <ol className="muted">
          <li>Reúna os três arquivos do mesmo perfil em uma pasta local. Leia os scripts e use uma estação piloto com acesso à conta administrativa.</li>
          <li>Abra o Windows PowerShell 5.1 de 64 bits como administrador nessa pasta e execute <code>.\verify.ps1</code> para conferir a máquina.</li>
          <li>Execute <code>.\setup.ps1</code> para ver o plano. Para aplicar, rode <code>.\setup.ps1 -Apply</code> e digite <kbd>S</kbd>. Em seguida, use <code>.\verify.ps1 -PostApply</code>.</li>
          <li>Para reverter na mesma máquina, rode <code>.\rollback.ps1</code> para revisar e depois <code>.\rollback.ps1 -Apply</code>. Confirme com <kbd>S</kbd>. A reversão depende do estado e dos backups criados pelo setup.</li>
        </ol>
        <p className="muted">
          Se o Windows marcar o download como bloqueado, confirme a origem com a equipe de TI.
          Quando autorizado, use <code>Unblock-File -LiteralPath .\verify.ps1, .\setup.ps1, .\rollback.ps1</code> só para esses arquivos.
          <a href="https://learn.microsoft.com/powershell/module/microsoft.powershell.utility/unblock-file?view=powershell-5.1"> Documentação do PowerShell</a>
        </p>
      </details>
    </section>
  );
}
