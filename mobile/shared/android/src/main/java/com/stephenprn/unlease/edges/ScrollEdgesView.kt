package com.stephenprn.unlease.edges

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.RenderNode
import android.graphics.Shader
import android.os.Build
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.ScrollView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.widget.NestedScrollView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import com.facebook.react.views.scroll.ReactScrollView
import com.facebook.react.views.view.ReactViewGroup
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min

/**
 * A scroller, and how it meets what stands around it (`ScrollEdges`).
 *
 * Under a head (a top bar, a sheet's head, a pinned day: [topEdge]) nothing fades: the head meets what
 * scrolls under it with its line, drawn by `ScrollEdges` over this view's top (`insetTop` below it
 * under a band inside the list), and this view tells it, once per change ([UnderEvent]), whether
 * content has gone under that top. A top that is the screen's own (within [SCREEN_SLACK] of the status
 * bar) has no head: what goes there leaves the screen, and it never says so.
 *
 * In a bounded box with nothing at an end ([fadeStart], [fadeEnd]: a list capped in a card, a strip
 * that scrolls sideways, [horizontal]), that end dissolves over [length] on an eased curve (a cosine
 * ease-in-out: a straight ramp shows where it starts and ends, and a single blur stops on a line of its
 * own, so there is none) while content continues past it, in step with how much (Android's own fading
 * edges, which React Native's ScrollView draws at full strength all the time): at the start of a strip
 * its start is crisp, and a box with nothing to scroll shows none.
 *
 * It wraps the scroller (the first vertical `ScrollView` among its children: a FlatList's, a
 * SectionList's, one inside a pull-to-refresh; the first `HorizontalScrollView` when [horizontal]) and
 * draws its children itself while an end fades: once into a RenderNode, whose strips are drawn again
 * through their masks, and as they are otherwise. A vertical scroller keeps the caret in sight and
 * still as fields take focus and the keyboard comes and goes, and no strip ever lies over it.
 */
class ScrollEdgesView(context: Context) : ReactViewGroup(context) {
  private val density = context.resources.displayMetrics.density

  private var length = 24f * density
  /** Its top meets a head, which shows its line once content has gone under it. */
  private var topEdge = true
  /** How far below the scroller's top that head's line stands: under a band inside it that hides what scrolls beneath (px). */
  private var insetTop = 0f
  /** The scroller it wraps runs sideways: its sides may fade, it meets no head. */
  private var horizontal = false
  /** The start (top, or left) and the end (bottom, or right) fade while content continues past them. */
  private var fadeStart = false
  private var fadeEnd = false

  /** How far each end's fade shows, 0 to 1: what lies beyond it, over [length]. */
  private var startStrength = 0f
  private var endStrength = 0f
  /** Whether content lies under the head, as last told. */
  private var under = false

  private var scroller: ViewGroup? = null
  private val scrollerRect = Rect()
  private val strip = RectF()
  /** The line the caret stands on in a field being typed in, here (NaN: none): no strip ever lies over it. */
  private var caretTop = Float.NaN
  private var caretBottom = Float.NaN
  private val caretRect = Rect()

