import "./globals.css";

export const metadata = {
  title: "WinLab Configurator",
  description: "Gerador de configuração de Windows para laboratórios e empresas"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
