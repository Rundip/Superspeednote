// Super Speed Note - native shell.
// A frameless WinForms window that hosts one WebView2 page (src/ui parts joined into one, embedded),
// plus everything a browser page cannot do: global hotkeys, focus switching, tray, files.
// Compiled with the C# 5 compiler that ships with Windows (see build.ps1), so: no newer syntax.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

[assembly: AssemblyTitle("Super Speed Note")]
[assembly: AssemblyProduct("Super Speed Note")]
[assembly: AssemblyDescription("Super Speed Note")]
[assembly: AssemblyCompany("Mukhodeveloper")]
[assembly: AssemblyCopyright("© 2026 Mukhodeveloper")]
[assembly: AssemblyVersion(SuperSpeedNote.Program.Version + ".0")]
[assembly: AssemblyFileVersion(SuperSpeedNote.Program.Version + ".0")]
[assembly: AssemblyInformationalVersion(SuperSpeedNote.Program.Version)]

namespace SuperSpeedNote
{
    static class Program
    {
        public const string Version = "1.6.3";
        public const string WebView2Version = "1.0.4258.31";
        public static string DataDir, LocalDir;
        public static bool Portable;                  // a "data" folder next to the exe holds the notes (test / USB copies)
        public static bool Imported;                  // Store version: the exe version's notes were copied in on this start
        public static int Restored = -1;              // notes brought back from the outside backup on this start (-1: none)

        // Installed from the Microsoft Store (MSIX package) rather than run as a plain exe
        public static readonly bool Packaged = IsPackaged();
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern int GetCurrentPackageFullName(ref int length, StringBuilder name);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern int GetCurrentPackageFamilyName(ref int length, StringBuilder name);
        // the package's own data folder, %LOCALAPPDATA%\Packages\<family name> (where a Store app keeps its data)
        static string PackageDataRoot()
        {
            int n = 0;
            GetCurrentPackageFamilyName(ref n, null);
            var sb = new StringBuilder(n);
            if (n == 0 || GetCurrentPackageFamilyName(ref n, sb) != 0) return null;
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Packages", sb.ToString());
        }
        static bool IsPackaged()
        {
            try { int n = 0; return GetCurrentPackageFullName(ref n, null) != 15700 /*APPMODEL_ERROR_NO_PACKAGE*/; }
            catch { return false; }
        }
        public static readonly Stopwatch Clock = Stopwatch.StartNew();
        public static long ShownMs;
        static readonly StringBuilder marks = new StringBuilder();
        public static void Mark(string what) { marks.Append(what).Append(' ').Append(Clock.ElapsedMilliseconds).Append("ms  "); }
        public static string Marks { get { return marks.ToString(); } }
        static Assembly coreAsm;
        static Mutex mutex;

        [STAThread]
        static void Main(string[] args)
        {
            bool tray = false, standby = false, dev = false, quit = false, restart = false;
            string ui = null;
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--tray") tray = true;
                else if (args[i] == "--standby") standby = true;    // hotkeys only, no window, no web engine
                else if (args[i] == "--quit") quit = true;          // ask a running copy to save and exit (used by build/install)
                else if (args[i] == "--dev") dev = true;
                else if (args[i] == "--restart") restart = true;   // started by the app itself as it closes (restore from a backup)
                else if (args[i] == "--ui" && i + 1 < args.Length) { ui = args[++i]; dev = true; }
            }

            bool created;
            mutex = new Mutex(true, "SuperSpeedNote.SingleInstance." + Environment.UserName, out created);
            if (!created && restart) { try { created = mutex.WaitOne(15000); } catch (AbandonedMutexException) { created = true; } }   // the old one is closing
            if (!created && !quit && OlderRunning())
            {
                // A newer version was started while an older one runs (in the tray, in standby, started with Windows):
                // the old one saves and exits, and this one takes over - so a new exe never just shows the old app.
                Native.PostMessage((IntPtr)0xFFFF, Native.RegisterWindowMessage("SuperSpeedNote.Quit"), IntPtr.Zero, IntPtr.Zero);
                try { created = mutex.WaitOne(10000); } catch (AbandonedMutexException) { created = true; }
            }
            if (!created && (standby || tray) && !quit) return;   // started with Windows while one already runs (exe and Store
                                                                    // versions both set to start): leave it be, no window pops up
            if (!created)
            {
                // Already running (in the tray or in standby): ask it to come forward (or to quit) and exit.
                Native.AllowSetForegroundWindow(-1);
                Native.PostMessage((IntPtr)0xFFFF, Native.RegisterWindowMessage(quit ? "SuperSpeedNote.Quit" : "SuperSpeedNote.Show"), IntPtr.Zero, IntPtr.Zero);
                return;
            }
            if (quit) return;

            string exeDir = Path.GetDirectoryName(Application.ExecutablePath);
            string portable = Path.Combine(exeDir, "data");
            Portable = Directory.Exists(portable);
            DataDir = Portable ? portable
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SuperSpeedNote");
            LocalDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SuperSpeedNote");
            string pkg = Packaged ? PackageDataRoot() : null, legacy = DataDir;
            if (pkg != null)
            {
                // Store version: the package's own folders (real paths, so "open data folder" shows them)
                DataDir = Path.Combine(pkg, "LocalState");
                LocalDir = Path.Combine(pkg, "LocalCache");
            }
            Directory.CreateDirectory(DataDir);
            Directory.CreateDirectory(LocalDir);
            Application.EnableVisualStyles();                   // (before any message box below)
            Application.SetCompatibleTextRenderingDefault(false);
            RestorePending();                                   // "백업에서 복원" in settings: done now, before anything reads the notes
            if (!standby && !tray) OfferRestore();             // a fresh install with notes in the outside backup: bring them back?
            if (pkg != null) ImportOnce(legacy, DataDir);      // ...else the exe version's notes on this PC, copied in once
            BackupOnVersionChange();

            AppDomain.CurrentDomain.AssemblyResolve += ResolveEmbedded;
            Application.ThreadException += (s, e) => Log(e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (s, e) => Log(e.ExceptionObject as Exception);
            Run(tray, standby, dev, ui);
            GC.KeepAlive(mutex);
        }

        // The copy already running is found by its main window (it exists, hidden, in the tray / standby too): true
        // when this exe is a newer version of the app
        static bool OlderRunning()
        {
            try
            {
                Version mine = new Version(Version + ".0");
                IntPtr h = IntPtr.Zero;
                while ((h = Native.FindWindowEx(IntPtr.Zero, h, null, "Super Speed Note")) != IntPtr.Zero)
                {
                    uint pid;
                    Native.GetWindowThreadProcessId(h, out pid);
                    if (pid == 0 || pid == Native.GetCurrentProcessId()) continue;
                    using (Process p = Process.GetProcessById((int)pid))
                    {
                        FileVersionInfo fv = FileVersionInfo.GetVersionInfo(p.MainModule.FileName);
                        if (fv.ProductName == "Super Speed Note" && fv.FileVersion != null) return mine > new Version(fv.FileVersion);
                    }
                }
            }
            catch (Exception) { }
            return false;
        }

        // No notes here yet (a new install, the Store version installed again) but the outside backup has some: asked
        // once whether to bring them back - "아니요" leaves the backup as it is and starts empty
        static void OfferRestore()
        {
            try
            {
                if (File.Exists(Path.Combine(DataDir, "state.json")) || !OuterBackup.On) return;
                string latest = Path.Combine(OuterBackup.Dir, OuterBackup.Latest);
                int n = OuterBackup.CountNotes(latest);
                if (n == 0 || !File.Exists(Path.Combine(latest, "state.json"))) return;
                DateTime when = File.GetLastWriteTime(Path.Combine(latest, "state.json"));
                if (MessageBox.Show("전에 쓰던 메모의 백업이 있어요.\n\n" + OuterBackup.Dir + "\n메모 " + n + "개 · 마지막 백업 " + when.ToString("yyyy-MM-dd HH:mm") +
                    "\n\n이 메모를 가져올까요?", "Super Speed Note", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button1) != DialogResult.Yes)
                {
                    // starting over: that backup is kept aside, as it is, and a new one begins for the new notes
                    try { Directory.Move(latest, latest + "-보관-" + DateTime.Now.ToString("yyyyMMdd-HHmm")); } catch (Exception ex) { Log(ex); }
                    return;
                }
                string why = OuterBackup.RestoreFrom(latest);
                if (why != null) MessageBox.Show("백업에서 가져오지 못했어요: " + why + "\n백업 폴더는 그대로 있어요.", "Super Speed Note", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                else Restored = n;
            }
            catch (Exception ex) { Log(ex); }
        }

        // settings › 백업에서 복원: the app wrote which backup and started itself again (--restart) as it closed
        static void RestorePending()
        {
            string f = Path.Combine(LocalDir, "restore-pending.txt");
            try
            {
                if (!File.Exists(f)) return;
                string from = File.ReadAllText(f, Encoding.UTF8).Trim();
                File.Delete(f);
                if (from.Length == 0) return;
                string why = OuterBackup.RestoreFrom(from);
                if (why != null) MessageBox.Show("백업에서 복원하지 못했어요: " + why + "\n메모는 복원 전 그대로예요.", "Super Speed Note", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                else Restored = OuterBackup.CountNotes(from);
            }
            catch (Exception ex) { Log(ex); }
        }

        // First start of the Store version on a PC that had the exe version: its notes (not its backups) are copied in;
        // state.json goes last, so an interrupted copy is simply done again next time.
        static void ImportOnce(string from, string to)
        {
            try
            {
                if (File.Exists(Path.Combine(to, "state.json")) || !File.Exists(Path.Combine(from, "state.json"))) return;
                string[] skip = { Path.Combine(from, "backups") + "\\", Path.Combine(from, "version.txt") };
                foreach (string f in Directory.GetFiles(from, "*", SearchOption.AllDirectories))
                {
                    if (f.StartsWith(skip[0], StringComparison.OrdinalIgnoreCase) || string.Equals(f, skip[1], StringComparison.OrdinalIgnoreCase)) continue;
                    if (string.Equals(Path.GetFileName(f), "state.json", StringComparison.OrdinalIgnoreCase) && Path.GetDirectoryName(f) == from) continue;
                    string dst = Path.Combine(to, f.Substring(from.Length + 1));
                    Directory.CreateDirectory(Path.GetDirectoryName(dst));
                    File.Copy(f, dst, true);
                }
                File.Copy(Path.Combine(from, "state.json"), Path.Combine(to, "state.json"), true);
                Imported = true;
            }
            catch (Exception ex) { Log(ex); }
        }

        // Notes live outside the exe, so updates never touch them. Still, the first start of a new
        // version takes a full copy of the data first (backups\before-<version>).
        static void BackupOnVersionChange()
        {
            try
            {
                string marker = Path.Combine(DataDir, "version.txt");     // per data folder (portable copies have their own)
                string last = File.Exists(marker) ? File.ReadAllText(marker).Trim() : "";
                if (last == Version) return;
                if (File.Exists(Path.Combine(DataDir, "state.json")))
                    DataBackup.Run("before-" + Version + (last.Length > 0 ? "-from-" + last : ""));
                File.WriteAllText(marker, Version);
            }
            catch (Exception ex) { Log(ex); }
        }

        // Kept separate so WebView2 types are only touched after AssemblyResolve is hooked.
        [MethodImpl(MethodImplOptions.NoInlining)]
        static void Run(bool tray, bool standby, bool dev, string ui)
        {
            Mark("run");
            if (!standby) MainForm.Prewarm();                    // browser engine + note files start loading now
            Mark("prewarm");
            var form = new MainForm(tray || standby, dev, ui);
            Mark("form");
            if (tray || standby) { IntPtr h = form.Handle; GC.KeepAlive(h); } // hidden; hotkeys live on this window
            else { form.Show(); form.Update(); }               // paint the window first...
            ShownMs = Clock.ElapsedMilliseconds;
            Mark("shown");
            form.Start(!standby);                               // ...then spin up the web engine (not in standby)
            Application.Run();
        }

        // Microsoft.Web.WebView2.Core.dll is embedded in the exe -> single-file app.
        static Assembly ResolveEmbedded(object sender, ResolveEventArgs e)
        {
            if (!e.Name.StartsWith("Microsoft.Web.WebView2.Core", StringComparison.OrdinalIgnoreCase)) return null;
            if (coreAsm == null) coreAsm = Assembly.Load(ReadResource("SSN.WebView2.Core.dll"));
            return coreAsm;
        }

        public static byte[] ReadResource(string name)
        {
            using (Stream s = typeof(Program).Assembly.GetManifestResourceStream(name))
            using (var ms = new MemoryStream())
            {
                s.CopyTo(ms);
                return ms.ToArray();
            }
        }

        // The native WebView2 loader is unpacked once per SDK version.
        public static string EnsureLoader()
        {
            string dir = Path.Combine(LocalDir, "bin", WebView2Version);
            string path = Path.Combine(dir, "WebView2Loader.dll");
            if (!File.Exists(path))
            {
                Directory.CreateDirectory(dir);
                string tmp = path + "." + Process.GetCurrentProcess().Id + ".tmp";
                File.WriteAllBytes(tmp, ReadResource("SSN.WebView2Loader.dll"));
                try { File.Move(tmp, path); } catch (IOException) { File.Delete(tmp); }
            }
            return dir;
        }

        public static void Log(Exception ex)
        {
            if (ex == null) return;
            try { File.AppendAllText(Path.Combine(LocalDir, "error.log"), DateTime.Now.ToString("s") + " " + ex + "\r\n\r\n"); }
            catch { }
        }
    }

    sealed class MainForm : Form
    {
        public static readonly int WM_SSN_SHOW = Native.RegisterWindowMessage("SuperSpeedNote.Show");
        bool inPosChanged;
        const int WM_WINDOWPOSCHANGED = 0x0047;
        const int WM_MOVE = 0x0003, WM_NCCALCSIZE = 0x0083, WM_NCLBUTTONDOWN = 0x00A1, WM_HOTKEY = 0x0312, WM_DPICHANGED = 0x02E0;
        const int HTCAPTION = 2;
        const char SEP = '\x1f';
        const string Origin = "https://app.ssn/";
        const string AppKey = "@app";
        const string FindKey = "@find";
        string pendingPalette;            // search window to open once the page is ready ("pop" / "in")
        bool paletteOpen;                 // page reports its search window open
        // The page lives in one WebView that moves between windows: the main window, the "find & paste"
        // window over another program, or the quick memo in the screen corner.
        Form webIn;
        PopForm pop;
        bool popWanted;
        bool holdWeb;     // the page is on its way between windows: shown in neither (the app window keeps its picture)
        bool popShown { get { return pop != null && webIn == pop; } }
        // the app window as it was when its page went into the search window: shown in its place meanwhile, so an
        // app window left open behind other programs keeps its look instead of turning into a bare navy box
        Bitmap still;
        Color popBg = Color.White, quickBg = Color.White;
        const string QuickKey = "@quick";
        QuickForm quick;
        bool quickOpen, pendingQuick, quickHidMain;   // quickOpen: a quick memo is being written (window may be paused for "find & paste")
        bool quickShown { get { return quick != null && webIn == quick; } }
        IntPtr quickRet;                               // program to give the keyboard back to when the memo is put away
        static readonly uint MyPid = Native.GetCurrentProcessId();

        readonly bool dev;
        readonly string uiPath;
        bool startMaximized, webReady, webStarted, quitting, quitFull, finished, closeToTray = true, maxState, trayHintShown, pendingNew, marksWritten;
        int quitSeq;
        string startupMode = GetStartupMode();
        Stopwatch fromStandby;
        public static readonly int WM_SSN_QUIT = Native.RegisterWindowMessage("SuperSpeedNote.Quit");
        CoreWebView2Environment env;
        CoreWebView2Controller ctl;
        CoreWebView2 wv;
        byte[] indexHtml;
        NotifyIcon tray;
        Icon appIcon, trayIcon;
        Color bg = Color.FromArgb(0x08, 0x15, 0x36);
        // the notes live in notes\<id>.html only (fixed names, whatever the note is called); the readable copies in
        // the 메모 folder are no longer written - one place, nothing to keep in step
        readonly Saver saver = new Saver();
        System.Windows.Forms.Timer backupTimer;

        // global hotkeys: registration id -> note id ("@app" = show/hide the app)
        readonly Dictionary<int, string> hotkeys = new Dictionary<int, string>();
        string hotkeySpec = "";
        bool hotkeysSuspended;
        string activeNote = "";           // note shown in the page ("" = board)
        string pendingOpen;               // note to open once the page has loaded
        int lastDeactivate;
        // where a second press of the same hotkey takes you back to
        bool hasReturn, retHidden, retMinimized;
        IntPtr retHwnd;
        string retNote;

        static string NotesDir { get { return Path.Combine(Program.DataDir, "notes"); } }
        static string MirrorDir { get { return Path.Combine(Program.DataDir, "메모"); } }   // readable copies named after the notes
        static string TrashDir { get { return Path.Combine(Program.DataDir, "trash"); } }
        // what the newest version knew about every note (name, colour, pin, place) - older versions never write it,
        // so a note an older version's list lost comes back with its name instead of as '제목 없음'
        int jsErrors;
        static string MetaPath { get { return Path.Combine(Program.DataDir, "notes-meta.json"); } }
        static string ImagesDir { get { return Path.Combine(Program.DataDir, "images"); } }
        static string StatePath { get { return Path.Combine(Program.DataDir, "state.json"); } }

        public MainForm(bool startHidden, bool dev, string uiPath)
        {
            this.dev = dev;
            this.uiPath = uiPath;
            Text = "Super Speed Note";
            FormBorderStyle = FormBorderStyle.Sizable;   // keeps snap, min/max animation & shadow; frame removed in WM_NCCALCSIZE
            StartPosition = FormStartPosition.Manual;
            BackColor = bg;
            DoubleBuffered = true;
            SetStyle(ControlStyles.ResizeRedraw, true);   // the splash is drawn for the whole window: repaint all of it when it grows (start maximized)
            MinimumSize = new Size(460, 340);
            appIcon = LoadIcon(0);
            Icon = appIcon;
            webIn = this;
            LoadBounds();
            saver.OnError = msg => { try { BeginInvoke(new Action(() => Post("toast", "저장 실패: " + msg))); } catch { } };
            // waking from sleep, a monitor plugged in or out: the page is drawn again (it could stay a blank surface)
            SystemEvents.PowerModeChanged += OnPowerOrDisplay;
            SystemEvents.DisplaySettingsChanged += OnPowerOrDisplay;
            FormClosed += (s, e) => { SystemEvents.PowerModeChanged -= OnPowerOrDisplay; SystemEvents.DisplaySettingsChanged -= OnPowerOrDisplay; };
        }

        void OnPowerOrDisplay(object sender, EventArgs e)
        {
            var pm = e as PowerModeChangedEventArgs;
            if (pm != null && pm.Mode != PowerModes.Resume) return;
            try { BeginInvoke(new Action(() => { RedrawWeb(); pingAt = 0; })); } catch { }
        }

        static Icon LoadIcon(int size)
        {
            using (var ms = new MemoryStream(Program.ReadResource("SSN.app.ico")))
                return size > 0 ? new Icon(ms, size, size) : new Icon(ms);
        }

        // ---------- window chrome ----------
        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            var m = new Native.MARGINS { Left = 1, Right = 1, Top = 1, Bottom = 1 };  // keeps the DWM drop shadow
            try { Native.DwmExtendFrameIntoClientArea(Handle, ref m); } catch { }
            Native.SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x0027 /*FRAMECHANGED|NOMOVE|NOSIZE|NOZORDER*/ | 0x0010 /*NOACTIVATE*/);
        }

        public void Start(bool web)
        {
            Task.Run(() => { Thread.Sleep(3000); RepairStartupPath(); });   // after a hand-over the old exe may still be closing
            TrackForeground();
            if (web)
            {
                if (Visible) ApplyStartMaximized();
                webStarted = true;
                InitWebView();
            }
            else LoadSavedHotkeys();   // standby: no page yet, so register the last known hotkeys ourselves
            BeginInvoke(new Action(SetupTray));
        }

