// Super Speed Note - native shell.
// A frameless WinForms window that hosts one WebView2 page (src/ui/index.html, embedded),
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
[assembly: AssemblyDescription("Super Speed Note - ultra light note app")]
[assembly: AssemblyCompany("Super Speed Note")]
[assembly: AssemblyCopyright("Super Speed Note")]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]

namespace SuperSpeedNote
{
    static class Program
    {
        public const string Version = "1.2.0";
        public const string WebView2Version = "1.0.4258.31";
        public static string DataDir, LocalDir;
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
            bool tray = false, standby = false, dev = false, quit = false;
            string ui = null;
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--tray") tray = true;
                else if (args[i] == "--standby") standby = true;    // hotkeys only, no window, no web engine
                else if (args[i] == "--quit") quit = true;          // ask a running copy to save and exit (used by build/install)
                else if (args[i] == "--dev") dev = true;
                else if (args[i] == "--ui" && i + 1 < args.Length) { ui = args[++i]; dev = true; }
            }

            bool created;
            mutex = new Mutex(true, "SuperSpeedNote.SingleInstance." + Environment.UserName, out created);
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
            DataDir = Directory.Exists(portable) ? portable
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SuperSpeedNote");
            LocalDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SuperSpeedNote");
            Directory.CreateDirectory(DataDir);
            Directory.CreateDirectory(LocalDir);
            BackupOnVersionChange();

            AppDomain.CurrentDomain.AssemblyResolve += ResolveEmbedded;
            Application.ThreadException += (s, e) => Log(e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (s, e) => Log(e.ExceptionObject as Exception);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Run(tray, standby, dev, ui);
            GC.KeepAlive(mutex);
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
        // "find & paste" over another program: a small window the WebView moves into while it is open
        PopForm pop;
        bool popWanted, popShown;
        Color popBg = Color.White;
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
            MinimumSize = new Size(460, 340);
            appIcon = LoadIcon(0);
            Icon = appIcon;
            LoadBounds();
            saver.OnError = msg => { try { BeginInvoke(new Action(() => Post("toast", "저장 실패: " + msg))); } catch { } };
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
            RepairStartupPath();
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

        // Active -> standby: close the web engine (frees almost all memory) but keep hotkeys registered.
        void EnterStandby()
        {
            SaveBounds();
            if (Visible) Hide();
            DetachPop();
            saver.Flush(3000);
            webReady = false;
            webStarted = false;
            try { if (ctl != null) ctl.Close(); } catch { }
            ctl = null; wv = null; env = null; envTask = null; bootTask = null;
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
            // Splash shown for the few hundred ms before the page paints.
            Rectangle rc = ClientRectangle;
            if (rc.Width < 2 || rc.Height < 2) return;
            using (var br = new LinearGradientBrush(rc, bg, Color.FromArgb(0x16, 0x30, 0x6A), 90f))
                e.Graphics.FillRectangle(br, rc);
            if (webReady) return;
            float scale = DeviceDpi / 96f;
            using (var f = new Font("Segoe UI Black", 15f * scale, FontStyle.Italic, GraphicsUnit.Pixel))
            using (var b = new SolidBrush(Color.FromArgb(200, 255, 255, 255)))
            {
                e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;
                var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                e.Graphics.DrawString("SUPER SPEED NOTE", f, b, rc, sf);
            }
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            if (ctl != null && !popShown && WindowState != FormWindowState.Minimized)
                ctl.Bounds = new Rectangle(Point.Empty, ClientSize);
            UpdateWebVisibility();
            bool max = WindowState == FormWindowState.Maximized;
            if (max != maxState) { maxState = max; Post("winState", max ? "1" : "0"); }
        }

        protected override void OnVisibleChanged(EventArgs e)
        {
            base.OnVisibleChanged(e);
            UpdateWebVisibility();
        }

        protected override void OnActivated(EventArgs e)
        {
            base.OnActivated(e);
            if (ctl != null && !popShown) { try { ctl.MoveFocus(CoreWebView2MoveFocusReason.Programmatic); } catch { } }
        }

        protected override void OnDeactivate(EventArgs e)
        {
            base.OnDeactivate(e);
            lastDeactivate = Environment.TickCount;
        }

        void UpdateWebVisibility()
        {
            if (ctl == null || wv == null) return;
            bool vis = popShown || (Visible && WindowState != FormWindowState.Minimized);
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
            if (hit != HTCAPTION && WindowState == FormWindowState.Maximized) return;
            Native.POINT p;
            Native.GetCursorPos(out p);
            Native.ReleaseCapture();
            Native.PostMessage(Handle, WM_NCLBUTTONDOWN, (IntPtr)hit, (IntPtr)((p.Y << 16) | (p.X & 0xFFFF)));
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

        // ---------- show / hide / focus ----------
        void ShowApp()
        {
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
                if (popWanted || popShown) { Post("palette", "close"); GoBack(); DetachPop(); return; }   // pressed again
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
                    Post("palette", "close"); GoBack(); DetachPop();
                };
            }
            PlacePop();
            popWanted = true;
            pop.Attached = false;
            pop.Invalidate();
            if (!pop.Visible) pop.Show();
            ForceForeground(pop.Handle);
            if (webReady) Post("palette", "pop");
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
                if (popShown) Post("palette", "close"); else { pendingPalette = null; DetachPop(); }
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
            popShown = true;
            pop.Attached = true;
            try
            {
                ctl.DefaultBackgroundColor = popBg;
                ctl.ParentWindow = pop.Handle;
                ctl.Bounds = new Rectangle(Point.Empty, pop.ClientSize);
                ctl.IsVisible = true;
                wv.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Normal;
            }
            catch (Exception ex) { Program.Log(ex); }
            if (!pop.Visible) pop.Show();
            ForceForeground(pop.Handle);
            try { ctl.MoveFocus(CoreWebView2MoveFocusReason.Programmatic); } catch { }
            Post("palette", "focus");
        }

