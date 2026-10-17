// Generates assets/app.ico for Super Speed Note.
// Navy -> white vertical gradient tile with an "S" (white fading into ink) - at every size, the Store logos too.
// Build: csc /reference:System.Drawing.dll tools\IconGen.cs   Run: IconGen.exe out.ico [pngDir]
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

static class IconGen
{
    static readonly Color NavyDeep = Color.FromArgb(0x07, 0x14, 0x36);
    static readonly Color Navy = Color.FromArgb(0x10, 0x2A, 0x6B);
    static readonly Color Blue = Color.FromArgb(0x3D, 0x6B, 0xD8);
    static readonly Color Sky = Color.FromArgb(0x8F, 0xAE, 0xEC);
    static readonly Color Mist = Color.FromArgb(0xDD, 0xE7, 0xFA);
    static readonly Color White = Color.FromArgb(0xFF, 0xFF, 0xFF);
    static readonly Color Ink = Color.FromArgb(0x0B, 0x1D, 0x4A);

    static int Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--store") return StoreAssets(args[1]);
        if (args.Length == 2 && args[0] == "--boxart")      // 1:1 logo for the Store listing page (1080 x 1080):
        {                                                   // the app's "S" icon (as in Explorer / the taskbar), big
            using (Bitmap icon = Render(1080)) icon.Save(args[1], ImageFormat.Png);
            Console.WriteLine("box art -> " + args[1]);
            return 0;
        }
        if (args.Length < 1) { Console.WriteLine("usage: IconGen out.ico [pngDir] | IconGen --store outDir"); return 1; }
        string outIco = args[0];
        string pngDir = args.Length > 1 ? args[1] : null;
        int[] sizes = { 16, 20, 24, 32, 40, 48, 64, 96, 128, 256 };
        var images = new List<byte[]>();
        foreach (int s in sizes)
        {
            using (Bitmap bmp = Render(s))
            {
                images.Add(s >= 256 ? Png(bmp) : Dib(bmp));
                if (pngDir != null && (s == 16 || s == 32 || s == 48 || s == 256))
                    bmp.Save(Path.Combine(pngDir, "icon_" + s + ".png"), ImageFormat.Png);
            }
        }
        if (pngDir != null)
        {
            using (Bitmap big = Render(512)) big.Save(Path.Combine(pngDir, "logo_512.png"), ImageFormat.Png);
            // magnified contact sheet of the small sizes, for eyeballing legibility
            int[] prev = { 16, 24, 32, 48, 64 };
            using (var sheet = new Bitmap(prev.Length * 260, 260))
            using (Graphics g = Graphics.FromImage(sheet))
            {
                g.Clear(Color.FromArgb(0xF3, 0xF3, 0xF3));
                g.InterpolationMode = InterpolationMode.NearestNeighbor;
                g.PixelOffsetMode = PixelOffsetMode.Half;
                for (int i = 0; i < prev.Length; i++)
                    using (Bitmap b = Render(prev[i])) g.DrawImage(b, new Rectangle(i * 260 + 2, 2, 256, 256));
                sheet.Save(Path.Combine(pngDir, "preview_small.png"), ImageFormat.Png);
            }
        }

