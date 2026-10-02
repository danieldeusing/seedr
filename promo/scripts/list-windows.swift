import Foundation
import CoreGraphics

// rawValue 0 == kCGWindowListOptionAll: includes windows on other Spaces,
// which is exactly the case a fullscreen app creates.
let all = CGWindowListOption(rawValue: 0)
guard let windows = CGWindowListCopyWindowInfo(all, kCGNullWindowID) as? [[String: Any]] else {
    FileHandle.standardError.write("no window list\n".data(using: .utf8)!)
    exit(1)
}
let needle = CommandLine.arguments.count > 1 ? CommandLine.arguments[1].lowercased() : ""
for w in windows {
    let owner = w[kCGWindowOwnerName as String] as? String ?? "?"
    let name = w[kCGWindowName as String] as? String ?? ""
    let num = w[kCGWindowNumber as String] as? Int ?? -1
    let layer = w[kCGWindowLayer as String] as? Int ?? -1
    let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let width = Int(b["Width"] as? Double ?? 0)
    let height = Int(b["Height"] as? Double ?? 0)
    if layer != 0 || width < 200 || height < 200 { continue }
    if !needle.isEmpty && !owner.lowercased().contains(needle) && !name.lowercased().contains(needle) { continue }
    print("\(num)\t\(width)x\(height)\t\(owner)\t\(name)")
}

// Usage:
//   swift scripts/list-windows.swift [needle]        one-off, compiles each run
//   swiftc -O scripts/list-windows.swift -o /tmp/lw  when calling it repeatedly
//
// Prints `id⇥WxH⇥owner⇥title` for on-screen windows, filtered by an optional
// case-insensitive needle matched against owner or title. See docs/promo-video.md.
