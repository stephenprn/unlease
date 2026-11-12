package com.stephenprn.unlease.edges

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RenderNode
import android.graphics.Shader
import android.os.Build
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.EditText
import android.widget.ScrollView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.widget.NestedScrollView
import com.facebook.react.views.scroll.ReactScrollView
import com.facebook.react.views.view.ReactViewGroup
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min

/**
 * What a vertical scroller holds, softened where it slides under something on screen at its top: the
 * content dissolves over [length] on an eased curve (a cosine ease-in-out: a straight ramp shows where
 * it starts and ends, and a single blur stops on a line of its own, so there is none), so a row slides
 * under a still bar or a sheet's title instead of being cut by it. A top that is the screen's own
 * (within [SCREEN_SLACK] of the status bar) stays a plain cut: what goes there leaves the screen. The
 * edge shows only while something lies beyond it, in step with how much (Android's own fading edges,
 * which React Native's ScrollView draws at full strength all the time): at the top of a list it is
 * crisp. The foot never fades: what lies under a scroller is a footer, which meets it with a hard line.
 *
 * It wraps the scroller (the first vertical `ScrollView` among its children: a FlatList's, a
 * SectionList's, one inside a pull-to-refresh) and draws its children itself: once into a
 * RenderNode, whose two strips are drawn again through their masks, and as they are when no edge
 * shows.
 */
class ScrollEdgesView(context: Context) : ReactViewGroup(context) {
  private val density = context.resources.displayMetrics.density

  private var length = 24f * density
  private var topEdge = true
  /** How far below the scroller's top its top strip stands: under a band that hides what scrolls beneath it (px). */
  private var insetTop = 0f

  /** How far the top edge shows, 0 to 1: what lies above it, over [length]. */
  private var topStrength = 0f

  private var scroller: ViewGroup? = null
  private val scrollerRect = Rect()
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
    invalidate()
  }

  fun setInsetTop(dp: Float) {
    insetTop = max(0f, dp) * density
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

  /** The vertical scroller it softens: found again when its children change. */
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
    if (view !== this && (view is ScrollView || view is NestedScrollView)) return view as ViewGroup
    if (depth == 0 || view !is ViewGroup) return null
    for (i in 0 until view.childCount) search(view.getChildAt(i), depth - 1)?.let { return it }
    return null
  }

  /** Reads how much lies above the top edge, and where the caret is; redraws only when that changes how it shows. */
  private fun measure() {
    val list = findScroller()
    var top = 0f
    if (list != null) {
      keepCaretClear(list)
      // Every frame: React Native resizes the scroller (the keyboard's room) outside Android's layout pass.
      followCaretOnResize(list)
      settledScrollY = list.scrollY
    }
    if (list != null && length > 0f) {
      val inner = list.getChildAt(0)
      val range = if (inner == null) 0 else max(0, inner.height - (list.height - list.paddingTop - list.paddingBottom))
      val y = list.scrollY.coerceIn(0, range)
      if (topEdge && !atScreenTop(list)) top = (y / length).coerceIn(0f, 1f)
    }
    val (lineTop, lineBottom) = caretLine(list)
    val caretMoved = !sameLine(lineTop, caretTop) || !sameLine(lineBottom, caretBottom)
    if (abs(top - topStrength) > 0.002f || caretMoved) {
      topStrength = top
      caretTop = lineTop
      caretBottom = lineBottom
      invalidate()
    }
  }

  private fun sameLine(a: Float, b: Float): Boolean = (a.isNaN() && b.isNaN()) || abs(a - b) < 0.5f

  /**
   * The scroller keeps what it brings into view (the caret as one types, a field taking focus) clear
   * of its edges by the fade's length, as Android's own ScrollView does for its fading edges: its
   * `computeScrollDeltaToGetChildRectOnScreen` keeps that room (at the foot too, so the line typed
   * never sits on a footer's line). Its own fade is never drawn: React Native's ScrollView draws one
   * only from its `fadingEdgeLength` prop, unset here (strength 0/0).
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
    if (focused is EditText && list != null && before >= 0 && list.scrollY != before && isAncestor(list, focused)) {
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
   * Whether the scroller's top is the screen's own: within [SCREEN_SLACK] of the status bar. What
   * leaves there leaves the screen; nothing of the app lies over it.
   */
  private fun atScreenTop(list: View): Boolean {
    val bars = ViewCompat.getRootWindowInsets(this)?.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
    list.getLocationInWindow(location)
    return location[1] + insetTop <= (bars?.top ?: 0) + SCREEN_SLACK * density
  }

  override fun dispatchDraw(canvas: Canvas) {
    val node = content
    val list = findScroller()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || node == null || list == null || !canvas.isHardwareAccelerated || topStrength <= 0f) {
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

    // Where the scroller lies here: the strip stands on its own top.
    list.getDrawingRect(scrollerRect)
    try {
      offsetDescendantRectToMyCoords(list, scrollerRect)
    } catch (_: IllegalArgumentException) {
      // No longer one of ours (its list was replaced): this frame as it is, the next finds the new one.
      scroller = null
      canvas.drawRenderNode(node)
      return
    }
    val listTop = (scrollerRect.top + insetTop).coerceIn(0f, h.toFloat())
    val listBottom = scrollerRect.bottom.toFloat().coerceIn(listTop, h.toFloat())
    // Never over the line being typed on: a strip it reaches stops at it (what is left of it, or none).
    var topEnd = listTop + min(length, listBottom - listTop)
    if (!caretTop.isNaN() && caretTop < topEnd && caretBottom > listTop) topEnd = max(listTop, min(topEnd, caretTop))
    if (topEnd - listTop < MIN_STRIP * density) {
      canvas.drawRenderNode(node)
      return
    }

    // What lies around the strip (above it, outside the scroller, and under it), as it is.
    canvas.save()
    canvas.clipRect(0f, 0f, w.toFloat(), topEnd)
    canvas.clipOutRect(0f, listTop, w.toFloat(), topEnd)
    canvas.drawRenderNode(node)
    canvas.restore()
    canvas.save()
    canvas.clipRect(0f, topEnd, w.toFloat(), h.toFloat())
    canvas.drawRenderNode(node)
    canvas.restore()

    drawStrip(canvas, node, listTop, topEnd, topStrength)
  }

  /**
   * The top edge: the content through a mask that keeps all of it at the strip's foot and less of it
   * toward the edge on the eased curve, by [strength] (at full strength, none at the edge).
   */
  private fun drawStrip(canvas: Canvas, node: RenderNode, y0: Float, y1: Float, strength: Float) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || y1 <= y0) return
    val w = width.toFloat()
    val layer = canvas.saveLayer(0f, y0, w, y1, null)
    canvas.save()
    canvas.clipRect(0f, y0, w, y1)
    canvas.drawRenderNode(node)
    canvas.restore()
    for (i in 0 until EASE_STEPS) colors[i] = alpha(1f - strength * (1f - shown[i]))
    mask.shader = LinearGradient(0f, y0, 0f, y1, colors, positions, Shader.TileMode.CLAMP)
    canvas.drawRect(0f, y0, w, y1, mask)
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

    /** Shorter than this (dp), what is left of the strip above the caret's line is not drawn: it would be a cut. */
    private const val MIN_STRIP = 6f
  }
}