        using (var fs = File.Create(outIco))
        using (var w = new BinaryWriter(fs))
        {
            w.Write((short)0); w.Write((short)1); w.Write((short)sizes.Length);
            int offset = 6 + 16 * sizes.Length;
            for (int i = 0; i < sizes.Length; i++)
            {
                int s = sizes[i];
                w.Write((byte)(s >= 256 ? 0 : s)); w.Write((byte)(s >= 256 ? 0 : s));
                w.Write((byte)0); w.Write((byte)0);
                w.Write((short)1); w.Write((short)32);
                w.Write(images[i].Length); w.Write(offset);
                offset += images[i].Length;
            }
            foreach (byte[] img in images) w.Write(img);
        }
        Console.WriteLine("icon -> " + outIco);
        return 0;
    }

    // Logos a Microsoft Store (MSIX) package needs, at the scales Windows picks from (via resources.pri)
    static int StoreAssets(string dir)
    {
        Directory.CreateDirectory(dir);
        Action<string, int> square = (name, s) => { using (Bitmap b = Render(s)) b.Save(Path.Combine(dir, name), ImageFormat.Png); };
        foreach (int sc in new[] { 100, 125, 150, 200, 400 })
        {
            square("Square44x44Logo.scale-" + sc + ".png", 44 * sc / 100);
            square("Square150x150Logo.scale-" + sc + ".png", 150 * sc / 100);
            square("StoreLogo.scale-" + sc + ".png", 50 * sc / 100);
            using (Bitmap w = Wide(310 * sc / 100, 150 * sc / 100)) w.Save(Path.Combine(dir, "Wide310x150Logo.scale-" + sc + ".png"), ImageFormat.Png);
        }
        // taskbar / Start list sizes (unplated = drawn on its own tile, no accent colour behind)
        foreach (int t in new[] { 16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256 })
        {
            square("Square44x44Logo.targetsize-" + t + ".png", t);
            square("Square44x44Logo.targetsize-" + t + "_altform-unplated.png", t);
            square("Square44x44Logo.targetsize-" + t + "_altform-lightunplated.png", t);
        }
        Console.WriteLine("store assets -> " + dir);
        return 0;
    }

    // wide tile: the icon in the middle of the navy gradient (Windows writes the app's name on the tile itself)
    static Bitmap Wide(int w, int h)
    {
        var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp))
        {
            using (var br = new LinearGradientBrush(new Rectangle(0, 0, w, h), NavyDeep, Navy, 90f)) g.FillRectangle(br, 0, 0, w, h);
            int s = (int)(h * 0.62f);
            using (Bitmap icon = Render(s)) g.DrawImage(icon, (w - s) / 2, (h - s) / 2, s, s);
        }
        return bmp;
    }

    static Bitmap Render(int s)
    {
        var bmp = new Bitmap(s, s, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.CompositingQuality = CompositingQuality.HighQuality;
            g.Clear(Color.Transparent);

            bool small = s < 64;
            float m = small ? Math.Max(0.5f, s * 0.03f) : s * 0.045f;
            var tile = new RectangleF(m, m, s - 2 * m, s - 2 * m);
            float radius = tile.Width * (small ? 0.24f : 0.22f);

            using (GraphicsPath tilePath = RoundRect(tile, radius))
            {
                // navy -> white gradient stretched to the very bottom edge: blue keeps fading through sky and mist,
                // and only the last strip turns white (no flat white band under "SPEED")
                using (var br = new LinearGradientBrush(new PointF(0, tile.Top - 1), new PointF(0, tile.Bottom + 1), NavyDeep, White))
                {
                    var cb = new ColorBlend();
                    cb.Colors = new[] { NavyDeep, Navy, Blue, Sky, Mist, White };
                    cb.Positions = small ? new[] { 0f, 0.2f, 0.4f, 0.6f, 0.82f, 1f } : new[] { 0f, 0.24f, 0.5f, 0.74f, 0.94f, 1f };
                    br.InterpolationColors = cb;
                    g.FillPath(br, tilePath);
                }
                g.SetClip(tilePath);

                DrawMonogram(g, tile);

                g.ResetClip();
                // hairline edge so the white half never melts into light taskbars
                using (var pen = new Pen(Color.FromArgb(small ? 70 : 60, 11, 29, 74), Math.Max(1f, s / 128f)))
                    g.DrawPath(pen, tilePath);
            }
        }
        return bmp;
    }

    // The "S": white at the top fading into ink at the bottom (against the navy -> white tile), with a soft shadow
    // so it stands off the tile where the two meet
    static void DrawMonogram(Graphics g, RectangleF t)
    {
        var box = new RectangleF(t.Left + t.Width * 0.17f, t.Top + t.Height * 0.12f, t.Width * 0.66f, t.Height * 0.76f);
        using (GraphicsPath p = TextPath("S", box))
        {
            using (var sh = (GraphicsPath)p.Clone())
            {
                var mx = new Matrix(); mx.Translate(t.Width * 0.012f, t.Height * 0.02f); sh.Transform(mx);
                using (var shb = new SolidBrush(Color.FromArgb(70, 0, 6, 26))) g.FillPath(shb, sh);
            }
            RectangleF b = p.GetBounds();
            using (var br = new LinearGradientBrush(new PointF(0, b.Top - 1), new PointF(0, b.Bottom + 1), White, Ink))
            {
                var cb = new ColorBlend();
                cb.Colors = new[] { White, White, Ink, Ink };
                cb.Positions = new[] { 0f, 0.36f, 0.64f, 1f };
                br.InterpolationColors = cb;
                g.FillPath(br, p);
            }
        }
    }

    // Text as a path, scaled to fit the box (keeps aspect), centred.
    static GraphicsPath TextPath(string text, RectangleF box)
    {
        var p = new GraphicsPath();
        FontFamily ff;
        try { ff = new FontFamily("Segoe UI Black"); } catch { ff = new FontFamily("Arial Black"); }
        using (var sf = new StringFormat(StringFormat.GenericTypographic))
            p.AddString(text, ff, (int)(FontStyle.Italic), 100f, new PointF(0, 0), sf);
        RectangleF b = p.GetBounds();
        float sc = Math.Min(box.Width / b.Width, box.Height / b.Height);
        var mx = new Matrix();
        mx.Translate(box.Left + (box.Width - b.Width * sc) / 2f, box.Top + (box.Height - b.Height * sc) / 2f);
        mx.Scale(sc, sc);
        mx.Translate(-b.Left, -b.Top);
        p.Transform(mx);
        return p;
    }

    static GraphicsPath RoundRect(RectangleF r, float rad)
    {
        float d = Math.Min(rad * 2, Math.Min(r.Width, r.Height));
        var p = new GraphicsPath();
        p.AddArc(r.Left, r.Top, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Top, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.Left, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    static byte[] Png(Bitmap bmp)
    {
        using (var ms = new MemoryStream()) { bmp.Save(ms, ImageFormat.Png); return ms.ToArray(); }
    }

    // Classic 32-bit DIB icon entry (BGRA bottom-up + empty AND mask) - most compatible format for small sizes.
    static byte[] Dib(Bitmap bmp)
    {
        int s = bmp.Width;
        int maskStride = ((s + 31) / 32) * 4;
        using (var ms = new MemoryStream())
        using (var w = new BinaryWriter(ms))
        {
            w.Write(40); w.Write(s); w.Write(s * 2); w.Write((short)1); w.Write((short)32);
            w.Write(0); w.Write(s * s * 4 + maskStride * s); w.Write(0); w.Write(0); w.Write(0); w.Write(0);
            BitmapData bd = bmp.LockBits(new Rectangle(0, 0, s, s), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var row = new byte[s * 4];
            for (int y = s - 1; y >= 0; y--)
            {
                Marshal.Copy(new IntPtr(bd.Scan0.ToInt64() + (long)y * bd.Stride), row, 0, row.Length);
                w.Write(row);
            }
            bmp.UnlockBits(bd);
            w.Write(new byte[maskStride * s]);
            return ms.ToArray();
        }
    }
}