        void LoadSavedHotkeys()
        {
            try
            {
                string f = Path.Combine(Program.DataDir, "hotkeys.txt");
                if (!File.Exists(f)) return;
                hotkeySpec = File.ReadAllText(f).Trim();
                ApplyHotkeys();
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        // Standby -> active: start the web engine on demand (first hotkey press or tray click).
        void EnsureWeb()
        {
            if (webStarted) return;
            webStarted = true;
            fromStandby = Stopwatch.StartNew();
            Prewarm();
            InitWebView();
            UpdateTrayText();
        }

        // The page's process crashed (out of memory, a graphics driver reset after sleep...) or the whole engine
        // closed: WebView2 then shows only its background - the window a blank navy box until the app was restarted.
        // The notes already saved are read again and the page starts over (what was typed in the last moment before
        // the crash, still in the dead page, can't be saved). Several crashes in a row: say so instead of looping.
        int recoveries; long lastRecovery;
        void RecoverWeb(bool engine)
        {
            if (finished || quitting || !webStarted || wv == null) return;   // closed on purpose (standby, quit): nothing to bring back
            long nowMs = Environment.TickCount;
            recoveries = nowMs - lastRecovery < 60000 ? recoveries + 1 : 1;
            lastRecovery = nowMs;
            if (recoveries > 3)
            {
                MessageBox.Show(this, "화면 엔진이 계속 멈춰요. 앱을 다시 시작해 주세요.\n(저장된 메모는 그대로 있어요.)", "Super Speed Note", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            saver.Flush(3000);
            // the page comes back in the app window; the find & paste window and the quick memo close
            popWanted = false; holdWeb = false;
            if (pop != null) { pop.Attached = false; if (pop.Visible) pop.Hide(); }
            DetachQuick(true);
            if (webIn != this) PutWeb(this);
            webReady = false;
            pendingOpen = null; pendingNew = false; pendingPalette = null; pendingQuick = false; paletteOpen = false;
            HideCover();
            Invalidate();                                       // the splash, until the page is back
            if (engine)
            {
                try { if (ctl != null) ctl.Close(); } catch { }
                ctl = null; wv = null; env = null; envTask = null; bootTask = null;
                webStarted = false;
                EnsureWeb();                                    // a new engine, the notes read again
            }
            else
            {
                bootTask = Task.Run(new Func<string>(BuildBootScript));   // the notes as they are on disk now
                try { wv.Reload(); }
                catch (Exception ex) { Program.Log(ex); RecoverWeb(true); }
            }
        }

        // after a graphics restart, sleep or a display change the page can keep a blank surface: hide and show it again
        void RedrawWeb()
        {
            if (ctl == null) return;
            try
            {
                ctl.IsVisible = false;
                UpdateWebVisibility();
                Form f = webIn ?? this;
                if (f.WindowState != FormWindowState.Minimized) ctl.Bounds = new Rectangle(Point.Empty, f.ClientSize);
                ctl.NotifyParentWindowPositionChanged();
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        // Active -> standby: close the web engine (frees almost all memory) but keep hotkeys registered.
        void EnterStandby()
        {
            SaveBounds();
            if (Visible) Hide();
            DetachPop();
            DetachQuick(false);
            saver.Flush(3000);
            webReady = false;
            webStarted = false;
            try { if (ctl != null) ctl.Close(); } catch { }
            ctl = null; wv = null; env = null; envTask = null; bootTask = null;
            HideCover();
            activeNote = ""; hasReturn = false; pendingOpen = null; pendingNew = false; pendingPalette = null; paletteOpen = false;
            GC.Collect(); GC.WaitForPendingFinalizers(); GC.Collect();
            UpdateTrayText();
            Invalidate();
        }

        void ApplyStartMaximized()
        {
            if (!startMaximized) return;
            startMaximized = false;
            Native.ShowWindow(Handle, 3 /*SW_MAXIMIZE*/);
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_NCCALCSIZE)
            {
                // whole window = client area; when maximized, pull in by the invisible frame
                if (m.WParam != IntPtr.Zero && Native.IsZoomed(Handle))
                {
                    var p = (Native.NCCALCSIZE_PARAMS)Marshal.PtrToStructure(m.LParam, typeof(Native.NCCALCSIZE_PARAMS));
                    uint dpi = Native.GetDpiForWindow(Handle);
                    int pad = Native.GetSystemMetricsForDpi(92 /*SM_CXPADDEDBORDER*/, dpi);
                    int fx = Native.GetSystemMetricsForDpi(32 /*SM_CXFRAME*/, dpi) + pad;
                    int fy = Native.GetSystemMetricsForDpi(33 /*SM_CYFRAME*/, dpi) + pad;
                    p.r0.Left += fx; p.r0.Top += fy; p.r0.Right -= fx; p.r0.Bottom -= fy;
                    Marshal.StructureToPtr(p, m.LParam, false);
                }
                m.Result = IntPtr.Zero;
                return;
            }
            if (m.Msg == WM_HOTKEY) { OnHotkey(m.WParam.ToInt32()); return; }
            if (m.Msg == WM_SSN_SHOW) { ShowApp(); return; }
            if (m.Msg == WM_SSN_QUIT) { Quit(true); return; }   // build/install asks us to save and exit before replacing the exe
            if (m.Msg == WM_DPICHANGED)
            {
                var r = (Native.RECT)Marshal.PtrToStructure(m.LParam, typeof(Native.RECT));
                Native.SetWindowPos(Handle, IntPtr.Zero, r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top, 0x0014 /*NOZORDER|NOACTIVATE*/);
                m.Result = IntPtr.Zero;
                return;
            }
            if (m.Msg == WM_MOVE && ctl != null) { try { ctl.NotifyParentWindowPositionChanged(); } catch { } }
            if (m.Msg == WM_WINDOWPOSCHANGED)
            {
                inPosChanged = true;
                try { base.WndProc(ref m); } finally { inPosChanged = false; }
                return;
            }
            base.WndProc(ref m);
        }

        // After a restore from max/min, WinForms re-applies the old *client* size plus a caption/border
        // we removed in WM_NCCALCSIZE, so the window grew on every restore. The OS already restored the
        // right rectangle; ignore that one call.
        protected override void SetBoundsCore(int x, int y, int width, int height, BoundsSpecified specified)
        {
            if (inPosChanged) return;
            base.SetBoundsCore(x, y, width, height, specified);
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            Rectangle rc = ClientRectangle;
            if (rc.Width < 2 || rc.Height < 2) return;
            if (still != null && (webIn != this || holdWeb))
            {
                e.Graphics.FillRectangle(Brushes.Black, rc);
                e.Graphics.DrawImage(still, new Rectangle(0, 0, still.Width, still.Height));
                return;
            }
            // Splash shown for the few hundred ms before the page paints.
            using (var br = new LinearGradientBrush(rc, bg, Color.FromArgb(0x16, 0x30, 0x6A), 90f))
                e.Graphics.FillRectangle(br, rc);
            if (webReady) return;
            float scale = DeviceDpi / 96f;
            using (var f = new Font("Segoe UI Black", 15f * scale, FontStyle.Italic, GraphicsUnit.Pixel))
            using (var b = new SolidBrush(Color.FromArgb(200, 255, 255, 255)))
            {
                // centred on the letters themselves (an italic leans, and a text box carries padding)
                try
                {
                    using (var path = new GraphicsPath())
                    {
                        path.AddString("SUPER SPEED NOTE", f.FontFamily, (int)f.Style, f.Size, Point.Empty, StringFormat.GenericTypographic);
                        RectangleF gb = path.GetBounds();
                        using (var mx = new Matrix())
                        {
                            mx.Translate(rc.Left + (rc.Width - gb.Width) / 2f - gb.Left, rc.Top + (rc.Height - gb.Height) / 2f - gb.Top);
                            path.Transform(mx);
                        }
                        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                        e.Graphics.FillPath(b, path);
                    }
                }
                catch                                           // a font without that style: plain centred text
                {
                    e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;
                    var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                    e.Graphics.DrawString("SUPER SPEED NOTE", f, b, rc, sf);
                }
            }
        }

        // The app window brought back (from the taskbar) while a quick memo holds the page: the memo carries on in the
        // app window, as the tray / app hotkey already do - else the window shows only its navy background
        void QuickToMain()
        {
            if (quickOpen && quick != null && webIn == quick && Visible && WindowState != FormWindowState.Minimized)
                BeginInvoke(new Action(() => { if (quickOpen && webIn == quick && Visible && WindowState != FormWindowState.Minimized) EndQuick("main", false); }));
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            if (Covered && (WindowState == FormWindowState.Minimized || still == null || still.Size != ClientSize)) HideCover();   // the picture no longer fits
            QuickToMain();
            if (ctl != null && webIn == this && WindowState != FormWindowState.Minimized)
                ctl.Bounds = new Rectangle(Point.Empty, ClientSize);
            UpdateWebVisibility();
            bool max = WindowState == FormWindowState.Maximized;
            if (max != maxState) { maxState = max; Post("winState", max ? "1" : "0"); }
        }

        protected override void OnMove(EventArgs e)
        {
            base.OnMove(e);
            if (Covered) { Rectangle r = RectangleToScreen(ClientRectangle); Native.SetWindowPos(cover.Handle, IntPtr.Zero, r.X, r.Y, r.Width, r.Height, 0x4 /*NOZORDER*/ | 0x10 /*NOACTIVATE*/ | 0x200); }
        }

        protected override void OnVisibleChanged(EventArgs e)
        {
            base.OnVisibleChanged(e);
            if (!Visible) HideCover();                  // an owned window stays on screen when its owner is hidden
            UpdateWebVisibility();
            if (Visible) BeginInvoke(new Action(SettleWeb));
        }

        protected override void OnActivated(EventArgs e)
        {
            base.OnActivated(e);
            QuickToMain();
            SettleWeb();
            if (ctl != null && webIn == this) { try { ctl.MoveFocus(CoreWebView2MoveFocusReason.Programmatic); } catch { } }
            if (!Covered) CheckDrawn(0);
        }

        // A click that reaches the app window itself means its page isn't over it (the bare navy background, where
        // even the title bar and its buttons are missing, as they are part of the page): put it right
        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (ctl == null || !webReady || webIn != this) return;
            Program.Log(new Exception("click on the bare app window: page shown again"));
            holdWeb = false;
            SettleWeb();
            RedrawWeb();
            CheckDrawn(1);
        }

        // Is the page drawing in the app window? It is asked to draw a frame and say so; no answer while the window is
        // in front: it is shown again, and if that doesn't help either, reloaded (the notes are saved and read again).
        int drawWait;                                   // the check still waiting for its answer (0: none)
        void CheckDrawn(int stage)
        {
            if (ctl == null || !webReady || webIn != this || (stage == 0 && drawWait != 0)) return;
            int id = drawWait = Environment.TickCount | 1;
            Post("paint", PaintArg());
            var t = new System.Windows.Forms.Timer { Interval = 2000 };
            t.Tick += (s, e) =>
            {
                t.Stop(); t.Dispose();
                if (drawWait != id) return;             // answered (or a newer check runs)
                drawWait = 0;
                if (ctl == null || !webReady || webIn != this || !IsFront()) return;   // asked again once you look at it
                if (stage == 0) { Program.Log(new Exception("page not drawing: shown again")); holdWeb = false; SettleWeb(); RedrawWeb(); CheckDrawn(1); }
                else { Program.Log(new Exception("page still not drawing: reloaded")); RecoverWeb(false); }
            };
            t.Start();
        }
        string PaintArg()                               // the app window's size in pixels and the page's scale there
        {
            double scale = 1;
            try { scale = Native.GetDpiForWindow(Handle) / 96.0 * ctl.ZoomFactor; } catch { }
            return ClientSize.Width + " " + ClientSize.Height + " " + scale.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture);
        }
        // shown on screen and not minimized, as Windows sees it (the form's own flag can lag behind a native show)
        bool ShownNow() { return (Visible || Native.IsWindowVisible(Handle)) && !Native.IsIconic(Handle); }

        // The app window in front: the page must be in it, shown, at its size. Any left-over state (the page still in
        // a search / quick memo window that is gone, held hidden on its way between windows, a drawing surface lost
        // after sleep or a display change) is put right here, and the page drops any left-over pop-up / memo-window
        // look - so the window can never stay a bare navy box that takes no clicks.
        void SettleWeb()
        {
            if (ctl == null || !ShownNow()) return;
            bool popUp = pop != null && pop.Visible, quickUp = quick != null && quick.Visible;
            if (holdWeb && !popUp) holdWeb = false;
            if ((webIn == pop && !popUp) || (webIn == quick && !quickUp && !quickOpen)) { popWanted = false; PutWeb(this); }
            if (webIn != this) return;
            if (Covered && !popUp) UncoverWhenDrawn();
            try
            {
                if (ctl.ParentWindow != Handle) PutWeb(this);
                if (ctl.Bounds != new Rectangle(Point.Empty, ClientSize)) ctl.Bounds = new Rectangle(Point.Empty, ClientSize);
                ctl.NotifyParentWindowPositionChanged();
            }
            catch { }
            UpdateWebVisibility(true);
            if (webReady) Post("settle", quickOpen ? "quick" : "");
        }

        // The page stopped answering (an endless loop, a hung renderer): its process is ended, which brings the
        // usual recovery (the notes read again, the page reloaded). Asked every few seconds while a window shows it.
        System.Windows.Forms.Timer pulse;
        int pingAt, lastPulse;                          // when the unanswered ping went out (0: none out); the last tick
        void StartPulse()
        {
            if (pulse != null) return;
            pulse = new System.Windows.Forms.Timer { Interval = 4000 };
            pulse.Tick += (s, e) =>
            {
                int nowT = Environment.TickCount, gap = unchecked(nowT - lastPulse);
                lastPulse = nowT;
                bool shown = (Visible && WindowState != FormWindowState.Minimized) || (pop != null && pop.Visible) || (quick != null && quick.Visible);
                // the page at home but hidden in an app window that is on screen (a left-over hold / a missed show): shown
                try
                {
                    if (ctl != null && webIn == this && !Covered && ShownNow() && (holdWeb || !ctl.IsVisible) && !(pop != null && pop.Visible))
                    { Program.Log(new Exception("page hidden in a shown app window: shown")); holdWeb = false; UpdateWebVisibility(true); }
                }
                catch { }
                // not shown, or the PC was asleep since the last tick (no time to answer): start over
                if (!webReady || wv == null || !shown || gap > 12000) { pingAt = 0; return; }
                if (pingAt == 0) { pingAt = Environment.TickCount | 1; Post("ping", ""); return; }
                if (unchecked(Environment.TickCount - pingAt) < 15000) return;
                pingAt = 0;
                Program.Log(new Exception("page not answering for 15 s: restarting it"));
                try
                {
                    foreach (var pi in env.GetProcessInfos())
                        if (pi.Kind == CoreWebView2ProcessKind.Renderer) { try { Process.GetProcessById(pi.ProcessId).Kill(); } catch { } }
                }
                catch (Exception ex) { Program.Log(ex); RecoverWeb(false); }
            };
            pulse.Start();
        }

        protected override void OnDeactivate(EventArgs e)
        {
            base.OnDeactivate(e);
            lastDeactivate = Environment.TickCount;
        }

        void UpdateWebVisibility(bool shown = false)    // shown: the app window is known to be on screen
        {
            if (ctl == null || wv == null) return;
            bool vis = !holdWeb && (webIn != this || shown || (Visible && WindowState != FormWindowState.Minimized));
            try
            {
                if (ctl.IsVisible != vis) ctl.IsVisible = vis;
                wv.MemoryUsageTargetLevel = vis ? CoreWebView2MemoryUsageTargetLevel.Normal : CoreWebView2MemoryUsageTargetLevel.Low;
            }
            catch { }
        }

        void LoadBounds()
        {
            Rectangle r = Rectangle.Empty;
            try
            {
                string[] f = File.ReadAllText(Path.Combine(Program.LocalDir, "window.txt")).Split(',');
                r = new Rectangle(int.Parse(f[0]), int.Parse(f[1]), int.Parse(f[2]), int.Parse(f[3]));
                startMaximized = f.Length > 4 && f[4] == "1";
            }
            catch { }
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            if (r.Width < 300 || r.Height < 200 || !Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(r)))
            {
                float scale;
                using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) scale = g.DpiX / 96f;
                int w = Math.Min((int)(1180 * scale), wa.Width - 40), h = Math.Min((int)(760 * scale), wa.Height - 40);
                r = new Rectangle(wa.Left + (wa.Width - w) / 2, wa.Top + (wa.Height - h) / 2, w, h);
            }
            Bounds = r;
        }

        void SaveBounds()
        {
            try
            {
                if (!IsHandleCreated) return;
                Rectangle r = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
                if (r.Width < 200 || r.Height < 150) return;
                File.WriteAllText(Path.Combine(Program.LocalDir, "window.txt"),
                    r.X + "," + r.Y + "," + r.Width + "," + r.Height + "," + (WindowState == FormWindowState.Maximized ? "1" : "0"));
            }
            catch { }
        }

        void BeginDrag(int hit)
        {
            IntPtr h = quickShown ? quick.Handle : Handle;   // the quick memo moves / resizes itself
            if (h == Handle && hit != HTCAPTION && WindowState == FormWindowState.Maximized) return;
            Native.POINT p;
            Native.GetCursorPos(out p);
            Native.ReleaseCapture();
            Native.PostMessage(h, WM_NCLBUTTONDOWN, (IntPtr)hit, (IntPtr)((p.Y << 16) | (p.X & 0xFFFF)));
        }

        static int EdgeHit(string edge)
        {
            switch (edge)
            {
                case "l": return 10; case "r": return 11; case "t": return 12; case "tl": return 13;
                case "tr": return 14; case "b": return 15; case "bl": return 16; case "br": return 17;
            }
            return HTCAPTION;
        }

        // ---------- double-click a window edge: stretch it to the screen that way, again: back ----------
        // One record per window (main / quick memo). "Back" only applies while the window is exactly where the
        // stretch left it, on the same screen: once it was moved, snapped or resized, a double-click stretches again.
        sealed class StretchState
        {
            public readonly int[] From = new int[4];      // left, top, right, bottom before that edge was stretched
            public readonly bool[] On = new bool[4];
            public Rectangle Result;
            public string Screen;
        }
        readonly StretchState stretchMain = new StretchState(), stretchQuick = new StretchState();
        string lastEdge;
        int lastEdgeTick;
        Point lastEdgePt;

        // The page sees the double-click only if the first click's resize loop left it the button-up; catch it here too.
        void EdgeDown(string edge)
        {
            Point p = Cursor.Position;
            Size dz = SystemInformation.DoubleClickSize;
            bool dbl = edge == lastEdge && (uint)unchecked(Environment.TickCount - lastEdgeTick) <= (uint)SystemInformation.DoubleClickTime
                && Math.Abs(p.X - lastEdgePt.X) <= dz.Width && Math.Abs(p.Y - lastEdgePt.Y) <= dz.Height;
            lastEdge = edge; lastEdgeTick = Environment.TickCount; lastEdgePt = p;
            if (dbl) Stretch(edge); else BeginDrag(EdgeHit(edge));
        }

        void Stretch(string edge)
        {
            lastEdge = null;
            Form f = quickShown ? (Form)quick : this;     // the quick memo stretches itself
            if (string.IsNullOrEmpty(edge) || Native.IsZoomed(f.Handle) || f.WindowState == FormWindowState.Minimized) return;
            StretchState st = f == this ? stretchMain : stretchQuick;
            Screen scr = Screen.FromHandle(f.Handle);
            Rectangle b = f.Bounds, wa = scr.WorkingArea;
            if (b != st.Result || scr.DeviceName != st.Screen) Array.Clear(st.On, 0, 4);   // moved / resized since: nothing to put back
            int[] cur = { b.Left, b.Top, b.Right, b.Bottom }, lim = { wa.Left, wa.Top, wa.Right, wa.Bottom };
            bool[] on = { edge.IndexOf('l') >= 0, edge.IndexOf('t') >= 0, edge.IndexOf('r') >= 0, edge.IndexOf('b') >= 0 };
            bool atLimit = true, any = false;
            for (int i = 0; i < 4; i++) if (on[i]) { if (cur[i] != lim[i]) atLimit = false; if (st.On[i]) any = true; }
            bool back = atLimit && any;                   // every clicked edge already stretched: put them back
            int[] next = (int[])cur.Clone();
            for (int i = 0; i < 4; i++)
            {
                if (!on[i]) continue;
                if (back) { if (st.On[i]) next[i] = st.From[i]; }
                else next[i] = lim[i];
            }
            Size min = f.MinimumSize;
            if (next[2] - next[0] < min.Width || next[3] - next[1] < min.Height) { Array.Clear(st.On, 0, 4); return; }
            for (int i = 0; i < 4; i++)
            {
                if (!on[i]) continue;
                if (back) st.On[i] = false;
                else if (cur[i] != lim[i]) { st.From[i] = cur[i]; st.On[i] = true; }
            }
            f.Bounds = Rectangle.FromLTRB(next[0], next[1], next[2], next[3]);
            st.Result = f.Bounds; st.Screen = scr.DeviceName;
        }

        // ---------- show / hide / focus ----------
        void ShowApp()
        {
            ClosePop();
            if (quickOpen) EndQuick("main", false);       // the memo carries on in the app window
            if (ctl != null) { try { ctl.IsVisible = true; } catch { } }
            if (!Visible) { Show(); if (!webStarted) Update(); }   // from standby: paint the splash right away
            ApplyStartMaximized();
            EnsureWeb();
            if (WindowState == FormWindowState.Minimized) Native.ShowWindow(Handle, 9 /*SW_RESTORE*/);
            ForceForeground(Handle);
            if (ctl != null) { try { ctl.MoveFocus(CoreWebView2MoveFocusReason.Programmatic); } catch { } }
            Post("focus");
        }

        void HideApp()
        {
            SaveBounds();
            Post("hidden");
            Hide();
        }

        void DismissApp()
        {
            if (closeToTray) HideApp();
            else Native.ShowWindow(Handle, 6 /*SW_MINIMIZE: activates the previous window*/);
        }

        void ToggleFromTray()
        {
            bool shown = Visible && WindowState != FormWindowState.Minimized;
            if (shown && (IsFront() || unchecked(Environment.TickCount - lastDeactivate) < 400)) HideApp();
            else ShowApp();
        }

        bool IsFront()
        {
            if (!Visible || WindowState == FormWindowState.Minimized) return false;
            IntPtr fg = Native.GetForegroundWindow();
            return fg == Handle || Native.GetAncestor(fg, 3 /*GA_ROOTOWNER*/) == Handle;
        }

        static void ForceForeground(IntPtr h)
        {
            IntPtr fg = Native.GetForegroundWindow();
            if (fg == h) return;
            uint pid;
            uint fgThread = fg == IntPtr.Zero ? 0 : Native.GetWindowThreadProcessId(fg, out pid);
            uint me = Native.GetCurrentThreadId();
            bool attached = fgThread != 0 && fgThread != me && Native.AttachThreadInput(me, fgThread, true);
            Native.BringWindowToTop(h);
            Native.SetForegroundWindow(h);
            if (attached) Native.AttachThreadInput(me, fgThread, false);
        }

        // ---------- global hotkeys ----------
        void ApplyHotkeys()
        {
            foreach (int id in hotkeys.Keys) Native.UnregisterHotKey(Handle, id);
            hotkeys.Clear();
            if (hotkeysSuspended) return;
            var failed = new List<string>();
            int next = 1;
            foreach (string part in hotkeySpec.Split(';'))
            {
                string[] f = part.Split(',');
                uint mods, vk;
                if (f.Length != 3 || !uint.TryParse(f[1], out mods) || !uint.TryParse(f[2], out vk)) continue;
                int id = next++;
                if (Native.RegisterHotKey(Handle, id, mods | 0x4000 /*MOD_NOREPEAT*/, vk)) hotkeys[id] = f[0];
                else failed.Add(f[0]);
            }
            Post("hotkeyStatus", string.Join(",", failed));
        }

        void OnHotkey(int id)
        {
            string key;
            if (!hotkeys.TryGetValue(id, out key)) return;
            bool front = IsFront();
            if (key == AppKey)
            {
                if (front) GoBack(); else Summon(null);
                return;
            }
            if (key == FindKey)                    // find a line in any note, Enter pastes it back where you were
            {
                if (popWanted || popShown) { GoBack(); ReleasePop(); return; }   // pressed again
                if (quickShown && Native.GetForegroundWindow() == quick.Handle)
                {                                  // writing a quick memo: search opens in it, Enter puts the line in the memo
                    Post("palette", paletteOpen ? "close" : "quick");
                    return;
                }
                if (front)                         // inside the app: the search box opens over the app
                {
                    if (paletteOpen) Post("palette", "close");
                    else if (webReady) Post("palette", "in");
                    else pendingPalette = "in";
                    return;
                }
                OpenPop();
                return;
            }
            if (key == QuickKey)                   // a new note in a small window in the screen corner
            {
                if (quickOpen)
                {
                    IntPtr fg = Native.GetForegroundWindow();
                    if (quickShown && fg != quick.Handle)          // clicked away (it's not in Alt+Tab): back to the memo
                    {
                        if (IsExternalWindow(fg)) quickRet = fg;   // and later back to the window you were in now
                        ForceForeground(quick.Handle);
                        Post("quick", "focus");
                    }
                    else EndQuick("close", true);                  // pressed in the memo: put it away
                    return;
                }
                if (front) { if (webReady) Post("new"); return; }      // already in the app: just a new note there
                OpenQuick();
                return;
            }
            if (front && activeNote == key) GoBack();
            else Summon(key);
        }

        // Bring the app (and optionally a note) to the front, remembering the *other program* we came from.
        // Switching notes inside the app never changes that target: the second press always goes back to
        // the program you were in before entering the app (focus - and so its caret - is restored there).
        void Summon(string noteId)
        {
            RememberReturn();
            ClosePop();
            ShowApp();
            if (noteId != null)
            {
                if (webReady) Post("open", noteId);
                else pendingOpen = noteId;
            }
        }

        // ---------- find & paste window ----------
        // Opens right over the program you are in. Instead of a second page it borrows the app's WebView
        // (moved into this window while it is open), so it is instant and every note is already indexed.
        void OpenPop()
        {
            RememberReturn();
            KeepStill();
            ShowCover();                               // the app window shows its picture until the page is back
            if (pop == null)
            {
                pop = new PopForm();
                pop.BackColor = popBg;
                // clicked somewhere else: just close (no paste, no window switching)
                pop.Deactivate += (s, e) => CheckPopFocus(0);
                pop.Activated += (s, e) => { if (popShown && ctl != null) { try { ctl.MoveFocus(CoreWebView2MoveFocusReason.Programmatic); } catch { } } };
                pop.FormClosing += (s, e) =>   // Alt+F4 = Esc
                {
                    if (finished || e.CloseReason != CloseReason.UserClosing) return;
                    e.Cancel = true;
                    GoBack(); ReleasePop();
                };
            }
            PlacePop();
            popWanted = true;
            pop.Attached = false;
            pop.Invalidate();
            if (!pop.Visible) pop.Show();
            ForceForeground(pop.Handle);
            if (webReady)
            {
                // The page goes into the search window at once, unseen: the app window keeps its picture of the page
                // instead of showing it turn into the search box and then vanish (it used to twitch twice)
                if (webIn == this && ctl != null)
                {
                    holdWeb = true; PutWeb(pop); Invalidate();
                    var t = new System.Windows.Forms.Timer { Interval = 1500 };   // the page never answered: show it anyway
                    t.Tick += (s, e) => { t.Stop(); t.Dispose(); if (holdWeb && popWanted && webIn == pop) AttachPop(); };
                    t.Start();
                }
                Post("palette", "pop");
            }
            else { pendingPalette = "pop"; EnsureWeb(); }   // from standby: the engine starts now (~1 s)
        }

        // Taking the foreground and moving the WebView in make Windows send passing "deactivated" messages
        // (for a moment no window is in front at all), so look again once that has settled.
        void CheckPopFocus(int tries)
        {
            var t = new System.Windows.Forms.Timer { Interval = 120 };
            t.Tick += (s, e) =>
            {
                t.Stop(); t.Dispose();
                if (!popWanted && !popShown) return;
                IntPtr fg = Native.GetForegroundWindow();
                if (fg == pop.Handle || Native.GetAncestor(fg, 3 /*GA_ROOTOWNER*/) == pop.Handle) return;
                if (fg == IntPtr.Zero) { if (tries < 5) CheckPopFocus(tries + 1); return; }
                if (popShown) ReleasePop(); else { pendingPalette = null; DetachPop(); }
            };
            t.Start();
        }

        // centred on the screen of the program you came from, a bit above the middle
        void PlacePop()
        {
            IntPtr anchor = hasReturn ? retHwnd : IntPtr.Zero, mon;
            Native.POINT cur;
            Native.GetCursorPos(out cur);
            mon = anchor != IntPtr.Zero ? Native.MonitorFromWindow(anchor, 2 /*NEAREST*/) : Native.MonitorFromPoint(cur, 2);
            uint dx = 96, dy = 96;
            try { Native.GetDpiForMonitor(mon, 0, out dx, out dy); } catch { }
            float s = dx / 96f;
            Rectangle wa = (anchor != IntPtr.Zero ? Screen.FromHandle(anchor) : Screen.FromPoint(new Point(cur.X, cur.Y))).WorkingArea;
            int w = Math.Min((int)(900 * s), wa.Width - (int)(32 * s)), h = Math.Min((int)(540 * s), wa.Height - (int)(32 * s));
            pop.Bounds = new Rectangle(wa.Left + (wa.Width - w) / 2, wa.Top + Math.Max((int)(16 * s), (wa.Height - h) * 2 / 7), w, h);
        }

        // the page has drawn the search box: move the WebView in and give it the keyboard
        void AttachPop()
        {
            if (ctl == null || pop == null) return;
            if (quick != null && quick.Visible) quick.Hide();   // a quick memo waits until the search is done
            pop.Attached = true;
            holdWeb = false;
            PutWeb(pop);
            if (!pop.Visible) pop.Show();
            ForceForeground(pop.Handle);
            try { ctl.MoveFocus(CoreWebView2MoveFocusReason.Programmatic); } catch { }
            Post("palette", "focus");
        }

        // Closed from here (the hotkey again, Alt+F4, the app opened): the search window goes at once, but the page
        // comes back to the app window only once it has closed its search box (it reports "palette 0"), so the app
        // window never shows the search box over its notes; after a moment it comes back anyway
        void ReleasePop()
        {
            popWanted = false;
            if (pop != null) { pop.Attached = false; if (pop.Visible) pop.Hide(); }
            if (!popShown) { DetachPop(); return; }
            Post("palette", "close");
            var t = new System.Windows.Forms.Timer { Interval = 500 };
            t.Tick += (s, e) => { t.Stop(); t.Dispose(); if (popShown && !popWanted) DetachPop(); };
            t.Start();
        }

        // back into the quick memo if one is open, else the main window (still hidden / where it was)
        void DetachPop()
        {
            popWanted = false;
            holdWeb = false;
            if (!popShown && webIn == this) HideCover();     // the page never left: nothing to wait for
            // hide it first: moving the page out first would leave a bare window on screen for a moment
            if (pop != null) { pop.Attached = false; if (pop.Visible) pop.Hide(); }
            if (popShown)
            {
                if (quickOpen && quick != null)
                {
                    PutWeb(quick);
                    Native.ShowWindow(quick.Handle, 8 /*SW_SHOWNA: back on top without taking the keyboard*/);
                }
                else { PutWeb(this); UncoverWhenDrawn(); }
                if (webIn == this && ctl != null && IsFront()) { try { ctl.MoveFocus(CoreWebView2MoveFocusReason.Programmatic); } catch { } }
            }
        }

        // a picture of the app window with its page, taken before the page leaves it (see still)
        void KeepStill()
        {
            if (Covered && webIn == this && still != null && still.Size == ClientSize) return;   // opened again while the page comes back: the picture from before still holds
            if (quickOpen && webIn != this) return;     // the page is in the quick memo: keep the app window's picture for its return
            DropStill();
            if (!Visible || WindowState == FormWindowState.Minimized || webIn != this || ctl == null) return;
            Size cs = ClientSize;
            if (cs.Width < 2 || cs.Height < 2) return;
            Bitmap b = null;
            try
            {
                b = new Bitmap(cs.Width, cs.Height, System.Drawing.Imaging.PixelFormat.Format32bppRgb);   // opaque: GDI leaves no alpha
                bool ok;
                using (Graphics g = Graphics.FromImage(b))
                {
                    IntPtr hdc = g.GetHdc();
                    try { ok = Native.PrintWindow(Handle, hdc, 3 /*PW_CLIENTONLY | PW_RENDERFULLCONTENT: the page too*/); }
                    finally { g.ReleaseHdc(hdc); }
                }
                if (ok && !AllBlack(b)) { still = b; b = null; }   // a page the capture missed (black): no picture beats a wrong one
            }
            catch (Exception ex) { Program.Log(ex); }
            finally { if (b != null) b.Dispose(); }
        }
        void DropStill() { if (still != null) { still.Dispose(); still = null; } }
        static bool AllBlack(Bitmap b)
        {
            for (int i = 1; i < 8; i++)
                for (int j = 1; j < 8; j++)
                    if ((b.GetPixel(b.Width * i / 8, b.Height * j / 8).ToArgb() & 0xFFFFFF) != 0) return false;
            return true;
        }

        // A picture of the app window laid over it while the page is away in the search window and while it comes
        // back: back at the app window's size (and, from another monitor, its scale) the page takes a few frames to
        // lay itself out again - under the picture. A window of its own, right above the app window: the page draws
        // straight to the screen with the GPU, over any control inside the app window, so a control can't hide it.
        // It goes once the page says it has drawn itself at the app window's size.
        StillForm cover;
        int coverGen;                                   // which showing a late "drawn" / time-out belongs to
        bool Covered { get { return cover != null && cover.Pic != null; } }   // (Windows hides it by itself while the app window is minimized)
        void ShowCover()
        {
            if (still == null || !Visible || WindowState == FormWindowState.Minimized || still.Size != ClientSize) return;
            try
            {
                if (cover == null) cover = new StillForm(Handle);   // owned: always just above the app window
                coverGen++;
                cover.Pic = still;
                Rectangle r = RectangleToScreen(ClientRectangle);
                // right above the app window, not above the program you are in (the app window may be behind it)
                IntPtr prev = Native.GetWindow(Handle, 3 /*GW_HWNDPREV*/);
                if (prev == cover.Handle) prev = Native.GetWindow(prev, 3);
                if (prev != IntPtr.Zero && (Native.GetWindowLong(prev, -20 /*GWL_EXSTYLE*/) & 0x8 /*WS_EX_TOPMOST*/) != 0) prev = IntPtr.Zero;
                Native.SetWindowPos(cover.Handle, prev, r.X, r.Y, r.Width, r.Height, 0x10 /*NOACTIVATE*/ | 0x40 /*SHOWWINDOW*/ | 0x200 /*NOOWNERZORDER: the app window stays where it is*/);
                cover.Invalidate();
                cover.Update();                         // drawn now,
                Native.DwmFlush();                      // and on screen, before the page leaves
            }
            catch (Exception ex) { Program.Log(ex); HideCover(); }
        }
        void HideCover()
        {
            if (!Covered) return;
            coverGen++;
            Native.ShowWindow(cover.Handle, 0 /*SW_HIDE: also kept hidden when a minimized app window comes back*/);
            cover.Pic = null;
            if (webIn == this && !quickOpen) DropStill();
        }
        // the page is back: once it has drawn itself at this window's size the picture goes (at the latest after a moment)
        void UncoverWhenDrawn()
        {
            if (!Covered) return;
            if (webReady) Post("paint", PaintArg());    // its size and scale here (from another monitor the scale changes too)
            int gen = coverGen;
            var t = new System.Windows.Forms.Timer { Interval = 1500 };
            t.Tick += (s, e) => { t.Stop(); t.Dispose(); if (gen == coverGen && webIn == this) { RedrawWeb(); HideCover(); CheckDrawn(1); } };   // never answered: a nudge to draw, then a check
            t.Start();
        }
        // "painted": the frame is made; give the screen a couple of frames to show it, then lift the picture
        void PaintedUnderCover()
        {
            if (!Covered || webIn != this || quickOpen) return;   // (a memo on its way: the page is turning into it under the picture)
            int gen = coverGen;
            var t = new System.Windows.Forms.Timer { Interval = 50 };
            t.Tick += (s, e) => { t.Stop(); t.Dispose(); if (gen == coverGen && webIn == this) HideCover(); };
            t.Start();
        }

        // Move the page into one of our windows (main / search / quick memo).
        void PutWeb(Form f)
        {
            webIn = f;
            if (f == this && !Covered && !holdWeb) DropStill();
            if (ctl == null) return;
            try
            {
                ctl.ParentWindow = f.Handle;
                ctl.DefaultBackgroundColor = f == pop ? popBg : f == quick ? quickBg : bg;
                if (f != this || WindowState != FormWindowState.Minimized) ctl.Bounds = new Rectangle(Point.Empty, f.ClientSize);
                if (f != this) wv.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Normal;
            }
            catch (Exception ex) { Program.Log(ex); }
            UpdateWebVisibility();
        }

        // ---------- quick memo ----------
        // Each press: a new note in a small always-on-top window in the corner of the screen you are on.
        // It stays while you work elsewhere; the hotkey again or its X puts it away (empty ones are dropped).
        void OpenQuick()
        {
            ClosePop();
            if (!quickOpen) { KeepStill(); ShowCover(); }   // the app window keeps its picture while the page turns into the memo (and for when it comes back)
            IntPtr fg = Native.GetForegroundWindow();
            quickRet = IsExternalWindow(fg) ? fg : IsExternalWindow(lastExternal) ? lastExternal : IntPtr.Zero;
            if (quick == null)
            {
                quick = new QuickForm();
                quick.BackColor = quickBg;
                quick.Activated += (s, e) => { if (quickShown && ctl != null) { try { ctl.MoveFocus(CoreWebView2MoveFocusReason.Programmatic); } catch { } } };
                quick.Resize += (s, e) => { if (quickShown && ctl != null) ctl.Bounds = new Rectangle(Point.Empty, quick.ClientSize); };
                quick.Move += (s, e) => { if (quickShown && ctl != null) { try { ctl.NotifyParentWindowPositionChanged(); } catch { } } };
                quick.FormClosing += (s, e) =>   // Alt+F4 = X
                {
                    if (finished || e.CloseReason != CloseReason.UserClosing) return;
                    e.Cancel = true;
                    EndQuick("close", true);
                };
            }
            PlaceQuick(quickRet);
            quickOpen = true;
            quick.Attached = false;
            quick.Invalidate();
            if (!quick.Visible) quick.Show();
            SettleQuick();
            ForceForeground(quick.Handle);
            if (webReady) Post("quick", "open");
            else { pendingQuick = true; EnsureWeb(); }   // from standby: the engine starts now (~1 s)
        }

        // The corner the quick memo opens in (Settings: tl / tr / bl / br), kept here so it works from standby too.
        string QuickCorner()
        {
            try { string c = File.ReadAllText(Path.Combine(Program.LocalDir, "quickcorner.txt")).Trim(); if (c == "tl" || c == "tr" || c == "bl" || c == "br") return c; }
            catch { }
            return "br";
        }

        // the chosen corner of the screen you are working on, at the size you last left it
        void PlaceQuick(IntPtr anchor)
        {
            Native.POINT cur;
            Native.GetCursorPos(out cur);
            if (anchor != IntPtr.Zero && Native.IsIconic(anchor)) anchor = IntPtr.Zero;   // a minimized window sits off-screen
            IntPtr mon = anchor != IntPtr.Zero ? Native.MonitorFromWindow(anchor, 2) : Native.MonitorFromPoint(cur, 2);
            uint dx = 96, dy = 96;
            try { Native.GetDpiForMonitor(mon, 0, out dx, out dy); } catch { }
            float s = dx / 96f;
            Rectangle wa = (anchor != IntPtr.Zero ? Screen.FromHandle(anchor) : Screen.FromPoint(new Point(cur.X, cur.Y))).WorkingArea;
            int lw = 420, lh = 380;
            try
            {
                string[] f = File.ReadAllText(Path.Combine(Program.LocalDir, "quick.txt")).Split(',');
                lw = Math.Max(260, int.Parse(f[0])); lh = Math.Max(180, int.Parse(f[1]));
            }
            catch { }
            int w = Math.Min((int)(lw * s), wa.Width - (int)(32 * s)), h = Math.Min((int)(lh * s), wa.Height - (int)(32 * s)), m = (int)(16 * s);
            string c = QuickCorner();
            int x = c[1] == 'l' ? wa.Left + m : wa.Right - w - m, y = c[0] == 't' ? wa.Top + m : wa.Bottom - h - m;
            quick.Scale96 = s;
            // Moving onto a screen with another scale makes Windows send WM_DPICHANGED with a re-scaled rectangle of
            // its own; while placing, the form keeps this one instead (it is already sized for that screen).
            quick.Want = new Rectangle(x, y, w, h);
            quick.Placing = true;
            quick.Bounds = quick.Want;
        }
        // after Show: put it exactly in the corner again (in case anything moved it), then let the user move it freely
        void SettleQuick()
        {
            if (quick == null) return;
            if (quick.Placing && quick.Bounds != quick.Want) quick.Bounds = quick.Want;
            BeginInvoke(new Action(() => { if (quick != null) { if (quick.Placing && quickOpen && quick.Bounds != quick.Want) quick.Bounds = quick.Want; quick.Placing = false; } }));
        }

        // the page has the new note ready: move the WebView in
        void AttachQuick()
        {
            if (ctl == null || quick == null || !quickOpen) return;
            quick.Attached = true;
            // the app window goes first, at once: emptied of its page it would fade out as a bare navy box
            if (Visible && WindowState != FormWindowState.Minimized) { quickHidMain = true; SaveBounds(); Native.NoFade(Handle, true); Hide(); Native.NoFade(Handle, false); }
            PutWeb(quick);
            if (!quick.Visible) quick.Show();
            ForceForeground(quick.Handle);
            try { ctl.MoveFocus(CoreWebView2MoveFocusReason.Programmatic); } catch { }
            Post("quick", "focus");
        }

        // how: "close" = put away (the page drops it if empty), "main" = carry on writing in the app window
        void EndQuick(string how, bool giveBack)
        {
            if (!quickOpen) return;
            bool front = quick != null && Native.GetForegroundWindow() == quick.Handle;
            Post("quick", how);
            DetachQuick(how == "close");
            if (giveBack && front) GiveBackFromQuick();
        }

        void GiveBackFromQuick()
        {
            if (!IsExternalWindow(quickRet)) return;
            if (Native.IsIconic(quickRet)) Native.ShowWindow(quickRet, 9 /*SW_RESTORE*/);
            ForceForeground(quickRet);    // back to the program (and caret) you were in
        }

        void DetachQuick(bool restoreMain)
        {
            quickOpen = false;
            pendingQuick = false;
            if (quick == null) return;
            if (quick.Visible)
            {
                try
                {
                    float s = quick.Scale96 > 0 ? quick.Scale96 : 1f;
                    File.WriteAllText(Path.Combine(Program.LocalDir, "quick.txt"), (int)(quick.Width / s) + "," + (int)(quick.Height / s));
                }
                catch { }
                quick.Hide();
            }
            quick.Attached = false;
            // The app window was hidden while the memo was open: it comes back showing its picture from before, and the
            // page (hidden until then, so laid out for the memo) is shown under it and drawn before the picture goes -
            // else the window shows its bare navy background until the page has drawn itself again
            bool held = quickHidMain && restoreMain && !Visible && webIn == quick && still != null;
            if (webIn == quick) { holdWeb = held; PutWeb(this); if (!held) UncoverWhenDrawn(); }
            if (quickHidMain)
            {
                quickHidMain = false;
                if (restoreMain && !Visible)
                {
                    if (held) Native.Cloak(Handle, true);       // not on screen until the picture is over it
                    Native.ShowWindow(Handle, 4 /*SW_SHOWNOACTIVATE: back where it was, behind*/);
                    if (held)
                    {
                        ShowCover();
                        holdWeb = false;
                        UpdateWebVisibility();
                        Native.Cloak(Handle, false);
                        if (Covered) UncoverWhenDrawn(); else DropStill();
                    }
                }
            }
            if (held) holdWeb = false;
            if (!Covered && webIn == this) DropStill();
        }

        void ClosePop()
        {
            if (!popWanted && !popShown) return;
            Post("palette", "close");
            DetachPop();
        }

        void RememberReturn()
        {
            retNote = null;
            if (IsFront())
            {
                if (!(hasReturn && IsExternalWindow(retHwnd)))
                {
                    retHwnd = IsExternalWindow(lastExternal) ? lastExternal : IntPtr.Zero;
                    retHidden = false;
                    retMinimized = false;
                }
            }
            else
            {
                IntPtr fg = Native.GetForegroundWindow();
                retHwnd = IsExternalWindow(fg) ? fg : IsExternalWindow(lastExternal) ? lastExternal : IntPtr.Zero;
                retHidden = !Visible;
                retMinimized = Visible && WindowState == FormWindowState.Minimized;
            }
            hasReturn = retHwnd != IntPtr.Zero;
        }

        // Second press: give focus back to the program used right before entering the app.
        void GoBack()
        {
            if (!hasReturn)
            {
                if (IsExternalWindow(lastExternal)) ForceForeground(lastExternal); else DismissApp();
                return;
            }
            hasReturn = false;
            if (IsExternalWindow(retHwnd))
            {
                if (Native.IsIconic(retHwnd)) Native.ShowWindow(retHwnd, 9 /*SW_RESTORE*/);
                ForceForeground(retHwnd);
                if (retHidden) HideApp();
                else if (retMinimized) Native.ShowWindow(Handle, 7 /*SW_SHOWMINNOACTIVE*/);
            }
            else DismissApp();
        }

        // ---------- send out: clipboard -> previous window -> paste ----------
        IntPtr lastExternal;                       // last foreground window of another program
        Native.WinEventProc fgHook;                // kept alive: the hook calls back into it

        void TrackForeground()
        {
            fgHook = (hook, ev, hwnd, idObject, idChild, thread, time) =>
            {
                if (hwnd != IntPtr.Zero && !IsShellWindow(hwnd) && Native.IsWindowVisible(hwnd)) lastExternal = hwnd;
            };
            // out-of-context, skipping our own process: we only hear about other programs coming to the front
            Native.SetWinEventHook(3 /*EVENT_SYSTEM_FOREGROUND*/, 3, IntPtr.Zero, fgHook, 0, 0, 0x0002 /*SKIPOWNPROCESS*/);
        }

        // a visible window of another program (none of ours: main window, search window, dialogs)
        static bool IsExternalWindow(IntPtr h)
        {
            if (h == IntPtr.Zero || !Native.IsWindow(h) || !Native.IsWindowVisible(h) || IsShellWindow(h)) return false;
            uint pid;
            Native.GetWindowThreadProcessId(h, out pid);
            return pid != MyPid;
        }

        static bool IsShellWindow(IntPtr h)
        {
            var sb = new StringBuilder(64);
            Native.GetClassName(h, sb, sb.Capacity);
            string c = sb.ToString();
            return c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd" || c == "NotifyIconOverflowWindow" || c == "Progman" || c == "WorkerW"
                || c == "Windows.UI.Core.CoreWindow" || c == "TopLevelWindowForOverflowXamlIsland";
        }

        static void SetClipboard(string text, string html)
        {
            var d = new DataObject();
            d.SetData(DataFormats.UnicodeText, text);
            if (!string.IsNullOrEmpty(html)) d.SetData(DataFormats.Html, new MemoryStream(Encoding.UTF8.GetBytes(CfHtml(html))));
            Clipboard.SetDataObject(d, true, 10, 40);
        }

        // Windows "HTML Format": a header with byte offsets, then the fragment (UTF-8)
        static string CfHtml(string fragment)
        {
            const string head = "Version:0.9\r\nStartHTML:{0:D10}\r\nEndHTML:{1:D10}\r\nStartFragment:{2:D10}\r\nEndFragment:{3:D10}\r\n";
            const string pre = "<html><head><meta charset=\"utf-8\"></head><body><!--StartFragment-->", post = "<!--EndFragment--></body></html>";
            Encoding u = Encoding.UTF8;
            int start = string.Format(head, 0, 0, 0, 0).Length;
            int fragStart = start + u.GetByteCount(pre), fragEnd = fragStart + u.GetByteCount(fragment);
            return string.Format(head, start, fragEnd + u.GetByteCount(post), fragStart, fragEnd) + pre + fragment + post;
        }

        // Go back to where you came from (the window you summoned us from, else the last other program)
        // and optionally paste there.
        void SendOut(bool paste)
        {
            IntPtr target = IntPtr.Zero;
            bool hide = false;
            if (hasReturn && retNote == null && retHwnd != IntPtr.Zero && Native.IsWindow(retHwnd) && !IsShellWindow(retHwnd)) { target = retHwnd; hide = retHidden; }
            else if (lastExternal != IntPtr.Zero && Native.IsWindow(lastExternal) && Native.IsWindowVisible(lastExternal)) target = lastExternal;
            if (target == IntPtr.Zero) { Post("toast", paste ? "복사했어요 · 돌아갈 창이 없어 붙여넣지는 못했어요" : "복사했어요"); return; }
            hasReturn = false;
            if (Native.IsIconic(target)) Native.ShowWindow(target, 9 /*SW_RESTORE*/);
            ForceForeground(target);
            if (hide) HideApp();
            if (paste) PasteWhenKeysUp(target);
        }

        // The user is still holding Ctrl+Shift(+Enter): wait until they let go, then send Ctrl+V.
        void PasteWhenKeysUp(IntPtr target)
        {
            int tries = 0;
            var t = new System.Windows.Forms.Timer { Interval = 15 };
            t.Tick += (s, e) =>
            {
                bool held = false;
                foreach (int vk in new[] { 0x10, 0x11, 0x12, 0x5B, 0x5C, 0x0D }) if ((Native.GetAsyncKeyState(vk) & 0x8000) != 0) held = true;
                if (held && ++tries < 80) return;
                t.Stop(); t.Dispose();
                IntPtr fg = Native.GetForegroundWindow();
                if (fg != target && Native.GetAncestor(fg, 3) != Native.GetAncestor(target, 3)) return;   // user went elsewhere: don't paste there
                Native.keybd_event(0x11, 0, 0, UIntPtr.Zero);
                Native.keybd_event(0x56, 0, 0, UIntPtr.Zero);
                Native.keybd_event(0x56, 0, 2, UIntPtr.Zero);
                Native.keybd_event(0x11, 0, 2, UIntPtr.Zero);
            };
            t.Start();
        }

        // ---------- tray ----------
        void SetupTray()
        {
            trayIcon = LoadIcon(SystemInformation.SmallIconSize.Width);
            tray = new NotifyIcon { Icon = trayIcon, Visible = true };
            tray.MouseClick += (s, e) => { if (e.Button == MouseButtons.Left) ToggleFromTray(); };
            tray.ContextMenuStrip = new ContextMenuStrip();
            tray.ContextMenuStrip.Opening += (s, e) => { BuildTrayMenu(); e.Cancel = false; };
            UpdateTrayText();

            backupTimer = new System.Windows.Forms.Timer { Interval = 60 * 60 * 1000 };
            backupTimer.Tick += (s, e) => Task.Run(() => DataBackup.Run(null));
            backupTimer.Start();
            Task.Run(() => { Thread.Sleep(8000); DataBackup.Run(null); SweepTrash(); OuterBackup.Sync(); });
        }

        void BuildTrayMenu()
        {
            ToolStripItemCollection items = tray.ContextMenuStrip.Items;
            items.Clear();
            items.Add("열기", null, (s, e) => ShowApp());
            items.Add("새 메모", null, (s, e) => { ShowApp(); if (webReady) Post("new"); else pendingNew = true; });
            items.Add(new ToolStripSeparator());
            if (webStarted && startupMode != "off") items.Add("끄기 (단축키는 계속 대기)", null, (s, e) => Quit(false));
            items.Add("완전 종료", null, (s, e) => Quit(true));
        }

        void UpdateTrayText()
        {
            if (tray != null) tray.Text = webStarted ? "Super Speed Note" : "Super Speed Note · 대기 중 (단축키로 열기)";
        }

        void ShowTrayHintOnce()
        {
            if (trayHintShown || tray == null) return;
            trayHintShown = true;
            tray.ShowBalloonTip(2500, "Super Speed Note", "트레이에서 계속 실행 중이에요. 단축키로 바로 불러오세요.", ToolTipIcon.None);
        }

        // ---------- WebView2 ----------
        static Task<CoreWebView2Environment> envTask;
        static Task<string> bootTask;
        static Exception prewarmError;

        // Called before the window even exists: the browser processes launch and the note files are
        // read in parallel with window creation.
        public static void Prewarm()
        {
            try
            {
                bootTask = Task.Run(new Func<string>(BuildBootScript));
                try { CoreWebView2Environment.SetLoaderDllFolderPath(Program.EnsureLoader()); }
                catch (InvalidOperationException) { }
                var opts = new CoreWebView2EnvironmentOptions(
                    "--disable-features=msSmartScreenProtection --disable-background-networking --disable-component-update --no-first-run");
                envTask = CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.LocalDir, "WebView2"), opts);
            }
            catch (Exception ex) { prewarmError = ex; }
        }

