package expo.modules.widgetpush

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class WidgetPushGuardsTest {
  private fun decide(
    childId: String? = "c1",
    seq: Long = 2_000_000L,
    v: Int = 1,
    shown: String? = "c1",
    lastSeq: Long = 1_000_000L,
    appAt: Long = 0L,
    fg: Boolean = false,
  ) = WidgetPushGuards.decide(childId, seq, v, shown, lastSeq, appAt, fg)

  @Test fun appliesAFresherMessageForTheShownChild() = assertEquals(WidgetPushOutcome.APPLIED, decide())
  @Test fun appliesWhenTheShownChildIsUnknown() = assertEquals(WidgetPushOutcome.APPLIED, decide(shown = null))
  @Test fun ignoresAnotherChild() = assertEquals(WidgetPushOutcome.OTHER_CHILD, decide(shown = "c2"))
  @Test fun ignoresAnOlderOrDuplicateMessage() {
    assertEquals(WidgetPushOutcome.STALE_SEQ, decide(seq = 1_000_000L))
    assertEquals(WidgetPushOutcome.STALE_SEQ, decide(seq = 900_000L))
  }
  @Test fun ignoresWhileTheAppIsVisible() = assertEquals(WidgetPushOutcome.FOREGROUND, decide(fg = true))
  @Test fun neverGoesBackBeforeTheAppsOwnWrite() {
    assertEquals(WidgetPushOutcome.OLDER_THAN_APP, decide(seq = 2_000_000L, appAt = 2_010_000L))
    // Tolérance d'horloge de 2 s.
    assertEquals(WidgetPushOutcome.APPLIED, decide(seq = 2_000_000L, appAt = 2_001_500L))
  }
  @Test fun rejectsInvalidMessages() {
    assertEquals(WidgetPushOutcome.INVALID, decide(childId = null))
    assertEquals(WidgetPushOutcome.INVALID, decide(seq = 0L))
    assertEquals(WidgetPushOutcome.INVALID, decide(v = 2))
  }

  @Test fun parsesTheExpoBodyAndIgnoresOtherMessages() {
    val msg = WidgetPushHandler.parse(mapOf("body" to """{"t":"w1","c":"c1","s":5,"p":{"v":1,"childName":"Léa"}}"""))
    assertNotNull(msg)
    assertEquals("Léa", WidgetPushHandler.props(msg!!)!!.getString("childName"))
    assertNull(WidgetPushHandler.parse(mapOf("body" to """{"type":"reminder"}""")))
    assertNull(WidgetPushHandler.parse(mapOf("title" to "Rappel")))
  }

  @Test fun parsesFlatData() {
    val msg = WidgetPushHandler.parse(mapOf("t" to "w1", "c" to "c1", "s" to "5", "p" to """{"v":1}"""))
    assertNotNull(msg)
    assertEquals(1, WidgetPushHandler.props(msg!!)!!.getInt("v"))
  }
}
