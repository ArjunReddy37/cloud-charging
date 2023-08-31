import { performance } from "perf_hooks";
import supertest from "supertest";
import { buildApp } from "./app";

const app = supertest(buildApp());

async function resetTest() {
    await app.post("/reset").send({
        account: "resetAccount",
    }).expect(204);
    await app.post("/charge").send({
        account: "resetAccount",
        charges: 0
    }).expect(200, {
        isAuthorized: true, remainingBalance: 100, charges: 0
    });
}

async function badChargeRequestTest() {
    await app.post("/reset").send({
        account: "badChargeRequesAccount",
    }).expect(204);
    await app.post("/charge").send({
        account: "badChargeRequesAccount",
        charges: -10
    }).expect(400);
}

async function chargeTest() {
    await app.post("/reset").send({
        account: "test",
    }).expect(204);
    await app.post("/charge").send({
        account: "test",
        charges: 0
    }).expect(200, {
        isAuthorized: true, remainingBalance: 100, charges: 0
    });
    await app.post("/charge").send({
        account: "test",
        charges: 10
    }).expect(200, {
        isAuthorized: true, remainingBalance: 90, charges: 10
    });
    await app.post("/charge").send({
        account: "test",
        charges: 70
    }).expect(200, {
        isAuthorized: true, remainingBalance: 20, charges: 70
    });
    await app.post("/charge").send({
        account: "test",
        charges: 100
    }).expect(200, {
        isAuthorized: false, remainingBalance: 20, charges: 0
    });
    await app.post("/charge").send({
        account: "test",
        charges: 100
    }).expect(200, {
        isAuthorized: false, remainingBalance: 20, charges: 0
    });
}


async function basicLatencyTest() {
    await app.post("/reset").expect(204);
    const start = performance.now();
    const times = 10;
    for (let i=0; i<times; i++) {
        await app.post("/charge").expect(200);
    }
    console.log(`Latency: ${(performance.now() - start)/times} ms`);
}

async function runTests() {
    await resetTest();
    await chargeTest();
    await badChargeRequestTest();
    await basicLatencyTest();
}

runTests().catch(console.error);
