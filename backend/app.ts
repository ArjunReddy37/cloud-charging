import express from "express";
import { createClient } from "redis";
import { json } from "body-parser";

const DEFAULT_BALANCE = 100;

let reusableRedisClient: ReturnType<typeof createClient> | null = null;
const reuseRedisClient = true;
const pingRedisClient = false;

interface ChargeResult {
    isAuthorized: boolean;
    remainingBalance: number;
    charges: number;
}

async function createReusableRedisClient(): Promise<ReturnType<typeof createClient>> {
    const url = `redis://${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`;
    console.log(`Using redis URL ${url}`);
    const client = createClient({ url });
    await client.connect();
    return client;
}

async function connect(): Promise<ReturnType<typeof createClient>> {
    if (reusableRedisClient == null) {
        reusableRedisClient = await createReusableRedisClient();
        return reusableRedisClient;
    }
    try {
        if (pingRedisClient) {
            await reusableRedisClient.ping();
        }
    } catch (error) {
        console.warn("failed to re-use existing redis client");
        reusableRedisClient = await createReusableRedisClient();
    }
    return reusableRedisClient;
}


async function disconnect(client: ReturnType<typeof createClient>): Promise<void> {
    if (!reuseRedisClient) {
        /*await */client.disconnect();
    }
}

async function reset(account: string): Promise<void> {
    const client = await connect();
    try {
        await client.set(`${account}/balance`, DEFAULT_BALANCE);
    } finally {
        await disconnect(client);
    }
}

async function charge(account: string, charges: number): Promise<ChargeResult> {
    const client = await connect();
    try {
        const remainingBalance = await client.decrBy(`${account}/balance`, charges);
        if (remainingBalance >= 0) {
            return { isAuthorized: true, remainingBalance, charges };
        }
        // Rollback charges
        const balance = await client.incrBy(`${account}/balance`, charges);
        return { isAuthorized: false, remainingBalance: balance, charges: 0 };
    } finally {
        await disconnect(client);
    }
}

async function balance(account: string): Promise<ChargeResult> {
    const client = await connect();
    try {
        const remainingBalance = parseInt(await client.get(`${account}/balance`) ?? "");
        return { isAuthorized: false, remainingBalance: remainingBalance, charges: 0 };
    } finally {
        await disconnect(client);
    }
}

export function buildApp(): express.Application {
    const app = express();
    app.use(json());
    app.post("/reset", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            await reset(account);
            console.log(`Successfully reset account ${account}`);
            res.sendStatus(204);
        } catch (e) {
            console.error("Error while resetting account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/charge", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            const result = await charge(account, req.body.charges ?? 10);
            console.log(`Successfully charged account ${account}: remainingBalance: ${result.remainingBalance}, isAuthorized: ${result.isAuthorized}`);
            res.status(200).json(result);
        } catch (e) {
            console.error("Error while charging account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    app.get("/balance", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            const result = await balance(account);
            console.log(`Successfully fetched balance for account ${account}: remainingBalance: ${result.remainingBalance}`);
            res.status(200).json(result);
        } catch (e) {
            console.error("Error while fetching balance for account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    app.on('SIGTERM', () => {
        console.log('SIGTERM signal received: closing REDIS client')
        if (reusableRedisClient != null) {
            reusableRedisClient.disconnect();
        }
      })
    return app;
}
