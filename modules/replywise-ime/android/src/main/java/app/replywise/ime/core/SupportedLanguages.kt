package app.replywise.ime.core

/**
 * The five keyboard / reply languages of v1. Pure Kotlin (no Android imports) so it runs in JVM
 * unit tests. Mirrors targets/keyboard/Core/SupportedLanguage.swift; tags must match the IME
 * subtypes in res/xml/method.xml.
 */
object SupportedLanguages {
  const val FALLBACK: String = "en-GB"

  val TAGS: List<String> = listOf("en-GB", "de", "fr", "es", "it")

  private val NON_ENGLISH = setOf("de", "fr", "es", "it")

  /**
   * Maps a language tag such as "de-AT", "en_US" or "FR" to a supported tag. Only the primary
   * subtag matters; every English variant maps to en-GB. Returns null for unsupported or empty tags.
   */
  fun fromLanguageTag(tag: String): String? {
    val primary = tag.trim()
      .replace('_', '-')
      .lowercase()
      .split('-')
      .firstOrNull { it.isNotEmpty() }
      ?: return null
    return when (primary) {
      "en" -> FALLBACK
      in NON_ENGLISH -> primary
      else -> null
    }
  }
}
