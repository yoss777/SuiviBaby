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
  @Test fun ignoresWhenNoChildIsShown() = assertEquals(WidgetPushOutcome.OTHER_CHILD, decide(shown = null))
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
  @Test fun phoneClockAheadNoLongerRejectsFreshMessages() {
    // Téléphone en avance d'une minute : l'app a écrit à 2_000_000 (serveur) = 2_060_000 (téléphone).
    val appAt = 2_060_000L
    assertEquals(WidgetPushOutcome.OLDER_THAN_APP, WidgetPushGuards.decide("c1", 2_001_000L, 1, "c1", 0L, appAt, false))
    assertEquals(WidgetPushOutcome.APPLIED, WidgetPushGuards.decide("c1", 2_001_000L, 1, "c1", 0L, appAt, false, clockOffsetMs = 60_200L, receivedAtMs = 2_062_200L))
    // Vieux message (lu 10 s avant l'écriture de l'app) : toujours refusé.
    assertEquals(WidgetPushOutcome.OLDER_THAN_APP, WidgetPushGuards.decide("c1", 1_990_000L, 1, "c1", 0L, appAt, false, clockOffsetMs = 60_200L, receivedAtMs = 2_080_000L))
  }
  @Test fun theAppGuardOnlyPlaysRightAfterAnAppWrite() {
    // Estimation faussée d'une heure : plus de blocage 10 min après l'écriture de l'app.
    assertEquals(WidgetPushOutcome.APPLIED, WidgetPushGuards.decide("c1", 2_060_000L, 1, "c1", 0L, 2_000_000L, false, clockOffsetMs = -3_600_000L, receivedAtMs = 2_000_000L + 11 * 60_000L))
  }
  @Test fun aClockMovedBackAfterAnAppWriteNeverFreezesTheWidget() {
    // L'app écrit à 2 000 000, puis l'heure du téléphone recule d'une heure.
    assertEquals(WidgetPushOutcome.APPLIED, WidgetPushGuards.decide("c1", 1_000_000L, 1, "c1", 0L, 2_000_000L, false, receivedAtMs = 2_000_000L - 3_600_000L))
    // Dans la tolérance (2 s) : la garde joue toujours.
    assertEquals(WidgetPushOutcome.OLDER_THAN_APP, WidgetPushGuards.decide("c1", 1_000_000L, 1, "c1", 0L, 2_000_000L, false, receivedAtMs = 2_000_000L - 1_000L))
  }
  @Test fun rejectsAnAbsurdSequence() =
    assertEquals(WidgetPushOutcome.INVALID, decide(seq = Long.MAX_VALUE))
  @Test fun estimatesTheClockOffsetFromTheLastDay() {
    val now = 1_000_000_000_000L
    assertEquals(60_200L, WidgetPushGuards.clockOffsetMs(listOf(60_300L to now - 10, 60_200L to now - 20), now))
    assertEquals(0L, WidgetPushGuards.clockOffsetMs(emptyList(), now))
    assertEquals(0L, WidgetPushGuards.clockOffsetMs(listOf(60_200L to now - 25 * 3_600_000L), now))
    assertEquals(-30_000L, WidgetPushGuards.clockOffsetMs(listOf(-30_000L to now - 10), now))
    assertEquals(10, WidgetPushGuards.nextOffsetSamples((0L until 12L).map { (60_000L + it) to (now - it) }, 60_500L, now).size)
  }
  @Test fun parsesAndFormatsStoredSamples() {
    val samples = listOf(60_200L to 1_000L, -30_000L to 2_000L)
    assertEquals(samples, WidgetPushGuards.parseOffsets(WidgetPushGuards.formatOffsets(samples)))
    assertEquals(emptyList<Pair<Long, Long>>(), WidgetPushGuards.parseOffsets(null))
    assertEquals(listOf(5L to 6L), WidgetPushGuards.parseOffsets("abc,1:2:3,5:6,7"))
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

  @Test fun recognisesWidgetMessagesEvenMalformed() {
    assertEquals(true, WidgetPushHandler.isWidgetMessage(mapOf("t" to "w1")))
    assertEquals(true, WidgetPushHandler.isWidgetMessage(mapOf("body" to """{"t": "w1", "p": {bad""")))
    assertEquals(true, WidgetPushHandler.isWidgetMessage(mapOf("body" to """{"t":"w1","c":"c1"}""")))
    assertEquals(false, WidgetPushHandler.isWidgetMessage(mapOf("body" to """{"type":"reminder"}""")))
    assertEquals(false, WidgetPushHandler.isWidgetMessage(mapOf("title" to "Rappel")))
  }

  @Test fun wipesOnlyTheShownChild() {
    assertEquals(WidgetPushOutcome.WIPED, WidgetPushGuards.decideWipe("c1", "c1"))
    assertEquals(WidgetPushOutcome.OTHER_CHILD, WidgetPushGuards.decideWipe("c1", "c2"))
    assertEquals(WidgetPushOutcome.OTHER_CHILD, WidgetPushGuards.decideWipe("c1", null))
    assertEquals(WidgetPushOutcome.INVALID, WidgetPushGuards.decideWipe(null, "c1"))
  }
}
