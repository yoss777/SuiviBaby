import { doc, updateDoc } from "firebase/firestore";
import { updateChildAccess } from "@/utils/permissions";

describe("updateChildAccess", () => {
  beforeEach(() => {
    (doc as jest.Mock).mockReturnValue({ id: "access-ref" });
    (updateDoc as jest.Mock).mockResolvedValue(undefined);
  });

  it("resets write flags to the new role's defaults when demoting to viewer", async () => {
    await updateChildAccess("c1", "u2", { role: "viewer" });
    expect(updateDoc).toHaveBeenCalledWith(
      { id: "access-ref" },
      { role: "viewer", canWriteEvents: false, canWriteLikes: false, canWriteComments: false }
    );
  });

  it("grants the admin flags when promoting to admin", async () => {
    await updateChildAccess("c1", "u2", { role: "admin" });
    expect(updateDoc).toHaveBeenCalledWith(
      { id: "access-ref" },
      expect.objectContaining({ role: "admin", canWriteEvents: true })
    );
  });

  it("keeps explicit flags and leaves flags untouched without a role change", async () => {
    await updateChildAccess("c1", "u2", { role: "viewer", canWriteComments: true });
    expect(updateDoc).toHaveBeenLastCalledWith(
      { id: "access-ref" },
      expect.objectContaining({ role: "viewer", canWriteComments: true, canWriteEvents: false })
    );
    await updateChildAccess("c1", "u2", { canWriteLikes: true });
    expect(updateDoc).toHaveBeenLastCalledWith({ id: "access-ref" }, { canWriteLikes: true });
  });
});
