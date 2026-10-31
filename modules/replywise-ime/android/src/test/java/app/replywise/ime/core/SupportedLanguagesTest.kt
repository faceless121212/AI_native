package app.replywise.ime.core

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SupportedLanguagesTest {
  @Test
  fun tagsMatchV1Markets() {
    assertEquals(listOf("en-GB", "de", "fr", "es", "it"), SupportedLanguages.TAGS)
    assertEquals("en-GB", SupportedLanguages.FALLBACK)
  }

  @Test
  fun exactTags() {
    for (tag in SupportedLanguages.TAGS) {
      assertEquals(tag, SupportedLanguages.fromLanguageTag(tag))
    }
  }

  @Test
  fun regionalVariantsCaseAndUnderscore() {
    assertEquals("de", SupportedLanguages.fromLanguageTag("de-AT"))
    assertEquals("fr", SupportedLanguages.fromLanguageTag("fr_CH"))
    assertEquals("es", SupportedLanguages.fromLanguageTag("ES-mx"))
    assertEquals("it", SupportedLanguages.fromLanguageTag(" it "))
    assertEquals("en-GB", SupportedLanguages.fromLanguageTag("en-US"))
  }

  @Test
  fun unsupportedTags() {
    assertNull(SupportedLanguages.fromLanguageTag("pt-BR"))
    assertNull(SupportedLanguages.fromLanguageTag(""))
    assertNull(SupportedLanguages.fromLanguageTag("-"))
    assertNull(SupportedLanguages.fromLanguageTag("english"))
  }

  /** The IME subtypes in res/xml/method.xml must be exactly the supported languages, in order. */
  @Test
  fun methodXmlSubtypesMatchSupportedLanguages() {
    // Gradle runs JVM unit tests with the module directory as working directory.
    val methodXml = File("src/main/res/xml/method.xml")
    val doc = DocumentBuilderFactory.newInstance()
      .apply { isNamespaceAware = true }
      .newDocumentBuilder()
      .parse(methodXml)
    val subtypes = doc.getElementsByTagName("subtype")
    val androidNs = "http://schemas.android.com/apk/res/android"
    val tags = (0 until subtypes.length).map { i ->
      (subtypes.item(i) as org.w3c.dom.Element).getAttributeNS(androidNs, "languageTag")
    }
    val modes = (0 until subtypes.length).map { i ->
      (subtypes.item(i) as org.w3c.dom.Element).getAttributeNS(androidNs, "imeSubtypeMode")
    }
    assertEquals(SupportedLanguages.TAGS, tags)
    assertEquals(List(SupportedLanguages.TAGS.size) { "keyboard" }, modes)
  }
}
