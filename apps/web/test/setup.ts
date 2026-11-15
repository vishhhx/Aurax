import { GlobalRegistrator } from "@happy-dom/global-registrator"

// DOM globals for component tests (window, document, localStorage, rAF).
GlobalRegistrator.register({ url: "http://localhost:3000/" })

process.env.NEXT_PUBLIC_API_URL = "http://api.test"
process.env.NEXT_PUBLIC_SOCKET_URL = "http://ws.test"
