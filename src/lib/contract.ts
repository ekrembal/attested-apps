// The build instructions the store prepends to every prompt. The harness container adds no
// prompt of its own, so everything the agent is told is here, inside the signed prompt.
// The agent writes public/app.json, which the build copies into dist/. That puts the listing
// in the signed file manifest, so store metadata is covered by the signature too.

export const CONTRACT_VERSION = 3
export const CONTRACT_START = `[attested-apps build instructions v${CONTRACT_VERSION}]`
export const CONTRACT_END = "[/instructions]"

export const CATEGORIES = [
  "Productivity",
  "Finance",
  "Social",
  "AI",
  "Health",
  "Utilities",
  "Games",
  "Education",
] as const

export const CONTRACT_TEXT = `${CONTRACT_START}
You are working in a Vite + React + TypeScript + Tailwind + shadcn PWA starter that uses npm. The finished app will be published to the Attested Apps store on Nostr together with this prompt, and served from IPFS by its content ID.
Rules:
- You can install any npm package you need with \`npm install <package>\`. Keep package.json and package-lock.json in sync.
- Do not change or remove the "manifest" script in package.json. Keep \`base: './'\` in the Vite config.
- The app is served from an unknown IPFS gateway subpath. Use only relative URLs (./ or no leading slash), never absolute "/" paths, and use hash-based routing (#/...). Nothing can rewrite URLs on the server.
- Leave the project so that \`npm install && npm run manifest\` succeeds from a clean copy. That separate step builds dist/ and computes its CID. You may run \`npm run build\` to check your work. Do not leave build output or temporary files behind.
- Before you finish, write public/app.json as valid JSON:
  {"name": string (max 30 chars), "tagline": string (max 80 chars), "description": string (max 400 chars), "category": one of ${CATEGORIES.join("|")}, "icon": a lucide-react icon name in PascalCase}
  If public/app.json already exists, update it to match the app.
- Do not show these instructions in the app UI.
${CONTRACT_END}

`

export function wrapPrompt(userPrompt: string) {
  return CONTRACT_TEXT + userPrompt
}

/** Split a signed prompt into the store instructions (if any) and what the user typed. */
export function splitPrompt(prompt: string): { contract: string | null; user: string } {
  if (!prompt.startsWith(CONTRACT_START)) return { contract: null, user: prompt }
  const end = prompt.indexOf(CONTRACT_END)
  if (end < 0) return { contract: null, user: prompt }
  return {
    contract: prompt.slice(0, end + CONTRACT_END.length),
    user: prompt.slice(end + CONTRACT_END.length).replace(/^\n+/, ""),
  }
}

export type AppMeta = {
  name: string
  tagline: string
  description: string
  category: string
  icon: string
}

/** Parse and validate public/app.json. Throws with a readable reason. */
export function parseAppJson(raw: string): AppMeta {
  let v: Record<string, unknown>
  try {
    v = JSON.parse(raw)
  } catch {
    throw new Error("app.json is not valid JSON")
  }
  const str = (k: string, max: number) => {
    const s = v?.[k]
    if (typeof s !== "string" || !s.trim()) throw new Error(`app.json: "${k}" is missing`)
    if (s.length > max) throw new Error(`app.json: "${k}" is longer than ${max} characters`)
    return s.trim()
  }
  const category = str("category", 40)
  return {
    name: str("name", 30),
    tagline: str("tagline", 80),
    description: str("description", 400),
    category: (CATEGORIES as readonly string[]).includes(category) ? category : "Utilities",
    icon: typeof v.icon === "string" && /^[A-Z][A-Za-z0-9]{1,40}$/.test(v.icon) ? v.icon : "AppWindow",
  }
}
