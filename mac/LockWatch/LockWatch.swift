// Lock Watch — tells you the moment anything uses your microphone or camera,
// and names the app doing it.
//
// How it works: macOS exposes, per running process, whether that process is
// currently taking audio input (CoreAudio process objects), and exposes whether
// each camera is in use (CoreMediaIO). We poll both once a second and shout when
// something starts.
//
// Honest limits, stated plainly:
//  - It reports USE, not intent. A video call lights it up exactly like spyware.
//    The value is catching use you did not start.
//  - It runs as a normal app, so it cannot see below the operating system. A
//    compromised OS or firmware could hide from it.
//  - It needs no special permissions and sends nothing anywhere. No network code
//    exists in this program at all.

import Cocoa
import CoreAudio
import CoreMediaIO
import Darwin
import ServiceManagement

// ---------- naming processes ----------
func procName(_ pid: pid_t) -> String {
    if let n = NSRunningApplication(processIdentifier: pid)?.localizedName, !n.isEmpty { return n }
    var buf = [CChar](repeating: 0, count: 4096)
    if proc_pidpath(pid, &buf, UInt32(buf.count)) > 0 {
        return (String(cString: buf) as NSString).lastPathComponent
    }
    return "pid \(pid)"
}

// ---------- microphone: which processes are taking input ----------
enum Mic {
    static func processObjects() -> [AudioObjectID] {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyProcessObjectList,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        var size = UInt32(0)
        guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size) == noErr else { return [] }
        let n = Int(size) / MemoryLayout<AudioObjectID>.size
        guard n > 0 else { return [] }
        var ids = [AudioObjectID](repeating: 0, count: n)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &ids) == noErr else { return [] }
        return ids
    }
    static func pid(_ o: AudioObjectID) -> pid_t {
        var addr = AudioObjectPropertyAddress(mSelector: kAudioProcessPropertyPID,
            mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        var v = pid_t(0); var s = UInt32(MemoryLayout<pid_t>.size)
        AudioObjectGetPropertyData(o, &addr, 0, nil, &s, &v); return v
    }
    static func isListening(_ o: AudioObjectID) -> Bool {
        var addr = AudioObjectPropertyAddress(mSelector: kAudioProcessPropertyIsRunningInput,
            mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        var v = UInt32(0); var s = UInt32(MemoryLayout<UInt32>.size)
        AudioObjectGetPropertyData(o, &addr, 0, nil, &s, &v); return v != 0
    }
    /// Names of every process currently taking microphone input.
    static func activeApps() -> Set<String> {
        var out = Set<String>()
        for o in processObjects() where isListening(o) {
            let p = pid(o)
            if p > 0 { out.insert(procName(p)) }
        }
        return out
    }
}

// ---------- cameras ----------
enum Cam {
    static func devices() -> [CMIOObjectID] {
        var addr = CMIOObjectPropertyAddress(
            mSelector: CMIOObjectPropertySelector(kCMIOHardwarePropertyDevices),
            mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
            mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
        var size = UInt32(0)
        guard CMIOObjectGetPropertyDataSize(CMIOObjectID(kCMIOObjectSystemObject), &addr, 0, nil, &size) == noErr else { return [] }
        let n = Int(size)/MemoryLayout<CMIOObjectID>.size
        guard n > 0 else { return [] }
        var ids = [CMIOObjectID](repeating: 0, count: n); var used = UInt32(0)
        guard CMIOObjectGetPropertyData(CMIOObjectID(kCMIOObjectSystemObject), &addr, 0, nil, size, &used, &ids) == noErr else { return [] }
        return ids
    }
    static func name(_ d: CMIOObjectID) -> String {
        var addr = CMIOObjectPropertyAddress(
            mSelector: CMIOObjectPropertySelector(kCMIOObjectPropertyName),
            mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
            mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
        var s: CFString = "" as CFString
        let size = UInt32(MemoryLayout<CFString>.size); var used = UInt32(0)
        let st = withUnsafeMutablePointer(to: &s){ CMIOObjectGetPropertyData(d,&addr,0,nil,size,&used,$0) }
        return st == noErr ? (s as String) : "Camera"
    }
    static func inUse(_ d: CMIOObjectID) -> Bool {
        var addr = CMIOObjectPropertyAddress(
            mSelector: CMIOObjectPropertySelector(kCMIODevicePropertyDeviceIsRunningSomewhere),
            mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
            mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
        var v = UInt32(0); let size = UInt32(MemoryLayout<UInt32>.size); var used = UInt32(0)
        let st = CMIOObjectGetPropertyData(d,&addr,0,nil,size,&used,&v)
        return st == noErr && v != 0
    }
    static func activeCameras() -> Set<String> {
        var out = Set<String>()
        for d in devices() where inUse(d) { out.insert(name(d)) }
        return out
    }
}

// ---------- history ----------
struct Event: Codable {
    let time: Date
    let kind: String     // "Microphone" | "Camera"
    let who: String
    let started: Bool
}

final class History {
    private(set) var events: [Event] = []
    private let url: URL
    init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LockWatch", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        url = dir.appendingPathComponent("history.json")
        if let d = try? Data(contentsOf: url),
           let e = try? JSONDecoder().decode([Event].self, from: d) { events = e }
    }
    func add(_ e: Event) {
        events.insert(e, at: 0)
        if events.count > 500 { events = Array(events.prefix(500)) }
        if let d = try? JSONEncoder().encode(events) { try? d.write(to: url) }
    }
    func clear() { events = []; try? FileManager.default.removeItem(at: url) }
}

// ---------- the alert panel ----------
final class Alert {
    private var panel: NSPanel?
    private var hideTimer: Timer?

    func show(_ headline: String, _ detail: String) {
        hideTimer?.invalidate()
        if panel == nil { build() }
        guard let p = panel, let v = p.contentView else { return }
        (v.viewWithTag(1) as? NSTextField)?.stringValue = headline
        (v.viewWithTag(2) as? NSTextField)?.stringValue = detail
        position(p)
        p.orderFrontRegardless()
        hideTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: false) { [weak self] _ in self?.hide() }
    }
    func hide() { hideTimer?.invalidate(); panel?.orderOut(nil) }

    private func position(_ p: NSPanel) {
        guard let screen = NSScreen.main else { return }
        let f = screen.visibleFrame
        p.setFrameOrigin(NSPoint(x: f.maxX - p.frame.width - 18, y: f.maxY - p.frame.height - 18))
    }
    private func build() {
        let p = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 340, height: 104),
                        styleMask: [.borderless, .nonactivatingPanel],
                        backing: .buffered, defer: false)
        p.level = .floating
        p.isOpaque = false
        p.backgroundColor = .clear
        p.hasShadow = true
        p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        let bg = NSView(frame: p.contentView!.bounds)
        bg.wantsLayer = true
        bg.layer?.backgroundColor = NSColor.black.cgColor
        bg.layer?.cornerRadius = 14
        bg.layer?.borderWidth = 2
        bg.layer?.borderColor = NSColor.white.withAlphaComponent(0.85).cgColor
        bg.autoresizingMask = [.width, .height]

        let head = NSTextField(labelWithString: "")
        head.tag = 1
        head.font = .systemFont(ofSize: 15, weight: .bold)
        head.textColor = .white
        head.frame = NSRect(x: 18, y: 56, width: 304, height: 22)
        bg.addSubview(head)

        let det = NSTextField(labelWithString: "")
        det.tag = 2
        det.font = .systemFont(ofSize: 13)
        det.textColor = NSColor.white.withAlphaComponent(0.75)
        det.frame = NSRect(x: 18, y: 16, width: 250, height: 36)
        det.maximumNumberOfLines = 2
        bg.addSubview(det)

        let close = NSButton(title: "OK", target: self, action: #selector(dismiss))
        close.bezelStyle = .rounded
        close.frame = NSRect(x: 268, y: 14, width: 56, height: 26)
        bg.addSubview(close)

        p.contentView = bg
        panel = p
    }
    @objc private func dismiss() { hide() }
}

// ---------- app ----------
final class AppDelegate: NSObject, NSApplicationDelegate {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    let history = History()
    let alert = Alert()
    var timer: Timer?
    var lastMic = Set<String>()
    var lastCam = Set<String>()
    var historyWindow: NSWindow?

    func applicationDidFinishLaunching(_ n: Notification) {
        setIcon(mic: false, cam: false)
        rebuildMenu()
        // First poll seeds current state without alerting, so launching during a
        // call doesn't fire a false alarm.
        lastMic = Mic.activeApps(); lastCam = Cam.activeCameras()
        setIcon(mic: !lastMic.isEmpty, cam: !lastCam.isEmpty)
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in self?.poll() }
        RunLoop.main.add(timer!, forMode: .common)
    }

    func poll() {
        let mic = Mic.activeApps(), cam = Cam.activeCameras()
        for who in mic.subtracting(lastMic) { fire("Microphone", who, true) }
        for who in lastMic.subtracting(mic) { record("Microphone", who, false) }
        for who in cam.subtracting(lastCam) { fire("Camera", who, true) }
        for who in lastCam.subtracting(cam) { record("Camera", who, false) }
        if mic != lastMic || cam != lastCam { lastMic = mic; lastCam = cam; rebuildMenu() }
        setIcon(mic: !mic.isEmpty, cam: !cam.isEmpty)
    }

    func fire(_ kind: String, _ who: String, _ started: Bool) {
        record(kind, who, started)
        alert.show(kind == "Microphone" ? "Microphone ON" : "Camera ON",
                   "\(who) started using your \(kind.lowercased()).")
        NSSound(named: "Funk")?.play()
    }
    func record(_ kind: String, _ who: String, _ started: Bool) {
        history.add(Event(time: Date(), kind: kind, who: who, started: started))
    }

    func setIcon(mic: Bool, cam: Bool) {
        let name: String
        if mic && cam { name = "exclamationmark.triangle.fill" }
        else if mic { name = "mic.fill" }
        else if cam { name = "video.fill" }
        else { name = "lock.fill" }
        let img = NSImage(systemSymbolName: name, accessibilityDescription: "Lock Watch")
        img?.isTemplate = true
        item.button?.image = img
        item.button?.toolTip = mic || cam ? "Lock Watch — IN USE" : "Lock Watch — quiet"
    }

    func rebuildMenu() {
        let m = NSMenu()
        let status: String
        if lastMic.isEmpty && lastCam.isEmpty { status = "Nothing is listening or watching" }
        else {
            var parts: [String] = []
            if !lastMic.isEmpty { parts.append("Mic: " + lastMic.sorted().joined(separator: ", ")) }
            if !lastCam.isEmpty { parts.append("Camera: " + lastCam.sorted().joined(separator: ", ")) }
            status = parts.joined(separator: "  ·  ")
        }
        let head = NSMenuItem(title: status, action: nil, keyEquivalent: "")
        head.isEnabled = false
        m.addItem(head)
        m.addItem(.separator())

        let df = DateFormatter(); df.dateFormat = "d MMM  HH:mm:ss"
        let recent = history.events.filter { $0.started }.prefix(8)
        if recent.isEmpty {
            let none = NSMenuItem(title: "No activity recorded yet", action: nil, keyEquivalent: "")
            none.isEnabled = false; m.addItem(none)
        } else {
            for e in recent {
                let mi = NSMenuItem(title: "\(df.string(from: e.time))   \(e.kind) — \(e.who)", action: nil, keyEquivalent: "")
                mi.isEnabled = false
                m.addItem(mi)
            }
        }
        m.addItem(.separator())
        m.addItem(NSMenuItem(title: "Open full history…", action: #selector(openHistory), keyEquivalent: ""))
        m.addItem(NSMenuItem(title: "Clear history", action: #selector(clearHistory), keyEquivalent: ""))
        m.addItem(.separator())
        let launch = NSMenuItem(title: "Start at login", action: #selector(toggleLogin), keyEquivalent: "")
        launch.state = (SMAppService.mainApp.status == .enabled) ? .on : .off
        m.addItem(launch)
        m.addItem(.separator())
        m.addItem(NSMenuItem(title: "Quit Lock Watch", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        for i in m.items where i.action != nil { i.target = self }
        item.menu = m
    }

    @objc func toggleLogin() {
        do {
            if SMAppService.mainApp.status == .enabled { try SMAppService.mainApp.unregister() }
            else { try SMAppService.mainApp.register() }
        } catch { NSLog("login item: \(error)") }
        rebuildMenu()
    }
    @objc func clearHistory() { history.clear(); rebuildMenu() }

    @objc func openHistory() {
        let df = DateFormatter(); df.dateFormat = "d MMM yyyy  HH:mm:ss"
        var text = "LOCK WATCH — activity history\n"
        text += "Every time an app started or stopped using your microphone or camera.\n\n"
        if history.events.isEmpty { text += "Nothing recorded yet.\n" }
        for e in history.events {
            text += "\(df.string(from: e.time))   \(e.kind)  \(e.started ? "ON " : "off")  \(e.who)\n"
        }
        let w = historyWindow ?? {
            let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 620, height: 480),
                               styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
            win.title = "Lock Watch — History"
            win.center()
            historyWindow = win
            return win
        }()
        let scroll = NSScrollView(frame: NSRect(x: 0, y: 0, width: 620, height: 480))
        scroll.hasVerticalScroller = true
        scroll.autoresizingMask = [.width, .height]
        let tv = NSTextView(frame: scroll.bounds)
        tv.isEditable = false
        tv.backgroundColor = .black
        tv.textColor = .white
        tv.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        tv.string = text
        tv.autoresizingMask = [.width]
        scroll.documentView = tv
        w.contentView = scroll
        w.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)   // menu bar only, no dock icon
app.run()
