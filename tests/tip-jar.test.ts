import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const creator1 = accounts.get("wallet_1")!;
const creator2 = accounts.get("wallet_2")!;
const tipper1 = accounts.get("wallet_3")!;
const tipper2 = accounts.get("wallet_4")!;

const contractName = "tip-jar";
const sbtcToken = "sbtc-token";

describe("Tip Jar Contract", () => {
  beforeEach(() => {
    simnet.setEpoch("3.0");
  });

  describe("Creator Registration", () => {
    it("allows a user to register as a creator", () => {
      const displayName = "Alice Creator";
      const { result } = simnet.callPublicFn(
        contractName,
        "register-creator",
        [Cl.stringUtf8(displayName)],
        creator1
      );
      
      expect(result).toBeOk(Cl.bool(true));
      
      // Verify creator info was stored
      const creatorInfo = simnet.callReadOnlyFn(
        contractName,
        "get-creator-info",
        [Cl.principal(creator1)],
        creator1
      );
      
      expect(creatorInfo.result).toBeSome(
        Cl.tuple({
          "display-name": Cl.stringUtf8(displayName),
          "registered-at": Cl.uint(simnet.blockHeight),
          "total-received": Cl.uint(0),
          "tip-count": Cl.uint(0)
        })
      );
    });

    it("prevents duplicate registration", () => {
      simnet.callPublicFn(
        contractName,
        "register-creator",
        [Cl.stringUtf8("First Name")],
        creator1
      );
      
      const { result } = simnet.callPublicFn(
        contractName,
        "register-creator",
        [Cl.stringUtf8("Second Name")],
        creator1
      );
      
      expect(result).toBeErr(Cl.uint(101)); // err-already-registered
    });

    it("rejects empty display names", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "register-creator",
        [Cl.stringUtf8("")],
        creator1
      );
      
      expect(result).toBeErr(Cl.uint(105)); // err-invalid-name
    });

    it("rejects display names longer than 50 characters", () => {
      const longName = "A".repeat(51);
      const { result } = simnet.callPublicFn(
        contractName,
        "register-creator",
        [Cl.stringUtf8(longName)],
        creator1
      );
      
      expect(result).toBeErr(Cl.uint(105)); // err-invalid-name
    });

    it("allows updating display name", () => {
      simnet.callPublicFn(
        contractName,
        "register-creator",
        [Cl.stringUtf8("Original Name")],
        creator1
      );
      
      const newName = "Updated Name";
      const { result } = simnet.callPublicFn(
        contractName,
        "update-display-name",
        [Cl.stringUtf8(newName)],
        creator1
      );
      
      expect(result).toBeOk(Cl.bool(true));
      
      const creatorInfo = simnet.callReadOnlyFn(
        contractName,
        "get-creator-info",
        [Cl.principal(creator1)],
        creator1
      );
      
      const tuple = creatorInfo.result as any;
      expect(tuple.value.data["display-name"]).toStrictEqual(Cl.stringUtf8(newName));
    });

    it("prevents non-registered users from updating display name", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "update-display-name",
        [Cl.stringUtf8("New Name")],
        creator1
      );
      
      expect(result).toBeErr(Cl.uint(102)); // err-not-registered
    });
  });

  describe("Sending Tips", () => {
    beforeEach(() => {
      // Register creator
      simnet.callPublicFn(
        contractName,
        "register-creator",
        [Cl.stringUtf8("Test Creator")],
        creator1
      );
      
      // Mint some sBTC to tipper
      simnet.callPublicFn(
        sbtcToken,
        "mint",
        [Cl.uint(1000000), Cl.principal(tipper1)],
        deployer
      );
    });

    it("allows sending a valid tip", () => {
      const amount = 50000; // 0.0005 sBTC
      const message = "Great content!";
      
      const { result } = simnet.callPublicFn(
        contractName,
        "send-tip",
        [
          Cl.principal(creator1),
          Cl.uint(amount),
          Cl.some(Cl.stringUtf8(message))
        ],
        tipper1
      );
      
      expect(result).toBeOk(Cl.uint(1)); // Returns tip ID
      
      // Verify tip was recorded
      const tipInfo = simnet.callReadOnlyFn(
        contractName,
        "get-tip",
        [Cl.uint(1)],
        tipper1
      );
      
      expect(tipInfo.result).toBeSome(
        Cl.tuple({
          tipper: Cl.principal(tipper1),
          recipient: Cl.principal(creator1),
          amount: Cl.uint(amount),
          message: Cl.some(Cl.stringUtf8(message)),
          timestamp: Cl.uint(simnet.blockHeight),
          "block-height": Cl.uint(simnet.blockHeight)
        })
      );
      
      // Verify creator stats updated
      const creatorInfo = simnet.callReadOnlyFn(
        contractName,
        "get-creator-info",
        [Cl.principal(creator1)],
        creator1
      );
      
      const tuple = creatorInfo.result as any;
      expect(tuple.value.data["total-received"]).toStrictEqual(Cl.uint(amount));
      expect(tuple.value.data["tip-count"]).toStrictEqual(Cl.uint(1));
    });

    it("allows sending a tip without a message", () => {
      const amount = 50000;
      
      const { result } = simnet.callPublicFn(
        contractName,
        "send-tip",
        [
          Cl.principal(creator1),
          Cl.uint(amount),
          Cl.none()
        ],
        tipper1
      );
      
      expect(result).toBeOk(Cl.uint(1));
    });

    it("rejects tips below minimum amount", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "send-tip",
        [
          Cl.principal(creator1),
          Cl.uint(5000), // Below min-tip-amount (10000)
          Cl.none()
        ],
        tipper1
      );
      
      expect(result).toBeErr(Cl.uint(103)); // err-invalid-amount
    });

    it("rejects tips above maximum amount", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "send-tip",
        [
          Cl.principal(creator1),
          Cl.uint(2000000000), // Above max-tip-amount (1000000000)
          Cl.none()
        ],
        tipper1
      );
      
      expect(result).toBeErr(Cl.uint(103)); // err-invalid-amount
    });

    it("rejects tips to unregistered creators", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "send-tip",
        [
          Cl.principal(creator2), // Not registered
          Cl.uint(50000),
          Cl.none()
        ],
        tipper1
      );
      
      expect(result).toBeErr(Cl.uint(102)); // err-not-registered
    });

    it("rejects self-tipping", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "send-tip",
        [
          Cl.principal(creator1),
          Cl.uint(50000),
          Cl.none()
        ],
        creator1
      );
      
      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });

    it("rejects messages longer than 280 characters", () => {
      const longMessage = "A".repeat(281);
      
      const { result } = simnet.callPublicFn(
        contractName,
        "send-tip",
        [
          Cl.principal(creator1),
          Cl.uint(50000),
          Cl.some(Cl.stringUtf8(longMessage))
        ],
        tipper1
      );
      
      expect(result).toBeErr(Cl.uint(106)); // err-message-too-long
    });

    it("tracks multiple tips correctly", () => {
      // Send first tip
      simnet.callPublicFn(
        contractName,
        "send-tip",
        [Cl.principal(creator1), Cl.uint(50000), Cl.none()],
        tipper1
      );
      
      // Send second tip
      simnet.callPublicFn(
        contractName,
        "send-tip",
        [Cl.principal(creator1), Cl.uint(30000), Cl.none()],
        tipper1
      );
      
      // Verify creator stats
      const creatorInfo = simnet.callReadOnlyFn(
        contractName,
        "get-creator-info",
        [Cl.principal(creator1)],
        creator1
      );
      
      const tuple = creatorInfo.result as any;
      expect(tuple.value.data["total-received"]).toStrictEqual(Cl.uint(80000));
      expect(tuple.value.data["tip-count"]).toStrictEqual(Cl.uint(2));
    });
  });

  describe("Read-Only Functions", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        contractName,
        "register-creator",
        [Cl.stringUtf8("Test Creator")],
        creator1
      );
      
      simnet.callPublicFn(
        sbtcToken,
        "mint",
        [Cl.uint(1000000), Cl.principal(tipper1)],
        deployer
      );
    });

    it("checks if a user is a creator", () => {
      const { result: isCreator } = simnet.callReadOnlyFn(
        contractName,
        "is-creator",
        [Cl.principal(creator1)],
        tipper1
      );
      
      expect(isCreator).toBeBool(true);
      
      const { result: notCreator } = simnet.callReadOnlyFn(
        contractName,
        "is-creator",
        [Cl.principal(tipper1)],
        tipper1
      );
      
      expect(notCreator).toBeBool(false);
    });

    it("gets tip counter", () => {
      const { result: initialCounter } = simnet.callReadOnlyFn(
        contractName,
        "get-tip-counter",
        [],
        tipper1
      );

      expect(initialCounter).toBeUint(0);
      
      simnet.callPublicFn(
        contractName,
        "send-tip",
        [Cl.principal(creator1), Cl.uint(50000), Cl.none()],
        tipper1
      );
      
      const { result: afterTip } = simnet.callReadOnlyFn(
        contractName,
        "get-tip-counter",
        [],
        tipper1
      );
      
      expect(afterTip).toBeUint(1);
    });

    it("gets platform stats", () => {
      simnet.callPublicFn(
        contractName,
        "send-tip",
        [Cl.principal(creator1), Cl.uint(50000), Cl.none()],
        tipper1
      );
      
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-platform-stats",
        [],
        tipper1
      );
      
      expect(result).toBeTuple({
        "total-tips": Cl.uint(1),
        "total-volume": Cl.uint(50000)
      });
    });

    it("gets tipper stats", () => {
      simnet.callPublicFn(
        contractName,
        "send-tip",
        [Cl.principal(creator1), Cl.uint(50000), Cl.none()],
        tipper1
      );
      
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-tipper-stats",
        [Cl.principal(creator1), Cl.principal(tipper1)],
        tipper1
      );
      
      expect(result).toBeSome(
        Cl.tuple({
          "total-tipped": Cl.uint(50000),
          "tip-count": Cl.uint(1),
          "last-tip-at": Cl.uint(simnet.blockHeight)
        })
      );
    });

    it("gets creator tip IDs", () => {
      simnet.callPublicFn(
        contractName,
        "send-tip",
        [Cl.principal(creator1), Cl.uint(50000), Cl.none()],
        tipper1
      );
      
      simnet.callPublicFn(
        contractName,
        "send-tip",
        [Cl.principal(creator1), Cl.uint(30000), Cl.none()],
        tipper1
      );
      
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-creator-tip-ids",
        [Cl.principal(creator1)],
        tipper1
      );
      
      expect(result).toBeList([Cl.uint(1), Cl.uint(2)]);
    });

    it("gets recent tips", () => {
      // Send 3 tips
      simnet.callPublicFn(
        contractName,
        "send-tip",
        [Cl.principal(creator1), Cl.uint(10000), Cl.none()],
        tipper1
      );
      
      simnet.callPublicFn(
        contractName,
        "send-tip",
        [Cl.principal(creator1), Cl.uint(20000), Cl.none()],
        tipper1
      );
      
      simnet.callPublicFn(
        contractName,
        "send-tip",
        [Cl.principal(creator1), Cl.uint(30000), Cl.none()],
        tipper1
      );
      
      // Get last 2 tips
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-recent-tips",
        [Cl.principal(creator1), Cl.uint(2)],
        tipper1
      );
      
      // Should return tips 2 and 3
      const list = result as any;
      expect(list.list).toHaveLength(2);
    });
  });