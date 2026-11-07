// Local dev: mock harness + mock relay + store server. Nothing leaves this machine.
import { startMockHarness } from "./dev/mock-harness.ts"
import { startMockRelay } from "./dev/mock-relay.ts"

const token = "dev-token-0123456789abcdef"
startMockHarness(8788, token)
startMockRelay(8789)
process.env.JOBS_URL ??= "http://127.0.0.1:8788"
process.env.JOBS_BEARER_TOKEN ??= token
process.env.ALLOW_DEV_STATEMENTS ??= "1"
process.env.RELAYS ??= "ws://127.0.0.1:8789"
process.env.SESSION_SECRET ??= "dev-session-secret"
console.log("mock harness :8788, mock relay ws://127.0.0.1:8789")
await import("./index.ts")
