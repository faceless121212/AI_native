package app.replywise.ime.core

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

/**
 * The keyboard strings generated from locales/<lang>/keyboard.json (res/values/keyboard_strings.xml
 * and res/values-<lang>/keyboard_strings.xml) must have the same names and format arguments in
 * every language.
 */
class GeneratedStringsTest {
  private val dirs = listOf("values", "values-de", "values-fr", "values-es", "values-it")

  private fun parse(dir: String): Map<String, List<String>> {
    val file = File("src/main/res/$dir/keyboard_strings.xml")
    assertTrue("missing ${file.path}; run npm run gen", file.exists())
    val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
    val out = linkedMapOf<String, List<String>>()
    val strings = doc.getElementsByTagName("string")
    for (i in 0 until strings.length) {
      val el = strings.item(i) as Element
      out[el.getAttribute("name")] = listOf(el.textContent)
    }
    val plurals = doc.getElementsByTagName("plurals")
    for (i in 0 until plurals.length) {
      val el = plurals.item(i) as Element
      val items = el.getElementsByTagName("item")
      out[el.getAttribute("name")] = (0 until items.length).map { items.item(it).textContent }
    }
    return out
  }

  private fun formatArgs(text: String) = Regex("%\\d+\\$[sd]").findAll(text).map { it.value }.toSortedSet()

  @Test
  fun everyLanguageHasTheSameStringsAndArguments() {
    val source = parse("values")
    assertTrue(source.containsKey("kb_app_name"))
    for (dir in dirs.drop(1)) {
      val translated = parse(dir)
      assertEquals("names in $dir", source.keys, translated.keys)
      for ((name, values) in source) {
        val expected = values.flatMap { formatArgs(it) }.toSortedSet()
        val actual = translated.getValue(name).flatMap { formatArgs(it) }.toSortedSet()
        assertEquals("$dir/$name arguments", expected, actual)
        translated.getValue(name).forEach { assertTrue("$dir/$name is empty", it.isNotBlank()) }
      }
    }
  }
}
