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