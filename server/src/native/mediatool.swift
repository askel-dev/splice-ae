// Usage:
//   mediatool probe <file>...                                   -> one JSON object per line
//   mediatool sheet <file> <out.jpg> <columns> <thumbWidth> <time[:label]>...  -> contact sheet JPEG
import AVFoundation
import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

func runSync<T>(_ body: @escaping () async throws -> T) throws -> T {
    let sem = DispatchSemaphore(value: 0)
    var result: Result<T, Error>!
    Task {
        do { result = .success(try await body()) } catch { result = .failure(error) }
        sem.signal()
    }
    sem.wait()
    return try result.get()
}

func jsonLine(_ dict: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
}

func fourCC(_ code: FourCharCode) -> String {
    let bytes = [24, 16, 8, 0].map { UInt8((code >> $0) & 0xff) }
    return String(bytes: bytes, encoding: .ascii)?.trimmingCharacters(in: .whitespaces) ?? "\(code)"
}

func probe(_ path: String) {
    let asset = AVURLAsset(url: URL(fileURLWithPath: path))
    do {
        let info: [String: Any] = try runSync {
            var out: [String: Any] = ["path": path]
            let duration = try await asset.load(.duration)
            out["duration"] = duration.seconds
            if let video = try await asset.loadTracks(withMediaType: .video).first {
                let (size, transform, fps, formats) = try await video.load(.naturalSize, .preferredTransform, .nominalFrameRate, .formatDescriptions)
                let shown = size.applying(transform)
                out["width"] = Int(abs(shown.width).rounded())
                out["height"] = Int(abs(shown.height).rounded())
                out["frameRate"] = Double(fps)
                if let f = formats.first { out["codec"] = fourCC(CMFormatDescriptionGetMediaSubType(f)) }
            } else {
                out["hasVideo"] = false
            }
            out["hasAudio"] = !(try await asset.loadTracks(withMediaType: .audio)).isEmpty
            return out
        }
        jsonLine(info)
    } catch {
        jsonLine(["path": path, "error": String(describing: error)])
    }
}

func timecode(_ t: Double) -> String {
    let total = max(0, t)
    let h = Int(total) / 3600, m = (Int(total) % 3600) / 60
    let s = total - Double(h * 3600 + m * 60)
    return h > 0 ? String(format: "%d:%02d:%05.2f", h, m, s) : String(format: "%d:%05.2f", m, s)
}

func sheet(_ path: String, _ outPath: String, _ columns: Int, _ thumbWidth: Int, _ specs: [String]) throws {
    let asset = AVURLAsset(url: URL(fileURLWithPath: path))
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = .zero
    generator.requestedTimeToleranceAfter = .zero
    generator.maximumSize = CGSize(width: thumbWidth, height: thumbWidth * 4)

    var cells: [(CGImage?, String, Double)] = []
    for spec in specs {
        let parts = spec.split(separator: ":", maxSplits: 1).map(String.init)
        let t = Double(parts[0]) ?? 0
        let label = parts.count > 1 ? parts[1] : timecode(t)
        let image = try? runSync { try await generator.image(at: CMTime(seconds: t, preferredTimescale: 600)).image }
        cells.append((image, label, t))
    }

    let sample = cells.compactMap { $0.0 }.first
    let aspect = sample.map { Double($0.height) / Double($0.width) } ?? 9.0 / 16.0
    let cellW = thumbWidth, cellH = Int((Double(thumbWidth) * aspect).rounded())
    let gap = 4
    let cols = max(1, min(columns, cells.count))
    let rows = (cells.count + cols - 1) / cols
    let width = cols * cellW + (cols + 1) * gap, height = rows * cellH + (rows + 1) * gap

    let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setFillColor(CGColor(gray: 0.08, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    let fontSize = max(11, CGFloat(cellW) / 18)
    let font = CTFontCreateWithName("Menlo-Bold" as CFString, fontSize, nil)

    for (i, cell) in cells.enumerated() {
        let col = i % cols, row = i / cols
        let x = gap + col * (cellW + gap)
        let y = height - (gap + row * (cellH + gap)) - cellH   // CG origin is bottom-left
        let rect = CGRect(x: x, y: y, width: cellW, height: cellH)
        if let image = cell.0 {
            ctx.draw(image, in: rect)
        } else {
            ctx.setFillColor(CGColor(red: 0.35, green: 0.05, blue: 0.05, alpha: 1))
            ctx.fill(rect)
        }
        let text = cell.0 == nil ? "\(cell.1) (no frame)" : cell.1
        let attributed = CFAttributedStringCreate(nil, text as CFString, [
            kCTFontAttributeName: font,
            kCTForegroundColorAttributeName: CGColor(gray: 1, alpha: 1)
        ] as CFDictionary)!
        let line = CTLineCreateWithAttributedString(attributed)
        let bounds = CTLineGetBoundsWithOptions(line, [])
        let pad = fontSize * 0.3
        ctx.setFillColor(CGColor(gray: 0, alpha: 0.7))
        ctx.fill(CGRect(x: CGFloat(x), y: CGFloat(y), width: bounds.width + 2 * pad, height: bounds.height + 2 * pad))
        ctx.textPosition = CGPoint(x: CGFloat(x) + pad, y: CGFloat(y) + pad - bounds.minY)
        CTLineDraw(line, ctx)
    }

    let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: outPath) as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, [kCGImageDestinationLossyCompressionQuality: 0.78] as CFDictionary)
    if !CGImageDestinationFinalize(dest) { throw NSError(domain: "mediatool", code: 1, userInfo: [NSLocalizedDescriptionKey: "could not write \(outPath)"]) }
    jsonLine(["sheet": outPath, "width": width, "height": height, "frames": cells.map { ["time": $0.2, "label": $0.1, "ok": $0.0 != nil] }])
}

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: mediatool probe <file>... | sheet <file> <out.jpg> <columns> <thumbWidth> <time[:label]>...\n".data(using: .utf8)!)
    exit(2)
}
switch args[1] {
case "probe":
    for path in args.dropFirst(2) { probe(path) }
case "sheet":
    do {
        try sheet(args[2], args[3], Int(args[4]) ?? 4, Int(args[5]) ?? 320, Array(args.dropFirst(6)))
    } catch {
        FileHandle.standardError.write("sheet failed: \(error)\n".data(using: .utf8)!)
        exit(1)
    }
default:
    FileHandle.standardError.write("unknown mode \(args[1])\n".data(using: .utf8)!)
    exit(2)
}