  private val content: RenderNode? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) RenderNode("ScrollEdges") else null
  /** What shows of the content across the strip, from its edge to its inner end, at full strength (the eased curve's samples). */
  private val shown = FloatArray(EASE_STEPS) { i -> 0.5f - 0.5f * cos(PI.toFloat() * i / (EASE_STEPS - 1)) }
  private val colors = IntArray(EASE_STEPS)
  private val positions = FloatArray(EASE_STEPS) { i -> i / (EASE_STEPS - 1f) }

  /** Keeps the strip's own alpha from the edge (transparent at full strength) to its inner end. */
  private val mask = Paint(Paint.ANTI_ALIAS_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }

  private val onScroll = ViewTreeObserver.OnScrollChangedListener { measure() }
  private val onLayout = ViewTreeObserver.OnGlobalLayoutListener { measure() }
  /** The scroller's height at the last layout: a change (the keyboard rising or leaving) moves it to the caret. */
  private var scrollerHeight = -1
  /** Where the scroller stood at the last frame: a field taking focus never moves it from there for nothing. */
  private var settledScrollY = -1
  /** A finger is on it: a field it taps takes focus where it is. */
  private var touching = false
  // A sheet rising or the keyboard moving changes where the scroller lies without a layout of its own.
  private val onPreDraw = ViewTreeObserver.OnPreDrawListener {
    measure()
    true
  }
  private val location = IntArray(2)

  fun setLength(dp: Float) {
    length = max(0f, dp) * density
    measure()
    invalidate()
  }

  fun setTopEdge(on: Boolean) {
    topEdge = on
    measure()
  }

  fun setInsetTop(dp: Float) {
    insetTop = max(0f, dp) * density
    measure()
  }

  fun setHorizontal(on: Boolean) {
    if (horizontal == on) return
    horizontal = on
    scroller = null
    measure()
    invalidate()
  }

  fun setFadeStart(on: Boolean) {
    fadeStart = on
    measure()
    invalidate()
  }

  fun setFadeEnd(on: Boolean) {
    fadeEnd = on
    measure()
    invalidate()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnScrollChangedListener(onScroll)
    viewTreeObserver.addOnGlobalLayoutListener(onLayout)
    viewTreeObserver.addOnPreDrawListener(onPreDraw)
    measure()
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnScrollChangedListener(onScroll)
    viewTreeObserver.removeOnGlobalLayoutListener(onLayout)
    viewTreeObserver.removeOnPreDrawListener(onPreDraw)
    scroller = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) content?.discardDisplayList()
    super.onDetachedFromWindow()
  }

  override fun onViewAdded(child: View) {
    super.onViewAdded(child)
    scroller = null
  }

  override fun onViewRemoved(child: View) {
    super.onViewRemoved(child)
    scroller = null
  }

  /** The scroller it watches: found again when its children change. */
  private fun findScroller(): ViewGroup? {
    scroller?.let { if (it.isAttachedToWindow && holds(it)) return it }
    return search(this, 6).also { scroller = it }
  }

  private fun holds(view: View): Boolean {
    var parent = view.parent
    while (parent != null) {
      if (parent === this) return true
      parent = parent.parent
    }
    return false
  }

  private fun search(view: View, depth: Int): ViewGroup? {
    if (view !== this && isScroller(view)) return view as ViewGroup
    if (depth == 0 || view !is ViewGroup) return null
    for (i in 0 until view.childCount) search(view.getChildAt(i), depth - 1)?.let { return it }
    return null
  }

  private fun isScroller(view: View): Boolean = if (horizontal) view is HorizontalScrollView else view is ScrollView || view is NestedScrollView

  /** Reads what lies beyond each end, whether content lies under the head, and where the caret is; redraws only when that changes how it shows. */
  private fun measure() {
    val list = findScroller()
    if (list != null && !horizontal) {
      keepCaretClear(list)
      // Every frame: React Native resizes the scroller (the keyboard's room) outside Android's layout pass.
      followCaretOnResize(list)
      settledScrollY = list.scrollY
    }
    var start = 0f
    var end = 0f
    var below = false
    if (list != null) {
      val inner = list.getChildAt(0)
      val range =
        when {
          inner == null -> 0
          horizontal -> max(0, inner.width - (list.width - list.paddingLeft - list.paddingRight))
          else -> max(0, inner.height - (list.height - list.paddingTop - list.paddingBottom))
        }
      val at = (if (horizontal) list.scrollX else list.scrollY).coerceIn(0, range)
      if (length > 0f) {
        if (fadeStart) start = (at / length).coerceIn(0f, 1f)
        if (fadeEnd) end = ((range - at) / length).coerceIn(0f, 1f)
      }
      below = !horizontal && topEdge && !fadeStart && at >= 1 && !atScreenTop(list)
    }
    if (below != under && tell(below)) under = below
    val (lineTop, lineBottom) = if (horizontal) Float.NaN to Float.NaN else caretLine(list)
    val caretMoved = !sameLine(lineTop, caretTop) || !sameLine(lineBottom, caretBottom)
    if (abs(start - startStrength) > 0.002f || abs(end - endStrength) > 0.002f || caretMoved) {
      startStrength = start
      endStrength = end
      caretTop = lineTop
      caretBottom = lineBottom
      invalidate()
    }
  }

  /** Tells the head whether content lies under it; false when it could not be told yet (it is told again on the next frame). */
  private fun tell(value: Boolean): Boolean {
    val react = context as? ReactContext ?: return false
    val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(react, id) ?: return false
    dispatcher.dispatchEvent(UnderEvent(UIManagerHelper.getSurfaceId(this), id, value))
    return true
  }

  private fun sameLine(a: Float, b: Float): Boolean = (a.isNaN() && b.isNaN()) || abs(a - b) < 0.5f

  /**
   * The scroller keeps what it brings into view (the caret as one types, a field taking focus) clear
   * of its edges by the fade's length, as Android's own ScrollView does for its fading edges: its
   * `computeScrollDeltaToGetChildRectOnScreen` keeps that room (at the foot too, so the line typed
   * never sits on a footer's line, nor on a head's at the top). Its own fade is never drawn: React
   * Native's ScrollView draws one only from its `fadingEdgeLength` prop, unset here (strength 0/0).
   */
  private fun keepCaretClear(list: ViewGroup) {
    val room = length.toInt()
    if (room <= 0) return
    if (!list.isVerticalFadingEdgeEnabled) list.isVerticalFadingEdgeEnabled = true
    if (list.verticalFadingEdgeLength != room) list.setFadingEdgeLength(room)
  }

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    if (event.actionMasked == MotionEvent.ACTION_DOWN) touching = true
    val handled = super.dispatchTouchEvent(event)
    if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) touching = false
    return handled
  }

  /**
   * React Native's ScrollView scrolls a field taking focus into view, the field whole: one taller
   * than it (a note's body) from its top, far from where it was tapped, and the next line typed jumps
   * back down to the caret. Here, by the time it reaches us, that scroll is undone: a field tapped
   * was in sight where the finger was, it stays where it is; one focused otherwise (the next field,
   * a field opening with the caret) is brought in just far enough to show its caret's line.
   */
  override fun requestChildFocus(child: View, focused: View?) {
    val list = scroller
    val before = settledScrollY
    if (!horizontal && focused is EditText && list != null && before >= 0 && list.scrollY != before && isAncestor(list, focused)) {
      val target = if (touching) before else caretInSight(list, focused, before)
      if (target != list.scrollY) list.scrollTo(list.scrollX, target)
    }
    super.requestChildFocus(child, focused)
  }

  /** The scroll nearest to `from` that shows the field's caret line clear of the edges. */
  private fun caretInSight(list: ViewGroup, field: EditText, from: Int): Int {
    val layout = field.layout ?: return list.scrollY
    val line = layout.getLineForOffset(max(0, field.selectionEnd))
    caretRect.set(0, layout.getLineTop(line), field.width, layout.getLineBottom(line))
    caretRect.offset(field.totalPaddingLeft - field.scrollX, field.totalPaddingTop - field.scrollY)
    try {
      list.offsetDescendantRectToMyCoords(field, caretRect)
    } catch (_: IllegalArgumentException) {
      return list.scrollY
    }
    val room = length.toInt()
    val view = list.height - list.paddingTop - list.paddingBottom
    val inner = list.getChildAt(0)?.height ?: return list.scrollY
    val range = max(0, inner - view)
    // From this scroll the caret's line stands clear of the foot, up to this one clear of the top.
    val lowest = caretRect.bottom + room - view
    val highest = max(lowest, caretRect.top - room)
    return from.coerceIn(lowest, highest).coerceIn(0, range)
  }

  /**
   * Android's ScrollView, resized (the keyboard rising or leaving), brings the focused view into view:
   * for a field taller than it (a note's body, a long page), from its top, far from the caret, and the
   * next line typed jumps back down. The caret is what must stay in sight: the ScrollView's own move
   * is cancelled before its first frame and the scroller glides, as little as it takes, to show the
   * caret's line clear of the edges (or stays, when it already does).
   */
  private fun followCaretOnResize(list: ViewGroup) {
    val was = scrollerHeight
    scrollerHeight = list.height
    if (was < 0 || was == list.height) return
    val field = findFocus() as? EditText ?: return
    if (!field.isFocused || !isAncestor(list, field)) return
    if (list is ReactScrollView) {
      list.abortAnimation()
      val target = caretInSight(list, field, list.scrollY)
      if (target != list.scrollY) list.reactSmoothScrollTo(list.scrollX, target)
      return
    }
    when (list) {
      is ScrollView -> list.smoothScrollBy(0, 0)
      is NestedScrollView -> list.smoothScrollBy(0, 0)
    }
    field.bringPointIntoView(max(0, field.selectionEnd))
  }

  /** The top and bottom here of the line the caret is on, in a field of the scroller being typed in (NaN, NaN: none). */
  private fun caretLine(list: ViewGroup?): Pair<Float, Float> {
    val field = findFocus() as? EditText ?: return Float.NaN to Float.NaN
    val layout = field.layout ?: return Float.NaN to Float.NaN
    if (list == null || !isAncestor(list, field)) return Float.NaN to Float.NaN
    val line = layout.getLineForOffset(max(0, field.selectionEnd))
    caretRect.set(0, layout.getLineTop(line), field.width, layout.getLineBottom(line))
    caretRect.offset(field.totalPaddingLeft - field.scrollX, field.totalPaddingTop - field.scrollY)
    return try {
      offsetDescendantRectToMyCoords(field, caretRect)
      caretRect.top.toFloat() to caretRect.bottom.toFloat()
    } catch (_: IllegalArgumentException) {
      Float.NaN to Float.NaN
    }
  }

  private fun isAncestor(ancestor: View, view: View): Boolean {
    var parent = view.parent
    while (parent != null) {
      if (parent === ancestor) return true
      parent = parent.parent
    }
    return false
  }

  /**
   * Whether the scroller's top (where the head's line would stand) is the screen's own: within
   * [SCREEN_SLACK] of the status bar. What leaves there leaves the screen; nothing of the app lies over it.
   */
  private fun atScreenTop(list: View): Boolean {
    val bars = ViewCompat.getRootWindowInsets(this)?.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
    list.getLocationInWindow(location)
    return location[1] + insetTop <= (bars?.top ?: 0) + SCREEN_SLACK * density
  }

  override fun dispatchDraw(canvas: Canvas) {
    val node = content
    val list = findScroller()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || node == null || list == null || !canvas.isHardwareAccelerated || (startStrength <= 0f && endStrength <= 0f)) {
      super.dispatchDraw(canvas)
      return
    }
    val w = width
    val h = height
    node.setPosition(0, 0, w, h)
    node.setClipToBounds(false)
    val recording = node.beginRecording(w, h)
    try {
      super.dispatchDraw(recording)
    } finally {
      node.endRecording()
    }

    // Where the scroller lies here: its strips stand on its own ends.
    list.getDrawingRect(scrollerRect)
    try {
      offsetDescendantRectToMyCoords(list, scrollerRect)
    } catch (_: IllegalArgumentException) {
      // No longer one of ours (its list was replaced): this frame as it is, the next finds the new one.
      scroller = null
      canvas.drawRenderNode(node)
      return
    }
    val along = if (horizontal) w.toFloat() else h.toFloat()
    val across = if (horizontal) h.toFloat() else w.toFloat()
    val a = (if (horizontal) scrollerRect.left else scrollerRect.top).toFloat().coerceIn(0f, along)
    val b = (if (horizontal) scrollerRect.right else scrollerRect.bottom).toFloat().coerceIn(a, along)
    val c0 = (if (horizontal) scrollerRect.top else scrollerRect.left).toFloat().coerceIn(0f, across)
    val c1 = (if (horizontal) scrollerRect.bottom else scrollerRect.right).toFloat().coerceIn(c0, across)
    // Each end's strip, never past the middle; never over the line being typed on (what is left of it, or none).
    val span = min(length, (b - a) / 2f)
    var startTo = a + span
    var endFrom = b - span
    if (!horizontal && !caretTop.isNaN()) {
      if (caretTop < startTo && caretBottom > a) startTo = max(a, min(startTo, caretTop))
      if (caretBottom > endFrom && caretTop < b) endFrom = min(b, max(endFrom, caretBottom))
    }
    val least = MIN_STRIP * density
    val drawStart = startStrength > 0f && startTo - a >= least
    val drawEnd = endStrength > 0f && b - endFrom >= least
    if (!drawStart && !drawEnd) {
      canvas.drawRenderNode(node)
      return
    }

    // What lies around the strips (outside the scroller, and between them), as it is.
    canvas.save()
    if (drawStart) canvas.clipOutRect(stripRect(a, startTo, c0, c1))
    if (drawEnd) canvas.clipOutRect(stripRect(endFrom, b, c0, c1))
    canvas.drawRenderNode(node)
    canvas.restore()

    if (drawStart) drawStrip(canvas, node, stripRect(a, startTo, c0, c1), startStrength, atStart = true)
    if (drawEnd) drawStrip(canvas, node, stripRect(endFrom, b, c0, c1), endStrength, atStart = false)
  }

  /** A strip from `from` to `to` along the scroller's axis, across it from `c0` to `c1`. */
  private fun stripRect(from: Float, to: Float, c0: Float, c1: Float): RectF {
    if (horizontal) strip.set(from, c0, to, c1) else strip.set(c0, from, c1, to)
    return strip
  }

  /**
   * An end's strip: the content through a mask that keeps all of it at the strip's inner end and less
   * of it toward the edge on the eased curve, by [strength] (at full strength, none at the edge).
   */
  private fun drawStrip(canvas: Canvas, node: RenderNode, rect: RectF, strength: Float, atStart: Boolean) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || rect.isEmpty) return
    val layer = canvas.saveLayer(rect, null)
    canvas.save()
    canvas.clipRect(rect)
    canvas.drawRenderNode(node)
    canvas.restore()
    for (i in 0 until EASE_STEPS) colors[i] = alpha(1f - strength * (1f - shown[i]))
    // From the edge, where the content goes, to the strip's inner end, where all of it shows.
    mask.shader =
      when {
        horizontal && atStart -> LinearGradient(rect.left, 0f, rect.right, 0f, colors, positions, Shader.TileMode.CLAMP)
        horizontal -> LinearGradient(rect.right, 0f, rect.left, 0f, colors, positions, Shader.TileMode.CLAMP)
        atStart -> LinearGradient(0f, rect.top, 0f, rect.bottom, colors, positions, Shader.TileMode.CLAMP)
        else -> LinearGradient(0f, rect.bottom, 0f, rect.top, colors, positions, Shader.TileMode.CLAMP)
      }
    canvas.drawRect(rect, mask)
    mask.shader = null
    canvas.restoreToCount(layer)
  }

  private fun alpha(value: Float): Int = Color.argb((value.coerceIn(0f, 1f) * 255f).toInt(), 0, 0, 0)

  companion object {
    /**
     * How near the status bar a scroller's top is still the screen's own (dp), never a bar's height
     * (a top bar's 64, a sheet's handle's 28).
     */
    private const val SCREEN_SLACK = 24f

    /** How many samples of the eased curve a strip's mask holds: enough that no step shows. */
    private const val EASE_STEPS = 9

    /** Shorter than this (dp), what is left of a strip beside the caret's line is not drawn: it would be a cut. */
    private const val MIN_STRIP = 6f
  }
}

/** Whether content has gone under the scroller's top, where a head stands (`onUnder`): sent once per change. */
class UnderEvent(surfaceId: Int, viewTag: Int, private val under: Boolean) : Event<UnderEvent>(surfaceId, viewTag) {
  override fun getEventName(): String = EVENT_NAME

  override fun getEventData(): WritableMap = Arguments.createMap().apply { putBoolean("under", under) }

  companion object {
    const val EVENT_NAME = "topUnder"
  }
}
