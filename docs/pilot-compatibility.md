# WinLab 0.9 — Compatibilidade do piloto

## Status

O WinLab 0.9 é uma **release candidata para homologação**, não uma certificação de produção.

A compatibilidade real é determinada pelo `preflight.ps1`. O nome da edição do Windows, sozinho, não é suficiente para liberar o Apply.

## Alvo preferencial

### Windows 11

Alvo principal do primeiro piloto:

- Windows 11 Pro;
- Windows 11 Pro Education;
- Windows 11 Education;
- Windows 11 Enterprise.

O AppLocker pode ser configurado/aplicado nas versões atuais do Windows 11. A documentação de requisitos da Microsoft informa que, após o KB 5024351, não é mais exigida uma edição específica para impor políticas AppLocker no Windows 11.

Referência:
https://learn.microsoft.com/windows/security/application-security/application-control/app-control-for-business/applocker/requirements-to-use-applocker

## Windows 10

O motor também pode operar em Windows 10 versão 2004 ou posterior quando os requisitos do AppLocker e os cmdlets necessários estão presentes. A Microsoft informa que, a partir do KB 5024351, essas versões também não exigem edição específica para enforcement do AppLocker.

Entretanto, o suporte regular ao Windows 10 terminou em **14 de outubro de 2025**.

Em 2026, máquinas Windows 10 devem ser tratadas como:

1. dispositivos cobertos pelo programa ESU aplicável; ou
2. dispositivos em transição para Windows 11.

O WinLab não deve considerar um Windows 10 "saudável" apenas porque as políticas funcionam.

Referências:
https://support.microsoft.com/windows/deployment/updates-lifecycle/windows-10-support-has-ended-on-october-14-2025
https://learn.microsoft.com/windows/whats-new/extended-security-updates
https://learn.microsoft.com/windows/release-health/release-information

## Capability detection

Antes do piloto, o preflight verifica:

- privilégios administrativos;
- Get-LocalUser / Get-LocalGroup;
- Get-AppLockerPolicy / Set-AppLockerPolicy;
- Scheduled Tasks;
- Application Identity;
- contas configuradas;
- perfil/NTUSER.DAT;
- armazenamento;
- apps e caminhos;
- state.json;
- baselines;
- integridade do pacote.

Qualquer `BLOCK` impede o pacote piloto.

## Ainda não certificado fisicamente

A CI atual usa Windows Server 2025 para:

- PowerShell 5.1;
- PowerShell 7;
- parser;
- preview;
- preflight;
- AppLocker XML;
- manifest/hashes;
- pacote piloto.

Isso é uma camada de engenharia forte, mas **não substitui** a homologação em Windows 10/11 cliente.

## Matriz planejada

| Sistema | Estado no 0.9 |
| --- | --- |
| Windows 11 Pro | alvo primário do piloto |
| Windows 11 Education | planejado após piloto Pro |
| Windows 11 Enterprise | planejado |
| Windows 10 22H2 + ESU | compatibilidade temporária / validar |
| Windows 10 sem ESU | não recomendado para produção |
| Windows Home | fora do alvo inicial; capability detection obrigatória |

## Regra

O WinLab não deve usar apenas "edição suportada" como gate.

O gate é:

```text
OS suportado/aceitável
+ comandos necessários
+ AppLocker funcional
+ Application Identity
+ contas
+ estado recuperável
+ pacote íntegro
+ preflight sem BLOCK
= candidato a piloto
```
