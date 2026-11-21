export function WindowsPolicyHelp() {
  return (
    <details className="web-policy-help">
      <summary>Compatibilidade com Windows e AppLocker</summary>
      <ul>
        <li>Comece em auditoria numa máquina piloto. Esse modo registra as regras do AppLocker. As regras de navegador, personalização e leitura ou gravação de USB já valem após aplicar o perfil.</li>
        <li>
          O AppLocker requer o serviço Application Identity e os comandos de administração. O Windows 11 e o Windows 10 2004 ou mais recente com KB5024351 admitem aplicação em todas as edições. Builds anteriores têm restrições de edição e gerenciamento.
          {" "}<a href="https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/applocker/requirements-to-use-applocker">Requisitos do AppLocker</a>
        </li>
        <li>
          MSI cobre arquivos .msi, .msp e .mst. O bloqueio da Microsoft Store mira o aplicativo da loja. Outros meios de instalação, como o winget, seguem suas próprias regras.
          {" "}<a href="https://learn.microsoft.com/en-us/windows/configuration/store/">Acesso à Microsoft Store</a>
        </li>
        <li>O bloqueio de CMD, PowerShell e Regedit se aplica aos executáveis nos caminhos padrão. A equipe de TI deve conferir as ferramentas instaladas no PC piloto.</li>
        <li>
          Leitura e gravação aplicam a política de discos removíveis à conta restrita. Os modelos administrativos CSP documentam suporte em Pro, Enterprise e Education a partir do Windows 10 2004 com KB5005101 e no Windows 11. A execução usa regras do AppLocker.
          {" "}<a href="https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-admx-removablestorage">Políticas de discos removíveis</a>
        </li>
      </ul>
    </details>
  );
}
