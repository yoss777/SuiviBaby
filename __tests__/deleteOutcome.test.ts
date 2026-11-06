import { DELETE_QUEUED_MESSAGE, deleteToastMessage } from "@/utils/deleteOutcome";

describe("deleteToastMessage (M5)", () => {
  it("says « supprimé » only when the server really deleted", () => {
    expect(deleteToastMessage("deleted", "Activité supprimée")).toBe("Activité supprimée");
  });

  it("says the synchronisation is pending when the deletion was only queued", () => {
    expect(deleteToastMessage("queued", "Activité supprimée")).toBe(
      "Suppression enregistrée : synchronisation en attente",
    );
    expect(DELETE_QUEUED_MESSAGE).toBe("Suppression enregistrée : synchronisation en attente");
  });

  it("keeps the usual text for a legacy void result", () => {
    expect(deleteToastMessage(undefined, "Jalon supprimé")).toBe("Jalon supprimé");
  });
});
