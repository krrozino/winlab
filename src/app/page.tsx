"use client";

import { useEffect, useState } from "react";
import { WebPackageWizard } from "@/components/WebPackageWizard";
import { parseConfigJson, serializeConfig } from "@/lib/config-io";
import { defaultConfig } from "@/lib/default-config";
import { Config } from "@/lib/types";

export default function WebHomePage() {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("winlab:web:config:v1");
      if (saved) setConfig(parseConfigJson(saved));
    } catch {
      /* navegador sem armazenamento persistente */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem("winlab:web:config:v1", serializeConfig(config));
    } catch {
      /* configuração continua utilizável em memória */
    }
  }, [loaded, config]);

  return <WebPackageWizard config={config} setConfig={setConfig} />;
}