        async void InitWebView()
        {
            if (env != null) return;
            try
            {
                if (prewarmError != null) throw prewarmError;
                indexHtml = Program.ReadResource("SSN.index.html");
                env = await envTask;
                Program.Mark("env");
                ctl = await env.CreateCoreWebView2ControllerAsync(Handle);
                Program.Mark("controller");
                ctl.DefaultBackgroundColor = bg;
                ctl.Bounds = new Rectangle(Point.Empty, ClientSize);
                wv = ctl.CoreWebView2;

                CoreWebView2Settings s = wv.Settings;
                s.AreDefaultContextMenusEnabled = false;
                s.AreDevToolsEnabled = dev;
                s.AreBrowserAcceleratorKeysEnabled = dev;
                s.IsStatusBarEnabled = false;
                s.IsZoomControlEnabled = false;
                s.IsPinchZoomEnabled = false;
                s.IsSwipeNavigationEnabled = false;
                s.IsBuiltInErrorPageEnabled = false;
                s.IsGeneralAutofillEnabled = false;
                s.IsPasswordAutosaveEnabled = false;

                wv.AddWebResourceRequestedFilter(Origin + "*", CoreWebView2WebResourceContext.All);
                wv.WebResourceRequested += OnResource;
                wv.WebMessageReceived += OnMessage;
                wv.NewWindowRequested += (o, e) => { e.Handled = true; OpenUrl(e.Uri); };
                wv.DownloadStarting += (o, e) => { e.Cancel = true; e.Handled = true; };   // the app never downloads (no empty download list)
                wv.NavigationStarting += (o, e) => { if (!e.Uri.StartsWith(Origin, StringComparison.OrdinalIgnoreCase)) e.Cancel = true; };
                wv.PermissionRequested += (o, e) =>
                {
                    if (e.PermissionKind == CoreWebView2PermissionKind.ClipboardRead) e.State = CoreWebView2PermissionState.Allow;
                };
                wv.ProcessFailed += (o, e) =>
                {
                    var kind = e.ProcessFailedKind;
                    Program.Log(new Exception("WebView2 process failed: " + kind));
                    // the page's process (or the whole engine) is gone: the window would stay an empty navy box
                    if (kind == CoreWebView2ProcessFailedKind.RenderProcessExited || kind == CoreWebView2ProcessFailedKind.BrowserProcessExited)
                        BeginInvoke(new Action(() => RecoverWeb(kind == CoreWebView2ProcessFailedKind.BrowserProcessExited)));
                    // the graphics process restarts by itself; the page is drawn again once its window is touched
                    else if (kind == CoreWebView2ProcessFailedKind.GpuProcessExited) BeginInvoke(new Action(RedrawWeb));
                };

                wv.Navigate(Origin + "index.html");   // notes arrive as boot.js, requested by the page itself
                UpdateWebVisibility();
            }
            catch (Exception ex)
            {
                Program.Log(ex);
                MessageBox.Show(this,
                    "화면 엔진(Microsoft Edge WebView2 런타임)을 시작하지 못했어요.\n\n" +
                    "https://go.microsoft.com/fwlink/p/?LinkId=2124703 에서 런타임을 설치한 뒤 다시 실행해 주세요.\n\n" + ex.Message,
                    "Super Speed Note", MessageBoxButtons.OK, MessageBoxIcon.Error);
                finished = true;
                Application.Exit();
            }
        }

