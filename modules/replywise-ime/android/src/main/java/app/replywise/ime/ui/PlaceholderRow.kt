package app.replywise.ime.ui

import android.content.Context
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import app.replywise.ime.R

/**
 * Prompt 0 placeholder keyboard view: [switch-keyboard key] [title]. Plain Views, built in code.
 */
class PlaceholderRow(context: Context, onSwitchKeyboard: () -> Unit) {
  private val switchKey: ImageButton
  val view: View

  init {
    val title = TextView(context).apply {
      setText(R.string.replywise_ime_placeholder)
      // sp, so it follows the user's font scale.
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      gravity = Gravity.CENTER_VERTICAL
      maxLines = 1
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f)
    }

    switchKey = ImageButton(context).apply {
      setImageResource(R.drawable.replywise_ime_ic_language)
      imageTintList = title.textColors
      contentDescription = context.getString(R.string.replywise_ime_next_keyboard)
      background = selectableBackground(context)
      // 48dp: Android's minimum touch target.
      val size = context.dp(48)
      layoutParams = LinearLayout.LayoutParams(size, size).apply { gravity = Gravity.CENTER_VERTICAL }
      setOnClickListener { onSwitchKeyboard() }
      visibility = View.GONE
    }

    view = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      minimumHeight = context.dp(56)
      val pad = context.dp(8)
      setPadding(pad, pad / 2, pad, pad / 2)
      addView(switchKey)
      addView(title)
    }
  }

  fun setSwitchKeyVisible(visible: Boolean) {
    switchKey.visibility = if (visible) View.VISIBLE else View.GONE
  }

  private fun selectableBackground(context: Context) =
    TypedValue().let { value ->
      val found = context.theme.resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, value, true)
      if (found && value.resourceId != 0) context.getDrawable(value.resourceId) else null
    }

  private fun Context.dp(value: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()
}