        // back into the main window (still hidden / where it was)
        void DetachPop()
        {
            popWanted = false;
            if (popShown)
            {
                popShown = false;
                if (ctl != null)
                {
                    try
                    {
                        ctl.ParentWindow = Handle;
                        ctl.DefaultBackgroundColor = bg;
                        if (WindowState != FormWindowState.Minimized) ctl.Bounds = new Rectangle(Point.Empty, ClientSize);
                    }
                    catch (Exception ex) { Program.Log(ex); }
                }
                UpdateWebVisibility();
            }
            if (pop != null) { pop.Attached = false; if (pop.Visible) pop.Hide(); }
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
            if (target == IntPtr.Zero) { Post("toast", "복사했어요 · 돌아갈 창이 없어 붙여넣기는 하지 않았어요"); return; }
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
            Task.Run(() => { Thread.Sleep(8000); DataBackup.Run(null); });
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
            tray.ShowBalloonTip(2500, "Super Speed Note", "트레이에서 계속 실행 중입니다. 단축키로 바로 불러오세요.", ToolTipIcon.None);
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
                wv.NavigationStarting += (o, e) => { if (!e.Uri.StartsWith(Origin, StringComparison.OrdinalIgnoreCase)) e.Cancel = true; };
                wv.PermissionRequested += (o, e) =>
                {
                    if (e.PermissionKind == CoreWebView2PermissionKind.ClipboardRead) e.State = CoreWebView2PermissionState.Allow;
                };
                wv.ProcessFailed += (o, e) => { if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited) Program.Log(new Exception("WebView2 browser process exited")); };