        // A note about to lose most of its text (typed into while shown blank, a slip): the version on disk is kept in
        // backups\overwritten first (the newest 50), so no single write can take a note's text away for good.
        static void KeepBeforeShrink(string file, string next)
        {
            try
            {
                var fi = new FileInfo(file);
                if (!fi.Exists || fi.Length < 600 || (long)Encoding.UTF8.GetByteCount(next ?? "") * 3 > fi.Length) return;
                string dir = Path.Combine(Program.DataDir, "backups", "overwritten");
                Directory.CreateDirectory(dir);
                File.Copy(file, Path.Combine(dir, Path.GetFileNameWithoutExtension(file) + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".html"), true);
                foreach (var f in new DirectoryInfo(dir).GetFiles("*.html").OrderByDescending(f => f.CreationTimeUtc).Skip(50)) f.Delete();
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        // Everything the page needs at start (state + every note), served as /boot.js.
        static string BuildBootScript()
        {
            var sb = new StringBuilder(1 << 16);
            sb.Append("window.__SSN__={host:true,version:\"").Append(Program.Version).Append("\",state:");
            string state = null, stateBak = null;
            try { if (File.Exists(StatePath)) state = File.ReadAllText(StatePath, Encoding.UTF8); } catch { }
            try { if (File.Exists(StatePath + ".bak")) stateBak = File.ReadAllText(StatePath + ".bak", Encoding.UTF8); } catch { }
            sb.Append(state == null ? "null" : Json(state));
            sb.Append(",stateBak:").Append(stateBak == null ? "null" : Json(stateBak));   // previous copy, used if state.json is damaged
            sb.Append(",notes:{");
            var unread = new List<string>();
            try
            {
                var notes = NoteFiles.Load(NotesDir, TrashDir, (state ?? "") + (stateBak ?? ""), unread);   // (which ids are notes: either copy)
                // the page can't start from a script over V8's string limit (~536M characters): the biggest notes
                // stay out of it (read-only and empty in the app this time) rather than the app starting with nothing
                long total = 0, budget = 300000000;
                foreach (var kv in notes.OrderBy(kv => kv.Value.Length))
                {
                    total += kv.Value.Length + kv.Value.Length / 8 + 64;
                    if (total > budget) { unread.Add(kv.Key); continue; }
                    sb.Append(Json(kv.Key)).Append(':').Append(Json(kv.Value)).Append(',');
                }
            }
            catch (Exception ex) { Program.Log(ex); }
            sb.Append("},unread:[").Append(string.Join(",", unread.Distinct().Select(Json))).Append("]");
            string meta = null;
            try { if (File.Exists(MetaPath)) meta = File.ReadAllText(MetaPath, Encoding.UTF8); } catch { }
            sb.Append(",meta:").Append(meta == null ? "null" : Json(meta));
            // notes with a copy in the trash: listed by an older list but deleted since - not to come back blank
            var trashed = new HashSet<string>(StringComparer.Ordinal);
            try
            {
                if (Directory.Exists(TrashDir))
                    foreach (string f in Directory.GetFiles(TrashDir, "*.html"))
                    {
                        string n = Path.GetFileNameWithoutExtension(f);
                        int u = n.IndexOf('_');
                        if (u > 0 && SafeId(n.Substring(0, u))) trashed.Add(n.Substring(0, u));
                    }
            }
            catch (Exception ex) { Program.Log(ex); }
            sb.Append(",trashed:[").Append(string.Join(",", trashed.Select(Json))).Append("]");
            sb.Append(",autostart:").Append(Json(GetStartupMode()));
            sb.Append(",dataDir:").Append(Json(Program.DataDir)).Append("};");
            return sb.ToString();
        }

        void OnResource(object sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            string path;
            try { path = new Uri(e.Request.Uri).AbsolutePath; } catch { return; }
            if (path == "/" || path == "/index.html")
            {
                Program.Mark("index");
                byte[] html = indexHtml;
                if (uiPath != null) { try { html = File.ReadAllBytes(uiPath); } catch { } }
                e.Response = env.CreateWebResourceResponse(new MemoryStream(html, false), 200, "OK",
                    "Content-Type: text/html; charset=utf-8\r\nCache-Control: no-store");
                return;
            }
            if (path == "/boot.js")
            {
                Program.Mark("boot.js");
                string js;
                try { js = bootTask.Result; }   // started at process start; long finished by now
                catch (Exception ex) { Program.Log(ex); js = "window.__SSN__=null;"; }
                e.Response = env.CreateWebResourceResponse(new MemoryStream(Encoding.UTF8.GetBytes(js), false), 200, "OK",
                    "Content-Type: text/javascript; charset=utf-8\r\nCache-Control: no-store");
                return;
            }
            if (path.StartsWith("/img/"))
            {
                string name = Uri.UnescapeDataString(path.Substring(5));
                string file = Path.Combine(ImagesDir, name);
                if (SafeName(name) && File.Exists(file))
                {
                    e.Response = env.CreateWebResourceResponse(new MemoryStream(File.ReadAllBytes(file), false), 200, "OK",
                        "Content-Type: " + Mime(name) + "\r\nCache-Control: max-age=31536000");
                    return;
                }
            }
            e.Response = env.CreateWebResourceResponse(null, 404, "Not Found", "");
        }

        // Messages from the page: "command<US>arg<US>payload" (payload last, may contain anything)
        void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string a;
            try { a = e.TryGetWebMessageAsString(); } catch { return; }
            if (a == null) return;
            string cmd = Cut(ref a);
            try { Dispatch(cmd, a); }
            catch (Exception ex) { Program.Log(ex); Post("toast", "오류: " + ex.Message); }
            if (OuterChanges.Contains(cmd)) OuterSoon();
        }

        void Dispatch(string cmd, string a)
        {
            switch (cmd)
            {
                case "pong": pingAt = 0; break;
                case "painted": drawWait = 0; PaintedUnderCover(); break;     // the page is drawn again in the app window
                case "ready":
                    webReady = true; pingAt = 0;
                    StartPulse();
                    Invalidate();
                    Post("winState", maxState ? "1" : "0");
                    Program.Mark("ready");
                    try
                    {
                        string txt = null;
                        if (fromStandby != null) { txt = "from standby: ready " + fromStandby.ElapsedMilliseconds + "ms"; fromStandby = null; }
                        else if (!marksWritten) { txt = Program.Marks; marksWritten = true; }
                        if (txt != null) File.WriteAllText(Path.Combine(Program.LocalDir, "startup.txt"), txt);
                    }
                    catch { }
                    if (pendingOpen != null) { Post("open", pendingOpen); pendingOpen = null; }
                    if (Program.Restored >= 0) { Post("toast", "백업에서 메모 " + Program.Restored + "개를 가져왔어요"); Program.Restored = -1; }
                    if (Program.Imported) { Program.Imported = false; Post("toast", "이 PC의 기존 메모를 Store 버전으로 가져왔어요 · 이제부터는 Store 버전에 따로 저장돼요"); }
                    if (pendingNew) { Post("new"); pendingNew = false; }
                    if (pendingPalette != null) { if (pendingPalette != "pop" || popWanted) Post("palette", pendingPalette); pendingPalette = null; }
                    if (pendingQuick) { pendingQuick = false; if (quickOpen) Post("quick", "open"); }
                    break;
                case "saveNote":
                    {
                        string id = Cut(ref a);
                        if (!SafeId(id)) break;
                        KeepBeforeShrink(Path.Combine(NotesDir, id + ".html"), a);
                        saver.Write(Path.Combine(NotesDir, id + ".html"), a);
                        saver.MirrorWrite(id, a);
                        break;
                    }
                case "saveMeta": saver.Write(MetaPath, a); break;
                case "jsError":                                  // an error in the page: written to error.log (the first 50 a run)
                    if (jsErrors++ < 50) Program.Log(new Exception("page: " + a));
                    break;
                case "readNote":                                 // a note shown blank: its file read again before it can be typed in
                    {
                        if (!SafeId(a)) break;
                        string file = Path.Combine(NotesDir, a + ".html"), text = null;
                        saver.Flush(2000);
                        try { if (File.Exists(file)) text = NoteFiles.Strip(NoteFiles.ReadShared(file)); }
                        catch (Exception ex) { Program.Log(ex); Post("noteBody", a + SEP + "\u0001"); break; }   // there but unreadable
                        Post("noteBody", text == null ? a : a + SEP + text);
                        break;
                    }
                case "noteNames":                                // "id\tname" lines: the readable copies follow the names in the app
                case "noteNamesAll":                             // the same for every note, at start-up: copies of notes that are gone go
                    {
                        var names = new Dictionary<string, string>(StringComparer.Ordinal);
                        foreach (string line in a.Split('\n'))
                        {
                            int t = line.IndexOf('\t');
                            if (t > 0 && SafeId(line.Substring(0, t))) names[line.Substring(0, t)] = line.Substring(t + 1);
                        }
                        if (cmd == "noteNamesAll") saver.MirrorSync(names);
                        else foreach (var kv in names) saver.MirrorName(kv.Key, kv.Value);
                        break;
                    }
                case "delNote":                                  // id, "trash" | "purge", note info (title, colour, place...)
                    {
                        string id = Cut(ref a), mode = Cut(ref a);
                        if (!SafeId(id)) break;
                        string file = Path.Combine(NotesDir, id + ".html");
                        if (mode == "purge") saver.Purge(file);  // nothing was written in it: gone for good
                        else saver.Trash(file, Path.Combine(TrashDir, id + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".html"), a);
                        saver.MirrorRemove(id);
                        break;
                    }
                case "unTrash": UnTrash(a); break;               // "되돌리기" right after deleting: no copy left in the trash
                case "trashList":                                // read only when the trash is opened
                    saver.Flush(2000);
                    Task.Run(() => TrashList()).ContinueWith(t => { try { BeginInvoke(new Action(() => Post("trash", t.Result))); } catch { } });
                    break;
                case "trashRestore": TrashRestore(Cut(ref a), a); break;
                case "trashPurge": if (SafeTrashName(a)) TrashDelete(a); break;
                case "trashEmpty":
                    saver.Flush(2000);
                    try { if (Directory.Exists(TrashDir)) foreach (string f in Directory.GetFiles(TrashDir)) File.Delete(f); }
                    catch (Exception ex) { Program.Log(ex); Post("toast", "휴지통을 비우지 못했어요: " + ex.Message); }
                    break;
                case "saveState": saver.Write(StatePath, a); break;
                case "saveImg":
                    {
                        string name = Cut(ref a);
                        if (!SafeName(name)) break;
                        Directory.CreateDirectory(ImagesDir);
                        File.WriteAllBytes(Path.Combine(ImagesDir, name), Convert.FromBase64String(a));
                        break;
                    }
                case "hotkeys":
                    hotkeySpec = a;
                    ApplyHotkeys();
                    saver.Write(Path.Combine(Program.DataDir, "hotkeys.txt"), a);   // standby mode registers these without the page
                    break;
                case "hkSuspend": hotkeysSuspended = a == "1"; ApplyHotkeys(); break;
                case "active": activeNote = a; break;
                case "palette":                                  // page reports its search window open / closed
                    paletteOpen = a == "1";
                    if (paletteOpen) { if (popWanted && (!popShown || holdWeb)) AttachPop(); }
                    else if (popWanted || popShown) DetachPop();
                    break;
                case "quick":                                    // quick memo: page ready / closed by its X / "open in app"
                    if (a == "1") { if (quickOpen && webIn != quick && !popShown) AttachQuick(); }
                    else if (a == "main") { DetachQuick(false); ShowApp(); }
                    else
                    {
                        bool qfront = quick != null && Native.GetForegroundWindow() == quick.Handle;
                        DetachQuick(true);
                        if (qfront) GiveBackFromQuick();
                        if (a == "full" && tray != null) tray.ShowBalloonTip(3000, "Super Speed Note", "메모가 500개라 새 메모를 만들 수 없어요. 안 쓰는 메모를 지워 주세요.", ToolTipIcon.None);
                    }
                    break;
                case "back": GoBack(); break;                    // Esc in the search window: back to where you were
                case "show": ShowApp(); break;                   // search window -> "open this note"
                case "drag": BeginDrag(HTCAPTION); break;
                case "resize": EdgeDown(a); break;
                case "stretch": Stretch(a); break;
                // native ShowWindow: WinForms' WindowState setter re-adds a frame we removed and grows the window
                case "min": Native.ShowWindow(Handle, 6 /*SW_MINIMIZE*/); break;
                case "max": Native.ShowWindow(Handle, Native.IsZoomed(Handle) ? 9 /*SW_RESTORE*/ : 3 /*SW_MAXIMIZE*/); break;
                case "close": if (closeToTray) { HideApp(); ShowTrayHintOnce(); } else Quit(false); break;
                case "quit": Quit(false); break;
                case "top": TopMost = a == "1"; break;
                case "closeToTray": closeToTray = a == "1"; break;
                case "quickCorner":
                    if (a == "tl" || a == "tr" || a == "bl" || a == "br")
                        try { File.WriteAllText(Path.Combine(Program.LocalDir, "quickcorner.txt"), a); } catch (Exception ex) { Program.Log(ex); }
                    break;
                case "autostart":
                    if (Program.Packaged) break;                 // Store version: Task Manager > Startup apps
                    startupMode = a == "1" ? "tray" : a == "0" ? "off" : a;
                    if (startupMode != "standby" && startupMode != "tray" && startupMode != "open") startupMode = "off";
                    SetStartupMode(startupMode);
                    break;
                case "theme":
                    bg = a == "dark" ? Color.FromArgb(0x05, 0x0C, 0x1F) : Color.FromArgb(0x08, 0x15, 0x36);
                    popBg = a == "dark" ? Color.FromArgb(0x12, 0x1E, 0x3B) : Color.White;   // = --menu
                    quickBg = a == "dark" ? Color.FromArgb(0x0F, 0x1A, 0x33) : Color.White; // = --paper
                    BackColor = bg;
                    if (pop != null) pop.BackColor = popBg;
                    if (quick != null) quick.BackColor = quickBg;
                    if (ctl != null) ctl.DefaultBackgroundColor = webIn == pop ? popBg : webIn == quick ? quickBg : bg;
                    break;
                case "dragOut":                                  // "html" | "txt", file name, plain text, the note as that file
                    {
                        string kind = Cut(ref a), name = Cut(ref a), text = Cut(ref a), body = a;
                        BeginInvoke(new Action(() => DragOut(kind, new[] { name }, new[] { body }, text)));
                        break;
                    }
                case "dragOutMany":                              // several picked notes: kind, all their text, then
                    {                                            // name \x1d file of each, \x1e between notes
                        string kind = Cut(ref a), text = Cut(ref a);
                        var names = new List<string>();
                        var bodies = new List<string>();
                        foreach (string it in a.Split('\x1e'))
                        {
                            int k = it.IndexOf('\x1d');
                            if (k < 0) continue;
                            names.Add(it.Substring(0, k));
                            bodies.Add(it.Substring(k + 1));
                        }
                        if (names.Count > 0) BeginInvoke(new Action(() => DragOut(kind, names.ToArray(), bodies.ToArray(), text)));
                        else Post("dragOutDone", "");
                        break;
                    }
                case "export": { string name = Cut(ref a), body = a; BeginInvoke(new Action(() => Export(name, body))); break; }
                case "openUrl": OpenUrl(a); break;
                case "clip":
                case "sendOut":
                    {
                        string mode = cmd == "sendOut" ? Cut(ref a) : null;
                        int n;
                        if (!int.TryParse(Cut(ref a), out n) || n < 0 || n > a.Length) break;
                        SetClipboard(a.Substring(0, n), a.Substring(n));   // payload = text followed by its HTML
                        if (mode != null) SendOut(mode == "paste");
                        break;
                    }
                case "openData": Process.Start("explorer.exe", "\"" + Program.DataDir + "\""); break;
                case "backup":                                   // the page hears back how it went (it used to always say "done")
                    saver.Flush(2000);
                    Task.Run(() => DataBackup.Manual()).ContinueWith(t => { try { BeginInvoke(new Action(() => Post("backupDone", t.Result))); } catch { } });
                    break;
                case "flushed": AfterFlush(quitSeq); break;
                case "outerInfo": Post("outerInfo", OuterInfo()); break;
                case "outerSet":                                 // "on" | "off"
                    if (a == "off") OuterBackup.TurnOff(); else { OuterBackup.TurnOn(); outerDirty = true; OuterNow(ok => Post("outerInfo", OuterInfo())); }
                    Post("outerInfo", OuterInfo());
                    break;
                case "outerPick":
                    BeginInvoke(new Action(() =>
                    {
                        using (var dlg = new FolderBrowserDialog { Description = "메모를 백업할 폴더 (앱을 지워도 남는 곳 · OneDrive 폴더면 클라우드에도)", SelectedPath = OuterBackup.Dir, ShowNewFolderButton = true })
                        {
                            if (dlg.ShowDialog(this) != DialogResult.OK) return;
                            string d = dlg.SelectedPath;
                            if (!d.EndsWith("Super Speed Note 백업", StringComparison.OrdinalIgnoreCase)) d = Path.Combine(d, "Super Speed Note 백업");
                            OuterBackup.Set(d.Equals(OuterBackup.DefaultDir, StringComparison.OrdinalIgnoreCase) ? "" : d);
                            outerDirty = true;
                            OuterNow(ok => Post("outerInfo", OuterInfo()));
                            Post("outerInfo", OuterInfo());
                        }
                    }));
                    break;
                case "outerOpen":
                    try { Directory.CreateDirectory(OuterBackup.Dir); Process.Start("explorer.exe", "\"" + OuterBackup.Dir + "\""); } catch (Exception ex) { Post("toast", "폴더를 열지 못했어요: " + ex.Message); }
                    break;
                case "outerNow": OuterNow(ok => { Post("outerDone", ok ? "" : "!" + (OuterBackup.LastError ?? "")); Post("outerInfo", OuterInfo()); }); break;
                case "outerRestore":                             // the page asked first; done on the next start, before the notes load
                    {
                        string from = Path.Combine(OuterBackup.Dir, OuterBackup.Latest);
                        if (!File.Exists(Path.Combine(from, "state.json"))) { Post("toast", "백업 폴더에 메모가 없어요"); break; }
                        saver.Flush(3000);
                        File.WriteAllText(Path.Combine(Program.LocalDir, "restore-pending.txt"), from, new UTF8Encoding(false));
                        restartAfter = true;
                        Quit(true);
                        break;
                    }
            }
        }

        // ---------- the outside backup (see OuterBackup) ----------
        static readonly HashSet<string> OuterChanges = new HashSet<string> { "saveNote", "saveState", "saveMeta", "saveImg", "delNote", "trashPurge", "trashEmpty", "trashRestore" };
        System.Windows.Forms.Timer outerTimer;
        bool outerDirty;
        void OuterSoon()                                  // a minute after the last change
        {
            outerDirty = true;
            if (outerTimer == null)
            {
                outerTimer = new System.Windows.Forms.Timer { Interval = 60 * 1000 };
                outerTimer.Tick += (s, e) => { outerTimer.Stop(); OuterNow(null); };
            }
            outerTimer.Stop(); outerTimer.Start();
        }
        void OuterNow(Action<bool> done)                  // in the background; done (if given) back on this thread
        {
            if (!outerDirty && done == null) return;
            outerDirty = false;
            Task.Run(() =>
            {
                saver.Flush(3000);
                bool ok = OuterBackup.Sync();
                if (done != null) { try { BeginInvoke(new Action(() => done(ok))); } catch { } }
            });
        }
        string OuterInfo()
        {
            string latest = Path.Combine(OuterBackup.Dir, OuterBackup.Latest);
            bool has = File.Exists(Path.Combine(latest, "state.json"));
            return "{\"on\":" + (OuterBackup.On ? "true" : "false") + ",\"dir\":" + Json(OuterBackup.Dir) + ",\"def\":" + (OuterBackup.IsDefault ? "true" : "false") +
                ",\"last\":" + Json(has ? File.GetLastWriteTime(Path.Combine(latest, "state.json")).ToString("yyyy-MM-dd HH:mm") : "") +
                ",\"notes\":" + (has ? OuterBackup.CountNotes(latest) : 0) + ",\"error\":" + Json(OuterBackup.LastError ?? "") + "}";
        }

        void Post(string cmd, string arg = null)
        {
            if (wv == null) return;
            try { wv.PostWebMessageAsString(arg == null ? cmd : cmd + SEP + arg); } catch { }
        }

        // ---------- quit ----------
        // full = really exit. Otherwise ("끄기", Ctrl+Q) the window and web engine close but the hotkeys stay
        // registered, so a note's hotkey still opens it - unless start-up mode is "off".
        void Quit(bool full)
        {
            full = full || startupMode == "off";
            if (!webStarted) { if (full) FinishQuit(); return; }   // already in standby
            if (quitting) { if (full) quitFull = true; return; }
            quitting = true;
            quitFull = full;
            int seq = ++quitSeq;
            if (!webReady) { AfterFlush(seq); return; }
            if (quickOpen) Post("quick", "close");   // an empty quick memo is dropped, not left behind
            Post("flush");   // page sends its last edits, then "flushed"
            var t = new System.Windows.Forms.Timer { Interval = 1500 };
            t.Tick += (s, e) => { t.Stop(); t.Dispose(); AfterFlush(seq); };
            t.Start();
        }

        void AfterFlush(int seq)
        {
            if (!quitting || seq != quitSeq) return;
            quitting = false;
            if (quitFull) FinishQuit(); else EnterStandby();
        }

        bool restartAfter;
        void FinishQuit()
        {
            if (finished) return;
            finished = true;
            SaveBounds();
            saver.Flush(4000);
            if (outerDirty && !restartAfter) { outerDirty = false; try { Task.Run(() => OuterBackup.Sync()).Wait(8000); } catch { } }   // the last changes too
            if (restartAfter) { try { Process.Start(Application.ExecutablePath, "--restart"); } catch (Exception ex) { Program.Log(ex); } }
            foreach (int id in hotkeys.Keys) Native.UnregisterHotKey(Handle, id);
            if (tray != null) { tray.Visible = false; tray.Dispose(); }
            if (ctl != null) { try { ctl.Close(); } catch { } }
            Application.Exit();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!finished)
            {
                if (e.CloseReason == CloseReason.UserClosing)
                {
                    e.Cancel = true;   // Alt+F4 / taskbar close behave like the X button
                    if (closeToTray && !quitting) { HideApp(); ShowTrayHintOnce(); } else Quit(false);
                    return;
                }
                // Windows shutdown etc.: no time for the page, write what we have.
                SaveBounds();
                saver.Flush(2500);
                finished = true;
            }
            base.OnFormClosing(e);
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            base.OnFormClosed(e);
            if (tray != null) tray.Visible = false;
            Application.ExitThread();
        }

