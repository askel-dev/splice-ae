// Usage: scenediff <video> <startSec> <endSec>  -> prints "pts gridDiff histDiff" per frame
import AVFoundation
import CoreVideo

let args = CommandLine.arguments
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let start = Double(args[2])!, end = Double(args[3])!
let sem = DispatchSemaphore(value: 0)
var track: AVAssetTrack!
Task { track = try! await asset.loadTracks(withMediaType: .video).first!; sem.signal() }
sem.wait()

let reader = try! AVAssetReader(asset: asset)
reader.timeRange = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600), end: CMTime(seconds: end, preferredTimescale: 600))
let W = 160, H = 90
let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
output.alwaysCopiesSampleData = false
reader.add(output)
reader.startReading()

let GX = 16, GY = 9, BINS = 16
var prevGrid: [Double]? = nil, prevHist: [Double]? = nil
while let sample = output.copyNextSampleBuffer() {
    guard let pb = CMSampleBufferGetImageBuffer(sample) else { continue }
    let pts = CMSampleBufferGetPresentationTimeStamp(sample).seconds
    CVPixelBufferLockBaseAddress(pb, .readOnly)
    let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), bpr = CVPixelBufferGetBytesPerRow(pb)
    let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
    var grid = [Double](repeating: 0, count: GX * GY * 3), counts = [Double](repeating: 0, count: GX * GY)
    var hist = [Double](repeating: 0, count: BINS * 3)
    for y in 0..<h {
        for x in 0..<w {
            let p = base + y * bpr + x * 4
            let b = Double(p[0]), g = Double(p[1]), r = Double(p[2])
            let cell = (y * GY / h) * GX + (x * GX / w)
            grid[cell * 3] += r; grid[cell * 3 + 1] += g; grid[cell * 3 + 2] += b; counts[cell] += 1
            hist[Int(r) * BINS / 256] += 1; hist[BINS + Int(g) * BINS / 256] += 1; hist[2 * BINS + Int(b) * BINS / 256] += 1
        }
    }
    CVPixelBufferUnlockBaseAddress(pb, .readOnly)
    for c in 0..<(GX * GY) { for k in 0..<3 { grid[c * 3 + k] /= max(counts[c], 1) } }
    let n = Double(w * h)
    hist = hist.map { $0 / n }
    var gd = 0.0, hd = 0.0
    if let pg = prevGrid, let ph = prevHist {
        gd = zip(grid, pg).map { abs($0 - $1) }.reduce(0, +) / Double(grid.count)
        hd = zip(hist, ph).map { abs($0 - $1) }.reduce(0, +) / 6.0
    }
    print(String(format: "%.4f %.3f %.4f", pts, gd, hd))
    prevGrid = grid; prevHist = hist
}
if reader.status == .failed { FileHandle.standardError.write("reader failed: \(String(describing: reader.error))\n".data(using: .utf8)!) }