                wv.Navigate(Origin + "index.html");   // notes arrive as boot.js, requested by the page itself
                UpdateWebVisibility();
            }
            catch (Exception ex)
            {
                Program.Log(ex);
                MessageBox.Show(this,
                    "화면 엔진(Microsoft Edge WebView2 런타임)을 시작하지 못했습니다.\n\n" +
                    "https://go.microsoft.com/fwlink/p/?LinkId=2124703 에서 런타임을 설치한 뒤 다시 실행해 주세요.\n\n" + ex.Message,
                    "Super Speed Note", MessageBoxButtons.OK, MessageBoxIcon.Error);
                finished = true;
                Application.Exit();
            }
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
            try
            {
                if (Directory.Exists(NotesDir))
                    foreach (string f in Directory.GetFiles(NotesDir, "*.html"))
                    {
                        string id = Path.GetFileNameWithoutExtension(f);
                        if (!SafeId(id)) continue;
                        sb.Append(Json(id)).Append(':').Append(Json(File.ReadAllText(f, Encoding.UTF8))).Append(',');
                    }
            }
            catch (Exception ex) { Program.Log(ex); }
            sb.Append("},autostart:").Append(Json(GetStartupMode()));
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
        }

        void Dispatch(string cmd, string a)
        {
            switch (cmd)
            {
                case "ready":
                    webReady = true;
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
                    if (pendingNew) { Post("new"); pendingNew = false; }
                    if (pendingPalette != null) { if (pendingPalette != "pop" || popWanted) Post("palette", pendingPalette); pendingPalette = null; }
                    break;
                case "saveNote": { string id = Cut(ref a); if (SafeId(id)) saver.Write(Path.Combine(NotesDir, id + ".html"), a); break; }
                case "delNote":
                    if (SafeId(a))
                        saver.Trash(Path.Combine(NotesDir, a + ".html"),
                            Path.Combine(Program.DataDir, "trash", a + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".html"));
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
                    if (paletteOpen) { if (popWanted && !popShown) AttachPop(); }
                    else if (popWanted || popShown) DetachPop();
                    break;
                case "back": GoBack(); break;                    // Esc in the search window: back to where you were
                case "show": ShowApp(); break;                   // search window -> "open this note"
                case "drag": BeginDrag(HTCAPTION); break;
                case "resize": BeginDrag(EdgeHit(a)); break;
                // native ShowWindow: WinForms' WindowState setter re-adds a frame we removed and grows the window
                case "min": Native.ShowWindow(Handle, 6 /*SW_MINIMIZE*/); break;
                case "max": Native.ShowWindow(Handle, Native.IsZoomed(Handle) ? 9 /*SW_RESTORE*/ : 3 /*SW_MAXIMIZE*/); break;
                case "close": if (closeToTray) { HideApp(); ShowTrayHintOnce(); } else Quit(false); break;
                case "quit": Quit(false); break;
                case "top": TopMost = a == "1"; break;
                case "closeToTray": closeToTray = a == "1"; break;
                case "autostart":
                    startupMode = a == "1" ? "tray" : a == "0" ? "off" : a;
                    SetStartupMode(startupMode);
                    break;
                case "theme":
                    bg = a == "dark" ? Color.FromArgb(0x05, 0x0C, 0x1F) : Color.FromArgb(0x08, 0x15, 0x36);
                    popBg = a == "dark" ? Color.FromArgb(0x12, 0x1E, 0x3B) : Color.White;   // = --menu
                    BackColor = bg;
                    if (pop != null) pop.BackColor = popBg;
                    if (ctl != null) ctl.DefaultBackgroundColor = popShown ? popBg : bg;
                    break;
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
                case "backup": DataBackup.Run("manual-" + DateTime.Now.ToString("yyyyMMdd-HHmmss")); Post("toast", "백업 완료 · backups 폴더"); break;
                case "flushed": AfterFlush(quitSeq); break;
            }
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

        void FinishQuit()
        {
            if (finished) return;
            finished = true;
            SaveBounds();
            saver.Flush(4000);
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
        void Export(string name, string content)
        {
            string ext = Path.GetExtension(name).ToLowerInvariant();
            using (var dlg = new SaveFileDialog())
            {
                dlg.FileName = SafeFileName(name);
                dlg.Filter = ext == ".html" ? "HTML 문서 (*.html)|*.html" : "텍스트 파일 (*.txt)|*.txt";
                dlg.InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                if (ext == ".html")
                {
                    // inline pasted images so the file stands alone
                    content = Regex.Replace(content, "https://app\\.ssn/img/([A-Za-z0-9_.-]+)", m =>
                    {
                        string f = Path.Combine(ImagesDir, m.Groups[1].Value);
                        return File.Exists(f) ? "data:" + Mime(f) + ";base64," + Convert.ToBase64String(File.ReadAllBytes(f)) : m.Value;
                    });
                }
                File.WriteAllText(dlg.FileName, content, new UTF8Encoding(ext != ".html"));
                Post("toast", "내보내기 완료 · " + Path.GetFileName(dlg.FileName));
            }
        }

        // Windows start-up: "off", "standby" (hotkeys only, ~no memory) or "tray" (engine preloaded, instant)
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        static string GetStartupMode()
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey))
                {
                    string v = k == null ? null : k.GetValue("SuperSpeedNote") as string;
                    if (v == null) return "off";
                    return v.Contains("--standby") ? "standby" : "tray";
                }
            }
            catch { return "off"; }
        }

        static void SetStartupMode(string mode)
        {
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (mode == "standby" || mode == "tray")
                    k.SetValue("SuperSpeedNote", "\"" + Application.ExecutablePath + "\" --" + mode);
                else k.DeleteValue("SuperSpeedNote", false);
            }
        }

        // keep the start-up entry pointing at this exe if the registered one was moved or deleted
        static void RepairStartupPath()
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey))
                {
                    string v = k == null ? null : k.GetValue("SuperSpeedNote") as string;
                    if (v == null) return;
                    int q = v.IndexOf('"', 1);
                    string exe = v.StartsWith("\"") && q > 0 ? v.Substring(1, q - 1) : v;
                    if (!File.Exists(exe)) SetStartupMode(v.Contains("--standby") ? "standby" : "tray");
                }
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        static void OpenUrl(string u)
        {
            Uri uri;
            if (Uri.TryCreate(u, UriKind.Absolute, out uri) && (uri.Scheme == "http" || uri.Scheme == "https" || uri.Scheme == "mailto"))
                Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
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
            try
            {
                string data = Program.DataDir;
                string state = Path.Combine(data, "state.json");
                if (!File.Exists(state)) return;
                string root = Path.Combine(data, "backups");
                string dir = Path.Combine(root, label ?? DateTime.Now.ToString("yyyy-MM-dd"));
                if (Directory.Exists(dir))
                {
                    if (label == null) return;
                    dir += "_" + DateTime.Now.ToString("HHmmss");
                }
                Directory.CreateDirectory(Path.Combine(dir, "notes"));
                File.Copy(state, Path.Combine(dir, "state.json"), true);
                string notes = Path.Combine(data, "notes");
                if (Directory.Exists(notes))
                    foreach (string f in Directory.GetFiles(notes, "*.html"))
                        try { File.Copy(f, Path.Combine(dir, "notes", Path.GetFileName(f)), true); } catch { }
                string[] daily = Directory.GetDirectories(root).Where(d => Regex.IsMatch(Path.GetFileName(d), @"^\d{4}-\d{2}-\d{2}$")).ToArray();
                Array.Sort(daily, StringComparer.Ordinal);
                for (int i = 0; i < daily.Length - 14; i++) { try { Directory.Delete(daily[i], true); } catch { } }
            }
            catch (Exception ex) { Program.Log(ex); }
        }
    }

    // Background writer: coalesces rapid saves per file, writes atomically (tmp + replace).
    sealed class Saver
    {
        const string TrashMark = "\0trash\0";
        readonly object gate = new object();
        readonly Dictionary<string, string> pending = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        readonly Dictionary<string, string> trashTo = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        readonly AutoResetEvent signal = new AutoResetEvent(false);
        static readonly Encoding Utf8 = new UTF8Encoding(false);
        bool busy;
        public Action<string> OnError;

        public Saver()
        {
            var t = new Thread(Loop) { IsBackground = true, Name = "ssn-saver" };
            t.Start();
        }

        public void Write(string path, string content)
        {
            lock (gate) { pending[path] = content; trashTo.Remove(path); }
            signal.Set();
        }

        public void Trash(string path, string target)
        {
            lock (gate) { pending[path] = TrashMark; trashTo[path] = target; }
            signal.Set();
        }

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
                    Dictionary<string, string> moves;
                    lock (gate)
                    {
                        if (pending.Count == 0) { busy = false; Monitor.PulseAll(gate); break; }
                        busy = true;
                        work = pending.ToArray();
                        moves = new Dictionary<string, string>(trashTo, StringComparer.OrdinalIgnoreCase);
                        pending.Clear();
                        trashTo.Clear();
                    }
                    foreach (var kv in work)
                    {
                        try
                        {
                            if (kv.Value == TrashMark) MoveToTrash(kv.Key, moves[kv.Key]);
                            else WriteAtomic(kv.Key, kv.Value);
                        }
                        catch (Exception ex)
                        {
                            Program.Log(ex);
                            Action<string> cb = OnError;
                            if (cb != null) cb(ex.Message);
                        }
                    }
                }
            }
        }

        static void WriteAtomic(string path, string content)
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

        static void MoveToTrash(string path, string target)
        {
            if (!File.Exists(path)) return;
            Directory.CreateDirectory(Path.GetDirectoryName(target));
            File.Move(path, target);
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
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
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
        [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);
        [DllImport("user32.dll")] public static extern IntPtr MonitorFromPoint(POINT pt, uint flags);
        [DllImport("shcore.dll")] public static extern int GetDpiForMonitor(IntPtr mon, int type, out uint x, out uint y);
        [DllImport("kernel32.dll")] public static extern uint GetCurrentProcessId();
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
}
