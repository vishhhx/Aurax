import { combineReducers, configureStore } from "@reduxjs/toolkit"
import auth from "./slices/auth"
import wallet from "./slices/wallet"
import orders from "./slices/orders"
import notifications from "./slices/notifications"

export const rootReducer = combineReducers({ auth, wallet, orders, notifications })

export function makeStore(preloaded?: Partial<RootState>) {
  return configureStore({ reducer: rootReducer, preloadedState: preloaded as RootState | undefined })
}

export const store = makeStore()

export type RootState = ReturnType<typeof rootReducer>
export type AppStore = ReturnType<typeof makeStore>
export type AppDispatch = AppStore["dispatch"]
