/* global describe, it, expect */
const { addRecentsGuard } = require("../plugins/withIgnoreLinkFromRecents");

const MAIN_ACTIVITY = `class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }
}`;

describe("plugin withIgnoreLinkFromRecents (lien du widget rejoué depuis les apps récentes)", () => {
  it("efface le lien avant super.onCreate quand l'app est relancée depuis les récentes", () => {
    const out = addRecentsGuard(MAIN_ACTIVITY);
    const guard = out.indexOf("FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(out.indexOf("super.onCreate(null)"));
    expect(out).toContain("intent.data = null");
  });

  it("idempotent : une seule insertion après deux passages", () => {
    const twice = addRecentsGuard(addRecentsGuard(MAIN_ACTIVITY));
    expect(twice.match(/FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY/g)).toHaveLength(1);
  });
});
