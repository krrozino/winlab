using System;
using System.Windows;
using Velopack;

namespace WinLab.Desktop
{
    public partial class App : Application
    {
        [STAThread]
        private static void Main(string[] args)
        {
            // Deve executar antes de carregar WPF para reconhecer instalação e atualização.
            VelopackApp.Build().Run();

            var app = new App();
            app.InitializeComponent();
            app.Run();
        }
    }
}
