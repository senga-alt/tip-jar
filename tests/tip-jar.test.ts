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