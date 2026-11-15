import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { signOut, sessionExpired } from "./auth"

/**
 * In-app activity feed built from private socket events received in this
 * tab. There is no notification history API, so the feed starts empty on
 * each load and says so.
 */

export type NotificationTone = "info" | "success" | "warning" | "error"

export interface AppNotification {
  id: string
  title: string
  description: string
  tone: NotificationTone
  at: number
  href?: string
}

export interface NotificationsState {
  items: AppNotification[]
  unread: number
}

const MAX_ITEMS = 50
const initialState: NotificationsState = { items: [], unread: 0 }

const notificationsSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    notify(state, action: PayloadAction<AppNotification>) {
      if (state.items.some((n) => n.id === action.payload.id)) return
      state.items.unshift(action.payload)
      if (state.items.length > MAX_ITEMS) state.items.length = MAX_ITEMS
      state.unread += 1
    },
    markAllRead(state) {
      state.unread = 0
    },
    clearNotifications() {
      return initialState
    },
  },
  extraReducers: (b) => {
    b.addCase(signOut.fulfilled, () => initialState).addCase(sessionExpired, () => initialState)
  },
})

export const { notify, markAllRead, clearNotifications } = notificationsSlice.actions
export default notificationsSlice.reducer
