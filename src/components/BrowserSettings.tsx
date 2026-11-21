"use client";

import { useId, useState } from "react";
import { BROWSER_POLICY_LIST_LIMIT, isBrowserExtensionId, isBrowserSiteFilter, normalizeBrowserSiteFilter } from "@/lib/browser-policy";
import type { Config } from "@/lib/types";

const browserToggles = [
  ["blockChromeGuest", "Desativar modo convidado"],
  ["blockChromeNewProfiles", "Impedir a criação de perfis pelo menu do navegador"],
  ["blockChromeIncognito", "Desativar modo anônimo (Chrome) e InPrivate (Edge)"],
  ["blockChromePasswordManager", "Impedir que o navegador salve novas senhas"],
  ["blockChromeExtensions", "Bloquear extensões fora das listas autorizadas"]
] as const;

type ListEditorProps = {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (items: string[]) => void;
  validate: (input: string) => boolean;
  normalize?: (input: string) => string;
  invalidMessage: string;
  limit?: number;
};

function ListEditor({
  label, placeholder, values, onChange, validate, normalize, invalidMessage, limit
}: ListEditorProps) {
  const id = useId();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  function add() {
    const value = normalize ? normalize(input) : input.trim();
    if (!validate(value)) {
      setError(invalidMessage);
      return;
    }
    if (!values.some((existing) => (normalize ? normalize(existing) : existing) === value)) {
      if (limit && values.length >= limit) {
        setError("Limite de 1.000 endereços por lista.");
        return;
      }
      onChange([...values, value]);
    }
    setInput("");
    setError("");
  }

  return (
    <div className="web-list-editor">
      <label htmlFor={id}>{label}</label>
      <div className="web-field-actions">
        <input
          id={id}
          placeholder={placeholder}
          value={input}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? id + "-error" : undefined}
          onChange={(event) => { setInput(event.target.value); setError(""); }}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }}
          spellCheck={false}
          autoCapitalize="none"
        />
        <button type="button" className="secondary" onClick={add} aria-label={"Adicionar a " + label}>
          Adicionar
        </button>
      </div>
      {error && <small id={id + "-error"} role="alert">{error}</small>}
      {values.length > 0 && (
        <ul className="web-rule-list">
          {values.map((value, index) => (
            <li key={index}>
              <span>{value}{!validate(value) && <small> · Formato inválido</small>}</span>
              <button
                type="button"
                className="secondary"
                aria-label={"Remover " + value + " de " + label}
                onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BrowserSettings({
  config, onChange
}: {
  config: Config;
  onChange: <K extends keyof Config>(key: K, value: Config[K]) => void;
}) {
  return (
    <div className="web-option-stack">
      <p className="muted">
        Estas regras valem na conta restrita, nas versões compatíveis do Chrome e do Edge.
        Outros navegadores, aplicativos e o tráfego do Windows ficam fora desse filtro.
      </p>

      <fieldset className="web-option-stack web-setting-group">
        <legend>Recursos do navegador</legend>
        {browserToggles.map(([key, label]) => (
          <label className="web-checkbox" key={key}>
            <input type="checkbox" checked={config[key]} onChange={(event) => onChange(key, event.target.checked)} />
            {label}
          </label>
        ))}
        <p className="muted">
          Em computadores compartilhados, desative convidado, novos perfis e senhas salvas.
          Essas políticas preservam perfis e senhas que já existem.
        </p>
        <p className="muted">
          Nos detalhes da extensão, copie o ID de 32 letras de a a p.
          Os IDs só funcionam como exceções quando o bloqueio de extensões está ligado.
        </p>
        <div className="web-fields">
          {([
            ["chromeAllowedExtensionIds", "Extensões autorizadas no Chrome"],
            ["edgeAllowedExtensionIds", "Extensões autorizadas no Edge"]
          ] as const).map(([field, label]) => (
            <ListEditor
              key={field}
              label={label}
              placeholder="abcdefghijklmnopabcdefghijklmnop"
              values={config[field] ?? []}
              onChange={(values) => onChange(field, values)}
              validate={isBrowserExtensionId}
              invalidMessage="Use um ID de 32 letras minúsculas de a a p."
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="web-option-stack web-setting-group">
        <legend>Acesso a sites</legend>
        <label>
          Regra de navegação
          <select
            value={config.browserUrlMode}
            onChange={(event) => onChange("browserUrlMode", event.target.value as Config["browserUrlMode"])}
          >
            <option value="Unrestricted">Sem filtro de sites</option>
            <option value="BlockList">Bloquear sites específicos com exceções</option>
            <option value="AllowListOnly">Permitir somente sites autorizados</option>
          </select>
        </label>
        <p className="muted">
          Use <code>exemplo.org</code> para incluir subdomínios, <code>.exemplo.org</code> para o domínio exato
          ou <code>https://portal.exemplo.org/aulas</code> para um endereço específico.
          Em modo restrito, inclua os endereços usados para login e conteúdo das aulas.
        </p>
        <div className="web-fields">
          {([
            ["blockedUrls", "Sites bloqueados", "redesocial.exemplo.org"],
            ["allowedUrls", "Sites autorizados", "https://portal.exemplo.org/aulas"]
          ] as const).map(([field, label, placeholder]) => (
            <ListEditor
              key={field}
              label={label}
              placeholder={placeholder}
              values={config[field]}
              onChange={(values) => onChange(field, values)}
              validate={isBrowserSiteFilter}
              normalize={normalizeBrowserSiteFilter}
              invalidMessage="Use um domínio ou endereço HTTP/HTTPS válido, sem espaços."
              limit={BROWSER_POLICY_LIST_LIMIT}
            />
          ))}
        </div>
        <p className="muted">
          O modo sem filtro ignora as duas listas. No modo restrito, só a lista de sites autorizados é usada.
          Confira as regras efetivas em <code>chrome://policy</code> ou <code>edge://policy</code> após reabrir o navegador.
        </p>
      </fieldset>
    </div>
  );
}