        // ---------- files ----------
        // pasted pictures go inside the file, so it stands alone
        static string InlineImages(string html)
        {
            return Regex.Replace(html, "https://app\\.ssn/img/([A-Za-z0-9_.-]+)", m =>
            {
                string f = Path.Combine(ImagesDir, m.Groups[1].Value);
                return File.Exists(f) ? "data:" + Mime(f) + ";base64," + Convert.ToBase64String(File.ReadAllBytes(f)) : m.Value;
            });
        }

        // Dragging a note out of the app (the desktop, a folder, a mail): WebView2 can't make a file from a page's drag
        // (its DownloadURL drop only opens an empty download list), so the app drags a real file itself - written to a
        // temp folder under the note's name - with the note's text alongside. The page cancels its own drag and asks
        // for this one while the mouse button is still down; dropped back on the app, the page reorders as before.
        void DragOut(string kind, string[] names, string[] bodies, string text)
        {
            try
            {
                string root = Path.Combine(Path.GetTempPath(), "SuperSpeedNote-drag");
                try   // files of earlier drags (a folder or the desktop took a copy, or nothing did)
                {
                    if (Directory.Exists(root))
                        foreach (string d in Directory.GetDirectories(root))
                            if (Directory.GetCreationTimeUtc(d) < DateTime.UtcNow.AddMinutes(-30)) Directory.Delete(d, true);
                }
                catch (Exception ex) { Program.Log(ex); }
                string dir = Path.Combine(root, Guid.NewGuid().ToString("N").Substring(0, 10));   // its own folder: the names stay the notes'
                Directory.CreateDirectory(dir);
                string ext = kind == "txt" ? ".txt" : ".html";
                var files = new List<string>();
                for (int i = 0; i < names.Length; i++)
                {
                    string stem = NoteFiles.FileBase(names[i]), file = Path.Combine(dir, stem + ext);
                    for (int k = 2; File.Exists(file); k++) file = Path.Combine(dir, stem + " (" + k + ")" + ext);   // two notes, one name
                    if (kind == "txt") File.WriteAllText(file, bodies[i].Replace("\r\n", "\n").Replace("\n", "\r\n"), new UTF8Encoding(true));
                    else File.WriteAllText(file, InlineImages(bodies[i]), new UTF8Encoding(false));
                    files.Add(file);
                }
                var data = new DataObject();
                data.SetData(DataFormats.FileDrop, files.ToArray());
                if (text.Length > 0) data.SetData(DataFormats.UnicodeText, text);
                DoDragDrop(data, DragDropEffects.Copy | DragDropEffects.Move);
            }
            catch (Exception ex) { Program.Log(ex); }
            finally { Post("dragOutDone", ""); }
        }

