import { getDocs, getDoc, query, collection, where, doc } from "firebase/firestore";
import { babyService } from "@/services/babyService";

// Mock config/firebase
jest.mock("@/config/firebase", () => ({
  db: {},
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("babyService", () => {
  describe("getByParentId", () => {
    it("should return children the user has access to via user_child_access", async () => {
      // Mock user_child_access query
      (getDocs as jest.Mock).mockResolvedValueOnce({
        docs: [
          { data: () => ({ childId: "child1", userId: "parent1" }) },
          { data: () => ({ childId: "child2", userId: "parent1" }) },
        ],
      });

      // Mock individual child doc fetches
      (getDoc as jest.Mock)
        .mockResolvedValueOnce({
          exists: () => true,
          id: "child1",
          data: () => ({ name: "Alice", gender: "female" }),
        })
        .mockResolvedValueOnce({
          exists: () => true,
          id: "child2",
          data: () => ({ name: "Bob", gender: "male" }),
        });

      const babies = await babyService.getByParentId("parent1");

      expect(babies).toHaveLength(2);
      expect(babies[0].name).toBe("Alice");
      expect(babies[1].name).toBe("Bob");
    });

    it("should return empty array when user has no children", async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce({ docs: [] });

      const babies = await babyService.getByParentId("parent_no_kids");

      expect(babies).toHaveLength(0);
    });

    it("should return empty array on error (no fallback to getAll)", async () => {
      (getDocs as jest.Mock).mockRejectedValueOnce(new Error("Permission denied"));

      const babies = await babyService.getByParentId("parent1");

      // Should return [] without calling getAll (which was the security fix)
      expect(babies).toHaveLength(0);
      // getDoc should not have been called (no fallback to list all children)
      expect(getDoc).not.toHaveBeenCalled();
    });
  });
});
