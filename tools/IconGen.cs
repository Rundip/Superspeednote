// Generates assets/app.ico for Super Speed Note.
// Navy -> white vertical gradient tile, "SUPER" (white, on navy) over "SPEED" (navy, on white).
// Small sizes use a split-colour "S" monogram so the icon still reads at 16-48 px.
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
    static readonly Color Mist = Color.FromArgb(0xDD, 0xE7, 0xFA);
    static readonly Color White = Color.FromArgb(0xFF, 0xFF, 0xFF);
    static readonly Color Ink = Color.FromArgb(0x0B, 0x1D, 0x4A);

    static int Main(string[] args)
    {
        if (args.Length < 1) { Console.WriteLine("usage: IconGen out.ico [pngDir]"); return 1; }
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
                // navy -> white gradient (transition concentrated mid-tile so both words stay legible)
                using (var br = new LinearGradientBrush(new PointF(0, tile.Top - 1), new PointF(0, tile.Bottom + 1), NavyDeep, White))
                {
                    var cb = new ColorBlend();
                    cb.Colors = new[] { NavyDeep, Navy, Blue, Mist, White };
                    cb.Positions = small ? new[] { 0f, 0.38f, 0.52f, 0.66f, 1f } : new[] { 0f, 0.36f, 0.5f, 0.62f, 1f };
                    br.InterpolationColors = cb;
                    g.FillPath(br, tilePath);
                }
                g.SetClip(tilePath);

                if (small) DrawMonogram(g, tile);
                else DrawWordmark(g, tile);

                g.ResetClip();
                // hairline edge so the white half never melts into light taskbars
                using (var pen = new Pen(Color.FromArgb(small ? 70 : 60, 11, 29, 74), Math.Max(1f, s / 128f)))
                    g.DrawPath(pen, tilePath);
            }
        }
        return bmp;
    }

    static void DrawWordmark(Graphics g, RectangleF t)
    {
        float left = t.Left + t.Width * 0.25f, right = t.Right - t.Width * 0.09f;
        var top = new RectangleF(left, t.Top + t.Height * 0.16f, right - left, t.Height * 0.25f);
        var bot = new RectangleF(left, t.Top + t.Height * 0.59f, right - left, t.Height * 0.25f);

        using (GraphicsPath p1 = TextPath("SUPER", top))
        using (GraphicsPath p2 = TextPath("SPEED", bot))
        {
            using (var sh = new SolidBrush(Color.FromArgb(80, 0, 6, 26)))
            using (var shPath = (GraphicsPath)p1.Clone())
            {
                var mx = new Matrix(); mx.Translate(t.Width * 0.008f, t.Height * 0.014f); shPath.Transform(mx);
                g.FillPath(sh, shPath);
            }
            using (var b1 = new SolidBrush(White)) g.FillPath(b1, p1);
            using (var b2 = new SolidBrush(Ink)) g.FillPath(b2, p2);
            Streaks(g, t, p1.GetBounds(), Color.White);
            Streaks(g, t, p2.GetBounds(), Ink);
        }
    }

    // three motion lines trailing to the left of a word
    static void Streaks(Graphics g, RectangleF t, RectangleF word, Color c)
    {
        float th = Math.Max(1.5f, t.Height * 0.022f);
        float[] lens = { 0.13f, 0.17f, 0.10f };
        float[] ys = { 0.30f, 0.52f, 0.74f };
        for (int i = 0; i < 3; i++)
        {
            float len = t.Width * lens[i];
            float y = word.Top + word.Height * ys[i] - th / 2;
            // follow the italic slant: lower lines start further left
            float endX = word.Left + word.Width * 0.02f - t.Width * 0.035f + (word.Height * (0.5f - ys[i])) * 0.25f;
            var r = new RectangleF(endX - len, y, len, th);
            using (var lb = new LinearGradientBrush(new PointF(r.Left - 1, 0), new PointF(r.Right + 1, 0), Color.FromArgb(0, c), Color.FromArgb(230, c)))
            using (GraphicsPath rp = RoundRect(r, th / 2))
                g.FillPath(lb, rp);
        }
    }

    static void DrawMonogram(Graphics g, RectangleF t)
    {
        var box = new RectangleF(t.Left + t.Width * 0.17f, t.Top + t.Height * 0.12f, t.Width * 0.66f, t.Height * 0.76f);
        using (GraphicsPath p = TextPath("S", box))
        {
            float split = t.Top + t.Height * 0.52f;
            Region old = g.Clip;
            g.SetClip(new RectangleF(t.Left, t.Top, t.Width, split - t.Top), CombineMode.Intersect);
            using (var b = new SolidBrush(White)) g.FillPath(b, p);
            g.Clip = old;
            g.SetClip(new RectangleF(t.Left, split, t.Width, t.Bottom - split), CombineMode.Intersect);
            using (var b = new SolidBrush(Ink)) g.FillPath(b, p);
            g.Clip = old;
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
