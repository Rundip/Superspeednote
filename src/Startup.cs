// Microsoft Store version only: the package's startup task runs this at Windows logon, and it starts the app
// in "standby" (hotkeys only, almost no memory). A startup task can't pass arguments, hence this tiny helper.
using System.Diagnostics;
using System.IO;
using System.Reflection;

[assembly: AssemblyTitle("Super Speed Note startup")]
[assembly: AssemblyProduct("Super Speed Note")]
[assembly: AssemblyCompany("Rundip")]
[assembly: AssemblyCopyright("© 2026 Rundip")]

static class Startup
{
    static void Main()
    {
        string dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        Process.Start(new ProcessStartInfo(Path.Combine(dir, "SuperSpeedNote.exe"), "--standby") { UseShellExecute = false, WorkingDirectory = dir });
    }
}
