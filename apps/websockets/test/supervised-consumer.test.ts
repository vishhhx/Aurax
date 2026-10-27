import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { Consumer } from "kafkajs";
import { SupervisedConsumer } from "../src/kafka/supervised-consumer";

/** Minimal stand-in for a kafkajs Consumer: emits events, records lifecycle. */
function fakeConsumerFactory() {
  const created: Array<{ emitter: EventEmitter; deliver: (v: string) => Promise<void>; disconnected: boolean }> = [];
  const factory = () => {
    const emitter = new EventEmitter();
    let handler: ((p: any) => Promise<void>) | undefined;
    const entry = {
      emitter,
      disconnected: false,
      deliver: async (v: string) => handler?.({ message: { value: Buffer.from(v), offset: "0" }, partition: 0 }),
    };
    created.push(entry);
    const consumer = {
      events: { CRASH: "consumer.crash", GROUP_JOIN: "consumer.group_join" },
      on: (e: string, cb: (...a: any[]) => void) => emitter.on(e, cb),
      connect: async () => undefined,
      subscribe: async () => undefined,
      run: async ({ eachMessage }: { eachMessage: (p: any) => Promise<void> }) => {
        handler = eachMessage;
        emitter.emit("consumer.group_join", {});
      },
      disconnect: async () => {
        entry.disconnected = true;
      },
    };
    return consumer as unknown as Consumer;
  };
  return { created, factory };
}

describe("SupervisedConsumer", () => {
  test("a non-retriable crash recreates the consumer and delivery resumes", async () => {
    const received: string[] = [];
    const { created, factory } = fakeConsumerFactory();
    const sc = new SupervisedConsumer(
      { name: "t", groupId: "g", topic: "x", fromBeginning: false, ephemeralGroup: false, onMessage: async (p) => void received.push(String(p.message.value)) },
      factory,
      5,
    );
    await sc.start();
    await created[0]!.deliver("one");

    created[0]!.emitter.emit("consumer.crash", { payload: { error: new Error("broker gone"), restart: false } });
    expect(sc.running).toBe(false);
    await new Promise((r) => setTimeout(r, 30));

    expect(created).toHaveLength(2);
    expect(created[0]!.disconnected).toBe(true);
    expect(sc.running).toBe(true);
    await created[1]!.deliver("two");
    expect(received).toEqual(["one", "two"]);
    await sc.stop();
  });

  test("handler errors are contained per message", async () => {
    const { created, factory } = fakeConsumerFactory();
    let ok = 0;
    const sc = new SupervisedConsumer(
      {
        name: "t",
        groupId: "g",
        topic: "x",
        fromBeginning: false,
        ephemeralGroup: false,
        onMessage: async (p) => {
          if (String(p.message.value) === "bad") throw new Error("boom");
          ok++;
        },
      },
      factory,
      5,
    );
    await sc.start();
    await created[0]!.deliver("bad");
    await created[0]!.deliver("good");
    expect(ok).toBe(1);
    await sc.stop();
  });
});
