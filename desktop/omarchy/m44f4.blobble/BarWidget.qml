import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import qs.Ui

// Blobble in the bar, built the way OmaBlob's widget is: the widget owns a slot, so the shell
// places it, the layout moves it and it follows the bar to any side; the blob itself is shown in
// a see-through window laid over that slot (BarOverlay below), so a big blob and its symbols can
// hang past the bar's edge. The Blobble app draws the blob into a file this shows and writes the
// size to another; clicks go back to the app through `blobble --bar <command>` (see
// desktop/src-tauri/src/ctl.rs).
BarWidget {
  id: root
  moduleName: "m44f4.blobble"

  // What the app writes for the widget (bar.json): { scale: 0.4 .. 2.2, walks, asleep, playing, live }.
  property real scale: 0.75
  property bool walks: true
  property bool asleep: false
  property bool playing: false
  // Alive and in its own colours, or still and one colour (Blobble off, the pet out, the panel open):
  // then it stays in its slot, smaller, and does not walk, as OmaBlob's does.
  property bool live: true
  // The same size as OmaBlob's at the same setting (measured on screen: this fills its box a little less).
  readonly property int blobPixels: Math.round(barSize * scale * 1.04)
  readonly property int stillPixels: Math.round(barSize * 0.62 * 1.04)
  readonly property int blobSlot: Math.round(blobPixels + barSize * 0.4)
  // The image has this much room around the blob, for its symbols and hats.
  readonly property real roomAround: 0.5

  readonly property string dir: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/blobble"
  property int frame: 0
  // The folder the app writes into is gone after a reboot and the app may not have made it yet: a
  // watcher on a path in a missing folder never fires, so make it first and only then watch.
  property bool dirReady: false
  Process {
    command: ["mkdir", "-p", root.dir]
    running: true
    onExited: root.dirReady = true
  }

  readonly property var hostWindow: root.QsWindow.window
  TransformWatcher {
    id: watcher
    a: root.hostWindow ? root.hostWindow.contentItem : null
    b: root
  }
  readonly property point slotPos: {
    watcher.transform
    if (!root.hostWindow) return Qt.point(0, 0)
    return root.mapToItem(root.hostWindow.contentItem, 0, 0)
  }
  readonly property real slotStart: vertical ? slotPos.y : slotPos.x
  readonly property real slotLength: vertical ? height : width
  // Where the slot's centre is along the bar: how the app knows where to open the panel.
  readonly property int along: Math.round(slotStart + slotLength / 2)

  // The app's socket, kept open: a command is a write (starting the Blobble binary for each took
  // most of a tenth of a second). A socket that has failed is never reused: a new one is made
  // until it connects (an app that restarts has a new socket), and says hello at once. Without the
  // app, a command that needs it starts it instead.
  property bool linked: false
  property var ctl: sockets.item
  Component {
    id: socketMaker
    Socket {
      path: root.dir + "/ctl.sock"
      connected: true
      onConnectedChanged: { root.linked = connected; if (connected) root.tell("hello " + root.along) }
      onError: root.linked = false
    }
  }
  Loader { id: sockets; active: true; sourceComponent: socketMaker }
  Timer {
    interval: 1500
    running: true
    repeat: true
    onTriggered: if (!root.linked) { sockets.active = false; sockets.active = true }
  }
  function tell(command) {
    if (root.linked && root.ctl) {
      root.ctl.write(command + "\n")
      root.ctl.flush()
    } else if (/^(panel|open)/.test(command)) {
      Quickshell.execDetached(["blobble", "--bar", command])
    }
  }

  // A click brings the blob home if it is out visiting, then does what the button says.
  signal comeBack()
  function handlePress(b) {
    comeBack()
    if (b === Qt.RightButton) root.tell("poke")
    else if (b === Qt.MiddleButton) root.tell("btop")
    else root.tell("panel " + root.along)
  }
  // Send it to visit a widget now (for recordings and tests):
  //   omarchy-shell m44f4.blobble visit omarchy.clock
  signal visitNow(string name)
  IpcHandler {
    target: "m44f4.blobble"
    function visit(name: string): void { root.visitNow(name) }
  }

  // The app starts with the widget, as an installed plugin is simply there (a second start finds
  // the first and quits, so every bar and every reload may ask).
  Component.onCompleted: Quickshell.execDetached(["blobble"])

  // Says it is here (and where) while it is loaded, so the app draws the blob for it.
  Timer {
    interval: 10000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.tell("hello " + root.along)
  }
  onAlongChanged: tell("hello " + root.along)

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  // The slot: it keeps the room and takes clicks inside the bar. The blob is drawn over it.
  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    hasVisualContent: true
    labelVisible: false
    fixedWidth: root.vertical ? -1 : root.blobSlot
    fixedHeight: root.vertical ? root.blobSlot : -1
    tooltipText: "Blobble"
    onPressed: function(b) { root.handlePress(b) }

    // The still blob lives in the slot itself.
    Image {
      anchors.centerIn: parent
      visible: !root.live
      width: Math.round(root.stillPixels * (1 + 2 * root.roomAround))
      height: width
      sourceSize: Qt.size(width * 2, height * 2)
      fillMode: Image.PreserveAspectFit
      smooth: true
      cache: false
      source: "file://" + root.dir + "/bar.svg?" + root.frame
    }
  }

  // The app rewrites these whenever the blob's face or its settings change.
  FileView {
    path: root.dirReady ? root.dir + "/bar.svg" : ""
    watchChanges: true
    printErrors: false
    onFileChanged: root.frame++
    onLoaded: root.frame++
  }
  FileView {
    id: conf
    path: root.dirReady ? root.dir + "/bar.json" : ""
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      try {
        var c = JSON.parse(text())
        if (isFinite(c.scale)) root.scale = Math.max(0.4, Math.min(2.2, c.scale))
        root.walks = c.walks !== false
        root.asleep = c.asleep === true
        root.playing = c.playing === true
        root.live = c.live !== false
      } catch (e) { /* keep the last */ }
    }
  }

  LazyLoader {
    active: root.bar !== null && root.visible
    component: PanelWindow {
      id: win

      readonly property string pos: root.bar && root.bar.position ? root.bar.position : "top"
      readonly property int blobSize: root.blobPixels
      readonly property int room: Math.round(blobSize * root.roomAround) + Style.space(8)
      readonly property int imageSize: Math.round(blobSize * (1 + 2 * root.roomAround))
      readonly property bool walks: root.walks && root.live && root.bar !== null
      readonly property real screenLength: screen ? (root.vertical ? screen.height : screen.width) : 1920
      // Where the window starts along the bar: just before the slot, or at the screen's edge when
      // the blob may walk the whole bar.
      readonly property real start: walks ? 0 : root.slotStart - room

      screen: root.hostWindow ? root.hostWindow.screen : null
      // Only while it is alive: otherwise the still blob in the slot is all there is.
      visible: root.visible && root.live && !!root.bar && !root.bar.barHidden && root.slotLength > 0

      anchors {
        top: win.pos !== "bottom"
        bottom: win.pos === "bottom"
        left: win.pos !== "right"
        right: win.pos === "right"
      }
      margins {
        left: root.vertical || win.walks ? 0 : Math.round(root.slotStart - win.room)
        top: root.vertical && !win.walks ? Math.round(root.slotStart - win.room) : 0
      }
      implicitWidth: root.vertical ? root.barSize + room * 2 : Math.round(walks ? screenLength : root.slotLength + room * 2)
      implicitHeight: root.vertical ? Math.round(walks ? screenLength : root.slotLength + room * 2) : root.barSize + room * 2

      color: "transparent"
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "blobble-bar"
      WlrLayershell.layer: WlrLayer.Top
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None

      // Only the blob takes the mouse, and not the part over the bar (the slot's button has that).
      mask: Region {
        item: art
        Region { item: barStrip; intersection: Intersection.Subtract }
      }
      Item {
        id: barStrip
        x: win.pos === "right" ? win.width - root.barSize : 0
        y: win.pos === "bottom" ? win.height - root.barSize : 0
        width: root.vertical ? root.barSize : win.width
        height: root.vertical ? win.height : root.barSize
      }

      // Centred on the slot; a blob bigger than the bar is pushed away from the screen's edge so
      // it hangs into the screen rather than off it. Away from its slot it walks a little below
      // the bar's line, so it hides less of the widgets it passes.
      property real dip: away ? Math.min(root.barSize * 0.4, room * 0.6) : 0
      Behavior on dip { NumberAnimation { duration: 300; easing.type: Easing.OutCubic } }
      readonly property real across: Math.max((root.barSize - blobSize) / 2, Style.space(2)) + dip
      readonly property real along: root.slotStart - start + (root.slotLength - blobSize) / 2 + walkOffset
      readonly property real pad: (imageSize - blobSize) / 2

      Image {
        id: art
        width: win.imageSize
        height: win.imageSize
        x: (root.vertical ? (win.pos === "left" ? win.across : win.width - win.across - win.blobSize) : win.along) - win.pad
        y: (root.vertical ? win.along : (win.pos === "top" ? win.across : win.height - win.across - win.blobSize)) - win.pad
        sourceSize: Qt.size(win.imageSize * 2, win.imageSize * 2)
        fillMode: Image.PreserveAspectFit
        smooth: true
        cache: false
        source: "file://" + root.dir + "/bar.svg?" + root.frame

        MouseArea {
          anchors.fill: parent
          acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
          cursorShape: Qt.PointingHandCursor
          onClicked: function(mouse) { root.handlePress(mouse.button) }
        }
      }

      // --- walking: now and then it visits another widget and comes back, as OmaBlob's does ---
      property real walkOffset: 0
      property int walkDir: 1
      property bool away: false
      readonly property bool walking: walkAnim.running
      property var afterWalk: null

      // The app draws the blob walking while it does, and nods or wiggles when it gets there.
      onWalkingChanged: root.tell("walk " + (walking ? walkDir : 0))

      function neighbours() {
        var out = []
        var rootItem = root.hostWindow ? root.hostWindow.contentItem : null
        function scan(item, depth) {
          if (!item || depth > 14) return
          if (typeof item.moduleName === "string" && item.region !== undefined && item.activeItem !== undefined) {
            if (item.moduleName !== root.moduleName && item.visible && item.width > 0 && item.height > 0) {
              var p = item.mapToItem(rootItem, 0, 0)
              out.push({
                name: item.moduleName,
                mid: root.vertical ? p.y + item.height / 2 : p.x + item.width / 2,
                size: root.vertical ? item.height : item.width
              })
            }
            return
          }
          var kids = item.children || []
          for (var i = 0; i < kids.length; i++) scan(kids[i], depth + 1)
        }
        scan(rootItem, 0)
        return out
      }

      function walkTo(offset, then) {
        var dist = offset - walkOffset
        if (Math.abs(dist) < 3) { if (then) then(); return }
        walkDir = dist < 0 ? -1 : 1
        walkAnim.stop()
        walkAnim.to = offset
        walkAnim.duration = Math.abs(dist) / 70 * 1000
        afterWalk = then || null
        walkAnim.start()
      }
      NumberAnimation {
        id: walkAnim
        target: win
        property: "walkOffset"
        easing.type: Easing.InOutSine
        onFinished: { var f = win.afterWalk; win.afterWalk = null; if (f) f() }
      }

      function visit(name, stay, antic) {
        if (!walks || !visible || away || root.asleep) return
        var list = neighbours()
        var mine = root.slotStart + root.slotLength / 2
        var pick = null
        if (name) list.forEach(function(n) { if (n.name === name) pick = n })
        else {
          var reach = Math.max(320, screenLength * 0.35)
          var near = list.filter(function(n) {
            var d = Math.abs(n.mid - mine)
            return d >= blobSize * 1.6 && d <= reach
          })
          if (!near.length) {
            list.sort(function(a, b) { return Math.abs(a.mid - mine) - Math.abs(b.mid - mine) })
            near = list.filter(function(n) { return Math.abs(n.mid - mine) >= blobSize * 1.6 }).slice(0, 1)
          }
          if (near.length) pick = near[Math.floor(Math.random() * near.length)]
        }
        if (!pick) return
        var side = pick.mid > mine ? -1 : 1
        var target = pick.mid - mine + side * (pick.size / 2 + blobSize * 0.3)
        away = true
        walkTo(target, function() {
          win.walkDir = -side
          root.tell("antic " + (antic || "look"))
          backTimer.interval = stay || 3500
          backTimer.restart()
        })
      }
      function comeHome() {
        backTimer.stop()
        walkTo(0, function() { win.away = false })
      }
      // Back at once (a click, or when it falls asleep).
      function home() {
        if (!away) return
        walkAnim.stop()
        backTimer.stop()
        walkOffset = 0
        away = false
      }
      Timer { id: backTimer; onTriggered: win.comeHome() }

      Connections {
        target: root
        function onAsleepChanged() { if (root.asleep && win.away) win.comeHome() }
        function onPlayingChanged() { if (root.playing) win.visit("omarchy.media", 6000, "wiggle") }
        function onWalksChanged() { if (!root.walks) win.home() }
        function onComeBack() { win.home() }
        function onVisitNow(name) { win.visit(name, 4000, "look") }
      }
      onVisibleChanged: if (!visible) home()

      // Every few minutes it wanders to a widget; on the hour it checks the clock.
      Timer {
        interval: 240000
        repeat: true
        running: win.walks && win.visible
        onTriggered: {
          interval = 180000 + Math.random() * 300000
          win.visit("", 3500, "look")
        }
      }
      property int lastHour: new Date().getHours()
      Timer {
        interval: 30000
        repeat: true
        running: win.walks && win.visible
        onTriggered: {
          var h = new Date().getHours()
          if (h !== win.lastHour) { win.lastHour = h; win.visit("omarchy.clock", 4000, "nod") }
        }
      }
    }
  }
}