        void Export(string name, string content)
        {
            string ext = Path.GetExtension(name).ToLowerInvariant();
            using (var dlg = new SaveFileDialog())
            {
                dlg.FileName = SafeFileName(name);
                dlg.Filter = ext == ".html" ? "HTML 문서 (*.html)|*.html" : "텍스트 파일 (*.txt)|*.txt";
                dlg.InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                if (ext == ".html") content = InlineImages(content);
                File.WriteAllText(dlg.FileName, content, new UTF8Encoding(ext != ".html"));
                Post("toast", "내보내기 완료 · " + Path.GetFileName(dlg.FileName));
            }
        }

        // Windows start-up: "off", "standby" (hotkeys only, ~no memory), "tray" (engine preloaded, instant) or "open"
        // (the window opens at sign-in). The Microsoft Store version ("package") starts through its own startup task
        // instead, which the user turns on / off in Task Manager > Startup apps.
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        static string GetStartupMode()
        {
            if (Program.Packaged) return "package";
            try
            {
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey))
                    return ModeOf(k == null ? null : k.GetValue("SuperSpeedNote") as string);
            }
            catch { return "off"; }
        }
        static string ModeOf(string cmd)
        {
            if (cmd == null) return "off";
            return cmd.Contains("--standby") ? "standby" : cmd.Contains("--tray") ? "tray" : "open";
        }

        static void SetStartupMode(string mode)
        {
            if (Program.Packaged) return;
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (mode == "standby" || mode == "tray" || mode == "open") k.SetValue("SuperSpeedNote", StartupCommand(mode));
                else k.DeleteValue("SuperSpeedNote", false);
            }
        }

        // Start-up runs a copy kept in %LOCALAPPDATA%\Programs\SuperSpeedNote (where install.ps1 installs), so moving,
        // renaming or deleting the exe you started never stops the app starting with Windows. A portable copy (notes in
        // a "data" folder next to it) registers itself as it is.
        static string StartupCommand(string mode)
        {
            string exe = Program.Portable ? Application.ExecutablePath : StartupCopy();
            return "\"" + exe + "\"" + (mode == "open" ? "" : " --" + mode);
        }
        static string StartupCopy()
        {
            string me = Application.ExecutablePath;
            string dst = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\SuperSpeedNote\SuperSpeedNote.exe");
            try
            {
                if (string.Equals(Path.GetFullPath(me), Path.GetFullPath(dst), StringComparison.OrdinalIgnoreCase)) return dst;
                if (File.Exists(dst))
                {
                    Version have = new Version(FileVersionInfo.GetVersionInfo(dst).FileVersion ?? "0.0"), mine = new Version(Program.Version + ".0");
                    if (have > mine) return dst;                                   // a newer copy is there already: keep it
                    FileInfo a = new FileInfo(me), b = new FileInfo(dst);
                    if (have == mine && a.Length == b.Length && a.LastWriteTimeUtc == b.LastWriteTimeUtc) return dst;   // the same file
                }
                Directory.CreateDirectory(Path.GetDirectoryName(dst));
                string tmp = dst + ".new";
                File.Copy(me, tmp, true);                                          // (keeps the file's time: "the same file" above)
                if (File.Exists(dst)) File.Delete(dst);                            // only one copy runs at a time: it's not this one
                File.Move(tmp, dst);
                return dst;
            }
            catch (Exception ex) { Program.Log(ex); return me; }                   // no copy: start this exe itself
        }

        // keep the start-up entry on the newest copy (one moved / deleted, or an older version, is replaced from this exe)
        static void RepairStartupPath()
        {
            try
            {
                if (Program.Packaged) return;   // Store version: its own startup task (a second start-up launch just exits)
                string v;
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey))
                    v = k == null ? null : k.GetValue("SuperSpeedNote") as string;
                if (v == null) return;
                if (Program.Portable)    // a test / USB copy only steps in when the registered exe is gone
                {
                    int q = v.IndexOf('"', 1);
                    string exe = v.StartsWith("\"") && q > 0 ? v.Substring(1, q - 1) : v;
                    if (File.Exists(exe)) return;
                }
                string want = StartupCommand(ModeOf(v));
                if (want != v)
                    using (RegistryKey k = Registry.CurrentUser.CreateSubKey(RunKey)) k.SetValue("SuperSpeedNote", want);
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        static void OpenUrl(string u)
        {
            Uri uri;
            if (Uri.TryCreate(u, UriKind.Absolute, out uri) && (uri.Scheme == "http" || uri.Scheme == "https" || uri.Scheme == "mailto"))
                Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
        }

        // ---------- trash ----------
        // Deleted notes: trash\<id>_<yyyyMMdd_HHmmss>.html plus a .json with the note's title, colour, pin and
        // place in the list, so a restore puts it back as it was. Kept until you empty the trash.
        static bool SafeTrashName(string n) { return n.Length > 0 && n.Length <= 120 && Regex.IsMatch(n, "^[A-Za-z0-9_-]+$"); }

        // nothing in it: no text, picture, table or line
        static bool IsEmptyNote(string html)
        {
            if (Regex.IsMatch(html, "<(img|table|hr)\\b", RegexOptions.IgnoreCase)) return false;
            return System.Net.WebUtility.HtmlDecode(Regex.Replace(html, "<[^>]*>", "")).Trim().Length == 0;
        }

        static string ReadHead(string file, int chars)
        {
            using (var r = new StreamReader(file, Encoding.UTF8))
            {
                var buf = new char[chars];
                int n = r.ReadBlock(buf, 0, chars);
                return new string(buf, 0, n);
            }
        }

        static void TrashDelete(string name)
        {
            try
            {
                string f = Path.Combine(TrashDir, name + ".html"), j = Path.Combine(TrashDir, name + ".json");
                if (File.Exists(f)) File.Delete(f);
                if (File.Exists(j)) File.Delete(j);
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        // empty notes thrown away by older versions: delete them for good (background, after start-up)
        static void SweepTrash()
        {
            NoteFiles.StripTrash(TrashDir);
            try
            {
                if (!Directory.Exists(TrashDir)) return;
                foreach (string f in Directory.GetFiles(TrashDir, "*.html"))
                    if (new FileInfo(f).Length <= 4096 && IsEmptyNote(File.ReadAllText(f, Encoding.UTF8)))
                        TrashDelete(Path.GetFileNameWithoutExtension(f));
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        // the trash as JSON, newest first: [{f: file name, at: deleted (ms), m: note info, p: first words}]
        static string TrashList()
        {
            var items = new List<KeyValuePair<long, string>>();
            try
            {
                if (Directory.Exists(TrashDir))
                    foreach (string f in Directory.GetFiles(TrashDir, "*.html"))
                    {
                        string name = Path.GetFileNameWithoutExtension(f);
                        if (!SafeTrashName(name)) continue;
                        string head = ReadHead(f, 8192);
                        if (head.Length < 4096 && IsEmptyNote(head)) { TrashDelete(name); continue; }
                        DateTime at;
                        int i = name.Length - 15;
                        if (i < 2 || name[i - 1] != '_' || !DateTime.TryParseExact(name.Substring(i), "yyyyMMdd_HHmmss",
                            System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out at))
                            at = File.GetLastWriteTime(f);
                        string mf = Path.Combine(TrashDir, name + ".json");
                        string meta = File.Exists(mf) ? File.ReadAllText(mf, Encoding.UTF8) : "";
                        // first lines as plain text (one per line: the first is the title of a note that had none)
                        string text = Regex.Replace(head, "<(br|/div|/p|/li|/tr|/h[1-6])[^>]*>", "\n", RegexOptions.IgnoreCase);
                        text = System.Net.WebUtility.HtmlDecode(Regex.Replace(Regex.Replace(text, "</td>", " ", RegexOptions.IgnoreCase), "<[^>]*>", ""));
                        text = string.Join("\n", text.Split('\n').Select(l => Regex.Replace(l, "[ \\t\\u00a0]+", " ").Trim()).Where(l => l.Length > 0).Take(6));
                        if (text.Length > 300) text = text.Substring(0, 300);
                        long ms = (long)(at.ToUniversalTime() - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
                        items.Add(new KeyValuePair<long, string>(ms, "{\"f\":" + Json(name) + ",\"at\":" + ms + ",\"m\":" + Json(meta) + ",\"p\":" + Json(text) + "}"));
                    }
            }
            catch (Exception ex) { Program.Log(ex); }
            items.Sort((x, y) => y.Key.CompareTo(x.Key));
            return "[" + string.Join(",", items.Select(x => x.Value)) + "]";
        }

        // back into notes\ under the id the page chose; the page gets the note's info and contents
        void TrashRestore(string name, string id)
        {
            if (!SafeTrashName(name) || !SafeId(id)) return;
            saver.Flush(2000);
            string src = Path.Combine(TrashDir, name + ".html"), mf = Path.Combine(TrashDir, name + ".json"), dst = Path.Combine(NotesDir, id + ".html");
            try
            {
                if (!File.Exists(src) || File.Exists(dst)) { Post("trashRestored", name + SEP + SEP + SEP); return; }
                string meta = File.Exists(mf) ? File.ReadAllText(mf, Encoding.UTF8) : "";
                string text = NoteFiles.Strip(NoteFiles.ReadShared(src));   // a 1.4.4 copy carries an id line: not in the note
                Saver.WriteAtomic(dst, text);
                // restored once it is written; the copy in the trash goes if Windows lets it
                try { File.Delete(src); if (File.Exists(mf)) File.Delete(mf); } catch (Exception ex) { Program.Log(ex); }
                Post("trashRestored", name + SEP + id + SEP + meta + SEP + text);
            }
            catch (Exception ex) { Program.Log(ex); Post("trashRestored", name + SEP + SEP + SEP); }
        }

        // "되돌리기" a moment after deleting: drop the copy that just went to the trash
        void UnTrash(string id)
        {
            if (!SafeId(id)) return;
            saver.Flush(2000);
            try
            {
                if (!Directory.Exists(TrashDir)) return;
                string newest = Directory.GetFiles(TrashDir, id + "_*.html").Select(Path.GetFileNameWithoutExtension).OrderBy(n => n, StringComparer.Ordinal).LastOrDefault();
                DateTime at;
                if (newest != null && DateTime.TryParseExact(newest.Substring(newest.Length - 15), "yyyyMMdd_HHmmss",
                        System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out at)
                    && (DateTime.Now - at).TotalMinutes < 3)
                    TrashDelete(newest);
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        // ---------- helpers ----------
        static string Cut(ref string s)
        {
            int i = s.IndexOf(SEP);
            string head;
            if (i < 0) { head = s; s = ""; }
            else { head = s.Substring(0, i); s = s.Substring(i + 1); }
            return head;
        }

        static bool SafeId(string id) { return id.Length > 0 && id.Length <= 64 && Regex.IsMatch(id, "^[A-Za-z0-9_-]+$"); }
        static bool SafeName(string n) { return n.Length > 0 && n.Length <= 100 && Regex.IsMatch(n, "^[A-Za-z0-9_-]+\\.(png|jpe?g|gif|webp|bmp)$", RegexOptions.IgnoreCase); }

        static string SafeFileName(string n)
        {
            foreach (char c in Path.GetInvalidFileNameChars()) n = n.Replace(c, '_');
            return n.Length > 120 ? n.Substring(0, 120) : n;
        }

        static string Mime(string name)
        {
            switch (Path.GetExtension(name).ToLowerInvariant())
            {
                case ".png": return "image/png";
                case ".jpg": case ".jpeg": return "image/jpeg";
                case ".gif": return "image/gif";
                case ".webp": return "image/webp";
                case ".bmp": return "image/bmp";
            }
            return "application/octet-stream";
        }

        static string Json(string s)
        {
            var sb = new StringBuilder(s.Length + 16);
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case (char)0x2028: sb.Append("\\u2028"); break;
                    case (char)0x2029: sb.Append("\\u2029"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            return sb.Append('"').ToString();
        }
    }

    // Copies of state.json + every note: one per day (last 14 kept), plus named ones that are never pruned
    // (manual "지금 백업" and the copy taken before a new version first runs).
    static class DataBackup
    {
        public static void Run(string label)
        {
            int failed;
            try { Copy(label, false, out failed); }
            catch (Exception ex) { Program.Log(ex); }
        }

        // "지금 백업": everything including pictures; returns the folder, or "!" + why it failed
        public static string Manual()
        {
            try
            {
                int failed;
                string dir = Copy("manual-" + DateTime.Now.ToString("yyyyMMdd-HHmmss"), true, out failed);
                if (dir == null) return "!아직 저장된 메모가 없어요";
                return failed > 0 ? "!파일 " + failed + "개를 복사하지 못했어요 · " + dir : dir;
            }
            catch (Exception ex) { Program.Log(ex); return "!" + ex.Message; }
        }

        static string Copy(string label, bool images, out int failed)
        {
            failed = 0;
            string data = Program.DataDir;
            string state = Path.Combine(data, "state.json");
            if (!File.Exists(state)) return null;
            string root = Path.Combine(data, "backups");
            string dir = Path.Combine(root, label ?? DateTime.Now.ToString("yyyy-MM-dd"));
            if (Directory.Exists(dir))
            {
                if (label == null) return null;
                dir += "_" + DateTime.Now.ToString("HHmmss");
            }
            Directory.CreateDirectory(Path.Combine(dir, "notes"));
            File.Copy(state, Path.Combine(dir, "state.json"), true);
            string notes = Path.Combine(data, "notes");
            if (Directory.Exists(notes))
                foreach (string f in Directory.GetFiles(notes, "*.html"))
                    try { File.Copy(f, Path.Combine(dir, "notes", Path.GetFileName(f)), true); } catch { failed++; }
            string imgs = Path.Combine(data, "images");
            if (images && Directory.Exists(imgs))
            {
                Directory.CreateDirectory(Path.Combine(dir, "images"));
                foreach (string f in Directory.GetFiles(imgs))
                    try { File.Copy(f, Path.Combine(dir, "images", Path.GetFileName(f)), true); } catch { failed++; }
            }
            string[] daily = Directory.GetDirectories(root).Where(d => Regex.IsMatch(Path.GetFileName(d), @"^\d{4}-\d{2}-\d{2}$")).ToArray();
            Array.Sort(daily, StringComparer.Ordinal);
            for (int i = 0; i < daily.Length - 14; i++) { try { Directory.Delete(daily[i], true); } catch { } }
            return dir;
        }
    }

    // A copy of the notes outside the app's own folders - by default Documents\Super Speed Note 백업 - so the notes
    // outlive the app: uninstalling the Store version deletes its folders, notes and daily backups with them.
    //  - 최신\      the notes, list, pictures and trash as they are: a minute after a change and when the app closes,
    //               copying only what changed (in the background - the app never waits for it)
    //  - 날짜별\yyyy-MM-dd\  the day's first state (notes, list, trash - pictures stay in 최신\images), kept 14 days
    // Files are the app's own, unchanged, so any version reads them back. When the notes suddenly drop to less than
    // half, nothing is deleted from the backup (a fault, not someone's deletions); the days kept are a second line.
    static class OuterBackup
    {
        public const string Latest = "최신", Daily = "날짜별";
        static readonly object gate = new object();
        public static string LastError;
        public static DateTime LastDone;
        static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);
        static string SettingFile { get { return Path.Combine(Program.DataDir, "outer-backup.txt"); } }
        public static string DefaultDir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Super Speed Note 백업"); } }

        // the setting: "" = the default folder, "off", or a folder; a portable (test / USB) copy is off unless set
        static string Setting()
        {
            try { if (File.Exists(SettingFile)) return File.ReadAllText(SettingFile, Encoding.UTF8).Trim(); } catch { }
            return Program.Portable ? "off" : "";
        }
        public static void Set(string v) { File.WriteAllText(SettingFile, v ?? "", Utf8); }
        public static bool On { get { return Setting() != "off"; } }
        public static bool IsDefault { get { return Setting() == ""; } }
        // where it goes (also when switched off: where it would go)
        public static string Dir
        {
            get
            {
                string s = Setting();
                if (s == "off") { s = ""; try { string k = Path.Combine(Program.DataDir, "outer-backup-dir.txt"); if (File.Exists(k)) s = File.ReadAllText(k, Encoding.UTF8).Trim(); } catch { } }
                return s.Length > 0 ? s : DefaultDir;
            }
        }
        public static void TurnOff() { try { if (!IsDefault) File.WriteAllText(Path.Combine(Program.DataDir, "outer-backup-dir.txt"), Dir, Utf8); } catch { } Set("off"); }
        public static void TurnOn() { string k = Path.Combine(Program.DataDir, "outer-backup-dir.txt"); string d = File.Exists(k) ? File.ReadAllText(k, Encoding.UTF8).Trim() : ""; Set(d); }

        // what is copied: everything in the data folder but its own backups, the old readable copies and settings of
        // this install
        static List<string> Collect(string src)
        {
            var list = new List<string>();
            foreach (string f in Directory.GetFiles(src, "*", SearchOption.AllDirectories))
            {
                string rel = f.Substring(src.Length + 1);
                string top = rel.Contains("\\") ? rel.Substring(0, rel.IndexOf('\\')) : null;
                if (top != null && (top.Equals("backups", StringComparison.OrdinalIgnoreCase) || top == "메모")) continue;
                if (top == null && (rel.Equals("version.txt", StringComparison.OrdinalIgnoreCase) || rel.StartsWith("outer-backup", StringComparison.OrdinalIgnoreCase)
                    || rel.Equals("memo-index.txt", StringComparison.OrdinalIgnoreCase))) continue;
                if (rel.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase)) continue;
                list.Add(rel);
            }
            return list;
        }

        static bool CopyIfChanged(string src, string dst, string rel)
        {
            string s = Path.Combine(src, rel), d = Path.Combine(dst, rel);
            var a = new FileInfo(s);
            if (!a.Exists) return false;
            if (File.Exists(d))
            {
                var b = new FileInfo(d);
                if (a.Length == b.Length && a.LastWriteTimeUtc <= b.LastWriteTimeUtc) return false;
            }
            Directory.CreateDirectory(Path.GetDirectoryName(d));
            string tmp = d + ".tmp";
            File.Copy(s, tmp, true);                        // whole first, then in place: never half a file in the backup
            if (File.Exists(d)) { try { File.Replace(tmp, d, null, true); } catch (Exception) { File.Copy(tmp, d, true); File.Delete(tmp); } }
            else File.Move(tmp, d);
            return true;
        }

        static int Listed(string dir)                    // notes in a folder's list (state.json)
        {
            try { string f = Path.Combine(dir, "state.json"); return File.Exists(f) ? Regex.Matches(File.ReadAllText(f, Encoding.UTF8), @"""id""\s*:\s*""").Count : 0; } catch { return 0; }
        }
        static int Trashed(string dir)
        {
            try { string t = Path.Combine(dir, "trash"); return Directory.Exists(t) ? Directory.GetFiles(t, "*.html").Length : 0; } catch { return 0; }
        }
        public static int CountNotes(string dir)
        {
            try { string n = Path.Combine(dir, "notes"); return Directory.Exists(n) ? Directory.GetFiles(n, "*.html").Length : 0; } catch { return 0; }
        }

        // brings 최신 in step with the notes; false when it could not (LastError says why)
        public static bool Sync()
        {
            if (!On) return true;
            lock (gate)
            {
                try
                {
                    string src = Program.DataDir, dir = Dir, dst = Path.Combine(dir, Latest);
                    if (!File.Exists(Path.Combine(src, "state.json"))) return true;   // nothing saved yet
                    Directory.CreateDirectory(dst);
                    List<string> files = Collect(src);
                    // A fault, not your deletions, when the list drops below half AND so do the list and the trash
                    // together (a deleted note goes to the trash; emptying the trash leaves the list as it was)
                    int srcList = Listed(src), dstList = Listed(dst), srcTrash = Trashed(src), dstTrash = Trashed(dst);
                    bool shrunk = dstList >= 4 && srcList * 2 < dstList && (srcList + srcTrash) * 2 < dstList + dstTrash;
                    int failed = 0;
                    foreach (string rel in files)
                    {
                        if (rel.Equals("state.json", StringComparison.OrdinalIgnoreCase)) continue;
                        if (shrunk && (rel.Equals("notes-meta.json", StringComparison.OrdinalIgnoreCase) || rel.Equals("state.json.bak", StringComparison.OrdinalIgnoreCase))) continue;
                        try { CopyIfChanged(src, dst, rel); } catch (IOException) { failed++; }   // being written right now: next time
                    }
                    if (shrunk) Program.Log(new Exception("outer backup: the list dropped from " + dstList + " to " + srcList + " notes - the backup keeps its copy"));
                    else
                    {
                        // gone from the app (a deleted note goes to its trash, copied too): gone here; pictures stay
                        var have = new HashSet<string>(files, StringComparer.OrdinalIgnoreCase);
                        foreach (string sub in new[] { "notes", "trash" })
                        {
                            string dd = Path.Combine(dst, sub);
                            if (!Directory.Exists(dd)) continue;
                            foreach (string f in Directory.GetFiles(dd))
                                if (!f.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase) && !have.Contains(sub + "\\" + Path.GetFileName(f))) { try { File.Delete(f); } catch { failed++; } }
                        }
                        try { CopyIfChanged(src, dst, "state.json"); } catch (IOException) { failed++; }   // last: an interrupted copy keeps the list it had
                    }
                    DailyCopy(dir, dst);
                    WriteReadme(dir);
                    LastDone = DateTime.Now;
                    LastError = failed > 0 ? "파일 " + failed + "개는 다음 백업 때 복사해요" : null;
                    return true;
                }
                catch (Exception ex) { LastError = ex.Message; Program.Log(ex); return false; }
            }
        }

        static void DailyCopy(string dir, string latest)
        {
            string root = Path.Combine(dir, Daily), day = Path.Combine(root, DateTime.Now.ToString("yyyy-MM-dd"));
            if (Directory.Exists(day) || !File.Exists(Path.Combine(latest, "state.json"))) return;
            string tmp = day + ".tmp";
            if (Directory.Exists(tmp)) Directory.Delete(tmp, true);
            foreach (string sub in new[] { "notes", "trash" })
            {
                string s = Path.Combine(latest, sub);
                if (!Directory.Exists(s)) continue;
                Directory.CreateDirectory(Path.Combine(tmp, sub));
                foreach (string f in Directory.GetFiles(s)) if (!f.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase)) File.Copy(f, Path.Combine(tmp, sub, Path.GetFileName(f)), true);
            }
            foreach (string f in new[] { "notes-meta.json", "hotkeys.txt", "state.json" })
                if (File.Exists(Path.Combine(latest, f))) { Directory.CreateDirectory(tmp); File.Copy(Path.Combine(latest, f), Path.Combine(tmp, f), true); }
            Directory.Move(tmp, day);
            string[] days = Directory.GetDirectories(root).Where(d => Regex.IsMatch(Path.GetFileName(d), @"^\d{4}-\d{2}-\d{2}$")).ToArray();
            Array.Sort(days, StringComparer.Ordinal);
            for (int i = 0; i < days.Length - 14; i++) { try { Directory.Delete(days[i], true); } catch { } }
        }

        static void WriteReadme(string dir)
        {
            string f = Path.Combine(dir, "읽어 주세요.txt");
            if (File.Exists(f)) return;
            File.WriteAllText(f,
                "Super Speed Note 메모 백업\r\n\r\n" +
                "- 최신: 지금의 메모·목록·이미지·휴지통 (메모를 고치면 1분 뒤, 앱을 끌 때 맞춰짐)\r\n" +
                "- 날짜별: 날마다 그날의 메모·목록 (최근 14일)\r\n\r\n" +
                "앱을 지웠다가 다시 깔면 처음 켤 때 이 백업에서 메모를 가져올지 물어봐요.\r\n" +
                "앱 설정 › 데이터 › 백업에서 복원 으로도 가져올 수 있어요.\r\n" +
                "notes 폴더의 .html 파일은 브라우저로도 열려요.\r\n", new UTF8Encoding(true));
        }

        // a backup (최신, or a day) into the data folder: the notes as they are now go to backups\before-restore
        // first; pictures a day's copy doesn't hold come from 최신. null when done, else why not.
        public static string RestoreFrom(string from)
        {
            try
            {
                string data = Program.DataDir;
                if (!File.Exists(Path.Combine(from, "state.json"))) return "백업에 메모 목록(state.json)이 없어요";
                if (File.Exists(Path.Combine(data, "state.json"))) DataBackup.Run("before-restore");
                string notes = Path.Combine(data, "notes");
                if (Directory.Exists(notes))                     // notes not in the backup would come back as extra ones
                {
                    var keep = new HashSet<string>(Directory.Exists(Path.Combine(from, "notes")) ? Directory.GetFiles(Path.Combine(from, "notes")).Select(Path.GetFileName) : new string[0], StringComparer.OrdinalIgnoreCase);
                    foreach (string f in Directory.GetFiles(notes, "*.html")) if (!keep.Contains(Path.GetFileName(f))) File.Delete(f);
                }
                foreach (string f in Directory.GetFiles(from, "*", SearchOption.AllDirectories))
                {
                    string rel = f.Substring(from.Length + 1);
                    if (rel.Equals("state.json", StringComparison.OrdinalIgnoreCase) || rel.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase)) continue;
                    string d = Path.Combine(data, rel);
                    Directory.CreateDirectory(Path.GetDirectoryName(d));
                    File.Copy(f, d, true);
                }
                string imgs = Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(from)) ?? "", Latest, "images");
                if (!Directory.Exists(Path.Combine(from, "images")) && Directory.Exists(imgs))
                {
                    Directory.CreateDirectory(Path.Combine(data, "images"));
                    foreach (string f in Directory.GetFiles(imgs)) { string d = Path.Combine(data, "images", Path.GetFileName(f)); if (!File.Exists(d)) File.Copy(f, d); }
                }
                File.Copy(Path.Combine(from, "state.json"), Path.Combine(data, "state.json"), true);   // last
                return null;
            }
            catch (Exception ex) { Program.Log(ex); return ex.Message; }
        }
    }

    // Note files. The app's own copy of each note is notes\<id>.html, exactly as every version before 1.4.4
    // stored it, so going back to an older version always works. 1.4.4 named those files after the notes
    // (<!--ssn:id--> on the first line); they are turned back into notes\<id>.html on the first start.
    // Readable copies named after the notes live in the 메모 folder next to it (see NoteMirror).
    static class NoteFiles
    {
        const string Head = "<!--ssn:", Tail = "-->";
        static readonly Encoding Utf8 = new UTF8Encoding(false);

        public static bool SafeId(string id) { return id != null && id.Length > 0 && id.Length <= 64 && Regex.IsMatch(id, "^[A-Za-z0-9_-]+$"); }
        public static string Header(string id) { return Head + id + Tail + "\n"; }

        // the id in a file's first line, and the note without that line
        public static string Strip(string text, out string id)
        {
            id = null;
            if (text == null || !text.StartsWith(Head, StringComparison.Ordinal)) return text;
            int e = text.IndexOf(Tail, Head.Length, StringComparison.Ordinal);
            if (e < 0 || e - Head.Length > 64) return text;
            string got = text.Substring(Head.Length, e - Head.Length);
            if (!SafeId(got)) return text;
            id = got;
            int from = e + Tail.Length;
            if (from < text.Length && text[from] == '\r') from++;
            if (from < text.Length && text[from] == '\n') from++;
            return text.Substring(from);
        }
        public static string Strip(string text) { string id; return Strip(text, out id); }

        // read even while another program has the file open (an editor, a sync client)
        public static string ReadShared(string path)
        {
            using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var r = new StreamReader(fs, Encoding.UTF8))
                return r.ReadToEnd();
        }

        // a Windows file name that reads as the note's name: the characters Windows refuses become their
        // full-width twins (： ／ ？ ...), at most 80 characters, never a device name like CON or "nul .txt"
        public static string FileBase(string name)
        {
            string s = name ?? "";
            try { s = s.Normalize(NormalizationForm.FormC); } catch (ArgumentException) { }   // Hangul pasted from a Mac: one syllable, not jamo
            s = Regex.Replace(s, "[\\x00-\\x1f\\x7f]+", " ");
            s = Regex.Replace(s, "\\p{Cf}+", "");                       // invisible format characters (a dropped file loses them too)
            var sb = new StringBuilder(s.Length);
            foreach (char c in s)
            {
                int k = "\\/:*?\"<>|~".IndexOf(c);
                sb.Append(k < 0 ? c : "＼／：＊？＂＜＞｜～"[k]);
            }
            s = Regex.Replace(sb.ToString(), "\\s+", " ").Trim();
            if (s.Length > 80) s = s.Substring(0, char.IsHighSurrogate(s[79]) ? 79 : 80);
            s = s.TrimEnd('.', ' ').TrimStart('.', ' ');
            if (s.Length == 0) s = "제목 없음";
            // Windows maps the part before the first dot (trailing spaces dropped) to a device: CON, "CON .txt", "nul . 메모"
            if (Regex.IsMatch(s, "^(CON|PRN|AUX|NUL|COM[0-9¹²³]|LPT[0-9¹²³]) *(\\..*)?$", RegexOptions.IgnoreCase)) s = "_" + s;
            return s;
        }

        sealed class Entry { public string Path, Name, Hid, Text, Owner; public DateTime Time; }

        // every note: id -> contents. Files 1.4.4 named after their notes ("회의록.html", the id on the first line) are
        // written back as notes\<id>.html. Per note the newest copy wins; a file leaves notes\ only once its text is
        // safe: deleted when it is the same text, otherwise into the trash (nothing is ever dropped silently).
        // state: state.json (which ids are notes); unread: ids whose file is there but must not be written over
        // this time (it could not be read) - the page keeps those notes read-only.
        public static Dictionary<string, string> Load(string dir, string trashDir, string state, List<string> unread)
        {
            var notes = new Dictionary<string, string>(StringComparer.Ordinal);
            if (!Directory.Exists(dir)) return notes;
            var listed = new HashSet<string>(StringComparer.Ordinal);
            if (state != null) foreach (Match m in Regex.Matches(state, "\"id\"\\s*:\\s*\"([A-Za-z0-9_-]{1,64})\"")) listed.Add(m.Groups[1].Value);
            var all = new List<Entry>();
            foreach (string f in Directory.GetFiles(dir, "*.html"))
            {
                string n = System.IO.Path.GetFileNameWithoutExtension(f), hid, text;
                try { text = Strip(ReadShared(f), out hid); }
                catch (Exception ex) { Program.Log(ex); if (SafeId(n) && unread != null) unread.Add(n); continue; }
                all.Add(new Entry { Path = f, Name = n, Hid = hid, Text = text, Time = File.GetLastWriteTimeUtc(f) });
            }
            // whose file is it? No id line: the note its name says. Its own id line: the same. Another id: a 1.4.4
            // file named after that note - unless an older version made it a note of its own (it restored a copy from
            // the trash under a new id): its name is a note in state.json that no other file claims, and the note on
            // its first line still has a file of its own.
            foreach (var e in all)
            {
                if (e.Hid == null || e.Hid == e.Name) { e.Owner = SafeId(e.Name) ? e.Name : null; continue; }
                var me = e;
                bool restored = SafeId(e.Name) && listed.Contains(e.Name)
                    && !all.Any(x => x.Hid == me.Name)
                    && all.Any(x => x != me && (x.Hid == me.Hid || (x.Name == me.Hid && x.Hid == null)));
                e.Owner = restored ? e.Name : e.Hid;
            }
            var byPath = new Dictionary<string, Entry>(StringComparer.OrdinalIgnoreCase);
            foreach (var e in all) byPath[e.Path] = e;
            var groups = all.Where(e => e.Owner != null).GroupBy(e => e.Owner, StringComparer.Ordinal).ToList();
            var homes = new HashSet<string>(groups.Select(g => Canon(dir, g.Key)), StringComparer.OrdinalIgnoreCase);
            // a note whose <id>.html holds another note's 1.4.4 file goes second, once that note is safe in its own file
            var safe = new HashSet<string>(StringComparer.Ordinal);
            var later = new List<IGrouping<string, Entry>>();
            foreach (var g in groups)
            {
                Entry at;
                if (byPath.TryGetValue(Canon(dir, g.Key), out at) && at.Owner != g.Key) later.Add(g);
                else Settle(g.Key, g.ToList(), dir, trashDir, notes, safe, homes, unread);
            }
            foreach (var g in later)
            {
                Entry at = byPath[Canon(dir, g.Key)];
                if (at.Owner != null && !safe.Contains(at.Owner))
                {   // that note's text is only in this file: boot this one from memory, write nothing over it
                    notes[g.Key] = g.OrderByDescending(e => e.Time).First().Text;
                    if (unread != null) unread.Add(g.Key);
                    continue;
                }
                Settle(g.Key, g.ToList(), dir, trashDir, notes, safe, homes, unread);
            }
            return notes;
        }

        static string Canon(string dir, string id) { return System.IO.Path.Combine(dir, id + ".html"); }

        // one note's files: the newest text becomes notes\<id>.html; the others leave once that is written
        static void Settle(string id, List<Entry> cands, string dir, string trashDir, Dictionary<string, string> notes,
            HashSet<string> safe, HashSet<string> homes, List<string> unread)
        {
            string own = Canon(dir, id);
            Func<Entry, bool> isOwn = e => string.Equals(e.Path, own, StringComparison.OrdinalIgnoreCase);
            var win = cands.OrderByDescending(e => e.Time).ThenBy(e => isOwn(e) ? 0 : 1).First();
            notes[id] = win.Text;                                    // boots with the newest text whatever happens next
            if (unread != null && unread.Contains(id)) return;      // its <id>.html could not be read: nothing goes over it
            if (cands.Count == 1 && isOwn(win) && win.Hid == null) { safe.Add(id); return; }   // the usual case: nothing to do
            var mine = cands.FirstOrDefault(isOwn);
            try
            {
                if (win == mine) { if (win.Hid != null) try { Saver.WriteAtomic(own, win.Text); } catch (Exception ex) { Program.Log(ex); } }   // its own id line: older versions get the plain note
                else
                {
                    // <id>.html itself is an older, different text: into the trash before it is written over
                    if (mine != null && mine.Text != win.Text && !RetireText(id, mine.Text, "", mine.Time, trashDir)) { if (unread != null) unread.Add(id); return; }
                    Saver.WriteAtomic(own, win.Text);
                }
                safe.Add(id);
            }
            catch (Exception ex) { Program.Log(ex); return; }        // nothing written: every file stays for the next start
            foreach (var e in cands)
            {
                if (isOwn(e) || homes.Contains(e.Path)) continue;    // another note's <id>.html: written over there
                try
                {
                    if (e.Text == win.Text) File.Delete(e.Path);
                    else if (RetireText(id, e.Text, e.Name, e.Time, trashDir)) File.Delete(e.Path);
                }
                catch (Exception ex) { Program.Log(ex); }
            }
        }

        // another copy of a note: into the trash, as a plain note (older versions restore it as it is), where the app
        // lists it and can restore it as a note of its own ("<id>-copy_<time>": not taken for a deletion of <id>)
        static bool RetireText(string id, string text, string title, DateTime timeUtc, string trashDir)
        {
            try
            {
                Directory.CreateDirectory(trashDir);
                string stamp = timeUtc.ToLocalTime().ToString("yyyyMMdd_HHmmss"), target = System.IO.Path.Combine(trashDir, id + "-copy_" + stamp + ".html");
                for (int k = 2; File.Exists(target); k++) target = System.IO.Path.Combine(trashDir, id + "-copy" + k + "_" + stamp + ".html");
                Saver.WriteAtomic(target, text);
                try { File.SetLastWriteTimeUtc(target, timeUtc); } catch { }
                File.WriteAllText(System.IO.Path.ChangeExtension(target, ".json"), "{\"title\":\"" + (title ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}", Utf8);
                return true;
            }
            catch (Exception ex) { Program.Log(ex); return false; }
        }

        // trash items written by 1.4.4 (and copies retired by an early 1.4.5) still start with an id line: plain
        // notes, so an older version that restores one gets just the note
        public static void StripTrash(string trashDir)
        {
            if (!Directory.Exists(trashDir)) return;
            foreach (string f in Directory.GetFiles(trashDir, "*.html"))
            {
                try
                {
                    var buf = new char[Head.Length];
                    using (var fs = new FileStream(f, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                    using (var r = new StreamReader(fs, Encoding.UTF8))
                        if (r.ReadBlock(buf, 0, buf.Length) < buf.Length || new string(buf) != Head) continue;
                    string id, text = Strip(ReadShared(f), out id);
                    if (id == null) continue;
                    DateTime t = File.GetLastWriteTimeUtc(f);
                    Saver.WriteAtomic(f, text);
                    try { File.SetLastWriteTimeUtc(f, t); } catch { }
                }
                catch (Exception ex) { Program.Log(ex); }
            }
        }
    }

    // The 메모 folder: a readable copy of every note, named after it in the app ("회의록.html", the title, else the
    // first line), a whole HTML page that opens in any browser. One way only: the app rewrites these from
    // notes\<id>.html, so an older version (which never looks here) can't be confused by them, and a mistake
    // here can never touch a note. Each copy's first line names its note (<!--ssn:id-->). The app only ever
    // renames, rewrites or deletes a copy it wrote itself and nobody changed since (memo-index.txt next to the
    // folder: name, size, time): a copy you edited, or saved again under another name, is yours and stays.
    sealed class NoteMirror
    {
        static readonly Encoding Utf8 = new UTF8Encoding(false);
        const string Css = "body{font:15px/1.75 \"Malgun Gothic\",sans-serif;max-width:880px;margin:40px auto;padding:0 24px;color:#0f1b33;white-space:pre-wrap}" +
            "table{border-collapse:collapse;white-space:normal}td{border:1px solid #cbd5e6;padding:6px 12px;vertical-align:top}table.hdr tr:first-child td{background:#edf2fd;font-weight:700}" +
            "ul.checklist{list-style:none;padding-left:4px}ul.checklist li::before{content:\"\\2610  \"}ul.checklist li[data-checked=true]::before{content:\"\\2611  \"}" +
            "blockquote{border-left:3px solid #3b6cf6;margin:8px 0;padding:4px 14px;background:#f1f5ff}pre{background:#0d1a36;color:#dbe6ff;padding:12px;border-radius:8px}img{max-width:100%}";
        readonly object gate = new object();
        readonly string dir, notesDir, indexPath;
        readonly Dictionary<string, string> byId = new Dictionary<string, string>(StringComparer.Ordinal);   // id -> file name
        readonly Dictionary<string, string> want = new Dictionary<string, string>(StringComparer.Ordinal);   // id -> name in the app
        readonly Dictionary<string, List<string>> stale = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        Dictionary<string, string> written;     // file name -> "id\tsize\ttime" of the copies this app wrote (null: no index yet)
        bool scanned, indexDirty;

        public NoteMirror(string dir, string notesDir) { this.dir = dir; this.notesDir = notesDir; indexPath = Path.Combine(Path.GetDirectoryName(dir), "memo-index.txt"); }

        static bool Same(string a, string b) { return a != null && b != null && string.Equals(a, b, StringComparison.OrdinalIgnoreCase); }

        // which note a copy belongs to (its first line), or null for a file the user put here
        static string IdOf(string path)
        {
            try
            {
                using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                using (var r = new StreamReader(fs, Encoding.UTF8))
                {
                    string first = r.ReadLine(), id;
                    NoteFiles.Strip(first ?? "", out id);
                    return id;
                }
            }
            catch (Exception ex) { Program.Log(ex); return null; }
        }

        static string Stamp(string id, string path) { var fi = new FileInfo(path); return id + "\t" + fi.Length + "\t" + fi.LastWriteTimeUtc.Ticks; }
        // a copy this app wrote, unchanged since
        bool Mine(string id, string file)
        {
            string p = Path.Combine(dir, file), had;
            if (!File.Exists(p)) return false;
            if (written == null) return IdOf(p) == id;               // no index yet (it was deleted): as before, by the first line
            return written.TryGetValue(file, out had) && had == Stamp(id, p);
        }
        void Wrote(string id, string file) { if (written == null) written = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase); written[file] = Stamp(id, Path.Combine(dir, file)); indexDirty = true; }
        void Forget(string file) { if (written != null && written.Remove(file)) indexDirty = true; }

        void Scan()
        {
            if (scanned) return;
            scanned = true;
            try
            {
                if (File.Exists(indexPath))
                {
                    written = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    foreach (string line in File.ReadAllLines(indexPath, Encoding.UTF8))
                    {
                        int t = line.IndexOf('\t');
                        if (t > 0) written[line.Substring(0, t)] = line.Substring(t + 1);
                    }
                }
            }
            catch (Exception ex) { Program.Log(ex); written = null; }
            if (!Directory.Exists(dir)) return;
            var adopted = new List<KeyValuePair<string, string>>();
            foreach (string f in Directory.GetFiles(dir, "*.html"))
            {
                string id = IdOf(f), file = Path.GetFileName(f);
                if (id == null || !Mine(id, file)) continue;          // the user's file (or a copy they changed): never touched
                if (written == null) adopted.Add(new KeyValuePair<string, string>(id, file));
                if (byId.ContainsKey(id)) AddStale(id, file);          // two copies of one note: one goes
                else byId[id] = file;
            }
            foreach (var kv in adopted) Wrote(kv.Key, kv.Value);       // the index starts with them
            if (written != null) foreach (var k in written.Keys.ToList()) if (!File.Exists(Path.Combine(dir, k))) Forget(k);
        }

        public void SaveIndex()
        {
            lock (gate)
            {
                if (!indexDirty || written == null) return;
                try
                {
                    Saver.WriteAtomic(indexPath, string.Join("\r\n", written.Select(kv => kv.Key + "\t" + kv.Value)));
                    indexDirty = false;
                }
                catch (Exception ex) { Program.Log(ex); }
            }
        }

        string Unique(string id, string name)
        {
            string own, b = NoteFiles.FileBase(name);
            byId.TryGetValue(id, out own);
            for (int k = 1; ; k++)
            {
                string f = (k == 1 ? b : b + " (" + k + ")") + ".html";
                if (Same(f, own)) return f;
                bool taken = byId.Any(kv => kv.Key != id && Same(kv.Value, f)) || File.Exists(Path.Combine(dir, f));
                if (!taken || k > 999) return f;
            }
        }

        void AddStale(string id, string file)
        {
            List<string> l;
            if (!stale.TryGetValue(id, out l)) stale[id] = l = new List<string>();
            if (!l.Any(x => Same(x, file))) l.Add(file);
        }
        void Delete(string id, string file)
        {
            try
            {
                if (Mine(id, file)) File.Delete(Path.Combine(dir, file));
                Forget(file);
            }
            catch (Exception ex) { Program.Log(ex); AddStale(id, file); }
        }
        // copies Windows would not let go earlier: try again while they are still that note's
        void Sweep()
        {
            foreach (var kv in stale.ToList())
            {
                string own; byId.TryGetValue(kv.Key, out own);
                stale.Remove(kv.Key);
                foreach (string f in kv.Value) if (!Same(f, own)) Delete(kv.Key, f);
            }
        }

        string Page(string id, string name, string html)
        {
            html = Regex.Replace(html ?? "", "https://app\\.ssn/img/", "../images/");   // the app's pictures, from next door
            string title = (name ?? "").Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");
            return NoteFiles.Header(id) + "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><title>" + title +
                "</title><style>" + Css + "</style></head><body>" + html + "</body></html>";
        }

        // one note: its name (null = unchanged), its contents (null = read notes\<id>.html if the copy has to be
        // made), or remove = it left the app (trash / deleted). Best effort: a failure is only logged.
        public void Apply(string id, string name, string content, bool remove)
        {
            lock (gate)
            {
                try
                {
                    Scan();
                    Sweep();
                    string cur; byId.TryGetValue(id, out cur);
                    if (cur != null && !Mine(id, cur)) { byId.Remove(id); cur = null; }   // changed by someone since: theirs now
                    if (remove)
                    {
                        if (cur != null) Delete(id, cur);
                        byId.Remove(id); want.Remove(id);
                        return;
                    }
                    if (name != null && name.Trim().Length > 0) want[id] = name;
                    string wanted;
                    if (!want.TryGetValue(id, out wanted)) return;              // its name isn't known yet: it comes with the names
                    string target = Unique(id, wanted), tPath = Path.Combine(dir, target);
                    string curPath = cur != null ? Path.Combine(dir, cur) : null;
                    if (content == null)
                    {
                        string src = Path.Combine(notesDir, id + ".html");
                        bool fresh = curPath != null && File.Exists(src) && File.GetLastWriteTimeUtc(curPath) >= File.GetLastWriteTimeUtc(src);
                        if (fresh && string.Equals(cur, target, StringComparison.Ordinal)) return;   // up to date, right name
                        if (fresh && !Same(cur, target)) { File.Move(curPath, tPath); Forget(cur); Wrote(id, target); byId[id] = target; return; }   // renamed
                        if (!File.Exists(src)) return;
                        content = NoteFiles.Strip(NoteFiles.ReadShared(src));
                    }
                    Directory.CreateDirectory(dir);
                    if (curPath != null && Same(cur, target) && !string.Equals(cur, target, StringComparison.Ordinal))
                    { File.Move(curPath, tPath); Forget(cur); }                    // only the case changed
                    Saver.WriteAtomic(tPath, Page(id, wanted, content));
                    Wrote(id, target);
                    byId[id] = target;
                    if (cur != null && !Same(cur, target)) Delete(id, cur);
                }
                catch (Exception ex) { Program.Log(ex); }
            }
        }

        // start-up: every note's name; copies are made or refreshed, and (prune) the app's copies of notes no longer
        // in it go. Stops early when a note is waiting to be saved (yieldNow): returns the names still to do.
        public Dictionary<string, string> Sync(Dictionary<string, string> names, bool prune, Func<bool> yieldNow)
        {
            if (prune)
                lock (gate)
                {
                    try
                    {
                        Scan();
                        foreach (var id in byId.Keys.ToList())
                            if (!names.ContainsKey(id)) { Delete(id, byId[id]); byId.Remove(id); want.Remove(id); }
                    }
                    catch (Exception ex) { Program.Log(ex); }
                }
            var list = names.ToList();
            for (int i = 0; i < list.Count; i++)
            {
                if (yieldNow()) return list.Skip(i).ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.Ordinal);
                Apply(list[i].Key, list[i].Value, null, false);
            }
            return null;
        }
    }

    // Background writer: coalesces rapid saves per file, writes atomically (tmp + replace). The readable 메모 copies
    // follow once the real files are written.
    sealed class Saver
    {
        const string TrashMark = "\0trash\0", PurgeMark = "\0purge\0";
        readonly object gate = new object();
        readonly Dictionary<string, string> pending = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        readonly Dictionary<string, string> trashTo = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        readonly Dictionary<string, string> trashInfo = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        readonly AutoResetEvent signal = new AutoResetEvent(false);
        static readonly Encoding Utf8 = new UTF8Encoding(false);
        bool busy;
        public Action<string> OnError;
        public NoteMirror Mirror;
        sealed class MirrorOp { public string Name, Content; public bool Remove; }
        readonly Dictionary<string, MirrorOp> mirror = new Dictionary<string, MirrorOp>(StringComparer.Ordinal);
        Dictionary<string, string> mirrorAll;     // start-up: every note's name (still to do)
        bool mirrorPrune;                         // ...and the copies of notes not among them go first

        public Saver()
        {
            var t = new Thread(Loop) { IsBackground = true, Name = "ssn-saver" };
            t.Start();
        }

        public void Write(string path, string content)
        {
            lock (gate) { pending[path] = content; trashTo.Remove(path); trashInfo.Remove(path); }
            signal.Set();
        }

        // move to the trash; info (the note's title, colour, place...) is kept next to it for restoring
        public void Trash(string path, string target, string info)
        {
            lock (gate) { pending[path] = TrashMark; trashTo[path] = target; trashInfo[path] = info ?? ""; }
            signal.Set();
        }

        // delete for good (an empty note: nothing worth keeping)
        public void Purge(string path)
        {
            lock (gate) { pending[path] = PurgeMark; trashTo.Remove(path); trashInfo.Remove(path); }
            signal.Set();
        }

        MirrorOp Op(string id) { MirrorOp op; if (!mirror.TryGetValue(id, out op)) mirror[id] = op = new MirrorOp(); return op; }
        public void MirrorWrite(string id, string content) { lock (gate) { var op = Op(id); op.Content = content; op.Remove = false; } signal.Set(); }
        public void MirrorName(string id, string name) { lock (gate) Op(id).Name = name; signal.Set(); }
        public void MirrorRemove(string id) { lock (gate) { var op = Op(id); op.Remove = true; op.Content = null; } signal.Set(); }
        public void MirrorSync(Dictionary<string, string> names) { lock (gate) { mirrorAll = names; mirrorPrune = true; } signal.Set(); }
        bool NotesWaiting() { lock (gate) return pending.Count > 0; }

        public void Flush(int timeoutMs)
        {
            signal.Set();
            int until = Environment.TickCount + timeoutMs;
            lock (gate)
            {
                while (pending.Count > 0 || busy)
                {
                    int left = until - Environment.TickCount;
                    if (left <= 0) break;
                    Monitor.Wait(gate, left);
                }
            }
        }

        void Loop()
        {
            while (true)
            {
                signal.WaitOne();
                while (true)
                {
                    KeyValuePair<string, string>[] work;
                    KeyValuePair<string, MirrorOp>[] copies;
                    Dictionary<string, string> moves, infos, all;
                    bool prune;
                    lock (gate)
                    {
                        if (pending.Count == 0 && mirror.Count == 0 && mirrorAll == null) { busy = false; Monitor.PulseAll(gate); break; }
                        busy = pending.Count > 0;
                        work = pending.ToArray();
                        copies = mirror.ToArray();
                        all = mirrorAll;
                        prune = mirrorPrune;
                        mirrorPrune = false;
                        moves = new Dictionary<string, string>(trashTo, StringComparer.OrdinalIgnoreCase);
                        infos = new Dictionary<string, string>(trashInfo, StringComparer.OrdinalIgnoreCase);
                        pending.Clear();
                        mirror.Clear();
                        mirrorAll = null;
                        trashTo.Clear();
                        trashInfo.Clear();
                    }
                    foreach (var kv in work)
                    {
                        try
                        {
                            if (kv.Value == TrashMark) MoveToTrash(kv.Key, moves[kv.Key], infos.ContainsKey(kv.Key) ? infos[kv.Key] : "");
                            else if (kv.Value == PurgeMark) { if (File.Exists(kv.Key)) File.Delete(kv.Key); }
                            else WriteAtomic(kv.Key, kv.Value);
                        }
                        catch (Exception ex)
                        {
                            Program.Log(ex);
                            Action<string> cb = OnError;
                            if (cb != null) cb(ex.Message);
                        }
                    }
                    lock (gate) { if (pending.Count == 0) { busy = false; Monitor.PulseAll(gate); } }   // the notes are safe: Flush may go on
                    if (Mirror == null) continue;
                    // the copies are best effort: nothing in them may stop the notes being saved
                    try
                    {
                        // notes leaving first (their names become free); a copy that had to take "name (2)" gets another try
                        foreach (var kv in copies.OrderBy(kv => kv.Value.Remove ? 0 : 1)) Mirror.Apply(kv.Key, kv.Value.Name, kv.Value.Content, kv.Value.Remove);
                        if (all != null)
                        {
                            // every note at start-up: a note typed meanwhile is saved first, then the copies go on
                            var rest = Mirror.Sync(all, prune, NotesWaiting);
                            if (rest != null) lock (gate) { if (mirrorAll == null) mirrorAll = rest; }
                        }
                        else foreach (var kv in copies) if (!kv.Value.Remove && kv.Value.Name != null) Mirror.Apply(kv.Key, null, null, false);
                        Mirror.SaveIndex();
                    }
                    catch (Exception ex) { Program.Log(ex); }
                }
            }
        }

        public static void WriteAtomic(string path, string content)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            string tmp = path + ".tmp";
            File.WriteAllText(tmp, content, Utf8);
            if (!File.Exists(path)) { File.Move(tmp, path); return; }
            // the note index keeps its previous version next to it (state.json.bak)
            string bak = path.EndsWith("state.json", StringComparison.OrdinalIgnoreCase) ? path + ".bak" : null;
            try { File.Replace(tmp, path, bak, true); }
            catch (Exception)
            {
                if (bak != null) { try { File.Copy(path, bak, true); } catch { } }
                File.Copy(tmp, path, true);
                File.Delete(tmp);
            }
        }

        public static void MoveToTrash(string path, string target, string info)
        {
            if (!File.Exists(path)) return;
            Directory.CreateDirectory(Path.GetDirectoryName(target));
            File.Move(path, target);
            if (info.Length > 0) File.WriteAllText(Path.ChangeExtension(target, ".json"), info, Utf8);
        }
    }

    static class Native
    {
        [StructLayout(LayoutKind.Sequential)] public struct MARGINS { public int Left, Right, Top, Bottom; }
        [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
        [StructLayout(LayoutKind.Sequential)] public struct NCCALCSIZE_PARAMS { public RECT r0, r1, r2; public IntPtr pos; }

        [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint vk);
        [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int pid);
        [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
        [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
        [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint cmd);
        [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
        [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr hWnd, uint key, byte alpha, uint flags);
        [DllImport("dwmapi.dll")] public static extern int DwmFlush();
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
        [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
        [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
        [DllImport("user32.dll")] public static extern bool ReleaseCapture();
        [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
        [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, int msg, IntPtr w, IntPtr l);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int RegisterWindowMessage(string name);
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
        [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern int GetSystemMetricsForDpi(int index, uint dpi);
        [DllImport("dwmapi.dll")] public static extern int DwmExtendFrameIntoClientArea(IntPtr hWnd, ref MARGINS m);
        public delegate void WinEventProc(IntPtr hook, uint ev, IntPtr hwnd, int idObject, int idChild, uint thread, uint time);
        [DllImport("user32.dll")] public static extern IntPtr SetWinEventHook(uint evMin, uint evMax, IntPtr hmod, WinEventProc proc, uint pid, uint tid, uint flags);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder name, int max);
        [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);
        [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
        [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hWnd, int attr, ref int value, int size);
        // DWMWA_TRANSITIONS_FORCEDISABLED: show / hide at once, no fade (a window that lends out its page must never fade empty)
        public static void NoFade(IntPtr h, bool off) { int v = off ? 1 : 0; try { DwmSetWindowAttribute(h, 3, ref v, 4); } catch { } }
        // DWMWA_CLOAK: kept off the screen (while it is being made ready) though shown
        public static void Cloak(IntPtr h, bool on) { int v = on ? 1 : 0; try { DwmSetWindowAttribute(h, 13 /*DWMWA_CLOAK*/, ref v, 4); } catch { } }
        [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);
        [DllImport("user32.dll")] public static extern IntPtr MonitorFromPoint(POINT pt, uint flags);
        [DllImport("shcore.dll")] public static extern int GetDpiForMonitor(IntPtr mon, int type, out uint x, out uint y);
        [DllImport("kernel32.dll")] public static extern uint GetCurrentProcessId();
    }

    // The app window's picture, laid over it as a window of its own (see ShowCover). Owned by the app window, so it
    // stays right above it; it never takes the keyboard and clicks go through it to the app window. A shade under
    // fully opaque, so the page doesn't count it as covering it (and stop drawing).
    sealed class StillForm : Form
    {
        public Bitmap Pic;
        readonly IntPtr owner;

        public StillForm(IntPtr owner)
        {
            this.owner = owner;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            AutoScaleMode = AutoScaleMode.None;
            Text = "Super Speed Note";
        }

        protected override bool ShowWithoutActivation { get { return true; } }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.Parent = owner;
                cp.ExStyle |= 0x80 /*TOOLWINDOW*/ | 0x08000000 /*NOACTIVATE*/ | 0x80000 /*LAYERED*/ | 0x20 /*TRANSPARENT: clicks pass*/;
                return cp;
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            Native.SetLayeredWindowAttributes(Handle, 0, 254, 2 /*LWA_ALPHA*/);
            Native.NoFade(Handle, true);
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == 0x02E0) { m.Result = IntPtr.Zero; return; }   // WM_DPICHANGED: sized by the app window
            if (m.Msg == 0x0021) { m.Result = (IntPtr)3; return; }     // WM_MOUSEACTIVATE: MA_NOACTIVATE
            base.WndProc(ref m);
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            if (Pic == null) { e.Graphics.Clear(Color.Black); return; }
            e.Graphics.CompositingMode = CompositingMode.SourceCopy;
            try { e.Graphics.DrawImage(Pic, new Rectangle(0, 0, Pic.Width, Pic.Height)); }
            catch (ArgumentException) { e.Graphics.Clear(Color.Black); }   // a picture already let go
        }

        protected override void OnPaint(PaintEventArgs e) { }
    }

    // The "find & paste" window. It has no page of its own: the app's WebView is moved into it while open.
    sealed class PopForm : Form
    {
        public bool Attached;                     // false while the engine is still starting (from standby)

        public PopForm()
        {
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            AutoScaleMode = AutoScaleMode.None;
            TopMost = true;
            DoubleBuffered = true;
            SetStyle(ControlStyles.ResizeRedraw, true);   // its placeholder text stays centred when the size changes
            Text = "Super Speed Note · 찾아 붙여넣기";
        }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ClassStyle |= 0x20000;         // CS_DROPSHADOW
                cp.ExStyle |= 0x80;               // WS_EX_TOOLWINDOW: no taskbar button, not in Alt+Tab
                return cp;
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            int round = 2;                        // Windows 11: rounded corners (ignored on 10)
            try { Native.DwmSetWindowAttribute(Handle, 33 /*DWMWA_WINDOW_CORNER_PREFERENCE*/, ref round, 4); } catch { }
            Native.NoFade(Handle, true);
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == 0x02E0) { m.Result = IntPtr.Zero; return; }   // WM_DPICHANGED: sized by the app for each monitor
            base.WndProc(ref m);
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            e.Graphics.Clear(BackColor);
            if (Attached) return;
            float scale = DeviceDpi / 96f;
            bool dark = BackColor.GetBrightness() < 0.5f;
            using (var f = new Font("Malgun Gothic", 14f * scale, GraphicsUnit.Pixel))
            using (var b = new SolidBrush(dark ? Color.FromArgb(0x8F, 0x9B, 0xB8) : Color.FromArgb(0x8B, 0x96, 0xAD)))
            {
                e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
                var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                e.Graphics.DrawString("찾아 붙여넣기 준비 중…", f, b, ClientRectangle, sf);
            }
        }
    }

    // The quick memo: a small always-on-top window in the screen corner. Like the search window it borrows
    // the app's WebView. Frameless but resizable (the page draws its own bar and edges), with the DWM shadow.
    sealed class QuickForm : Form
    {
        public bool Attached;                     // false while the engine is still starting (from standby)
        public float Scale96 = 1f;                // DPI scale it was placed with (its size is saved unscaled)
        public Rectangle Want;                    // where PlaceQuick put it (the chosen corner, sized for that screen)
        public bool Placing;                      // being placed: a DPI change must not move it out of the corner

        public QuickForm()
        {
            FormBorderStyle = FormBorderStyle.Sizable;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            AutoScaleMode = AutoScaleMode.None;
            MinimumSize = new Size(260, 180);
            TopMost = true;
            DoubleBuffered = true;
            SetStyle(ControlStyles.ResizeRedraw, true);   // its placeholder text stays centred when the size changes
            Text = "Super Speed Note · 빠른 메모";
        }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= 0x80;               // WS_EX_TOOLWINDOW: no taskbar button, not in Alt+Tab
                return cp;
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            var m = new Native.MARGINS { Left = 1, Right = 1, Top = 1, Bottom = 1 };   // keeps the drop shadow
            try { Native.DwmExtendFrameIntoClientArea(Handle, ref m); } catch { }
            int round = 2;
            try { Native.DwmSetWindowAttribute(Handle, 33 /*DWMWA_WINDOW_CORNER_PREFERENCE*/, ref round, 4); } catch { }
            Native.NoFade(Handle, true);
            Native.SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x0027 /*FRAMECHANGED|NOMOVE|NOSIZE|NOZORDER*/ | 0x0010);
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == 0x0083) { m.Result = IntPtr.Zero; return; }   // WM_NCCALCSIZE: the whole window is client area
            if (m.Msg == 0x02E0)                                        // WM_DPICHANGED: dragged to another screen - take the suggested size
            {
                var r = (Native.RECT)Marshal.PtrToStructure(m.LParam, typeof(Native.RECT));
                if (Placing) r = new Native.RECT { Left = Want.Left, Top = Want.Top, Right = Want.Right, Bottom = Want.Bottom };   // opening: stay in the corner
                Native.SetWindowPos(Handle, IntPtr.Zero, r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top, 0x0014 /*NOZORDER|NOACTIVATE*/);
                Scale96 = (m.WParam.ToInt32() & 0xFFFF) / 96f;
                m.Result = IntPtr.Zero;
                return;
            }
            base.WndProc(ref m);
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            e.Graphics.Clear(BackColor);
            if (Attached) return;
            float scale = DeviceDpi / 96f;
            bool dark = BackColor.GetBrightness() < 0.5f;
            using (var f = new Font("Malgun Gothic", 13f * scale, GraphicsUnit.Pixel))
            using (var b = new SolidBrush(dark ? Color.FromArgb(0x8F, 0x9B, 0xB8) : Color.FromArgb(0x8B, 0x96, 0xAD)))
            {
                e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
                var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                e.Graphics.DrawString("빠른 메모 준비 중…", f, b, ClientRectangle, sf);
            }
        }
    }
}
